// api/admin/posts-create.js — GET (list all): list every post for the admin
// dashboard, POST: create, PATCH: edit, DELETE: remove a blog post
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => c.trim().split('=')).filter(p => p.length === 2).map(([k,v]) => [k.trim(), decodeURIComponent(v.trim())]));
}
function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [expiry, hmac] = parts;
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = crypto.createHmac('sha256', secret).update(expiry).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')); } catch { return false; }
}
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim() + '-' + Date.now();
}

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies['arsrc_session'], process.env.SESSION_SECRET)) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // ── GET: list every post (admin view — no 6-post cap, includes unpublished) ──
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, excerpt, content, author, category, slug, image_url, published, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ARSRC Admin] Failed to list posts:', error);
      return res.status(500).json({ error: 'Could not load posts.' });
    }

    return res.status(200).json({ posts: data, total: data.length });
  }

  // ── PATCH: edit an existing post ──────────────────────────────────────────
  // Slug is intentionally left untouched on edit, even if the title changes —
  // the slug is what post.html and any shared links key off of, so changing
  // it here would silently break every link already shared for this post.
  if (req.method === 'PATCH') {
    const { id, title, excerpt, content, category, author, image_url } = req.body || {};

    if (!id) return res.status(400).json({ error: 'id is required.' });
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
    if (excerpt !== undefined && !excerpt.trim()) return res.status(400).json({ error: 'Excerpt cannot be empty.' });
    if (excerpt !== undefined && excerpt.trim().length > 280) return res.status(400).json({ error: 'Excerpt must be 280 characters or less.' });
    if (content !== undefined && !content.trim()) return res.status(400).json({ error: 'Content cannot be empty.' });

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (excerpt !== undefined) updates.excerpt = excerpt.trim();
    if (content !== undefined) updates.content = content.trim();
    if (category !== undefined) updates.category = category.trim() || 'News';
    if (author !== undefined) updates.author = author.trim() || 'ARSRC Council';
    if (image_url !== undefined) updates.image_url = image_url.trim() || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    const { data, error } = await supabase.from('blog_posts').update(updates).eq('id', id).select().single();

    if (error) {
      console.error('[ARSRC Admin] Failed to update post:', error);
      return res.status(500).json({ error: 'Could not save changes. Try again.' });
    }

    return res.status(200).json({ success: true, post: data });
  }

  // ── DELETE: remove a post ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required.' });

    const { error } = await supabase.from('blog_posts').delete().eq('id', id);

    if (error) {
      console.error('[ARSRC Admin] Failed to delete post:', error);
      return res.status(500).json({ error: 'Could not delete post. Try again.' });
    }

    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { title, excerpt, content, category, author, image_url } = req.body || {};

  if (!title?.trim())   return res.status(400).json({ error: 'Title is required.' });
  if (!excerpt?.trim()) return res.status(400).json({ error: 'Excerpt is required.' });
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required.' });
  if (excerpt.trim().length > 280) return res.status(400).json({ error: 'Excerpt must be 280 characters or less.' });

  const post = {
    title:    title.trim(),
    excerpt:  excerpt.trim(),
    content:  content.trim(),
    category: category?.trim() || 'News',
    author:   author?.trim()   || 'ARSRC Council',
    slug:     slugify(title.trim()),
    published: true,
    ...(image_url ? { image_url: image_url.trim() } : {}),
  };

  const { data, error } = await supabase.from('blog_posts').insert([post]).select().single();

  if (error) {
    console.error('[ARSRC Admin] Failed to create post:', error);
    return res.status(500).json({ error: 'Could not save post. Try again.' });
  }

  return res.status(201).json({ success: true, post: data });
};
