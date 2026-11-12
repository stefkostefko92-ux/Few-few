import { config } from '../config.js';
import { viewHelpers } from '../http/view.js';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { sigilloIntatto } from '../interventi/conferma.js';
import { renderInterventoPdf } from '../interventi/pdf.js';
import { interventiConfermatiDi, numeroModulo } from '../interventi/service.js';
import { dayFromDate } from '../time.js';
import { sigilloVerbaleIntatto } from '../verbali/conferma.js';
import { COPIE, renderVerbalePdf } from '../verbali/pdf.js';
import { verbaliConfermatiDi } from '../verbali/service.js';
import { aziendaLogo } from './service.js';

/**
 * PDF/A-тата на потвърдените документи в износа — `documenti/` (Allegato B, B.7 f) и g); собственикът,
 * 12 ноември 2026 — точка D6): листовете за интервенция и двете копия на всеки протокол. Правят се един по
 * един, докато архивът тече (не всички в паметта); документ с нарушен печат не се прави (описанието му
 * остава в dati.json), както и в портала.
 */
export interface DocumentoNelTar {
  nome: string;
  genera: () => Promise<Buffer>;
}

export async function documentiDi(aziendaId: string): Promise<DocumentoNelTar[]> {
  const [interventi, verbali, logo] = await Promise.all([
    interventiConfermatiDi(aziendaId),
    verbaliConfermatiDi(aziendaId),
    aziendaLogo(aziendaId),
  ]);
  const opzioni = {
    t: translatorFor(DEFAULT_LOCALE),
    fmt: viewHelpers(DEFAULT_LOCALE),
    fontDir: config().PDF_FONT_DIR,
    logo: logo?.data ?? null,
  };
  const documenti: DocumentoNelTar[] = [];
  for (const row of interventi) {
    if (!sigilloIntatto(row)) continue;
    documenti.push({
      nome: `documenti/interventi/modulo-${numeroModulo(row.numero)}-${dayFromDate(row.data)}.pdf`,
      genera: () => renderInterventoPdf(row, opzioni),
    });
  }
  for (const row of verbali) {
    if (!sigilloVerbaleIntatto(row)) continue;
    for (const copia of COPIE) {
      documenti.push({
        nome: `documenti/verbali/verbale-${dayFromDate(row.data)}-${row.id}-copia-${copia}.pdf`,
        genera: () => renderVerbalePdf(row, { ...opzioni, copia }),
      });
    }
  }
  return documenti;
}
