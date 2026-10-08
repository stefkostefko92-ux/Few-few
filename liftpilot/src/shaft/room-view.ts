// The machine room drawn: plan (walls and door, the shaft under it, the slab's openings, the machine, the diverting
// pulley on its stand, the governor, the control panel with its free area, the main switch); section B-B along the
// rope drops is room-section-view.ts. The machine is the 3D's (machine-outline.ts) scaled to the sheave, or a maker's
// as it is (machine-shape-view.ts); the sheave's axis and the pulley stand where the calculation puts them
// (machine-room.ts). Model entities for the drawing kernel; dimensions included.
import { chain, edit as E, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { rinvioAcross, rinvioRun } from './rinvio';
import { rinvioName } from './rinvio-view';
import { hebDrawn } from './heb';
import { hebPlan } from './heb-view';
import { supportPlan } from './support-view';
import { machinePlan } from './machine-outline';
import { shapePlan } from './machine-shape-view';
import { dropSpan as span, machineU, machineV, ropeWidths, type MachineSpec, type RoomGeo } from './machine-room';
import { WALL, doorSwing, holesOf, onDrop, quad, type RoomDrawOpts } from './room-draw';
import { hitchTags } from './room-loads';
import { bbox, fittingsPlan } from './room-fittings-view';
import { outlineBox, switchBox } from './room-floor';
import { machineBox, machineParts } from './support-check';
import { freeAreas, wayBands } from './room-ways';
import { electricPlan } from './room-electric';
import { supportOf } from './support';
import { layoutSite, type RoomSite } from './room-site';
import { roomSectionOn } from './room-section-view';
import { hookOf } from './room-hook';
import { reactionPoints } from './room-reactions';
import { panelSeen } from './room-section-extra';
import { dropChains, railAxis, reactionMarks, setoutPlan } from './room-setout';
import type { Layout } from './types';

export { roomSectionOn };

/** A reference's circle at 1:25, the plan's scale [mm] (view.ts tag: the smallest lettering's). */
const TAG_R = 2.4 * 25;
/** A circle round p of radius r meets the box. */
const nearBox = (p: Pt, b: Box, r: number): boolean => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1)) < r;
/** The segment p–q crosses the box (Liang–Barsky). */
function crossesBox(p: Pt, q: Pt, b: Box): boolean {
  let t0 = 0, t1 = 1;
  for (const [dd, lo, hi, c] of [[q[0] - p[0], b.x0, b.x1, p[0]], [q[1] - p[1], b.y0, b.y1, p[1]]]) {
    if (Math.abs(dd) < 1e-12) {
      if (c < lo || c > hi) return false;
      continue;
    }
    const a = (lo - c) / dd, e = (hi - c) / dd;
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
  }
  return t0 <= t1;
}
/** The distance from p to the segment a–b. */
const segGap = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const inBox = (p: Pt, b: readonly Pt[]): boolean => {
  const xs = b.map((q) => q[0]), ys = b.map((q) => q[1]);
  return p[0] >= Math.min(...xs) && p[0] <= Math.max(...xs) && p[1] >= Math.min(...ys) && p[1] <= Math.max(...ys);
};

/** The machine room of a whole design in plan and in section B-B (its shaft, travel and governor from its layout). */
export const roomPlanEntities = (L: Layout, M: MachineSpec, G: RoomGeo, o: RoomDrawOpts = {}): { entities: Entity[]; bounds: Box } => roomPlanOn(layoutSite(L), M, G, o);
export const roomSectionEntities = (L: Layout, M: MachineSpec, G: RoomGeo, o: RoomDrawOpts = {}): { entities: Entity[]; bounds: Box } => roomSectionOn(layoutSite(L), M, G, o);

