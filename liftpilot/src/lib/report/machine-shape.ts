// The maker's machine as it is, in the relazione: the sheet's dimensions the installer needs to place it (overall
// sizes, the sheave's and the worm's axes over the feet, the sheave's mid-plane P and width E, the holes of the feet)
// and what its feet stand on in the drawings — our bedframe, the irons of our bedplate, the maker's pedestal
// (src/shaft/machine-shape.ts); where the diverting pulley turns in the machine room (src/shaft/rinvio.ts). Italian.
// Pure.
import { bodyBox, machineFrame, sheaveOf, type MachineFrame, type MachineShape } from '@/shaft/machine-shape';
import { KV_VERT } from '@/shaft/norme-vert';
import type { MakerBedplate, RinvioFrame } from '@/shaft/rinvio';

/** `rf`: the bedplate with the diverting pulley the machine stands on (on ours its feet on the irons, on the maker's its
 *  pedestal).
 *  `through`: the machine below beside the shaft, its sheave through the wall (machine-shape.ts machineFrame). */
export function shapeRows(S: MachineShape, D: number, fmt: (x: number, dp?: number) => string, rf: RinvioFrame | null = null, through = false): [string, string][] {
  const seat = rf?.on === 'frame' ? rf.bed : null, mk = rf?.on === 'frame' ? rf.maker : null;
  const { P, E } = sheaveOf(S, D), F = machineFrame(D, S, seat, through), xs = S.holes.map((h) => h[0]), zs = S.holes.map((h) => h[1]);
  const irons = `${F.beams.map((z) => fmt(z, 0)).join(', ')} mm dal piano della vite`;
  const span = (v: number[]): string => fmt(Math.max(...v) - Math.min(...v), 0);
  // an inclined worm (its angle) and what hangs under the feet's plane, as the drawing has them
  const tilt = S.parts.find((p) => p.tilt)?.tilt, below = Math.round(-bodyBox(S)[1]);
  const SCALED = ' (valore misurato sul disegno in scala)', scaled = (v: string, on: boolean | undefined): string => (on ? `≈ ${v}${SCALED}` : v);
  const worm = S.wormX !== undefined
    ? `verticale, ${scaled(`${fmt(Math.abs(S.wormX), 0)} mm dall’asse della puleggia`, S.wormScaled)}`
    : scaled(`${fmt(S.yWorm, 0)} mm${tilt ? `, inclinata di ${fmt(Math.abs((tilt.a * 180) / Math.PI), 0)}°` : ''}`, S.wormScaled);
  // a vertical machine has no motor's side: its sides are the overall's two ends
  const sides = S.wormX !== undefined ? `${fmt(S.overall[0], 0)} e ${fmt(S.overall[1], 0)} mm dall’asse della puleggia ai due lati`
    : `${fmt(S.overall[0], 0)} mm dall’asse della puleggia sul lato opposto al motore, ${fmt(S.overall[1], 0)} mm verso il motore (motore più grande)`;
  return [
    [`Ingombri (scheda del costruttore${S.bodyFrom ? `; corpo come la ${S.bodyFrom}` : ''})`, `${sides}, altezza ${S.heightScaled ? '≈ ' : ''}`
      + `${fmt(S.overall[2], 0)} mm sul piano dei piedi${below > 0 ? `, fino a ${fmt(below, 0)} mm sotto` : ''}${S.heightScaled ? SCALED : ''}`],
    ['Assi sul piano dei piedi', `puleggia ${fmt(S.yWheel, 0)} mm, vite senza fine ${worm}`],
    ['Puleggia', `Ø ${fmt(D, 0)} mm, piano medio a P = ${fmt(P, 1)} mm dal piano della vite, larghezza E `
      + (S.sheaveScaled ? scaled(`${fmt(E, 0)} mm`, true) : `= ${fmt(E, 0)} mm${S.bodyFrom ? ` (come la ${S.bodyFrom})` : ''}`)],
    ['Fissaggio', `${S.holes.length} × ${S.hole} su ${span(xs)} × ${span(zs)} mm; piedi ${fmt(S.feet[2] - S.feet[0], 0)} × ${fmt(S.feet[3] - S.feet[1], 0)} mm`],
    standsOn(F, mk, irons, through, fmt),
  ];
}

