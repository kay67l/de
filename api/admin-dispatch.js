// api/admin-dispatch.js
// Consolidates all authenticated admin API handlers into one Vercel serverless function.
const handlers = {
  auth: require('../lib/handlers/admin/auth.js'),
  'executives-create': require('../lib/handlers/admin/executives-create.js'),
  messages: require('../lib/handlers/admin/messages.js'),
  'past-executives-create': require('../lib/handlers/admin/past-executives-create.js'),
  'posts-create': require('../lib/handlers/admin/posts-create.js'),
  resources: require('../lib/handlers/admin/resources.js'),
  settings: require('../lib/handlers/admin/settings-admin.js'),
  'upload-image': require('../lib/handlers/admin/upload-image.js'),
};

module.exports = async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');
  const target = handlers[route];
  if (!target) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ error: 'Admin API route not found.' });
  }
  return target(req, res);
};
