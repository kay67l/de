// api/admin/settings.js — authenticated site-settings management
// Move this file to api/admin/settings.js in the deployed project.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => c.trim().split('='))
    .filter(p => p.length === 2)
    .map(([k, v]) => [k.trim(), decodeURIComponent(v.trim())]));
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [expiry, hmac] = parts;
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiry).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const { key, value } = req.body || {};
  if (!key || !String(key).trim()) return res.status(400).json({ error: 'Setting key is required.' });
  if (!value || !String(value).trim()) return res.status(400).json({ error: 'Setting value is required.' });

  // Only allow known site settings to prevent arbitrary configuration writes.
  const allowedKeys = new Set(['current_administration']);
  const safeKey = String(key).trim();
  if (!allowedKeys.has(safeKey)) return res.status(400).json({ error: 'This setting cannot be edited here.' });

  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ key: safeKey, value: String(value).trim() }, { onConflict: 'key' })
    .select('key, value, description, updated_at')
    .single();

  if (error) {
    console.error('[ARSRC Admin] Failed to save setting:', error);
    return res.status(500).json({ error: 'Could not save setting.' });
  }

  return res.status(200).json({ success: true, setting: data, key: data.key, value: data.value });
};
