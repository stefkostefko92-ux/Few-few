// Bathroom furniture: the cabinet under a sink and the mirror cabinet over it. Both are carcasses (carcass.js) with
// what a bathroom asks of them:
// – under the sink there is no top and no shelf (the basin or the countertop sits on the rails, the siphon goes down
//   through the cabinet): the back gets the place of the siphon cut-out marked, cut on site to the siphon that comes;
//   the cabinet hangs on the wall or stands on legs;
// – the mirror cabinet is a shallow wall cabinet whose doors carry a 4 mm mirror glued on: the mirror is bought cut to
//   the door, and its weight counts in the hinge check (fronts.js, o.frontKgM2).
// The basin, the countertop, the mirror glass and the siphon are bought; the hardware list names them, without price.
import { buildCarcass } from './carcass.js';
import { mark } from './panel.js';
import { r1 } from './util.js';

// Glass is 2.5 kg/m² per mm of thickness (soda-lime glass, 2500 kg/m³): a 4 mm mirror, 10 kg/m².
export const MIRROR = { T: 4, kgM2: 10 };
// The siphon cut-out in the back: our choice — 250 mm wide, from 150 to 450 mm above the bottom, in the middle (the
// usual place of a wall waste outlet); cut on site to the siphon, so only marked.
export const SIPHON = { w: 250, y0: 150, y1: 450 };

export function buildVanity(ctx, s, common) {
  const legs = s.mount === 'legs' ? s.legs : 0;
  const out = buildCarcass(ctx, {
    ...common, W: s.width, H: s.height + legs, D: s.depth,
    // hung on the wall: its lower edge s.floor above the floor; on legs: standing
    y0: s.mount === 'wall' ? s.floor : 0,
    mount: s.mount === 'wall' ? 'wall' : undefined,
    plinth: { type: legs ? 'legs' : 'none', h: legs }, top: 'rails',
    columns: [{ shelves: 0, doors: s.doors }],
  });
  const back = ctx.parts.find((p) => p.role === 'back' && p.module === (common.module ?? ''));
  if (back) {
    const { c } = out.dims;
    const xm = (back.box.min[0] + back.box.max[0]) / 2;
    const z = back.box.max[2];
    // a low cabinet: the cut-out stays 30 mm under the top edge of the back and at least 100 mm tall
    const y1 = Math.min(SIPHON.y1, back.box.max[1] - c - 30);
    const y0 = Math.min(SIPHON.y0, y1 - 100);
    for (const [dx, y] of [[-SIPHON.w / 2, y0], [SIPHON.w / 2, y0], [SIPHON.w / 2, y1], [-SIPHON.w / 2, y1]]) {
      mark(back, [r1(xm + dx), c + y, z], 'siphon', { label: ctx.t('lbl.siphon') });
    }
  }
  ctx.hw('basin', { name: ctx.t('hw.basin', { W: s.width, D: s.depth }), qty: 1, unit: ctx.t('u.pcs'), group: ctx.t('g.purchased') });
  ctx.warn('info', ctx.t('w.bathroomBoard'));
  ctx.warn('info', ctx.t('w.siphon', { w: SIPHON.w }));
  return out;
}

export function buildMirrorCabinet(ctx, s, common) {
  const out = buildCarcass(ctx, {
    ...common, kind: 'wall', W: s.width, H: s.height, D: s.depth, y0: s.mount, plinth: { type: 'none', h: 0 },
    top: 'between', mount: 'wall', visibleTop: true, frontKgM2: MIRROR.kgM2,
    columns: [{ shelves: s.shelves, doors: s.doors }],
  });
  for (const door of ctx.parts.filter((p) => p.role === 'door')) {
    // the mirror 2 mm inside each edge of the door: our choice, so the banded edge stays clean
    const w = r1(door.box.max[0] - door.box.min[0] - 4);
    const h = r1(door.box.max[1] - door.box.min[1] - 4);
    ctx.hw(`mirror:${w}x${h}`, { name: ctx.t('hw.mirror', { T: MIRROR.T, w, h }), qty: 1, unit: ctx.t('u.pcs'), group: ctx.t('g.purchased') });
  }
  ctx.warn('info', ctx.t('w.bathroomBoard'));
  return out;
}
