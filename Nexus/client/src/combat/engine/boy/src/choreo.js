// The duel, authored like a stunt sheet. Local coordinates are [right, up, forward] in metres
// from the fighter's ground point; times are story seconds (slow motion stretches them).

// Ser Aldric: longsword in two hands.
const A_REST = { p: [0.0, 1.02, 0.3], d: [0, -1, 0.1], e: [0, 0, 1] };
const A_VOMTAG = { p: [0.16, 1.5, 0.2], d: [0.05, 0.92, -0.38], e: [0, 0.38, 0.92] };
const A_OCHS = { p: [0.22, 1.52, 0.2], d: [-0.28, -0.1, 1], e: [0, 1, 0.1] };
const A_PFLUG = { p: [0.14, 1.04, 0.28], d: [-0.15, 0.4, 1], e: [0, 1, -0.4] };
const A_POINT_DOWN = { p: [0.04, 1.2, 0.42], d: [0, -0.42, 1], e: [0, -1, -0.4] };

// The Black Warden: arming sword and heater shield.
const B_REST = { p: [0.24, 0.95, 0.12], d: [0.08, -0.62, 0.78], e: [0, -0.78, -0.62] };
const B_GUARD = { p: [0.24, 1.28, 0.2], d: [-0.1, 0.72, 0.68], e: [0, 0.68, -0.72] };
const B_HIGH = { p: [0.22, 1.72, 0.02], d: [0.06, 0.55, -0.83], e: [0, 0.83, 0.55] };
const B_TAP_UP = { p: [0.2, 1.5, 0.22], d: [0.3, 0.8, 0.5], e: [-0.9, 0.2, 0.3] };
const B_TAP = { p: [0.04, 1.3, 0.36], d: [-0.85, 0.25, 0.45], e: [0, -0.4, 1] };

const SH_REST = { w: [-0.14, 1.0, 0.28], n: [0.25, 0.1, 1] };
const SH_GUARD = { w: [-0.02, 1.22, 0.36], n: [0.15, 0.05, 1] };
const SH_TAUNT = { w: [-0.06, 1.24, 0.36], n: [0.55, 0.05, 0.85] };
const SH_BASH = { w: [0.02, 1.3, 0.6], n: [0, 0, 1] };

// 4a.2: каноничните пози изнесени за choreo-gen.js — генераторът строи всеки рунд между тях
// (aim/parry/block се решават геометрично от timeline.js, затова сглобяването е безопасно
// независимо от реда), вместо да измисля нови сурови p/d/e вектори.
export const GUARD_POSES = { A_REST, A_VOMTAG, A_OCHS, A_PFLUG, A_POINT_DOWN, B_REST, B_GUARD, B_HIGH, SH_REST, SH_GUARD };

