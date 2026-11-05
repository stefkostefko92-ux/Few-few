import type { FotoPdf, GruppoFotoPdf } from '../allegati/stampa.js';
import {
  CONTENT_WIDTH,
  drawSectionTitle,
  ensureSpace,
  INK,
  MARGIN,
  RULE,
  SIZE,
  type PdfContext,
} from './pdf-layout.js';

/**
 * Снимките в края на PDF-а (src/allegati/stampa.ts) — по разделите на листа, плътно, за да се пести
 * хартия (собственикът, 5 ноември 2026: „Поправи позиционирането на снимките при принтиране да се
 * икономиса някой лист“). Редовете са „подравнени“: снимките в един ред са с еднаква височина и заедно
 * запълват ширината — около три хоризонтални или четири вертикални на ред, без рязане и без разтягане.
 * Не започват от нова страница: продължават под листа, ако заглавието и първият ред се побират.
 * Надписът на снимката е под нея. Същата подредба има и печатът от браузъра (print.css).
 */

/** Желаната височина на ред (pt): ~49 mm — хоризонтална снимка ~58 mm широка, три на ред. */
export const ALTEZZA_RIGA = 140;
/** Най-много снимки на ред — вертикалните остават четливи (~43 mm широки). */
export const MAX_PER_RIGA = 4;
/** Ред, който се разпъва до ширината (малко снимки), не става по-висок от това. */
const ALTEZZA_MAX = ALTEZZA_RIGA * 1.4;
export const SPAZIO = 8;
const SOTTO_RIGA = 8;

export interface PostoFoto {
  indice: number;
  larghezza: number;
  altezza: number;
}

/**
 * Редовете за снимки с тези пропорции (ширина / височина) в ширина `larghezza`: снимките се добавят,
 * докато редът при желаната височина стигне ширината; тогава редът се мащабира точно до ширината — с
 * последната снимка или без нея, което е по-близо до желаната височина. Последният ред (и ред, който
 * би станал твърде висок) остава с желаната височина, подравнен вляво. Без база и без рисуване.
 */
export function righeFoto(
  rapporti: readonly number[],
  larghezza: number,
  altezza = ALTEZZA_RIGA,
): PostoFoto[][] {
  const righe: PostoFoto[][] = [];
  const chiudi = (indici: number[], piena: boolean) => {
    const somma = indici.reduce((s, i) => s + rapporti[i]!, 0);
    const libera = larghezza - SPAZIO * (indici.length - 1);
    const h = piena ? Math.min(libera / somma, ALTEZZA_MAX) : Math.min(altezza, libera / somma);
    righe.push(indici.map((i) => ({ indice: i, larghezza: rapporti[i]! * h, altezza: h })));
  };
  let corrente: number[] = [];
  for (let i = 0; i < rapporti.length; i += 1) {
    const prova = [...corrente, i];
    const somma = prova.reduce((s, j) => s + rapporti[j]!, 0);
    const libera = larghezza - SPAZIO * (prova.length - 1);
    if (somma * altezza < libera && prova.length < MAX_PER_RIGA) {
      corrente = prova;
      continue;
    }
    // Редът е пълен: с тази снимка (по-нисък) или без нея (по-висок) — по-близкото до желаното.
    const conH = libera / somma;
    const senza = corrente.length
      ? (larghezza - SPAZIO * (corrente.length - 1)) /
        corrente.reduce((s, j) => s + rapporti[j]!, 0)
      : Infinity;
    if (
      corrente.length &&
      Math.abs(Math.min(senza, ALTEZZA_MAX) - altezza) < Math.abs(conH - altezza)
    ) {
      chiudi(corrente, true);
      corrente = [i];
    } else {
      chiudi(prova, true);
      corrente = [];
    }
  }
  if (corrente.length) chiudi(corrente, false);
  return righe;
}

const rapportoDi = (foto: FotoPdf) =>
  foto.larghezza > 0 && foto.altezza > 0 ? foto.larghezza / foto.altezza : 4 / 3;

/** Колко висок е надписът под снимка с тази ширина. */
function altezzaDidascalia(ctx: PdfContext, foto: FotoPdf, larghezza: number): number {
  if (!foto.didascalia) return 0;
  ctx.doc.font('Sans').fontSize(SIZE.label);
  return ctx.doc.heightOfString(foto.didascalia, { width: larghezza }) + 3;
}

export function drawFoto(ctx: PdfContext, gruppi: readonly GruppoFotoPdf[]): void {
  if (gruppi.length === 0) return;
  const { doc, t } = ctx;
  let primo = true;
  for (const gruppo of gruppi) {
    const righe = righeFoto(gruppo.foto.map(rapportoDi), CONTENT_WIDTH);
    const altezzaDi = (riga: readonly PostoFoto[]) =>
      riga[0]!.altezza +
      Math.max(...riga.map((p) => altezzaDidascalia(ctx, gruppo.foto[p.indice]!, p.larghezza))) +
      SOTTO_RIGA;
    // „Foto“ и заглавието на раздела — само заедно с първия ред снимки под тях.
    ensureSpace(ctx, (primo ? 26 : 0) + 34 + altezzaDi(righe[0]!));
    if (primo) {
      doc.y += 10;
      doc
        .font('Sans-Bold')
        .fontSize(SIZE.section + 2)
        .fillColor(INK)
        .text(t('allegati.stampa.titolo'), MARGIN, doc.y);
      primo = false;
    }
    drawSectionTitle(ctx, gruppo.titolo);
    for (const riga of righe) {
      const altezza = altezzaDi(riga);
      ensureSpace(ctx, altezza);
      const y = doc.y;
      let x = MARGIN;
      for (const posto of riga) {
        const foto = gruppo.foto[posto.indice]!;
        doc.image(foto.immagine, x, y, { width: posto.larghezza, height: posto.altezza });
        doc.rect(x, y, posto.larghezza, posto.altezza).lineWidth(0.5).stroke(RULE);
        if (foto.didascalia)
          doc
            .font('Sans')
            .fontSize(SIZE.label)
            .fillColor(INK)
            .text(foto.didascalia, x, y + posto.altezza + 3, { width: posto.larghezza });
        x += posto.larghezza + SPAZIO;
      }
      doc.y = y + altezza;
    }
  }
}
