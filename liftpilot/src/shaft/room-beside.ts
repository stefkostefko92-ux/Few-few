// What the machine room's plan (room-view.ts) sets beside the machine along the rope drop line: the sheave's size,
// written along the line on the side away from the gearbox, and the rows of the frame's and the rope drop's chains,
// each moved out until it clears the governor, the control panel's free area and the main switch (and the sheave's size
// where that moved out). Model entities and rows, room axes [mm]; pure.
import { TEXT, textWidth, type Box, type Entity, type Pt } from '../drawing';
import { rinvioAcross, rinvioRun } from './rinvio';
import { ropeWidths, type MachineSpec, type RoomGeo } from './machine-room';
import { onDrop, quad } from './room-draw';
import { bbox } from './room-fittings-view';
import { dimBands, meets, takenBy } from './room-label';
import type { RoomSite } from './room-site';

/** The lettering of the frame's and of the rope drop's chains beside the machine (room-view.ts draws them). */
export const FRAME_TEXT = '{v} Telaio argano', DROP_TEXT = 'Calata Funi {v}';

/** The bedplate with the diverting pulley, when the pulley turns in it: its run along the drop line and across it. */
export interface Bed {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** What goes beside the machine: the side of the drop line away from the gearbox (`side`, v) and the gearbox's
 *  (`gear`), the bedplate with the pulley, the rows (v) of the frame's and the drop's chains, the sheave's size. */
export interface Beside {
  side: number;
  gear: number;
  bed: Bed | null;
  vFrame: number;
  vDrop: number;
  sheave: Entity;
}

/** The sheave's size and the rows of the chains beside the machine `M`, over the plan drawn so far (`drawn`, the
 *  governor's entities of `S` besides), clear of the control panel's free area `free`, of the main switch `sw` and of
 *  the names `names` (the switch's, the free areas' sizes: round 37); `k` the plan's scale (model millimetres to one of
 *  paper). */
export function besideMachine(S: RoomSite, M: MachineSpec, G: RoomGeo, drawn: readonly Entity[], free: readonly Pt[], sw: readonly Pt[], k: number, names: readonly Box[] = []): Beside {
  const R = G.room, w = ropeWidths(M.n, M.d), g = G.dir, clearV = Math.max(w.ropes + 60, M.Dp > 0 ? w.pulley + 40 : 0);
  const side = g > 0 ? Math.min(G.across[0], -clearV) : Math.max(G.across[1], clearV), gear = g > 0 ? G.across[1] : G.across[0];
  // the bedplate with the diverting pulley, when the pulley turns in it: its chain goes on the machine's other side
  const rfx = M.rinvio, bed = rfx?.on === 'frame' && M.Dp > 0 && G.pulleyZ - M.Dp / 2 >= 0
    ? (([u0, u1], [v0, v1]) => ({ u0, u1, v0, v1 }))(rinvioRun(M, G), rinvioAcross(G, rfx)) : null;
  // the sheave's size along the drop line (read from the left or from below: on an axis level or upright), where it
  // keeps off the lettering drawn and the governor's lettering and dimensions: as always, else along the line, else
  // farther out (the rows below keep off it there)
  let deg = (Math.atan2(G.uy, G.ux) * 180) / Math.PI;
  if (deg > 90 + 1e-9) deg -= 180;
  else if (deg <= -90 + 1e-9) deg += 180;
  const gov = [...takenBy(S.governor.entities, k), ...dimBands(S.governor.entities, k)], busy = [...takenBy(drawn, k), ...gov];
  const size = (at: Pt): Entity => ({ e: 'text', at, text: `${M.label ? `${M.label} · ` : ''}Ø ${M.D}`, size: 1.8, align: 'c', angle: deg, halo: true });
  const tries = [0, 160, 320, 480, 640].flatMap((dv) => [0, 150, -150, 300, -300, 450, -450, 600, -600].map((du) => ({ dv, at: onDrop(G, G.sheaveAt + du, side - (70 + dv) * g) })));
  const clear = tries.find((t) => takenBy([size(t.at)], k).every((b) => busy.every((q) => !meets(b, q)))), sheave = size((clear ?? tries[0]).at);
  // the frame's and the drops' chains beside the machine, each moved further out until its row and lettering clear the
  // governor with its name and P4, the control panel's free area, the main switch and the names given, and the sheave's
  // size moved out (round 37)
  const blocked = [...(S.governor.box ? [S.governor.box] : []), bbox(free), bbox(sw), ...names, ...(clear && clear.dv > 0 ? takenBy([sheave], k) : [])];
  const inside = (p: Pt): boolean => p[0] > 100 && p[0] < R.W - 100 && p[1] > 100 && p[1] < R.D - 100;
  // how much of a row's band (its lettering and ticks, the lettering `text` past an end where it does not fit its
  // segment: dims.ts writes it there, room-label.ts dimBands) lies on them: 0 clear, Infinity out of the room; askew, the
  // band in stretches about as long as it is wide (one box round a slanted band takes a square of the room). Round 37:
  // askew every row seemed taken and the drop's lettering, past the car's end, went over the main switch's name.
  const askew = Math.max(Math.abs(G.ux), Math.abs(G.uy)) <= 0.999, over = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const onBlocked = (v: number, u0: number, u1: number, text: string): number => {
    if (!inside(onDrop(G, (u0 + u1) / 2, v))) return Infinity;
    const w = (textWidth(text.replace('{v}', String(Math.round(u1 - u0))), { size: TEXT.dim, cond: true }) + 1) * k, past = w > u1 - u0 ? w : 0;
    const a = u0 - 80 - past, b = u1 + 80 + past, n = askew ? Math.max(1, Math.ceil((b - a) / 300)) : 1;
    return Array.from({ length: n }, (_, i) => bbox(quad(G, a + ((b - a) * i) / n, v - 150, a + ((b - a) * (i + 1)) / n, v + 150)))
      .reduce((t, band) => t + blocked.reduce((s, q: Box) => s + over(q.x0, q.x1, band.x0, band.x1) * over(q.y0, q.y1, band.y0, band.y1), 0), 0);
  };
  // the first clear row: away from the gearbox as always, else past the machine (and the bedplate's chain) on its side —
  // the rows counted toward the gearbox (w = g·v); none clear, the one least on what is there
  const pick = (rows: readonly number[], u0: number, u1: number, text: string): number =>
    g * (rows.find((r) => onBlocked(g * r, u0, u1, text) === 0) ?? rows.reduce((b, r) => (onBlocked(g * r, u0, u1, text) < onBlocked(g * b, u0, u1, text) ? r : b)));
  const far = (v0: number, v1: number): number => Math.max(g * v0, g * v1), gs = g * side;
  const beyond = Math.max(far(G.across[0], G.across[1]), bed ? far(bed.v0, bed.v1) + 220 : -Infinity) + 200;
  // (two rows farther out on either side when none of the usual ones is clear: round 37)
  const vFrame = pick([gs - 220, gs - 370, beyond, beyond + 150, gs - 520, gs - 670, beyond + 300, beyond + 450], G.frame0, G.frame1, FRAME_TEXT), wf = g * vFrame;
  const vDrop = wf < 0
    ? pick([Math.min(gs - 420, wf - 200), Math.min(gs - 570, wf - 350), beyond, beyond + 150, Math.min(gs - 720, wf - 500), Math.min(gs - 870, wf - 650), beyond + 300, beyond + 450], 0, G.calata, DROP_TEXT)
    : pick([gs - 220, gs - 370, gs - 520, wf + 200, wf + 350, gs - 670, gs - 820, wf + 500, wf + 650], 0, G.calata, DROP_TEXT);
  return { side, gear, bed, vFrame, vDrop, sheave };
}