const DEFAULT_A_KEYS = [
  { t: 0.0, pose: A_REST, crouch: 0, lead: 'L' },
  { t: 3.5, pose: A_REST, crouch: 0 },
  { t: 4.1, pose: { p: [0.1, 1.3, 0.3], d: [0, 0.3, 1], e: [0, 1, -0.3] }, crouch: 0.04 },
  { t: 4.8, pose: A_VOMTAG },
  { t: 7.7, pose: A_VOMTAG },
  { t: 8.05, pose: { p: [0.24, 1.62, 0.1], d: [0.12, 0.72, -0.68], e: [0.1, 0.7, 0.72] }, tw: -0.25, crouch: 0.06 },
  { t: 8.45, aim: { target: 'lshoulder', hand: [0.1, 1.45, 0.42], contact: 0.78 }, e: [0.4, -0.7, 0.4], ease: 'in', tw: 0.3, lean: 0.14, crouch: 0.11, lead: 'R' },
  { t: 8.66, pose: { p: [0.14, 1.52, 0.3], d: [-0.2, 0.55, 0.8], e: [0, 1, 0] }, ease: 'out', tw: 0.05 },
  { t: 9.05, parry: { vs: 'B', style: 'up' }, crouch: 0.1, tw: 0.15 },
  { t: 9.35, pose: { p: [-0.02, 1.45, 0.38], d: [0.25, -0.1, 1], e: [0, 1, 0] }, tw: 0.2, lead: 'L' },
  { t: 9.6, pose: { p: [0.2, 1.62, 0.12], d: [0.95, 0.1, -0.3], e: [0, 1, 0] }, tw: -0.35 },
  { t: 9.85, aim: { target: 'head', hand: [0.02, 1.62, 0.48], contact: 0.65 }, e: [-0.8, 0, 0.5], ease: 'in', tw: 0.4, lean: 0.1, crouch: 0.09 },
  { t: 10.05, pose: { p: [-0.12, 1.55, 0.36], d: [-0.95, 0.05, 0.3], e: [-0.3, 0, -1] }, ease: 'out', tw: 0.45 },
  { t: 10.45, pose: { p: [-0.1, 1.5, 0.32], d: [-0.9, 0.2, 0.35], e: [-0.3, 0, -1] }, tw: 0.35 },
  { t: 10.75, pose: { p: [0.05, 1.62, 0.12], d: [-0.5, 0.8, 0.2], e: [0, -0.2, 1] }, ease: 'out', lean: -0.22, tw: -0.2 },
  { t: 11.6, pose: A_PFLUG, crouch: 0.1 },
  { t: 12.5, pose: A_PFLUG, crouch: 0.1 },
  { t: 12.95, parry: { vs: 'B', style: 'flat' }, ease: 'out', crouch: 0.13 },
  { t: 13.55, hold: true, crouch: 0.13 },
  { t: 14.2, pose: { p: [-0.06, 1.58, 0.36], d: [0.3, -0.12, 1], e: [-0.2, 1, 0] }, tw: 0.25, crouch: 0.1 },
  { t: 14.75, pose: { p: [0.0, 1.52, 0.22], d: [0.12, -0.05, 1], e: [0, 1, 0] }, tw: 0.15, crouch: 0.1 },
  { t: 15.1, aim: { target: 'head', hand: [0.02, 1.5, 0.62], contact: 0.7 }, e: [0, 1, 0], ease: 'in', lean: 0.18, crouch: 0.13 },
  { t: 15.4, pose: { p: [0.08, 1.35, 0.4], d: [0.15, 0.2, 1], e: [0, 1, 0] }, ease: 'out', lean: 0.08 },
  { t: 16.2, pose: A_PFLUG, crouch: 0.1 },
  { t: 17.6, pose: A_OCHS, crouch: 0.09 },
  { t: 19.2, pose: A_OCHS, crouch: 0.09 },
  { t: 19.95, pose: { p: [0.05, 1.62, 0.28], d: [-0.35, -0.45, 0.8], e: [-0.3, 0.8, 0.3] }, crouch: 0.12 },
  { t: 20.25, parry: { vs: 'B', style: 'hang' }, ease: 'out', crouch: 0.13 },
  { t: 20.55, pose: { p: [0.08, 1.86, 0.06], d: [0.02, 0.62, -0.78], e: [0, 0.78, 0.62] }, lean: -0.05, crouch: 0.1 },
  { t: 20.85, aim: { target: 'head', hand: [0.02, 1.55, 0.45], contact: 0.62 }, e: [0, -1, 0.3], ease: 'in', lean: 0.16, crouch: 0.13 },
  { t: 21.05, pose: { p: [0.08, 1.72, 0.25], d: [0.15, 0.9, 0.35], e: [0, -0.35, 1] }, ease: 'out', lean: 0.05 },
  { t: 21.3, pose: { p: [0.26, 1.64, 0.08], d: [0.18, 0.7, -0.69], e: [0.1, 0.69, 0.7] }, tw: -0.3, crouch: 0.08 },
  { t: 21.55, aim: { target: 'headL', hand: [0.06, 1.45, 0.45], dynamic: true }, e: [0.4, -0.7, 0.3], ease: 'in', tw: 0.35, lean: 0.16, crouch: 0.12, lead: 'R' },
  { t: 21.85, pose: { p: [-0.12, 1.02, 0.4], d: [-0.62, -0.55, 0.55], e: [-0.5, 0.5, -0.3] }, ease: 'out', tw: 0.5, lean: 0.12, crouch: 0.1 },
  { t: 23.4, pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06, lead: 'L' },
  { t: 28.5, pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06 },
];

