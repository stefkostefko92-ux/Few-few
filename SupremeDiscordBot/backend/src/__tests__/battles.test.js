// backend/src/__tests__/battles.test.js
// v53 — статистиките и битките на спътниците (lib/game/battles.js): формулите,
// таваните и цените, детерминизмът на симулатора (едно зърно = една битка) и
// БАЛАНСЪТ като гейт — четирите статистики тежат еднакво, тренировката и
// формата имат смисъл, но не правят битката предрешена, а семействата са
// различни, не по-силни. Смяна на константа, която чупи това, пада тук.
import { describe, it, expect } from "vitest";

const B = await import("../lib/game/battles.js");
const { COMPANIONS, companionById } = await import("../lib/game/companions.js");

const lv = (n) => ({ atk: n, def: n, spd: n, hp: n });
const sideOf = (id, stage = 1, levels = {}) => B.effectiveStats(id, stage, levels);

/** Дял победи на нападателя при N фиксирани зърна (детерминистично → стабилен гейт). */
function winRate(a, d, n = 2000) {
  let w = 0;
  for (let i = 1; i <= n; i++) if (B.simulateBattle(a, d, Math.imul(i, 2654435761) >>> 0).winner === "attacker") w++;
  return w / n;
}

describe("статистики", () => {
  it("основа: 20 + редкост + семейство; lime common = 20 навсякъде", () => {
    expect(B.baseStats("lime-blip")).toEqual({ atk: 20, def: 20, spd: 20, hp: 20 });
    expect(B.baseStats("ember-spark")).toEqual({ atk: 26, def: 18, spd: 19, hp: 18 });
    // legendary (+4) с профила на gold
    expect(companionById("gold-midas").rarity).toBe("legendary");
    expect(B.baseStats("gold-midas")).toEqual({ atk: 27, def: 28, spd: 21, hp: 21 });
    expect(B.baseStats("няма-такъв")).toBeNull();
  });

  it("всяко семейство от каталога има профил, а всеки спътник — положителни цели точки", () => {
    for (const c of COMPANIONS) {
      expect(B.FAMILY_OFFSETS[c.family], c.family).toBeDefined();
      const s = B.baseStats(c.id);
      for (const k of B.STAT_KEYS) {
        expect(Number.isInteger(s[k])).toBe(true);
        expect(s[k]).toBeGreaterThan(0);
      }
    }
  });

  it("семействата са различни, не по-силни: произведението е в ±1,5 % от lime при всяка редкост и форма", () => {
    for (const c of COMPANIONS) {
      for (const stage of [1, 2, 3]) {
        const s = B.effectiveStats(c.id, stage);
        const even = B.BASE_POINTS + B.RARITY_BONUS[c.rarity] + B.STAGE_BONUS[stage];
        const ratio = (s.atk * s.def * s.spd * (s.hp / B.HP_SCALE)) / even ** 4;
        expect(Math.abs(Math.log(ratio)), `${c.id} ф${stage}`).toBeLessThan(Math.log(1.015));
      }
    }
  });

  it("форма и тренировка се събират; животът е ×5; силата следва произведението", () => {
    expect(B.effectiveStats("lime-blip", 1)).toEqual({ atk: 20, def: 20, spd: 20, hp: 100, power: 80 });
    expect(B.effectiveStats("lime-blip", 2)).toMatchObject({ atk: 22, hp: 110, power: 88 });
    expect(B.effectiveStats("lime-blip", 3, { atk: 2, hp: 1 })).toMatchObject({ atk: 28, def: 24, spd: 24, hp: 130 });
    // +2 на най-слабата статистика вдига силата повече от +2 на най-силната
    const weak = B.effectiveStats("ember-spark", 1, { def: 1 }).power;
    const strong = B.effectiveStats("ember-spark", 1, { atk: 1 }).power;
    expect(weak).toBeGreaterThanOrEqual(strong);
    expect(B.effectiveStats("няма-такъв")).toBeNull();
  });

  it("цени 20…200, тавани 4/7/10 по форма", () => {
    expect([...Array(10).keys()].map(B.trainCost)).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(B.trainCost(-3)).toBe(20);
    expect(B.STAT_CAP).toEqual({ 1: 4, 2: 7, 3: 10 });
    expect(B.STAT_CAP[3]).toBe(B.MAX_STAT_LEVEL);
  });

  it("statSheet: нивата от колоните, следваща цена и null на тавана, рекорд", () => {
    const sheet = B.statSheet({ companionId: "lime-blip", stage: 1, atkLevel: 4, defLevel: 2, spdLevel: 0, hpLevel: null, wins: 3, losses: 1 });
    expect(sheet.levels).toEqual({ atk: 4, def: 2, spd: 0, hp: 0 });
    expect(sheet.cap).toBe(4);
    expect(sheet.nextCost).toEqual({ atk: null, def: 60, spd: 20, hp: 20 });
    expect(sheet.stats).toMatchObject({ atk: 28, def: 24 });
    expect(sheet).toMatchObject({ wins: 3, losses: 1 });
    // еволюцията вдига тавана → същото ниво 4 вече има следваща цена
    expect(B.statSheet({ companionId: "lime-blip", stage: 2, atkLevel: 4 }).nextCost.atk).toBe(100);
  });
});

