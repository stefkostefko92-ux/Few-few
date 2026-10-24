// Регресионни тестове за одита „известни проблеми" (фаза 3): класов лут,
// магазин по клас, гем→злато, маунтове, гилдия без лидер, DSA чл. 16(5),
// настройки (един източник + реален потребител), APEX XP, ранни оръжия.
// Изолирана in-memory база — задай ПРЕДИ първия getDb(); роутерите се
// зареждат динамично в before() (виж admin.test.ts).
process.env.DB_PATH = ':memory:';

import test, { after, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type Router } from 'express';
import { getDb } from '../../db';
import { signToken } from '../../middleware/auth';
import { ITEM_SEED } from '../../seed/items';
import { ITEM_SETS } from '../../seed/sets';
import { SET_SELL_PRICE } from '../../seed/setPieces';
import { DUNGEONS } from '../../seed/dungeons';
import { pickClassLoot, lootClassOk } from '../drops';
import { dealsForDay } from '../dailyDeals';
import { MOUNT_TIERS } from '../mountAddons';
import { detachFromGuild } from '../guild';
import { eraseUser } from '../../lib/erasure';
import { executeTrade } from '../../lib/tradeExec';
import { setMailTransportForTests, sendMail, type MailTransport } from '../../lib/email';
import { buildNoticeDecisionMail, notifyNoticeDecision } from '../../lib/adminModeration';
import {
  SETTINGS_CATALOG, settingBounds, validateSettingValue, setSetting, getSetting, clearSettingsCache,
} from '../settings';
import { huntKillXp, APEX_XP_PACE_MULT } from '../rewardFormulas';
import { paceXpForKill } from '../progression';
import { MONSTER_SEED } from '../../seed/monsters';

type Seed = Record<string, any>;
const ITEMS = ITEM_SEED as Seed[];
const bySlug = new Map(ITEMS.map((i) => [i.slug, i]));
const db = getDb();
{
  const cols = ['slug', 'name', 'category', 'sub_type', 'tier', 'rarity', 'level_req', 'class_req', 'atk_min', 'atk_max', 'defense',
    'hp_bonus', 'mp_bonus', 'str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'buy_price', 'sell_price',
    'icon', 'description', 'set_slug'];
  const ins = db.prepare(`INSERT INTO items (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
  db.transaction(() => { for (const it of ITEMS) ins.run({ set_slug: '', class_req: '', sub_type: '', ...it }); })();
}
const itemId = (slug: string) => (db.prepare('SELECT id FROM items WHERE slug = ?').get(slug) as { id: number }).id;

let seq = 0;
function mkUser(country = 'BG', admin = 0): { uid: number; token: string } {
  const now = Date.now();
  const name = `U${++seq}`;
  const uid = Number(db.prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at, is_admin, country) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, `${name.toLowerCase()}@example.com`, 'x', now, now, admin, country).lastInsertRowid);
  return { uid, token: signToken({ uid, username: name }) };
}
function mkChar(uid: number, cls = 'warrior', level = 30, gold = 0): number {
  return Number(db.prepare('INSERT INTO characters (user_id, name, class, level, gold, energy_updated_at, created_at) VALUES (?, ?, ?, ?, ?, 0, 0)')
    .run(uid, `Hero${++seq}`, cls, level, gold).lastInsertRowid);
}
const goldOf = (id: number) => (db.prepare('SELECT gold FROM characters WHERE id = ?').get(id) as { gold: number }).gold;

let server: Server;
let base = '';
const routers: Record<string, Router> = {};
before(async () => {
  routers.shop = (await import('../../routes/shop')).default;
  routers.faction = (await import('../../routes/faction')).default;
  routers.inventory = (await import('../../routes/inventory')).default;
  routers.account = (await import('../../routes/account')).default;
  routers.admin = (await import('../../routes/admin')).default;
  await import('../../routes/dsa'); // създава dsa_notices
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  for (const [k, r] of Object.entries(routers)) app.use(`/api/${k}`, r);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server?.close(); setMailTransportForTests(undefined); });

async function call(method: string, p: string, token: string, body?: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(`${base}${p}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* не-JSON */ }
  return { status: r.status, json };
}