const DEFAULT_B_KEYS = [
  { t: 0.0, pose: B_REST, crouch: 0.02, lead: 'L' },
  { t: 2.1, pose: B_REST, crouch: 0.02 },
  { t: 2.4, pose: B_TAP_UP, crouch: 0.04 },
  { t: 2.6, pose: B_TAP, ease: 'in', crouch: 0.05 },
  { t: 2.8, pose: B_TAP_UP, ease: 'out', crouch: 0.04 },
  { t: 3.0, pose: B_TAP, ease: 'in', crouch: 0.05 },
  { t: 3.25, pose: B_TAP_UP, ease: 'out', crouch: 0.04 },
  { t: 3.9, pose: B_GUARD },
  { t: 8.5, pose: B_GUARD, crouch: 0.1 },
  { t: 8.75, pose: { p: [0.28, 1.22, 0.02], d: [-0.12, 0.12, 1], e: [0, 1, 0] }, tw: -0.25, crouch: 0.1 },
  { t: 9.05, aim: { target: 'chest', hand: [0.12, 1.25, 0.62], contact: 0.45 }, e: [0, 1, 0], ease: 'in', tw: 0.25, lean: 0.18, crouch: 0.14 },
  { t: 9.35, pose: { p: [0.34, 1.22, 0.34], d: [0.55, 0.05, 0.83], e: [0, 1, 0] }, ease: 'out', tw: 0.1 },
  { t: 9.85, parry: { vs: 'A', style: 'up' } },
  { t: 10.3, pose: { p: [0.3, 1.45, 0.02], d: [0.2, 0.9, -0.3], e: [0, 0.3, 0.9] }, tw: -0.15 },
  { t: 10.55, pose: { p: [0.3, 1.45, 0.02], d: [0.2, 0.9, -0.3], e: [0, 0.3, 0.9] }, tw: 0.3, lean: 0.2, crouch: 0.14 },
  { t: 11.3, pose: B_GUARD },
  { t: 12.5, pose: B_HIGH, tw: -0.2, lean: -0.05, crouch: 0.06 },
  { t: 12.95, aim: { target: 'head', hand: [0.05, 1.6, 0.5], contact: 0.5 }, e: [0, -1, 0.3], ease: 'in', lean: 0.15, crouch: 0.12, tw: 0.1 },
  { t: 13.55, hold: true, lean: 0.15, crouch: 0.12, tw: 0.1 },
  { t: 14.2, pose: { p: [0.36, 1.5, 0.42], d: [0.6, 0.2, 0.78], e: [0, 1, 0] }, tw: 0.15 },
  { t: 15.4, pose: { p: [0.3, 1.3, 0.25], d: [0.1, 0.6, 0.8], e: [0, 0.8, -0.6] } },
  { t: 16.2, pose: B_GUARD },
  { t: 19.4, pose: B_GUARD },
  { t: 19.85, pose: { p: [0.3, 1.72, 0.04], d: [0.25, 0.62, -0.74], e: [0.1, 0.75, 0.65] }, tw: -0.3, crouch: 0.1 },
  { t: 20.25, aim: { target: 'lshoulder', hand: [0.06, 1.42, 0.5], contact: 0.5 }, e: [0.4, -0.8, 0.3], ease: 'in', tw: 0.35, lean: 0.2, crouch: 0.14, lead: 'R' },
  { t: 20.5, pose: { p: [-0.1, 1.1, 0.45], d: [-0.55, -0.55, 0.62], e: [-0.3, 0.6, -0.4] }, ease: 'out', tw: 0.35, lean: 0.15 },
  { t: 21.0, pose: { p: [0.25, 1.3, 0.2], d: [0.2, 0.5, 0.85], e: [0, 0.8, -0.5] }, lead: 'L' },
  { t: 21.6, pose: { p: [0.34, 1.45, 0.1], d: [0.5, 0.7, 0.5], e: [0, -0.6, 0.8] }, ease: 'out', lean: -0.25 },
  { t: 22.3, pose: { p: [0.3, 1.1, 0.18], d: [0.2, -0.3, 0.9], e: [0, -0.9, -0.3] }, lean: -0.2 },
  { t: 23.7, pose: { p: [0.2, 0.8, 0.34], d: [0.1, -0.2, 1], e: [0, -1, 0] }, lean: 0.32, crouch: 0.0 },
  { t: 28.5, pose: { p: [0.2, 0.8, 0.34], d: [0.1, -0.2, 1], e: [0, -1, 0] }, lean: 0.32, crouch: 0.0 },
];

const DEFAULT_B_SHIELD = [
  { t: 0.0, sh: SH_REST },
  { t: 2.15, sh: SH_REST },
  { t: 2.4, sh: SH_TAUNT },
  { t: 3.3, sh: SH_TAUNT },
  { t: 3.9, sh: SH_GUARD },
  { t: 8.2, sh: SH_GUARD },
  { t: 8.45, block: { vs: 'A' }, ease: 'out' },
  { t: 8.75, sh: SH_GUARD },
  { t: 10.25, sh: { w: [-0.08, 1.25, 0.16], n: [0.1, 0, 1] } },
  { t: 10.55, sh: SH_BASH, ease: 'in' },
  { t: 10.95, sh: SH_GUARD, ease: 'out' },
  { t: 14.85, sh: SH_GUARD },
  { t: 15.1, block: { vs: 'A', high: true }, ease: 'out' },
  { t: 15.5, sh: SH_GUARD },
  { t: 20.55, sh: SH_GUARD },
  { t: 20.85, block: { vs: 'A', high: true }, ease: 'out' },
  { t: 21.15, sh: { w: [-0.3, 1.62, 0.12], n: [-0.5, -0.3, 0.8] }, ease: 'out' },
  { t: 22.4, sh: { w: [-0.3, 1.1, 0.2], n: [-0.2, 0, 1] } },
  { t: 23.7, sh: { w: [-0.3, 0.7, 0.3], n: [-0.15, -0.25, 1] } },
  { t: 28.5, sh: { w: [-0.3, 0.7, 0.3], n: [-0.15, -0.25, 1] } },
];

