// ============================================================
//  PANEV ASCENSORI — Database layer (SQLite + better-sqlite3)
//  Schema + prepared statements + migrations
// ============================================================

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'panev.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    name          TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    codice       TEXT,
    price        REAL    NOT NULL DEFAULT 0,
    price_label  TEXT,
    spessore     TEXT,
    larghezza    TEXT,
    lunghezza    TEXT,
    range_ext    TEXT,
    asole        INTEGER,
    materiale    TEXT,
    descrizione  TEXT,
    description  TEXT,
    image        TEXT,
    icon         TEXT    DEFAULT '📦',
    badge        TEXT,
    available    INTEGER NOT NULL DEFAULT 1,
    featured     INTEGER NOT NULL DEFAULT 0,
    patented     INTEGER NOT NULL DEFAULT 0,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);
  CREATE INDEX IF NOT EXISTS idx_products_featured  ON products(featured);

  CREATE TABLE IF NOT EXISTS orders (
    id                  TEXT    PRIMARY KEY,
    stripe_session_id   TEXT    UNIQUE,
    stripe_payment_id   TEXT,
    cliente_nome        TEXT,
    cliente_email       TEXT,
    cliente_tel         TEXT,
    cliente_azienda     TEXT,
    cliente_note        TEXT,
    items_json          TEXT    NOT NULL DEFAULT '[]',
    totale              REAL    NOT NULL DEFAULT 0,
    valuta              TEXT    NOT NULL DEFAULT 'EUR',
    stato               TEXT    NOT NULL DEFAULT 'Nuovo',
    pagamento           TEXT,
    ip_address          TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_stato      ON orders(stato);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

  CREATE TABLE IF NOT EXISTS messages (
    id           TEXT    PRIMARY KEY,
    nome         TEXT    NOT NULL,
    email        TEXT    NOT NULL,
    tel          TEXT,
    citta        TEXT,
    azienda      TEXT,
    servizio     TEXT,
    oggetto      TEXT,
    messaggio    TEXT    NOT NULL,
    source       TEXT    DEFAULT 'contatti',
    letto        INTEGER NOT NULL DEFAULT 0,
    ip_address   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_letto      ON messages(letto);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

  CREATE TABLE IF NOT EXISTS login_attempts (
    ip          TEXT    NOT NULL,
    count       INTEGER NOT NULL DEFAULT 0,
    first_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    locked_until TEXT,
    PRIMARY KEY (ip)
  );
`);

// ── Helpers ───────────────────────────────────────────────────
function genId(prefix = '') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36) + rnd;
}

// Convert 0/1 → boolean in output; input stays numeric
function productRow(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, category: r.category, codice: r.codice,
    price: r.price, priceLabel: r.price_label,
    spessore: r.spessore, larghezza: r.larghezza, lunghezza: r.lunghezza,
    range: r.range_ext, asole: r.asole, materiale: r.materiale,
    descrizione: r.descrizione, description: r.description,
    image: r.image, icon: r.icon, badge: r.badge,
    available: !!r.available, featured: !!r.featured, patented: !!r.patented,
    sortOrder: r.sort_order,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function orderRow(r) {
  if (!r) return null;
  let items = [];
  try { items = JSON.parse(r.items_json || '[]'); } catch {}
  return {
    id: r.id,
    stripeSessionId: r.stripe_session_id,
    stripePaymentId: r.stripe_payment_id,
    cliente: r.cliente_nome, email: r.cliente_email, tel: r.cliente_tel,
    azienda: r.cliente_azienda, note: r.cliente_note,
    items, totale: r.totale, valuta: r.valuta,
    stato: r.stato, pagamento: r.pagamento,
    data: r.created_at, updatedAt: r.updated_at,
  };
}

function messageRow(r) {
  if (!r) return null;
  return {
    id: r.id, nome: r.nome, email: r.email, tel: r.tel,
    citta: r.citta, azienda: r.azienda,
    servizio: r.servizio, oggetto: r.oggetto, messaggio: r.messaggio,
    source: r.source, letto: !!r.letto,
    data: r.created_at,
  };
}

// ── Prepared statements ──────────────────────────────────────
const stmts = {
  // Admin users
  getAdminByEmail: db.prepare('SELECT * FROM admin_users WHERE lower(email) = lower(?)'),
  getAdminById:    db.prepare('SELECT * FROM admin_users WHERE id = ?'),
  createAdmin:     db.prepare(`INSERT INTO admin_users (email, password_hash, name) VALUES (?, ?, ?)`),
  updateAdminPw:   db.prepare(`UPDATE admin_users SET password_hash = ? WHERE id = ?`),
  updateAdminLastLogin: db.prepare(`UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?`),

  // Products
  productsAll:         db.prepare(`SELECT * FROM products ORDER BY sort_order, category, name`),
  productsAvailable:   db.prepare(`SELECT * FROM products WHERE available = 1 ORDER BY sort_order, category, name`),
  productById:         db.prepare(`SELECT * FROM products WHERE id = ?`),
  productInsert:       db.prepare(`
    INSERT INTO products (id, name, category, codice, price, price_label, spessore, larghezza, lunghezza, range_ext, asole, materiale, descrizione, description, image, icon, badge, available, featured, patented, sort_order)
    VALUES (@id, @name, @category, @codice, @price, @priceLabel, @spessore, @larghezza, @lunghezza, @range, @asole, @materiale, @descrizione, @description, @image, @icon, @badge, @available, @featured, @patented, @sortOrder)
  `),
  productUpdate:       db.prepare(`
    UPDATE products SET
      name = @name, category = @category, codice = @codice,
      price = @price, price_label = @priceLabel,
      spessore = @spessore, larghezza = @larghezza, lunghezza = @lunghezza,
      range_ext = @range, asole = @asole, materiale = @materiale,
      descrizione = @descrizione, description = @description,
      image = @image, icon = @icon, badge = @badge,
      available = @available, featured = @featured, patented = @patented,
      sort_order = @sortOrder,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  productDelete:       db.prepare(`DELETE FROM products WHERE id = ?`),
  productCount:        db.prepare(`SELECT COUNT(*) AS c FROM products`),

  // Orders
  ordersAll:      db.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?`),
  orderById:      db.prepare(`SELECT * FROM orders WHERE id = ?`),
  orderByStripeSession: db.prepare(`SELECT * FROM orders WHERE stripe_session_id = ?`),
  orderInsert:    db.prepare(`
    INSERT INTO orders (id, stripe_session_id, stripe_payment_id, cliente_nome, cliente_email, cliente_tel, cliente_azienda, cliente_note, items_json, totale, valuta, stato, pagamento, ip_address)
    VALUES (@id, @stripeSessionId, @stripePaymentId, @cliente, @email, @tel, @azienda, @note, @itemsJson, @totale, @valuta, @stato, @pagamento, @ip)
  `),
  orderUpdateStatus: db.prepare(`UPDATE orders SET stato = ?, updated_at = datetime('now') WHERE id = ?`),
  orderDelete:       db.prepare(`DELETE FROM orders WHERE id = ?`),
  orderClear:        db.prepare(`DELETE FROM orders`),
  orderStats:        db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(totale), 0) AS revenue,
      COALESCE(SUM(CASE WHEN stato = 'Nuovo' THEN 1 ELSE 0 END), 0) AS newCount,
      COALESCE(SUM(CASE WHEN stato = 'Completato' THEN 1 ELSE 0 END), 0) AS doneCount
    FROM orders
  `),

  // Messages
  messagesAll:   db.prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?`),
  messageById:   db.prepare(`SELECT * FROM messages WHERE id = ?`),
  messageInsert: db.prepare(`
    INSERT INTO messages (id, nome, email, tel, citta, azienda, servizio, oggetto, messaggio, source, letto, ip_address)
    VALUES (@id, @nome, @email, @tel, @citta, @azienda, @servizio, @oggetto, @messaggio, @source, @letto, @ip)
  `),
  messageMarkRead: db.prepare(`UPDATE messages SET letto = 1 WHERE id = ?`),
  messageMarkAllRead: db.prepare(`UPDATE messages SET letto = 1 WHERE letto = 0`),
  messageDelete:   db.prepare(`DELETE FROM messages WHERE id = ?`),
  messageClear:    db.prepare(`DELETE FROM messages`),
  messageStats:    db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN letto = 0 THEN 1 ELSE 0 END), 0) AS unreadCount
    FROM messages
  `),

  // Login attempts
  getLoginAttempt:    db.prepare(`SELECT * FROM login_attempts WHERE ip = ?`),
  upsertLoginAttempt: db.prepare(`
    INSERT INTO login_attempts (ip, count, first_at, last_at, locked_until)
    VALUES (?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(ip) DO UPDATE SET
      count = excluded.count,
      last_at = datetime('now'),
      locked_until = excluded.locked_until
  `),
  clearLoginAttempt:  db.prepare(`DELETE FROM login_attempts WHERE ip = ?`),
  cleanupLoginAttempts: db.prepare(`DELETE FROM login_attempts WHERE last_at < datetime('now', '-1 day')`),
};

