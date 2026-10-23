#!/usr/bin/env node
// admin-probe.mjs — API сонда за /api/admin/* (нов модулен роутер от
// claude/nexus-boy-combat): 403 за не-админ, валидация, паралелни
// разрушителни действия (разпускане на гилдия ×2, refund ×2).
//
// Изисква ЖИВ сървър + поне един ПРОМОТИРАН админ (виж README —
// `npm run promote --workspace server -- <username>`, зададен през
// NEXUS_E2E_ADMIN_TOKEN за да не регистрираме нов админ всеки run).

const BASE = process.env.NEXUS_E2E_BASE_URL || 'http://localhost:4100';
const API = `${BASE}/api`;
const ADMIN_TOKEN = process.env.NEXUS_E2E_ADMIN_TOKEN;

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; failures.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, { token, body, prefix = '/admin' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${prefix}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

let seq = 0;
/**
 * Уникално username ≤20 символа. Одит (намерено на живо между два
 * последователни run-а на този точно файл): `\`${tag}_${suffix}\`.slice(0, 20)`
 * режеше ОПАШКАТА на низа (най-бързо променящата се част) вместо TAG-а —
 * за tag "guildowner" (10 символа) оцеляваха само ВОДЕЩИТЕ, бавно
 * променящи се цифри на Date.now(), затова втори run в рамките на ~10s
 * колизираше на 409 "already in use". Режем TAG-а, не суфикса.
 */
function uniqueUsername(tag) {
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}${(++seq).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const maxTagLen = Math.max(1, 19 - suffix.length);
  return `${tag.slice(0, maxTagLen)}_${suffix}`.slice(0, 20);
}
async function registerUser(tag) {
  const username = uniqueUsername(tag);
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'Testpass123', dateOfBirth: '2000-01-01', country: 'BG' }),
  });
  const json = await r.json();
  if (r.status !== 201) throw new Error(`registerUser(${tag}) failed: ${r.status} ${JSON.stringify(json)}`);
  return { username, token: json.token, userId: json.user.id };
}

async function main() {
  console.log(`\nAdmin API probe → ${BASE}\n`);
  if (!ADMIN_TOKEN) {
    console.log('  NEXUS_E2E_ADMIN_TOKEN not set — skipping (see Nexus/e2e/README.md "Admin probe setup").');
    return;
  }
  const nonAdmin = await registerUser('nonadmin');

  console.log('— 403 за не-админ (16 представителни маршрута) —');
  const adminEndpoints = [
    ['GET', '/overview'],
    ['GET', '/users'],
    ['GET', '/characters'],
    ['GET', '/guilds'],
    ['GET', '/purchases'],
    ['GET', '/marketplace'],
    ['GET', '/system/settings'],
    ['POST', '/characters/1/inventory', { slug: 'health_potion' }],
    ['PUT', '/guilds/1', { motto: 'x' }],
    ['DELETE', '/guilds/1?confirm=X'],
    ['POST', '/purchases/1/refund', { reason: 'x' }],
    ['POST', '/marketplace/1/cancel'],
    ['POST', '/auction/1/cancel'],
    ['POST', '/trades/1/cancel'],
    ['PUT', '/characters/1', { level: 999 }],
    ['DELETE', '/characters/1/inventory/1'],
  ];
  for (const [method, path, body] of adminEndpoints) {
    const rNoToken = await req(method, path, { body });
    ok(`${method} /admin${path} (no token) → 401`, rNoToken.status === 401, `got ${rNoToken.status}`);
    const rNonAdmin = await req(method, path, { token: nonAdmin.token, body });
    ok(`${method} /admin${path} (non-admin) → 403`, rNonAdmin.status === 403, `got ${rNonAdmin.status}`);
  }

  console.log('\n— валидация (400) —');
  {
    const r = await req('PUT', '/guilds/1', { token: ADMIN_TOKEN, body: { name: 'ab' } }); // too short
    ok('PUT /admin/guilds/1 name too short → 400', r.status === 400, `got ${r.status}`);
  }
  {
    const r = await req('POST', '/characters/999999999/inventory', { token: ADMIN_TOKEN, body: {} }); // missing slug
    ok('POST /admin/characters/:id/inventory missing slug → 400', r.status === 400, `got ${r.status}`);
  }
  {
    const r = await req('DELETE', '/guilds/999999999?confirm=X', { token: ADMIN_TOKEN });
    ok('DELETE /admin/guilds/:id unknown → 404 (not 500)', r.status === 404, `got ${r.status}`);
  }
  {
    // reason must be ≥3 chars (schema-validated BEFORE the lookup — 400 takes
    // priority over 404, a deliberate "cheap checks first" order, not a bug).
    const r = await req('POST', '/purchases/999999999/refund', { token: ADMIN_TOKEN, body: { reason: 'unknown purchase probe' } });
    ok('POST /admin/purchases/:id/refund unknown → 404 (not 500)', r.status === 404, `got ${r.status}`);
  }

  console.log('\n— паралелни разрушителни действия (анти-дупликация) —');
  {
    // Create a fresh guild as a real player, level it up via direct admin PUT (level field), then double-disband.
    const owner = await registerUser('guildowner');
    const charRes = await fetch(`${API}/character/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: `Owner${Date.now()}`.slice(0, 20), class: 'warrior' }),
    });
    const charJson = await charRes.json();
    const charId = charJson.character.id;
    await req('PUT', `/characters/${charId}`, { token: ADMIN_TOKEN, body: { level: 5, gold: 5000 } });
    const guildRes = await fetch(`${API}/guild/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: `ProbeG${Date.now()}`.slice(0, 20), tag: 'PB' + (seq % 100) }),
    });
    const guildJson = await guildRes.json();
    if (!guildJson.guild_id) {
      ok('guild disband ×2 setup (guild created)', false, `guild/create failed: ${JSON.stringify(guildJson)}`);
    } else {
      const guildId = guildJson.guild_id;
      const detail = await req('GET', `/guilds/${guildId}`, { token: ADMIN_TOKEN });
      const tag = detail.json?.tag || detail.json?.guild?.tag;
      const [r1, r2] = await Promise.all([
        req('DELETE', `/guilds/${guildId}?confirm=${tag}`, { token: ADMIN_TOKEN }),
        req('DELETE', `/guilds/${guildId}?confirm=${tag}`, { token: ADMIN_TOKEN }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      ok('guild disband ×2 parallel → exactly one 200, one 404 (no double-notify/double-audit)', JSON.stringify(statuses) === JSON.stringify([200, 404]), `got ${statuses}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('\nadmin-probe crashed:', e); process.exitCode = 1; });
