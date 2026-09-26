// 4b (Nexus порт, НЕ част от оригиналния boy) — покрива истинските процедурни зверове (rat/
// boar/wolf — beast-config.js) и едрите риг-преноси (golem/titan/troll мащаб, wraith hover).
// Инварианти:
//  1. resolveAll() (timeline.js) не хвърля за нито един beast/giant/wraith кит (guard/aim пози
//     от choreo-gen-attack.js beastGuardPose/beastAimTable СА геометрично разрешими).
//  2. Всеки рунд има 'roundmark' в [0, duration) — HUD/камерата разчитат точно на това.
//  3. BeastRig частите остават крайни числа през целия бой; звярът стои на земята (root.y≈0).
//  4. Регресия на "мечът минава над плъха": при hero→beast удар контактната височина (A.grip.y)
//     следва живо reg.w.head.y на звяра (timeline.js anchorY + fighter.js DYNAMIC_AIMS), не
//     фиксираната човешка ~1.5m — виж choreo-gen-attack.js beastAimTable/dynamic.
//  5. Голем/титан/трол: RigidBatcher мащабът (fighter-scale.js) държи краката над паважа и няма
//     щит; призрак (wraith): hover държи root.y над нула цялото време.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFighters } from './fixtures.js';
import { setChoreography } from '../src/choreo.js';
import { setDuration } from '../src/config.js';
import { recompileTimeline } from '../src/timeline.js';
import { buildChoreography, mulberry32 } from '../src/choreo-gen.js';
import { buildBeast } from '../src/beast-geo.js';
import { buildSerpent } from '../src/serpent-geo.js';
import { buildSpider } from '../src/spider-geo.js';
import { BEAST_SPECIES, beastBodyType, giantScale, WRAITH_HOVER, PENDING_BEASTS, bodyKind } from '../src/beast-config.js';
import { BeastFighter } from '../src/beast-fighter.js';
import { SerpentFighter } from '../src/serpent-fighter.js';
import { SpiderFighter } from '../src/spider-fighter.js';
import { Fighter } from '../src/fighter.js';
import { buildKnight } from '../src/armor.js';
import { longsword, armingSword, heaterShield } from '../src/weapons.js';
import { mace } from '../src/weapons-ranged.js';
import { Cape } from '../src/cloth.js';
import { dummyMaterials } from './fixtures.js';

const STEP = 1 / 90;
const RESULTS = ['hit', 'crit', 'block', 'dodge', 'miss'];
function genRounds(rng, n) {
  const rounds = [];
  for (let i = 0; i < n; i++) rounds.push({ attacker: rng() < 0.5 ? 'hero' : 'foe', result: RESULTS[Math.floor(rng() * RESULTS.length)] });
  return rounds;
}
const finite = (m) => m.elements.every(Number.isFinite);
const QUAD_SPECIES = Object.keys(BEAST_SPECIES).filter((s) => beastBodyType(s) === 'quad');
const BUILDER = { quad: buildBeast, serpent: buildSerpent, spider: buildSpider };
const FIGHTER_CLS = { quad: BeastFighter, serpent: SerpentFighter, spider: SpiderFighter };

// Видовете в PENDING_BEASTS (beast-config.js) още не минават визуалния преглед — в играта са рицари.
for (const species of PENDING_BEASTS) {
  test(`${species} остава рицар, докато е в PENDING_BEASTS`, () => {
    const gen = buildChoreography([{ attacker: 'hero', result: 'hit' }], true, { rng: mulberry32(7), heroClass: 'warrior', foeName: species, foeSprite: species });
    assert.notEqual(gen.kitB, species);
    assert.equal(bodyKind(species), 'knight');
  });
}

for (const species of Object.keys(BEAST_SPECIES).filter((s) => !PENDING_BEASTS.has(s))) {
  const bt = beastBodyType(species);
  const rng = mulberry32(species.length * 97 + 11);
  const rounds = genRounds(rng, 6 + Math.floor(rng() * 6));
  const victory = rng() < 0.5;
  const gen = buildChoreography(rounds, victory, { rng, heroClass: 'warrior', foeName: species, foeSprite: species });

  test(`beast fight vs ${species} (kitB=${gen.kitB}, bodyType=${bt}): resolves, roundmarks land, rig stays finite`, () => {
    assert.equal(gen.kitB, species, 'foeSprite must select the beast kit directly (loadout.js weaponKit)');
    setChoreography(gen);
    setDuration(gen.duration);
    recompileTimeline(); // throws here if a beast guard/aim key can't be resolved (invariant #1).
    const { A } = buildFighters({ kitA: gen.kitA, kitB: 'sword' }); // slot B knight unused, real body is the beast below.
    const beast = BUILDER[bt](BEAST_SPECIES[species]);
    const B = new FIGHTER_CLS[bt]('B', BEAST_SPECIES[species], beast);

    const marks = gen.EVENTS.filter((e) => e.type === 'roundmark' && e.roundIndex < rounds.length);
    assert.equal(marks.length, rounds.length, 'one roundmark per round');
    for (const m of marks) assert.ok(m.t >= 0 && m.t < gen.duration, `roundmark ${m.t} out of [0, ${gen.duration})`);

    const heroStrikes = gen.EVENTS.filter((e) => (e.type === 'strike' || e.type === 'clash') && e.by === 'A');
    let worstHeight = 0;
    for (let T = 0; T < gen.duration; T += STEP) {
      const dT = T === 0 ? 0 : STEP;
      A.update(T, dT, B);
      B.update(T, dT, A);
      for (const part of Object.values(beast.rig.parts)) assert.ok(finite(part.matrix), `non-finite beast part at T=${T.toFixed(2)} (${species})`);
      if (beast.skin) for (const bone of Object.values(beast.skin.bones)) assert.ok(finite(bone.matrix), `non-finite skin bone at T=${T.toFixed(2)} (${species})`);
      assert.ok(Math.abs(B.root.pos.y) < 0.01, `beast root should stay grounded, got y=${B.root.pos.y} (${species})`);
      for (const s of heroStrikes) {
        if (Math.abs(T - s.t) < STEP / 2) worstHeight = Math.max(worstHeight, Math.abs(A.grip.y - B.rig.w.head.y));
      }
    }
    // Regression: without the anchorY/dynamic fix this was ~1.3m (human chest height vs a rat).
    assert.ok(worstHeight < 0.35, `hero's blade misses the ${species}'s height by ${worstHeight.toFixed(2)}m at the strike apex`);
  });
}

