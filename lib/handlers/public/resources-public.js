// Public resources reader used by the consolidated /api/public-dispatch function.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { data, error } = await supabase
    .from('resources')
    .select('id, title, description, category, file_url, file_name, file_type, file_size, sort_order, created_at')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ARSRC] Failed to fetch resources:', error);
    return res.status(500).json({ error: 'Could not load resources.' });
  }
  return res.status(200).json({ resources: data || [] });
};
