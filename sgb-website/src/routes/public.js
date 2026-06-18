import express from 'express';
import { Articles, Categories, Newspapers, Pages, Messages } from '../queries.js';
import { paginate, truncate } from '../lib/helpers.js';
import { articleLd, breadcrumbLd, organizationLd, websiteLd, faqLd, abs } from '../lib/seo.js';
import { getAllSettings } from '../db.js';

const router = express.Router();
const PER_PAGE = 9;

// ─── Начало ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const settings = getAllSettings();
  const featured = Articles.published({ limit: 1, featured: true })[0]
    || Articles.published({ limit: 1 })[0] || null;
  const latest = Articles.published({ limit: 7, excludeId: featured ? featured.id : null });
  const newspaper = Newspapers.latest();
  const recentPapers = Newspapers.published({ limit: 4 });

  res.locals.seo.title = `${res.locals.site.name} — официален уебсайт`;
  res.locals.seo.description = res.locals.site.description;
  res.locals.seo.canonical = abs('/');
  res.locals.seo.jsonLd = [organizationLd(settings), websiteLd(settings)];

  res.render('public/home', {
    featured, latest, newspaper, recentPapers,
    menuTree: res.locals.menuTree,
  });
});

// ─── Списък: всички новини ───────────────────────────────
router.get('/novini', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const total = Articles.countPublished();
  const p = paginate(total, page, PER_PAGE);
  const articles = Articles.published({ limit: p.perPage, offset: p.offset });

  res.locals.seo.title = 'Новини и съобщения — ' + res.locals.site.name;
  res.locals.seo.description = 'Последни новини, съобщения и актуална информация от Съюза на глухите в България.';
  res.locals.seo.canonical = abs('/novini' + (p.page > 1 ? `?page=${p.page}` : ''));
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' }, { name: 'Новини', url: '/novini' },
  ])];

  res.render('public/article-list', {
    heading: 'Новини и съобщения',
    intro: 'Актуална информация, съобщения и публикации на Съюза на глухите в България.',
    articles, pagination: p, category: null, baseUrl: '/novini',
  });
});

// ─── Категория ───────────────────────────────────────────
router.get('/category/:slug', (req, res, next) => {
  const category = Categories.bySlug(req.params.slug);
  if (!category) return next();
  const page = parseInt(req.query.page || '1', 10);
  const childIds = Categories.children(category.id).map((c) => c.id);
  const total = Articles.countPublished({ categoryId: category.id });
  const p = paginate(total, page, PER_PAGE);
  const articles = Articles.published({ limit: p.perPage, offset: p.offset, categoryId: category.id });
  const children = Categories.children(category.id);

  res.locals.seo.title = `${category.name} — ${res.locals.site.name}`;
  res.locals.seo.description = category.description || `${category.name} — материали и информация от ${res.locals.site.name}.`;
  res.locals.seo.canonical = abs(`/category/${category.slug}` + (p.page > 1 ? `?page=${p.page}` : ''));
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' }, { name: category.name, url: `/category/${category.slug}` },
  ])];

  res.render('public/article-list', {
    heading: category.name,
    intro: category.description || '',
    articles, pagination: p, category, children, baseUrl: `/category/${category.slug}`,
  });
});

// ─── Единична статия ─────────────────────────────────────
router.get('/statia/:slug', (req, res, next) => {
  const article = Articles.bySlug(req.params.slug);
  if (!article || article.status !== 'published') return next();
  Articles.incrementViews(article.id);

  const related = article.category_id
    ? Articles.published({ limit: 3, categoryId: article.category_id, excludeId: article.id })
    : Articles.published({ limit: 3, excludeId: article.id });

  const settings = getAllSettings();
  res.locals.seo.title = article.meta_title || `${article.title} — ${res.locals.site.name}`;
  res.locals.seo.description = article.meta_description || article.excerpt || truncate(article.title, 160);
  res.locals.seo.canonical = abs(`/statia/${article.slug}`);
  res.locals.seo.type = 'article';
  res.locals.seo.image = article.cover_image ? abs(article.cover_image) : res.locals.seo.image;
  res.locals.seo.publishedTime = article.published_at;
  res.locals.seo.modifiedTime = article.updated_at;
  res.locals.seo.jsonLd = [
    articleLd(article, settings),
    breadcrumbLd([
      { name: 'Начало', url: '/' },
      ...(article.category_name ? [{ name: article.category_name, url: `/category/${article.category_slug}` }] : [{ name: 'Новини', url: '/novini' }]),
      { name: article.title, url: `/statia/${article.slug}` },
    ]),
  ];

  res.render('public/article', { article, related });
});

