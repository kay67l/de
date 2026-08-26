// api/settings.js — public site settings reader
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const key = String(req.query?.key || '').trim();
  if (!key) return res.status(400).json({ error: 'Setting key is required.' });

  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value, description, updated_at')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error('[ARSRC] Failed to fetch setting:', error);
    return res.status(500).json({ error: 'Could not load setting.' });
  }

  return res.status(200).json({ value: data?.value || '', setting: data || null });
};
