import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { Translator } from '../i18n.js';
import type { ViewHelpers } from '../http/view.js';
import { riepilogoModuli, type RiepilogoGruppo } from '../ordini/riepilogo.js';
import { displaySections, type DisplayField } from './format.js';
import { sezioniStampate } from './ordine.js';
import { drawHeader, drawPlate } from './pdf-head.js';
import {
  drawFields,
  drawFooters,
  drawSectionTitle,
  MARGIN,
  type PdfContext,
} from './pdf-layout.js';
import { drawTable } from './pdf-table.js';
import type { SchedaFull } from './service.js';

/**
 * PDF на схемата, A4, черно на бяло — същото съдържание като страницата за печат. Шрифтът е DejaVu Sans
 * (кирилица, италиански ударения, ☑/☐), вграден като подмножество; Helvetica/Times не се ползват —
 * те нямат кирилица, а бележките може да са на български.
 */

const FONT_FILES = { regular: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf' } as const;

export function pdfFontPaths(dir: string): { regular: string; bold: string } {
  return { regular: join(dir, FONT_FILES.regular), bold: join(dir, FONT_FILES.bold) };
}

/** Проверка при старт: образ без шрифтовете е счупен — по-добре процесът да не тръгне. */
export function assertPdfFonts(dir: string): void {
  const paths = pdfFontPaths(dir);
  for (const path of Object.values(paths)) {
    if (!existsSync(path)) throw new Error(`Липсва шрифтът за PDF: ${path} (PDF_FONT_DIR)`);
  }
}

export interface PdfOptions {
  t: Translator;
  fmt: ViewHelpers;
  /** Кой тегли файла — в долния ред („Generato il … da …“). */
  generatedBy: string;
  /** Папката с DejaVu Sans (PDF_FONT_DIR). */
  fontDir: string;
  /** Логото на фирмата на картата (вече прекодирано при качването) или null. */
  logo: Buffer | null;
}

export function renderSchedaPdf(scheda: SchedaFull, options: PdfOptions): Promise<Buffer> {
  const { t, fmt } = options;
  const fonts = pdfFontPaths(options.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${t('scheda.title')} ${scheda.numeroImpianto ?? scheda.matricola ?? ''}`.trim(),
      Author: 'Carbon Stealth VCC',
      Creator: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  doc.registerFont('Sans', fonts.regular);
  doc.registerFont('Sans-Bold', fonts.bold);
  const ctx: PdfContext = { doc, t };
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const sections = displaySections(scheda, t, fmt, scheda.azienda.ordineSezioni);
  const byKey = new Map(sections.flatMap((s) => s.fields).map((f) => [f.key, f]));

  // Заглавна лента: логото на фирмата, датата и кой е попълнил картата; заглавието, адресът и бонът.
  const { azienda } = scheda;
  drawHeader(ctx, {
    logo: options.logo,
    logoSize:
      azienda.logoWidth && azienda.logoHeight
        ? { width: azienda.logoWidth, height: azienda.logoHeight }
        : null,
    aziendaName: azienda.name,
    title: t('scheda.title'),
    dateLine: `${t('scheda.field.data')}: ${fmt.day(scheda.data)}`,
    creatorLabel: t('scheda.compiledBy'),
    creator: scheda.createdBy?.name ?? '—',
    // Промяна след създаването (не секундите между двата реда при самото създаване).
    updatedLine:
      scheda.updatedBy && scheda.updatedAt.getTime() - scheda.createdAt.getTime() > 1000
        ? t('scheda.meta.updated', {
            name: scheda.updatedBy.name,
            at: fmt.dateTime(scheda.updatedAt),
          })
        : '',
    address: scheda.indirizzo,
    noAddress: t('scheda.noAddress'),
    buonoLabel: t('scheda.buonoRiferimento'),
    buono: scheda.buonoLavoro,
  });

  drawPlate(ctx, scheda, byKey);
  // „Impianto“ е вече в заглавната лента и в табелата; изключените в картата не влизат.
  for (const section of sezioniStampate(sections, scheda.sezioniEscluse)) {
    drawSectionTitle(ctx, section.title);
    // Таблицата с мерките стои веднага под своето поле: полетата се рисуват на парчета около нея.
    let chunk: DisplayField[] = [];
    for (const field of section.fields) {
      chunk.push(field);
      if (field.table) {
        drawFields(ctx, chunk);
        drawTable(ctx, field.table);
        chunk = [];
      }
    }
    drawFields(ctx, chunk);
  }
  // Попълненото в модулите на доставчиците — само ако картата го иска (`riepilogoOrdini`).
  for (const modulo of riepilogoModuli(scheda)) {
    drawSectionTitle(ctx, modulo.nome);
    drawFields(ctx, modulo.gruppi.map(gruppoField));
  }
  drawFooters(ctx, t('pdf.generated', { at: fmt.dateTime(new Date()), name: options.generatedBy }));
  doc.end();
  return done;
}

/** Група от модул като клетка на цял ред: отметнатото с ☑, после написаното („Corsa Mt.: 12“). */
function gruppoField(gruppo: RiepilogoGruppo, index: number): DisplayField {
  const parts = [
    ...gruppo.spunte.map((label) => `☑ ${label}`),
    ...gruppo.testi.map(({ label, value }) => `${label}: ${value}`),
  ];
  return {
    key: `modulo-${index}`,
    label: gruppo.titolo,
    value: parts.join('    '),
    kind: 'text',
    wide: true,
  };
}

/** Името на файла: номер или матрикула + дата; само безопасни знаци. */
export function pdfFileName(scheda: {
  numeroImpianto: string | null;
  matricola: string | null;
  id: string;
  data: Date;
}): string {
  const id = scheda.numeroImpianto ?? scheda.matricola ?? scheda.id.slice(-8);
  return `scheda-${id}-${scheda.data.toISOString().slice(0, 10)}.pdf`.replace(
    /[^A-Za-z0-9._-]/g,
    '',
  );
}
