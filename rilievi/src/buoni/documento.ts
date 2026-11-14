import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { chiaveSigillo } from '../interventi/conferma.js';
import { pathFirma } from '../interventi/firma.js';
import { improntaLeggibile } from '../interventi/sigillo.js';
import { datiDi } from './dati.js';
import { statoFirme, type StatoFirma } from './firme.js';
import { renderBuonoPdf, type FirmaPdf } from './pdf.js';
import { tipoPosto } from './posti.js';
import type { BuonoFull } from './elenco.js';

/**
 * Листът с проверените подписи — общото на страницата (routes/buoni*.ts), на PDF-а и на износа
 * (aziende/esportazione-documenti.ts): всеки подпис — печатът, щрихите и подписаното днес.
 */

export interface FirmaVista {
  path: string | null;
  valida: boolean;
  quando: Date;
  chi: string;
}

export function firmeVista(row: BuonoFull): Map<string, FirmaVista> {
  const stato = statoFirme(chiaveSigillo(), datiDi(row), row.firme);
  const out = new Map<string, FirmaVista>();
  for (const f of row.firme) {
    const s = stato.get(f.posto) as StatoFirma;
    out.set(f.posto, {
      path: s.firma ? pathFirma(s.firma) : null,
      valida: s.valida,
      quando: f.firmatoAt,
      chi: f.firmatoDa?.name ?? '—',
    });
  }
  return out;
}

/** Отпечатъкът на листа под подписите долу (за четене), ако има подпис долу. */
export function improntaFinale(row: BuonoFull): string | null {
  const finale = row.firme.find((f) => tipoPosto(f.posto) === 'finale');
  return finale ? improntaLeggibile(finale.impronta) : null;
}

export function nomeFileBuono(row: { id: string; numero: string | null }): string {
  const parte = (row.numero ?? '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `buono-di-lavoro-${parte || row.id}.pdf`;
}

/** PDF/A-ът на листа такъв, какъвто е сега. */
export function pdfDelBuono(
  row: BuonoFull,
  options: { t: Translator; fmt: ViewHelpers; fontDir: string; logo: Buffer | null },
): Promise<Buffer> {
  const stato = statoFirme(chiaveSigillo(), datiDi(row), row.firme);
  const firme = new Map<string, FirmaPdf>(
    [...stato].map(([posto, s]) => [posto, { firma: s.firma, valida: s.valida }]),
  );
  return renderBuonoPdf(datiDi(row), {
    ...options,
    azienda: row.azienda,
    firme,
    impronta: improntaFinale(row),
    generatoIl: new Date(),
  });
}
