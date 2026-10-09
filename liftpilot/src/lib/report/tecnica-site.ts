// What the relazione tecnica of a replacement says about the site besides the room's rows (tecnica-room.ts), round 36:
// the slab's openings with their place from the shaft's inner walls (registry locale.fori), the loads and the bearings
// of the existing machine beside the new one — one computation for the masses on the slab, the table and the conclusion
// on UNI 10411-1:2024, point 5 (to be confirmed by the engineer; round 37) —, the lifting hook and the masses it lifts
// (locale.gancio), the governor's load P4 when not given, and the points to check on site; and a whole design's room in
// the relazione of the calculation (openings, hook, reactions, mounts with the anchors in tension). Italian; our own
// words, clause numbers and values only. Pure.
import { hebDrawn } from '@/shaft/heb';
import { roomGeo, type MachineSpec } from '@/shaft/machine-room';
import { KV_VERT } from '@/shaft/norme-vert';
import { hookOf } from '@/shaft/room-hook';
import { mountsText } from '@/shaft/room-mounts';
import { supportReactions, upliftOf } from '@/shaft/room-reactions';
import { slabOpenings } from '@/shaft/room-setout';
import { layoutSite } from '@/shaft/room-site';
import type { Box } from '@/shaft/room-floor';
import type { SupportLoad } from '@/shaft/support-check';
import type { Layout } from '@/shaft/types';
import type { Plant } from '../plant';
import type { RoomDerived } from '../room/derive';
import type { Survey } from '../room/survey';
import { EXISTING_SUPPORT_IT, governorRopeHole, surveyedOpenings } from '../room/survey-site';
import { surveyLoad } from '../tavole/survey-data';
import type { ReportBlock } from './model';

type Fmt = (x: number, dp?: number) => string;
const daN = (kg: number): number => (kg * 9.81) / 10;

/** The openings the new machine needs in the slab — size along x × y of the room (along × across the drops askew) and
 *  the middle from the shaft's inner walls as the survey measures the drops — and the existing ones surveyed. */
export function openingsBlocks(d: RoomDerived, s: Survey, fmt: Fmt): ReportBlock[] {
  if (!d.G) return [];
  const G = d.G, R = G.room, ops = slabOpenings(d.site, d.M, G), onX = Math.abs(G.ux) > 0.999, onY = Math.abs(G.uy) > 0.999, r = (x: number): string => fmt(Math.round(x), 0);
  const out: ReportBlock[] = [];
  if (ops.length) {
    out.push({ t: 'p', text: `Aperture nella soletta per le funi${d.M.Dp > 0 ? ' e il rinvio' : ''} della nuova macchina (${KV_VERT.holeGap} mm di gioco, bordo di `
      + `${KV_VERT.slabKerb} mm sul pavimento): misura e centro dall’angolo interno del vano (x lungo il muro dell’accesso A, y nel vano), come le calate del rilievo.` });
    out.push({ t: 'grid', head: ['Apertura', onX || onY ? 'L × P (x × y)' : 'Lungo × di traverso le calate', 'Centro x', 'Centro y'], widths: [0.34, 0.26, 0.2, 0.2], align: ['l', 'r', 'r', 'r'],
      rows: ops.map((o, i) => [`${i + 1}${o.wheel ? ' (anche la puleggia di rinvio)' : ''}`, onY ? `${r(o.across)} × ${r(o.along)}` : `${r(o.along)} × ${r(o.across)}`, `${r(o.centre[0] - R.shaftX)} mm`, `${r(o.centre[1] - R.shaftY)} mm`]) });
  }
  // only the openings surveyed; the governor's ropes' under it is the software's assumption, and stays with it (round 37)
  const old = surveyedOpenings(s), ropes = governorRopeHole(s), at = ([x0, y0, x1, y1]: Box): string => `${r(x1 - x0)} × ${r(y1 - y0)} mm a x ${r((x0 + x1) / 2)}, y ${r((y0 + y1) / 2)} mm dai muri del locale`;
  out.push({ t: 'p', style: 'note', text: (old.length
    ? `Aperture esistenti rilevate: ${old.map(at).join('; ')}. Quelle che non servono più si chiudono senza indebolire la soletta, con la verifica del tecnico.`
    : 'Aperture esistenti non rilevate: confrontarle in sito con quelle disegnate prima dei lavori.')
    + (ropes ? ` Foro delle funi del limitatore sotto di esso: ipotesi del software (${at(ropes)}), da confermare in sito; resta con il limitatore.` : '') });
  return out;
}

/** The existing machine's load on the slab beside the new one's — one computation for the table, the sentence on the
 *  masses and the conclusion on point 5 (round 37): the new machine whole with what carries it as P9 counts it, P1, P9,
 *  the existing machine's P9 (its entered mass, with its frame or support, on the same suspended masses) and the change. */
export function slabChange(d: RoomDerived, Pl: Plant) {
  const { ctx } = d.analysis, { ld, machine, whole } = surveyLoad(d, Pl), P1 = ld.P[0] ?? 0, P23 = (ld.P[1] ?? 0) + (ld.P[2] ?? 0), P9 = ld.P[8] ?? 0;
  const known = ctx.compare && ctx.O.mass > 0, P9old = known ? P1 + P23 + daN(ctx.O.mass) : null;
  return { known, machine, whole, P1, P9, P9old, grow: P9old === null ? null : P9 - P9old };
}

