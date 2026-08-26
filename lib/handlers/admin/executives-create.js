// api/admin/executives-create.js — CRUD + archive + reorder for executives
// (consolidated: absorbs the former executives-archive.js and executives-reorder.js
//  to reduce serverless function count. Same behavior, same URL paths for those
//  actions moved to POST { action: 'archive' | 'reorder' } on this endpoint.)
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VALID_CATEGORIES = ['rec', 'zec', 'lit', 'wds', 'sec', 'adhoc'];

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2).map(([k,v]) => [k.trim(), decodeURIComponent(v.trim())]));
}
function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [expiry, hmac] = parts;
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiry).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}

// Auto-derive 2-letter initials from a name when the admin leaves the field blank,
// e.g. "James Hope Arthur" -> "JA" (first + last name initial).
function deriveInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Archive: copy every row currently in `executives` into `past_executives`,
// tagged with the given year. Never modifies or deletes anything in `executives`.
async function handleArchive(req, res) {
  const { year } = req.body || {};
  if (!year?.trim()) {
    return res.status(400).json({ error: 'Year label is required (e.g. "2024/2025").' });
  }
  const yearLabel = year.trim();

  const { count: existingCount, error: countErr } = await supabase
    .from('past_executives')
    .select('id', { count: 'exact', head: true })
    .eq('year', yearLabel);

  if (countErr) {
    console.error('[ARSRC Admin] Failed to check existing archive:', countErr);
    return res.status(500).json({ error: 'Could not check for an existing archive under this year.' });
  }
  if (existingCount && existingCount > 0) {
    return res.status(409).json({
      error: `"${yearLabel}" has already been archived (${existingCount} entries). Delete that year first if you want to re-archive it, or use a different year label.`,
    });
  }

  const { data: current, error: fetchErr } = await supabase
    .from('executives')
    .select('category, subgroup, name, role, school, initials, photo_url, sort_order');

  if (fetchErr) {
    console.error('[ARSRC Admin] Failed to read current executives for archiving:', fetchErr);
    return res.status(500).json({ error: 'Could not read current executives.' });
  }
  if (!current || current.length === 0) {
    return res.status(400).json({ error: 'There are no current executives to archive.' });
  }

  const snapshot = current.map(ex => ({ ...ex, year: yearLabel }));

  const { error: insertErr } = await supabase.from('past_executives').insert(snapshot);
  if (insertErr) {
    console.error('[ARSRC Admin] Failed to archive executives:', insertErr);
    return res.status(500).json({ error: 'Could not save the archive. Try again.' });
  }

  return res.status(201).json({ success: true, archived: snapshot.length, year: yearLabel });
}