/* ═════════════ 2. класов лут (подземия + Mythic+) и магазин ═════════════ */

test('подземия/M+: лутът никога не е чужд клас; делът сет↔общ е като на суровия пул', () => {
  const band = DUNGEONS.filter((d) => d.loot_pool.some((s) => bySlug.get(s)?.set_slug));
  assert.ok(band.length >= 10);
  for (const d of band) {
    const rawSetShare = d.loot_pool.filter((s) => bySlug.get(s)?.set_slug).length / d.loot_pool.length;
    for (const cls of ['warrior', 'ranger', 'mage', 'rogue']) {
      let set = 0; const N = 2000;
      let x = 12345;
      const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
      for (let i = 0; i < N; i++) {
        const slug = pickClassLoot(d.loot_pool, cls, rand)!;
        assert.ok(slug, `${d.slug}: празен дроп`);
        assert.ok(lootClassOk(slug, cls), `${d.slug}: ${slug} е за ${bySlug.get(slug)!.class_req}, а героят е ${cls}`);
        if (bySlug.get(slug)!.set_slug) set++;
      }
      assert.ok(Math.abs(set / N - rawSetShare) < 0.04, `${d.slug}/${cls}: дял сет ${(set / N).toFixed(2)} ≠ ${rawSetShare.toFixed(2)}`);
    }
  }
  // Преди: равномерно от целия пул → ~3/4 от сет частите бяха чужди.
  const d = band[0];
  const foreign = d.loot_pool.filter((s) => bySlug.get(s)?.set_slug && !lootClassOk(s, 'mage')).length;
  assert.ok(foreign / d.loot_pool.filter((s) => bySlug.get(s)?.set_slug).length > 0.5, 'пулът наистина съдържа чужди части');
});

test('магазин: показва само предмети за класа на героя; /buy отказва чужд клас', async () => {
  const { uid, token } = mkUser();
  mkChar(uid, 'mage', 10, 10_000);
  const r = await call('GET', '/api/shop', token);
  assert.equal(r.status, 200);
  const items = r.json.items as Seed[];
  assert.ok(items.some((i) => i.slug === 'acolyte_staff'), 'своят класов сет се вижда');
  assert.ok(!items.some((i) => i.class_req && i.class_req !== 'mage'), 'чужд клас в магазина');
  const foreign = await call('POST', '/api/shop/buy', token, { itemId: itemId('militia_sword'), quantity: 1 });
  assert.equal(foreign.status, 400);
  const own = await call('POST', '/api/shop/buy', token, { itemId: itemId('acolyte_staff'), quantity: 1 });
  assert.equal(own.status, 200);
  // Дневните оферти са общи за всички → без класово заключени предмети.
  for (let day = 20000; day < 20060; day++) {
    for (const deal of dealsForDay(db, day)) {
      const cr = (db.prepare('SELECT class_req FROM items WHERE id = ?').get(deal.item_id) as { class_req: string }).class_req;
      assert.equal(cr, '', `ден ${day}: оферта с class_req ${cr}`);
    }
  }
});

/* ═════════════ 3. гем → злато ═════════════ */

test('уникатите извън магазина се продават по кривата на тира (без печатане на злато)', () => {
  const EQUIP = ['weapon', 'armor', 'helm', 'shield', 'gloves', 'boots', 'ring', 'amulet', 'cloak'];
  for (const it of ITEMS) {
    if (it.buy_price > 0 || !EQUIP.includes(it.category)) continue;
    assert.ok(it.sell_price <= SET_SELL_PRICE[it.tier], `${it.slug}: sell ${it.sell_price} > крива T${it.tier} ${SET_SELL_PRICE[it.tier]}`);
  }
  // caethra_crown (lv 260) е в лентата T8 (tierForEffectiveLevel) → кривата на T8.
  assert.equal(bySlug.get('caethra_crown')!.sell_price, SET_SELL_PRICE[8]);
});

