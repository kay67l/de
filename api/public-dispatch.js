// api/public-dispatch.js
// Consolidates all public API handlers into one Vercel serverless function.
const handlers = {
  contact: require('../lib/handlers/public/contact.js'),
  engagement: require('../lib/handlers/public/engagement.js'),
  executives: require('../lib/handlers/public/executives.js'),
  'past-executives': require('../lib/handlers/public/past-executives.js'),
  post: require('../lib/handlers/public/post.js'),
  posts: require('../lib/handlers/public/posts.js'),
  resources: require('../lib/handlers/public/resources-public.js'),
  settings: require('../lib/handlers/public/settings-public.js'),
};

module.exports = async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');
  const target = handlers[route];
  if (!target) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ error: 'Public API route not found.' });
  }
  return target(req, res);
};