// ── High-level API ────────────────────────────────────────────
const api = {
  // Admin
  getAdminByEmail(email)        { return stmts.getAdminByEmail.get(email); },
  getAdminById(id)              { return stmts.getAdminById.get(id); },
  createAdmin(email, hash, name){ return stmts.createAdmin.run(email, hash, name || null); },
  updateAdminPassword(id, hash) { return stmts.updateAdminPw.run(hash, id); },
  markAdminLoggedIn(id)         { stmts.updateAdminLastLogin.run(id); },

  // Products
  listProducts(onlyAvailable = false) {
    const rows = onlyAvailable ? stmts.productsAvailable.all() : stmts.productsAll.all();
    return rows.map(productRow);
  },
  getProduct(id) { return productRow(stmts.productById.get(id)); },
  insertProduct(p) {
    const row = normalizeProduct(p);
    stmts.productInsert.run(row);
    return productRow(stmts.productById.get(row.id));
  },
  updateProduct(id, p) {
    const existing = stmts.productById.get(id);
    if (!existing) return null;
    const merged = { ...productRow(existing), ...p, id };
    stmts.productUpdate.run(normalizeProduct(merged));
    return productRow(stmts.productById.get(id));
  },
  deleteProduct(id)       { return stmts.productDelete.run(id).changes; },
  countProducts()         { return stmts.productCount.get().c; },

  // Orders
  listOrders(limit = 500, offset = 0) {
    return stmts.ordersAll.all(limit, offset).map(orderRow);
  },
  getOrder(id)                 { return orderRow(stmts.orderById.get(id)); },
  getOrderByStripeSession(sid) { return orderRow(stmts.orderByStripeSession.get(sid)); },
  insertOrder(o) {
    const row = {
      id: o.id || 'ORD-' + genId(),
      stripeSessionId: o.stripeSessionId || null,
      stripePaymentId: o.stripePaymentId || null,
      cliente:  o.cliente || '',
      email:    o.email || '',
      tel:      o.tel || '',
      azienda:  o.azienda || '',
      note:     o.note || '',
      itemsJson: JSON.stringify(o.items || []),
      totale:   Number(o.totale) || 0,
      valuta:   o.valuta || 'EUR',
      stato:    o.stato || 'Nuovo',
      pagamento: o.pagamento || 'Stripe',
      ip:       o.ip || null,
    };
    stmts.orderInsert.run(row);
    return orderRow(stmts.orderById.get(row.id));
  },
  updateOrderStatus(id, stato) { return stmts.orderUpdateStatus.run(stato, id).changes; },
  deleteOrder(id)              { return stmts.orderDelete.run(id).changes; },
  clearOrders()                { return stmts.orderClear.run().changes; },
  orderStats()                 { return stmts.orderStats.get(); },

  // Messages
  listMessages(limit = 1000, offset = 0) {
    return stmts.messagesAll.all(limit, offset).map(messageRow);
  },
  getMessage(id) { return messageRow(stmts.messageById.get(id)); },
  insertMessage(m) {
    const row = {
      id: m.id || 'msg_' + genId(),
      nome: m.nome || '',
      email: m.email || '',
      tel: m.tel || null,
      citta: m.citta || null,
      azienda: m.azienda || null,
      servizio: m.servizio || null,
      oggetto: m.oggetto || null,
      messaggio: m.messaggio || '',
      source: m.source || 'contatti',
      letto: 0,
      ip: m.ip || null,
    };
    stmts.messageInsert.run(row);
    return messageRow(stmts.messageById.get(row.id));
  },
  markMessageRead(id)   { return stmts.messageMarkRead.run(id).changes; },
  markAllMessagesRead() { return stmts.messageMarkAllRead.run().changes; },
  deleteMessage(id)     { return stmts.messageDelete.run(id).changes; },
  clearMessages()       { return stmts.messageClear.run().changes; },
  messageStats()        { return stmts.messageStats.get(); },

  // Login attempts
  getLoginAttempt(ip) { return stmts.getLoginAttempt.get(ip); },
  recordLoginAttempt(ip, count, lockedUntil = null) {
    return stmts.upsertLoginAttempt.run(ip, count, lockedUntil);
  },
  clearLoginAttempt(ip) { return stmts.clearLoginAttempt.run(ip).changes; },
  cleanupLoginAttempts() { return stmts.cleanupLoginAttempts.run().changes; },

  // Raw db handle if needed
  raw: db,
  genId,
};

function normalizeProduct(p) {
  return {
    id:          p.id,
    name:        String(p.name || '').slice(0, 200),
    category:    String(p.category || '').slice(0, 100),
    codice:      p.codice ? String(p.codice).slice(0, 80) : null,
    price:       Number(p.price) || 0,
    priceLabel:  p.priceLabel ? String(p.priceLabel).slice(0, 80) : null,
    spessore:    p.spessore || null,
    larghezza:   p.larghezza || null,
    lunghezza:   p.lunghezza || null,
    range:       p.range || null,
    asole:       p.asole != null ? Number(p.asole) : null,
    materiale:   p.materiale || null,
    descrizione: p.descrizione ? String(p.descrizione).slice(0, 500) : null,
    description: p.description ? String(p.description).slice(0, 2000) : null,
    image:       p.image || null,
    icon:        p.icon || '📦',
    badge:       p.badge || null,
    available:   p.available ? 1 : 0,
    featured:    p.featured ? 1 : 0,
    patented:    p.patented ? 1 : 0,
    sortOrder:   Number(p.sortOrder) || 0,
  };
}

module.exports = api;
