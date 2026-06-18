import express from 'express';
import bcrypt from 'bcryptjs';
import { Articles, Categories, Newspapers, Pages, Users, Messages } from '../queries.js';
import { db, setSetting } from '../db.js';
import { slugify, truncate } from '../lib/helpers.js';
import { cleanHtml, toText } from '../lib/sanitize.js';
import { upload, uploadedPath } from '../lib/upload.js';

const router = express.Router();

// Всички admin изгледи ползват админ оформлението
router.use((req, res, next) => {
  res.locals.layout = 'admin/layout';
  res.locals.adminPath = req.path;
  res.locals.unreadMessages = Messages.unreadCount();
  next();
});

const uniqueSlug = (table, base, ignoreId = null) => {
  let slug = base || 'item';
  let i = 1;
  while (true) {
    const row = ignoreId
      ? db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(slug, ignoreId)
      : db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug);
    if (!row) return slug;
    slug = `${base}-${++i}`;
  }
};

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ─── Табло ───────────────────────────────────────────────
router.get('/', (req, res) => {
  const stats = {
    articles: db.prepare('SELECT COUNT(*) n FROM articles').get().n,
    published: db.prepare("SELECT COUNT(*) n FROM articles WHERE status='published'").get().n,
    drafts: db.prepare("SELECT COUNT(*) n FROM articles WHERE status='draft'").get().n,
    newspapers: db.prepare('SELECT COUNT(*) n FROM newspapers').get().n,
    categories: db.prepare('SELECT COUNT(*) n FROM categories').get().n,
    messages: Messages.unreadCount(),
  };
  const recent = Articles.adminList().slice(0, 8);
  res.render('admin/dashboard', { title: 'Табло', stats, recent });
});

// ════════════════ СТАТИИ ════════════════
router.get('/articles', (req, res) => {
  res.render('admin/articles', { title: 'Статии', articles: Articles.adminList(), filter: req.query.status || '' });
});

router.get('/articles/new', (req, res) => {
  res.render('admin/article-form', {
    title: 'Нова статия', article: { status: 'draft', featured: 0 },
    categories: Categories.all(), action: '/admin/articles/new', isNew: true,
  });
});

const articleUpload = upload.fields([{ name: 'cover_image', maxCount: 1 }]);

router.post('/articles/new', articleUpload, (req, res) => {
  const b = req.body;
  const base = slugify(b.slug || b.title);
  const cover = req.files?.cover_image?.[0];
  const body = cleanHtml(b.body);
  const article = {
    category_id: b.category_id ? parseInt(b.category_id, 10) : null,
    author_id: req.user.id,
    slug: uniqueSlug('articles', base),
    title: b.title.trim(),
    excerpt: (b.excerpt || '').trim() || truncate(toText(body), 200),
    body,
    cover_image: cover ? uploadedPath(cover) : null,
    cover_alt: (b.cover_alt || '').trim() || null,
    video_url: (b.video_url || '').trim() || null,
    status: b.status === 'published' ? 'published' : 'draft',
    featured: b.featured ? 1 : 0,
    meta_title: (b.meta_title || '').trim() || null,
    meta_description: (b.meta_description || '').trim() || truncate(toText(body), 160),
    published_at: b.status === 'published' ? (b.published_at || nowIso()) : null,
  };
  const r = Articles.create(article);
  res.redirect(`/admin/articles/${r.lastInsertRowid}/edit`);
});

router.get('/articles/:id/edit', (req, res, next) => {
  const article = Articles.byId(req.params.id);
  if (!article) return next();
  res.render('admin/article-form', {
    title: 'Редакция: ' + article.title, article,
    categories: Categories.all(), action: `/admin/articles/${article.id}/edit`, isNew: false,
  });
});

router.post('/articles/:id/edit', articleUpload, (req, res, next) => {
  const existing = Articles.byId(req.params.id);
  if (!existing) return next();
  const b = req.body;
  const cover = req.files?.cover_image?.[0];
  const body = cleanHtml(b.body);
  const base = slugify(b.slug || b.title);
  const article = {
    category_id: b.category_id ? parseInt(b.category_id, 10) : null,
    slug: uniqueSlug('articles', base, existing.id),
    title: b.title.trim(),
    excerpt: (b.excerpt || '').trim() || truncate(toText(body), 200),
    body,
    cover_image: cover ? uploadedPath(cover) : (b.remove_cover ? null : existing.cover_image),
    cover_alt: (b.cover_alt || '').trim() || null,
    video_url: (b.video_url || '').trim() || null,
    status: b.status === 'published' ? 'published' : 'draft',
    featured: b.featured ? 1 : 0,
    meta_title: (b.meta_title || '').trim() || null,
    meta_description: (b.meta_description || '').trim() || truncate(toText(body), 160),
    published_at: b.status === 'published'
      ? (existing.published_at || b.published_at || nowIso())
      : null,
  };
  Articles.update(existing.id, article);
  res.redirect(`/admin/articles/${existing.id}/edit?saved=1`);
});

