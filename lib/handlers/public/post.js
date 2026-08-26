// api/post.js — Phase 5: Public single post endpoint
// Called by post.html to load full post content by slug.
// Public — no auth required.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Slug is required.' });

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, title, excerpt, content, author, category, slug, image_url, created_at')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  return res.status(200).json({ post: data });
};
