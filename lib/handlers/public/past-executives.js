// api/past-executives.js — Public endpoint for the Past Executives page.
// No auth required — public archive data.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const { data, error } = await supabase
    .from('past_executives')
    .select('id, year, category, subgroup, name, role, school, initials, photo_url, sort_order, created_at')
    .order('year', { ascending: false })
    .order('category', { ascending: true })
    .order('subgroup', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ARSRC] Failed to fetch past executives:', error);
    return res.status(500).json({ error: 'Could not load past executives.' });
  }

  return res.status(200).json({ pastExecutives: data });
};
