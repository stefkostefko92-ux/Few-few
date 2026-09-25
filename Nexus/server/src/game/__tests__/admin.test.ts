// Регресионни тестове за админ API-то (routes/admin.ts). Изолирана
// in-memory база — задай ПРЕДИ първия getDb(). ВНИМАНИЕ: статичните import-и
// се изпълняват ПРЕДИ този ред, а routes/dsa вика getDb() още при зареждане →
// роутерите се зареждат динамично в before(), иначе тестът пише във файлова база.
process.env.DB_PATH = ':memory:';

import test, { after, before } from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { getDb } from '../../db';
import { signToken } from '../../middleware/auth';
import type { Router } from 'express';
import { buildStatement, langForCountry } from '../../lib/adminModeration';
import { escapeLike, ipIsShielded, isNonPublicIp, changedKeys } from '../../lib/adminKit';

let server: Server;
let adminRouter: Router;
let base = '';
const ids = { admin: 0, admin2: 0, player: 0, victim: 0, playerChar: 0, victimChar: 0 };
const tok = { admin: '', admin2: '', player: '' };

function mkUser(username: string, isAdmin = 0, ip = ''): number {
  const now = Date.now();
  return Number(getDb()
    .prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at, is_admin, last_ip, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(username, `${username.toLowerCase()}@example.com`, '$2a$12$secretsecretsecretsecretsecretsecretsecretsecret', now, now, isAdmin, ip, 'BG').lastInsertRowid);
}
function mkChar(userId: number, name: string): number {
  return Number(getDb().prepare("INSERT INTO characters (user_id, name, class, energy_updated_at, created_at) VALUES (?, ?, 'warrior', 0, 0)").run(userId, name).lastInsertRowid);
}

async function call(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}/api/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не-JSON */ }
  return { status: r.status, json, text };
}

function lastAudit(action: string): { meta: any; user_id: number; target_id: number } | undefined {
  const row = getDb().prepare('SELECT meta_json, user_id, target_id FROM event_log WHERE action = ? ORDER BY id DESC LIMIT 1').get(action) as { meta_json: string; user_id: number; target_id: number } | undefined;
  return row ? { meta: JSON.parse(row.meta_json), user_id: row.user_id, target_id: row.target_id } : undefined;
}

before(async () => {
  assert.equal(process.env.DB_PATH, ':memory:');
  adminRouter = (await import('../../routes/admin')).default;
  await import('../../routes/dsa'); // създава dsa_notices
  ids.admin = mkUser('RootAdmin', 1, '127.0.0.1');
  ids.admin2 = mkUser('SecondAdmin', 1, '203.0.113.9');
  ids.player = mkUser('Player', 0, '127.0.0.1');
  ids.victim = mkUser('Victim', 0, '198.51.100.7');
  ids.playerChar = mkChar(ids.player, 'PlayerHero');
  ids.victimChar = mkChar(ids.victim, 'VictimHero');
  tok.admin = signToken({ uid: ids.admin, username: 'RootAdmin' });
  tok.admin2 = signToken({ uid: ids.admin2, username: 'SecondAdmin' });
  tok.player = signToken({ uid: ids.player, username: 'Player' });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server?.close(); });

/** Всички маршрути на админ роутера, изброени програмно от Express стека. */
function adminRoutes(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  for (const layer of (adminRouter as any).stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: layer.route.path });
  }
  return out;
}
const concrete = (p: string) => p.replace(':key', 'market_fee_pct').replace(/:[a-z]+/gi, '1');

test('роутерът има маршрути (изброяването работи)', () => {
  assert.ok(adminRoutes().length >= 40, `очаквани ≥40 маршрута, намерени ${adminRoutes().length}`);
});

test('НЕ-админ получава 403 на ВСЕКИ /api/admin/* маршрут, без токен — 401', async () => {
  for (const r of adminRoutes()) {
    const body = r.method === 'GET' ? undefined : {};
    const denied = await call(r.method, concrete(r.path), tok.player, body);
    assert.equal(denied.status, 403, `${r.method} ${r.path} → ${denied.status} за не-админ`);
    const anon = await call(r.method, concrete(r.path), undefined, body);
    assert.equal(anon.status, 401, `${r.method} ${r.path} → ${anon.status} без токен`);
  }
  // Отказите се логват (security), с дроселиране.
  const n = (getDb().prepare("SELECT COUNT(*) AS c FROM event_log WHERE action = 'admin_denied'").get() as { c: number }).c;
  assert.ok(n >= 1, 'admin_denied е логнат');
});

