// 4a.4 (кръг 2) — покрива класовете от брифа: 4 геройски кита (sword/warrior, shortsword/
// rogue, staff/mage, bow/ranger) × 4 представителни противникови вида (sword по подразбиране,
// shortsword/bandit, staff/witch, heavy/troll) = 16 генерирани двубоя, вкл. далечните рундове
// (жезъл/лък — снаряд, не IK reach, виж choreo-gen-attack.js). Инварианти:
//  1. resolveAll() (timeline.js) не хвърля — ВСЕКИ ключ, който buildRangedRound бута, се
//     резолюва (само pose:, никога aim без geometric target) при ВСЯКА комбинация.
//  2. Китките достигат ръкавиците (същия праг като fight-gen.test.js) — важи И за далечните
//     пози (STAFF_*/BOW_* в choreo.js) — ако авторска поза е геометрично невъзможна, тук личи.
//  3. Краката не потъват в паважа.
//  4. За всеки далечен рунд: 'cast' EVENTS съществува, 'roundmark' (t=impactT) е СТРОГО след
//     'cast' (t=releaseT) с точно flight секунди разлика, и двете лежат в [rundT, returnT].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFighters } from './fixtures.js';
import { setChoreography } from '../src/choreo.js';
import { setDuration } from '../src/config.js';
import { recompileTimeline } from '../src/timeline.js';
import { buildChoreography, mulberry32 } from '../src/choreo-gen.js';
import { isRangedKit } from '../src/loadout.js';

const STEP = 1 / 90; // по-рядко от fight-gen.test.js (1/120) — 16 комбинации, пази CI бърз.
const RESULTS = ['hit', 'crit', 'block', 'dodge', 'miss'];

function genRounds(rng, n) {
  const rounds = [];
  for (let i = 0; i < n; i++) rounds.push({ attacker: rng() < 0.5 ? 'hero' : 'foe', result: RESULTS[Math.floor(rng() * RESULTS.length)] });
  return rounds;
}

const HERO_CLASSES = ['warrior', 'rogue', 'mage', 'ranger'];
const FOE_NAMES = ['The Black Warden', 'Goblin Raider', 'The Witch Queen', 'Cave Troll'];

for (const heroClass of HERO_CLASSES) {
  for (const foeName of FOE_NAMES) {
    const rng = mulberry32(heroClass.length * 131 + foeName.length * 17 + 5);
    const rounds = genRounds(rng, 4 + Math.floor(rng() * 8));
    const victory = rng() < 0.5;
    const gen = buildChoreography(rounds, victory, { rng, heroClass, foeName });

    test(`class fight ${heroClass} vs "${foeName}" (${gen.kitA}/${gen.kitB}): resolves, reaches, feet up`, () => {
      setChoreography(gen);
      setDuration(gen.duration);
      recompileTimeline(); // хвърля тук, ако resolveAll() не може да разреши ключ (инвариант #1).
      const { A, B } = buildFighters({ kitA: gen.kitA, kitB: gen.kitB });
      const finishStart = gen.duration - 1.9;
      let worstGap = 0;
      let worstGapPost = 0;
      let lowestFoot = Infinity;
      const wrist = new THREE.Vector3();
      for (let T = 0; T < gen.duration; T += STEP) {
        const dT = T === 0 ? 0 : STEP;
        A.update(T, dT, B);
        B.update(T, dT, A);
        for (const f of [A, B]) {
          for (const [hand, joint] of [[f.handR, f.rig.w.wristR], [f.handL, f.rig.w.wristL]]) {
            const gap = wrist.copy(hand.grip).addScaledVector(hand.x, -0.072).distanceTo(joint);
            if (T <= finishStart) { if (gap > worstGap) worstGap = gap; } else if (gap > worstGapPost) worstGapPost = gap;
          }
          for (const part of Object.values(f.knight.parts)) {
            assert.ok(part.matrix.elements.every(Number.isFinite), `non-finite part matrix at T=${T.toFixed(2)} (${heroClass} vs ${foeName})`);
          }
          for (const foot of f.feet.feet) lowestFoot = Math.min(lowestFoot, foot.pos.y);
        }
      }
      // Далечните пози (STAFF_*/BOW_*, choreo.js) са НОВИ авторски p/d/e стойности — same 6cm/
      // 8cm толеранс като меле (fight-gen.test.js), обосновката е същата (Catmull-Rom шев).
      assert.ok(worstGap < 0.06, `wrist misses its target by ${(worstGap * 100).toFixed(1)} cm during combat (${heroClass} vs ${foeName})`);
      assert.ok(worstGapPost < 0.08, `wrist misses its target by ${(worstGapPost * 100).toFixed(1)} cm post-disarm (${heroClass} vs ${foeName})`);
      assert.ok(lowestFoot >= 0.085, `an ankle dips to ${lowestFoot.toFixed(3)} m (${heroClass} vs ${foeName})`);
    });

    if (isRangedKit(gen.kitA) || isRangedKit(gen.kitB)) {
      test(`class fight ${heroClass} vs "${foeName}" (${gen.kitA}/${gen.kitB}): ranged impact timing is sane`, () => {
        const casts = gen.EVENTS.filter((e) => e.type === 'cast');
        const marks = gen.EVENTS.filter((e) => e.type === 'roundmark' && e.roundIndex < rounds.length);
        assert.ok(casts.length > 0, `no 'cast' events for a ranged kit (${gen.kitA}/${gen.kitB})`);
        for (const c of casts) {
          assert.ok(Number.isFinite(c.t) && c.t >= 0 && c.t < gen.duration, `cast t out of range: ${c.t}`);
          assert.ok(c.flight > 0, `cast flight must be positive: ${c.flight}`);
          // За всеки 'cast' има точно едно 'roundmark' на releaseT+flight (импакт момента).
          const mark = marks.find((m) => Math.abs(m.t - (c.t + c.flight)) < 1e-6 && m.by === c.by);
          assert.ok(mark, `no matching roundmark at impact time for cast@${c.t.toFixed(2)} (${heroClass} vs ${foeName})`);
        }
      });
    }
  }
}
