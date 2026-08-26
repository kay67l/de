// api/admin/resources.js — authenticated Resources management
// Move this file to api/admin/resources.js in the deployed project.
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

const RESOURCE_FIELDS = 'id, title, description, category, file_url, file_name, file_type, file_size, sort_order, published, created_at, updated_at';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('resources')
      .select(RESOURCE_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ARSRC Admin] Failed to list resources:', error);
      return res.status(500).json({ error: 'Could not load resources.' });
    }
    return res.status(200).json({ resources: data || [], total: data?.length || 0 });
  }

  if (req.method === 'PATCH') {
    const { id, title, description, category, file_url, file_name, file_type, file_size, sort_order, published } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim() || null;
    if (category !== undefined) updates.category = String(category).trim() || 'Document';
    if (file_url !== undefined) updates.file_url = String(file_url).trim();
    if (file_name !== undefined) updates.file_name = String(file_name).trim() || null;
    if (file_type !== undefined) updates.file_type = file_type || null;
    if (file_size !== undefined) updates.file_size = file_size || null;
    if (sort_order !== undefined) updates.sort_order = Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0;
    if (published !== undefined) updates.published = Boolean(published);

    if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'No fields to update.' });

    const { data, error } = await supabase
      .from('resources')
      .update(updates)
      .eq('id', id)
      .select(RESOURCE_FIELDS)
      .single();

    if (error) {
      console.error('[ARSRC Admin] Failed to update resource:', error);
      return res.status(500).json({ error: 'Could not save resource changes.' });
    }
    return res.status(200).json({ success: true, resource: data });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) {
      console.error('[ARSRC Admin] Failed to delete resource:', error);
      return res.status(500).json({ error: 'Could not delete resource.' });
    }
    return res.status(200).json({ success: true });
  }

  if (req.method === 'POST') {
    const { title, description, category, file_url, file_name, file_type, file_size, sort_order, published } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!file_url?.trim()) return res.status(400).json({ error: 'File URL is required.' });

    const resource = {
      title: title.trim(),
      description: description?.trim() || null,
      category: category?.trim() || 'Document',
      file_url: file_url.trim(),
      file_name: file_name?.trim() || null,
      file_type: file_type || null,
      file_size: file_size || null,
      sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      published: published !== false,
    };

    const { data, error } = await supabase.from('resources').insert([resource]).select(RESOURCE_FIELDS).single();
    if (error) {
      console.error('[ARSRC Admin] Failed to create resource:', error);
      return res.status(500).json({ error: 'Could not publish resource.' });
    }
    return res.status(201).json({ success: true, resource: data });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
};
