// api/admin/messages.js — Phase 4: Full messages management
// GET  ?page=1&limit=20&filter=all|unread  → paginated messages list
// POST { action: 'mark_read'|'mark_unread', id }  → toggle read state

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ─── Auth (same pattern as other admin endpoints) ─────────────────────────────
function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2)
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
  try { return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // ── GET: paginated messages list ───────────────────────────────────────────
  if (req.method === 'GET') {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(20, parseInt(req.query.limit || '20', 10));
    const filter = req.query.filter || 'all'; // 'all' | 'unread'
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;

    let query = supabase
      .from('contact_messages')
      .select('id, name, email, subject, message, read, read_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter === 'unread') query = query.eq('read', false);

    const { data, error, count } = await query;

    if (error) {
      console.error('[ARSRC Admin] Failed to fetch messages:', error);
      return res.status(500).json({ error: 'Could not load messages.' });
    }

    // Also return unread count regardless of filter
    const { count: unreadCount } = await supabase
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);

    return res.status(200).json({
      messages:    data,
      total:       count,
      unread:      unreadCount || 0,
      page,
      totalPages:  Math.ceil(count / limit),
    });
  }

  // ── POST: mark read / unread ───────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action, id } = req.body || {};

    if (!id) return res.status(400).json({ error: 'Message ID is required.' });
    if (!['mark_read', 'mark_unread'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    const updates = action === 'mark_read'
      ? { read: true,  read_at: new Date().toISOString() }
      : { read: false, read_at: null };

    const { error } = await supabase
      .from('contact_messages')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[ARSRC Admin] Failed to update message:', error);
      return res.status(500).json({ error: 'Could not update message.' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
