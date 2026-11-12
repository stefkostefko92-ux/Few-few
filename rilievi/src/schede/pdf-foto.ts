import type { FotoDimensione } from '@prisma/client';
import type { FotoPdf, GruppoFotoPdf } from '../allegati/stampa.js';
import {
  CONTENT_WIDTH,
  ensureSpace,
  INK,
  MARGIN,
  RULE,
  SIZE,
  type PdfContext,
} from './pdf-layout.js';

/**
 * Снимките в края на PDF-а (src/allegati/stampa.ts) — в реда на разделите на листа, плътно, за да се пести
 * хартия (собственикът, 5 ноември 2026: „Поправи позиционирането на снимките при принтиране да се
 * икономиса някой лист“). Редовете са „подравнени“: снимките в един ред са с еднаква височина и заедно
 * запълват ширината — около три хоризонтални или четири вертикални на ред, без рязане и без разтягане.
 * Не започват от нова страница: продължават под листа, ако заглавието и първият ред се побират.
 * Под снимката — разделът ѝ и надписът. Раздели не делят редовете: снимки от различни раздели стоят една
 * до друга. Същата подредба има и печатът от браузъра (print.css).
 */

/** Желаната височина на ред (pt): ~49 mm — хоризонтална снимка ~58 mm широка, три на ред. */
export const ALTEZZA_RIGA = 140;
/** Най-много снимки на ред — вертикалните остават четливи (~43 mm широки). */
export const MAX_PER_RIGA = 4;
export const SPAZIO = 8;
const SOTTO_RIGA = 8;

/** Редът на дадена големина: желаната височина, най-много снимки и най-високият разпънат ред (pt). */
export interface Misura {
  altezza: number;
  maxPerRiga: number;
  altezzaMax: number;
}

/**
 * Големините, които човекът избира в „Stampa e PDF“ (собственикът, 10 ноември 2026): малки ~35 mm (до 5
 * на ред), средни ~49 mm (досегашните, до 4), големи ~74 mm (до 3), една на ред — цялата ширина, а
 * вертикалната до ~176 mm висока. Същите числа има прегледът във формата (public/js/foto-righe.js —
 * тестът ги сравнява).
 */
export const DIMENSIONI: Readonly<Record<FotoDimensione, Misura>> = {
  PICCOLE: { altezza: 100, maxPerRiga: 5, altezzaMax: 140 },
  MEDIE: { altezza: ALTEZZA_RIGA, maxPerRiga: MAX_PER_RIGA, altezzaMax: ALTEZZA_RIGA * 1.4 },
  GRANDI: { altezza: 210, maxPerRiga: 3, altezzaMax: 294 },
  UNA: { altezza: 500, maxPerRiga: 1, altezzaMax: 500 },
};

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
  misura: Misura = DIMENSIONI.MEDIE,
): PostoFoto[][] {
  const { altezza, maxPerRiga, altezzaMax: ALTEZZA_MAX } = misura;
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
    if (somma * altezza < libera && prova.length < maxPerRiga) {
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

/** Снимка в общия поток: от кой раздел е — името стои в надписа ѝ. */
interface FotoInFila {
  foto: FotoPdf;
  sezione: string;
}

/** „Quadro — надписът“ (без надпис — само разделът): разделът е удебелен. */
const didascaliaDi = (f: FotoInFila) =>
  f.foto.didascalia ? `${f.sezione} — ${f.foto.didascalia}` : f.sezione;

/** Колко висок е надписът под снимка с тази ширина (мерен с удебеления шрифт — горна граница). */
function altezzaDidascalia(ctx: PdfContext, f: FotoInFila, larghezza: number): number {
  ctx.doc.font('Sans-Bold').fontSize(SIZE.label);
  return ctx.doc.heightOfString(didascaliaDi(f), { width: larghezza }) + 3;
}

/**
 * Всички снимки — един поток (собственикът, 5 ноември 2026: „puoi metterle una accanto all'altra anche se
 * sono di sezioni diverse, così risparmiamo il foglio“): раздел с една снимка не заема цял ред, а името
 * на раздела е в надписа на всяка снимка. Редът и големината — избраните в „Stampa e PDF“ (10 ноември
 * 2026; групите идват подредени, src/allegati/stampa.ts).
 */
export function drawFoto(
  ctx: PdfContext,
  gruppi: readonly GruppoFotoPdf[],
  dimensione: FotoDimensione = 'MEDIE',
): void {
  const fila: FotoInFila[] = gruppi.flatMap((g) =>
    g.foto.map((foto) => ({ foto, sezione: g.titolo })),
  );
  if (fila.length === 0) return;
  const { doc, t } = ctx;
  const righe = righeFoto(
    fila.map((f) => rapportoDi(f.foto)),
    CONTENT_WIDTH,
    DIMENSIONI[dimensione],
  );
  const altezzaDi = (riga: readonly PostoFoto[]) =>
    riga[0]!.altezza +
    Math.max(...riga.map((p) => altezzaDidascalia(ctx, fila[p.indice]!, p.larghezza))) +
    SOTTO_RIGA;
  // „Foto“ — само заедно с първия ред снимки под него.
  ensureSpace(ctx, 40 + altezzaDi(righe[0]!));
  doc.y += 10;
  doc
    .font('Sans-Bold')
    .fontSize(SIZE.section + 2)
    .fillColor(INK)
    .text(t('allegati.stampa.titolo'), MARGIN, doc.y);
  const lineY = doc.y + 3;
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(MARGIN + CONTENT_WIDTH, lineY)
    .lineWidth(0.6)
    .stroke(INK);
  doc.y = lineY + 8;
  for (const riga of righe) {
    const altezza = altezzaDi(riga);
    ensureSpace(ctx, altezza);
    const y = doc.y;
    let x = MARGIN;
    for (const posto of riga) {
      const f = fila[posto.indice]!;
      doc.image(f.foto.immagine, x, y, { width: posto.larghezza, height: posto.altezza });
      doc.rect(x, y, posto.larghezza, posto.altezza).lineWidth(0.5).stroke(RULE);
      doc
        .font('Sans-Bold')
        .fontSize(SIZE.label)
        .fillColor(INK)
        .text(f.sezione, x, y + posto.altezza + 3, {
          width: posto.larghezza,
          continued: Boolean(f.foto.didascalia),
        });
      if (f.foto.didascalia) doc.font('Sans').text(` — ${f.foto.didascalia}`);
      x += posto.larghezza + SPAZIO;
    }
    doc.y = y + altezza;
  }
}