/** What the machine's feet stand on: the maker's pedestal on the maker's bedplate, the irons of our bedplate with the
 *  diverting pulley, or our bedframe (machine-shape.ts machineFrame). */
function standsOn(F: MachineFrame, mk: MakerBedplate | null, irons: string, through: boolean, fmt: (x: number, dp?: number) => string): [string, string] {
  if (mk && F.on === 'pedestal') {
    return ['Piedistallo sul basamento', `del costruttore, alto ${fmt(F.bed, 0)} mm sotto i piedi, sul basamento ${mk.brand} ${mk.code} come lo disegna il `
      + `costruttore: l’asse della puleggia a ${fmt(mk.sheaveAxis, 0)} mm sul pavimento del locale`];
  }
  if (F.on === 'pad') {
    return ['Rialzo sul basamento', `in acciaio, alto ${fmt(F.bed, 0)} mm sotto i piedi, sui ferri del telaio con rinvio (una trave UPN 160 sotto ogni `
      + `ferro, a ${irons}; la puleggia fra il secondo e il terzo): quanto tiene ${fmt(KV_VERT.machineRimClear, 0)} mm sopra i ferri ciò che scende sotto `
      + `il piano dei piedi (volantino e freno della vite inclinata), il volantino libero per la manovra di emergenza; l’asse della puleggia a `
      + `${fmt(F.axis, 0)} mm sulla sommità del basamento`];
  }
  if (F.on === 'bedplate') {
    return ['Appoggio sul basamento', `i piedi direttamente sui ferri del ${mk ? `basamento ${mk.brand} ${mk.code}` : 'telaio con rinvio (una trave UPN 160 sotto '
      + `ogni ferro, a ${irons}; la puleggia fra il secondo e il terzo)`}, senza un telaio proprio: l’asse della puleggia a ${fmt(F.axis, 0)} mm sulla `
      + 'sommità del basamento'];
  }
  return ['Telaio sotto l’argano', `alto ${fmt(F.bed, 0)} mm (scelta del software: quanto serve all’argano, ferri alti quanto il telaio sugli `
    + `antivibranti, mai su ritti), ${through ? `con i ferri sotto le file di fori (a ${irons}): la puleggia passa il muro del vano`
    : `con tre ferri sopra e la puleggia fra il secondo e il terzo (a ${irons})`}: l’asse della puleggia a ${fmt(F.axis, 0)} mm sul piano d’appoggio del telaio`];
}

/** The diverting pulley in the machine room, never in the shaft: in the machine's bedplate (the maker's, with its code,
 *  or ours) or on its own stand on the floor. */
export function rinvioRow(rf: RinvioFrame, fmt: (x: number, dp?: number) => string): [string, string] {
  const axis = `asse a ${fmt(rf.pulleyAxis, 0)} mm sul pavimento del locale`;
  if (rf.on === 'stand') return ['Puleggia di rinvio', `nel locale macchina, mai nel vano: su un proprio supporto a pavimento, ${axis}`];
  const mk = rf.maker;
  return ['Puleggia di rinvio', mk
    ? `nel locale macchina, mai nel vano: nel basamento ${mk.brand} ${mk.code} dell’argano (${fmt(mk.mass, 0)} kg con puleggia e antivibranti), ${axis}, `
      + `sommità a ${fmt(mk.top, 0)} mm, asse della puleggia di frizione a ${fmt(mk.sheaveAxis, 0)} mm (fonte: ${mk.src})`
    : `nel locale macchina, mai nel vano: nel telaio dell’argano (UPN sotto i suoi ferri, su antivibranti; scelta del software), ${axis}, sommità a ${fmt(rf.top, 0)} mm`];
}
