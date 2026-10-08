// The bedplate with the diverting pulley drawn in the machine room (rinvio.ts): in section B-B along the rope drop line
// (u) over the room's floor (z) — the legs at its ends on their dampers, the beams at the top under the machine, the two
// plates the pulley's axle turns in, hung from the beams — and in plan, under the machine and the pulley. With its
// dimensions: the pulley's axis and the top over the floor (the top changes with the dimension on our bedplate; a
// maker's has its own), its length, the maker's code. Model entities.
import { chain, edit as E, path, rect, type Entity, type Pt } from '../drawing';
import { machineV, ropeWidths, type MachineSpec, type RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { PROFILES } from './profiles';
import { axisOverTop, bedplateBeams, rinvioAcross, rinvioRun, type RinvioFrame } from './rinvio';

/** Section B-B: the bedplate, its legs and dampers, the pulley's plates; its heights left of it (`sk`: the section's
 *  scale on 1:25, their offsets kept on paper). */
export function rinvioSection(M: MachineSpec, G: RoomGeo, rf: RinvioFrame, sk = 1): Entity[] {
  const out: Entity[] = [], P = PROFILES[KV_VERT.rinvioBeam], leg = KV_VERT.rinvioLeg, pads = KV_VERT.rinvioPads;
  const [u0, u1] = rinvioRun(M, G), top = rf.top, under = top - P.h, pu = G.pulleyAt, zp = G.pulleyZ, base = rf.base ?? 0;
  // the beams seen beside the cut, drawn and not hatched (the pulley and the ropes in front stay readable)
  out.push(rect(u0, under, u1, top, 'outline'));
  for (const z of [top - P.tf, under + P.tf]) out.push(path([[u0, z], [u1, z]] as Pt[], false, 'thin'));
  for (const x of [u0, u1 - leg]) {
    out.push(rect(x, base + pads, x + leg, under, 'outline', 'steel'));
    out.push(rect(x - 10, base, x + leg + 10, base + pads, 'thin', 'paper'));
  }
  // the axle's plates, hung from the beams down past the axle (a pulley set higher by hand: between the beams, up to them)
  out.push(rect(pu - 80, zp - 70, pu + 80, Math.min(top, Math.max(under, zp + 90)), 'thin'));
  // the heights: the pulley's axis, the top (ours changes with it, the sheave's axis follows); the length; the code
  const fixed = rf.maker !== null;
  // left of the bedplate, past the sheave's axis (room-section-view.ts draws it at the machine's end less 120; where the
  // room is narrow, section-columns.ts sets them again)
  // the pulley's axis: the bedplate's own, or the sheave's axis less an h entered by hand (whose change may take
  // another machine: its h is the dimension to change)
  out.push(chain({ dir: 'y', pts: [0, zp], at: u0 - 220 * sk, from: [null, pu], text: ['Asse rinvio {v}'], edit: [null] }));
  out.push(chain({ dir: 'y', pts: [base, top], at: u0 - 420 * sk, from: [null, u0], text: [`{v} ${fixed ? rf.maker?.code : 'Telaio'}`], edit: [fixed ? null : E('rinvio.height')] }));
  // over the room past dx and the machine's frame (room-section-view.ts)
  out.push(chain({ dir: 'x', pts: [u0, u1], side: 'top', row: 2, from: [top, top], text: [`{v} ${rinvioName(rf)}`] }));
  return out;
}

/** Plan: the bedplate under the machine and the pulley — its side beams under the machine's outer irons, a beam of its
 *  own under each iron they do not carry: the irons the machine's feet stand on, seen where the machine leaves them —,
 *  its legs at the corners, the two plates the pulley's axle turns in; its length and width (the plan's own chains,
 *  after the machine's). */
export function rinvioPlan(M: MachineSpec, G: RoomGeo, rf: RinvioFrame, onDrop: (u: number, v: number) => Pt): Entity[] {
  const [u0, u1] = rinvioRun(M, G), [v0, v1] = rinvioAcross(G, rf), leg = KV_VERT.rinvioLeg, b = PROFILES[KV_VERT.rinvioBeam].b;
  const quad = (a0: number, w0: number, a1: number, w1: number): Pt[] => [onDrop(a0, w0), onDrop(a1, w0), onDrop(a1, w1), onDrop(a0, w1)];
  // the beams along the drop line and the channels across its ends, at its top: the machine drawn after hides them
  const beam = (a0: number, w0: number, a1: number, w1: number): Entity => path(quad(a0, w0, a1, w1), true, 'outline', 'cw');
  const out: Entity[] = [beam(u0, v0, u1, v0 + b), beam(u0, v1 - b, u1, v1), beam(u0, v0 + b, u0 + b, v1 - b), beam(u1 - b, v0 + b, u1, v1 - b)];
  // the irons no side beam carries, each on a beam of its own from end to end (bedplateBeams)
  for (const z of bedplateBeams(G.frame.beams, rf.maker?.width ?? KV_VERT.rinvioWidth).inner) {
    const v = machineV(G, z);
    out.push(beam(u0 + b, v - b / 2, u1 - b, v + b / 2));
  }
  for (const u of [u0, u1 - leg]) for (const v of [v0, v1 - leg]) out.push(path(quad(u, v, u + leg, v + leg), true, 'outline', 'steel'));
  // the axle's plates either side of the pulley, 160 mm along the drop line, 10 mm thick inside the pulley's band (as the
  // 3D and the pulley's own stand)
  const half = ropeWidths(M.n, M.d).pulley, pu = G.pulleyAt;
  for (const s of [-1, 1]) out.push(path(quad(pu - 80, s * (half - 10), pu + 80, s * half), true, 'outline', 'steel'));
  return out;
}

/** The bedplate's name on the dimension of its length: the maker's product by its code. */
export const rinvioName = (rf: RinvioFrame): string => (rf.maker ? `Telaio con rinvio ${rf.maker.brand} ${rf.maker.code}` : 'Telaio con rinvio');

/** The dimension of h on the bedplate: the top takes the change (the pulley's axis and the machine's height stay; the
 *  bedplate's own height is its top over the HEB beams it stands on). */
export const rinvioHEdit = (M: MachineSpec, rf: RinvioFrame) => (rf.maker ? null : E('rinvio.height', rf.pulleyAxis - axisOverTop(M.D, M.shape ?? null, rf.bed) - (rf.base ?? 0)));