test('фракционен вендор: само злато (без P2W), купи→продай не печели злато', async () => {
  const { VENDOR_STOCK } = await import('../../routes/faction');
  const { uid, token } = mkUser();
  const cid = mkChar(uid, 'mage', 300, 1_000_000);
  db.prepare('UPDATE characters SET gems = 10000 WHERE id = ?').run(cid);
  for (const f of Object.keys(VENDOR_STOCK)) {
    db.prepare('INSERT INTO character_faction_rep (character_id, faction_slug, rep, updated_at) VALUES (?, ?, 99999, 0)').run(cid, f);
  }
  for (const [faction, stock] of Object.entries(VENDOR_STOCK)) {
    for (const offer of stock) {
      assert.ok(!('gems' in offer), `${offer.slug}: гем-цена на фракционния вендор`);
      const goldBefore = goldOf(cid);
      const b = await call('POST', `/api/faction/${faction}/vendor/buy`, token, { slug: offer.slug });
      assert.equal(b.status, 200, `${offer.slug}: ${JSON.stringify(b.json)}`);
      assert.equal(goldOf(cid), goldBefore - offer.gold, `${offer.slug}: цената не е удържана в злато`);
      const inv = db.prepare(`SELECT inv.id, inv.soul_bound, inv.gem_bought FROM inventory inv JOIN items i ON i.id = inv.item_id
                              WHERE inv.character_id = ? AND i.slug = ? ORDER BY inv.id DESC LIMIT 1`).get(cid, offer.slug) as { id: number; soul_bound: number; gem_bought: number };
      assert.equal(inv.gem_bought, 0, `${offer.slug}: gem_bought`);
      const s = await call('POST', '/api/inventory/sell', token, { inventoryId: inv.id });
      assert.equal(s.status, 200);
      assert.ok(goldOf(cid) < goldBefore, `${offer.slug}: купи ${offer.gold} → продай печели злато`);
    }
  }
  assert.equal((db.prepare('SELECT gems FROM characters WHERE id = ?').get(cid) as { gems: number }).gems, 10000, 'вендорът взе гемове');
});

test('маунтове: цена, CDR и бойни статове растат монотонно с tier-а', async () => {
  const { MOUNTS } = await import('../../routes/mount');
  const sorted = [...MOUNTS].sort((a, b) => a.tier - b.tier);
  const power = (m: typeof MOUNTS[number]) => m.phys_dmg_bonus + m.phys_def_bonus + m.mag_dmg_bonus + m.mag_def_bonus;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    assert.ok(b.tier > a.tier, 'уникален tier');
    assert.ok(b.gem_cost > a.gem_cost, `${b.slug} (${b.gem_cost}) не е по-скъп от ${a.slug} (${a.gem_cost})`);
    assert.ok(b.cooldown_reduction_pct >= a.cooldown_reduction_pct, `${b.slug}: CDR пада`);
    assert.ok(power(b) > power(a), `${b.slug}: по-слаб от ${a.slug}`);
  }
  for (const m of MOUNTS) assert.equal(MOUNT_TIERS[m.slug], m.tier, `${m.slug}: MOUNT_TIERS разминаване`);
});

/* ═════════════ 5. P2P злато — такса = пазарната настройка ═════════════ */

test('размяна: таксата следва market_fee_pct (един източник с пазара)', () => {
  const A = mkChar(mkUser().uid, 'warrior', 30, 1000);
  const B = mkChar(mkUser().uid, 'warrior', 30, 0);
  setSetting('market_fee_pct', 10);
  try {
    db.prepare(`INSERT INTO trade_offers (id, from_id, to_id, from_items, to_items, from_gold, to_gold, from_ready, to_ready, status, created_at, updated_at)
                VALUES (900, ?, ?, '[]', '[]', 1000, 0, 1, 1, 'pending', 0, 0)`).run(A, B);
    executeTrade(db, { id: 900, from_id: A, to_id: B, from_items: '[]', to_items: '[]', from_gold: 1000, to_gold: 0 });
    assert.equal(goldOf(A), 0);
    assert.equal(goldOf(B), 900);
  } finally { setSetting('market_fee_pct', 5); }
});

