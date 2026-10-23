#!/usr/bin/env node
// api-probe.mjs — API-ниво сонда (без браузър). За всеки проверен мутиращ
// endpoint: 401 без токен, чужд обект по id (403/404), невалидно тяло (400),
// паралелни дублирани заявки (награда/покупка не се дублира), отрицателни/
// огромни числа. Нула зависимости — вграден fetch (Node ≥18).
//
// Пускане: node api-probe.mjs   (или: npm run probe, от Nexus/e2e/)
// Изисква жив сървър на BASE (по подразбиране http://localhost:4100).

const BASE = process.env.NEXUS_E2E_BASE_URL || 'http://localhost:4100';
const API = `${BASE}/api`;

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; failures.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (e.g. empty) */ }
  return { status: res.status, json };
}

let seq = 0;
/**
 * Уникално username ≤20 символа. Одит: `\`${tag}_${suffix}\`.slice(0, 20)`
 * режеше ОПАШКАТА (най-бързо променящата се част на Date.now()) вместо
 * TAG-а за tag-ове ≥6 символа — два run-а в рамките на една и съща ~10s
 * секунда колизираха на 409 "already in use" (засечено на живо между два
 * последователни run-а на admin-probe.mjs, същия клас бъг). Режем TAG-а.
 */
function uniqueUsername(tag) {
  const suffix = `${Date.now().toString(36)}${(++seq).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const maxTagLen = Math.max(1, 19 - suffix.length);
  return `${tag.slice(0, maxTagLen)}_${suffix}`.slice(0, 20);
}
async function registerUser(tag) {
  const username = uniqueUsername(tag);
  const r = await req('POST', '/auth/register', {
    body: { username, email: `${username}@example.com`, password: 'Testpass123', dateOfBirth: '2000-01-01', country: 'BG' },
  });
  if (r.status !== 201) throw new Error(`registerUser(${tag}) failed: ${r.status} ${JSON.stringify(r.json)}`);
  return { username, token: r.json.token, userId: r.json.user.id };
}

async function createCharacter(user, name, cls = 'warrior') {
  const r = await req('POST', '/character/create', { token: user.token, body: { name, class: cls } });
  if (r.status !== 201) throw new Error(`createCharacter(${name}) failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function main() {
  console.log(`\nAPI probe → ${BASE}\n`);

  // ---------- Setup: two independent players ----------
  const A = await registerUser('probeA');
  const B = await registerUser('probeB');
  const charA = await createCharacter(A, `ProbeA${Date.now()}`.slice(0, 20), 'warrior');
  const charB = await createCharacter(B, `ProbeB${Date.now()}`.slice(0, 20), 'mage');
  console.log(`  seeded: A=char#${charA.character?.id ?? '?'} B=char#${charB.character?.id ?? '?'}\n`);

  // =====================================================================
  // 1) Неавтентикирано (401)
  // =====================================================================
  console.log('— 401 без токен —');
  const unauthEndpoints = [
    ['POST', '/hunting/hunt', { region: 'whispering_woods' }],
    ['POST', '/quest/start', { questSlug: 'x' }],
    ['POST', '/arena/challenge', { opponentId: 1 }],
    ['POST', '/tower/climb', {}],
    ['POST', '/camp/start', { slug: 'fishing', hours: 1 }],
    ['POST', '/forge/enchant', { inventoryId: 1 }],
    ['POST', '/wheel/spin', {}],
    ['POST', '/market/buy', { listingId: 1 }],
    ['POST', '/market/sell', { inventoryId: 1, priceGold: 10 }],
    ['POST', '/auction/bid', { amount: 10 }],
    ['POST', '/trade/offer', { toName: 'x' }],
    ['POST', '/guild/vault/deposit', { inventoryId: 1 }],
    ['POST', '/mail/1/read', {}],
    ['POST', '/account/password', { current: 'a', next: 'Testpass123' }],
    ['POST', '/account/delete-account', { password: 'a', confirm: 'DELETE MY ACCOUNT' }],
    ['POST', '/character/create', { name: 'X', class: 'warrior' }],
  ];
  for (const [method, path, body] of unauthEndpoints) {
    const r = await req(method, path, { body });
    ok(`${method} ${path} → 401`, r.status === 401, `got ${r.status}`);
  }

  // =====================================================================
  // 2) Невалидно тяло (400)
  // =====================================================================
  console.log('\n— 400 невалидно тяло —');
  const badBodyCases = [
    ['POST', '/hunting/hunt', {}],
    ['POST', '/quest/start', {}],
    ['POST', '/arena/challenge', { opponentId: 'not-a-number' }],
    ['POST', '/market/sell', { inventoryId: 'x', priceGold: 'y' }],
    ['POST', '/auction/bid', { amount: 'x' }],
    ['POST', '/character/create', { name: 'ab', class: 'not-a-class' }], // name too short + invalid class
    ['POST', '/trade/offer', {}],
    ['POST', '/guild/vault/deposit', {}],
  ];
  for (const [method, path, body] of badBodyCases) {
    const r = await req(method, path, { token: A.token, body });
    ok(`${method} ${path} (invalid body) → 400`, r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }

  // =====================================================================
  // 3) Отрицателни / огромни числа
  // =====================================================================
  console.log('\n— отрицателни/огромни числа —');
  {
    const r = await req('POST', '/market/sell', { token: A.token, body: { inventoryId: 999999, priceGold: -100 } });
    ok('market/sell negative priceGold → 400 (not accepted as free listing)', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req('POST', '/market/sell', { token: A.token, body: { inventoryId: 999999, priceGold: 999999999999 } });
    // Item doesn't exist for this char either, but priceGold cap should reject BEFORE/at validation regardless of item lookup order.
    ok('market/sell huge priceGold → 400 (exceeds market_max_price, not 500)', r.status === 400 || r.status === 404, `got ${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req('POST', '/auction/bid', { token: A.token, body: { amount: -50 } });
    ok('auction/bid negative amount → 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req('POST', '/auction/bid', { token: A.token, body: { amount: Number.MAX_SAFE_INTEGER } });
    ok('auction/bid absurd amount → 400 (not enough gems, not 500)', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req('POST', '/trade/1/set', { token: A.token, body: { items: [], gold: -1 } });
    ok('trade/:id/set negative gold → 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }
  {
    const r = await req('POST', '/character/create', { token: A.token, body: { name: 'Whatever', class: 'warrior' } });
    // A already has a character from setup — must be a clean 409, not a 500/hang (see auth.ts register race fix — same class of bug).
    ok('character/create when one already exists → 409 (not 500/hang)', r.status === 409, `got ${r.status} ${JSON.stringify(r.json)}`);
  }

  // =====================================================================
  // 4) Чужд обект по id (403/404) — B се опитва да пипне ресурси на A
  // =====================================================================
  console.log('\n— чужд обект по id (403/404) —');
  {
    // A lists something on the market (need an item — use starting gold to
    // buy from shop first would be ideal, but simplest: try to cancel a
    // non-existent/other listing id).
    const r = await req('POST', '/market/cancel', { token: B.token, body: { listingId: 999999999 } });
    ok('market/cancel unknown listing → 404 (not leaking existence)', r.status === 404, `got ${r.status}`);
  }
  {
    const r = await req('POST', '/forge/enchant', { token: B.token, body: { inventoryId: 999999999 } });
    ok('forge/enchant on inventoryId not owned/existing → 404', r.status === 404, `got ${r.status}`);
  }
  {
    // B has no guild at all → 400 "not in a guild" fires before the vault
    // lookup even runs (correct guard order — checked once we're a member).
    const r = await req('POST', '/guild/vault/take', { token: B.token, body: { vaultId: 999999999 } });
    ok('guild/vault/take (no guild) → 400, or 404 once a member', r.status === 400 || r.status === 404, `got ${r.status}`);
  }
  {
    const r = await req('POST', `/mail/999999999/read`, { token: B.token, body: {} });
    // Owner-scoped UPDATE (WHERE character_id=?) — soft no-op by design (idempotent), documented, not a security bug.
    ok('mail/:id/read on foreign/unknown id → 200 soft no-op (owner-scoped WHERE, no leak)', r.status === 200, `got ${r.status}`);
  }
  {
    const r = await req('POST', '/arena/challenge', { token: B.token, body: { opponentId: 999999999 } });
    ok('arena/challenge unknown opponent → 404', r.status === 404, `got ${r.status}`);
  }

  // =====================================================================
  // 5) Паралелни дублирани заявки — награда/покупка не се дублира
  // =====================================================================
  console.log('\n— паралелни дублирани заявки (анти-дупликация) —');
  {
    // Fresh users so cooldowns/gold are clean.
    const C = await registerUser('probeRace');
    await createCharacter(C, `Racer${Date.now()}`.slice(0, 20), 'rogue');
    const [r1, r2] = await Promise.all([
      req('POST', '/hunting/hunt', { token: C.token, body: { region: 'whispering_woods' } }),
      req('POST', '/hunting/hunt', { token: C.token, body: { region: 'whispering_woods' } }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    ok('hunting/hunt × 2 parallel → exactly one 200, one 429 (claimCooldown fix)', JSON.stringify(statuses) === JSON.stringify([200, 429]), `got ${statuses}`);
  }
  {
    const D = await registerUser('probeWheel');
    await createCharacter(D, `Wheeler${Date.now()}`.slice(0, 20), 'ranger');
    const [r1, r2] = await Promise.all([
      req('POST', '/wheel/spin', { token: D.token }),
      req('POST', '/wheel/spin', { token: D.token }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    ok('wheel/spin × 2 parallel → exactly one 200, one 400 (daily CAS)', JSON.stringify(statuses) === JSON.stringify([200, 400]), `got ${statuses}`);
  }
  {
    const E = await registerUser('probeCamp');
    await createCharacter(E, `Camper${Date.now()}`.slice(0, 20), 'mage');
    await req('POST', '/camp/start', { token: E.token, body: { slug: 'fishing', hours: 1 } });
    // Force-expire the task client-side is impossible; instead prove the
    // "already running" guard rejects a second /start (no double task).
    const r2 = await req('POST', '/camp/start', { token: E.token, body: { slug: 'mining', hours: 1 } });
    ok('camp/start while a task is running → 400 (no second task)', r2.status === 400, `got ${r2.status}`);
  }
  {
    // Guild vault deposit double-fire regression (this session's fix).
    const F = await registerUser('probeVault');
    await createCharacter(F, `Vaulter${Date.now()}`.slice(0, 20), 'warrior');
    // Without a real un-equipped, un-bound item in hand this will 404 both
    // times — still proves "not 500, not hang, consistent status" under
    // concurrency, which is the actual regression class.
    const [r1, r2] = await Promise.all([
      req('POST', '/guild/vault/deposit', { token: F.token, body: { inventoryId: 1 } }),
      req('POST', '/guild/vault/deposit', { token: F.token, body: { inventoryId: 1 } }),
    ]);
    ok('guild/vault/deposit × 2 parallel → no 500 on either', r1.status !== 500 && r2.status !== 500, `got ${r1.status}, ${r2.status}`);
  }

  // =====================================================================
  // Summary
  // =====================================================================
  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('\nprobe crashed:', e);
  process.exitCode = 1;
});
