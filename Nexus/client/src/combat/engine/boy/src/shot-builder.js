// 4a.3-fix (Nexus порт, НЕ част от оригиналния boy) — изнесено от choreo-gen.js за лимита от
// 300 реда (закон #1). Генерираните кадри трябва да пазят и двамата бойци в кадър при ВСЯКО
// съотношение (портрет 402×874 included), никога да не влизат в геометрията им и да показват
// средата (двора, огньовете), не празна тъмнина. Разстоянието на камерата се смята от
// вертикалния FOV + текущия aspect (S.aspect, зададен от director.js), не от фиксирани офсети
// като в оригинала на boy (тия бяха тунинговани САМО за конкретния пейзажен кадър на демото).
const MIN_DIST = 4.2; // абсолютен под — по-близо винаги рискува клипинг в броня/оръжие
// 4a.4-fix (кръг 3): и двете свалени от 2.6/2.1 — на реалната сцена-карта (900×620/402×874, не
// fullscreen) бойците бяха малки силуети в долната половина (докладвано при преглед). По-тесен
// halfWidth → по-малка fitDistance → бойците заемат повече от височината на кадъра.
const HALF_WIDTH_WIDE = 1.75; // нормален "двубоен" план — двамата бойци + периферия (среда)
const HALF_WIDTH_CRIT = 1.5; // по-плътен план при крит — пак И ДВАМАТА бойци, не само единия

// Портретен екран (402×874) е тесен по хоризонтала — вертикалният FOV е "силната" ос. Вместо
// само да дърпаме камерата назад (бойците стават точки), разширяваме и обектива до разумен
// таван, така че разстоянието да остане кинематографично, не орбитален спътник.
function effectiveVFov(baseVFovDeg, aspect) {
  if (!aspect || aspect >= 1) return baseVFovDeg;
  const widen = Math.min(28, (1 / aspect - 1) * 22);
  return Math.min(70, baseVFovDeg + widen);
}

function fitDistance(halfWidth, vFovDeg, aspect) {
  const vFov = (vFovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect || 1, 0.32));
  return Math.max(MIN_DIST, halfWidth / Math.tan(hFov / 2));
}

// Ъгълът се мери от оста A→B (S.u): 0 = камерата гледа ПО оста и бойците се застъпват (реалният
// бъг на портрет — двамата се сливаха в едно петно). π/2 = странично, героят (A) вляво, в
// синхрон с HUD-а (героят долу-ляво, противникът горе-дясно). Люлеем се само около страничния
// план и никога не прекосяваме оста — иначе страните на екрана се разменят насред боя.
const SIDE = Math.PI / 2;
const MAX_SWAY = 0.55;

// Портрет: страничният план иска hFov за ~4м ширина → бойците стават 20% от височината. Там
// минаваме на 3/4 план (разстоянието се скъсява в перспектива) и по-тесен halfWidth.
function portraitK(aspect) {
  return Math.min(1, Math.max(0, (1.05 - (aspect || 1)) / 0.45));
}

function orbitShot(S, sway, baseVFov, halfWidth, height) {
  const p = portraitK(S.aspect);
  const angle = SIDE - p * 0.62 + Math.max(-MAX_SWAY, Math.min(MAX_SWAY, sway)) * (1 - p * 0.5);
  // Далечен бой (маг/стрелец) стои на по-голяма дистанция от меле — фиксиран halfWidth
  // изрязваше противника извън кадъра на портрет. Ширината покрива реалната проекция + тялото.
  const sep = S.A && S.B ? Math.hypot(S.B.root.pos.x - S.A.root.pos.x, S.B.root.pos.z - S.A.root.pos.z) : 0;
  const hw = Math.max(halfWidth * (1 - p * 0.3), (sep / 2) * Math.abs(Math.sin(angle)) + 0.75);
  const vFov = effectiveVFov(baseVFov, S.aspect);
  const d = fitDistance(hw, vFov, S.aspect);
  const pos = S.C.clone().addScaledVector(S.u, Math.cos(angle) * d).addScaledVector(S.v, Math.sin(angle) * d).add({ x: 0, y: height, z: 0 });
  const target = S.C.clone().add({ x: 0, y: 1.15, z: 0 });
  return { pos, target, fov: vFov, focus: 'C', fstop: 2.8, hand: 0.3 };
}

export function buildGeneratedShots(approach, shotBeats, lastRoundEnd, duration) {
  const shots = [
    // Установъчен план — по-висок и по-широк, бавно се спуска към страничния.
    { t0: 0, t1: approach, fn: (u, S) => orbitShot(S, -0.5 + u * 0.35, 44, HALF_WIDTH_WIDE + 0.35, 2.1 - u * 0.4) },
  ];
  shotBeats.forEach((beat, i) => {
    // Редуваме страната на люлеенето (−/+), за да има движение между рундовете без разменени страни.
    const dir = i % 2 === 0 ? 1 : -1;
    const from = -dir * 0.3;
    const span = dir * (0.35 + (i % 3) * 0.08);
    if (beat.crit) {
      shots.push({ t0: beat.t0, t1: beat.t1, fn: (u, S) => orbitShot(S, from * 0.5, 32, HALF_WIDTH_CRIT, 1.4) });
    } else {
      shots.push({ t0: beat.t0, t1: beat.t1, fn: (u, S) => orbitShot(S, from + u * span, 42, HALF_WIDTH_WIDE, 1.6) });
    }
  });
  shots.push({
    t0: lastRoundEnd,
    t1: duration,
    fn: (u, S) => {
      const k = u * u * (3 - 2 * u);
      return orbitShot(S, k * 0.4, 40, HALF_WIDTH_WIDE + k * 1.2, 1.6 + k * 1.2);
    },
  });
  return shots;
}
