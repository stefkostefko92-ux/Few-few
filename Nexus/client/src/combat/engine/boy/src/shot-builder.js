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

// 4b: чисто вертикален fit (полу-височината на съдържанието срещу вертикалния FOV пряко, без
// aspect) — halfWidth-базираният fitDistance() пази ШИРОЧИНАТА, но нищо досега не пазеше
// ВИСОЧИНАТА: рицар-срещу-рицар (~1.75m и двамата) винаги се побираше случайно, а дракон/титан
// (S.spanY) излиза извън горния ръб на кадъра без този под.
function fitDistanceVertical(halfHeight, vFovDeg) {
  const vFov = (vFovDeg * Math.PI) / 180;
  return Math.max(MIN_DIST, halfHeight / Math.tan(vFov / 2));
}

function orbitShot(S, sway, baseVFov, halfWidth, height) {
  const p = portraitK(S.aspect);
  const angle = SIDE - p * 0.62 + Math.max(-MAX_SWAY, Math.min(MAX_SWAY, sway)) * (1 - p * 0.5);
  // 4b QA-fix (кръг 2): двамата бяха математически "в кадър" (NDC вътре в [-1,1]), но точно на
  // ръба — за дребен звяр (плюс HUD панелите отгоре) това е практически "извън кадър". margin
  // вече расте с 18% сигурност + минимум, скалиран по spanY (по-едро тяло, по-широк силует).
  const sep = S.A && S.B ? Math.hypot(S.B.root.pos.x - S.A.root.pos.x, S.B.root.pos.z - S.A.root.pos.z) : 0;
  const vFov = effectiveVFov(baseVFov, S.aspect);
  // 4b: standHeight (fighter.js/beast-fighter.js) решава и вертикалния под, и очната височина —
  // плъх (spanY≈0.24) сяда камерата ниско и близо, титан/дракон (spanY>2) я вдига и отдалечава.
  const spanY = S.spanY ?? 1.75;
  const margin = Math.max(0.85, spanY * 0.4);
  const hw = Math.max(halfWidth * (1 - p * 0.3), (sep / 2) * Math.abs(Math.sin(angle)) * 1.18 + margin);
  // 4b QA-fix (кръг 4): още веднъж отрязан шлем в hit кадър при нисък противник (докладвано при
  // преглед, случайно по бой — точното запазена/крит хореография променя sway/axis/сепарация,
  // не само spanY) — бюджетът расте с допълнителна сигурност, не само spanY-базирания под.
  // Кинематографичните ленти на boy са изключени за генерираните двубои (main.js) — в картата на
  // страницата те изяждаха ~40% от височината и шлемът на героя падаше под горната лента.
  const dv = fitDistanceVertical(spanY * 0.85 + 0.7, vFov);
  const d = Math.max(fitDistance(hw, vFov, S.aspect), dv);
  // 4b QA-fix (кръг 3): eyeY зависеше САМО от spanY (винаги ръста на по-високия боец) — за нисък
  // противник (плъх/паяк) target (S.midY) пада надолу, но окото на камерата оставаше на същата
  // височина → по-голям наклон надолу спрямо преди, и халфХайт-бюджетът (симетричен около target,
  // смятан за РАВНИННА камера) вече не важи: героят се "качва" над горния ръб (докладвано при
  // преглед — шлемът му отрязан в hit кадъра). Дръж окото на ПОЧТИ постоянно превишение НАД target
  // (наклонът не расте с ниска цел), вместо на абсолютна височина, независима от target.
  const midY = S.midY ?? 1.15;
  const eyeY = Math.min(Math.max(midY + height * 0.55, spanY * 0.35), height * 1.6);
  const pos = S.C.clone().addScaledVector(S.u, Math.cos(angle) * d).addScaledVector(S.v, Math.sin(angle) * d).add({ x: 0, y: eyeY, z: 0 });
  const target = S.C.clone().add({ x: 0, y: S.midY ?? 1.15, z: 0 });
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