/** A change of load on the slab as the relazione writes it [daN]: "+99", "−146" or "0". */
const signed = (x: number, fmt: Fmt): string => (x > 0.5 ? `+${fmt(Math.round(x), 0)}` : x < -0.5 ? `−${fmt(Math.round(-x), 0)}` : '0');

/** The masses of the existing and the new machine on the slab and the change of P9 — the numbers of the table of
 *  existingNewBlocks, never the catalogue's mass alone (round 37). */
export function massesBlock(d: RoomDerived, Pl: Plant, fmt: Fmt): ReportBlock[] {
  const { ctx } = d.analysis, { known, machine, whole, grow } = slabChange(d, Pl), r0 = (x: number): string => fmt(Math.round(x), 0);
  if (!known || grow === null || ctx.N.mass <= 0) return [];
  const parts = [`argano completo ${r0(whole.kg)} kg${whole.estimate ? `, stima ⚠: ${r0(ctx.N.mass)} kg dal catalogo più le parti che non comprende` : ''}`,
    ...(machine - whole.kg > 0.5 ? [`telaio o basamento ${r0(machine - whole.kg)} kg`] : [])];
  return [{ t: 'p', text: `Massa dell’argano con il suo telaio o basamento: esistente ${r0(ctx.O.mass)} kg, nuovo ${r0(machine)} kg (${parts.join(', ')}); `
    + `carico totale sulla soletta P9 ${signed(grow, fmt)} daN rispetto all’argano esistente (tabella «Carichi e appoggi»).` }];
}

/** The existing machine's loads and bearings beside the new one's, and UNI 10411-1:2024, point 5: the forces grow, or
 *  their points move — while the old position is not surveyed they are not known, a support kept too (round 37) —, so
 *  it applies; to be confirmed by the engineer. */
export function existingNewBlocks(d: RoomDerived, s: Survey, Pl: Plant, fmt: Fmt): ReportBlock[] {
  const { P1, P9, P9old, grow, machine, known } = slabChange(d, Pl), { ctx } = d.analysis, r0 = (x: number): string => fmt(Math.round(x), 0);
  const old = s.existingSupport, oldKind = old ? EXISTING_SUPPORT_IT[old.kind] : 'non rilevato';
  const rows: string[][] = [
    ['Massa dell’argano (con il suo telaio o basamento)', known ? `${r0(ctx.O.mass)} kg` : 'non inserita', `${r0(machine)} kg`],
    ['P1 sul basamento (carico delle funi × coefficiente dinamico)', `${r0(P1)} daN (stesse masse sospese)`, `${r0(P1)} daN`],
    ['P9 totale sulla soletta', P9old === null ? '—' : `${r0(P9old)} daN`, `${r0(P9)} daN`],
    ['Appoggi', `${oldKind}${old ? (old.keep ? ', riusato' : ', rimosso') : ''}`,
      d.G ? `${old?.keep ? 'sul basamento esistente riusato, posizione da rilevare' : 'come nelle tavole'} (R1…Rn sul foglio 1)` : '—'],
  ];
  const out: ReportBlock[] = [
    { t: 'h3', text: 'Carichi e appoggi: argano esistente e nuovo (UNI 10411-1:2024, punto 5)' },
    { t: 'grid', head: ['Grandezza', 'Esistente', 'Nuovo'], widths: [0.42, 0.29, 0.29], align: ['l', 'l', 'l'], rows },
  ];
  const forces = grow === null ? 'carichi non confrontabili (massa dell’argano esistente non inserita)'
    : `carichi ${grow > 0.5 ? 'aumentati' : 'non aumentati'} (${signed(grow, fmt)} daN sulla soletta)`;
  // the drops unchanged only when the new machine's falls come down on those surveyed (m_calata)
  const cal = d.checks.find((c) => c.id === 'm_calata'), drops = cal?.status === 'ok' ? 'calate invariate' : cal?.value != null ? `calate del calcolo a ${r0(cal.value)} mm da quelle rilevate` : 'calate da verificare';
  const points = !old ? 'punti di applicazione non noti (basamento esistente non rilevato)'
    : old.keep ? `punti di applicazione da verificare (basamento esistente riusato, posizione non rilevata; ${drops})`
      : 'punti di applicazione spostati o non noti (nuovo basamento al posto di quello esistente)';
  out.push({ t: 'p', text: `${forces[0]?.toUpperCase() ?? ''}${forces.slice(1)}; ${points}: UNI 10411-1:2024, punto 5 — applicabile: l’idoneità delle `
    + 'strutture interessate (soletta, appoggi) va dimostrata dal proprietario tramite il suo tecnico. Conclusione da confermare dal tecnico incaricato.' });
  return out;
}

