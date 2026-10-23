// The document of a relazione tecnica di modifica (RT plan §5): from the record as issued and the RT engine's derivation
// on its reproduced base, the blocks report/relazione.py draws — the head, the installation's data, the object of the
// modification, the references, the data before and after, the rules and the sections they bring, the building's
// structures, each component section in the order of src/lib/rt/sezioni.ts (the machine room's survey and the shaft
// among them), the outcome of the checks, the adaptations and obligations, the documents attached and expected, the note
// on the software and the signatures — and its meta: header, footer and fingerprints, the notice every page carries,
// the pages appended after the body (the files, counted in «Pagina k di N») and the fascicolo's line on page 1. The
// same input gives the same document: its blocks and meta are hashed into the RT's record (docSha). Italian; our own
// words, clause numbers and values only. Pure.
import type { SezioneKey, SezioneRt } from '../../rt/types';
import type { PdfBlock, ReportBlock, ReportDoc } from '../model';
import { TECNICA_DRAWING } from '../tecnica-room';
import { chiusuraBlocks, allegatiBlocks } from './allegati-firme';
import { ammortizzatoriBlocks } from './ammortizzatori';
import { SEZIONI_DOC, contestoDoc, type Ctx, type RtDocInput } from './contesto';
import { contrappesoBlocks, vanoBlocks } from './contrappeso-vano';
import { adempimentiSezione, esitoBlocks } from './esito';
import { arganoBlocks, funiBlocks } from './funi-argano';
import { guideCabinaBlocks, guideContrappesoBlocks } from './guide';
import { impiantoBlocks, oggettoBlocks, riferimentiBlocks } from './impianto';
import { intestazioneBlocks, numeroRt } from './intestazione';
import { limitatoreBlocks, porteBlocks } from './limitatore-porte';
import { localeBlocks } from './locale';
import { primaDopoBlocks } from './prima-dopo';
import { cabinaBlocks, quadroBlocks } from './quadro-cabina';
import { regoleBlocks } from './regole';
import { struttureBlocks } from './strutture';
import { DOC, fill, sha16 } from './testi';

export type { RtDocInput, RevisioneRt } from './contesto';
export { piedeAllegato } from './allegati-firme';

/** Each component section's builder. */
const SEZIONE: Readonly<Record<SezioneKey, (x: Ctx, s: SezioneRt) => ReportBlock[]>> = {
  quadro: quadroBlocks, cabina: cabinaBlocks, funi: funiBlocks, argano: arganoBlocks, locale: localeBlocks, guideCabina: guideCabinaBlocks,
  guideContrappeso: guideContrappesoBlocks, ammortizzatori: ammortizzatoriBlocks, limitatore: limitatoreBlocks, porte: porteBlocks,
  contrappeso: contrappesoBlocks, vano: vanoBlocks,
};

const TITOLI: Readonly<Record<keyof typeof SEZIONI_DOC, string>> = DOC.sezioni;

/** The pages the RT's files add after the body (their pages as stored at upload; a draft appends none). */
export const pagineAllegati = (r: Pick<RtDocInput, 'number' | 'allegati'>): number => (r.number ? r.allegati.reduce((n, a) => n + a.pages, 0) : 0);

function meta(x: Ctx): ReportDoc<PdfBlock>['meta'] {
  const { r, base } = x, rec = base.records, issued = r.number !== null, numero = issued ? `${numeroRt(r.number)} R${r.revision}` : DOC.numeroHeaderBozza;
  const name = r.project.name.length > 60 ? `${r.project.name.slice(0, 59)}…` : r.project.name;
  const impronte = [`calcolo ${sha16(rec.calc.sha256)}…`, ...(rec.room ? [`rilievo ${sha16(rec.room.sha256)}…`] : []),
    ...(rec.lift ? [`progetto ${sha16(rec.lift.sha256)}…`] : [])].join(' · ');
  const extra = pagineAllegati(r);
  return {
    title: `${DOC.titolo} ${numeroRt(r.number)} — ${r.project.name}`, subject: DOC.oggetto, author: r.company.name,
    header: fill(DOC.header, { numero, impianto: name }),
    footer: fill(DOC.footer, { numero, rt: x.d.engineVersion, calc: rec.calc.id }),
    code: fill(DOC.code, { impronte }),
    notice: issued ? DOC.notice : DOC.noticeBozza,
    extraPages: extra,
    fascicolo: !issued ? DOC.fascicoloBozza : extra ? DOC.fascicolo : DOC.fascicoloSenza,
  };
}

export function buildRelazioneModifica(r: RtDocInput): ReportDoc<PdfBlock> {
  const x = contestoDoc(r, TITOLI);
  const blocks: PdfBlock[] = [
    ...intestazioneBlocks(x), ...impiantoBlocks(x), ...oggettoBlocks(x), ...riferimentiBlocks(x), ...primaDopoBlocks(x), ...regoleBlocks(x),
    ...struttureBlocks(x),
    ...x.d.sezioni.flatMap((s) => SEZIONE[s.key](x, s)),
    ...esitoBlocks(x), ...adempimentiSezione(x), ...allegatiBlocks(x), ...chiusuraBlocks(x),
  ];
  return { meta: meta(x), blocks, drawing: { ...TECNICA_DRAWING, images: r.company.logo ? { logo: r.company.logo } : {} } };
}