router.post('/articles/:id/delete', (req, res) => {
  Articles.delete(req.params.id);
  res.redirect('/admin/articles');
});

// ════════════════ ВЕСТНИК ════════════════
router.get('/newspapers', (req, res) => {
  res.render('admin/newspapers', { title: 'Вестник', issues: Newspapers.adminList() });
});

router.get('/newspapers/new', (req, res) => {
  res.render('admin/newspaper-form', {
    title: 'Нов брой', issue: { status: 'published', year: new Date().getFullYear() },
    action: '/admin/newspapers/new', isNew: true,
  });
});

const paperUpload = upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'pdf_file', maxCount: 1 }]);

router.post('/newspapers/new', paperUpload, (req, res) => {
  const b = req.body;
  const cover = req.files?.cover_image?.[0];
  const pdf = req.files?.pdf_file?.[0];
  const base = slugify(b.slug || b.title);
  const issue = {
    slug: uniqueSlug('newspapers', base),
    title: b.title.trim(),
    issue_number: b.issue_number ? parseInt(b.issue_number, 10) : null,
    year: b.year ? parseInt(b.year, 10) : null,
    month: b.month ? parseInt(b.month, 10) : null,
    description: (b.description || '').trim() || null,
    cover_image: cover ? uploadedPath(cover) : null,
    pdf_file: pdf ? uploadedPath(pdf) : null,
    status: b.status === 'draft' ? 'draft' : 'published',
    published_at: b.published_at || nowIso(),
  };
  const r = Newspapers.create(issue);
  res.redirect(`/admin/newspapers/${r.lastInsertRowid}/edit`);
});

router.get('/newspapers/:id/edit', (req, res, next) => {
  const issue = Newspapers.byId(req.params.id);
  if (!issue) return next();
  res.render('admin/newspaper-form', {
    title: 'Редакция: ' + issue.title, issue,
    action: `/admin/newspapers/${issue.id}/edit`, isNew: false,
  });
});

router.post('/newspapers/:id/edit', paperUpload, (req, res, next) => {
  const existing = Newspapers.byId(req.params.id);
  if (!existing) return next();
  const b = req.body;
  const cover = req.files?.cover_image?.[0];
  const pdf = req.files?.pdf_file?.[0];
  const base = slugify(b.slug || b.title);
  const issue = {
    slug: uniqueSlug('newspapers', base, existing.id),
    title: b.title.trim(),
    issue_number: b.issue_number ? parseInt(b.issue_number, 10) : null,
    year: b.year ? parseInt(b.year, 10) : null,
    month: b.month ? parseInt(b.month, 10) : null,
    description: (b.description || '').trim() || null,
    cover_image: cover ? uploadedPath(cover) : existing.cover_image,
    pdf_file: pdf ? uploadedPath(pdf) : existing.pdf_file,
    status: b.status === 'draft' ? 'draft' : 'published',
    published_at: b.published_at || existing.published_at || nowIso(),
  };
  Newspapers.update(existing.id, issue);
  res.redirect(`/admin/newspapers/${existing.id}/edit?saved=1`);
});

router.post('/newspapers/:id/delete', (req, res) => {
  Newspapers.delete(req.params.id);
  res.redirect('/admin/newspapers');
});

// ════════════════ КАТЕГОРИИ ════════════════
router.get('/categories', (req, res) => {
  res.render('admin/categories', {
    title: 'Категории', categories: Categories.all(), tree: Categories.tree(),
    saved: req.query.saved === '1',
  });
});

router.post('/categories/new', (req, res) => {
  const b = req.body;
  const base = slugify(b.slug || b.name);
  Categories.create({
    parent_id: b.parent_id ? parseInt(b.parent_id, 10) : null,
    slug: uniqueSlug('categories', base),
    name: b.name.trim(),
    description: (b.description || '').trim() || null,
    sort_order: parseInt(b.sort_order || '0', 10),
    in_menu: b.in_menu ? 1 : 0,
  });
  res.redirect('/admin/categories?saved=1');
});

router.post('/categories/:id/edit', (req, res, next) => {
  const existing = Categories.byId(req.params.id);
  if (!existing) return next();
  const b = req.body;
  const base = slugify(b.slug || b.name);
  Categories.update(existing.id, {
    parent_id: b.parent_id ? parseInt(b.parent_id, 10) : null,
    slug: uniqueSlug('categories', base, existing.id),
    name: b.name.trim(),
    description: (b.description || '').trim() || null,
    sort_order: parseInt(b.sort_order || '0', 10),
    in_menu: b.in_menu ? 1 : 0,
  });
  res.redirect('/admin/categories?saved=1');
});

