// lib/handlers/public/gallery.js — public, unauthenticated read endpoint for the live gallery page.
// Move this file to lib/handlers/public/gallery.js in the deployed project,
// and register it in api/public-dispatch.js:
//   gallery: require('../lib/handlers/public/gallery.js'),
//
// Reached via the existing rewrite in vercel.json (/api/:path* ->
// /api/public-dispatch?route=:path*), so the public-facing URL stays
// /api/gallery — matches what gallery.html already fetches.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Cache at the CDN for a few minutes — gallery content doesn't change by the
  // second, and this keeps the function off the hot path on repeat visits.
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');

  const { data, error } = await supabase
    .from('gallery_events')
    .select('id, title, slug, description, cover_image_url, sort_order, created_at, gallery_images(id, image_url, caption, sort_order)')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .order('sort_order', { foreignTable: 'gallery_images', ascending: true });

  if (error) {
    console.error('[ARSRC] Failed to load public gallery:', error);
    return res.status(500).json({ error: 'Could not load gallery.' });
  }

  return res.status(200).json({ events: data || [] });
};
