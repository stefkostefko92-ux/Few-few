// Регресионни тестове за разширения админ CRUD (routes/admin/*): герои,
// инвентар, изчаквания, репутация, постижения, бойна история, гилдии,
// системна поща/известия, икономика (връщане, аукцион, размени), световен
// бос, сезон, чат, статично съдържание и замени на продуктите.
// За всеки ендпойнт: 400 (валидация) · 404 · 409 · успех · одит ред; 403 за
// не-админ се гейтва и глобално от admin.test.ts (изброява ВСЕКИ маршрут).
// In-memory база — задай ПРЕДИ първия getDb(); роутерите се зареждат динамично.
process.env.DB_PATH = ':memory:';

import test, { after, before } from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { getDb } from '../../db';
import { signToken } from '../../middleware/auth';
import { xpForLevel } from '../progression';
import { isoWeek } from '../realmBoss';
import { prevSeasonKey, seasonKeyFor } from '../seasons';

let server: Server;
let base = '';
const ids = { a1: 0, a2: 0, a3: 0, a4: 0, player: 0, other: 0, hero: 0, rival: 0, sword: 0, potion: 0, ring: 0 };
const tok = { a1: '', a2: '', a3: '', a4: '', player: '' };

function mkUser(username: string, isAdmin = 0): number {
  const now = Date.now();
  return Number(getDb()
    .prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at, is_admin, country) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, `${username.toLowerCase()}@example.com`, '$2a$12$secretsecretsecretsecretsecretsecretsecretsecret', now, now, isAdmin, 'BG').lastInsertRowid);
}
function mkChar(userId: number | null, name: string, level = 10): number {
  return Number(getDb().prepare("INSERT INTO characters (user_id, name, class, level, xp, energy_updated_at, created_at) VALUES (?, ?, 'warrior', ?, ?, 0, 0)")
    .run(userId, name, level, xpForLevel(level)).lastInsertRowid);
}
function mkItem(slug: string, category: string, extra: Record<string, unknown> = {}): number {
  const row = { slug, name: slug.replace(/_/g, ' '), category, level_req: 1, class_req: '', sub_type: '', ...extra };
  return Number(getDb().prepare('INSERT INTO items (slug, name, category, level_req, class_req, sub_type) VALUES (@slug, @name, @category, @level_req, @class_req, @sub_type)').run(row).lastInsertRowid);
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

function lastAudit(action: string): { meta: any; user_id: number; target_id: number | null } | undefined {
  const row = getDb().prepare("SELECT meta_json, user_id, target_id FROM event_log WHERE action = ? AND category IN ('admin', 'moderation') ORDER BY id DESC LIMIT 1").get(action) as { meta_json: string; user_id: number; target_id: number } | undefined;
  return row ? { meta: JSON.parse(row.meta_json), user_id: row.user_id, target_id: row.target_id } : undefined;
}

before(async () => {
  const adminRouter = (await import('../../routes/admin')).default;
  ids.a1 = mkUser('AdminOne', 1);
  ids.a2 = mkUser('AdminTwo', 1);
  ids.a3 = mkUser('AdminThree', 1);
  ids.a4 = mkUser('AdminFour', 1);
  ids.player = mkUser('Plain');
  ids.other = mkUser('Other');
  ids.hero = mkChar(ids.player, 'HeroOne', 20);
  ids.rival = mkChar(ids.other, 'RivalTwo', 15);
  ids.sword = mkItem('crud_sword', 'weapon', { level_req: 5 });
  ids.potion = mkItem('crud_potion', 'potion');
  ids.ring = mkItem('crud_ring', 'ring', { level_req: 90 });
  for (const k of ['a1', 'a2', 'a3', 'a4'] as const) tok[k] = signToken({ uid: ids[k], username: k });
  tok.player = signToken({ uid: ids.player, username: 'Plain' });
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server?.close(); });

test('не-админ получава 403 на новите маршрути', async () => {
  for (const [m, p] of [['GET', '/characters'], ['GET', `/characters/${ids.hero}`], ['POST', `/characters/${ids.hero}/inventory`], ['DELETE', '/guilds/1?confirm=X'], ['POST', '/mail'], ['GET', '/realm-boss'], ['POST', '/season/finalize'], ['GET', '/chat'], ['PUT', '/content/products/gems_pouch']] as const) {
    assert.equal((await call(m, p, tok.player, m === 'GET' ? undefined : {})).status, 403, `${m} ${p}`);
  }
});

/* ===================== Герои ===================== */
test('герои: списък с търсене/филтри/пагинация; детайл; 404', async () => {
  const all = await call('GET', '/characters?pageSize=1', tok.a1);
  assert.equal(all.status, 200);
  assert.equal(all.json.characters.length, 1);
  assert.ok(all.json.total >= 2 && all.json.pages >= 2);
  const byUser = await call('GET', '/characters?q=Plain', tok.a1);
  assert.equal(byUser.json.characters[0]?.id, ids.hero, 'търсене по потребител');
  const lvl = await call('GET', '/characters?min_level=16', tok.a1);
  assert.deepEqual(lvl.json.characters.map((c: any) => c.id), [ids.hero]);
  assert.equal((await call('GET', '/characters?class=bard', tok.a1)).status, 400);
  assert.equal((await call('GET', '/characters?q=%25', tok.a1)).json.total, 0, '„%“ не е wildcard');
  const d = await call('GET', `/characters/${ids.hero}`, tok.a1);
  assert.equal(d.status, 200);
  assert.equal(d.json.character.name, 'HeroOne');
  assert.equal(d.json.user.username, 'Plain');
  assert.equal(d.json.factions.length, 3);
  assert.ok(d.json.achievements.length > 10);
  assert.ok(!/password_hash|\$2a\$12\$/.test(d.text));
  assert.equal((await call('GET', '/characters/999999', tok.a1)).status, 404);
});

test('герои: PUT синхронизира ниво ↔ XP; 400/404/409; одит от → към', async () => {
  assert.equal((await call('PUT', `/characters/${ids.hero}`, tok.a1, { level: 30, xp: 1 })).status, 400, 'несъвместими ниво/XP');
  assert.equal((await call('PUT', `/characters/${ids.hero}`, tok.a1, { gems: -1 })).status, 400);
  assert.equal((await call('PUT', `/characters/${ids.hero}`, tok.a1, { password_hash: 'x' })).status, 400, 'непознато поле');
  assert.equal((await call('PUT', '/characters/999999', tok.a1, { gold: 1 })).status, 404);
  assert.equal((await call('PUT', `/characters/${ids.hero}`, tok.a1, { name: 'rivaltwo' })).status, 409, 'заето име (без регистър)');
  const r = await call('PUT', `/characters/${ids.hero}`, tok.a1, { level: 30, strength: 42, gems: 7 });
  assert.equal(r.status, 200);
  const row = getDb().prepare('SELECT level, xp, strength, gems FROM characters WHERE id = ?').get(ids.hero) as any;
  assert.deepEqual([row.level, row.xp, row.strength, row.gems], [30, xpForLevel(30), 42, 7]);
  const a = lastAudit('character_update');
  assert.deepEqual([a?.meta.before.level, a?.meta.after.level, a?.meta.after.xp], [20, 30, xpForLevel(30)]);
  assert.equal(a?.user_id, ids.a1);
  const x = await call('PUT', `/characters/${ids.hero}`, tok.a1, { xp: xpForLevel(25) + 1 });
  assert.equal(x.json.level, 25, 'XP без ниво → нивото се извежда');
});

/* ===================== Инвентар ===================== */
test('инвентар: даване (трупане на отвари), екипиране/сваляне, чар, премахване', async () => {
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'nope_item' })).status, 404);
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'crud_sword', quantity: 0 })).status, 400);
  assert.equal((await call('POST', `/characters/999999/inventory`, tok.a2, { slug: 'crud_sword' })).status, 404);
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'crud_sword', quantity: 2 })).status, 201);
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'crud_potion', quantity: 3 })).status, 201);
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'crud_potion', quantity: 2 })).status, 201);
  assert.equal(lastAudit('inventory_give')?.meta.after.item, 'crud_potion');
  const inv = (await call('GET', `/characters/${ids.hero}/inventory`, tok.a2)).json.items as any[];
  const swords = inv.filter((i) => i.slug === 'crud_sword');
  const potions = inv.filter((i) => i.slug === 'crud_potion');
  assert.equal(swords.length, 2, 'екипировката е по ред на брой');
  assert.deepEqual(potions.map((p) => p.quantity), [5], 'отварите се трупат');
  const sw = swords[0].inv_id;
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory/${sw}/unequip`, tok.a2)).status, 409, 'не е екипиран');
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory/${sw}/equip`, tok.a2)).status, 200);
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory/${sw}/equip`, tok.a2)).status, 409, 'вече е екипиран');
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory/${swords[1].inv_id}/equip`, tok.a2)).status, 200, 'сменя слота');
  const eq = getDb().prepare('SELECT id, equipped FROM inventory WHERE item_id = ? ORDER BY id').all(ids.sword) as any[];
  assert.deepEqual(eq.map((r) => r.equipped), [0, 1], 'един предмет в слот');
  assert.equal(lastAudit('inventory_equip')?.meta.after.equipped, 1);
  // Чар/гнезда: само познати ключове.
  assert.equal((await call('PATCH', `/characters/${ids.hero}/inventory/${sw}`, tok.a2, { bonuses: { luck: 5 } })).status, 400);
  assert.equal((await call('PATCH', `/characters/${ids.hero}/inventory/${sw}`, tok.a2, { quantity: 3 })).status, 400, 'екипировка не се трупа');
  assert.equal((await call('PATCH', `/characters/${ids.hero}/inventory/999999`, tok.a2, { soul_bound: true })).status, 404);
  assert.equal((await call('PATCH', `/characters/${ids.hero}/inventory/${sw}`, tok.a2, { enchant_count: 3, bonuses: { str_bonus: 6, atk_max: 4 } })).status, 200);
  const ench = getDb().prepare('SELECT enchant_count, bonuses_json FROM inventory_enchants WHERE inventory_id = ?').get(sw) as any;
  assert.deepEqual([ench.enchant_count, JSON.parse(ench.bonuses_json)], [3, { str_bonus: 6, atk_max: 4 }]);
  assert.equal(lastAudit('inventory_edit')?.meta.before.enchant_count, 0);
  // Ниво-изискване → 409; обява на пазара → 409 при премахване.
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory`, tok.a2, { slug: 'crud_ring' })).status, 201);
  const ring = (getDb().prepare('SELECT id FROM inventory WHERE item_id = ?').get(ids.ring) as { id: number }).id;
  assert.equal((await call('POST', `/characters/${ids.hero}/inventory/${ring}/equip`, tok.a2)).status, 409, 'изисква ниво 90');
  getDb().prepare('UPDATE inventory SET listed = 1 WHERE id = ?').run(ring);
  assert.equal((await call('DELETE', `/characters/${ids.hero}/inventory/${ring}`, tok.a2)).status, 409, 'обявен на пазара');
  getDb().prepare('UPDATE inventory SET listed = 0 WHERE id = ?').run(ring);
  const pot = potions[0].inv_id;
  const part = await call('DELETE', `/characters/${ids.hero}/inventory/${pot}?quantity=2`, tok.a2);
  assert.deepEqual([part.status, part.json.removed], [200, 2]);
  assert.equal((getDb().prepare('SELECT quantity FROM inventory WHERE id = ?').get(pot) as any).quantity, 3);
  assert.equal((await call('DELETE', `/characters/${ids.hero}/inventory/${ring}`, tok.a2)).status, 200);
  assert.equal(getDb().prepare('SELECT 1 FROM inventory WHERE id = ?').get(ring), undefined);
  assert.equal(lastAudit('inventory_remove')?.meta.before.item, 'crud_ring');
  assert.equal((await call('DELETE', `/characters/${ids.hero}/inventory/${ring}`, tok.a2)).status, 404);
});

test('изчаквания: нулиране по обхват (серията не се къса); 409 когато няма нищо', async () => {
  const db = getDb();
  const today = Math.floor(Date.now() / 86_400_000);
  db.prepare("INSERT INTO character_cooldowns (character_id, action_kind, next_available_at) VALUES (?, 'hunt', ?)").run(ids.hero, Date.now() + 60_000);
  db.prepare("INSERT INTO dungeon_cooldowns (character_id, slug, next_available_at) VALUES (?, 'd1', ?)").run(ids.hero, Date.now() + 60_000);
  db.prepare("INSERT INTO daily_state (character_id, streak, longest_streak, last_claim_day, last_spin_day, quests_day) VALUES (?, 5, 5, ?, ?, ?)").run(ids.hero, today, today, today);
  assert.equal((await call('POST', `/characters/${ids.hero}/cooldowns/reset`, tok.a1, { scope: 'everything' })).status, 400);
  assert.equal((await call('POST', '/characters/999999/cooldowns/reset', tok.a1, { scope: 'all' })).status, 404);
  const r = await call('POST', `/characters/${ids.hero}/cooldowns/reset`, tok.a1, { scope: 'all' });
  assert.deepEqual(r.json.cleared, { actions: 1, dungeons: 1, daily: 1 });
  const d = db.prepare('SELECT streak, last_claim_day, last_spin_day FROM daily_state WHERE character_id = ?').get(ids.hero) as any;
  assert.deepEqual([d.streak, d.last_claim_day, d.last_spin_day], [5, today - 1, today - 1]);
  assert.equal(lastAudit('cooldowns_reset')?.meta.scope, 'all');
  assert.equal((await call('POST', `/characters/${ids.hero}/cooldowns/reset`, tok.a1, { scope: 'all' })).status, 409);
});

test('репутация, постижения (титлата се отнема с тях), бойна история', async () => {
  assert.equal((await call('PUT', `/characters/${ids.hero}/reputation/iron_watch`, tok.a1, { rep: -1 })).status, 400);
  assert.equal((await call('PUT', `/characters/${ids.hero}/reputation/nope`, tok.a1, { rep: 5 })).status, 404);
  const rep = await call('PUT', `/characters/${ids.hero}/reputation/iron_watch`, tok.a1, { rep: 5000 });
  assert.deepEqual([rep.status, rep.json.tier.tier], [200, 3]);
  assert.deepEqual([lastAudit('reputation_set')?.meta.before.iron_watch, lastAudit('reputation_set')?.meta.after.iron_watch], [0, 5000]);

  assert.equal((await call('POST', `/characters/${ids.hero}/achievements`, tok.a3, { slug: 'nope' })).status, 404);
  assert.equal((await call('POST', `/characters/${ids.hero}/achievements`, tok.a3, {})).status, 400);
  assert.equal((await call('POST', `/characters/${ids.hero}/achievements`, tok.a3, { slug: 'level_10' })).status, 201);
  assert.equal((await call('POST', `/characters/${ids.hero}/achievements`, tok.a3, { slug: 'level_10' })).status, 409);
  getDb().prepare("UPDATE characters SET current_title = 'the Veteran' WHERE id = ?").run(ids.hero);
  const rv = await call('DELETE', `/characters/${ids.hero}/achievements/level_10`, tok.a3);
  assert.deepEqual([rv.status, rv.json.title_cleared], [200, true]);
  assert.equal((getDb().prepare('SELECT current_title FROM characters WHERE id = ?').get(ids.hero) as any).current_title, '');
  assert.equal(lastAudit('achievement_revoke')?.meta.before.current_title, 'the Veteran');
  assert.equal((await call('DELETE', `/characters/${ids.hero}/achievements/level_10`, tok.a3)).status, 404);

  const logId = Number(getDb().prepare("INSERT INTO combat_log (character_id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at) VALUES (?, 'Goblin', 'pve', 'win', '[{\"r\":1},{\"r\":2}]', 5, 3, ?)").run(ids.hero, Date.now()).lastInsertRowid);
  const list = await call('GET', `/characters/${ids.hero}/combat?result=win`, tok.a3);
  assert.deepEqual([list.status, list.json.battles[0].rounds, list.json.battles[0].opponent], [200, 2, 'Goblin']);
  assert.ok(!('rounds_json' in list.json.battles[0]), 'списъкът е без тежкия rounds_json');
  assert.equal((await call('GET', `/characters/${ids.hero}/combat?result=draw`, tok.a3)).status, 400);
  const one = await call('GET', `/characters/${ids.hero}/combat/${logId}`, tok.a3);
  assert.equal(one.json.battle.rounds.length, 2);
  assert.equal((await call('GET', `/characters/${ids.rival}/combat/${logId}`, tok.a3)).status, 404, 'чужд бой');
});

/* ===================== Гилдии ===================== */
test('гилдии: списък/детайл, редакция (409 за заето име), членове, лидерство', async () => {
  const db = getDb();
  const now = Date.now();
  const gid = Number(db.prepare("INSERT INTO guilds (name, tag, leader_id, created_at) VALUES ('Iron Oath', 'IRON', ?, ?)").run(ids.hero, now).lastInsertRowid);
  db.prepare("INSERT INTO guilds (name, tag, leader_id, created_at) VALUES ('Taken Name', 'TKN', ?, ?)").run(ids.rival, now);
  db.prepare("INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(gid, ids.hero, now);
  db.prepare("INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'recruit', ?)").run(gid, ids.rival, now);
  const list = await call('GET', '/guilds?q=IRON', tok.a4);
  assert.deepEqual([list.status, list.json.guilds[0].member_count, list.json.guilds[0].leader_name], [200, 2, 'HeroOne']);
  const d = await call('GET', `/guilds/${gid}`, tok.a4);
  assert.equal(d.json.members[0].role, 'leader');
  assert.equal((await call('GET', '/guilds/999999', tok.a4)).status, 404);

  assert.equal((await call('PUT', `/guilds/${gid}`, tok.a4, { tag: 'lower' })).status, 400);
  assert.equal((await call('PUT', `/guilds/${gid}`, tok.a4, { name: 'Taken Name' })).status, 409);
  assert.equal((await call('PUT', `/guilds/${gid}`, tok.a4, { motto: 'Hold', level: 3, gold: 500 })).status, 200);
  assert.equal((db.prepare('SELECT member_slots FROM guilds WHERE id = ?').get(gid) as any).member_slots, 20, 'тир → места');
  assert.equal(lastAudit('guild_update')?.meta.after.motto, 'Hold');

  assert.equal((await call('POST', `/guilds/${gid}/members/${ids.hero}/kick`, tok.a4)).status, 409, 'лидерът не се изгонва');
  assert.equal((await call('PUT', `/guilds/${gid}/members/${ids.rival}/role`, tok.a4, { role: 'leader' })).status, 400);
  assert.equal((await call('PUT', `/guilds/${gid}/members/${ids.rival}/role`, tok.a4, { role: 'officer' })).status, 200);
  assert.equal((await call('PUT', `/guilds/${gid}/members/${ids.rival}/role`, tok.a4, { role: 'officer' })).status, 409);
  assert.equal((await call('POST', `/guilds/${gid}/leader`, tok.a4, { character_id: 999999 })).status, 404);
  assert.equal((await call('POST', `/guilds/${gid}/leader`, tok.a4, { character_id: ids.rival })).status, 200);
  const roles = db.prepare('SELECT character_id, role FROM guild_members WHERE guild_id = ? ORDER BY character_id').all(gid) as any[];
  assert.deepEqual(roles.map((r) => r.role), ['officer', 'leader']);
  assert.equal((db.prepare('SELECT leader_id FROM guilds WHERE id = ?').get(gid) as any).leader_id, ids.rival);
  assert.equal((await call('POST', `/guilds/${gid}/members/${ids.hero}/kick`, tok.a4)).status, 200);
  assert.equal(lastAudit('guild_kick')?.meta.before.member, 'HeroOne');
});

test('гилдии: трезор, войни, разпускане (всичко в една транзакция, трезорът се връща)', async () => {
  const db = getDb();
  const now = Date.now();
  const gid = Number(db.prepare("INSERT INTO guilds (name, tag, leader_id, created_at) VALUES ('Doomed Host', 'DOOM', ?, ?)").run(ids.hero, now).lastInsertRowid);
  const foe = Number(db.prepare("INSERT INTO guilds (name, tag, leader_id, created_at) VALUES ('Foe Band', 'FOE', ?, ?)").run(ids.hero, now).lastInsertRowid);
  db.prepare("INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'leader', ?)").run(gid, ids.hero, now);
  const inv1 = Number(db.prepare('INSERT INTO inventory (character_id, item_id, quantity, vaulted_guild_id) VALUES (?, ?, 1, ?)').run(ids.hero, ids.sword, gid).lastInsertRowid);
  const inv2 = Number(db.prepare('INSERT INTO inventory (character_id, item_id, quantity, vaulted_guild_id) VALUES (?, ?, 1, ?)').run(ids.hero, ids.sword, gid).lastInsertRowid);
  const inv3 = Number(db.prepare('INSERT INTO inventory (character_id, item_id, quantity, vaulted_guild_id) VALUES (?, ?, 1, ?)').run(ids.hero, ids.sword, gid).lastInsertRowid);
  const v1 = Number(db.prepare('INSERT INTO guild_vault (guild_id, inventory_id, deposited_by, deposited_at) VALUES (?, ?, ?, ?)').run(gid, inv1, ids.hero, now).lastInsertRowid);
  const v2 = Number(db.prepare('INSERT INTO guild_vault (guild_id, inventory_id, deposited_by, deposited_at) VALUES (?, ?, ?, ?)').run(gid, inv2, ids.hero, now).lastInsertRowid);
  db.prepare('INSERT INTO guild_vault (guild_id, inventory_id, deposited_by, deposited_at) VALUES (?, ?, ?, ?)').run(gid, inv3, ids.hero, now);
  const war = Number(db.prepare("INSERT INTO guild_wars (attacker_guild_id, defender_guild_id, status, attacker_score, started_at, ends_at) VALUES (?, ?, 'active', 30, ?, ?)").run(gid, foe, now, now + 86_400_000).lastInsertRowid);

  assert.equal((await call('POST', `/guilds/${gid}/vault/999999/return`, tok.a4)).status, 404);
  assert.equal((await call('POST', `/guilds/${gid}/vault/${v1}/return`, tok.a4)).status, 200);
  assert.equal((db.prepare('SELECT vaulted_guild_id FROM inventory WHERE id = ?').get(inv1) as any).vaulted_guild_id, 0);
  assert.equal((await call('POST', `/guilds/${gid}/vault/${v1}/return`, tok.a4)).status, 404, 'вече не е в трезора');
  assert.equal((await call('DELETE', `/guilds/${gid}/vault/${v2}`, tok.a4)).status, 200);
  assert.equal(db.prepare('SELECT 1 FROM inventory WHERE id = ?').get(inv2), undefined);
  assert.equal(lastAudit('guild_vault_destroy')?.meta.before.item, 'crud_sword');

  assert.equal((await call('POST', `/guilds/${gid}/wars/${war}/end`, tok.a4, { winner: 'nobody' })).status, 400);
  assert.equal((await call('POST', `/guilds/${gid}/wars/${war}/end`, tok.a4, { winner: 'attacker' })).status, 200);
  assert.equal((db.prepare('SELECT status, winner_guild_id FROM guild_wars WHERE id = ?').get(war) as any).winner_guild_id, gid);
  assert.equal((await call('POST', `/guilds/${gid}/wars/${war}/end`, tok.a4, { winner: 'none' })).status, 409);
  db.prepare("INSERT INTO guild_wars (attacker_guild_id, defender_guild_id, status, started_at, ends_at) VALUES (?, ?, 'active', ?, ?)").run(foe, gid, now, now + 1);

  assert.equal((await call('DELETE', `/guilds/${gid}`, tok.a4)).status, 400, 'без потвърждение с тага');
  assert.equal((await call('DELETE', `/guilds/${gid}?confirm=doom`, tok.a4)).status, 400, 'регистърът е значим');
  assert.equal((await call('DELETE', '/guilds/999999?confirm=X', tok.a4)).status, 404);
  const r = await call('DELETE', `/guilds/${gid}?confirm=DOOM`, tok.a4);
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.vault_returned, r.json.wars, r.json.members], [1, 2, 1]);
  assert.equal(db.prepare('SELECT 1 FROM guilds WHERE id = ?').get(gid), undefined);
  assert.equal((db.prepare('SELECT vaulted_guild_id FROM inventory WHERE id = ?').get(inv3) as any).vaulted_guild_id, 0, 'предметът е при притежателя');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM guild_wars WHERE attacker_guild_id = ? OR defender_guild_id = ?').get(gid, gid) as any).c, 0);
  assert.ok(db.prepare("SELECT 1 FROM notifications WHERE character_id = ? AND message LIKE '%disbanded%'").get(ids.hero));
  assert.equal(lastAudit('guild_disband')?.meta.before.tag, 'DOOM');
});

/* ===================== Поща / известия ===================== */
test('поща: до един герой с прикачено злато+предмет (зачислява веднага), до всички, списък, изтегляне', async () => {
  const db = getDb();
  assert.equal((await call('POST', '/mail', tok.a3, { target: 'character', subject: 'Hi', body: 'x' })).status, 400, 'без character_id');
  assert.equal((await call('POST', '/mail', tok.a3, { target: 'character', character_id: 999999, subject: 'Hi', body: 'x' })).status, 404);
  assert.equal((await call('POST', '/mail', tok.a3, { target: 'character', character_id: ids.rival, subject: 'Hi', body: 'x', item_slug: 'nope_item' })).status, 404);
  const gold0 = (db.prepare('SELECT gold FROM characters WHERE id = ?').get(ids.rival) as any).gold;
  const one = await call('POST', '/mail', tok.a3, { target: 'character', character_id: ids.rival, subject: 'Gift', body: 'For you', gold: 250, item_slug: 'crud_potion', item_qty: 4 });
  assert.deepEqual([one.status, one.json.sent], [201, 1]);
  assert.equal((db.prepare('SELECT gold FROM characters WHERE id = ?').get(ids.rival) as any).gold, gold0 + 250);
  assert.equal((db.prepare('SELECT SUM(quantity) AS q FROM inventory WHERE character_id = ? AND item_id = ?').get(ids.rival, ids.potion) as any).q, 4);
  const m = db.prepare('SELECT body, admin_mail_id FROM mail WHERE character_id = ? ORDER BY id DESC').get(ids.rival) as any;
  assert.equal(m.admin_mail_id, one.json.id);
  assert.match(m.body, /\+250 gold, 4× crud potion/);
  assert.equal(lastAudit('mail_send')?.meta.after.gold, 250);

  const all = await call('POST', '/mail', tok.a3, { target: 'all', subject: 'Patch', body: 'Maintenance tonight' });
  assert.equal(all.json.sent, 2, 'само играчи');
  const list = await call('GET', '/mail?q=Patch', tok.a3);
  assert.deepEqual([list.json.total, list.json.mail[0].remaining], [1, 2]);
  const del = await call('DELETE', `/mail/${one.json.id}`, tok.a3);
  assert.deepEqual([del.status, del.json.removed, del.json.attachments_kept], [200, 1, true]);
  assert.equal((db.prepare('SELECT gold FROM characters WHERE id = ?').get(ids.rival) as any).gold, gold0 + 250, 'зачисленото остава');
  assert.equal((await call('DELETE', `/mail/${one.json.id}`, tok.a3)).status, 404);
  assert.equal(lastAudit('mail_delete')?.meta.before.copies, 1);

  assert.equal((await call('POST', '/notifications', tok.a3, { target: 'all', message: '' })).status, 400);
  const n = await call('POST', '/notifications', tok.a3, { target: 'all', message: 'Server restart in 5 min' });
  assert.deepEqual([n.status, n.json.sent], [201, 2]);
  assert.equal((await call('POST', '/notifications', tok.a3, { target: 'character', character_id: 999999, message: 'x' })).status, 404);
  assert.equal(lastAudit('notification_send')?.meta.after.recipients, 2);
});

/* ===================== Икономика ===================== */
test('поръчки: отбелязване на връщане (само completed/disputed) + отнемане на гемовете', async () => {
  const db = getDb();
  db.prepare('UPDATE characters SET gems = 100 WHERE id = ?').run(ids.rival);
  const pid = Number(db.prepare(`INSERT INTO purchases (character_id, kind, amount_cents, currency, gems_granted, effect_payload, status, mode, created_at)
    VALUES (?, 'gems_pouch', 499, 'eur', 775, '{"gems":775}', 'completed', 'dev', ?)`).run(ids.rival, Date.now()).lastInsertRowid);
  const pend = Number(db.prepare(`INSERT INTO purchases (character_id, kind, amount_cents, status, created_at) VALUES (?, 'gems_pouch', 499, 'pending', ?)`).run(ids.rival, Date.now()).lastInsertRowid);
  assert.equal((await call('POST', `/purchases/${pid}/refund`, tok.a1, { reason: 'x' })).status, 400);
  assert.equal((await call('POST', '/purchases/999999/refund', tok.a1, { reason: 'Customer request' })).status, 404);
  assert.equal((await call('POST', `/purchases/${pend}/refund`, tok.a1, { reason: 'Customer request' })).status, 409);
  const r = await call('POST', `/purchases/${pid}/refund`, tok.a1, { reason: 'Customer request' });
  assert.deepEqual([r.status, r.json.gems_clawed_back], [200, 100], 'не под 0');
  assert.equal((db.prepare('SELECT gems FROM characters WHERE id = ?').get(ids.rival) as any).gems, 0);
  assert.equal((db.prepare('SELECT status FROM purchases WHERE id = ?').get(pid) as any).status, 'refunded');
  assert.equal((await call('POST', `/purchases/${pid}/refund`, tok.a1, { reason: 'Customer request' })).status, 409, 'повторно');
  assert.deepEqual([lastAudit('purchase_refund')?.meta.before.status, lastAudit('purchase_refund')?.meta.after.status], ['completed', 'refunded']);
});

test('аукцион: отмяна връща гемовете на водещия; уредена → 409; наддаване по отменена е спряно', async () => {
  const db = getDb();
  db.prepare('UPDATE characters SET gems = 10 WHERE id = ?').run(ids.hero);
  const hour = Math.floor(Date.now() / 3_600_000);
  const open = Number(db.prepare(`INSERT INTO auction_listings (hour_bucket, item_slug, item_id, starts_at, ends_at, starting_bid, current_bid, bidder_id, bidder_name, settled)
    VALUES (?, 'crud_ring', ?, ?, ?, 20, 40, ?, 'HeroOne', 0)`).run(hour + 100, ids.ring, Date.now(), Date.now() + 3_600_000, ids.hero).lastInsertRowid);
  const done = Number(db.prepare(`INSERT INTO auction_listings (hour_bucket, item_slug, item_id, starts_at, ends_at, starting_bid, current_bid, settled)
    VALUES (?, 'crud_ring', ?, 0, 1, 20, 20, 1)`).run(hour - 100, ids.ring).lastInsertRowid);
  const list = await call('GET', '/auction?status=open', tok.a2);
  assert.ok(list.json.listings.some((l: any) => l.id === open));
  assert.equal((await call('POST', `/auction/${open}/cancel`, tok.a2, {})).status, 400);
  assert.equal((await call('POST', `/auction/${done}/cancel`, tok.a2, { reason: 'Bugged item' })).status, 409);
  assert.equal((await call('POST', '/auction/999999/cancel', tok.a2, { reason: 'Bugged item' })).status, 404);
  const r = await call('POST', `/auction/${open}/cancel`, tok.a2, { reason: 'Bugged item' });
  assert.deepEqual([r.status, r.json.refunded], [200, 40]);
  assert.equal((db.prepare('SELECT gems FROM characters WHERE id = ?').get(ids.hero) as any).gems, 50);
  const row = db.prepare('SELECT settled, cancelled_at, bidder_id FROM auction_listings WHERE id = ?').get(open) as any;
  assert.deepEqual([row.settled, row.cancelled_at > 0, row.bidder_id], [1, true, null]);
  assert.ok(db.prepare("SELECT 1 FROM mail WHERE character_id = ? AND subject LIKE 'Auction cancelled%'").get(ids.hero));
  assert.equal((await call('POST', `/auction/${open}/cancel`, tok.a2, { reason: 'Bugged item' })).status, 409);
  assert.equal(lastAudit('auction_cancel')?.meta.gems_refunded, 40);
});

test('размени: списък + отмяна само на чакаща, с известие до двамата', async () => {
  const db = getDb();
  const now = Date.now();
  const t = Number(db.prepare("INSERT INTO trade_offers (from_id, to_id, from_items, to_gold, status, created_at, updated_at) VALUES (?, ?, '[1,2]', 50, 'pending', ?, ?)").run(ids.hero, ids.rival, now, now).lastInsertRowid);
  const list = await call('GET', '/trades?status=pending', tok.a2);
  assert.deepEqual([list.json.trades[0].id, list.json.trades[0].from_item_count], [t, 2]);
  assert.equal((await call('GET', '/trades?status=weird', tok.a2)).status, 400);
  assert.equal((await call('POST', `/trades/${t}/cancel`, tok.a2, { reason: 'Scam report' })).status, 200);
  assert.equal((db.prepare('SELECT status FROM trade_offers WHERE id = ?').get(t) as any).status, 'cancelled');
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE kind = 'trade' AND message LIKE '%cancelled by the realm%'").get() as any).c, 2);
  assert.equal((await call('POST', `/trades/${t}/cancel`, tok.a2, { reason: 'Scam report' })).status, 409);
  assert.equal((await call('POST', '/trades/999999/cancel', tok.a2, { reason: 'Scam report' })).status, 404);
  assert.equal(lastAudit('trade_cancel')?.target_id, t);
});

/* ===================== Световен бос / сезон ===================== */
test('световен бос: спаун (409 при съществуващ), редакция на HP, нулиране (409 след прибрана награда)', async () => {
  const db = getDb();
  const wk = isoWeek();
  const v = await call('GET', '/realm-boss', tok.a1);
  assert.deepEqual([v.status, v.json.boss, v.json.current_week], [200, null, wk]);
  assert.equal((await call('POST', '/realm-boss/spawn', tok.a1, { boss_slug: 'rb_nope' })).status, 404);
  assert.equal((await call('POST', '/realm-boss/spawn', tok.a1, { hp_max: 0 })).status, 400);
  const s = await call('POST', '/realm-boss/spawn', tok.a1, { boss_slug: 'rb_orsis', hp_max: 5000 });
  assert.deepEqual([s.status, s.json.boss.boss_slug, s.json.boss.hp_remaining], [201, 'rb_orsis', 5000]);
  assert.equal((await call('POST', '/realm-boss/spawn', tok.a1, {})).status, 409);
  assert.equal(lastAudit('realm_boss_spawn')?.meta.after.boss_slug, 'rb_orsis');

  assert.equal((await call('PUT', `/realm-boss/${wk}`, tok.a1, { hp_remaining: 9000 })).status, 400, 'над максимума');
  assert.equal((await call('PUT', '/realm-boss/2001-W01', tok.a1, { hp_remaining: 1 })).status, 404);
  assert.equal((await call('PUT', '/realm-boss/bad-week', tok.a1, { hp_remaining: 1 })).status, 400);
  assert.equal((await call('PUT', `/realm-boss/${wk}`, tok.a1, { hp_remaining: 1234 })).status, 200);
  assert.deepEqual([lastAudit('realm_boss_update')?.meta.before.hp_remaining, lastAudit('realm_boss_update')?.meta.after.hp_remaining], [5000, 1234]);

  db.prepare('INSERT INTO realm_boss_contributions (iso_week, character_id, damage, strikes, last_strike_at) VALUES (?, ?, 3766, 2, ?)').run(wk, ids.hero, Date.now());
  const c = await call('GET', `/realm-boss?week=${wk}`, tok.a1);
  assert.deepEqual([c.json.contributions[0].name, c.json.contributions[0].damage], ['HeroOne', 3766]);
  const r = await call('POST', `/realm-boss/${wk}/reset`, tok.a1);
  assert.deepEqual([r.status, r.json.contributions_removed], [200, 1]);
  assert.equal((db.prepare('SELECT hp_remaining FROM realm_boss WHERE iso_week = ?').get(wk) as any).hp_remaining, 5000);
  db.prepare('INSERT INTO realm_boss_contributions (iso_week, character_id, damage, strikes, claimed_at) VALUES (?, ?, 10, 1, ?)').run(wk, ids.rival, Date.now());
  assert.equal((await call('POST', `/realm-boss/${wk}/reset`, tok.a1)).status, 409, 'вече прибрана награда');
  assert.equal((await call('POST', '/realm-boss/2001-W01/reset', tok.a1)).status, 404);
});

test('сезон: класиране с прогнозна награда; финализацията вика играта (404 → 200 → 409)', async () => {
  const db = getDb();
  const cur = seasonKeyFor();
  const prev = prevSeasonKey();
  db.prepare('INSERT INTO season_scores (season_key, character_id, points, updated_at) VALUES (?, ?, 90, 1)').run(cur, ids.hero);
  const s = await call('GET', '/season', tok.a2);
  assert.deepEqual([s.status, s.json.season, s.json.standings[0].name, s.json.standings[0].projected.gems], [200, cur, 'HeroOne', 1000]);
  assert.equal((await call('GET', '/season?season=2026-13', tok.a2)).status, 400);
  assert.equal((await call('POST', '/season/finalize', tok.a2)).status, 404, 'предишният сезон няма точки');
  db.prepare('INSERT INTO season_scores (season_key, character_id, points, updated_at) VALUES (?, ?, 50, 1)').run(prev, ids.rival);
  const gems0 = (db.prepare('SELECT gems FROM characters WHERE id = ?').get(ids.rival) as any).gems;
  const f = await call('POST', '/season/finalize', tok.a2);
  assert.deepEqual([f.status, f.json.season, f.json.ranked], [200, prev, 1]);
  assert.equal((db.prepare('SELECT gems FROM characters WHERE id = ?').get(ids.rival) as any).gems, gems0 + 1000, 'наградата е от game/seasons.ts');
  assert.equal((await call('POST', '/season/finalize', tok.a2)).status, 409);
  assert.equal(lastAudit('season_finalize')?.meta.after.season, prev);
});

/* ===================== Чат ===================== */
test('чат: преглед по източник/потребител/време; изтриването минава през свалянето (одит)', async () => {
  const db = getDb();
  const t0 = Date.now() - 10_000;
  const g = Number(db.prepare("INSERT INTO global_chat (channel, character_id, message, created_at) VALUES ('global', ?, 'buy gold cheap', ?)").run(ids.rival, t0).lastInsertRowid);
  db.prepare("INSERT INTO global_chat (channel, character_id, message, created_at) VALUES ('global', ?, 'hello all', ?)").run(ids.hero, t0 + 5000);
  const byUser = await call('GET', `/chat?source=global&character_id=${ids.rival}`, tok.a2);
  assert.deepEqual(byUser.json.messages.map((m: any) => m.id), [g]);
  assert.equal(byUser.json.messages[0].username, 'Other');
  const bySince = await call('GET', `/chat?source=global&since=${t0 + 1000}`, tok.a2);
  assert.deepEqual(bySince.json.messages.map((m: any) => m.message), ['hello all']);
  assert.equal((await call('GET', '/chat?source=dm', tok.a2)).status, 400);
  const del = await call('POST', '/moderation/takedown', tok.a2, { kind: 'global_chat_message', targetId: g, reason: 'Gold selling spam', notify: false });
  assert.equal(del.status, 200);
  assert.equal(db.prepare('SELECT 1 FROM global_chat WHERE id = ?').get(g), undefined);
  assert.equal(lastAudit('takedown')?.meta.before.content, 'buy gold cheap');
});

/* ===================== Статично съдържание / магазин ===================== */
test('съдържание: преглед на сетове/подземия/козметика; замени на продуктите стигат до магазина', async () => {
  for (const p of ['/content/sets', '/content/dungeons', '/content/cosmetics', '/content/achievements', '/content/realm-bosses']) {
    const r = await call('GET', p, tok.a4);
    assert.equal(r.status, 200, p);
  }
  assert.ok((await call('GET', '/content/sets', tok.a4)).json.sets.length > 10);
  assert.equal((await call('PUT', '/content/products/nope', tok.a4, { enabled: false })).status, 404);
  assert.equal((await call('PUT', '/content/products/gems_pouch', tok.a4, { price_cents: 10 })).status, 400, 'под минимума на Stripe');
  assert.equal((await call('PUT', '/content/products/gems_pouch', tok.a4, { price_cents: 4.5 })).status, 400, 'само цели центове');
  assert.equal((await call('PUT', '/content/products/gems_pouch', tok.a4, {})).status, 400);
  const r = await call('PUT', '/content/products/gems_pouch', tok.a4, { price_cents: 399, enabled: false });
  assert.deepEqual([r.status, r.json.product.price_cents, r.json.product.enabled], [200, 399, false]);
  assert.deepEqual([lastAudit('product_override')?.meta.before.price_cents, lastAudit('product_override')?.meta.after.price_cents], [499, 399]);
  const { effectiveProducts, findPurchasableProduct } = await import('../productOverrides');
  assert.equal(findPurchasableProduct('gems_pouch'), undefined, 'изключен → не се купува');
  assert.equal(effectiveProducts().find((p) => p.kind === 'gems_pouch')?.price_cents, 399);
  await call('PUT', '/content/products/gems_pouch', tok.a4, { price_cents: null, enabled: true });
  assert.equal(findPurchasableProduct('gems_pouch')?.price_cents, 499, 'върнато към каталога');
  assert.equal(getDb().prepare("SELECT 1 FROM settings WHERE key = 'product:gems_pouch'").get(), undefined, 'празна замяна → без ред');
});

test('всяка успешна нова мутация е одитирана изрично (без предпазната мрежа)', () => {
  const n = (getDb().prepare("SELECT COUNT(*) AS c FROM event_log WHERE message LIKE 'Unaudited admin%'").get() as { c: number }).c;
  assert.equal(n, 0);
});
