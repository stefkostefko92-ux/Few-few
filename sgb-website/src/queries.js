import db from './db.js';

// ─── Категории ───────────────────────────────────────────
export const Categories = {
  all: () => db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all(),
  menu: () => db.prepare('SELECT * FROM categories WHERE in_menu = 1 ORDER BY sort_order, name').all(),
  roots: () => db.prepare('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order, name').all(),
  children: (parentId) =>
    db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, name').all(parentId),
  bySlug: (slug) => db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug),
  byId: (id) => db.prepare('SELECT * FROM categories WHERE id = ?').get(id),
  // Дърво за навигация
  tree() {
    const roots = this.roots();
    return roots.map((r) => ({ ...r, children: this.children(r.id) }));
  },
  create: (c) =>
    db
      .prepare(
        `INSERT INTO categories (parent_id, slug, name, description, sort_order, in_menu)
         VALUES (@parent_id, @slug, @name, @description, @sort_order, @in_menu)`
      )
      .run(c),
  update: (id, c) =>
    db
      .prepare(
        `UPDATE categories SET parent_id=@parent_id, slug=@slug, name=@name,
         description=@description, sort_order=@sort_order, in_menu=@in_menu WHERE id=@id`
      )
      .run({ ...c, id }),
  delete: (id) => db.prepare('DELETE FROM categories WHERE id = ?').run(id),
};

// ─── Статии ──────────────────────────────────────────────
const ARTICLE_JOIN = `
  SELECT a.*, c.name AS category_name, c.slug AS category_slug, u.display_name AS author_name
  FROM articles a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN users u ON u.id = a.author_id
`;

export const Articles = {
  bySlug: (slug) => db.prepare(`${ARTICLE_JOIN} WHERE a.slug = ?`).get(slug),
  byId: (id) => db.prepare(`${ARTICLE_JOIN} WHERE a.id = ?`).get(id),

  published({ limit = 12, offset = 0, categoryId = null, featured = null, excludeId = null } = {}) {
    let where = "a.status = 'published'";
    const params = {};
    if (categoryId) { where += ' AND a.category_id = @categoryId'; params.categoryId = categoryId; }
    if (featured !== null) { where += ' AND a.featured = @featured'; params.featured = featured ? 1 : 0; }
    if (excludeId) { where += ' AND a.id != @excludeId'; params.excludeId = excludeId; }
    params.limit = limit; params.offset = offset;
    return db.prepare(
      `${ARTICLE_JOIN} WHERE ${where} ORDER BY a.published_at DESC, a.id DESC LIMIT @limit OFFSET @offset`
    ).all(params);
  },

  countPublished({ categoryId = null } = {}) {
    let where = "status = 'published'";
    const params = {};
    if (categoryId) { where += ' AND category_id = @categoryId'; params.categoryId = categoryId; }
    return db.prepare(`SELECT COUNT(*) AS n FROM articles WHERE ${where}`).get(params).n;
  },

  // За sitemap / RSS
  allPublished: () =>
    db.prepare(`${ARTICLE_JOIN} WHERE a.status = 'published' ORDER BY a.published_at DESC`).all(),

  search(q, limit = 30) {
    const term = `%${q}%`;
    return db
      .prepare(
        `${ARTICLE_JOIN} WHERE a.status = 'published'
         AND (a.title LIKE ? OR a.excerpt LIKE ? OR a.body LIKE ?)
         ORDER BY a.published_at DESC LIMIT ?`
      )
      .all(term, term, term, limit);
  },

  adminList({ status = null } = {}) {
    let where = '1=1';
    const params = {};
    if (status) { where = 'a.status = @status'; params.status = status; }
    return db.prepare(`${ARTICLE_JOIN} WHERE ${where} ORDER BY a.created_at DESC`).all(params);
  },

  incrementViews: (id) => db.prepare('UPDATE articles SET views = views + 1 WHERE id = ?').run(id),

  create: (a) =>
    db
      .prepare(
        `INSERT INTO articles
         (category_id, author_id, slug, title, excerpt, body, cover_image, cover_alt, video_url,
          status, featured, meta_title, meta_description, published_at)
         VALUES (@category_id,@author_id,@slug,@title,@excerpt,@body,@cover_image,@cover_alt,@video_url,
          @status,@featured,@meta_title,@meta_description,@published_at)`
      )
      .run(a),

  update: (id, a) =>
    db
      .prepare(
        `UPDATE articles SET category_id=@category_id, slug=@slug, title=@title, excerpt=@excerpt,
         body=@body, cover_image=@cover_image, cover_alt=@cover_alt, video_url=@video_url,
         status=@status, featured=@featured, meta_title=@meta_title, meta_description=@meta_description,
         published_at=@published_at, updated_at=datetime('now') WHERE id=@id`
      )
      .run({ ...a, id }),

  delete: (id) => db.prepare('DELETE FROM articles WHERE id = ?').run(id),
};