describe("наградата", () => {
  it("по-силен противник → 15; съпоставим → 10; много по-слаб (под 0,85) → 0", () => {
    expect(B.winReward(80, 88)).toEqual({ tier: "underdog", sparks: B.UNDERDOG_SPARKS });
    expect(B.winReward(80, 80)).toEqual({ tier: "fair", sparks: B.WIN_SPARKS });
    expect(B.winReward(100, 85)).toEqual({ tier: "fair", sparks: B.WIN_SPARKS });
    expect(B.winReward(100, 84)).toEqual({ tier: "easy", sparks: 0 });
  });

  it("шансът е 50 % при равни и расте със силата", () => {
    expect(B.winChance(80, 80)).toBeCloseTo(0.5, 5);
    expect(B.winChance(88, 80)).toBeGreaterThan(0.65);
    expect(B.winChance(80, 88)).toBeLessThan(0.35);
  });
});

describe("симулаторът", () => {
  const a = sideOf("ember-spark", 2, { atk: 3 });
  const d = sideOf("ice-frost", 2, { def: 2, hp: 1 });

  it("PRNG: същото зърно → същата редица; различно → различна", () => {
    const r1 = B.prng(42), r2 = B.prng(42), r3 = B.prng(43);
    const s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()], s3 = [r3(), r3(), r3()];
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    for (const x of s1) expect(x >= 0 && x < 1).toBe(true);
  });

  it("същото зърно → същата битка (одит/повторение)", () => {
    expect(B.simulateBattle(a, d, 123456)).toEqual(B.simulateBattle(a, d, 123456));
  });

  it("събитията са последователни: животът само слиза, крайният съвпада, победителят е верен", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = B.simulateBattle(a, d, seed);
      let hpA = a.hp, hpB = d.hp;
      for (const e of r.events) {
        expect(e.hpA).toBeLessThanOrEqual(hpA);
        expect(e.hpB).toBeLessThanOrEqual(hpB);
        if (e.dodge) expect(e.dmg).toBe(0); else expect(e.dmg).toBeGreaterThanOrEqual(1);
        if (e.by === "a") expect(e.hpA).toBe(hpA); else expect(e.hpB).toBe(hpB);
        hpA = e.hpA; hpB = e.hpB;
      }
      expect([r.hpA, r.hpB]).toEqual([hpA, hpB]);
      expect(r.turns).toBe(r.events.length);
      expect(r.turns).toBeLessThanOrEqual(B.MAX_ACTIONS);
      expect(r.winner).toBe(hpB === 0 ? "attacker" : "defender");
    }
  });

  it("таван на действията: печели по-високият процент живот, при равенство — защитникът", () => {
    const tank = { atk: 1, def: 1000, spd: 10, hp: 100000 };
    const r = B.simulateBattle(tank, tank, 7);
    expect(r.turns).toBe(B.MAX_ACTIONS);
    expect(r.hpA).toBeGreaterThan(0);
    expect(r.hpB).toBeGreaterThan(0);
    expect(r.winner).toBe(r.hpA > r.hpB ? "attacker" : "defender");
  });
});