/* ═════════════ 6. гилдия без лидер ═════════════ */

function mkGuild(leader: number, members: { id: number; role: string; joined: number }[]): number {
  const gid = Number(db.prepare(`INSERT INTO guilds (name, tag, leader_id, created_at) VALUES (?, ?, ?, 0)`).run(`G${++seq}`, `T${seq}`, leader).lastInsertRowid);
  db.prepare(`INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, 'leader', 0)`).run(gid, leader);
  for (const m of members) db.prepare('INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, ?, ?)').run(gid, m.id, m.role, m.joined);
  return gid;
}
const leaderOf = (gid: number) => (db.prepare('SELECT leader_id FROM guilds WHERE id = ?').get(gid) as { leader_id: number } | undefined)?.leader_id;
const roleOf = (cid: number) => (db.prepare('SELECT role FROM guild_members WHERE character_id = ?').get(cid) as { role: string } | undefined)?.role;

test('изтриване на ГЕРОЙ-лидер: лидерството минава на най-високия по ранг, при равенство — по стаж', async () => {
  const L = mkUser();
  const leader = mkChar(L.uid);
  const oldMember = mkChar(mkUser().uid);
  const officerNew = mkChar(mkUser().uid);
  const officerOld = mkChar(mkUser().uid);
  const gid = mkGuild(leader, [
    { id: oldMember, role: 'member', joined: 1 },
    { id: officerNew, role: 'officer', joined: 50 },
    { id: officerOld, role: 'officer', joined: 10 },
  ]);
  // Трезор: дарен от лидера предмет остава в гилдията.
  const inv = Number(db.prepare(`INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, vaulted_guild_id) VALUES (?, ?, 1, 0, '', ?)`).run(leader, itemId('iron_sword'), gid).lastInsertRowid);
  db.prepare('INSERT INTO guild_vault (guild_id, inventory_id, deposited_by, deposited_at) VALUES (?, ?, ?, 0)').run(gid, inv, leader);
  const r = await call('POST', '/api/account/delete-character', L.token, { confirm: 'DELETE' });
  assert.equal(r.status, 200, 'преди: FK RESTRICT на guilds.leader_id → 500');
  assert.equal(leaderOf(gid), officerOld, 'най-старият офицер поема');
  assert.equal(roleOf(officerOld), 'leader');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM guild_members WHERE guild_id = ?').get(gid) as { c: number }).c, 3);
  const vaulted = db.prepare('SELECT character_id, vaulted_guild_id FROM inventory WHERE id = ?').get(inv) as { character_id: number; vaulted_guild_id: number };
  assert.deepEqual(vaulted, { character_id: officerOld, vaulted_guild_id: gid }, 'дареното остава в трезора');
  assert.ok(db.prepare('SELECT 1 FROM guild_vault WHERE inventory_id = ?').get(inv), 'редът в трезора не изчезва с героя');
});

test('изтриване на АКАУНТ на лидер: гилдията НЕ се разпуска, а се предава; празна гилдия се разпуска', () => {
  const L = mkUser();
  const leader = mkChar(L.uid);
  const member = mkChar(mkUser().uid);
  const gid = mkGuild(leader, [{ id: member, role: 'member', joined: 5 }]);
  db.transaction(() => eraseUser(db, L.uid))();
  assert.equal(leaderOf(gid), member, 'членът поема (преди: цялата гилдия се триеше)');
  // Последният член напуска → разпускане; трезорът се връща на притежателя.
  const inv = Number(db.prepare(`INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, vaulted_guild_id) VALUES (?, ?, 1, 0, '', ?)`).run(member, itemId('iron_sword'), gid).lastInsertRowid);
  const out = db.transaction(() => detachFromGuild(db, member))();
  assert.equal(out.disbanded, true);
  assert.equal(leaderOf(gid), undefined);
  assert.equal((db.prepare('SELECT vaulted_guild_id FROM inventory WHERE id = ?').get(inv) as { vaulted_guild_id: number }).vaulted_guild_id, 0, 'предметът е върнат');
});

