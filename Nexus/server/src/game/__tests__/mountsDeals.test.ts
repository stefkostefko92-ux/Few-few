// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { MOUNT_ADDONS, MOUNT_TIERS, addonsForTier } from '../mountAddons';
import { dealsForDay, dealFor, DEAL_COUNT, DEAL_DISCOUNT } from '../dailyDeals';

/* ===== Маунт add-ons — формулна стълбица ===== */

test('всеки маунт има 4 докупваеми линии (скилове)', () => {
  const slugs = Object.keys(MOUNT_TIERS);
  assert.equal(slugs.length, 7, '7 маунта');
  for (const slug of slugs) {
    const addons = MOUNT_ADDONS[slug];
    assert.ok(addons, `${slug} има add-ons`);
    assert.equal(addons.length, 4, `${slug}: 4 линии`);
    for (const a of addons) {
      assert.ok(a.amount >= 1, `${slug}/${a.key}: amount > 0`);
      assert.ok(a.gem_cost >= 50, `${slug}/${a.key}: цена >= 50 гема`);
    }
  }
});

test('стълбицата е монотонна: по-висок tier → по-силни и по-скъпи линии', () => {
  for (let t = 2; t <= 7; t++) {
    const lo = addonsForTier(t - 1);
    const hi = addonsForTier(t);
    assert.ok(hi[0].amount >= lo[0].amount, `tier ${t}: dmg расте`);
    assert.ok(hi[1].amount >= lo[1].amount, `tier ${t}: def расте`);
    assert.ok(hi[0].gem_cost >= lo[0].gem_cost, `tier ${t}: цената расте`);
  }
});

test('котвата е запазена: World Serpent (tier 7) = 45/35 за 500 гема', () => {
  const s = MOUNT_ADDONS['mount_world_serpent'];
  assert.equal(s[0].amount, 45);
  assert.equal(s[1].amount, 35);
  assert.equal(s[0].gem_cost, 500);
});

/* ===== Дневни оферти — детерминизъм + баланс ===== */

// Мини пул от предмети за офертите.
const db = getDb();
const ins = db.prepare(
  `INSERT INTO items (slug, name, category, tier, level_req, class_req, buy_price, sell_price, atk_min, atk_max, defense)
   VALUES (?, ?, ?, 1, 1, '', ?, 10, 0, 0, 0)`,
);
for (let i = 1; i <= 20; i++) ins.run(`deal_item_${i}`, `Deal Item ${i}`, 'potion', 100 * i);
ins.run('mount_test', 'Mount (не се дисконтира)', 'misc', 5000);

test('дневните оферти са детерминистични за същия ден и се сменят между дни', () => {
  const a1 = dealsForDay(db, 20000);
  const a2 = dealsForDay(db, 20000);
  assert.deepEqual(a1, a2, 'същият ден → същите оферти (на всяка инстанция)');
  assert.equal(a1.length, DEAL_COUNT);
  // В рамките на седмица ротацията реално се сменя.
  const week = new Set([20000, 20001, 20002, 20003, 20004, 20005, 20006]
    .map((d) => JSON.stringify(dealsForDay(db, d))));
  assert.ok(week.size >= 2, 'офертите ротират между дните');
});

test('отстъпката е точно −30% (закръглена надолу) и никога под 1g', () => {
  for (const d of dealsForDay(db, 12345)) {
    const item = db.prepare('SELECT buy_price FROM items WHERE id = ?').get(d.item_id) as { buy_price: number };
    assert.equal(d.deal_price, Math.max(1, Math.floor(item.buy_price * (1 - DEAL_DISCOUNT))));
    assert.ok(d.deal_price < item.buy_price, 'промо цената е под редовната');
  }
});

test("маунтове/misc никога не влизат в офертите; dealFor намира само днешните", () => {
  const mountId = (db.prepare("SELECT id FROM items WHERE slug = 'mount_test'").get() as { id: number }).id;
  for (let day = 0; day < 50; day++) {
    assert.ok(!dealsForDay(db, day).some((d) => d.item_id === mountId), `ден ${day}: без misc`);
  }
  // dealFor връща оферта само ако предметът е в ДНЕШНИЯ списък.
  const today = dealsForDay(db, Math.floor(Date.now() / 86_400_000));
  const hit = dealFor(db, today[0].item_id);
  assert.ok(hit && hit.deal_price === today[0].deal_price);
});