// ─── Вестник „Тишина“ ────────────────────────────────────
export const Newspapers = {
  bySlug: (slug) => db.prepare('SELECT * FROM newspapers WHERE slug = ?').get(slug),
  byId: (id) => db.prepare('SELECT * FROM newspapers WHERE id = ?').get(id),

  published({ limit = 24, offset = 0 } = {}) {
    return db
      .prepare(
        `SELECT * FROM newspapers WHERE status = 'published'
         ORDER BY year DESC, issue_number DESC, published_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
  },
  countPublished: () =>
    db.prepare("SELECT COUNT(*) AS n FROM newspapers WHERE status = 'published'").get().n,
  allPublished: () =>
    db.prepare("SELECT * FROM newspapers WHERE status='published' ORDER BY year DESC, issue_number DESC").all(),
  latest: () =>
    db.prepare("SELECT * FROM newspapers WHERE status='published' ORDER BY year DESC, issue_number DESC LIMIT 1").get(),
  adminList: () => db.prepare('SELECT * FROM newspapers ORDER BY year DESC, issue_number DESC, id DESC').all(),

  create: (n) =>
    db
      .prepare(
        `INSERT INTO newspapers (slug, title, issue_number, year, month, description, cover_image, pdf_file, status, published_at)
         VALUES (@slug,@title,@issue_number,@year,@month,@description,@cover_image,@pdf_file,@status,@published_at)`
      )
      .run(n),
  update: (id, n) =>
    db
      .prepare(
        `UPDATE newspapers SET slug=@slug, title=@title, issue_number=@issue_number, year=@year, month=@month,
         description=@description, cover_image=@cover_image, pdf_file=@pdf_file, status=@status,
         published_at=@published_at, updated_at=datetime('now') WHERE id=@id`
      )
      .run({ ...n, id }),
  delete: (id) => db.prepare('DELETE FROM newspapers WHERE id = ?').run(id),
};

// ─── Страници ────────────────────────────────────────────
export const Pages = {
  bySlug: (slug) => db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug),
  byId: (id) => db.prepare('SELECT * FROM pages WHERE id = ?').get(id),
  all: () => db.prepare('SELECT * FROM pages ORDER BY title').all(),
  create: (p) =>
    db
      .prepare(
        `INSERT INTO pages (slug, title, body, meta_description, is_system)
         VALUES (@slug,@title,@body,@meta_description,@is_system)`
      )
      .run(p),
  update: (id, p) =>
    db
      .prepare(
        `UPDATE pages SET slug=@slug, title=@title, body=@body, meta_description=@meta_description,
         updated_at=datetime('now') WHERE id=@id`
      )
      .run({ ...p, id }),
  delete: (id) => db.prepare('DELETE FROM pages WHERE id = ? AND is_system = 0').run(id),
};

// ─── Потребители ─────────────────────────────────────────
export const Users = {
  byUsername: (u) => db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(u, u),
  byId: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  all: () => db.prepare('SELECT id, username, email, display_name, role, created_at, last_login_at FROM users ORDER BY id').all(),
  count: () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  create: (u) =>
    db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, role)
         VALUES (@username,@email,@password_hash,@display_name,@role)`
      )
      .run(u),
  updatePassword: (id, hash) => db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id),
  touchLogin: (id) => db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id),
  delete: (id) => db.prepare('DELETE FROM users WHERE id = ?').run(id),
};

// ─── Съобщения от контактна форма ────────────────────────
export const Messages = {
  create: (m) =>
    db.prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (@name,@email,@subject,@message)').run(m),
  all: () => db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all(),
  unreadCount: () => db.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0').get().n,
  markRead: (id) => db.prepare('UPDATE contact_messages SET is_read = 1 WHERE id = ?').run(id),
  delete: (id) => db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id),
};
