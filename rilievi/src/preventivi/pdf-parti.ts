import type { IntestazioneAzienda } from '../aziende/dati.js';
import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { inRighe, INK, MUTED, unaRiga } from '../interventi/pdf-parti.js';
import type { PreventivoData } from './form.js';
import { euro, imponibileRiga, quantitaTesto, riepilogo, scontoTesto } from './importi.js';

/**
 * Частите на PDF-а на офертата (pdf.ts): таблицата на редовете (главата ѝ се повтаря на всяка нова
 * страница), обобщението по ставки на ДДС, бележките, условията и мястото „Per accettazione“. Сумите се
 * смятат тук от редовете — същите функции като страницата и записа (importi.ts).
 */

export const PAGE = { width: 595.28, height: 841.89 };
export const M = 32;
export const W = PAGE.width - M * 2;
/** Долната граница на съдържанието — под нея стои долният ред на страницата. */
export const FONDO = PAGE.height - M - 18;
const LINE = 0.6;
const FILL = '#ececec';
const FS = 8;

export interface PreventivoPdfOptions {
  t: Translator;
  fmt: ViewHelpers;
  fontDir: string;
  logo: Buffer | null;
  intestazione: IntestazioneAzienda;
  numero: number;
  generatoIl: Date;
  /** Информацията по чл. 13 и 14 GDPR на фирмата към клиента — в края на офертата (legale/informativa.ts). */
  informativa: string;
}

export type Doc = PDFKit.PDFDocument;

/** Колоните на таблицата: ключът на надписа, ширината, подравняването. */
const COLONNE = [
  { key: 'codice', w: 54, align: 'left' },
  { key: 'descrizione', w: 0, align: 'left' },
  { key: 'unita', w: 30, align: 'center' },
  { key: 'quantita', w: 44, align: 'right' },
  { key: 'prezzo', w: 64, align: 'right' },
  { key: 'sconto', w: 38, align: 'right' },
  { key: 'importo', w: 68, align: 'right' },
  { key: 'iva', w: 30, align: 'right' },
] as const;
const FISSE = COLONNE.reduce((s, c) => s + c.w, 0);
const larghezza = (c: (typeof COLONNE)[number]) => (c.w === 0 ? W - FISSE : c.w);

export class Pagina {
  y = M;
  constructor(
    readonly doc: Doc,
    readonly o: PreventivoPdfOptions,
  ) {}

  spazio(h: number, dopo?: () => void): void {
    if (this.y + h <= FONDO) return;
    this.doc.addPage();
    this.y = M;
    dopo?.();
  }

  rect(x: number, y: number, w: number, h: number, fill = false): void {
    const d = this.doc.save().lineWidth(LINE).strokeColor(INK);
    if (fill) d.rect(x, y, w, h).fillAndStroke(FILL, INK);
    else d.rect(x, y, w, h).stroke();
    d.restore();
  }

  /** Блок с надпис и текст на цялата ширина: височината по текста (до `maxRighe` реда). */
  blocco(label: string, value: string, maxRighe = 14): void {
    const { doc } = this;
    doc.font('Sans').fontSize(FS);
    const testo = inRighe(doc, value, W - 10, maxRighe);
    const h = doc.heightOfString(testo, { width: W - 10 }) + 18;
    this.spazio(h);
    this.rect(M, this.y, W, h);
    doc
      .font('Sans-Bold')
      .fontSize(7)
      .fillColor(INK)
      .text(label, M + 5, this.y + 4, { lineBreak: false });
    doc
      .font('Sans')
      .fontSize(FS)
      .fillColor(INK)
      .text(testo, M + 5, this.y + 13, { width: W - 10 });
    this.y += h + 8;
  }
}

function intestazioneTabella(p: Pagina): void {
  const { doc, o } = p;
  p.rect(M, p.y, W, 15, true);
  let x = M;
  doc.font('Sans-Bold').fontSize(6.8).fillColor(INK);
  for (const c of COLONNE) {
    const w = larghezza(c);
    doc.text(unaRiga(doc, o.t(`preventivi.pdf.colonna.${c.key}`), w - 6), x + 3, p.y + 4.5, {
      width: w - 6,
      align: c.align,
      lineBreak: false,
    });
    x += w;
  }
  p.y += 15;
}

/** Таблицата на редовете — дългото описание до 8 реда; главата наново на всяка страница. */
export function tabella(p: Pagina, d: PreventivoData): void {
  const { doc } = p;
  p.spazio(15 + 18);
  intestazioneTabella(p);
  const descr = COLONNE.find((c) => c.key === 'descrizione')!;
  const descrW = larghezza(descr) - 6;
  for (const r of d.righe) {
    doc.font('Sans').fontSize(FS);
    const testo = inRighe(doc, r.descrizione, descrW, 8);
    const h = Math.max(16, doc.heightOfString(testo, { width: descrW }) + 7);
    p.spazio(h, () => intestazioneTabella(p));
    const valori: Record<(typeof COLONNE)[number]['key'], string> = {
      codice: r.codice ?? '',
      descrizione: testo,
      unita: r.unita ?? '',
      quantita: quantitaTesto(r.quantita),
      prezzo: euro(r.prezzo),
      sconto: r.sconto ? scontoTesto(r.sconto) : '',
      importo: euro(imponibileRiga(r)),
      iva: String(r.iva),
    };
    let x = M;
    for (const c of COLONNE) {
      const w = larghezza(c);
      p.rect(x, p.y, w, h);
      doc.font('Sans').fontSize(FS).fillColor(INK);
      const value = c.key === 'descrizione' ? valori[c.key] : unaRiga(doc, valori[c.key], w - 6);
      doc.text(value, x + 3, p.y + 4, {
        width: w - 6,
        align: c.align,
        ...(c.key === 'descrizione' ? {} : { lineBreak: false }),
      });
      x += w;
    }
    p.y += h;
  }
  p.y += 8;
}