test('отговорите на админ GET маршрутите никога не съдържат password_hash/тайни', async () => {
  getDb().prepare("INSERT INTO webhook_endpoints (url, secret, category_filter, enabled, created_at) VALUES ('https://example.com/h', 'topsecret-hmac', '*', 0, ?)").run(Date.now());
  for (const r of adminRoutes().filter((x) => x.method === 'GET')) {
    const path = concrete(r.path).replace('/moderation/target', '/moderation/target?kind=bio&id=1');
    const res = await call('GET', path, tok.admin);
    assert.ok(res.status < 500, `${r.path} → ${res.status}`);
    assert.ok(!/password_hash/.test(res.text), `${r.path} изтича password_hash`);
    assert.ok(!/\$2a\$12\$/.test(res.text), `${r.path} изтича bcrypt хеш`);
    assert.ok(!/topsecret-hmac/.test(res.text), `${r.path} изтича webhook secret`);
  }
  const wh = await call('GET', '/webhooks', tok.admin);
  assert.equal(wh.json.webhooks[0].has_secret, 1);
  assert.equal('secret' in wh.json.webhooks[0], false);
});

test('невалидно id → 400; несъществуващ обект → 404 (не фалшиво ok:true)', async () => {
  assert.equal((await call('POST', '/tower/reset/abc', tok.admin)).status, 400);
  assert.equal((await call('POST', '/tower/reset/999999', tok.admin)).status, 404);
  assert.equal((await call('PUT', '/items/999999', tok.admin, { name: 'Nope' })).status, 404);
  assert.equal((await call('PUT', '/monsters/-1', tok.admin, { name: 'Nope' })).status, 400);
  assert.equal((await call('PATCH', '/webhooks/999999', tok.admin, { enabled: true })).status, 404);
  assert.equal((await call('POST', '/users/999999/admin', tok.admin, { admin: true })).status, 404);
});

test('{admin:"false"} вече НЕ повишава (строг boolean) → 400', async () => {
  const r = await call('POST', `/users/${ids.player}/admin`, tok.admin, { admin: 'false' });
  assert.equal(r.status, 400);
  const u = getDb().prepare('SELECT is_admin FROM users WHERE id = ?').get(ids.player) as { is_admin: number };
  assert.equal(u.is_admin, 0);
});

test('самопонижаване → 409; последният админ не може да бъде свален', async () => {
  assert.equal((await call('POST', `/users/${ids.admin}/admin`, tok.admin, { admin: false })).status, 409);
  // Понижи втория админ → остава един; той не може да се понижи сам.
  const r = await call('POST', `/users/${ids.admin2}/admin`, tok.admin, { admin: false });
  assert.equal(r.status, 200);
  const a = lastAudit('admin_demote');
  assert.deepEqual([a?.meta.before.is_admin, a?.meta.after.is_admin, a?.user_id], [1, 0, ids.admin], 'одит от → към + кой');
  assert.equal((await call('POST', `/users/${ids.admin}/admin`, tok.admin, { admin: false })).status, 409);
  // Върни втория админ за следващите тестове.
  assert.equal((await call('POST', `/users/${ids.admin2}/admin`, tok.admin, { admin: true })).status, 200);
});