// [t, centreX, centreZ, separation, axis angle]
const DEFAULT_ROOT_KEYS = [
  [0.0, 0.0, 0.3, 7.0, 0.0],
  [3.7, 0.0, 0.3, 7.0, 0.0],
  [5.1, 0.05, 0.35, 5.3, 0.14],
  [6.5, 0.1, 0.4, 3.4, 0.3],
  [7.7, 0.12, 0.45, 2.2, 0.4],
  [8.1, 0.12, 0.45, 1.95, 0.42],
  [11.0, 0.12, 0.45, 1.9, 0.46],
  [11.7, 0.1, 0.45, 2.3, 0.5],
  [12.5, 0.1, 0.45, 2.1, 0.52],
  [13.0, 0.1, 0.45, 1.85, 0.54],
  [15.2, 0.1, 0.45, 1.8, 0.58],
  [16.3, 0.1, 0.45, 2.8, 0.7],
  [19.4, 0.1, 0.45, 3.0, 1.95],
  [20.2, 0.1, 0.45, 1.8, 2.05],
  [21.6, 0.1, 0.45, 1.65, 2.08],
  [28.5, 0.1, 0.45, 1.65, 2.08],
];

const DEFAULT_A_ADV = [[0, 0], [8.05, 0], [8.45, 0.4], [8.8, 0.15], [9.05, -0.05], [9.6, 0.05], [9.85, 0.25], [10.2, 0.1], [10.55, 0.0], [10.95, -0.55], [11.7, -0.2], [12.5, 0], [14.8, 0], [15.1, 0.3], [15.6, 0.05], [16.3, 0], [20.6, 0], [20.85, 0.2], [21.3, 0.2], [21.55, 0.32], [22.3, 0.15], [23.4, 0.1], [28.5, 0.1]];
const DEFAULT_B_ADV = [[0, 0], [8.6, 0], [8.75, -0.05], [9.05, 0.35], [9.4, 0.1], [9.9, 0], [10.25, -0.05], [10.55, 1.2], [10.95, 0.6], [11.7, 0], [12.5, 0], [12.95, 0.4], [13.6, 0.4], [14.4, 0.15], [15.4, -0.1], [16.3, 0], [19.85, 0], [20.25, 0.35], [20.6, 0.2], [21.55, 0.1], [22.0, -0.3], [22.6, -0.4], [23.7, -0.35], [28.5, -0.35]];
const DEFAULT_B_KNEEL = [[0, 0], [22.7, 0], [23.8, 1], [28.5, 1]];
const DEFAULT_BREATH = [[0, 1], [11, 1.6], [16.5, 2.6], [20, 1.3], [23, 2.8], [28.5, 2.2]];
const DEFAULT_B_LOOK_DOWN = [[0, 0], [22.6, 0], [23.2, 1], [25.4, 1], [26.4, 0], [28.5, 0]];

const DEFAULT_TIME_SCALE = [[0, 1], [12.86, 1], [12.93, 0.12], [13.48, 0.12], [13.62, 1], [21.42, 1], [21.5, 0.15], [22.2, 0.15], [22.55, 1], [28.5, 1]];

const DEFAULT_EVENTS = [
  { t: 0.9, type: 'lightning', power: 0.6 },
  { t: 2.6, type: 'tap', power: 0.35 },
  { t: 3.0, type: 'tap', power: 0.4 },
  { t: 8.45, type: 'shield', by: 'A', power: 0.9 },
  { t: 9.05, type: 'clash', power: 0.8 },
  { t: 9.12, type: 'scrape', dur: 0.2, power: 0.5 },
  { t: 9.85, type: 'clash', power: 0.9 },
  { t: 10.55, type: 'bash', power: 1.0 },
  { t: 12.95, type: 'clash', power: 1.4 },
  { t: 13.0, type: 'scrape', dur: 0.5, power: 0.55 },
  { t: 13.7, type: 'scrape', dur: 0.45, power: 0.5 },
  { t: 15.1, type: 'shield', by: 'A', power: 0.8 },
  { t: 17.6, type: 'lightning', power: 1.0 },
  { t: 20.25, type: 'clash', power: 1.0 },
  { t: 20.85, type: 'shield', by: 'A', power: 1.1 },
  { t: 21.55, type: 'helm', power: 1.6 },
  { t: 21.6, type: 'disarm' },
  { t: 23.55, type: 'kneel', power: 0.6 },
];