/** Обобщението вдясно: облагаемото и ДДС-то по ставка, после общо и „Totale“ с получер. */
export function totali(p: Pagina, d: PreventivoData): void {
  const { doc, o } = p;
  const { t } = o;
  const r = riepilogo(d.righe);
  const righe: Array<[string, string, boolean]> = [];
  for (const a of r.aliquote) {
    righe.push([t('preventivi.pdf.imponibileAliquota', { iva: a.iva }), euro(a.imponibile), false]);
    righe.push([t('preventivi.pdf.impostaAliquota', { iva: a.iva }), euro(a.imposta), false]);
  }
  righe.push([t('preventivi.pdf.imponibile'), euro(r.imponibile), false]);
  righe.push([t('preventivi.pdf.imposta'), euro(r.imposta), false]);
  righe.push([t('preventivi.pdf.totale'), `€ ${euro(r.totale)}`, true]);
  const w = 240;
  const x = M + W - w;
  const h = righe.length * 14 + 6;
  p.spazio(h);
  p.rect(x, p.y, w, h);
  let y = p.y + 4;
  for (const [label, value, bold] of righe) {
    if (bold) {
      doc
        .save()
        .lineWidth(LINE)
        .strokeColor(INK)
        .moveTo(x, y - 2)
        .lineTo(x + w, y - 2)
        .stroke()
        .restore();
    }
    doc
      .font(bold ? 'Sans-Bold' : 'Sans')
      .fontSize(bold ? 9.5 : FS)
      .fillColor(bold ? INK : MUTED);
    doc.text(unaRiga(doc, label, w - 110), x + 6, y + 1, { lineBreak: false });
    doc
      .fillColor(INK)
      .text(value, x + w - 104, y + 1, { width: 98, align: 'right', lineBreak: false });
    y += 14;
  }
  p.y += h + 10;
}

/** „Per accettazione“: денят и печатът с подписа на клиента — на ръка. */
export function accettazione(p: Pagina): void {
  const { doc, o } = p;
  const h = 62;
  p.spazio(h + 16);
  doc
    .font('Sans-Bold')
    .fontSize(8.5)
    .fillColor(INK)
    .text(o.t('preventivi.pdf.accettazione'), M, p.y, {
      lineBreak: false,
    });
  p.y += 13;
  const wData = 150;
  p.rect(M, p.y, wData, h);
  p.rect(M + wData, p.y, W - wData, h);
  doc.font('Sans').fontSize(6.5).fillColor(MUTED);
  doc.text(o.t('preventivi.pdf.dataAccettazione'), M + 4, p.y + 3, { lineBreak: false });
  doc.text(o.t('preventivi.pdf.firmaCliente'), M + wData + 4, p.y + 3, { lineBreak: false });
  p.y += h + 6;
}

/**
 * В края — информацията по чл. 13 и 14 GDPR на фирмата към клиента и референта му (собственикът, 14 ноември
 * 2026; условията 2026-12-14, 15.4): заглавие и текстът с шрифт 7 pt (под него не се чете — чл. 12(1) GDPR,
 * Правният Разбирач). Цялата — на една страница: ако не влиза под приемането, отива на следващата; по-дълга от
 * страница — абзац по абзац.
 */
export function informativa(p: Pagina): void {
  const { doc, o } = p;
  const testo = o.informativa.trim();
  const TESTO = { width: W, lineGap: 0.5 };
  doc.font('Sans').fontSize(7);
  const riga = doc.heightOfString('X', TESTO);
  // Абзац, по-висок от цяла страница, не се среща (текстът е до 4000 знака), но не слиза под полето и тогава.
  const righeMax = Math.floor((FONDO - M - 22) / riga);
  const parte = (s: string) => {
    doc.font('Sans').fontSize(7);
    const cella = doc.heightOfString(s, TESTO) > righeMax * riga ? inRighe(doc, s, W, righeMax) : s;
    return { s: cella, h: cella === '' ? riga : doc.heightOfString(cella, TESTO) };
  };
  // Цялата наведнъж, когато влиза в страница; по-дългата (текстът на фирмата — до 4000 знака и колкото
  // реда иска) — абзац по абзац, всеки на страницата, където влиза (ревюто на Кодаджията, 14 ноември 2026:
  // 180 кратки реда слизаха върху долния ред на страницата).
  const parti = (
    doc.heightOfString(testo, TESTO) + 22 <= FONDO - M ? [testo] : testo.split('\n')
  ).map(parte);
  p.spazio(parti[0]!.h + 22);
  doc
    .font('Sans-Bold')
    .fontSize(7.5)
    .fillColor(INK)
    .text(o.t('preventivi.informativa.titolo'), M, p.y, { width: W, lineBreak: false });
  p.y += 12;
  parti.forEach(({ s, h }, i) => {
    if (i > 0) p.spazio(h);
    if (s !== '') doc.font('Sans').fontSize(7).fillColor(INK).text(s, M, p.y, TESTO);
    p.y += h;
  });
  p.y += 6;
}