/* ═════════════ 7. DSA чл. 16(5) — уведомяване на подателя ═════════════ */

test('DSA: писмото е на езика на подателя (BG/IT/иначе EN) и съдържа решението + защита', () => {
  const bg = buildNoticeDecisionMail({ noticeId: 7, outcome: 'actioned', decision: 'чатът е изтрит', lang: 'bg' });
  assert.match(bg.subject, /сигнал №7/);
  assert.match(bg.text, /предприехме действие/);
  assert.match(bg.text, /чл\. 21/);
  const it = buildNoticeDecisionMail({ noticeId: 7, outcome: 'rejected', decision: 'x', lang: 'it' });
  assert.match(it.text, /non intervenire/);
  const en = buildNoticeDecisionMail({ noticeId: 7, outcome: 'rejected', decision: 'x', lang: 'en' });
  assert.match(en.text, /decided not to take action/);
});

test('DSA: решение по сигнал (takedown / reject) праща имейл на подателя; без SMTP — лог, без грешка', async () => {
  const sent: { to: string; subject: string; text: string }[] = [];
  const mock: MailTransport = { sendMail: (async (m: any) => { sent.push({ to: m.to, subject: m.subject, text: m.text }); return {}; }) as any };
  setMailTransportForTests(mock);
  const admin = mkUser('BG', 1);
  const author = mkChar(mkUser().uid);
  const msg = Number(db.prepare('INSERT INTO global_chat (character_id, message, created_at) VALUES (?, ?, ?)').run(author, 'лошо съобщение', Date.now()).lastInsertRowid);
  const newNotice = (email: string | null, country: string | null) => Number(db.prepare(
    `INSERT INTO dsa_notices (content_kind, content_ref, reason, description, notifier_email, good_faith, ip_country, created_at)
     VALUES ('chat', 'x', 'other', 'описание на сигнала', ?, 1, ?, 0)`).run(email, country).lastInsertRowid);

  const n1 = newNotice('reporter@example.com', 'BG');
  const t = await call('POST', '/api/admin/moderation/takedown', admin.token, { kind: 'global_chat_message', targetId: msg, reason: 'нарушение на условията', noticeId: n1 });
  assert.equal(t.status, 200, JSON.stringify(t.json));
  for (let i = 0; i < 50 && sent.length < 1; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'reporter@example.com');
  assert.match(sent[0].subject, /Решение по вашия сигнал/);
  assert.ok((db.prepare('SELECT notifier_notified_at FROM dsa_notices WHERE id = ?').get(n1) as { notifier_notified_at: number }).notifier_notified_at > 0);

  const n2 = newNotice('it@example.com', null); // неизвестна държава → EN
  const r = await call('POST', `/api/admin/moderation/dsa/${n2}/reject`, admin.token, { decision: 'не е незаконно' });
  assert.equal(r.status, 200);
  for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((res) => setTimeout(res, 10));
  assert.equal(sent.length, 2);
  assert.match(sent[1].subject, /^Decision on your notice/);
  assert.match(sent[1].text, /не е незаконно/);

  const n3 = newNotice(null, 'IT'); // анонимен → нищо
  assert.equal(await notifyNoticeDecision(db, n3), false);
  assert.equal(sent.length, 2);

  setMailTransportForTests(null); // SMTP не е конфигуриран (dev)
  assert.equal(await sendMail({ to: 'a@example.com', subject: 's', text: 't' }), false);
  setMailTransportForTests({ sendMail: (async () => { throw new Error('boom'); }) as any });
  assert.equal(await sendMail({ to: 'a@example.com', subject: 's', text: 't' }), false, 'грешка при пращане не хвърля');
  setMailTransportForTests(undefined);
});

