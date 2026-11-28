// PDF основа (спецификация D14): A4, IBM Plex Sans вграден (WOFF — fontkit на pdfkit чупи съставните глифове
// на WOFF2, урок от Rilievi), заглавие и долен колонтитул на всяка страница, „pagina x di y“, воден знак BOZZA.
import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets", "pdf");
const leggi = (f: string) => readFileSync(join(ASSETS, f));
const RISORSE = { regular: leggi("IBMPlexSans-Regular.woff"), semibold: leggi("IBMPlexSans-SemiBold.woff"), italic: leggi("IBMPlexSans-Italic.woff"), logo: leggi("logo.png") };

export const COLORI = { testo: "#1F2328", tenue: "#5B6470", verde: "#27700F", linea: "#D0D5DA", fondo: "#F2F4F3", alta: "#9B1C1C", media: "#8A5A00", bassa: "#3B5B2E" };
export const MARGINE = { top: 78, bottom: 64, left: 56, right: 56 };
export type Pdf = PDFKit.PDFDocument;

export function nuovoPdf(info: { titolo: string; autore: string; soggetto: string }): Pdf {
  const doc = new PDFDocument({
    size: "A4",
    margins: MARGINE,
    bufferPages: true,
    info: { Title: info.titolo, Author: info.autore, Subject: info.soggetto, Creator: "LiftCon – Carbon Stealth VCC", Producer: "LiftCon" },
    lang: "it-IT",
    displayTitle: true,
  });
  doc.registerFont("Plex", RISORSE.regular);
  doc.registerFont("Plex-SemiBold", RISORSE.semibold);
  doc.registerFont("Plex-Italic", RISORSE.italic);
  doc.font("Plex").fontSize(10).fillColor(COLORI.testo);
  return doc;
}

export const larghezzaUtile = (doc: Pdf): number => doc.page.width - MARGINE.left - MARGINE.right;

/** Остава ли място до долното поле; иначе нова страница. */
export function spazio(doc: Pdf, h: number): void {
  if (doc.y + h > doc.page.height - MARGINE.bottom) doc.addPage();
}

/** Колонтитулите се рисуват накрая (bufferPages), когато е известен броят на страниците. */
export function intestazioniPiePagina(doc: Pdf, o: { numero: string; piede: string; bozza: boolean }): void {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const salvaBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // иначе текст в полето отваря нова страница
    const w = doc.page.width;
    doc.image(RISORSE.logo, MARGINE.left, 30, { height: 22 });
    doc.font("Plex").fontSize(8.5).fillColor(COLORI.tenue).text(o.numero, MARGINE.left, 36, { width: w - MARGINE.left - MARGINE.right, align: "right", lineBreak: false });
    doc.moveTo(MARGINE.left, 60).lineTo(w - MARGINE.right, 60).lineWidth(0.6).strokeColor(COLORI.linea).stroke();
    const yPiede = doc.page.height - 42;
    doc.moveTo(MARGINE.left, yPiede - 8).lineTo(w - MARGINE.right, yPiede - 8).lineWidth(0.6).strokeColor(COLORI.linea).stroke();
    doc.fontSize(7.5).fillColor(COLORI.tenue).text(o.piede, MARGINE.left, yPiede, { width: w - MARGINE.left - MARGINE.right - 80, lineBreak: false });
    doc.text(`Pagina ${i - start + 1} di ${count}`, w - MARGINE.right - 80, yPiede, { width: 80, align: "right", lineBreak: false });
    if (o.bozza) {
      doc.save();
      doc.rotate(-35, { origin: [w / 2, doc.page.height / 2] });
      doc.font("Plex-SemiBold").fontSize(96).fillColor(COLORI.tenue).fillOpacity(0.08).text("BOZZA", 0, doc.page.height / 2 - 60, { width: w, align: "center", lineBreak: false });
      doc.restore();
      doc.fillOpacity(1);
    }
    doc.page.margins.bottom = salvaBottom;
  }
}

export function aBuffer(doc: Pdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parti: Buffer[] = [];
    doc.on("data", (c: Buffer) => parti.push(c));
    doc.on("end", () => resolve(Buffer.concat(parti)));
    doc.on("error", reject);
    doc.end();
  });
}
