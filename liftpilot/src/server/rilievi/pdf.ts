import 'server-only';
// The sheet's PDF, A4, black on white — the same content as the print page. The font is DejaVu Sans (Italian accents,
// Cyrillic, ☑/☐) from the font directory of LiftPilot's reports (REPORT_FONT_DIR), embedded as a subset; the built-in
// Helvetica/Times are never used. The suppliers' modules never enter it (their own PDFs: modulo-pdf.ts). Ported 1:1 from
// rilievi (src/schede/pdf.ts); the logo is the company's logo of the drawing sets, «Compilata da» the sheet's author.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { displaySections, type DisplayField, type SchedaShown } from '@/lib/rilievi/format';
import { fmt } from '@/lib/rilievi/fmt';
import type { RilieviT } from '@/lib/rilievi/t';
import { drawFields, drawFooters, drawHeader, drawPlate, drawSectionTitle, MARGIN, type PdfContext } from './pdf-layout';
import { drawTable } from './pdf-table';

const FONT_FILES = { regular: 'DejaVuSans.ttf', bold: 'DejaVuSans-Bold.ttf' } as const;

export function pdfFontPaths(dir: string): { regular: string; bold: string } {
  return { regular: join(dir, FONT_FILES.regular), bold: join(dir, FONT_FILES.bold) };
}

/** An image without the fonts is broken: say so before drawing anything. */
export function assertPdfFonts(dir: string): void {
  for (const path of Object.values(pdfFontPaths(dir))) {
    if (!existsSync(path)) throw new Error(`The PDF font is missing: ${path} (REPORT_FONT_DIR)`);
  }
}

/** The sheet as the PDF draws it: its fields and rows, its author and last editor, its company's name. */
export type SchedaForPdf = SchedaShown & {
  createdBy: { name: string } | null;
  updatedBy: { name: string } | null;
  company: { name: string };
};

export interface PdfOptions {
  t: RilieviT;
  /** Who downloads the file — in the bottom line («Generato il … da …»). */
  generatedBy: string;
  /** The directory with DejaVu Sans (REPORT_FONT_DIR). */
  fontDir: string;
  /** The company's logo of the drawing sets (PNG or JPEG, checked on upload) and its size in pixels, or null. */
  logo: { data: Uint8Array; width: number; height: number } | null;
  /** The moment in the bottom line (now; fixed in the tests). */
  now?: Date;
}

export function renderSchedaPdf(scheda: SchedaForPdf, options: PdfOptions): Promise<Buffer> {
  const { t } = options;
  assertPdfFonts(options.fontDir);
  const fonts = pdfFontPaths(options.fontDir);
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${t('scheda.title')} ${scheda.numeroImpianto ?? scheda.matricola ?? ''}`.trim(),
      Author: 'Carbon Stealth VCC',
      Creator: 'LiftPilot Rilievi — Carbon Stealth VCC',
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

  const sections = displaySections(scheda, t);
  const byKey = new Map(sections.flatMap((s) => s.fields).map((f) => [f.key, f]));

  // the header band: the company's logo top left, on the right the date and who filled the sheet in
  drawHeader(ctx, {
    logo: options.logo ? Buffer.from(options.logo.data) : null,
    logoSize: options.logo ? { width: options.logo.width, height: options.logo.height } : null,
    aziendaName: scheda.company.name,
    title: t('scheda.title'),
    dateLine: `${t('scheda.field.data')}: ${fmt.day(scheda.data)}`,
    creatorLabel: t('scheda.compiledBy'),
    creator: scheda.createdBy?.name ?? '—',
    // a change after the creation (not the moment between the two lines of the creation itself)
    updatedLine:
      scheda.updatedBy && scheda.updatedAt.getTime() - scheda.createdAt.getTime() > 1000
        ? t('scheda.meta.updated', { name: scheda.updatedBy.name, at: fmt.dateTime(scheda.updatedAt) })
        : '',
  });

  drawPlate(ctx, scheda, byKey);
  for (const section of sections) {
    drawSectionTitle(ctx, section.title);
    // the measurements' table stands right under its field: the fields are drawn in pieces around it
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
  drawFooters(ctx, t('pdf.generated', { at: fmt.dateTime(options.now ?? new Date()), name: options.generatedBy }));
  doc.end();
  return done;
}
