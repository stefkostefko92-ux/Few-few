#!/usr/bin/env node
/**
 * Tanoth Bot license server (optional, for true one-computer enforcement).
 *
 * A tiny dependency-free HTTP server that records which device id first claimed
 * each license key, so a lifetime key cannot be activated on a second computer.
 * Deploy anywhere Node runs (HTTPS in front), set LICENSE_SERVER_URL in
 * src/shared/payment.js to its base URL, and add the origin to host_permissions.
 *
 *   POST /activate  {key, device} -> {ok, exp} | {ok:false, error}
 *   GET  /status?key=&device=     -> {ok, entitled, exp}
 *
 * Env: LICENSE_SECRET (must match the extension), PORT (8787),
 *      LICENSE_DB (path to bindings.json), LICENSE_ALLOW_ORIGIN (CORS origin).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'TZ-b0d6632a1a185b2714f94eee965390232c763380df811d59-stealth';
const LICENSE_PREFIX = 'TZ1';
const PORT = process.env.PORT || 8787;
const DB_FILE = process.env.LICENSE_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'bindings.json');
const ALLOW_ORIGIN = process.env.LICENSE_ALLOW_ORIGIN || '';

function b64urlToBuf(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function verifyKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
  const [, payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('base64url').slice(0, 24);
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
    if (typeof payload.exp !== 'number') return null;
    return payload;
  } catch { return null; }
}

// Pure handler (also used by tests). Mutates db; returns {status, body, dirty}.
export function handle(method, url, body, db) {
  const u = new URL(url, 'http://x');
  if (method === 'POST' && u.pathname === '/activate') {
    const { key, device } = body || {};
    const payload = verifyKey(key);
    if (!payload) return reply(400, { ok: false, error: 'INVALID_KEY' });
    if (payload.exp * 1000 <= Date.now()) return reply(403, { ok: false, error: 'EXPIRED_KEY' });
    if (!device) return reply(400, { ok: false, error: 'NO_DEVICE' });
    const existing = db[key];
    if (existing && existing.device !== device) return reply(409, { ok: false, error: 'BOUND_ELSEWHERE' });
    db[key] = { device, exp: payload.exp, boundAt: existing?.boundAt || Date.now() };
    return reply(200, { ok: true, exp: payload.exp }, true);   // dirty -> persist
  }
  if (method === 'GET' && u.pathname === '/status') {
    const key = u.searchParams.get('key');
    const device = u.searchParams.get('device');
    const payload = verifyKey(key);
    if (!payload) return reply(400, { ok: false, error: 'INVALID_KEY' });
    const rec = db[key];
    const entitled = !!rec && rec.device === device && rec.exp * 1000 > Date.now();
    return reply(200, { ok: true, entitled, exp: payload.exp });   // read-only, not dirty
  }
  return reply(404, { ok: false, error: 'NOT_FOUND' });
}
function reply(status, body, dirty = false) { return { status, body, dirty }; }

/* ------------------------------ server wiring --------------------------- */
function loadDb() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return {}; } }

// Serialized atomic writes (tmp file + rename) so concurrent requests can't
// corrupt or lose bindings.
let writeChain = Promise.resolve();
function persist(db) {
  writeChain = writeChain.then(() => fs.promises.writeFile(DB_FILE + '.tmp', JSON.stringify(db, null, 2))
    .then(() => fs.promises.rename(DB_FILE + '.tmp', DB_FILE)))
    .catch((e) => console.error('[license-server] persist failed:', e.message));
  return writeChain;
}

function startServer() {
  const db = loadDb();                       // single in-memory copy
  let busy = Promise.resolve();              // serialize activations
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => {
      busy = busy.then(async () => {
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch {}
        const { status, body: out, dirty } = handle(req.method, req.url, body, db);
        if (dirty) await persist(db);
        const headers = { 'Content-Type': 'application/json' };
        if (ALLOW_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOW_ORIGIN;
        res.writeHead(status, headers);
        res.end(JSON.stringify(out));
      }).catch((e) => { try { res.writeHead(500); res.end('{"ok":false}'); } catch {} console.error(e); });
    });
  });
  server.listen(PORT, () => console.log(`[license-server] listening on :${PORT} (db: ${DB_FILE})`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
