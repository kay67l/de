// lib/handlers/admin/gallery.js — authenticated Gallery management (events + images)
// Move this file to lib/handlers/admin/gallery.js in the deployed project,
// and register it in api/admin-dispatch.js:
//   gallery: require('../lib/handlers/admin/gallery.js'),
//
// Reached via the existing rewrite in vercel.json (/api/admin/:path* ->
// /api/admin-dispatch?route=:path*), so the public-facing URL stays
// /api/admin/gallery — no new serverless function, no frontend change needed.
//
// Handles TWO resources through one handler file: pass ?resource=events or ?resource=images.
//   GET    /api/admin/gallery?resource=events            -> list events (each with nested images)
//   POST   /api/admin/gallery?resource=events             body: {title, description?, cover_image_url?, sort_order?, published?}
//   PATCH  /api/admin/gallery?resource=events              body: {id, ...fields to change}
//   DELETE /api/admin/gallery?resource=events              body: {id}   (cascades to its images)
//
//   POST   /api/admin/gallery?resource=images              body: {event_id, image_url, caption?, sort_order?}
//   PATCH  /api/admin/gallery?resource=images               body: {id, ...fields to change}
//   DELETE /api/admin/gallery?resource=images               body: {id}
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => c.trim().split('='))
      .filter(p => p.length === 2)
      .map(([k, v]) => [k.trim(), decodeURIComponent(v.trim())])
  );
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [expiry, hmac] = parts;
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiry).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function requireAdmin(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    res.status(401).json({ error: 'Not authenticated.' });
    return false;
  }
  return true;
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'event';
}

const EVENT_FIELDS = 'id, title, slug, description, cover_image_url, sort_order, published, created_at, updated_at';
const IMAGE_FIELDS = 'id, event_id, image_url, caption, sort_order, created_at';

// ── Events ───────────────────────────────────────────────────────────────────
async function handleEvents(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('gallery_events')
      .select(`${EVENT_FIELDS}, gallery_images(${IMAGE_FIELDS})`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .order('sort_order', { foreignTable: 'gallery_images', ascending: true });

    if (error) {
      console.error('[ARSRC Admin] Failed to list gallery events:', error);
      return res.status(500).json({ error: 'Could not load gallery events.' });
    }
    return res.status(200).json({ events: data || [], total: data?.length || 0 });
  }

  if (req.method === 'POST') {
    const { title, description, cover_image_url, sort_order, published } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'Event title is required.' });

    let slug = slugify(title);
    // Ensure slug uniqueness by suffixing if needed.
    const { data: existing } = await supabase.from('gallery_events').select('slug').ilike('slug', `${slug}%`);
    if (existing?.some(e => e.slug === slug)) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const event = {
      title: title.trim(),
      slug,
      description: description?.trim() || null,
      cover_image_url: cover_image_url?.trim() || null,
      sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      published: published !== false,
    };

    const { data, error } = await supabase.from('gallery_events').insert([event]).select(EVENT_FIELDS).single();
    if (error) {
      console.error('[ARSRC Admin] Failed to create gallery event:', error);
      return res.status(500).json({ error: 'Could not create event.' });
    }
    return res.status(201).json({ success: true, event: { ...data, gallery_images: [] } });
  }

  if (req.method === 'PATCH') {
    const { id, title, description, cover_image_url, sort_order, published } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim() || null;
    if (cover_image_url !== undefined) updates.cover_image_url = String(cover_image_url).trim() || null;
    if (sort_order !== undefined) updates.sort_order = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0;
    if (published !== undefined) updates.published = Boolean(published);

    if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'No fields to update.' });

    const { data, error } = await supabase
      .from('gallery_events')
      .update(updates)
      .eq('id', id)
      .select(EVENT_FIELDS)
      .single();

    if (error) {
      console.error('[ARSRC Admin] Failed to update gallery event:', error);
      return res.status(500).json({ error: 'Could not save event changes.' });
    }
    return res.status(200).json({ success: true, event: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    // Images are removed automatically via ON DELETE CASCADE, but we don't
    // delete the underlying Supabase Storage objects here — do that in
    // Storage directly if you need to reclaim space.
    const { error } = await supabase.from('gallery_events').delete().eq('id', id);
    if (error) {
      console.error('[ARSRC Admin] Failed to delete gallery event:', error);
      return res.status(500).json({ error: 'Could not delete event.' });
    }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

// ── Images ───────────────────────────────────────────────────────────────────
async function handleImages(req, res) {
  if (req.method === 'POST') {
    const { event_id, image_url, caption, sort_order } = req.body || {};
    if (!event_id) return res.status(400).json({ error: 'event_id is required.' });
    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url is required.' });

    const image = {
      event_id,
      image_url: image_url.trim(),
      caption: caption?.trim() || null,
      sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
    };

    const { data, error } = await supabase.from('gallery_images').insert([image]).select(IMAGE_FIELDS).single();
    if (error) {
      console.error('[ARSRC Admin] Failed to add gallery image:', error);
      return res.status(500).json({ error: 'Could not add image.' });
    }
    return res.status(201).json({ success: true, image: data });
  }

  if (req.method === 'PATCH') {
    const { id, caption, sort_order } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const updates = {};
    if (caption !== undefined) updates.caption = String(caption).trim() || null;
    if (sort_order !== undefined) updates.sort_order = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });

    const { data, error } = await supabase
      .from('gallery_images')
      .update(updates)
      .eq('id', id)
      .select(IMAGE_FIELDS)
      .single();

    if (error) {
      console.error('[ARSRC Admin] Failed to update gallery image:', error);
      return res.status(500).json({ error: 'Could not save image changes.' });
    }
    return res.status(200).json({ success: true, image: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    // Deletes the DB row only. The underlying Supabase Storage object is left
    // in place (same trade-off resources.js/upload-image.js already make) —
    // clean up storage separately if you need to reclaim space.
    const { error } = await supabase.from('gallery_images').delete().eq('id', id);
    if (error) {
      console.error('[ARSRC Admin] Failed to delete gallery image:', error);
      return res.status(500).json({ error: 'Could not delete image.' });
    }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;

  const resource = (req.query?.resource || '').toString();
  if (resource === 'events') return handleEvents(req, res);
  if (resource === 'images') return handleImages(req, res);
  return res.status(400).json({ error: 'Missing or invalid ?resource= (expected "events" or "images").' });
};