// ── Reorder: move an executive up/down within its (category, subgroup) group
// by swapping sort_order with its neighbor.
async function handleReorder(req, res) {
  const { id, direction } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required.' });
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down".' });
  }

  const { data: target, error: targetErr } = await supabase
    .from('executives')
    .select('id, category, subgroup, sort_order')
    .eq('id', id)
    .single();

  if (targetErr || !target) {
    return res.status(404).json({ error: 'Executive not found.' });
  }

  let groupQuery = supabase
    .from('executives')
    .select('id, sort_order')
    .eq('category', target.category);
  groupQuery = target.subgroup === null
    ? groupQuery.is('subgroup', null)
    : groupQuery.eq('subgroup', target.subgroup);

  const { data: group, error: groupErr } = await groupQuery
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (groupErr || !group) {
    return res.status(500).json({ error: 'Could not load group for reordering.' });
  }

  const idx = group.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Executive not found in its group.' });

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= group.length) {
    return res.status(200).json({ success: true, moved: false });
  }

  const a = group[idx];
  const b = group[swapIdx];

  const { error: err1 } = await supabase.from('executives').update({ sort_order: b.sort_order }).eq('id', a.id);
  const { error: err2 } = await supabase.from('executives').update({ sort_order: a.sort_order }).eq('id', b.id);

  if (err1 || err2) {
    console.error('[ARSRC Admin] Failed to reorder executives:', err1 || err2);
    return res.status(500).json({ error: 'Could not reorder. Try again.' });
  }

  return res.status(200).json({ success: true, moved: true });
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // ── PATCH: edit an existing executive ────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, category, subgroup, name, role, school, initials, photo_url } = req.body || {};

    if (!id) return res.status(400).json({ error: 'id is required.' });
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid committee/body selected.' });
    }
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    if (role !== undefined && !role.trim()) return res.status(400).json({ error: 'Role cannot be empty.' });
    if (category && category !== 'rec' && category !== 'sec' && subgroup !== undefined && !subgroup.trim()) {
      return res.status(400).json({ error: 'Sub-group / committee name is required for this category.' });
    }

    const updates = {};
    if (category !== undefined) updates.category = category;
    if (name !== undefined) updates.name = name.trim();
    if (role !== undefined) updates.role = role.trim();
    if (school !== undefined) updates.school = school.trim() || null;
    if (initials !== undefined) updates.initials = (initials.trim() || deriveInitials(name || '')).slice(0, 4).toUpperCase();
    if (photo_url !== undefined) updates.photo_url = photo_url.trim() || null;
    if (subgroup !== undefined) {
      updates.subgroup = (category === 'rec' || category === 'sec' || (category === undefined && subgroup === '')) ? null : subgroup.trim();
    }
    if (category === 'rec' || category === 'sec') updates.subgroup = null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const { data, error } = await supabase.from('executives').update(updates).eq('id', id).select().single();

    if (error) {
      console.error('[ARSRC Admin] Failed to update executive:', error);
      return res.status(500).json({ error: 'Could not save changes. Try again.' });
    }

    return res.status(200).json({ success: true, executive: data });
  }

  // ── DELETE: remove an executive ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const { error } = await supabase.from('executives').delete().eq('id', id);

    if (error) {
      console.error('[ARSRC Admin] Failed to delete executive:', error);
      return res.status(500).json({ error: 'Could not delete executive. Try again.' });
    }

    return res.status(200).json({ success: true });
  }

  // ── POST: add / archive / reorder, dispatched by action ──────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { action } = req.body || {};

  if (action === 'archive') return handleArchive(req, res);
  if (action === 'reorder') return handleReorder(req, res);

  // Default (no action / action === 'add'): add a new executive
  const { category, subgroup, name, role, school, initials, photo_url } = req.body || {};

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Invalid committee/body selected.' });
  }
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!role?.trim()) return res.status(400).json({ error: 'Role is required.' });
  if (category !== 'rec' && category !== 'sec' && !subgroup?.trim()) {
    return res.status(400).json({ error: 'Sub-group / committee name is required for this category.' });
  }

  const groupSubgroup = (category === 'rec' || category === 'sec') ? null : subgroup.trim();

  let nextSortOrder = 0;
  {
    let query = supabase.from('executives').select('sort_order').eq('category', category);
    query = groupSubgroup === null ? query.is('subgroup', null) : query.eq('subgroup', groupSubgroup);
    const { data: existing, error: existingErr } = await query.order('sort_order', { ascending: false }).limit(1);
    if (!existingErr && existing && existing.length) nextSortOrder = existing[0].sort_order + 1;
  }

  const record = {
    category,
    subgroup: groupSubgroup,
    name: name.trim(),
    role: role.trim(),
    school: school?.trim() || null,
    initials: (initials?.trim() || deriveInitials(name)).slice(0, 4).toUpperCase(),
    sort_order: nextSortOrder,
    ...(photo_url ? { photo_url: photo_url.trim() } : {}),
  };

  const { data, error } = await supabase.from('executives').insert([record]).select().single();

  if (error) {
    console.error('[ARSRC Admin] Failed to create executive:', error);
    return res.status(500).json({ error: 'Could not save executive. Try again.' });
  }

  return res.status(201).json({ success: true, executive: data });
};