router.post('/categories/:id/delete', (req, res) => {
  Categories.delete(req.params.id);
  res.redirect('/admin/categories');
});

// ════════════════ СТРАНИЦИ ════════════════
router.get('/pages', (req, res) => {
  res.render('admin/pages', { title: 'Страници', pages: Pages.all() });
});

router.get('/pages/new', (req, res) => {
  res.render('admin/page-form', { title: 'Нова страница', page: {}, action: '/admin/pages/new', isNew: true });
});

router.post('/pages/new', (req, res) => {
  const b = req.body;
  const base = slugify(b.slug || b.title);
  const r = Pages.create({
    slug: uniqueSlug('pages', base),
    title: b.title.trim(),
    body: cleanHtml(b.body),
    meta_description: (b.meta_description || '').trim() || null,
    is_system: 0,
  });
  res.redirect(`/admin/pages/${r.lastInsertRowid}/edit`);
});

router.get('/pages/:id/edit', (req, res, next) => {
  const page = Pages.byId(req.params.id);
  if (!page) return next();
  res.render('admin/page-form', { title: 'Редакция: ' + page.title, page, action: `/admin/pages/${page.id}/edit`, isNew: false });
});

router.post('/pages/:id/edit', (req, res, next) => {
  const existing = Pages.byId(req.params.id);
  if (!existing) return next();
  const b = req.body;
  const base = slugify(b.slug || b.title);
  Pages.update(existing.id, {
    slug: existing.is_system ? existing.slug : uniqueSlug('pages', base, existing.id),
    title: b.title.trim(),
    body: cleanHtml(b.body),
    meta_description: (b.meta_description || '').trim() || null,
  });
  res.redirect(`/admin/pages/${existing.id}/edit?saved=1`);
});

router.post('/pages/:id/delete', (req, res) => {
  Pages.delete(req.params.id);
  res.redirect('/admin/pages');
});

// ════════════════ СЪОБЩЕНИЯ ════════════════
router.get('/messages', (req, res) => {
  res.render('admin/messages', { title: 'Съобщения', messages: Messages.all() });
});
router.post('/messages/:id/read', (req, res) => { Messages.markRead(req.params.id); res.redirect('/admin/messages'); });
router.post('/messages/:id/delete', (req, res) => { Messages.delete(req.params.id); res.redirect('/admin/messages'); });

// ════════════════ НАСТРОЙКИ ════════════════
const SETTING_KEYS = [
  'org_name', 'org_short', 'site_description', 'newspaper_name',
  'contact_email', 'contact_phone', 'contact_address', 'contact_city',
  'social_facebook', 'social_youtube', 'social_instagram',
];

router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'Настройки', saved: req.query.saved === '1' });
});

router.post('/settings', (req, res) => {
  for (const key of SETTING_KEYS) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key].trim());
  }
  res.redirect('/admin/settings?saved=1');
});

// ════════════════ ПОТРЕБИТЕЛИ ════════════════
router.get('/users', (req, res) => {
  res.render('admin/users', { title: 'Потребители', users: Users.all(), saved: req.query.saved === '1', error: req.query.error || null });
});

router.post('/users/new', async (req, res) => {
  const b = req.body;
  if (req.user.role !== 'admin') return res.status(403).send('Само администратор може да добавя потребители.');
  if (!b.username || !b.email || !b.password || b.password.length < 8) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Попълнете всички полета; паролата трябва да е поне 8 символа.'));
  }
  try {
    Users.create({
      username: b.username.trim(),
      email: b.email.trim(),
      password_hash: await bcrypt.hash(b.password, 12),
      display_name: (b.display_name || b.username).trim(),
      role: b.role === 'admin' ? 'admin' : 'editor',
    });
    res.redirect('/admin/users?saved=1');
  } catch (e) {
    res.redirect('/admin/users?error=' + encodeURIComponent('Потребителското име или имейлът вече съществува.'));
  }
});

router.post('/users/password', async (req, res) => {
  const b = req.body;
  if (!b.password || b.password.length < 8) {
    return res.redirect('/admin/users?error=' + encodeURIComponent('Паролата трябва да е поне 8 символа.'));
  }
  Users.updatePassword(req.user.id, await bcrypt.hash(b.password, 12));
  res.redirect('/admin/users?saved=1');
});

router.post('/users/:id/delete', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send('Забранено.');
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.redirect('/admin/users?error=' + encodeURIComponent('Не можете да изтриете собствения си акаунт.'));
  if (Users.count() <= 1) return res.redirect('/admin/users');
  Users.delete(id);
  res.redirect('/admin/users');
});

export default router;