// ─── Вестник „Тишина“: списък ────────────────────────────
router.get('/vestnik', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const total = Newspapers.countPublished();
  const p = paginate(total, page, 12);
  const issues = Newspapers.published({ limit: p.perPage, offset: p.offset });
  const name = res.locals.site.newspaperName;

  res.locals.seo.title = `Вестник „${name}“ — архив на изданията`;
  res.locals.seo.description = `Електронен архив на вестник „${name}“ — изданието на Съюза на глухите в България. Прочетете и изтеглете броевете в PDF формат.`;
  res.locals.seo.canonical = abs('/vestnik' + (p.page > 1 ? `?page=${p.page}` : ''));
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' }, { name: `Вестник „${name}“`, url: '/vestnik' },
  ])];

  res.render('public/newspaper-list', { issues, pagination: p, name });
});

// ─── Вестник: единичен брой ──────────────────────────────
router.get('/vestnik/:slug', (req, res, next) => {
  const issue = Newspapers.bySlug(req.params.slug);
  if (!issue || issue.status !== 'published') return next();
  const name = res.locals.site.newspaperName;

  res.locals.seo.title = `${issue.title} — вестник „${name}“`;
  res.locals.seo.description = issue.description || `${issue.title} — брой на вестник „${name}“ на Съюза на глухите в България.`;
  res.locals.seo.canonical = abs(`/vestnik/${issue.slug}`);
  res.locals.seo.image = issue.cover_image ? abs(issue.cover_image) : res.locals.seo.image;
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' },
    { name: `Вестник „${name}“`, url: '/vestnik' },
    { name: issue.title, url: `/vestnik/${issue.slug}` },
  ])];

  const others = Newspapers.published({ limit: 4 }).filter((i) => i.id !== issue.id).slice(0, 3);
  res.render('public/newspaper', { issue, name, others });
});

// ─── Търсене ─────────────────────────────────────────────
router.get('/tarsene', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = q.length >= 2 ? Articles.search(q) : [];
  res.locals.seo.title = q ? `Търсене: „${q}“` : 'Търсене';
  res.locals.seo.description = 'Търсене в новините и публикациите на Съюза на глухите в България.';
  res.locals.seo.robots = 'noindex, follow';
  res.locals.seo.canonical = abs('/tarsene');
  res.render('public/search', { q, results });
});

// ─── Контакти ────────────────────────────────────────────
router.get('/kontakti', (req, res) => {
  res.locals.seo.title = 'Контакти — ' + res.locals.site.name;
  res.locals.seo.description = `Свържете се със Съюза на глухите в България. Адрес, телефон и електронна поща на Централното управление.`;
  res.locals.seo.canonical = abs('/kontakti');
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' }, { name: 'Контакти', url: '/kontakti' },
  ])];
  res.render('public/contact', { sent: req.query.sent === '1', error: null, form: {} });
});

router.post('/kontakti', (req, res) => {
  const { name, email, subject, message, website } = req.body;
  // Honeypot против ботове
  if (website) return res.redirect('/kontakti?sent=1');
  const errors = [];
  if (!name || name.trim().length < 2) errors.push('Моля, въведете име.');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Моля, въведете валиден имейл.');
  if (!message || message.trim().length < 10) errors.push('Съобщението е твърде кратко.');
  if (errors.length) {
    res.locals.seo.title = 'Контакти — ' + res.locals.site.name;
    return res.status(400).render('public/contact', { sent: false, error: errors.join(' '), form: req.body });
  }
  Messages.create({
    name: name.trim(), email: email.trim(),
    subject: (subject || '').trim() || null, message: message.trim(),
  });
  res.redirect('/kontakti?sent=1');
});

// ─── Статични / правни страници ──────────────────────────
router.get('/stranica/:slug', (req, res, next) => {
  const page = Pages.bySlug(req.params.slug);
  if (!page) return next();
  res.locals.seo.title = `${page.title} — ${res.locals.site.name}`;
  res.locals.seo.description = page.meta_description || truncate(page.title, 160);
  res.locals.seo.canonical = abs(`/stranica/${page.slug}`);
  res.locals.seo.jsonLd = [breadcrumbLd([
    { name: 'Начало', url: '/' }, { name: page.title, url: `/stranica/${page.slug}` },
  ])];
  res.render('public/page', { page });
});

export default router;
