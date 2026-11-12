import { intestazioneDi } from '../aziende/dati.js';
import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { datiDi } from './dati.js';
import type { PreventivoFull } from './elenco.js';
import { renderPreventivoPdf } from './pdf.js';

/** Името на файла на офертата — само номерът (цяло число), нищо от написаното. */
export const nomeFilePreventivo = (numero: number): string => `preventivo-${numero}.pdf`;

/** PDF/A-ът на офертата такава, каквато е сега (страницата, писмото, износът). */
export function pdfDelPreventivo(
  row: PreventivoFull,
  options: { t: Translator; fmt: ViewHelpers; fontDir: string; logo: Buffer | null },
): Promise<Buffer> {
  return renderPreventivoPdf(datiDi(row), {
    ...options,
    intestazione: intestazioneDi(row.azienda.name, row.azienda.datiSocietari),
    numero: row.numero,
    generatoIl: new Date(),
  });
}
