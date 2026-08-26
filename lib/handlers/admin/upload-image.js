// api/admin/upload-image.js — Phase 5: Image upload URL generator
//
// What this does: generates a signed Supabase Storage URL the browser
// uses to upload an image DIRECTLY to Supabase. The image never passes
// through this function — doing so would hit Vercel's 4.5MB body limit.
//
// Flow:
// 1. Browser calls this endpoint (authenticated) with the original filename
// 2. This function asks Supabase for a signed upload URL
// 3. Browser receives { signedUrl, publicUrl }
// 4. Browser PUTs the compressed image to signedUrl directly
// 5. Browser includes publicUrl in the post creation payload

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';')
      .map(c => c.trim().split('='))
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const { filename, folder } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'Filename is required.' });

  // Restrict to known folders so callers can't write arbitrary paths into the bucket.
  const ALLOWED_FOLDERS = ['posts', 'executives', 'past-executives', 'engagement', 'resources'];
  const safeFolder = ALLOWED_FOLDERS.includes(folder) ? folder : 'posts';
  const isResource = safeFolder === 'resources';
  const bucket = isResource ? 'arsrc-resources' : 'post-images';
  const originalExt = String(filename).toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || '';
  const extension = isResource ? originalExt : '.jpg';
  const path = `${safeFolder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extension}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error) {
    console.error('[ARSRC] Storage signed URL error:', error);
    return res.status(500).json({
      error: 'Could not create upload URL. Check that the post-images bucket exists and has an INSERT policy.'
    });
  }

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

  return res.status(200).json({
    signedUrl: data.signedUrl,
    publicUrl,
  });
};