/** The hook over the machine and the masses lifted in the room (the existing machine out, the new one in). */
export function hookBlocks(d: RoomDerived, fmt: Fmt): ReportBlock[] {
  if (!d.G) return [];
  const { ctx } = d.analysis, h = hookOf(d.G, d.M, d.site.pieces ?? []), R = d.G.room, r0 = (x: number): string => fmt(Math.round(x), 0);
  return [{ t: 'p', text: `Gancio di sollevamento sopra il baricentro dell’argano, a x ${r0(h.at[0])} mm e y ${r0(h.at[1])} mm dai muri del locale, `
    + `l’occhio a ${r0(h.eye)} mm sul pavimento (${r0(R.H)} mm il soffitto): portata ${r0(h.load)} kg per il pezzo più pesante, ${r0(h.piece)} kg. `
    + `Masse da sollevare: ${ctx.compare && ctx.O.mass > 0 ? `argano esistente ${r0(ctx.O.mass)} kg, ` : 'argano esistente: massa da rilevare, '}`
    + `argano nuovo ${r0(d.M.mass)} kg${d.M.rinvio?.maker ? `, telaio con rinvio ${r0(d.M.rinvio.maker.mass ?? 0)} kg` : ''}. Il gancio esistente si usa solo con la `
    + 'portata targata non minore e il suo ancoraggio verificato.' }];
}

/** The note on P4 when the data of the installation do not give the governor's load. */
export const p4Block = (Pl: Plant): ReportBlock[] => (Pl.governorLoad == null ? [{ t: 'p', style: 'note',
  text: 'Carico P4 non indicato: è il carico del limitatore di velocità sulla soletta (il suo peso, il tiro della fune con il peso del tenditore '
    + 'in fossa, la forza d’intervento), dato del costruttore del limitatore, da inserire nei dati dell’impianto.' }] : []);

/** The points the survey's findings add to what to check on site. */
export function siteChecks(s: Survey): string[] {
  return [
    'Gancio di sollevamento esistente: posizione rispetto al baricentro del nuovo argano e portata targata',
    s.governor ? 'Limitatore di velocità: posizione e ingombro come nel rilievo, superficie libera davanti a esso' : 'Limitatore di velocità: non rilevato — rilevarne posizione e ingombro (le verifiche del locale non lo contano)',
    s.existingSupport?.keep ? 'Basamento esistente riusato: posizione, altezza, stato e appoggi da rilevare (punto 5 della UNI 10411-1:2024)'
      : s.existingSupport ? 'Basamento esistente: stato e appoggi, come nel rilievo' : 'Basamento esistente: tipo e appoggi da rilevare (punto 5 della UNI 10411-1:2024)',
    s.existingSupport?.keep ? 'Antivibranti del nuovo argano: tipo e portata del costruttore; fissaggi al basamento esistente verificati dal tecnico'
      : 'Antivibranti del nuovo basamento: tipo e portata del costruttore; fissaggi alla soletta o alle putrelle verificati dal tecnico',
  ];
}

/** A whole design's machine room in the relazione of the calculation: the slab's openings with their middle from the
 *  shaft's inner walls, the hook, the reactions R1…Rn at the calculation's load, the mounts and the fixings. */
export function designRoomBlocks(L: Layout, M: MachineSpec, load: SupportLoad, fmt: Fmt): ReportBlock[] {
  const G = roomGeo(L, M);
  if (!G) return [];
  const S = layoutSite(L), R = G.room, ops = slabOpenings(S, M, G), onY = Math.abs(G.uy) > 0.999, r0 = (x: number): string => fmt(Math.round(x), 0);
  const heb = hebDrawn(G, M, S, S.govRopes), rx = supportReactions(G, M, load, heb), hook = hookOf(G, M);
  const out: ReportBlock[] = [{ t: 'h3', text: 'Locale macchina: aperture nella soletta, gancio, appoggi del basamento' }];
  if (ops.length) {
    out.push({ t: 'grid', head: ['Apertura nella soletta', 'L × P', 'Centro dal muro sinistro del vano', 'Centro dal muro dell’accesso A'], widths: [0.3, 0.2, 0.25, 0.25], align: ['l', 'r', 'r', 'r'],
      rows: ops.map((o, i) => [`${i + 1}${o.wheel ? ' (anche la puleggia di rinvio)' : ''}`, onY ? `${r0(o.across)} × ${r0(o.along)}` : `${r0(o.along)} × ${r0(o.across)}`, `${r0(o.centre[0] - R.shaftX)} mm`, `${r0(o.centre[1] - R.shaftY)} mm`]) });
  }
  out.push({ t: 'p', text: `Gancio di sollevamento sopra il baricentro dell’argano, a x ${r0(hook.at[0])} mm e y ${r0(hook.at[1])} mm dai muri del locale: portata ${r0(hook.load)} kg `
    + `(il pezzo più pesante ${r0(hook.piece)} kg). Reazioni sugli appoggi del basamento ${rx.on === 'walls' ? 'nei muri' : 'sulla soletta'}, con il coefficiente dinamico: `
    + `${rx.R.map((x, i) => `R${i + 1} ${r0(x)} daN`).join(', ')}. ${mountsText(G, M, { uplift: upliftOf(rx) })}.` });
  return out;
}
