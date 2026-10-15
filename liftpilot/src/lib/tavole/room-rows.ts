// What sheet 1 and the replacement's sheet 1 write about the machine room besides the loads (registry locale.gancio,
// carichi.reazioni, locale.putrelle.vano): the lifting hook's rated load, the reactions R1…Rn on the support's bearings
// at the sheet's load (three to a row) and on the legs of the pulley's own stand, with the anchors in tension of the
// bearings pulled up, the line on the governor’s load P4 when the data do not give it, and the note on the HEB beams'
// bearings. Italian; pure.
import { hebDrawn, type HebLayout, type HebShaft } from '@/shaft/heb';
import type { MachineSpec, RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { hookOf } from '@/shaft/room-hook';
import { PULLED_UP, supportReactions, upliftOf } from '@/shaft/room-reactions';
import type { SupportLoad } from '@/shaft/support-check';
import type { Note } from './notes';

type Fmt = (x: number, dp: number) => string;
type LoadRow = readonly [string, string, string];

/** The hook's row: its rated load for the heaviest piece (`pieces`: the other pieces lifted, a replacement's existing
 *  machine). */
export function hookRow(G: RoomGeo, M: MachineSpec, fmt: Fmt, pieces: readonly number[] = []): LoadRow {
  return ['GANCIO DI SOLLEVAMENTO SOPRA L’ARGANO: PORTATA', fmt(hookOf(G, M, pieces).load, 0), 'kg'];
}

/** The reactions R1…Rn on the support's bearings at `load` (with the dynamic coefficient), three to a row; then those
 *  of the legs of the pulley's own stand on the floor, numbered on; the anchors in tension of the bearings pulled up,
 *  with their pull (round 37). */
export function reactionRows(G: RoomGeo, M: MachineSpec, load: SupportLoad, heb: HebLayout | null, fmt: Fmt): LoadRow[] {
  const r = supportReactions(G, M, load, heb), out: LoadRow[] = [], up = upliftOf(r);
  // the machine kept on its existing base (round 46, B8): one resultant, its share over the base's bearings surveyed
  if (r.kept) {
    return [['RISULTANTE SUL BASAMENTO ESISTENTE, STATICA', fmt(r.kept.static, 0), 'daN'], ['RISULTANTE SUL BASAMENTO ESISTENTE, DINAMICA', fmt(r.kept.dynamic, 0), 'daN'],
      ['RIPARTIZIONE SUGLI APPOGGI DEL BASAMENTO ESISTENTE', 'DA RILEVARE', '']];
  }
  const rows = (R: readonly number[], first: number, what: string, where: string): void => {
    for (let i = 0; i < R.length; i += 3) {
      const part = R.slice(i, i + 3), names = part.map((_, k) => `R${first + i + k}`).join(' / ');
      // (a bearing pulled up — the load's centre off the bearings' — is written negative: its anchor in tension)
      out.push([`REAZIONI ${what} ${names} ${where}${part.some((x) => x < PULLED_UP) ? ' (− = TRAZIONE)' : ''}`, part.map((x) => fmt(x, 0)).join(' / '), 'daN']);
    }
  };
  rows(r.R, 1, 'APPOGGI', r.on === 'walls' ? 'NEI MURI' : 'SULLA SOLETTA');
  if (r.stand) rows(r.stand.R, r.R.length + 1, 'PIEDI DEL RINVIO', 'SULLA SOLETTA');
  if (up.length) out.push([`${up.length > 1 ? 'ANCORAGGI' : 'ANCORAGGIO'} A TRAZIONE (SOLLEVAMENTO) ${up.map((u) => `R${u.i}`).join(' / ')} ≥`, up.map((u) => fmt(u.pull, 0)).join(' / '), 'daN']);
  return out;
}

/** The machine kept on its existing base (round 46, B8; registry locale.basamento.esistente): what the software does not
 *  check, and whose proof it is (UNI 10411-1:2024 and UNI 10411-11:2024, point 5). */
export const keptBaseNote = (tag: string): Note => ({
  title: 'ARGANO ESISTENTE SUL SUO BASAMENTO', tag,
  text: 'L’argano resta sul suo basamento esistente: posizione, altezza e appoggi da rilevare in sito; l’asse della puleggia è quello della L0 del '
    + 'calcolo. Il software non verifica il basamento né la soletta: con portata o velocità maggiori la prova della struttura dell’edificio è a cura '
    + 'del proprietario (UNI 10411-1:2024, 5; UNI 10411-11:2024, 5), da confermare dal tecnico strutturale.',
});

/** The HEB beams the drawings take for the room of `G` (none without them): the beams of the reactions. */
export const hebFor = (G: RoomGeo, M: MachineSpec, shaft: HebShaft, govRopes: Parameters<typeof hebDrawn>[3] = []): HebLayout | null =>
  hebDrawn(G, M, shaft, govRopes);

/** The HEB beams over the shaft: their bearings and the fixing of the support to them (registry locale.putrelle.vano): the
 *  plates as long as the bearing, as wide and thick as the registry has them, as the plan and the 3D draw them. */
export const hebNote = (tag: string): Note => ({
  title: 'PUTRELLE HEB SOPRA IL VANO', tag,
  text: `Appoggi sui muri del vano su piastre ${KV_VERT.hebBearing} × ${KV_VERT.hebPlateW} × ${KV_VERT.hebPlateT} mm e malta antiritiro di `
    + `${KV_VERT.hebMortar} mm; fra gli appoggi le putrelle non toccano la soletta. Fissaggio del basamento alle ali (piastre e bulloni o `
    + 'morsetti) e dettaglio degli appoggi a cura del tecnico strutturale.',
});
