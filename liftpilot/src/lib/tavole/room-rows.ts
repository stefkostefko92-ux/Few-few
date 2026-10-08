// What sheet 1 and the replacement's sheet 1 write about the machine room besides the loads (registry locale.gancio,
// carichi.reazioni, locale.putrelle.vano): the lifting hook's rated load, the reactions R1…Rn on the support's bearings
// at the sheet's load (three to a row), the line on the governor’s load P4 when the data do not give it, and the note on the
// HEB beams' bearings. Italian; pure.
import { hebDrawn, type HebLayout } from '@/shaft/heb';
import type { MachineSpec, RoomGeo } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { hookOf } from '@/shaft/room-hook';
import { supportReactions } from '@/shaft/room-reactions';
import type { SupportLoad } from '@/shaft/support-check';
import type { Note } from './notes';

type Fmt = (x: number, dp: number) => string;
type LoadRow = readonly [string, string, string];

/** The hook's row: its rated load for the heaviest piece (`pieces`: the other pieces lifted, a replacement's existing
 *  machine). */
export function hookRow(G: RoomGeo, M: MachineSpec, fmt: Fmt, pieces: readonly number[] = []): LoadRow {
  return ['GANCIO DI SOLLEVAMENTO SOPRA L’ARGANO: PORTATA', fmt(hookOf(G, M, pieces).load, 0), 'kg'];
}

/** The reactions R1…Rn on the support's bearings at `load` (with the dynamic coefficient), three to a row. */
export function reactionRows(G: RoomGeo, M: MachineSpec, load: SupportLoad, heb: HebLayout | null, fmt: Fmt): LoadRow[] {
  const r = supportReactions(G, M, load, heb), where = r.on === 'walls' ? 'NEI MURI' : 'SULLA SOLETTA', out: LoadRow[] = [];
  for (let i = 0; i < r.R.length; i += 3) {
    const part = r.R.slice(i, i + 3), names = part.map((_, k) => `R${i + k + 1}`).join(' / ');
    // (a bearing pulled up — the load's centre off the bearings' — is written negative: its anchor in tension)
    out.push([`REAZIONI APPOGGI ${names} ${where}${part.some((x) => x < -0.5) ? ' (− = TRAZIONE)' : ''}`, part.map((x) => fmt(x, 0)).join(' / '), 'daN']);
  }
  return out;
}

/** The HEB beams the drawings take for the room of `G` (none without them): the beams of the reactions. */
export const hebFor = (G: RoomGeo, M: MachineSpec, shaft: { W: number; D: number; wall: number }, govRopes: Parameters<typeof hebDrawn>[3] = []): HebLayout | null =>
  hebDrawn(G, M, shaft, govRopes);

/** P4 without the governor's load in the data of the installation: the line under the distribution of the loads. */
export const P4_NOTE = 'P4 NON INDICATO: carico del limitatore sulla soletta (peso, tiro della fune con il tenditore, forza d’intervento) — dato del '
  + 'costruttore del limitatore, da inserire nei dati dell’impianto';

/** The HEB beams over the shaft: their bearings and the fixing of the support to them (registry locale.putrelle.vano). */
export const hebNote = (tag: string): Note => ({
  title: 'PUTRELLE HEB SOPRA IL VANO', tag,
  text: `Appoggi sui muri del vano su piastre ${KV_VERT.hebPlateW} × ${KV_VERT.hebPlateW} × ${KV_VERT.hebPlateT} mm e malta antiritiro di `
    + `${KV_VERT.hebMortar} mm; fra gli appoggi le putrelle non toccano la soletta. Fissaggio del basamento alle ali (piastre e bulloni o `
    + 'morsetti) e dettaglio degli appoggi a cura del tecnico strutturale.',
});
