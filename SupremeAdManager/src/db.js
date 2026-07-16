// SQLite схема — better-sqlite3, WAL, всичко синхронно и просто.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK (platform IN ('google','meta')),
  label TEXT NOT NULL,
  external_account_id TEXT NOT NULL,      -- Google: customer_id; Meta: act_<id>
  currency TEXT NOT NULL DEFAULT 'EUR',
  -- Токените се пазят САМО криптирани (AES-256-GCM, ключ от средата) — виж crypto.js
  refresh_token_enc TEXT,
  access_token_enc TEXT,
  token_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, external_account_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES connections(id),
  external_id TEXT,                        -- id в платформата след публикуване
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('google','meta')),
  -- Google: SEARCH | PERFORMANCE_MAX | DEMAND_GEN | VIDEO | DISPLAY
  -- Meta (ODAX): OUTCOME_TRAFFIC | OUTCOME_SALES | OUTCOME_LEADS | OUTCOME_ENGAGEMENT | OUTCOME_AWARENESS | OUTCOME_APP_PROMOTION
  objective TEXT NOT NULL,
  daily_budget REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  bidding TEXT,                            -- tCPA/tROAS/MAX_CONVERSIONS/CPV/…
  bidding_target REAL,
  -- JSON: placements (Meta: facebook/instagram/threads/messenger + позиции; CTWA), geo, езици,
  -- възрастов диапазон, video asset-и (YouTube video id / Meta video id), url, utm…
  spec_json TEXT NOT NULL DEFAULT '{}',
  special_ad_categories TEXT NOT NULL DEFAULT '[]',  -- Meta: HOUSING/EMPLOYMENT/CREDIT/ISSUES_ELECTIONS_POLITICS/FINANCIAL_PRODUCTS_SERVICES
  ai_generated_creative INTEGER NOT NULL DEFAULT 0,  -- AI Act чл. 50: изисква разкриване
  -- Жизнен цикъл: draft → published (PAUSED в платформата!) → active ↔ paused → archived
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','active','paused','archived','error')),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text','image','video')),
  -- text: {headlines:[], descriptions:[], primary_texts:[]}; image/video: {url|external_asset_id, ratio}
  payload_json TEXT NOT NULL,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Дневни метрики, синхронизирани от платформите (или симулирани в dry-run).
CREATE TABLE IF NOT EXISTS metrics_daily (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0,
  conversion_value REAL NOT NULL DEFAULT 0,
  video_views INTEGER NOT NULL DEFAULT 0,
  frequency REAL,
  PRIMARY KEY (campaign_id, date)
);

-- Правила за автоматизация: условие върху метрики → действие, с cooldown и твърди граници.
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE, -- NULL = важи за всички
  name TEXT NOT NULL,
  -- metric: cpa | roas | ctr | spend_today | frequency | conversions
  metric TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('>','<','>=','<=')),
  threshold REAL NOT NULL,
  lookback_days INTEGER NOT NULL DEFAULT 3,
  min_spend REAL NOT NULL DEFAULT 0,       -- не действай преди статистическа маса
  -- action: pause | activate | scale_budget | shrink_budget | notify
  action TEXT NOT NULL,
  action_value REAL,                        -- напр. +20 (%) за scale_budget
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  last_fired_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Пълна одитна следа: всяко действие (човешко или автоматично) към платформа се записва.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT NOT NULL,                      -- 'admin' | 'rule:<id>' | 'scheduler'
  campaign_id INTEGER,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  dry_run INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
`);

// Леки миграции: колони, добавени след първата схема (ALTER е идемпотентен през проверка).
const campaignCols = db
  .prepare(`PRAGMA table_info(campaigns)`)
  .all()
  .map((c) => c.name);
if (!campaignCols.includes('policy_json')) {
  // Последен известен policy/delivery статус от платформата: {status, issues:[], checked_at}
  db.exec(`ALTER TABLE campaigns ADD COLUMN policy_json TEXT`);
}

export function audit(actor, action, { campaignId = null, detail = {}, dryRun = false } = {}) {
  db.prepare(
    `INSERT INTO audit_log (actor, campaign_id, action, detail_json, dry_run) VALUES (?,?,?,?,?)`
  ).run(actor, campaignId, action, JSON.stringify(detail), dryRun ? 1 : 0);
}
