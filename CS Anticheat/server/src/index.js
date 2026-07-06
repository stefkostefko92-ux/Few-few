// CS Anticheat backend — приема screenshare доклади, преглед в панел, Discord alert.
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { sendAlert } from './discord.js';
import { renderReport, renderList } from './view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.CSAC_SECRET || ''; // HMAC споделена тайна (задължителна в прод)
const DISCORD_WEBHOOK = process.env.CSAC_DISCORD_WEBHOOK || '';
const PANEL_TOKEN = process.env.CSAC_PANEL_TOKEN || ''; // защита на списъка
const PUBLIC_URL = (process.env.CSAC_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_DIR = process.env.CSAC_DATA_DIR || path.join(__dirname, '..', 'data', 'reports');
const ALERT_MIN = process.env.CSAC_ALERT_MIN || 'suspicious'; // от коя присъда нагоре алармираме

const store = new Store(DATA_DIR);
await store.init();

const app = express();
app.disable('x-powered-by');
// Пазим суровото тяло за HMAC проверката.
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ── HMAC верификация (constant-time) ──
function verifySignature(req) {
  if (!SECRET) return true; // dev режим без тайна (в прод ЗАДЪЛЖИТЕЛНО я задай)
  const header = req.get('X-CSAC-Signature') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.rawBody ?? Buffer.alloc(0)).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verdictRank(v) {
  return { detected: 3, suspicious: 2, clean: 1 }[v] ?? 0;
}

// ── Приемане на доклад ──
app.post('/api/v1/reports', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'невалиден подпис' });
  }
  const r = req.body;
  if (!r || typeof r.reportId !== 'string' || !/^csac_[a-f0-9]{8,64}$/.test(r.reportId)) {
    return res.status(400).json({ error: 'невалиден доклад' });
  }

  try {
    await store.save(r);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }

  const viewUrl = `${PUBLIC_URL}/r/${r.reportId}`;

  // Discord alert (не блокира отговора).
  if (DISCORD_WEBHOOK && verdictRank(r.verdict) >= verdictRank(ALERT_MIN)) {
    sendAlert(DISCORD_WEBHOOK, r, viewUrl).catch((e) => console.error('discord alert:', e.message));
  }

  res.status(201).json({ id: r.reportId, url: viewUrl, verdict: r.verdict, score: r.score });
});

// ── JSON на доклад ──
app.get('/api/v1/reports/:id', async (req, res) => {
  const r = await store.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'не е намерен' });
  res.json(r);
});

// ── HTML преглед на доклад ──
app.get('/r/:id', async (req, res) => {
  const r = await store.get(req.params.id);
  if (!r) return res.status(404).type('html').send('<h1>404 — докладът не е намерен</h1>');
  res.type('html').send(renderReport(r));
});

// ── Списък (панел) — защитен с токен ако е зададен ──
app.get('/', async (req, res) => {
  if (PANEL_TOKEN && req.query.key !== PANEL_TOKEN) {
    return res.status(401).type('html').send('<h1>401 — нужен е ключ</h1>');
  }
  const items = await store.recent(100);
  res.type('html').send(renderList(items));
});

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'cs-anticheat', reports: DATA_DIR }));

app.listen(PORT, () => {
  console.log(`CS Anticheat backend слуша на :${PORT}`);
  if (!SECRET) console.warn('⚠ CSAC_SECRET не е зададена — HMAC проверката е ИЗКЛЮЧЕНА (само за dev).');
});
