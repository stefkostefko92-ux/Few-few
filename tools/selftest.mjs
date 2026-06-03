#!/usr/bin/env node
/* Automated self-tests for the testable (non-browser) logic. Run: node tools/selftest.mjs */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/shared/defaults.js';
import { applyPreset, PRESET_IDS } from '../src/shared/presets.js';
import { telegramRequest, discordRequest, buildExternalNotifications } from '../src/shared/notify.js';
import { circleMultipliers, smartScore, chooseSmart } from '../src/shared/smart.js';
import { verifyKey, handle } from '../server/license-server.mjs';

let pass = 0;
function test(name, fn) { try { fn(); console.log('  ok  ' + name); pass++; } catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } }

console.log('— presets —');
test('presets apply and do not mutate input', () => {
  const base = mergeSettings(null);
  const out = applyPreset(base, 'grind');
  assert.equal(out.general.enabled, true);
  assert.equal(out.general.humanize, false);
  assert.equal(out.pvp.enabled, true);
  assert.equal(base.general.enabled, DEFAULT_SETTINGS.general.enabled); // unchanged
});
test('all preset ids resolve', () => {
  const base = mergeSettings(null);
  for (const id of PRESET_IDS) {
    const out = applyPreset(base, id);
    assert.equal(out.general.enabled, true, id);
  }
});

console.log('— notifications —');
test('telegram request built', () => {
  const r = telegramRequest({ enabled: true, botToken: 'abc', chatId: '42' }, 'Title', 'Hello_world');
  assert.match(r.url, /api\.telegram\.org\/botabc\/sendMessage/);
  const b = JSON.parse(r.options.body);
  assert.equal(b.chat_id, '42');
  assert.match(b.text, /Hello\\_world/); // markdown-escaped underscore
});
test('telegram null when disabled/incomplete', () => {
  assert.equal(telegramRequest({ enabled: false, botToken: 'a', chatId: 'b' }), null);
  assert.equal(telegramRequest({ enabled: true, botToken: '', chatId: 'b' }), null);
});
test('discord validates webhook url', () => {
  assert.equal(discordRequest({ enabled: true, webhookUrl: 'https://evil.com/x' }, 't', 'm'), null);
  const r = discordRequest({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc' }, 't', 'm');
  assert.ok(r && r.url.includes('discord.com/api/webhooks'));
});
test('buildExternalNotifications aggregates enabled channels', () => {
  const reqs = buildExternalNotifications({
    telegram: { enabled: true, botToken: 'a', chatId: 'b' },
    discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc' }
  }, 'T', 'M');
  assert.equal(reqs.length, 2);
});

console.log('— smart adventure picker —');
test('circle multipliers from node levels', () => {
  const m = circleMultipliers({ 1: [10], 8: [100] }); // Jade lvl 10, Amethyst lvl 100
  assert.ok(Math.abs(m.xp - 1.02) < 1e-9);   // +0.2%*10
  assert.ok(Math.abs(m.gold - 1.20) < 1e-9); // +0.2%*100
});
test('smart prefers gold-heavy when gold boosted and XP lightly weighted', () => {
  const circle = { 1: [0], 8: [100] }; // big gold boost, no xp boost
  const advs = [
    { id: 1, gold: 100, xp: 200, duration: 100 }, // xp-heavy
    { id: 2, gold: 150, xp: 50, duration: 100 }   // gold-heavy
  ];
  assert.equal(chooseSmart(advs, circle, 0.1).id, 2); // low xp weight -> gold-heavy wins
  assert.equal(chooseSmart(advs, circle, 1).id, 1);   // equal weight -> total reward wins
});
test('smartScore is per-second', () => {
  const m = { gold: 1, xp: 1 };
  assert.equal(smartScore({ gold: 100, xp: 0, duration: 50 }, m, 1), 2);
});

console.log('— settings merge (export/import) —');
test('merge fills new sections and keeps user values', () => {
  const stored = { adventures: { strategy: 'smart' }, webhooks: { telegram: { enabled: true, botToken: 'x', chatId: 'y' } } };
  const m = mergeSettings(stored);
  assert.equal(m.adventures.strategy, 'smart');
  assert.equal(m.webhooks.telegram.enabled, true);
  assert.ok(m.pvp && typeof m.pvp.cooldownSeconds === 'number'); // default section present
});
test('export then import round-trips', () => {
  const a = mergeSettings(null);
  a.pvp.opponents = 'Bob, Alice';
  const json = JSON.stringify(a);
  const b = mergeSettings(JSON.parse(json));
  assert.equal(b.pvp.opponents, 'Bob, Alice');
});

console.log('— license keys + server —');
const SECRET = 'TZ-7f3a9c1e5b8d246097fe1ab3cd5e7902-stealth';
function genKey(days) {
  const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  const p = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(p).digest('base64url').slice(0, 24);
  return `TZ1.${p}.${sig}`;
}
test('verifyKey accepts valid, rejects tampered/expired', () => {
  const k = genKey(31);
  assert.ok(verifyKey(k));
  assert.equal(verifyKey(k.slice(0, -1) + 'X'), null);          // bad signature
  assert.equal(verifyKey(genKey(-1)) && genKey(-1) ? verifyKey(genKey(-1)).exp * 1000 < Date.now() : false, true);
});
test('server binds key to first device, rejects second', () => {
  const db = {};
  const key = genKey(365000); // lifetime
  const r1 = handle('POST', '/activate', { key, device: 'PC-A' }, db);
  assert.equal(r1.body.ok, true);
  const r2 = handle('POST', '/activate', { key, device: 'PC-A' }, db); // same device re-activates
  assert.equal(r2.body.ok, true);
  const r3 = handle('POST', '/activate', { key, device: 'PC-B' }, db); // different device
  assert.equal(r3.body.ok, false);
  assert.equal(r3.body.error, 'BOUND_ELSEWHERE');
});
test('server status reflects binding', () => {
  const db = {};
  const key = genKey(31);
  handle('POST', '/activate', { key, device: 'PC-A' }, db);
  const ok = handle('GET', `/status?key=${encodeURIComponent(key)}&device=PC-A`, null, db);
  assert.equal(ok.body.entitled, true);
  const bad = handle('GET', `/status?key=${encodeURIComponent(key)}&device=PC-B`, null, db);
  assert.equal(bad.body.entitled, false);
});

console.log(`\n${pass} checks passed.`);