// 4b кръг 2: торсото на "quad" видовете е сплайн-профилиран THREE.SkinnedMesh (beast-torso.js),
// не еднакви капсули — регресия срещу „наденица с глава": радиус-профилът трябва РЕАЛНО да
// варира (не константа), и различните видове трябва да имат забележимо различна ширина.
test('quad beast torsos are organic (non-constant radius profile), not a uniform tube', () => {
  const widths = {};
  for (const species of QUAD_SPECIES) {
    const S = BEAST_SPECIES[species];
    const rs = S.torsoProfile.map(([, r]) => r);
    const spread = Math.max(...rs) - Math.min(...rs);
    assert.ok(spread > 0.3, `${species} torsoProfile is nearly flat (spread=${spread.toFixed(2)}) — reads as a tube`);
    const beast = buildBeast(S);
    const pos = beast.skin.mesh.geometry.attributes.position;
    assert.ok(pos.count > 50, `${species} torso mesh has too few vertices (${pos.count})`);
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `non-finite torso vertex ${i} (${species})`);
    }
    let maxR = 0;
    for (let i = 0; i < pos.count; i++) maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
    widths[species] = maxR;
  }
  const vals = Object.values(widths);
  assert.ok(Math.max(...vals) / Math.min(...vals) > 1.3, `species widths too similar: ${JSON.stringify(widths)}`);
});

// 4b кръг 2: змията е реално сегментирана (не 1 цилиндър) и се стеснява към опашката/главата —
// паякът наистина има 8 отделни стави крака.
test('serpent segments taper (not one uniform pipe); spider has 8 distinct legs', () => {
  const S = BEAST_SPECIES.serpent;
  const rs = S.segProfile;
  assert.ok(Math.max(...rs) - Math.min(...rs) > 0.4, `serpent segProfile too flat: ${rs}`);
  const spider = buildSpider(BEAST_SPECIES.spider);
  for (let i = 0; i < 8; i++) {
    assert.ok(spider.rig.parts[`legUpper${i}`], `spider missing leg ${i}`);
  }
});

function buildGiantFighter(sprite, kit) {
  const M = dummyMaterials();
  const knightB = buildKnight(M, 'B');
  const weapon = kit === 'heavy' ? mace(M) : armingSword(M);
  const shield = kit === 'sword' ? heaterShield(M) : null; // giants never pass hasShieldKit&&kind==='giant' in world.js
  return new Fighter('B', knightB, weapon, new Cape(M.capeB), shield, { scale: giantScale(sprite) });
}

for (const sprite of ['golem', 'titan', 'troll']) {
  test(`giant reskin ${sprite}: scaled rig stays finite and grounded`, () => {
    const gen = buildChoreography(genRounds(mulberry32(sprite.length + 3), 5), true, { heroClass: 'warrior', foeName: sprite, foeSprite: sprite });
    setChoreography(gen);
    setDuration(gen.duration);
    recompileTimeline();
    const { A } = buildFighters({ kitA: 'sword' });
    const B = buildGiantFighter(sprite, 'heavy');
    assert.equal(B.scale, giantScale(sprite));
    assert.ok(B.scale > 1, 'giants must render larger than a knight');
    for (let T = 0; T < 3; T += STEP) {
      const dT = T === 0 ? 0 : STEP;
      A.update(T, dT, B);
      B.update(T, dT, A);
      for (const part of Object.values(B.knight.parts)) assert.ok(finite(part.matrix), `non-finite giant part at T=${T.toFixed(2)}`);
      for (const foot of B.feet.feet) assert.ok(foot.pos.y >= -1e-6, `giant foot sank below ground: ${foot.pos.y}`);
    }
  });
}

test('wraith reskin: hover keeps the root above ground the whole time', () => {
  const gen = buildChoreography(genRounds(mulberry32(9), 5), true, { heroClass: 'warrior', foeName: 'wraith', foeSprite: 'wraith' });
  setChoreography(gen);
  setDuration(gen.duration);
  recompileTimeline();
  const M = dummyMaterials();
  const knightB = buildKnight(M, 'B');
  const B = new Fighter('B', knightB, longsword(M), new Cape(M.capeB), null, { hover: WRAITH_HOVER });
  const { A } = buildFighters({ kitA: 'sword' });
  let lowest = Infinity;
  for (let T = 0; T < 3; T += STEP) {
    const dT = T === 0 ? 0 : STEP;
    A.update(T, dT, B);
    B.update(T, dT, A);
    lowest = Math.min(lowest, B.root.pos.y);
    for (const part of Object.values(B.knight.parts)) assert.ok(finite(part.matrix), `non-finite wraith part at T=${T.toFixed(2)}`);
  }
  assert.ok(lowest > WRAITH_HOVER - 0.15, `wraith should hover near ${WRAITH_HOVER}m, dipped to ${lowest.toFixed(3)}`);
});
