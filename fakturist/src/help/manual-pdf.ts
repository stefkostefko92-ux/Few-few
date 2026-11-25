import PDFDocument from 'pdfkit';
import { BRAND } from '../brand.js';
import { DEFAULT_PDF_STYLE, resolvePdfStyle } from '../documents/pdf-style.js';
import { translator, type Locale } from '../i18n.js';
import { bgDate } from '../time.js';
import { SOFTWARE_VERSION } from '../version.js';
import type { HelpEntry } from './content.js';

/**
 * PDF наръчникът за вписания човек (SPEC 91): корица (името, организациите и ролите, датата, версията),
 * съдържание и разделите, които той вижда. Шрифтът е с кирилица (DejaVu Sans от образа — като
 * документите); без външни ресурси.
 */
const INK = '#131722';
const SOFT = '#485064';
const ACCENT = '#03756c';

export interface ManualReader {
  name: string;
  orgs: Array<{ legalName: string; kind: 'COMPANY' | 'ACCOUNTING_FIRM'; role: string }>;
}

export async function manualPdf(
  locale: Locale,
  reader: ManualReader,
  sections: HelpEntry[],
  options: { fontRoot: string; now?: Date },
): Promise<Buffer> {
  const t = translator(locale);
  const now = options.now ?? new Date();
  // Шрифтът по подразбиране на документите (DejaVu Sans — кирилица и €) от папката на образа.
  const style = resolvePdfStyle(DEFAULT_PDF_STYLE, null, options.fontRoot);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    bufferPages: true,
    info: {
      Title: t('help.manual.title'),
      Author: 'Carbon Stealth VCC',
      Creator: `${BRAND.nameLatin} ${SOFTWARE_VERSION}`,
      Producer: BRAND.nameLatin,
    },
  });
  doc.registerFont('sans', style.fonts.regular);
  doc.registerFont('bold', style.fonts.bold);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Корица
  doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
  doc.moveDown(6);
  doc.font('bold').fontSize(28).fillColor(INK).text(t('help.manual.title'), left, 200, { width });
  doc.font('sans').fontSize(13).fillColor(SOFT).text(t('help.manual.subtitle'), { width });
  doc.moveDown(2);
  doc.font('bold').fontSize(12).fillColor(INK).text(reader.name, { width });
  for (const org of reader.orgs) {
    const kind =
      org.kind === 'ACCOUNTING_FIRM' ? t('help.manual.forFirm') : t('help.manual.forCompany');
    doc
      .font('sans')
      .fontSize(11)
      .fillColor(SOFT)
      .text(`${org.legalName} — ${kind} · ${t('help.manual.role')}: ${org.role}`, { width });
  }
  doc.moveDown(1);
  doc
    .font('sans')
    .fontSize(10)
    .fillColor(SOFT)
    .text(
      `${t('help.manual.generated')}: ${bgDate(now)} · ${BRAND.nameLatin} ${SOFTWARE_VERSION}`,
      {
        width,
      },
    );

  // Съдържание
  doc.addPage();
  doc.font('bold').fontSize(18).fillColor(INK).text(t('help.manual.contents'), { width });
  doc.moveDown(0.8);
  sections.forEach((section, index) => {
    doc
      .font('sans')
      .fontSize(11)
      .fillColor(INK)
      .text(`${index + 1}. ${section.title}`, { width });
  });

  // Разделите
  doc.addPage();
  sections.forEach((section, index) => {
    // Нов раздел — на нова страница само ако до края остава малко място.
    if (index > 0) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 200) {
        doc.addPage();
      } else {
        doc.moveDown(1.2);
        doc
          .moveTo(left, doc.y)
          .lineTo(left + width, doc.y)
          .lineWidth(0.5)
          .strokeColor('#cfd4dd')
          .stroke();
        doc.moveDown(1);
      }
    }
    doc
      .font('bold')
      .fontSize(16)
      .fillColor(INK)
      .text(`${index + 1}. ${section.title}`, { width });
    if (section.notInPlan) {
      doc.moveDown(0.3);
      doc
        .font('sans')
        .fontSize(10)
        .fillColor(ACCENT)
        .text(t('help.manual.notAvailable'), { width });
    }
    doc.moveDown(0.5);
    doc.font('sans').fontSize(11).fillColor(INK).text(section.intro, { width, lineGap: 2 });
    doc.moveDown(0.6);
    section.steps.forEach((step, i) => {
      doc
        .font('bold')
        .fontSize(11)
        .fillColor(ACCENT)
        .text(`${i + 1}.`, left, doc.y, {
          width: 22,
          continued: false,
        });
      doc.moveUp();
      doc
        .font('sans')
        .fontSize(11)
        .fillColor(INK)
        .text(step, left + 22, doc.y, {
          width: width - 22,
          lineGap: 2,
        });
      doc.moveDown(0.35);
    });
    if (section.tips.length > 0) {
      doc.moveDown(0.4);
      for (const tip of section.tips) {
        doc.font('sans').fontSize(10).fillColor(SOFT).text(`— ${tip}`, left, doc.y, {
          width,
          lineGap: 2,
        });
        doc.moveDown(0.25);
      }
    }
  });

  // Номер на страница и подпис долу
  const pages = doc.bufferedPageRange();
  for (let i = 1; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    // Под долното поле — без него pdfkit би добавил нова страница.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('sans')
      .fontSize(8)
      .fillColor(SOFT)
      .text(
        `${t('help.manual.title')} · ${i + 1} / ${pages.count} · fakturist.eu — Carbon Stealth VCC`,
        left,
        doc.page.height - 40,
        { width, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
