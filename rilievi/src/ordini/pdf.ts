import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { pdfFontPaths } from '../schede/pdf.js';
import { fieldsOf, moduloPdf, type Modulo, type ModuloAcro, type ModuloOverlay } from './moduli.js';
import type { Valori } from './valori.js';

/**
 * PDF-ът на модул на доставчик: самият официален модул с нашите стойности — нищо друго не се пипа.
 * Pelazza (плосък PDF): кръстчета в кутийките и текст върху редовете, по координатите от картата.
 * Montanari (формуляр): полетата се попълват по име и формулярът се „заключва“ (flatten). Шрифтът е
 * DejaVu Sans (кирилица, ударения) — никога вграденият Helvetica на pdf-lib.
 */

const INK = rgb(0, 0, 0);
const MIN_SIZE = 5;

async function open(modulo: Modulo, fontDir: string): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = await PDFDocument.load(moduloPdf(modulo));
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(pdfFontPaths(fontDir).regular), { subset: true });
  doc.setProducer('Rilievi Impianti — Carbon Stealth VCC');
  return { doc, font };
}

/** Един ред: никога не се пренася — смалява се до 5 pt, после се реже с многоточие. */
export function fitLine(
  font: PDFFont,
  text: string,
  width: number,
  size: number,
): { text: string; size: number } {
  const wide = font.widthOfTextAtSize(text, size);
  if (wide <= width) return { text, size };
  const smaller = Math.max(MIN_SIZE, Math.floor(((size * width) / wide) * 10) / 10);
  if (font.widthOfTextAtSize(text, smaller) <= width) return { text, size: smaller };
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, smaller) > width)
    cut = cut.slice(0, -1);
  return { text: `${cut}…`, size: smaller };
}

/** Редовете на абзац в ширината (по думи; дълга дума се реже по знаци). */
export function wrap(font: PDFFont, text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Най-едрият шрифт (до `max`), при който абзацът влиза в кутията; иначе 5 pt и каквото влезе. */
export function fitBlock(
  font: PDFFont,
  text: string,
  width: number,
  height: number,
  max: number,
): { lines: string[]; size: number } {
  for (let size = max; size >= MIN_SIZE; size -= 0.5) {
    const lines = wrap(font, text, width, size);
    if (lines.length * size * 1.18 <= height) return { lines, size };
  }
  const lines = wrap(font, text, width, MIN_SIZE);
  return {
    lines: lines.slice(0, Math.max(1, Math.floor(height / (MIN_SIZE * 1.18)))),
    size: MIN_SIZE,
  };
}

function cross(page: PDFPage, box: readonly [number, number, number, number]): void {
  const height = page.getHeight();
  const [x0, top, x1, bottom] = box;
  const inset = 1.3;
  const low = { x: x0 + inset, y: height - bottom + inset };
  const high = { x: x1 - inset, y: height - top - inset };
  page.drawLine({ start: low, end: high, thickness: 1.1, color: INK });
  page.drawLine({
    start: { x: low.x, y: high.y },
    end: { x: high.x, y: low.y },
    thickness: 1.1,
    color: INK,
  });
}

export async function renderOverlay(
  modulo: ModuloOverlay,
  valori: Valori,
  fontDir: string,
): Promise<Uint8Array> {
  const { doc, font } = await open(modulo, fontDir);
  const page = doc.getPage(0);
  const height = page.getHeight();
  for (const field of fieldsOf(modulo)) {
    const value = valori[field.key];
    if (field.kind === 'check') {
      if (value === true && 'box' in field) cross(page, field.box);
      continue;
    }
    if (typeof value !== 'string' || !value) continue;
    if ('line' in field) {
      const [x0, x1, y] = field.line;
      const fit = fitLine(font, value, x1 - x0, 8);
      page.drawText(fit.text, { x: x0, y: height - y + 1.6, size: fit.size, font, color: INK });
    } else if ('area' in field) {
      const [x0, top, x1, bottom] = field.area;
      const block = fitBlock(font, value, x1 - x0 - 4, bottom - top - 4, 9);
      block.lines.forEach((line, i) => {
        const y = height - top - 2 - block.size * (i + 1) * 1.18 + block.size * 0.22;
        page.drawText(line, { x: x0 + 2, y, size: block.size, font, color: INK });
      });
    }
  }
  return doc.save();
}

export async function renderAcroform(
  modulo: ModuloAcro,
  valori: Valori,
  fontDir: string,
): Promise<Uint8Array> {
  const { doc, font } = await open(modulo, fontDir);
  const form = doc.getForm();
  for (const field of fieldsOf(modulo)) {
    if (!('acro' in field)) continue;
    const value = valori[field.key];
    if (field.kind === 'check') {
      if (value === true) form.getCheckBox(field.acro).check();
      continue;
    }
    if (typeof value !== 'string' || !value) continue;
    const textField = form.getTextField(field.acro);
    const widgets = textField.acroField.getWidgets();
    for (const widget of widgets) {
      // Модулът е без рамка (/BC празно); pdf-lib би очертал полето в черно — дебелината става 0.
      if (!widget.getAppearanceCharacteristics()?.getBorderColor()?.length) {
        widget.getBorderStyle()?.setWidth(0);
      }
    }
    const rect = widgets[0]?.getRectangle();
    const width = (rect?.width ?? 100) - 4;
    if (field.kind === 'textarea') {
      const block = fitBlock(font, value, width - 4, (rect?.height ?? 40) - 4, 10);
      textField.setFontSize(block.size);
      textField.setText(block.lines.join('\n'));
    } else {
      const fit = fitLine(font, value, width, 10);
      textField.setFontSize(fit.size);
      textField.setText(fit.text);
    }
    textField.updateAppearances(font);
  }
  // Само попълнените полета са с нов облик; останалото (празните полета, бутонът) остава оригинално.
  form.flatten({ updateFieldAppearances: false });
  return doc.save();
}

export function renderModulo(modulo: Modulo, valori: Valori, fontDir: string): Promise<Uint8Array> {
  return modulo.tipo === 'overlay'
    ? renderOverlay(modulo, valori, fontDir)
    : renderAcroform(modulo, valori, fontDir);
}
