// api/executives.js — Public executives endpoint
// Called by the Executives section on index.html. No auth required — public data.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  // Cache at CDN level for 60s, serve stale for up to 5min while revalidating —
  // same policy as /api/posts, since this section changes about as often.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const { data, error } = await supabase
    .from('executives')
    .select('id, category, subgroup, name, role, school, initials, photo_url, sort_order, created_at')
    .order('category', { ascending: true })
    .order('subgroup', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ARSRC] Failed to fetch executives:', error);
    return res.status(500).json({ error: 'Could not load executives.' });
  }

  return res.status(200).json({ executives: data });
};
