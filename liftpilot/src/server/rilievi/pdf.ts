import 'server-only';
// The sheet's PDF, A4, black on white — the same content as the print page. The font is DejaVu Sans (Italian accents,
// Cyrillic) from the font directory of LiftPilot's reports (REPORT_FONT_DIR), embedded as a subset; the built-in
// Helvetica/Times are never used. The boxes and the ticks are drawn with lines (pdf-spunte.ts). The sections in the
// company's order, without those the sheet leaves out (`sezioniEscluse`); what the suppliers' modules hold comes in at the
// end, of the modules the sheet asks for (`moduliStampati`; the modules themselves are their own PDFs: modulo-pdf.ts).
// Ported 1:1 from rilievi (src/schede/pdf.ts, commit 988f3cf37); the logo is the company's logo of the drawing sets,
// «Compilata da» the sheet's author.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { displaySections, type DisplayField, type SchedaShown } from '@/lib/rilievi/format';
import { fmt } from '@/lib/rilievi/fmt';
import { sezioniStampate } from '@/lib/rilievi/ordine';
import { riepilogoModuli, type RiepilogoGruppo } from '@/lib/rilievi/ordini/riepilogo';
import type { RilieviT } from '@/lib/rilievi/t';
import { drawHeader, drawPlate } from './pdf-head';
import { drawFields, drawFooters, drawSectionTitle, MARGIN, type PdfContext, type PdfField } from './pdf-layout';
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

/** The sheet as the PDF draws it: its fields and rows, its author and last editor, its company's name and order of the
 *  sections. */
export type SchedaForPdf = SchedaShown & {
  createdBy: { name: string } | null;
  updatedBy: { name: string } | null;
  company: { name: string; ordineSezioni: readonly string[] };
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

  const sections = displaySections(scheda, t, scheda.company.ordineSezioni);
  const byKey = new Map(sections.flatMap((s) => s.fields).map((f) => [f.key, f]));

  // the header band: the company's logo, the date and who filled the sheet in; the title, the address and the work order
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
    address: scheda.indirizzo,
    noAddress: t('scheda.noAddress'),
    buonoLabel: t('scheda.buonoRiferimento'),
    buono: scheda.buonoLavoro,
  });

  drawPlate(ctx, scheda, byKey);
  // «Impianto» is in the header band and the plate already; the sections the sheet leaves out do not come in
  for (const section of sezioniStampate(sections, scheda.sezioniEscluse)) {
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
  // what is filled in the suppliers' modules — only in those the sheet asks for (`moduliStampati`)
  for (const modulo of riepilogoModuli(scheda)) {
    drawSectionTitle(ctx, modulo.nome);
    drawFields(ctx, modulo.gruppi.map(gruppoField));
  }
  drawFooters(ctx, t('pdf.generated', { at: fmt.dateTime(options.now ?? new Date()), name: options.generatedBy }));
  doc.end();
  return done;
}

/** A module's group as a cell on a whole row: the ticked, then the written («Corsa Mt.: 12»). */
function gruppoField(gruppo: RiepilogoGruppo, index: number): PdfField {
  return {
    key: `modulo-${index}`,
    label: gruppo.titolo,
    value: '',
    kind: 'text',
    wide: true,
    options: gruppo.spunte.map((label) => ({ value: label, label, checked: true })),
    testo: gruppo.testi.map(({ label, value }) => `${label}: ${value}`).join('    '),
  };
}
