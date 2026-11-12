import { prisma } from '../db.js';
import { config } from '../config.js';
import { viewHelpers } from '../http/view.js';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { sigilloIntatto } from '../interventi/conferma.js';
import { renderInterventoPdf } from '../interventi/pdf.js';
import { interventiConfermatiDi, interventoPerId, numeroModulo } from '../interventi/service.js';
import { dayFromDate } from '../time.js';
import { sigilloVerbaleIntatto } from '../verbali/conferma.js';
import { COPIE, renderVerbalePdf } from '../verbali/pdf.js';
import { verbalePerId, verbaliConfermatiDi } from '../verbali/service.js';
import { SELECT_VERSIONE } from './formato.js';
import { aziendaLogo } from './service.js';

/**
 * Файловете на износа, които се правят един по един, докато архивът тече (Кодаджията, 12 ноември 2026 —
 * не всичко в паметта): PDF/A-тата на потвърдените документи (`documenti/`; Allegato B, B.7 f) и g)) и
 * версиите на всяка карта (`versioni/<карта>.json` — в dati.json само пътят). Списъкът носи само id-тата;
 * редът се чете точно преди файла. Документ с нарушен печат не се прави (null), както и в портала.
 */
export interface FileGenerato {
  nome: string;
  genera: () => Promise<Buffer | null>;
}

export const fileVersioni = (schedaId: string): string => `versioni/${schedaId}.json`;

/** Картите на фирмата, които имат записани версии. */
export async function schedeConVersioni(aziendaId: string): Promise<string[]> {
  const righe = await prisma.schedaVersione.groupBy({
    by: ['schedaId'],
    where: { scheda: { aziendaId } },
  });
  return righe.map((r) => r.schedaId);
}

export async function fileGeneratiDi(
  aziendaId: string,
  conVersioni: readonly string[],
): Promise<FileGenerato[]> {
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
  const out: FileGenerato[] = [];
  for (const r of interventi) {
    out.push({
      nome: `documenti/interventi/modulo-${numeroModulo(r.numero)}-${dayFromDate(r.data)}.pdf`,
      genera: async () => {
        const row = await interventoPerId(r.id);
        return row && sigilloIntatto(row) ? renderInterventoPdf(row, opzioni) : null;
      },
    });
  }
  for (const r of verbali) {
    for (const copia of COPIE) {
      out.push({
        nome: `documenti/verbali/verbale-${dayFromDate(r.data)}-${r.id}-copia-${copia}.pdf`,
        genera: async () => {
          const row = await verbalePerId(r.id);
          return row && sigilloVerbaleIntatto(row)
            ? renderVerbalePdf(row, { ...opzioni, copia })
            : null;
        },
      });
    }
  }
  for (const schedaId of conVersioni) {
    out.push({
      nome: fileVersioni(schedaId),
      genera: async () => {
        const versioni = await prisma.schedaVersione.findMany({
          where: { schedaId },
          orderBy: { numero: 'asc' },
          select: SELECT_VERSIONE,
        });
        return Buffer.from(JSON.stringify(versioni, null, 2), 'utf8');
      },
    });
  }
  return out;
}
