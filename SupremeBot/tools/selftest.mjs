#!/usr/bin/env node
/* Automated self-tests for the testable (non-browser) logic. Run: node tools/selftest.mjs */
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/shared/defaults.js';
import { applyPreset, PRESET_IDS } from '../src/shared/presets.js';
import { telegramRequest, discordRequest, buildExternalNotifications } from '../src/shared/notify.js';
import { circleMultipliers, smartScore, chooseSmart } from '../src/shared/smart.js';
import { verifyKey, handle, setPublicKey, SHIPPED_PUBLIC_KEY } from '../server/license-server.mjs';
import { LICENSE_PUBLIC_KEY } from '../src/shared/payment.js';
import { execSync } from 'node:child_process';
import { DOMParser as LinkedomParser } from 'linkedom';
import { validateConfig, normalizeAccount, enabledAccounts, accountSettings } from '../controller/lib/config.mjs';
import { accountView, renderDashboardHtml, dashboardResponse } from '../controller/lib/dashboard.mjs';

let pass = 0;
function test(name, fn) { try { fn(); console.log('  ok  ' + name); pass++; } catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } }

console.log('- presets -');
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

console.log('- notifications -');
test('telegram request built (plain text)', () => {
  const r = telegramRequest({ enabled: true, botToken: 'abc', chatId: '42' }, 'Title', 'Hello_world');
  assert.match(r.url, /api\.telegram\.org\/botabc\/sendMessage/);
  const b = JSON.parse(r.options.body);
  assert.equal(b.chat_id, '42');
  assert.equal(b.text, 'Title\nHello_world');   // plain text, no markdown/parse_mode
  assert.equal(b.parse_mode, undefined);
});
test('telegram null when disabled/incomplete', () => {
  assert.equal(telegramRequest({ enabled: false, botToken: 'a', chatId: 'b' }), null);
  assert.equal(telegramRequest({ enabled: true, botToken: '', chatId: 'b' }), null);
});
test('discord validates webhook url', () => {
  assert.equal(discordRequest({ enabled: true, webhookUrl: 'https://evil.com/x' }, 't', 'm'), null);
  assert.equal(discordRequest({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/notnumeric/x' }, 't', 'm'), null);
  const r = discordRequest({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc' }, 't', 'm');
  assert.ok(r && r.url.includes('discord.com/api/webhooks'));
});
test('discord builds a rich embed with level colour + fields + thread + mentions', () => {
  const r = discordRequest({
    enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc',
    username: 'MyBot', avatarUrl: 'https://x/a.png', threadId: '999',
    mention: '<@&42> <@7> @here', footer: 'ftr'
  }, 'Level up', 'Reached 12', 'success', [{ name: 'Level', value: '12', inline: true }]);
  const body = JSON.parse(r.options.body);
  assert.ok(r.url.endsWith('?thread_id=999'), 'thread_id appended');
  assert.equal(body.username, 'MyBot');
  assert.equal(body.avatar_url, 'https://x/a.png');
  assert.equal(body.content, '<@&42> <@7> @here');
  assert.deepEqual(body.allowed_mentions.roles, ['42']);
  assert.deepEqual(body.allowed_mentions.users, ['7']);
  assert.ok(body.allowed_mentions.parse.includes('everyone'));
  const e = body.embeds[0];
  assert.equal(e.color, 0x2ecc71);            // success -> green
  assert.equal(e.title, 'Level up');
  assert.equal(e.description, 'Reached 12');
  assert.equal(e.footer.text, 'ftr');
  assert.equal(e.thumbnail.url, 'https://x/a.png');
  assert.equal(e.fields[0].name, 'Level');
  assert.ok(typeof e.timestamp === 'string');
});
test('discord default suppresses all mentions and defaults username', () => {
  const r = discordRequest({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc' }, 't', 'm', 'error');
  const body = JSON.parse(r.options.body);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.equal(body.username, 'Tanoth Bot');
  assert.equal(body.embeds[0].color, 0xe74c3c);   // error -> red
  assert.equal(body.content, undefined);
});
test('discord plain-text fallback when embeds off', () => {
  const r = discordRequest({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc', useEmbeds: false }, 'T', 'M');
  const body = JSON.parse(r.options.body);
  assert.equal(body.embeds, undefined);
  assert.ok(body.content.includes('**T**') && body.content.includes('M'));
});
test('buildExternalNotifications aggregates enabled channels', () => {
  const reqs = buildExternalNotifications({
    telegram: { enabled: true, botToken: 'a', chatId: 'b' },
    discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/abc' }
  }, 'T', 'M');
  assert.equal(reqs.length, 2);
});

console.log('- smart adventure picker -');
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

console.log('- settings merge (export/import) -');
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

console.log('- license keys + server -');
// A throw-away key pair for the tests: the real private key never exists in the repo.
const seller = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const attacker = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
setPublicKey(seller.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'));
function genKey(days, signer = seller.privateKey) {
  const exp = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
  const p = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(p), { key: signer, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `TZ2.${p}.${sig}`;
}
test('licence: a key signed with any other private key is rejected (no minting from the code)', () => {
  assert.equal(verifyKey(genKey(365000, attacker.privateKey)), null);
  assert.equal(verifyKey('TZ1.eyJleHAiOjMzMzE5MTYwOTc4fQ.4aVy1g5IxgYfI_ZWzw3ATwUt'), null, 'old HMAC keys are dead');
});
test('licence: the server ships the same public key as the extension', () => {
  assert.equal(SHIPPED_PUBLIC_KEY, LICENSE_PUBLIC_KEY);
});
test('licence: no private key is tracked anywhere in the repository', () => {
  // A real PEM block = the marker followed by base64 body (not a detector regex).
  const pem = new RegExp('-----BEGIN (EC )?' + 'PRIVATE KEY-----\\s*\\n[A-Za-z0-9+/]{40,}');
  const root = new URL('..', import.meta.url).pathname;
  const files = execSync('git ls-files', { cwd: root }).toString().split('\n').filter(Boolean);
  const hits = files.filter((f) => { try { return pem.test(fs.readFileSync(root + f, 'utf8')); } catch (_) { return false; } });
  assert.deepEqual(hits, [], `private key material tracked in git: ${hits.join(', ')}`);
});
test('verifyKey accepts valid, rejects tampered/expired', () => {
  const k = genKey(31);
  assert.ok(verifyKey(k));
  // Flip the last sig char to a DIFFERENT one (it may already be 'X').
  const parts = k.split('.');
  const otherPayload = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url');
  assert.equal(verifyKey(`${parts[0]}.${otherPayload}.${parts[2]}`), null);   // tampered payload
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
test('server unbind releases the device binding (admin only)', () => {
  const db = {};
  const key = genKey(365000);
  handle('POST', '/activate', { key, device: 'PC-A' }, db);
  // wrong admin token refused; /unbind disabled when no token is configured
  assert.equal(handle('POST', '/unbind', { key, admin: 'wrong' }, db, 'sekret').status, 403);
  assert.equal(handle('POST', '/unbind', { key, admin: 'sekret' }, db, '').status, 403);
  // correct token unbinds and the key re-binds on a new device
  const un = handle('POST', '/unbind', { key, admin: 'sekret' }, db, 'sekret');
  assert.equal(un.body.ok, true);
  assert.equal(un.dirty, true);
  const r = handle('POST', '/activate', { key, device: 'PC-B' }, db);
  assert.equal(r.body.ok, true);
});

test('server: a key with stray spaces or a trailing newline is the SAME key (no extra bindings), device must be a string', () => {
  const db = {};
  const key = genKey(365000);
  assert.equal(handle('POST', '/activate', { key, device: 'PC-A' }, db).body.ok, true);
  assert.equal(handle('POST', '/activate', { key: ' ' + key, device: 'PC-B' }, db).body.error, 'BOUND_ELSEWHERE');
  assert.equal(handle('POST', '/activate', { key: key + '\n', device: 'PC-C' }, db).body.error, 'BOUND_ELSEWHERE');
  assert.equal(Object.keys(db).length, 1, 'exactly one binding');
  assert.equal(handle('POST', '/activate', { key: genKey(31), device: { evil: 1 } }, {}).body.error, 'NO_DEVICE');
});
test('server: a malformed URL is a 400, not a crash', () => {
  assert.equal(handle('GET', 'http://[', null, {}).status, 400);
});

console.log('- multi-account controller -');
test('dashboard: a hostile account id or token cannot break out (XSS)', () => {
  const id = "x');alert(1);//\"<b>";
  const html = renderDashboardHtml([accountView({ account: { id, label: id, world: 'https://w' }, status: 'stopped', lastStats: {} })], { token: 'a</script><script>alert(2)//' });
  // The token never closes the inline script early.
  assert.equal(html.split('</script>').length - 1, 1, 'exactly one closing script tag');
  // Every Start/Stop onclick decodes to ctl('<verb>', <one JSON string literal>).
  const doc = new LinkedomParser().parseFromString(html, 'text/html');
  const clicks = [...doc.querySelectorAll('[onclick]')].map((b) => b.getAttribute('onclick'));
  assert.ok(clicks.length >= 2);
  for (const c of clicks) assert.match(c, /^ctl\('(start|stop)',("(?:[^"\\]|\\.)*")\)$/, c);
  for (const c of clicks) assert.equal(JSON.parse(c.match(/,(".*")\)$/)[1]), id, 'the id arrives intact as data');
});

test('validateConfig accepts good config, normalizes defaults', () => {
  const r = validateConfig({ browser: { proxyDefault: '' }, accounts: [{ id: 'a', world: 'https://x/game' }] });
  assert.equal(r.ok, true);
  assert.equal(r.accounts[0].profileDir, './profiles/a');
  assert.equal(r.accounts[0].enabled, true);
});
test('validateConfig flags missing world, dup id, bad proxy', () => {
  const r = validateConfig({ accounts: [
    { id: 'a', world: 'https://x' },
    { id: 'a', world: 'https://y' },          // dup
    { id: 'b' },                               // missing world
    { id: 'c', world: 'https://z', proxy: 'nope' } // bad proxy
  ] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate/.test(e)));
  assert.ok(r.errors.some((e) => /missing "world"/.test(e)));
  assert.ok(r.errors.some((e) => /proxy/.test(e)));
});
test('enabledAccounts filters disabled and by id', () => {
  const r = validateConfig({ accounts: [
    { id: 'a', world: 'u', enabled: true },
    { id: 'b', world: 'u', enabled: false }
  ] });
  assert.deepEqual(enabledAccounts(r).map((a) => a.id), ['a']);
  assert.deepEqual(enabledAccounts(r, 'b').map((a) => a.id), []);
});
test('dashboard view + html render', () => {
  const v = accountView({ account: { id: 'a', label: 'Main', proxy: '' }, status: 'running', startedAt: Date.now() - 120000, lastStats: { adventures: 5, goldEarned: 1500 } });
  assert.equal(v.label, 'Main');
  assert.equal(v.adventures, 5);
  assert.equal(v.uptimeMin, 2);
  const html = renderDashboardHtml([v], { token: 't' });
  assert.ok(html.includes('Main'));
  assert.ok(html.includes('1.5k'));
});

test('accountSettings overlays partial + forces auto-start', () => {
  const s = accountSettings({ adventures: { enabled: true, strategy: 'smart' } });
  assert.equal(s.general.enabled, true);
  assert.equal(s.general.startOnLoad, true);
  assert.equal(s.adventures.strategy, 'smart');
  assert.ok(s.pvp && typeof s.pvp.cooldownSeconds === 'number'); // defaults filled
});

test('dashboardResponse: token + CSRF + routing', () => {
  const base = { token: 'secret', views: [{ id: 'a', label: 'A' }], render: () => '<html>' };
  // missing / wrong token
  assert.equal(dashboardResponse({ ...base, method: 'GET', pathname: '/', query: {} }).status, 401);
  assert.equal(dashboardResponse({ ...base, method: 'GET', pathname: '/', query: { token: 'nope' } }).status, 401);
  // status JSON
  const st = dashboardResponse({ ...base, method: 'GET', pathname: '/api/status', query: { token: 'secret' } });
  assert.equal(st.status, 200); assert.ok(st.body.includes('"id":"a"'));
  // cross-origin POST blocked
  const evil = dashboardResponse({ ...base, method: 'POST', pathname: '/api/start', query: { token: 'secret', id: 'a' }, origin: 'https://evil.com' });
  assert.equal(evil.status, 403);
  // local POST -> action
  const ok = dashboardResponse({ ...base, method: 'POST', pathname: '/api/start', query: { token: 'secret', id: 'a' }, origin: 'http://127.0.0.1:8899' });
  assert.equal(ok.status, 200); assert.equal(ok.action, 'start'); assert.equal(ok.id, 'a');
  // no Origin (curl/same-process) allowed
  assert.equal(dashboardResponse({ ...base, method: 'POST', pathname: '/api/stop', query: { token: 'secret', id: 'a' } }).action, 'stop');
  // default -> html
  assert.equal(dashboardResponse({ ...base, method: 'GET', pathname: '/', query: { token: 'secret' } }).contentType, 'text/html');
});

console.log(`\n${pass} checks passed.`);
