// Рисуване на блоковете от сглобяването: абзац, подзаглавие, списък, таблица (с пренасяне и повторен ред
// със заглавията на нова страница).
import type { Blocco } from "../condiviso/composto.js";
import { COLORI, MARGINE, larghezzaUtile, spazio, type Pdf } from "./base.js";

const PAD = 4;

export function titoloSezione(doc: Pdf, testo: string): void {
  spazio(doc, 60);
  doc.moveDown(0.6);
  doc.font("Plex-SemiBold").fontSize(13).fillColor(COLORI.verde).text(testo, MARGINE.left, doc.y, { width: larghezzaUtile(doc) });
  doc.moveDown(0.35);
  doc.font("Plex").fontSize(10).fillColor(COLORI.testo);
}

function tabella(doc: Pdf, b: Extract<Blocco, { t: "tabella" }>): void {
  const W = larghezzaUtile(doc);
  const pesi = b.pesi ?? b.colonne.map(() => 1);
  const tot = pesi.reduce((a, x) => a + x, 0);
  const larghezze = pesi.map((p) => (W * p) / tot);
  const altezza = (celle: string[], font: string) => {
    doc.font(font).fontSize(8.8);
    return Math.max(...celle.map((c, k) => doc.heightOfString(c || " ", { width: larghezze[k]! - PAD * 2 }))) + PAD * 2;
  };
  const disegna = (celle: string[], intest: boolean) => {
    const font = intest ? "Plex-SemiBold" : "Plex";
    const h = altezza(celle, font);
    const y = doc.y;
    let x = MARGINE.left;
    if (intest) doc.rect(MARGINE.left, y, W, h).fill(COLORI.fondo);
    celle.forEach((c, k) => {
      doc.font(font).fontSize(8.8).fillColor(intest ? COLORI.tenue : COLORI.testo).text(c, x + PAD, y + PAD, { width: larghezze[k]! - PAD * 2 });
      x += larghezze[k]!;
    });
    doc.moveTo(MARGINE.left, y + h).lineTo(MARGINE.left + W, y + h).lineWidth(0.5).strokeColor(COLORI.linea).stroke();
    doc.y = y + h;
  };
  spazio(doc, altezza(b.colonne, "Plex-SemiBold") + (b.righe[0] ? altezza(b.righe[0], "Plex") : 0));
  disegna(b.colonne, true);
  for (const r of b.righe) {
    const h = altezza(r, "Plex");
    if (doc.y + h > doc.page.height - MARGINE.bottom) {
      doc.addPage();
      disegna(b.colonne, true);
    }
    disegna(r, false);
  }
  doc.x = MARGINE.left;
  doc.moveDown(0.6);
}

export function disegnaBlocco(doc: Pdf, b: Blocco): void {
  const W = larghezzaUtile(doc);
  switch (b.t) {
    case "p":
      doc.font("Plex").fontSize(10).fillColor(COLORI.testo).text(b.testo, MARGINE.left, doc.y, { width: W, lineGap: 2, align: "left" });
      doc.moveDown(0.5);
      break;
    case "sotto":
      spazio(doc, 40);
      doc.moveDown(0.2);
      doc.font("Plex-SemiBold").fontSize(10.5).fillColor(COLORI.testo).text(b.testo, MARGINE.left, doc.y, { width: W });
      doc.moveDown(0.25);
      break;
    case "elenco":
      doc.font("Plex").fontSize(10).fillColor(COLORI.testo);
      for (const v of b.voci) {
        spazio(doc, 16);
        const y = doc.y;
        doc.text("–", MARGINE.left, y, { width: 12 });
        doc.text(v, MARGINE.left + 14, y, { width: W - 14, lineGap: 2 });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
      break;
    case "tabella":
      tabella(doc, b);
      break;
  }
}