describe("балансът (гейт)", () => {
  it("равни спътници → около 50 %", () => {
    const p = winRate(sideOf("lime-blip"), sideOf("lime-wobble"));
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it("+1 ниво на КОЯ ДА Е статистика тежи еднакво (51–60 %)", () => {
    const rates = B.STAT_KEYS.map((k) => winRate(sideOf("lime-blip", 1, { [k]: 1 }), sideOf("lime-wobble")));
    for (const p of rates) {
      expect(p).toBeGreaterThan(0.51);
      expect(p).toBeLessThan(0.6);
    }
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(0.05);
  });

  it("тренировката има смисъл, но не предрешава: +1 → 65–80 %, +2 → 80–93 %, +4 → над 95 %", () => {
    const one = winRate(sideOf("lime-blip", 1, lv(1)), sideOf("lime-wobble"));
    const two = winRate(sideOf("lime-blip", 1, lv(2)), sideOf("lime-wobble"));
    const four = winRate(sideOf("lime-blip", 1, lv(4)), sideOf("lime-wobble"));
    expect(one).toBeGreaterThan(0.65);
    expect(one).toBeLessThan(0.8);
    expect(two).toBeGreaterThan(0.8);
    expect(two).toBeLessThan(0.93);
    expect(four).toBeGreaterThan(0.95);
  });

  it("формата и редкостта: форма 2 срещу 1 → 65–80 %; legendary срещу common → 80–93 %; common +2 ≈ legendary", () => {
    const f2 = winRate(sideOf("lime-blip", 2), sideOf("lime-wobble", 1));
    const leg = winRate(sideOf("gold-midas"), sideOf("lime-wobble"));
    const caught = winRate(sideOf("lime-blip", 1, lv(2)), sideOf("gold-midas"));
    expect(f2).toBeGreaterThan(0.65);
    expect(f2).toBeLessThan(0.8);
    expect(leg).toBeGreaterThan(0.8);
    expect(leg).toBeLessThan(0.93);
    expect(caught).toBeGreaterThan(0.42);
    expect(caught).toBeLessThan(0.58);
  });

  it("всеки две семейства при една и съща редкост → 42–58 %", () => {
    for (const rarity of ["common", "uncommon", "rare", "epic", "legendary"]) {
      const reps = [];
      const seen = new Set();
      for (const c of COMPANIONS) if (c.rarity === rarity && !seen.has(c.family)) { seen.add(c.family); reps.push(c); }
      for (let i = 0; i < reps.length; i++) {
        for (let j = i + 1; j < reps.length; j++) {
          const p = winRate(sideOf(reps[i].id), sideOf(reps[j].id), 1000);
          expect(p, `${reps[i].id} срещу ${reps[j].id}`).toBeGreaterThan(0.42);
          expect(p, `${reps[i].id} срещу ${reps[j].id}`).toBeLessThan(0.58);
        }
      }
    }
  });

  it("шансът по силата следва симулатора (±7 точки)", () => {
    for (const [x, y] of [[sideOf("lime-blip", 1, lv(1)), sideOf("lime-wobble")], [sideOf("lime-pip"), sideOf("lime-wobble")], [sideOf("gold-midas"), sideOf("lime-wobble")]]) {
      expect(Math.abs(B.winChance(x.power, y.power) - winRate(x, y))).toBeLessThan(0.07);
    }
  });
});
