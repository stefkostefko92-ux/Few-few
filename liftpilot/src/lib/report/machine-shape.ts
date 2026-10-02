// The maker's machine as it is, in the relazione: the sheet's dimensions the installer needs to place it (overall
// sizes, the sheave's and the worm's axes over the feet, the sheave's mid-plane P and width E, the holes of the feet)
// and the height of the bedframe the drawings put under it (src/shaft/machine-shape.ts). Italian. Pure.
import { machineFrame, sheaveOf, type MachineShape } from '@/shaft/machine-shape';

export function shapeRows(S: MachineShape, D: number, fmt: (x: number, dp?: number) => string): [string, string][] {
  const { P, E } = sheaveOf(S, D), F = machineFrame(D, S), xs = S.holes.map((h) => h[0]), zs = S.holes.map((h) => h[1]);
  const span = (v: number[]): string => fmt(Math.max(...v) - Math.min(...v), 0);
  return [
    ['Ingombri (scheda del costruttore)', `${fmt(S.overall[0], 0)} mm dall'asse della puleggia sul lato opposto al motore, ${fmt(S.overall[1], 0)} mm verso il motore `
      + `(motore più grande), altezza ${fmt(S.overall[2], 0)} mm sul piano dei piedi`],
    ['Assi sul piano dei piedi', `puleggia ${fmt(S.yWheel, 0)} mm, vite senza fine ${fmt(S.yWorm, 0)} mm`],
    ['Puleggia', `Ø ${fmt(D, 0)} mm, piano medio a P = ${fmt(P, 1)} mm dal piano della vite, larghezza E = ${fmt(E, 0)} mm`],
    ['Fissaggio', `${S.holes.length} × ${S.hole} su ${span(xs)} × ${span(zs)} mm; piedi ${fmt(S.feet[2] - S.feet[0], 0)} × ${fmt(S.feet[3] - S.feet[1], 0)} mm`],
    ['Telaio sotto l\'argano', `alto ${fmt(F.bed, 0)} mm (scelta del software): l'asse della puleggia a ${fmt(F.axis, 0)} mm sul piano d'appoggio del telaio`],
  ];
}
