// api/posts.js — Phase 3: Public posts endpoint
// Called by the news and editorial sections on index.html. No auth required.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  // `?category=editorial` powers the Magazines & Stories shelf. The default
  // feed remains the latest six published posts for the News section.
  const { category } = req.query;
  const editorial = category === 'editorial';
  const allContent = category === 'all';

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  let query = supabase
    .from('blog_posts')
    .select('id, title, excerpt, author, category, slug, image_url, created_at')
    .eq('published', true);

  if (editorial) {
    query = query.in('category', ['Magazine', 'Story']);
  } else if (allContent) {
    // Used only by the article reader for Previous/Next and related content.
    // The default feed remains News-only for the homepage.
  } else if (category === 'news') {
    query = query.not('category', 'in', '("Magazine","Story")');
  } else if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(allContent ? 30 : 6);

  if (error) {
    console.error('[ARSRC] Failed to fetch posts:', error);
    return res.status(500).json({ error: 'Could not load posts.' });
  }

  return res.status(200).json({ posts: data });
};