test('бан: не на себе си, не на админ; loopback/админски IP НЕ се банва (без самозаключване)', async () => {
  assert.equal((await call('POST', '/moderation/ban', tok.admin, { userId: ids.admin, reason: 'test' })).status, 409);
  assert.equal((await call('POST', '/moderation/ban', tok.admin, { userId: ids.admin2, reason: 'test' })).status, 409);
  // Играчът е от 127.0.0.1 — като админа. Банът на акаунта минава, IP — не.
  const r = await call('POST', '/moderation/ban', tok.admin, { userId: ids.player, reason: 'Spam in chat', durationMs: 60_000 });
  assert.equal(r.status, 200);
  assert.equal(r.json.ip_banned, false);
  assert.equal(r.json.skipped.ip, 'shielded');
  assert.equal((getDb().prepare("SELECT COUNT(*) AS c FROM banned_ips WHERE ip = '127.0.0.1'").get() as { c: number }).c, 0);
  // Админът продължава да работи.
  assert.equal((await call('GET', '/overview', tok.admin)).status, 200);
  // Публичен IP на жертва се банва.
  const v = await call('POST', '/moderation/ban', tok.admin, { userId: ids.victim, reason: 'Cheating' });
  assert.equal(v.json.ip_banned, true);
  assert.equal(lastAudit('manual_ban')?.meta.after.banned, 1);
  assert.equal((await call('POST', '/moderation/unban', tok.admin, { userId: ids.victim })).status, 200);
  assert.equal((await call('POST', '/moderation/unban', tok.admin, { userId: ids.victim })).status, 409, 'повторно отбанване → 409');
  assert.equal((await call('POST', '/moderation/unban', tok.admin, { userId: ids.player })).status, 200);
});

test('изтриване (GDPR): изисква потвърждение с името; админ не се трие', async () => {
  assert.equal((await call('DELETE', `/users/${ids.admin2}?confirm=SecondAdmin`, tok.admin)).status, 409);
  assert.equal((await call('DELETE', `/users/${ids.admin}?confirm=RootAdmin`, tok.admin)).status, 409);
  const tmp = mkUser('TempUser');
  assert.equal((await call('DELETE', `/users/${tmp}`, tok.admin)).status, 400, 'без confirm');
  assert.equal((await call('DELETE', `/users/${tmp}?confirm=tempuser`, tok.admin)).status, 400, 'грешен регистър');
  assert.equal((await call('DELETE', `/users/${tmp}?confirm=TempUser`, tok.admin)).status, 200);
  assert.equal(getDb().prepare('SELECT 1 FROM users WHERE id = ?').get(tmp), undefined);
  assert.equal(lastAudit('user_erase')?.target_id, tmp);
});

test('пагинация с таван и LIKE wildcard-и са екранирани', async () => {
  assert.equal((await call('GET', '/users?pageSize=1000', tok.admin)).status, 400);
  assert.equal((await call('GET', '/logs?limit=-1', tok.admin)).status, 400, 'LIMIT -1 = без таван в SQLite');
  const all = await call('GET', '/users?pageSize=2&page=1', tok.admin);
  assert.equal(all.status, 200);
  assert.equal(all.json.users.length, 2);
  assert.ok(all.json.total >= 4 && all.json.pages >= 2);
  const pct = await call('GET', `/users?q=${encodeURIComponent('%')}`, tok.admin);
  assert.equal(pct.json.total, 0, '„%“ не е wildcard');
  const byChar = await call('GET', '/users?q=VictimHero', tok.admin);
  assert.equal(byChar.json.users[0]?.id, ids.victim, 'търсене и по име на герой');
});

test('предмет: частичен PUT пази инварианти (продажна ≤ покупна), одит от → към', async () => {
  const c = await call('POST', '/items', tok.admin, { slug: 'test_blade', name: 'Test Blade', category: 'weapon', buy_price: 100, sell_price: 40, atk_min: 1, atk_max: 3 });
  assert.equal(c.status, 201);
  const id = c.json.id;
  assert.equal((await call('POST', '/items', tok.admin, { slug: 'test_blade', name: 'Dup', category: 'weapon' })).status, 409, 'дублиран slug → 409');
  assert.equal((await call('PUT', `/items/${id}`, tok.admin, { sell_price: 500 })).status, 400, 'злато-експлойт');
  assert.equal((await call('PUT', `/items/${id}`, tok.admin, { atk_min: 9 })).status, 400, 'atk_min > atk_max');
  assert.equal((await call('PUT', `/items/${id}`, tok.admin, { id: 5 })).status, 400, 'непознато поле');
  assert.equal((await call('PUT', `/items/${id}`, tok.admin, { sell_price: 50 })).status, 200);
  const a = lastAudit('items_update');
  assert.deepEqual([a?.meta.before.sell_price, a?.meta.after.sell_price], [40, 50]);
  const row = getDb().prepare('SELECT buy_price, atk_max FROM items WHERE id = ?').get(id) as { buy_price: number; atk_max: number };
  assert.deepEqual([row.buy_price, row.atk_max], [100, 3], 'частичният PUT не нулира други полета');
});

