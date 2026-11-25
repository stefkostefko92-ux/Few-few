// The wardrobe: one carcass up to MAX_CARCASS_W, wider ones as several side by side (transport; tops and bottoms fit
// the sheet), with hinged doors per column or sliding doors across each carcass (sliding.js).
import { buildCarcass } from './carcass.js';
import { STOCK } from './materials.js';
import { HINGE_LIMITS } from './hardware.js';
import { MAX_CARCASS_W } from './layout.js';
import { SLIDING, DEFAULT_SLIDING } from './sliding.js';

// A door is about 24 mm wider than the inner width of its column (full overlay on the side, half overlay on the
// partition, less the 3 mm gap). One door up to the hinge maker's width, two above it; fronts.js checks the real width.
const DOOR_OVERHANG = 24;
export const doorsFor = (innerW) => (innerW + DOOR_OVERHANG > HINGE_LIMITS.maxWidth ? 2 : 1);

// Inner width of one column of an n-column carcass of outer width W (18 mm sides and partitions).
export function columnWidth(W, n, T = STOCK.pb18.thickness) {
  return (W - 2 * T - (n - 1) * T) / n;
}

// Column of a wardrobe: hanging, shelves, or hanging above three drawers (drawer fronts outside, doors above them).
// Behind sliding doors there are no drawers (their fronts would stand in the doors' way): that column keeps shelves.
function wardrobeColumn(layout, i, doors, sliding) {
  if (layout === 'hanging') return { rail: true, doors };
  if (layout === 'shelves') return { shelves: 5, doors };
  const third = sliding ? { shelves: 5, doors } : { rail: true, drawers: 3, drawerZone: 3 * 190, doors };
  return [{ rail: true, doors }, { shelves: 5, doors }, third][i % 3];
}

export function buildWardrobe(ctx, s, common) {
  const sliding = s.doorType === 'sliding';
  const sys = sliding ? SLIDING[DEFAULT_SLIDING] : null;
  // wide wardrobes become several carcasses side by side (transportable, tops and bottoms fit the sheet); the columns
  // are shared out exactly as asked and every carcass is as wide as its columns
  const m = Math.min(s.columns, Math.ceil(s.width / MAX_CARCASS_W));
  const counts = Array.from({ length: m }, (_, k) => Math.floor(s.columns / m) + (k < s.columns % m ? 1 : 0));
  if (m > 1) ctx.warn('info', ctx.t('w.wardrobeSplit', { n: m, cols: counts.join(' + ') }));
  if (sliding && s.layout === 'mixed' && s.columns >= 3) ctx.warn('info', ctx.t('w.slidingNoDrawers'));
  let x0 = 0;
  let ci = 0;
  counts.forEach((n, k) => {
    const W = k === m - 1 ? s.width - x0 : Math.round((s.width * n) / s.columns);
    const doors = sliding ? 0 : s.doorsPerColumn || doorsFor(columnWidth(W, n));
    const cols = Array.from({ length: n }, () => wardrobeColumn(s.layout, ci++, doors, sliding));
    buildCarcass(ctx, {
      ...common, module: m > 1 ? ctx.t('mod.carcass', { n: k + 1 }) : '', x0, W, H: s.height, D: s.depth,
      plinth: { type: s.legs ? 'panel' : 'none', h: s.legs }, top: 'between', visibleTop: true, columns: cols,
      ...(sys ? { sliding: sys.id, frontZone: sys.frontZone } : {}),
    });
    x0 += W;
  });
}
