#!/usr/bin/env node
/**
 * Tanoth Bot license server (optional, for true one-computer enforcement).
 *
 * A tiny dependency-free HTTP server that records which device id first claimed
 * each license key, so a lifetime key cannot be activated on a second computer.
 * Deploy anywhere Node runs (or port the handler to a Cloudflare Worker), set
 * LICENSE_SERVER_URL in src/shared/payment.js to its /activate URL, and add the
 * host to the extension's host_permissions.
 *
 *   POST /activate  {key, device} -> {ok, exp} | {ok:false, error}
 *   GET  /status?key=&device=     -> {ok, entitled, exp}
 *
 * Keys are verified with the SAME LICENSE_SECRET as the extension; bindings are
 * persisted to bindings.json next to this file.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'TZ-7f3a9c1e5b8d246097fe1ab3cd5e7902-stealth';
const LICENSE_PREFIX = 'TZ1';
const PORT = process.env.PORT || 8787;
const DB_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bindings.json');

function loadDb() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return {}; } }
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function b64urlToBuf(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

export function verifyKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null;
  const [, payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('base64url').slice(0, 24);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
    if (typeof payload.exp !== 'number') return null;
    return payload;
  } catch { return null; }
}

// Pure handler (also used by tests). db is mutated; returns {status, body}.
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
    return reply(200, { ok: true, exp: payload.exp });
  }
  if (method === 'GET' && u.pathname === '/status') {
    const key = u.searchParams.get('key');
    const device = u.searchParams.get('device');
    const payload = verifyKey(key);
    if (!payload) return reply(400, { ok: false, error: 'INVALID_KEY' });
    const rec = db[key];
    const entitled = !!rec && rec.device === device && rec.exp * 1000 > Date.now();
    return reply(200, { ok: true, entitled, exp: payload.exp });
  }
  return reply(404, { ok: false, error: 'NOT_FOUND' });
}
function reply(status, body) { return { status, body }; }

// HTTP wrapper (skipped when imported for tests).
function startServer() {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => {
      const db = loadDb();
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch {}
      const { status, body: out } = handle(req.method, req.url, body, db);
      saveDb(db);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
  });
  server.listen(PORT, () => console.log(`[license-server] listening on :${PORT}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer();
}
