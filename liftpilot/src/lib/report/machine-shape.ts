// The maker's machine as it is, in the relazione: the sheet's dimensions the installer needs to place it (overall
// sizes, the sheave's and the worm's axes over the feet, the sheave's mid-plane P and width E, the holes of the feet)
// and the height of the bedframe the drawings put under it (src/shaft/machine-shape.ts); where the diverting pulley
// turns in the machine room (src/shaft/rinvio.ts). Italian. Pure.
import { bodyBox, machineFrame, sheaveOf, type MachineShape } from '@/shaft/machine-shape';
import type { RinvioFrame } from '@/shaft/rinvio';

/** `rf`: the bedplate with the diverting pulley the machine stands on; on the maker's, the machine's seat is the maker's. */
export function shapeRows(S: MachineShape, D: number, fmt: (x: number, dp?: number) => string, rf: RinvioFrame | null = null): [string, string][] {
  const seat = rf?.on === 'frame' ? rf.bed : null, mk = rf?.on === 'frame' ? rf.maker : null;
  const { P, E } = sheaveOf(S, D), F = machineFrame(D, S, seat), xs = S.holes.map((h) => h[0]), zs = S.holes.map((h) => h[1]);
  const span = (v: number[]): string => fmt(Math.max(...v) - Math.min(...v), 0);
  // an inclined worm (its angle) and what hangs under the feet's plane, as the drawing has them
  const tilt = S.parts.find((p) => p.tilt)?.tilt, below = Math.round(-bodyBox(S)[1]);
  const worm = `${S.wormScaled ? '≈ ' : ''}${fmt(S.yWorm, 0)} mm${tilt ? `, inclinata di ${fmt(Math.abs((tilt.a * 180) / Math.PI), 0)}°` : ''}${S.wormScaled ? ' (misurato sul disegno in scala)' : ''}`;
  return [
    ['Ingombri (scheda del costruttore)', `${fmt(S.overall[0], 0)} mm dall'asse della puleggia sul lato opposto al motore, ${fmt(S.overall[1], 0)} mm verso il motore `
      + `(motore più grande), altezza ${fmt(S.overall[2], 0)} mm sul piano dei piedi${below > 0 ? `, fino a ${fmt(below, 0)} mm sotto` : ''}`],
    ['Assi sul piano dei piedi', `puleggia ${fmt(S.yWheel, 0)} mm, vite senza fine ${worm}`],
    ['Puleggia', `Ø ${fmt(D, 0)} mm, piano medio a P = ${fmt(P, 1)} mm dal piano della vite, larghezza E = ${fmt(E, 0)} mm`],
    ['Fissaggio', `${S.holes.length} × ${S.hole} su ${span(xs)} × ${span(zs)} mm; piedi ${fmt(S.feet[2] - S.feet[0], 0)} × ${fmt(S.feet[3] - S.feet[1], 0)} mm`],
    mk && seat !== null
      ? ['Sede sul basamento', `${fmt(seat, 0)} mm sotto i piedi, sul basamento ${mk.brand} ${mk.code}: l'asse della puleggia a ${fmt(mk.sheaveAxis, 0)} mm sul pavimento del locale`]
      : ['Telaio sotto l\'argano', `alto ${fmt(F.bed, 0)} mm (scelta del software): l'asse della puleggia a ${fmt(F.axis, 0)} mm sul piano d'appoggio del telaio`],
  ];
}

/** The diverting pulley in the machine room, never in the shaft: in the machine's bedplate (the maker's, with its code,
 *  or ours) or on its own stand on the floor. */
export function rinvioRow(rf: RinvioFrame, fmt: (x: number, dp?: number) => string): [string, string] {
  const axis = `asse a ${fmt(rf.pulleyAxis, 0)} mm sul pavimento del locale`;
  if (rf.on === 'stand') return ['Puleggia di rinvio', `nel locale macchine, mai nel vano: su un proprio supporto a pavimento, ${axis}`];
  const mk = rf.maker;
  return ['Puleggia di rinvio', mk
    ? `nel locale macchine, mai nel vano: nel basamento ${mk.brand} ${mk.code} dell'argano (${fmt(mk.mass, 0)} kg con puleggia e antivibranti), ${axis}, `
      + `sommità a ${fmt(mk.top, 0)} mm, asse della puleggia di trazione a ${fmt(mk.sheaveAxis, 0)} mm (fonte: ${mk.src})`
    : `nel locale macchine, mai nel vano: nel telaio dell'argano (UPN, su antivibranti; scelta del software), ${axis}, sommità a ${fmt(rf.top, 0)} mm`];
}