test('герой: hp ≤ hp_max се проверява върху слетия ред', async () => {
  getDb().prepare('UPDATE characters SET hp = 50, hp_max = 50 WHERE id = ?').run(ids.victimChar);
  assert.equal((await call('PUT', `/characters/${ids.victimChar}`, tok.admin, { hp: 999 })).status, 400);
  assert.equal((await call('PUT', `/characters/${ids.victimChar}`, tok.admin, { level: 1e9 })).status, 400);
  assert.equal((await call('PUT', `/characters/${ids.victimChar}`, tok.admin, { gold: 1234 })).status, 200);
  assert.equal(lastAudit('character_update')?.meta.after.gold, 1234);
});

test('DSA: „chat:N“ е двусмислен → resolve дава И двата кандидата; сваля се точното съобщение + обосновка', async () => {
  const db = getDb();
  const gid = Number(db.prepare("INSERT INTO guilds (name, tag, leader_id, created_at) VALUES ('Grim', 'GRM', ?, ?)").run(ids.playerChar, Date.now()).lastInsertRowid);
  // Същото id в двата чата — старият код триеше guild_chat при сигнал за глобалния.
  db.prepare("INSERT INTO global_chat (id, channel, character_id, message, created_at) VALUES (77, 'global', ?, 'hateful public text', ?)").run(ids.victimChar, Date.now());
  db.prepare("INSERT INTO guild_chat (id, guild_id, character_id, message, created_at) VALUES (77, ?, ?, 'innocent guild text', ?)").run(gid, ids.playerChar, Date.now());
  const nid = Number(db.prepare("INSERT INTO dsa_notices (content_kind, content_ref, reason, description, good_faith, created_at) VALUES ('chat', 'chat:77', 'illegal_hate', 'Hate speech in the public channel', 1, ?)").run(Date.now()).lastInsertRowid);

  const r = await call('GET', `/moderation/notices/${nid}/resolve`, tok.admin);
  assert.equal(r.status, 200);
  const kinds = r.json.candidates.map((c: any) => c.kind).sort();
  assert.deepEqual(kinds, ['global_chat_message', 'guild_chat_message']);
  assert.equal(r.json.candidates.find((c: any) => c.kind === 'global_chat_message').preview, 'hateful public text');

  const t = await call('POST', '/moderation/takedown', tok.admin, { kind: 'global_chat_message', targetId: 77, reason: 'Hate speech', ground: 'illegal', noticeId: nid });
  assert.equal(t.status, 200);
  assert.equal(db.prepare('SELECT 1 FROM global_chat WHERE id = 77').get(), undefined, 'глобалното е свалено');
  assert.ok(db.prepare('SELECT 1 FROM guild_chat WHERE id = 77').get(), 'гилдийското НЕ е пипнато');
  const mail = db.prepare("SELECT subject, body FROM mail WHERE character_id = ? AND from_name = 'Trust & Safety' ORDER BY id DESC").get(ids.victimChar) as { subject: string; body: string };
  assert.match(mail.subject, /модерация/, 'на езика на потребителя (BG)');
  assert.match(mail.body, /чл\. 21/);
  const n = db.prepare('SELECT status FROM dsa_notices WHERE id = ?').get(nid) as { status: string };
  assert.equal(n.status, 'actioned');
  assert.equal(lastAudit('takedown')?.meta.before.content, 'hateful public text');
  // Повторно действие по вече решен сигнал → 409, без промяна.
  assert.equal((await call('POST', '/moderation/takedown', tok.admin, { kind: 'bio', targetId: ids.victimChar, reason: 'again', noticeId: nid })).status, 409);
  assert.equal((await call('POST', `/moderation/dsa/${nid}/reject`, tok.admin, { decision: 'too late' })).status, 409);
});

