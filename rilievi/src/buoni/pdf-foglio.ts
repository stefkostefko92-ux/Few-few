import type { ViewHelpers } from '../http/view.js';
import type { Translator } from '../i18n.js';
import { pathFirma, FIRMA_H, FIRMA_W, type Firma } from '../interventi/firma.js';
import { inRighe, INK, MUTED, tickAt, unaRiga } from '../interventi/pdf-parti.js';
import { dateFromDay } from '../time.js';
import type { Esito } from './voci.js';

/**
 * Листът на PDF-а на „Buono di lavoro“ (pdf.ts): мерките на A4, клетката, лентата на раздела, подписът в
 * кутия, „OK / NON OK“ и новата страница, когато нещо не се побира — частите, от които pdf-sezioni.ts
 * сглобява разделите.
 */

export const PAGE = { width: 595.28, height: 841.89 };
export const M = 26;
export const W = PAGE.width - M * 2;
/** Долната граница на съдържанието — под нея стоят номерът на страницата и редът „Generato con…“. */
export const FONDO = PAGE.height - M - 14;
const LINE = 0.6;
/** Височината на ред с данни, на ред с работа (най-малко) и на проверка; на подписите долу. */
export const RIGA = 22;
export const RIGA_SEQ = 22;
export const RIGA_CTL = 20;
export const RIGA_FIRME = 54;
/** Най-малката височина на бележка (празната — място за писане на ръка). */
export const NOTE_MIN = 26;
const FILL = '#ececec';

export interface FirmaPdf {
  firma: Firma | null;
  valida: boolean;
}

export interface BuonoPdfOptions {
  t: Translator;
  fmt: ViewHelpers;
  fontDir: string;
  logo: Buffer | null;
  azienda: { name: string; buonoCodice: string | null; buonoClausola: string | null };
  firme: ReadonlyMap<string, FirmaPdf>;
  /** Отпечатъкът на листа под подписите долу (подреден за четене), ако има такива. */
  impronta: string | null;
  generatoIl: Date;
}

export type Doc = PDFKit.PDFDocument;

export class Foglio {
  y = M;
  constructor(
    readonly doc: Doc,
    readonly o: BuonoPdfOptions,
  ) {}

  /** Нова страница, ако `h` не се побира; `dopo` — каквото се рисува отгоре на новата (главата на таблицата). */
  spazio(h: number, dopo?: () => void): void {
    if (this.y + h <= FONDO) return;
    this.doc.addPage();
    this.y = M;
    dopo?.();
  }

  rect(x: number, y: number, w: number, h: number, fill = false): void {
    const d = this.doc.save().lineWidth(LINE).strokeColor(INK);
    if (fill) d.fillColor(FILL).rect(x, y, w, h).fillAndStroke(FILL, INK);
    else d.rect(x, y, w, h).stroke();
    d.restore();
  }

  /** Лентата със заглавието на раздела. */
  titolo(testo: string): void {
    this.spazio(40);
    this.rect(M, this.y, W, 13, true);
    this.doc
      .font('Sans-Bold')
      .fontSize(8)
      .fillColor(INK)
      .text(testo.toUpperCase(), M + 5, this.y + 3, { width: W - 10, lineBreak: false });
    this.y += 13;
  }

  /** Клетка: надписът горе вляво, стойността под него (в `righe` реда, съкратена с „…“). */
  cella(x: number, w: number, h: number, label: string, value: string | null, righe = 1): void {
    const { doc } = this;
    this.rect(x, this.y, w, h);
    doc.font('Sans').fontSize(6).fillColor(MUTED);
    doc.text(unaRiga(doc, label, w - 6), x + 3, this.y + 2, { lineBreak: false });
    if (!value) return;
    doc.font('Sans').fontSize(8.5).fillColor(INK);
    if (righe === 1) doc.text(unaRiga(doc, value, w - 6), x + 3, this.y + 10, { lineBreak: false });
    else doc.text(inRighe(doc, value, w - 6, righe), x + 3, this.y + 10, { width: w - 6 });
  }

  /** Клетка с дълъг текст: височината по текста (до `maxRighe` реда), поне `min`. */
  cellaTesto(label: string, value: string | null, min = 30, maxRighe = 8): void {
    const { doc } = this;
    doc.font('Sans').fontSize(8.5);
    const testo = value ? inRighe(doc, value, W - 6, maxRighe) : '';
    const h = Math.max(min, testo ? doc.heightOfString(testo, { width: W - 6 }) + 14 : 0);
    this.spazio(h);
    this.cella(M, W, h, label, testo || null, maxRighe);
    this.y += h;
  }

  /** Подписът в кутия: центриран и вписан; невалидният — с думи; липсващият — нищо (на ръка). */
  firma(posto: string, x: number, y: number, w: number, h: number): void {
    const stato = this.o.firme.get(posto);
    if (!stato) return;
    if (!stato.valida || !stato.firma) {
      this.doc
        .font('Sans')
        .fontSize(6.5)
        .fillColor(MUTED)
        .text(this.o.t('buoni.pdfTesto.nonValida'), x, y + h / 2 - 4, {
          width: w,
          align: 'center',
        });
      return;
    }
    const scale = Math.min(w / FIRMA_W, h / FIRMA_H);
    this.doc
      .save()
      .translate(x + (w - FIRMA_W * scale) / 2, y + (h - FIRMA_H * scale) / 2)
      .scale(scale)
      .path(pathFirma(stato.firma))
      .lineWidth(4)
      .lineCap('round')
      .lineJoin('round')
      .strokeColor(INK)
      .stroke()
      .restore();
  }

  /** „OK □ NON OK □“ — избраното с отметка. */
  esito(x: number, y: number, value: Esito | null): void {
    const { t } = this.o;
    tickAt(this.doc, x, y, value === 'ok', t('buoni.esito.ok'));
    tickAt(this.doc, x + 27, y, value === 'nonOk', t('buoni.esito.nonOk'));
  }
}

export const giorno = (o: BuonoPdfOptions, day: string | null): string | null =>
  day ? o.fmt.day(dateFromDay(day)) : null;
