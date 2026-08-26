// api/admin/auth.js — Consolidated session endpoint (Phase 2, consolidated)
// Replaces login.js + logout.js + verify.js to reduce serverless function count.
//
//   GET  /api/admin/auth                          -> verify current session
//   POST /api/admin/auth  { action:'login',  password } -> log in, sets cookie
//   POST /api/admin/auth  { action:'logout' }            -> log out, clears cookie

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ─── In-memory rate limiting (resets on cold start — same as before) ─────────
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 15 * 60 * 1000;

function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}
function isRateLimited(ip) {
  const r = attempts.get(ip);
  if (!r) return false;
  if (Date.now() - r.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return r.count >= MAX_ATTEMPTS;
}
function recordFail(ip) {
  const r = attempts.get(ip) || { count: 0, first: Date.now() };
  r.count++;
  attempts.set(ip, r);
}
function clearAttempts(ip) { attempts.delete(ip); }

// ─── Session token: "{expiry_ms}:{hmac_hex}" ─────────────────────────────────
function createToken(secret) {
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const hmac   = crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
  return `${expiry}:${hmac}`;
}

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
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const secret = process.env.SESSION_SECRET;

  // ── GET: verify current session ─────────────────────────────────────────
  if (req.method === 'GET') {
    if (!secret) return res.status(500).json({ error: 'Server configuration error.' });
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['arsrc_session'];
    if (!verifyToken(token, secret)) return res.status(401).json({ authenticated: false });
    return res.status(200).json({ authenticated: true });
  }

  // ── POST: login or logout, dispatched by action ─────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'logout') {
      res.setHeader('Set-Cookie', 'arsrc_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
      return res.status(200).json({ success: true });
    }

    // Default action is login (also accepts action === 'login' explicitly)
    const ip = getIP(req);
    const hash = process.env.ADMIN_PASSWORD_HASH;

    if (!hash || !secret) {
      console.error('[ARSRC Admin] ADMIN_PASSWORD_HASH or SESSION_SECRET not set.');
      return res.status(500).json({ error: 'Server configuration error. Contact the web admin.' });
    }
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }

    const { password } = req.body || {};
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });

    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      recordFail(ip);
      const remaining = MAX_ATTEMPTS - (attempts.get(ip)?.count || 0);
      return res.status(401).json({
        error: `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }

    clearAttempts(ip);
    const token = createToken(secret);
    res.setHeader('Set-Cookie',
      `arsrc_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24}`
    );
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
};
