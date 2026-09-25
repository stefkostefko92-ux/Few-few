// 4a.3-fix (Nexus порт, НЕ част от оригиналния boy) — изнесено от choreo-gen.js за лимита от
// 300 реда (закон #1). Генерираните кадри трябва да пазят и двамата бойци в кадър при ВСЯКО
// съотношение (портрет 402×874 included), никога да не влизат в геометрията им и да показват
// средата (двора, огньовете), не празна тъмнина. Разстоянието на камерата се смята от
// вертикалния FOV + текущия aspect (S.aspect, зададен от director.js), не от фиксирани офсети
// като в оригинала на boy (тия бяха тунинговани САМО за конкретния пейзажен кадър на демото).
const MIN_DIST = 4.2; // абсолютен под — по-близо винаги рискува клипинг в броня/оръжие
const HALF_WIDTH_WIDE = 2.6; // нормален "двубоен" план — двамата бойци + периферия (среда)
const HALF_WIDTH_CRIT = 2.1; // по-плътен план при крит — пак И ДВАМАТА бойци, не само единия

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

// Орбитален широк план около средата на боя — и двамата бойци стоят близо до центъра на кадъра.
function orbitShot(S, angle, baseVFov, halfWidth, height) {
  const vFov = effectiveVFov(baseVFov, S.aspect);
  const d = fitDistance(halfWidth, vFov, S.aspect);
  const pos = S.C.clone().addScaledVector(S.u, Math.cos(angle) * d).addScaledVector(S.v, Math.sin(angle) * d).add({ x: 0, y: height, z: 0 });
  const target = S.C.clone().add({ x: 0, y: 1.3, z: 0 });
  return { pos, target, fov: vFov, focus: 'C', fstop: 2.8, hand: 0.3 };
}

export function buildGeneratedShots(approach, shotBeats, lastRoundEnd, duration) {
  const shots = [
    // Широк установъчен план — над двора, НЕ право надолу (оригиналният бъг: h като arg на
    // director.js S.P се третираше грешно — камерата зяпаше право в земята от 10м).
    { t0: 0, t1: approach, fn: (u, S) => orbitShot(S, -0.5 + u * 0.3, 44, HALF_WIDTH_WIDE + 0.8, 2.6) },
  ];
  let angle = 0.2;
  shotBeats.forEach((beat, i) => {
    const angleStep = 0.5 + (i % 3) * 0.15; // бавен, но забележим орбитален дрейф между рундовете
    const startAngle = angle;
    angle += angleStep;
    if (beat.crit) {
      // Крит: по-плътен план, фиксиран към средата (не орбита) — TIME_SCALE вече забавя
      // времето там; пак аспект-съобразен, никога вътре в геометрията.
      shots.push({ t0: beat.t0, t1: beat.t1, fn: (u, S) => orbitShot(S, startAngle, 32, HALF_WIDTH_CRIT, 1.9) });
    } else {
      shots.push({ t0: beat.t0, t1: beat.t1, fn: (u, S) => orbitShot(S, startAngle + u * angleStep, 42, HALF_WIDTH_WIDE, 2.3) });
    }
  });
  // Финал: бавен pull-back, пак аспект-съобразен разстояние (расте допълнително с k).
  shots.push({
    t0: lastRoundEnd,
    t1: duration,
    fn: (u, S) => {
      const k = u * u * (3 - 2 * u);
      return orbitShot(S, angle + k * 0.4, 40, HALF_WIDTH_WIDE + k * 1.5, 2.3 + k * 1.4);
    },
  });
  return shots;
}