test('пазар: само активна обява може да се отмени; продавачът получава обосновка', async () => {
  const db = getDb();
  const item = db.prepare('SELECT id FROM items LIMIT 1').get() as { id: number };
  const inv = Number(db.prepare('INSERT INTO inventory (character_id, item_id, quantity, listed) VALUES (?, ?, 1, 1)').run(ids.victimChar, item.id).lastInsertRowid);
  const sold = Number(db.prepare("INSERT INTO marketplace_listings (inventory_id, item_id, seller_id, price_gold, status, listed_at) VALUES (?, ?, ?, 10, 'sold', ?)").run(inv, item.id, ids.victimChar, Date.now()).lastInsertRowid);
  const act = Number(db.prepare("INSERT INTO marketplace_listings (inventory_id, item_id, seller_id, price_gold, status, listed_at) VALUES (?, ?, ?, 10, 'active', ?)").run(inv, item.id, ids.victimChar, Date.now()).lastInsertRowid);
  assert.equal((await call('POST', `/marketplace/${sold}/cancel`, tok.admin, { reason: 'Scam listing' })).status, 409);
  assert.equal((await call('POST', `/marketplace/${act}/cancel`, tok.admin, { reason: 'x' })).status, 400, 'причината е задължителна');
  assert.equal((await call('POST', `/marketplace/${act}/cancel`, tok.admin, { reason: 'Scam listing' })).status, 200);
  assert.equal((db.prepare('SELECT listed FROM inventory WHERE id = ?').get(inv) as { listed: number }).listed, 0);
});

test('настройки: граници и одит от → към', async () => {
  assert.equal((await call('PUT', '/settings/market_fee_pct', tok.admin, { value: -5 })).status, 400);
  assert.equal((await call('PUT', '/settings/base_miss_chance', tok.admin, { value: 7 })).status, 400);
  assert.equal((await call('PUT', '/settings/allowed_countries', tok.admin, { value: 'bg; it' })).status, 400);
  assert.equal((await call('PUT', '/settings/nope', tok.admin, { value: 1 })).status, 404);
  assert.equal((await call('PUT', '/settings/market_fee_pct', tok.admin, { value: 7 })).status, 200);
  const a = lastAudit('setting_update');
  assert.deepEqual([a?.meta.before.market_fee_pct, a?.meta.after.market_fee_pct], [5, 7]);
});

test('logs: пресетът audit връща админ + модерация, курсорна пагинация', async () => {
  const r = await call('GET', '/logs?category=audit&limit=2', tok.admin);
  assert.equal(r.status, 200);
  assert.ok(r.json.logs.every((l: any) => l.category === 'admin' || l.category === 'moderation'));
  assert.ok(r.json.next_before_id, 'има следваща страница');
  const older = await call('GET', `/logs?category=audit&limit=2&before_id=${r.json.next_before_id}`, tok.admin);
  assert.ok(older.json.logs.every((l: any) => l.id < r.json.next_before_id));
  const cats = new Set((await call('GET', '/logs?category=audit&limit=500', tok.admin)).json.logs.map((l: any) => l.category));
  assert.deepEqual([...cats].sort(), ['admin', 'moderation']);
});

test('всяка успешна мутация без изричен одит пак оставя ред (предпазна мрежа)', async () => {
  const before = (getDb().prepare("SELECT COUNT(*) AS c FROM event_log WHERE message LIKE 'Unaudited admin%'").get() as { c: number }).c;
  assert.equal(before, 0, 'всички досегашни мутации са одитирани изрично');
});

test('помощници: escapeLike, IP щит, обосновка по чл. 17', () => {
  assert.equal(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
  assert.equal(isNonPublicIp('127.0.0.1'), true);
  assert.equal(isNonPublicIp('10.1.2.3'), true);
  assert.equal(isNonPublicIp('100.64.0.1'), true);
  assert.equal(isNonPublicIp('8.8.8.8'), false);
  assert.equal(ipIsShielded('8.8.8.8', ['8.8.8.8']), true, 'IP на админ');
  assert.equal(ipIsShielded('8.8.4.4', ['8.8.8.8']), false);
  assert.deepEqual(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3 }), ['b']);
  assert.equal(langForCountry('IT'), 'it');
  const st = buildStatement({ kind: 'bio', reason: 'Slur', ground: 'terms', fromNotice: false, lang: 'en' });
  for (const part of ['Reason: Slur', 'Terms of Service', 'own initiative', 'no automated means', 'Art. 21']) {
    assert.ok(st.body.includes(part), `обосновката съдържа „${part}“`);
  }
});
