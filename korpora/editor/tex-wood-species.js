// Wood species and styles, read from the decor name: growth ring width, contrast, pores, rays, knots, figure, how
// many planks are flat sawn, and the tone between planks; and the dark and light tones around the catalogue colour.
import * as THREE from 'three';

// A name part matches at the start of a word, as Bulgarian stems take endings („дъбов“, „орехов“), never inside one
// („Касела“ is not fir, „Gold“ is not old); a trailing $ ends the word as well.
export const words = (...parts) =>
  new RegExp(
    `(?:^|[^\\p{L}])(?:${parts.map((p) => p.replace(/\$$/, '(?!\\p{L})')).join('|')})`,
    'iu',
  );

const SPECIES = [
  // re, ring mm, contrast, pores, rays, knots, figure, cathedral, tone between planks (the plank width comes from
  // the style, tex-wood.js)
  [
    words('орех', 'walnut', 'ноче', 'noce'),
    { ring: 3.6, contrast: 0.92, pores: 0.42, figure: 0.8, cathedral: 0.7, tone: 0.16 },
  ],
  [
    words('хикори', 'hickory'),
    { ring: 4.6, contrast: 0.95, pores: 0.35, figure: 0.45, cathedral: 0.6, tone: 0.28 },
  ],
  [
    words(
      'бор$',
      'боров',
      'pine',
      'смърч',
      'spruce',
      'ела$',
      'елов',
      'fir$',
      'larch',
      'лиственица',
    ),
    { ring: 7.5, contrast: 1.05, pores: 0, knots: 0.45, figure: 0.35, cathedral: 0.8, tone: 0.1 },
  ],
  [
    // not „Букмач“ (bookmatched oak)
    words('бук$', 'буков', 'beech'),
    {
      ring: 3.2,
      contrast: 0.38,
      pores: 0.12,
      rays: 0.55,
      figure: 0.2,
      cathedral: 0.35,
      tone: 0.06,
    },
  ],
  [
    words('ясен', 'ash$', 'frassino'),
    { ring: 5.2, contrast: 0.82, pores: 0.5, figure: 0.4, cathedral: 0.75, tone: 0.1 },
  ],
  [
    words('бряст', 'elm$', 'olmo'),
    { ring: 5, contrast: 0.85, pores: 0.45, figure: 0.9, cathedral: 0.85, tone: 0.14 },
  ],
  [
    words(
      'череш',
      'cherry',
      'клен',
      'maple',
      'бреза',
      'брезов',
      'birch',
      'круш',
      'pear$',
      'липа',
      'липов',
    ),
    { ring: 3, contrast: 0.32, pores: 0.06, figure: 0.3, cathedral: 0.45, tone: 0.06 },
  ],
  [
    words('тик', 'teak', 'ироко', 'iroko'),
    { ring: 4.2, contrast: 0.7, pores: 0.25, figure: 0.25, cathedral: 0.3, tone: 0.14 },
  ],
  [
    words('венге', 'wenge', 'зебрано', 'zebrano', 'абанос', 'ebony'),
    { ring: 2.4, contrast: 1.15, pores: 0.3, figure: 0.15, cathedral: 0.1, tone: 0.06 },
  ],
  [
    words('акаци', 'acacia'),
    { ring: 3.8, contrast: 0.95, pores: 0.2, figure: 0.7, cathedral: 0.6, tone: 0.32 },
  ],
  [
    words('кестен', 'chestnut', 'castagno'),
    { ring: 5, contrast: 0.85, pores: 0.45, figure: 0.5, cathedral: 0.75, tone: 0.14 },
  ],
  [
    words('дъб', 'oak', 'rovere'),
    {
      ring: 4.4,
      contrast: 0.78,
      pores: 0.36,
      rays: 0.25,
      figure: 0.45,
      cathedral: 0.7,
      tone: 0.12,
    },
  ],
];
const RUSTIC = words(
  'халифакс',
  'halifax',
  'гладстон',
  'gladstone',
  'ланкастър',
  'lancaster',
  'шерууд',
  'sherwood',
  'див$',
  'wild',
  'rustic',
  'рустик',
  'craft',
  'крафт',
  'винтидж',
  'vintage',
  'old$',
  'стар',
  'knotty',
  'чвор',
  'мадейра',
  'tobacco',
  'табак',
  'вотан',
  'wotan',
  'кендал',
  'kendal',
  'бардолино',
  'bardolino',
  'atelier',
  'lefkas',
  'лефкас',
);
const FINELINE = words('fineline', 'файнлайн', 'линеа', 'linea', 'фино', 'fine line');

// The look of a wood decor from its name: species values, then the style (rustic: knots, cracks and saw marks;
// fineline: reconstituted veneer in fine straight lines).
export function woodLook(name) {
  const sp = {
    ring: 4.4,
    contrast: 0.75,
    pores: 0.3,
    rays: 0,
    knots: 0,
    figure: 0.45,
    cathedral: 0.65,
    tone: 0.1,
    rustic: 0,
  };
  const hit = SPECIES.find(([re]) => re.test(name));
  if (hit) Object.assign(sp, hit[1]);
  if (RUSTIC.test(name)) {
    sp.rustic = 1;
    sp.knots = Math.max(sp.knots, 0.32);
    sp.tone += 0.12;
    sp.contrast *= 1.08;
  }
  if (FINELINE.test(name))
    Object.assign(sp, {
      ring: 1.3,
      contrast: 0.9,
      pores: 0,
      figure: 0.05,
      cathedral: 0.02,
      tone: 0.02,
    });
  return sp;
}

// Tones around the catalogue colour: the dark (late wood, streaks) deeper and more saturated, the light paler —
// as in real wood. Dark decors keep visible grain by lifting the light more.
export function tones(mid, contrast) {
  const max = Math.max(mid.r, mid.g, mid.b, 1e-4);
  const lum = 0.2126 * mid.r + 0.7152 * mid.g + 0.0722 * mid.b;
  const kd = Math.max(0.28, 1 - 0.55 * contrast);
  const kl = Math.min(1 / max, 1 + (0.24 + (lum < 0.05 ? 1.2 : lum < 0.12 ? 0.6 : 0)) * contrast);
  const sat = (c, e) => c * (c / max) ** e;
  const dark = new THREE.Color(sat(mid.r, 0.3) * kd, sat(mid.g, 0.3) * kd, sat(mid.b, 0.3) * kd);
  const grey = lum;
  const light = new THREE.Color(
    (mid.r * 0.8 + grey * 0.2) * kl,
    (mid.g * 0.8 + grey * 0.2) * kl,
    (mid.b * 0.8 + grey * 0.2) * kl,
  );
  return { dark, light };
}
