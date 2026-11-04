import type { FotoPdf, GruppoFotoPdf } from '../allegati/stampa.js';
import {
  CONTENT_WIDTH,
  drawSectionTitle,
  ensureSpace,
  GAP,
  INK,
  MARGIN,
  RULE,
  SIZE,
  type PdfContext,
} from './pdf-layout.js';

/**
 * Снимките в края на PDF-а (src/allegati/stampa.ts): от нова страница, под заглавие „Foto“, по
 * разделите на листа — по две на ред, до два реда на страница (четири снимки), всяка с надписа си
 * отдолу. Снимката се вписва в клетката, без да се реже и без да се разтяга.
 */

const COLONNE = 2;
/** Две редици с надписите се побират на страница A4 и при изправени снимки. */
const ALTEZZA_MAX = 250;
const SPAZIO_RIGA = 14;

interface Misura {
  foto: FotoPdf;
  larghezza: number;
  altezza: number;
  testo: number;
}

function misura(ctx: PdfContext, foto: FotoPdf, cella: number): Misura {
  const scala = Math.min(cella / foto.larghezza, ALTEZZA_MAX / foto.altezza);
  ctx.doc.font('Sans').fontSize(SIZE.label + 1);
  const testo = foto.didascalia ? ctx.doc.heightOfString(foto.didascalia, { width: cella }) + 4 : 0;
  return { foto, larghezza: foto.larghezza * scala, altezza: foto.altezza * scala, testo };
}

const altezzaRiga = (riga: readonly Misura[]): number =>
  Math.max(...riga.map((m) => m.altezza + m.testo)) + SPAZIO_RIGA;

export function drawFoto(ctx: PdfContext, gruppi: readonly GruppoFotoPdf[]): void {
  if (gruppi.length === 0) return;
  const { doc, t } = ctx;
  const cella = (CONTENT_WIDTH - GAP * (COLONNE - 1)) / COLONNE;
  doc.addPage();
  doc.y = MARGIN;
  doc
    .font('Sans-Bold')
    .fontSize(SIZE.section + 2)
    .fillColor(INK)
    .text(t('allegati.stampa.titolo'), MARGIN, doc.y);
  doc.y += 4;
  for (const gruppo of gruppi) {
    const righe: Misura[][] = [];
    for (let i = 0; i < gruppo.foto.length; i += COLONNE) {
      righe.push(gruppo.foto.slice(i, i + COLONNE).map((foto) => misura(ctx, foto, cella)));
    }
    // Заглавието на раздела — само заедно с първия ред снимки под него.
    ensureSpace(ctx, 30 + altezzaRiga(righe[0]!));
    drawSectionTitle(ctx, gruppo.titolo);
    for (const riga of righe) {
      const altezza = altezzaRiga(riga);
      ensureSpace(ctx, altezza);
      const y = doc.y;
      riga.forEach((m, colonna) => {
        const x = MARGIN + colonna * (cella + GAP);
        doc.image(m.foto.immagine, x, y, { width: m.larghezza, height: m.altezza });
        doc.rect(x, y, m.larghezza, m.altezza).lineWidth(0.5).stroke(RULE);
        if (m.foto.didascalia)
          doc
            .font('Sans')
            .fontSize(SIZE.label + 1)
            .fillColor(INK)
            .text(m.foto.didascalia, x, y + m.altezza + 4, { width: cella });
      });
      doc.y = y + altezza;
    }
  }
}
