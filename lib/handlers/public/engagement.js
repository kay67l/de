// api/engagement.js — Student Engagement page: zones, schools, students, WDS/LG events
//
// One consolidated function (public GET + admin-only writes) to avoid burning
// extra serverless function slots. Same auth pattern as your other admin endpoints.
//
// GET  (public)      -> { zones, schools, students, events }
// POST (admin)       -> body.type = 'school' | 'student' | 'event'  (create)
// PATCH (admin)      -> body.type = 'zone' | 'event'                (update)
// DELETE (admin)     -> body.type = 'school' | 'student' | 'event', { id }

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4'];
const SCHOOL_TYPES = ['shs', 'tech'];
const WINGS = ['wds', 'lg'];

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), decodeURIComponent(v.trim())]));
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
function requireAdmin(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    res.status(401).json({ error: 'Not authenticated.' });
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  // ── GET: public, no auth — everything the student-engagement page needs ──
  if (req.method === 'GET') {
    try {
      const [{ data: zones, error: zErr }, { data: schools, error: sErr }, { data: students, error: stErr }, { data: events, error: eErr }] = await Promise.all([
        supabase.from('engagement_zones').select('*'),
        supabase.from('engagement_schools').select('*').order('display_order', { ascending: true }),
        supabase.from('engagement_students').select('*').order('display_order', { ascending: true }),
        supabase.from('engagement_events').select('*').order('display_order', { ascending: true }),
      ]);
      if (zErr || sErr || stErr || eErr) throw (zErr || sErr || stErr || eErr);

      const zonesMap = {};
      ZONE_KEYS.forEach(z => { zonesMap[z] = { slogan: null, logo_url: null }; });
      (zones || []).forEach(z => { zonesMap[z.zone_key] = { slogan: z.slogan, logo_url: z.logo_url }; });

      const schoolsMap = {};
      ZONE_KEYS.forEach(z => { schoolsMap[z] = { shs: [], tech: [] }; });
      (schools || []).forEach(s => { if (schoolsMap[s.zone_key]) schoolsMap[s.zone_key][s.school_type].push(s); });

      const studentsMap = {};
      ZONE_KEYS.forEach(z => { studentsMap[z] = []; });
      (students || []).forEach(s => { if (studentsMap[s.zone_key]) studentsMap[s.zone_key].push(s); });

      const eventsMap = { wds: [], lg: [] };
      (events || []).forEach(e => { if (eventsMap[e.wing]) eventsMap[e.wing].push(e); });

      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json({ zones: zonesMap, schools: schoolsMap, students: studentsMap, events: eventsMap });
    } catch (err) {
      console.error('[ARSRC] engagement GET error:', err);
      return res.status(500).json({ error: 'Could not load engagement data.' });
    }
  }

  // Everything past this point is admin-only.
  if (!requireAdmin(req, res)) return;

  // ── POST: create a school, student photo, or event ────────────────────────
  if (req.method === 'POST') {
    const { type } = req.body || {};

    if (type === 'school') {
      const { zone_key, school_type, name } = req.body || {};
      if (!ZONE_KEYS.includes(zone_key)) return res.status(400).json({ error: 'Invalid zone.' });
      if (!SCHOOL_TYPES.includes(school_type)) return res.status(400).json({ error: 'Invalid school type.' });
      if (!name?.trim()) return res.status(400).json({ error: 'School name is required.' });

      const { data, error } = await supabase.from('engagement_schools')
        .insert({ zone_key, school_type, name: name.trim() }).select().single();
      if (error) { console.error(error); return res.status(500).json({ error: 'Could not add school.' }); }
      return res.status(201).json({ success: true, school: data });
    }

    if (type === 'student') {
      const { zone_key, name, photo_url } = req.body || {};
      if (!ZONE_KEYS.includes(zone_key)) return res.status(400).json({ error: 'Invalid zone.' });
      if (!photo_url?.trim()) return res.status(400).json({ error: 'A photo is required.' });

      const { data, error } = await supabase.from('engagement_students')
        .insert({ zone_key, name: name?.trim() || null, photo_url: photo_url.trim() }).select().single();
      if (error) { console.error(error); return res.status(500).json({ error: 'Could not add photo.' }); }
      return res.status(201).json({ success: true, student: data });
    }

    if (type === 'event') {
      const { wing, title, description, photo_urls } = req.body || {};
      if (!WINGS.includes(wing)) return res.status(400).json({ error: 'Invalid wing.' });
      if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });

      const { data, error } = await supabase.from('engagement_events')
        .insert({ wing, title: title.trim(), description: description?.trim() || null, photo_urls: Array.isArray(photo_urls) ? photo_urls : [] })
        .select().single();
      if (error) { console.error(error); return res.status(500).json({ error: 'Could not add event.' }); }
      return res.status(201).json({ success: true, event: data });
    }

    return res.status(400).json({ error: 'Unknown type.' });
  }

  // ── PATCH: update a zone's slogan/logo, or an event ────────────────────────
  if (req.method === 'PATCH') {
    const { type } = req.body || {};

    if (type === 'zone') {
      const { zone_key, slogan, logo_url } = req.body || {};
      if (!ZONE_KEYS.includes(zone_key)) return res.status(400).json({ error: 'Invalid zone.' });

      const updates = { updated_at: new Date().toISOString() };
      if (slogan !== undefined) updates.slogan = slogan?.trim() || null;
      if (logo_url !== undefined) updates.logo_url = logo_url?.trim() || null;

      const { data, error } = await supabase.from('engagement_zones')
        .upsert({ zone_key, ...updates }, { onConflict: 'zone_key' }).select().single();
      if (error) { console.error(error); return res.status(500).json({ error: 'Could not save zone.' }); }
      return res.status(200).json({ success: true, zone: data });
    }

    if (type === 'event') {
      const { id, title, description, photo_urls } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required.' });

      const updates = {};
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (photo_urls !== undefined) updates.photo_urls = Array.isArray(photo_urls) ? photo_urls : [];

      const { data, error } = await supabase.from('engagement_events').update(updates).eq('id', id).select().single();
      if (error) { console.error(error); return res.status(500).json({ error: 'Could not save event.' }); }
      return res.status(200).json({ success: true, event: data });
    }

    return res.status(400).json({ error: 'Unknown type.' });
  }

  // ── DELETE: remove a school, student photo, or event ───────────────────────
  if (req.method === 'DELETE') {
    const { type, id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const TABLES = { school: 'engagement_schools', student: 'engagement_students', event: 'engagement_events' };
    if (!TABLES[type]) return res.status(400).json({ error: 'Unknown type.' });

    const { error } = await supabase.from(TABLES[type]).delete().eq('id', id);
    if (error) { console.error(error); return res.status(500).json({ error: 'Could not delete.' }); }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
};
