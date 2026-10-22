import {
  ALTEZZA,
  COLORE_GRIGLIA,
  COLORI,
  CORPI,
  GRIGLIA,
  LARGHEZZA,
  SPESSORI,
  type Foglio,
} from '../schizzi/model.js';
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
 * страница A4, векторно: мрежата (бледо), пътищата и надписите в реда, в който са нарисувани, както в
 * печата. Каквото излиза извън листа, се реже по ръба му.
 */

/** Два листа с имената си и заглавието се побират на страница: 310 pt височина, ~15 cm ширина. */
const ALTO = 310;
const SCALA = ALTO / ALTEZZA;
const LARGO = LARGHEZZA * SCALA;
const SINISTRA = MARGIN + (CONTENT_WIDTH - LARGO) / 2;
const NOME = 16;

export function drawSchizzi(ctx: PdfContext, fogli: readonly Foglio[]): void {
  if (fogli.length === 0) return;
  const { doc, t } = ctx;
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
    doc.path(GRIGLIA).lineWidth(1).strokeColor(COLORE_GRIGLIA).stroke();
    for (const el of foglio.e) {
      if (el.t === 'p') {
        doc
          .path(el.d)
          .lineWidth(SPESSORI[el.s])
          .lineCap('round')
          .lineJoin('round')
          .strokeColor(COLORI[el.c])
          .stroke();
      } else {
        // Без пренасяне и с базовата линия на y — като `<text>` в SVG и `fillText` в браузъра.
        doc
          .font('Sans')
          .fontSize(CORPI[el.s])
          .fillColor(COLORI[el.c])
          .text(el.v, el.x, el.y, { lineBreak: false, baseline: 'alphabetic' });
      }
    }
    doc.restore();
    doc.rect(SINISTRA, y, LARGO, ALTO).lineWidth(0.6).strokeColor(INK).stroke();
    doc.y = y + ALTO + GAP;
  });
}