export function roomPlanOn(S: RoomSite, M: MachineSpec, G: RoomGeo, o: RoomDrawOpts = {}): { entities: Entity[]; bounds: Box } {
  const R = G.room, out: Entity[] = [], w = ropeWidths(M.n, M.d), holes = holesOf(S, M, G), k = 1000 * G.s;
  // walls with the door
  const strip = (x0: number, y0: number, x1: number, y1: number): void => { if (x1 - x0 > 1 && y1 - y0 > 1) out.push(rect(x0, y0, x1, y1, 'wall', 'concrete')); };
  const door = R.doorWall, [d0, d1] = [R.doorAt, R.doorAt + R.doorW];
  const horizontal = (y0: number, y1: number, cut: boolean): void => {
    if (cut) { strip(-WALL, y0, d0, y1); strip(d1, y0, R.W + WALL, y1); } else strip(-WALL, y0, R.W + WALL, y1);
  };
  const vertical = (x0: number, x1: number, cut: boolean): void => {
    if (cut) { strip(x0, 0, x1, d0); strip(x0, d1, x1, R.D); } else strip(x0, 0, x1, R.D);
  };
  horizontal(-WALL, 0, door === 'front');
  horizontal(R.D, R.D + WALL, door === 'rear');
  vertical(-WALL, 0, door === 'left');
  vertical(R.W, R.W + WALL, door === 'right');
  out.push(rect(0, 0, R.W, R.D, 'wall'));
  // the door open outward, its swing outside the room
  const swing = doorSwing((a, t) => (door === 'front' ? [a, -t] : door === 'rear' ? [a, R.D + t] : door === 'left' ? [-t, a] : [R.W + t, a]), d0, R.doorW, WALL, o.closedDoor);
  out.push(...swing.entities);
  const out0 = Math.max(WALL, swing.reach);
  // the shaft underneath, the slab's openings round the ropes and a pulley dipping into it, a 2:1 roping's dead ends
  out.push(rect(R.shaftX, R.shaftY, R.shaftX + S.W, R.shaftY + S.D, 'hidden'));
  for (const h of holes) {
    const a = (h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + 30;
    out.push(path(quad(G, h.u0, -a, h.u1, a), true, 'thin'));
  }
  // a 2:1 roping's dead ends, each opening along the plane its pulley turns in
  for (const { at, dir } of G.deadEnds) {
    const a = 90, b = w.ropes + 50, n: Pt = [-dir[1], dir[0]];
    out.push(path([[-a, -b], [a, -b], [a, b], [-a, b]].map(([p, q]): Pt => [at[0] + p * dir[0] + q * n[0], at[1] + p * dir[1] + q * n[1]]), true, 'hidden'));
  }
  // the loads of their hitches (P2, P3)
  out.push(...hitchTags(G));
  // the diverting pulley under the machine: on a stand over the opening when its axle is above the slab's underside,
  // else hung under the slab; the machine over it, its sheave's rope plane on the drop line, the motor toward the
  // counterweight or, turned round, toward the car (G.dir); the pulley's outline again where the machine hides it
  const pulley = M.Dp > 0 ? quad(G, G.pulleyAt - M.Dp / 2, -(w.ropes + 8), G.pulleyAt + M.Dp / 2, w.ropes + 8) : null;
  if (pulley) {
    const u = G.pulleyAt, r = M.Dp / 2, half = w.pulley, under = G.pulleyZ <= -R.slab;
    // in the bedplate its plates hold it (rinvio-view.ts); else its own stand over the opening
    const framed = M.rinvio?.on === 'frame' && G.pulleyZ - r >= 0;
    if (!under && !framed) {
      const u0 = u - r - 110, u1 = u + r + 110;
      for (const s of [-1, 1]) out.push(path(quad(G, u0, s * (half - 10), u1, s * half), true, 'outline'));
      for (const [a, b] of [[u0, u0 + 70], [u1 - 70, u1]]) out.push(path(quad(G, a, -half - 40, b, half + 40), true, 'outline', 'paper'));
    } else out.push(path(quad(G, u - 140, -half - 40, u + 140, half + 40), true, 'hidden'));
    out.push(path(pulley, true, under ? 'hidden' : 'outline', under ? undefined : 'steel'), line(onDrop(G, u, -half - 22), onDrop(G, u, half + 22), under ? 'hidden' : 'thin'));
  }
  // from the lowest up: the HEB beams on the shaft's walls, the support on them, the machine on it
  const [p0, p1] = span(G, 0, 0, R.W, R.D), heb = hebDrawn(G, M, S, S.govRopes);
  if (heb) out.push(...hebPlan(heb, G, M, S));
  const supportEnts = supportPlan(M, G, (u, v) => onDrop(G, u, v), p0, p1, heb), supportOutline = supportEnts.flatMap((e) => (e.e === 'path' ? [e.pts] : []));
  out.push(...supportEnts);
  const F = G.frame;
  out.push(...(F.shape ? shapePlan(F, M.D, M.n, M.d, (x, z) => onDrop(G, machineU(G, x), machineV(G, z)))
    : machinePlan((x, z) => onDrop(G, machineU(G, x * k), machineV(G, z * k)), F.beams.map((z) => z / k))));
  if (pulley) out.push(path(pulley, true, 'hidden'));
  // control panel with its free area, main switch by the door (room-fittings-view.ts)
  const parts = machineParts(G, M).map(outlineBox).map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 })), { entities: fittings, free, sw, swAt } = fittingsPlan(R, parts);
  out.push(...fittings);
  // the free areas beside the machine and the governor, the ways from the door, the light, switches, sockets, grille
  // and trunking (room-ways.ts, room-electric.ts): what stands on the floor as the room's checks take it
  const others = [...(S.govFoot ? [S.govFoot] : []), switchBox(R)], fa = freeAreas(G, M, others, S.govFoot ?? null);
  out.push(...fa.entities, ...wayBands(G, [...machineParts(G, M), ...others], fa.machine),
    ...electricPlan(R, fa.machine, machineBox(G, M), [R.shaftX, R.shaftY, R.shaftX + S.W, R.shaftY + S.D]));
  // the sheave's size on the side away from the gearbox, along the drop line (an upright one would cross the frame's
  // dimension); the load P1 where the room is free, its leader to the gearbox (the gearbox's side of the drop line: g)
  const g = G.dir, clearV = Math.max(w.ropes + 60, M.Dp > 0 ? w.pulley + 40 : 0), um = (G.frame0 + G.frame1) / 2;
  const side = g > 0 ? Math.min(G.across[0], -clearV) : Math.max(G.across[1], clearV), gear = g > 0 ? G.across[1] : G.across[0];
  // the bedplate with the diverting pulley, when the pulley turns in it: its chain goes on the machine's other side
  const rfx = M.rinvio, bed = rfx?.on === 'frame' && M.Dp > 0 && G.pulleyZ - M.Dp / 2 >= 0
    ? (([u0, u1], [v0, v1]) => ({ u0, u1, v0, v1 }))(rinvioRun(M, G), rinvioAcross(G, rfx)) : null;
  const ax = Math.abs(G.ux) > Math.abs(G.uy) ? 0 : 1;
  // (along the drop line, read from the left or from below: on an axis level or upright)
  let deg = (Math.atan2(G.uy, G.ux) * 180) / Math.PI;
  if (deg > 90 + 1e-9) deg -= 180;
  else if (deg <= -90 + 1e-9) deg += 180;
  out.push({ e: 'text', at: onDrop(G, G.sheaveAt, side - 70 * g), text: `${M.label ? `${M.label} · ` : ''}Ø ${M.D}`, size: 1.8, align: 'c', angle: deg, halo: true });
  // clear of the main switch's lettering too (wide enough for it at 1:50)
  const inRoom = (p: Pt): boolean => p[0] > 250 && p[0] < R.W - 250 && p[1] > 250 && p[1] < R.D - 250;
  const offSwitch = (p: Pt): boolean => Math.abs(p[0] - swAt[0]) > 600 || Math.abs(p[1] - swAt[1]) > 250;
  // with the bedplate of the pulley: past its chain, past its ends, and off the control panel's chain (the generic
  // spots stay as they always were: an issued set's hash covers them)
  const pw0 = R.panelWall, panelRow = (pw0 === 'front' ? 0 : pw0 === 'rear' ? R.D : pw0 === 'left' ? 0 : R.W)
    + (pw0 === 'rear' || pw0 === 'right' ? -1 : 1) * (R.panelD + 150);
  const offPanelRow = (p: Pt): boolean => !bed || Math.abs((pw0 === 'front' || pw0 === 'rear' ? p[1] : p[0]) - panelRow) > 300;
  const spots = bed
    ? [onDrop(G, G.sheaveAt, g > 0 ? Math.max(G.across[1], bed.v1 + 300) + 380 : Math.min(G.across[0], bed.v0 - 300) - 380), onDrop(G, bed.u0 - 380, gear / 2),
      onDrop(G, bed.u1 + 380, gear / 2), onDrop(G, um, side - 700 * g), onDrop(G, um, side - 400 * g)]
    : [onDrop(G, G.sheaveAt, gear + 380 * g), onDrop(G, G.frame1 + 380, gear / 2), onDrop(G, G.frame0 - 380, gear / 2), onDrop(G, um, side - 700 * g), onDrop(G, um, side - 400 * g)];
  // the frame's and the drops' chains beside the machine, each moved further out until its row and lettering clear the
  // governor, the control panel's free area and the main switch
  const blocked = [S.governor.box, bbox(free), bbox(sw)].filter((x): x is Box => x !== null);
  const inside = (p: Pt): boolean => p[0] > 100 && p[0] < R.W - 100 && p[1] > 100 && p[1] < R.D - 100;
  // how much of a row's band (its lettering and ticks) lies on them: 0 clear, Infinity out of the room
  const onBlocked = (v: number, u0: number, u1: number): number => {
    const band = bbox(quad(G, u0 - 80, v - 150, u1 + 80, v + 150)), over = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    return inside(onDrop(G, (u0 + u1) / 2, v)) ? blocked.reduce((t, q) => t + over(q.x0, q.x1, band.x0, band.x1) * over(q.y0, q.y1, band.y0, band.y1), 0) : Infinity;
  };
  // the first clear row: away from the gearbox as always, else past the machine (and the bedplate's chain) on its side —
  // the rows counted toward the gearbox (w = g·v); none clear, the one least on what is there
  const pick = (rows: readonly number[], u0: number, u1: number): number =>
    g * (rows.find((w) => onBlocked(g * w, u0, u1) === 0) ?? rows.reduce((b, w) => (onBlocked(g * w, u0, u1) < onBlocked(g * b, u0, u1) ? w : b)));
  const far = (v0: number, v1: number): number => Math.max(g * v0, g * v1), gs = g * side;
  const beyond = Math.max(far(G.across[0], G.across[1]), bed ? far(bed.v0, bed.v1) + 220 : -Infinity) + 200;
  const vFrame = pick([gs - 220, gs - 370, beyond, beyond + 150], G.frame0, G.frame1), wf = g * vFrame;
  const vDrop = wf < 0 ? pick([Math.min(gs - 420, wf - 200), Math.min(gs - 570, wf - 350), beyond, beyond + 150], 0, G.calata)
    : pick([gs - 220, gs - 370, gs - 520, wf + 200, wf + 350], 0, G.calata);
  // clear of the governor (its body, its name, its P4: the tight boxes, not the footprint its dimensions keep off), its
  // leader too; askew, off the rows of the frame's and the drop's chains along the drop line (their lines cross it)
  const p1To = onDrop(G, machineU(G, F.shape ? 0 : 0.1 * k), machineV(G, 0)), marks = S.governor.marks ?? [], askew = Math.max(Math.abs(G.ux), Math.abs(G.uy)) <= 0.999;
  const rows = askew ? [[0, G.calata, vDrop], ...(G.frame.on === 'frame' ? [[G.frame0, G.frame1, vFrame]] : [])].map(([u0, u1, v]) => [onDrop(G, u0, v), onDrop(G, u1, v)] as const) : [];
  const offGov = (p: Pt): boolean => marks.every((m) => !nearBox(p, m, TAG_R) && !crossesBox(p, p1To, m)) && rows.every(([q0, q1]) => segGap(p, q0, q1) > TAG_R + 40);
  const usual = (p: Pt): boolean => inRoom(p) && !inBox(p, free) && offSwitch(p) && offPanelRow(p);
  // none of those clear: the place nearest the gearbox on a grid over the room, well off the machine and the bedplate,
  // the governor's footprint with its dimensions and the rows of the chains beside the machine (their lettering)
  let tagAt = spots.find((p) => usual(p) && offGov(p));
  if (!tagAt) {
    const gearBox = [...parts, ...(bed ? [bbox(quad(G, bed.u0, bed.v0, bed.u1, bed.v1))] : []), ...(S.governor.box ? [S.governor.box] : [])], bv = bed ? (g > 0 ? bed.v1 : bed.v0) + 220 * g : 0;
    const lines = [[0, G.calata, vDrop], [G.frame0, G.frame1, vFrame], ...(bed ? [[bed.u0, bed.u1, bv]] : [])].map(([u0, u1, v]) => [onDrop(G, u0, v), onDrop(G, u1, v)] as const);
    const grid: Pt[] = [];
    for (let x = 300; x <= R.W - 300; x += 100) for (let y = 300; y <= R.D - 300; y += 100) grid.push([x, y]);
    const gap = (p: Pt): number => Math.hypot(p[0] - p1To[0], p[1] - p1To[1]);
    tagAt = grid.filter((p) => usual(p) && offGov(p) && gearBox.every((q) => !nearBox(p, q, TAG_R + 60)) && lines.every(([q0, q1]) => segGap(p, q0, q1) > TAG_R + 150))
      .sort((p, q) => gap(p) - gap(q))[0];
  }
  out.push({ e: 'tag', at: tagAt ?? spots.find(usual) ?? spots[0], text: 'P1', to: p1To });
  // the governor; its dimensions' lettering off the machine, the bedplate with the pulley and a frame's or a plinth's
  // outline (not where the governor stands on them: m_gov asks to move it there)
  const sup = supportOf(R, M.Dp > 0).kind, held = [...parts, ...(bed ? [bbox(quad(G, bed.u0, bed.v0, bed.u1, bed.v1))] : []),
    ...(sup === 'frame' || sup === 'plinth' ? supportOutline.map((e) => bbox(e)) : [])];
  const govOn = marks.slice(0, 1).some((m) => held.some((q) => m.x0 < q.x1 && q.x0 < m.x1 && m.y0 < q.y1 && q.y0 < m.y1));
  out.push(...(govOn ? S.governor.entities : S.governor.entities.map((e): Entity => (e.e === 'chain' ? { ...e, c: { ...e.c, avoid: held } } : e))));
  // dimensions: room, door, bedframe, rope drops; outside the walls the drops in the shaft first, the shaft under the
  // room (where it stands from the room's walls, and its size, from its outline), the room's own size outermost
  const dimSide = R.doorWall === 'front' ? 'bottom' : R.doorWall === 'rear' ? 'top' : R.doorWall;
  // (the drops' row nearest: a whole design's too, from its layout, since round 36)
  const xSide = dimSide === 'top' ? 'bottom' : 'top', ySide = dimSide === 'right' ? 'left' : 'right', first = o.dropsInside ? 0 : 1;
  const shaftY = xSide === 'top' ? R.shaftY + S.D : R.shaftY, shaftX = ySide === 'right' ? R.shaftX + S.W : R.shaftX;
  const across = dimSide === 'top' || dimSide === 'bottom', wallLen = across ? R.W : R.D;
  out.push(chain({ dir: across ? 'x' : 'y', pts: [0, d0, d1, wallLen], side: dimSide, row: 0, text: [null, `Porta ${R.doorW}x H. ${R.doorH}`, null],
    edit: [E('room.doorAt'), E('room.doorW'), E('room.doorAt', wallLen - R.doorW, -1)] }));
  out.push(...dropChains(S, G, dimSide, o.dropsInside === true));
  out.push(chain({ dir: 'x', pts: [0, R.shaftX, R.shaftX + S.W, R.W], side: xSide, row: first, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftX'), E('W'), E('room.shaftX', R.W - S.W, -1)], from: [undefined, shaftY, shaftY, undefined] }));
  out.push(chain({ dir: 'y', pts: [0, R.shaftY, R.shaftY + S.D, R.D], side: ySide, row: first, text: [null, 'Vano {v}', null],
    edit: [E('room.shaftY'), E('D'), E('room.shaftY', R.D - S.D, -1)], from: [undefined, shaftX, shaftX, undefined] }));
  out.push(chain({ dir: 'x', pts: [0, R.W], side: xSide, row: first + 1, text: ['{v} Locale'], edit: [E('room.W')] }));
  out.push(chain({ dir: 'y', pts: [0, R.D], side: ySide, row: first + 1, text: ['{v} Locale'], edit: [E('room.D')] }));
  // the control panel along its wall, in front of it (its name stays readable inside), and its depth into the room; the
  // chains in the room keep their lettering past their ends off the walls
  const within: Box = { x0: 0, y0: 0, x1: R.W, y1: R.D }, pw = R.panelWall, alongP = pw === 'front' || pw === 'rear', panelLen = alongP ? R.W : R.D;
  const face = pw === 'front' ? 0 : pw === 'rear' ? R.D : pw === 'left' ? 0 : R.W, into = pw === 'rear' || pw === 'right' ? -1 : 1, inner = face + into * R.panelD;
  // (from the nearer wall only: a chain across the room would cross the machine)
  const nearStart = R.panelAt <= panelLen - R.panelAt - R.panelW;
  // (its height here when section B-B does not see it, round 36)
  const panelName = panelSeen(G) ? 'Quadro {v}' : `Quadro {v} · H. ${R.panelH}`;
  out.push(chain(nearStart
    ? { dir: alongP ? 'x' : 'y', pts: [0, R.panelAt, R.panelAt + R.panelW], at: inner + into * 150, from: [null, inner, inner], text: [null, panelName],
      edit: [E('room.panelAt'), E('room.panelW')], within }
    : { dir: alongP ? 'x' : 'y', pts: [R.panelAt, R.panelAt + R.panelW, panelLen], at: inner + into * 150, from: [inner, inner, null], text: [panelName, null],
      edit: [E('room.panelW'), E('room.panelAt', panelLen - R.panelW, -1)], within }));
  // its depth past its end with room for it, else before it (a panel set 50 mm off a wall: the line would be in it)
  const side1 = R.panelAt + R.panelW, after = panelLen - side1 >= 150 || panelLen - side1 >= R.panelAt, at1 = after ? side1 : R.panelAt;
  out.push(chain({ dir: alongP ? 'y' : 'x', pts: [Math.min(face, inner), Math.max(face, inner)], at: after ? side1 + 120 : R.panelAt - 120, from: [at1, at1], text: ['Prof. {v}'],
    edit: [E('room.panelD')], within }));
  const [a, b] = [onDrop(G, G.frame0, vFrame), onDrop(G, G.frame1, vFrame)], drop = onDrop(G, 0, vDrop);
  const sorted = (p: number, q: number): number[] => [Math.min(p, q), Math.max(p, q)];
  // from the bedframe's side toward the chain (a machine on a bedplate's irons or on the maker's pedestal has none)
  const edgeV = vFrame < G.across[0] ? G.across[0] : G.across[1], edge = onDrop(G, G.frame0, edgeV)[1 - ax];
  // askew, the frames' lengths along the drop line itself, like the drop's (on an axis their projection is their length)
  const on = { o: G.carDrop, u: [G.ux, G.uy] as Pt };
  if (G.frame.on === 'frame') {
    out.push(chain(askew ? { dir: ax ? 'y' : 'x', on, pts: [G.frame0, G.frame1], at: vFrame, from: [edgeV, edgeV], text: ['{v} Telaio argano'], within }
      : { dir: ax ? 'y' : 'x', pts: sorted(a[ax], b[ax]), at: a[1 - ax], from: [edge, edge], text: ['{v} Telaio argano'], within }));
  }
  // the rope drop between the ropes, from each of them: along an axis on a chain there; askew, along the drop line
  // itself (the rows outside give where each drop stands)
  const [r0, r1] = G.carDrop[ax] <= G.cwDrop[ax] ? [G.carDrop, G.cwDrop] : [G.cwDrop, G.carDrop];
  out.push(chain(Math.max(Math.abs(G.ux), Math.abs(G.uy)) > 0.999
    ? { dir: ax ? 'y' : 'x', pts: [r0[ax], r1[ax]], at: drop[1 - ax], from: [r0[1 - ax], r1[1 - ax]], text: ['Calata Funi {v}'], edit: [S.calata(0, false)], within }
    : { dir: ax ? 'y' : 'x', on: { o: G.carDrop, u: [G.ux, G.uy] }, pts: [0, G.calata], at: vDrop, from: [0, 0], text: ['Calata Funi {v}'], edit: [S.calata(0, false, true)], within }));
  // the bedplate with the diverting pulley: its length and width beside the machine, away from the drop's chains
  if (bed) {
    const bv = g > 0 ? bed.v1 : bed.v0, [c, d] = [onDrop(G, bed.u0, bv + 220 * g), onDrop(G, bed.u1, bv + 220 * g)], side1 = onDrop(G, bed.u0, bv)[1 - ax];
    const text = [`{v} × ${Math.round(bed.v1 - bed.v0)} ${rfx ? rinvioName(rfx) : 'Telaio con rinvio'}`];
    out.push(chain(askew ? { dir: ax ? 'y' : 'x', on, pts: [bed.u0, bed.u1], at: bv + 220 * g, from: [bv, bv], text, within }
      : { dir: ax ? 'y' : 'x', pts: sorted(c[ax], d[ax]), at: c[1 - ax], from: [side1, side1], text, within }));
  }
  // the set-out (room-setout.ts): the openings named, the bedplate, the ropes' line and the sheave's axis from the walls,
  // the angle askew, the hook, the hitches; then the support's bearings R1…Rn — clear of the lettering placed so far,
  // the machine, the free areas and the switch
  const keep = [...gearBoxes(parts, bed ? bbox(quad(G, bed.u0, bed.v0, bed.u1, bed.v1)) : null), bbox(free), bbox(sw), ...(S.governor.box ? [S.governor.box] : [])];
  const band = (u0: number, u1: number, v: number): Box => bbox(quad(G, u0 - 80, v - 150, u1 + 80, v + 150));
  const rowBands = [band(G.frame0, G.frame1, vFrame), band(0, G.calata, vDrop), ...(bed ? [band(bed.u0, bed.u1, (g > 0 ? bed.v1 : bed.v0) + 220 * g)] : [])];
  out.push(...setoutPlan(S, M, G, hookOf(G, M, S.pieces ?? []), out, keep, rowBands));
  out.push(...reactionMarks(reactionPoints(G, M, heb), out, keep, within));
  if (S.railY !== undefined && S.railY !== null) out.push(...railAxis(S, G, S.railY, out, keep));
  const reach = (wl: typeof door): number => (wl === door ? out0 : WALL);
  return { entities: out, bounds: { x0: -reach('left'), y0: -reach('front'), x1: R.W + reach('right'), y1: R.D + reach('rear') } };
}

/** The machine's parts and the bedplate with the pulley as boxes the set-out's lettering keeps off. */
const gearBoxes = (parts: readonly Box[], bed: Box | null): Box[] => [...parts, ...(bed ? [bed] : [])];
