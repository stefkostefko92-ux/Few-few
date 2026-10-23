import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../paths.js';
import { primitiviFoglio, type Primitivo } from '../schizzi/forme.js';
import { ALTEZZA, COLORE_GRIGLIA, GRIGLIA, LARGHEZZA, type Foglio } from '../schizzi/model.js';
import {
  CONTENT_WIDTH,
  drawSectionTitle,
  ensureSpace,
  GAP,
  INK,
  MARGIN,
  SIZE,
  type PdfContext,
} from './pdf-layout.js';

/**
 * Скиците в PDF-а (src/schizzi/): след модулите, преди снимките, под заглавие „Schizzi“ — по два листа на
 * страница A4, векторно: мрежата (бледо), после примитивите на елементите (src/schizzi/forme.ts) в реда, в
 * който са нарисувани, както в печата. Каквото излиза извън листа, се реже по ръба му.
 * Надписите са с шрифта на екрана (Fira Sans 500, латиница) — иначе котата, центрирана с друга ширина,
 * би легнала върху стрелките само в PDF-а; знак извън латиницата пише целия надпис с DejaVu.
 * Стилът (дебелина, краища, цвят, пунктир) се задава преди пътя — PDF не допуска промяна вътре в него.
 */

/** Два листа с имената си и заглавието се побират на страница: 310 pt височина, ~15 cm ширина. */
const ALTO = 310;
const SCALA = ALTO / ALTEZZA;
const LARGO = LARGHEZZA * SCALA;
const SINISTRA = MARGIN + (CONTENT_WIDTH - LARGO) / 2;
const NOME = 16;

/**
 * Fira Sans 500 (латиница): от билда (public/fonts) или от пакета при разработка; без него — DejaVu.
 * WOFF, не WOFF2: fontkit-ът в pdfkit чупи съставните глифове от WOFF2 („i“, „:“, буквите с ударение —
 * 59 от 230 знака, „Offset is outside the bounds of the DataView“) и целият PDF връща 500.
 */
const FIRA = 'fira-sans-latin-500-normal.woff';
const FIRA_PATH = [
  join(ROOT, 'public', 'fonts', FIRA),
  join(ROOT, 'node_modules', '@fontsource', 'fira-sans', 'files', FIRA),
].find((path) => existsSync(path));
const FIRA_GLIFI = FIRA_PATH ? fontkit.create(readFileSync(FIRA_PATH)) : null;
const fontDi = (testo: string): 'Schizzo' | 'Sans' =>
  FIRA_GLIFI &&
  Array.from(testo).every((c) => FIRA_GLIFI.hasGlyphForCodePoint(c.codePointAt(0) ?? 0))
    ? 'Schizzo'
    : 'Sans';

export function drawSchizzi(ctx: PdfContext, fogli: readonly Foglio[]): void {
  if (fogli.length === 0) return;
  const { doc, t } = ctx;
  if (FIRA_PATH) doc.registerFont('Schizzo', FIRA_PATH);
  // Името на листа — само когато са повече от един.
  const nome = fogli.length > 1 ? NOME : 0;
  // Заглавието — само заедно с първия лист под него.
  ensureSpace(ctx, 30 + nome + ALTO);
  drawSectionTitle(ctx, t('schizzi.title'));
  fogli.forEach((foglio, i) => {
    ensureSpace(ctx, nome + ALTO);
    if (nome) {
      doc
        .font('Sans-Bold')
        .fontSize(SIZE.label + 1)
        .fillColor(INK)
        .text(t('schizzi.foglio', { n: i + 1 }), SINISTRA, doc.y);
      doc.y += 2;
    }
    const y = doc.y;
    doc.save();
    doc.rect(SINISTRA, y, LARGO, ALTO).clip();
    doc.translate(SINISTRA, y).scale(SCALA);
    doc.lineWidth(1).strokeColor(COLORE_GRIGLIA);
    doc.path(GRIGLIA).stroke();
    for (const primitivo of primitiviFoglio(foglio)) disegna(ctx, primitivo);
    doc.restore();
    doc.lineWidth(0.6).strokeColor(INK);
    doc.rect(SINISTRA, y, LARGO, ALTO).stroke();
    doc.y = y + ALTO + GAP;
  });
}

/**
 * Елипсата като път от дъги — от (x + rx, y), по часовника, както в браузъра и в SVG: пунктирът почва от
 * същото място (pdfkit `ellipse` почва отляво).
 */
const ellisse = (p: Extract<Primitivo, { p: 'e' }>): string =>
  `M${p.x + p.rx} ${p.y}A${p.rx} ${p.ry} 0 1 1 ${p.x - p.rx} ${p.y}A${p.rx} ${p.ry} 0 1 1 ${p.x + p.rx} ${p.y}Z`;

/** Един примитив в единиците на листа (преместването и мащабът вече са приложени). */
function disegna({ doc }: PdfContext, p: Primitivo): void {
  if (p.p === 't') {
    // Без пренасяне, с базовата линия на y и подравняване по ширината — като `text-anchor`.
    doc.font(fontDi(p.v)).fontSize(p.z).fillColor(p.c);
    const largo = p.h === 'start' ? 0 : doc.widthOfString(p.v);
    const x = p.x - (p.h === 'middle' ? largo / 2 : largo);
    doc.save();
    if (p.a) doc.rotate(p.a, { origin: [p.x, p.y] });
    doc.text(p.v, x, p.y, { lineBreak: false, baseline: 'alphabetic' });
    doc.restore();
    return;
  }
  if (p.p === 'f') {
    doc.fillColor(p.c);
    doc.path(p.d).fill();
    return;
  }
  doc.lineWidth(p.w).lineCap('round').lineJoin('round').strokeColor(p.c);
  if (p.k) doc.dash(p.k[0], { space: p.k[1] });
  else doc.undash();
  doc.path(p.p === 'l' ? p.d : ellisse(p)).stroke();
}