const DEFAULT_CAPTIONS = [
  { t: 3.6, d: 3.0, k: 'vomTag' },
  { t: 8.0, d: 1.4, k: 'zornhau' },
  { t: 9.55, d: 0.85, k: 'zwerch' },
  { t: 10.45, d: 1.6, k: 'bash' },
  { t: 12.9, d: 0.66, k: 'krone' },
  { t: 13.62, d: 1.1, k: 'winden' },
  { t: 14.85, d: 1.3, k: 'stich' },
  { t: 19.9, d: 0.9, k: 'hengen' },
  { t: 21.35, d: 1.3, k: 'final' },
];

const DEFAULT_CHAPTERS = [
  { t: 0.0, k: 'ch1' },
  { t: 7.8, k: 'ch2' },
  { t: 16.3, k: 'ch3' },
];

// --- 4a.2: данни-задвижвана хореография (Nexus порт) --------------------------------------
// В оригиналния boy тези 13 масива са фиксирани export const-и, решени еднократно при
// зареждане на модула (виж CLAUDE.md закон #5). За реални битки от сървъра трябва да могат
// да се подменят преди всяко изпълнение на дуела. Тук стават `let`, инициализирани с
// оригиналната фиксирана хореография (демото продължава да работи непроменено), плюс
// setChoreography()/resetChoreography() — всички консуматори (timeline.js/events.js/
// fighter.js/main.js) четат тези имена през live ES-binding (namespace/named import), затова
// не се налага да пипаме логиката им — просто трябва да презаредим кешираните производни
// (timeline.recompileTimeline(), director.recompileDirector()) СЛЕД смяна.
export let A_KEYS = DEFAULT_A_KEYS;
export let B_KEYS = DEFAULT_B_KEYS;
export let B_SHIELD = DEFAULT_B_SHIELD;
export let ROOT_KEYS = DEFAULT_ROOT_KEYS;
export let A_ADV = DEFAULT_A_ADV;
export let B_ADV = DEFAULT_B_ADV;
export let B_KNEEL = DEFAULT_B_KNEEL;
export let BREATH = DEFAULT_BREATH;
export let B_LOOK_DOWN = DEFAULT_B_LOOK_DOWN;
export let TIME_SCALE = DEFAULT_TIME_SCALE;
export let EVENTS = DEFAULT_EVENTS;
export let CAPTIONS = DEFAULT_CAPTIONS;
export let CHAPTERS = DEFAULT_CHAPTERS;

/** Подменя цялата хореография (обект със същите 13 ключа). Извиква се от boot.js ПРЕДИ
 * timeline.recompileTimeline()/director.recompileDirector(), иначе кешовете им остават стари. */
export function setChoreography(next) {
  A_KEYS = next.A_KEYS;
  B_KEYS = next.B_KEYS;
  B_SHIELD = next.B_SHIELD;
  ROOT_KEYS = next.ROOT_KEYS;
  A_ADV = next.A_ADV;
  B_ADV = next.B_ADV;
  B_KNEEL = next.B_KNEEL;
  BREATH = next.BREATH;
  B_LOOK_DOWN = next.B_LOOK_DOWN;
  TIME_SCALE = next.TIME_SCALE;
  EVENTS = next.EVENTS;
  CAPTIONS = next.CAPTIONS;
  CHAPTERS = next.CHAPTERS;
}

/** Връща оригиналната фиксирана хореография на boy (демо режим). */
export function resetChoreography() {
  setChoreography({
    A_KEYS: DEFAULT_A_KEYS, B_KEYS: DEFAULT_B_KEYS, B_SHIELD: DEFAULT_B_SHIELD, ROOT_KEYS: DEFAULT_ROOT_KEYS,
    A_ADV: DEFAULT_A_ADV, B_ADV: DEFAULT_B_ADV, B_KNEEL: DEFAULT_B_KNEEL, BREATH: DEFAULT_BREATH,
    B_LOOK_DOWN: DEFAULT_B_LOOK_DOWN, TIME_SCALE: DEFAULT_TIME_SCALE, EVENTS: DEFAULT_EVENTS,
    CAPTIONS: DEFAULT_CAPTIONS, CHAPTERS: DEFAULT_CHAPTERS,
  });
}

export const DEFAULT_DURATION = 28.5;