/* ═════════════ 8/10. настройки: един източник + реален потребител ═════════════ */

test('настройки: границите са в описанието, админ API-то ги чете оттам', async () => {
  const admin = mkUser('BG', 1);
  for (const d of SETTINGS_CATALOG) {
    if (d.type === 'int' || d.type === 'float') {
      assert.ok(d.min !== undefined && d.max !== undefined && d.min <= Number(d.default) && Number(d.default) <= d.max, `${d.key}: min/max`);
      assert.equal(validateSettingValue(d, d.max! + 1).ok, false, `${d.key}: над max`);
      assert.equal(validateSettingValue(d, d.min! - 1).ok, false, `${d.key}: под min`);
      assert.equal(validateSettingValue(d, d.default).ok, true);
    }
  }
  const g = await call('GET', '/api/admin/settings', admin.token);
  for (const row of g.json.settings) assert.deepEqual(row.bounds, settingBounds(row.def), row.def.key);
  // stat_upgrade_base_cost 0 би зациклил affordableUpgrades → min 1.
  assert.equal((await call('PUT', '/api/admin/settings/stat_upgrade_base_cost', admin.token, { value: 0 })).status, 400);
  const adminDir = path.join(__dirname, '../../routes/admin');
  const adminSrc = fs.readdirSync(adminDir).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(adminDir, f), 'utf8')).join('\n');
  assert.equal(adminSrc.includes('SETTING_BOUNDS'), false, 'втори източник на граници');
});

test('настройки: всяка е прочетена от играта (нито една „мъртва" в панела); кешът се обновява при запис', () => {
  const root = path.join(__dirname, '../..');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== '__tests__') walk(p); } else if (p.endsWith('.ts')) files.push(p); } };
  walk(root);
  // settings.ts се брои само за liveCombatTuning (подава се на боя от маршрутите).
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  for (const d of SETTINGS_CATALOG) {
    const re = new RegExp(`(getSetting|isSettingSet)(<[^>]+>)?\\('${d.key}'`);
    assert.ok(re.test(src), `${d.key}: никой не я чете`);
  }
  clearSettingsCache();
  assert.equal(getSetting('rename_cost_gold'), 250);
  setSetting('rename_cost_gold', 777);
  assert.equal(getSetting('rename_cost_gold'), 777, 'кешът е инвалидиран');
  setSetting('rename_cost_gold', 250);
});

/* ═════════════ 9. APEX XP и ранните оръжия ═════════════ */

test('APEX XP: до 3× pace (над 1.8× тавана на обикновените, под стария 5×)', () => {
  for (const m of MONSTER_SEED as Seed[]) {
    if (!m.slug.includes('_apex_')) continue;
    const pace = paceXpForKill(m.level);
    const xp = huntKillXp(m.level, m.xp_reward, true);
    assert.ok(xp <= Math.round(pace * APEX_XP_PACE_MULT), `${m.slug}: ${xp} > ${APEX_XP_PACE_MULT}× pace`);
    assert.ok(xp > Math.round(pace * 1.8), `${m.slug}: APEX не е премия`);
  }
});

test('ранни оръжия (lv ≤ 60): по-високо ниво никога не е по-слабо (без Dragonbane-тип T5 на lv 25)', () => {
  const APEX_UNIQUES = new Set(['khalad_fang', 'gorvak_mace', 'vex_staff']);
  const ws = ITEMS.filter((i) => i.category === 'weapon' && i.level_req <= 60 && !APEX_UNIQUES.has(i.slug));
  const pow = (i: Seed) => i.atk_min + i.atk_max;
  for (const a of ws) for (const b of ws) {
    if (a.sub_type !== b.sub_type || a.level_req >= b.level_req) continue;
    assert.ok(pow(a) <= pow(b), `${a.slug} (lv ${a.level_req}, ${pow(a)}) > ${b.slug} (lv ${b.level_req}, ${pow(b)})`);
  }
});
