// The fascicolo of an RT after the owner's model (round 52): the cover, «Dati Generali» (page 1), each component's
// pages in the model's order, «Allegati» — the blocks report/fascicolo.py draws, every text and number written here.
// Pure.
import { moduloDi } from '../../rt2/componenti';
import type { Rt2Derivato } from '../../rt2/derive';
import type { Rt2Inputs } from '../../rt2/input';
import type { PaginaCtx } from '../../rt2/types';
import { paginaAllegati, type FileAllegato } from './allegati';
import { copertina, paginaGenerale, type IdentRt2 } from './generale';
import type { FascicoloDoc, FBlock } from './model';

export const TITOLO_PAGINA: Readonly<Record<'10411-1' | '10411-11', string>> = {
  '10411-1': 'Documentazione tecnica relativa alla modifica su impianto ascensore preesistente non conforme alla Direttiva Ascensori',
  '10411-11': 'Documentazione tecnica relativa alla modifica su impianto ascensore preesistente conforme alla Direttiva Ascensori',
};
export const NORMA_STAMPA: Readonly<Record<'10411-1' | '10411-11', string>> = { '10411-1': 'UNI 10411-1:2024', '10411-11': 'UNI 10411-11:2024' };

export interface FascicoloMeta {
  /** the record's code line (number, revision, fingerprints) and its date for the PDF's information */
  code: string;
  created?: string;
}

export function buildFascicolo(d: Rt2Derivato, x: Rt2Inputs, id: IdentRt2, files: readonly FileAllegato[], m: FascicoloMeta,
  logo: { mime: string; data: string } | null): FascicoloDoc {
  const p: PaginaCtx = { titolo: TITOLO_PAGINA[d.ctx.norma], norma: NORMA_STAMPA[d.ctx.norma], idoneitaAllegata: d.allegati.includes('idoneitaEdificio') };
  const pagine: FBlock[] = d.componenti.flatMap((c) => {
    const mod = moduloDi(c), e = d.esiti[c];
    return mod && e ? mod.pagine(d.ctx, d.dati[c] ?? {}, e, p) : [];
  });
  return {
    meta: {
      title: `Relazione tecnica di modifica ${id.numero}`, subject: p.titolo, author: id.azienda, matricola: id.matricola || '—',
      commessa: x.doc?.commessa || '—', norma: p.norma, code: m.code,
      notice: 'Documento valido solo con le firme di chi lo ha redatto e dell’ingegnere che lo ha verificato.',
      ...(m.created ? { created: m.created } : {}),
    },
    blocks: [copertina(x, id), ...paginaGenerale(d, x, id, p), ...pagine, ...paginaAllegati(d, x, files, id.azienda, p)],
    ...(logo && id.logo ? { drawing: { images: { logo } } } : {}),
  };
}
