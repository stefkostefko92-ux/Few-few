// PDF на документа: заглавна страница (данни, автор, резюме) → секциите → подпис → report fotografico.
import type { DocumentoCompleto } from "../condiviso/tipi.js";
import type { Composto } from "../condiviso/composto.js";
import { NOMI_TIPO } from "../condiviso/testi.js";
import { dataIt } from "../condiviso/formato.js";
import { COLORI, MARGINE, aBuffer, intestazioniPiePagina, larghezzaUtile, nuovoPdf, spazio, type Pdf } from "./base.js";
import { disegnaBlocco, titoloSezione } from "./blocchi.js";

const PIEDE = "LiftCon – consulenza tecnica per ascensori · servizio di Carbon Stealth VCC · liftcon.it";

export interface OpzioniPdf {
  leggiMini: (fotoId: string) => Promise<Buffer | null>;
}

function riga(doc: Pdf, etichetta: string, valore: string, x: number, w: number): void {
  if (!valore.trim()) return;
  const y = doc.y;
  doc.font("Plex").fontSize(9).fillColor(COLORI.tenue).text(etichetta, x, y, { width: 130 });
  doc.font("Plex").fontSize(10).fillColor(COLORI.testo).text(valore, x + 135, y, { width: w - 135 });
  doc.y = Math.max(doc.y, y + 14) + 3;
}

function copertina(doc: Pdf, d: DocumentoCompleto, c: Composto): void {
  const W = larghezzaUtile(doc);
  const i = d.intestazione;
  doc.font("Plex-SemiBold").fontSize(20).fillColor(COLORI.testo).text(NOMI_TIPO[d.tipo], MARGINE.left, MARGINE.top + 8, { width: W });
  if (c.titolo && c.titolo !== NOMI_TIPO[d.tipo]) doc.moveDown(0.2).font("Plex").fontSize(12).fillColor(COLORI.tenue).text(c.titolo, { width: W });
  doc.moveDown(1.2);
  const x = MARGINE.left;
  riga(doc, "Numero", d.numero ?? "Bozza (non emessa)", x, W);
  riga(doc, "Revisione", String(d.revisione), x, W);
  riga(doc, "Data", dataIt(i.data), x, W);
  if (d.emessoIl) riga(doc, "Data di emissione", dataIt(d.emessoIl.slice(0, 10)), x, W);
  riga(doc, "Committente", [i.committente.nome, i.committente.qualita].filter(Boolean).join(", "), x, W);
  riga(doc, "Condominio / immobile", i.committente.condominio, x, W);
  riga(doc, "Impianto", [i.impianto.indirizzo, i.impianto.comune, i.impianto.provincia && `(${i.impianto.provincia})`].filter(Boolean).join(", "), x, W);
  riga(doc, "Matricola", i.impianto.matricola, x, W);
  riga(doc, "Autore", [d.autore.nome, d.autore.qualifica].filter(Boolean).join(", "), x, W);
  doc.moveDown(1);
  // Резюме в рамка
  const y0 = doc.y;
  const h = 26 + c.sommario.length * 17;
  doc.rect(x, y0, W, h).fill(COLORI.fondo);
  doc.font("Plex-SemiBold").fontSize(10.5).fillColor(COLORI.testo).text("Riepilogo", x + 12, y0 + 9, { width: W - 24 });
  c.sommario.forEach((s, k) => {
    const y = y0 + 28 + k * 17;
    doc.font("Plex").fontSize(10).fillColor(COLORI.tenue).text(s.etichetta, x + 12, y, { width: 240 });
    doc.font("Plex-SemiBold").fillColor(COLORI.testo).text(s.valore, x + 260, y, { width: W - 272 });
  });
  doc.y = y0 + h + 8;
  doc.x = MARGINE.left;
}

function firma(doc: Pdf, d: DocumentoCompleto): void {
  spazio(doc, 110);
  doc.moveDown(1.5);
  const W = larghezzaUtile(doc);
  doc.font("Plex").fontSize(10).fillColor(COLORI.testo).text(`Redatto da: ${[d.autore.nome, d.autore.qualifica].filter(Boolean).join(", ") || "—"}`, MARGINE.left, doc.y, { width: W });
  doc.text(`Data: ${d.emessoIl ? dataIt(d.emessoIl.slice(0, 10)) : "—"}`, { width: W });
  doc.moveDown(2);
  const y = doc.y;
  doc.moveTo(MARGINE.left + W - 220, y).lineTo(MARGINE.left + W, y).lineWidth(0.6).strokeColor(COLORI.tenue).stroke();
  doc.font("Plex").fontSize(8.5).fillColor(COLORI.tenue).text("Firma", MARGINE.left + W - 220, y + 4, { width: 220, align: "center" });
  doc.x = MARGINE.left;
}

async function reportFotografico(doc: Pdf, c: Composto, o: OpzioniPdf): Promise<void> {
  if (!c.foto.length) return;
  doc.addPage();
  titoloSezione(doc, "Report fotografico");
  const W = larghezzaUtile(doc);
  const gap = 16;
  const w = (W - gap) / 2;
  const hImg = w * 0.75;
  for (let k = 0; k < c.foto.length; k += 2) {
    const coppia = c.foto.slice(k, k + 2);
    doc.font("Plex").fontSize(8.8);
    const hTesto = Math.max(...coppia.map((f) => doc.heightOfString(`Foto ${f.n} – ${f.didascalia}${f.ubicazione ? ` (${f.ubicazione})` : ""}`, { width: w })));
    spazio(doc, hImg + hTesto + 18);
    const y = doc.y;
    for (const [j, f] of coppia.entries()) {
      const x = MARGINE.left + j * (w + gap);
      const img = await o.leggiMini(f.id);
      if (img) doc.image(img, x, y, { fit: [w, hImg], align: "center", valign: "center" });
      else doc.rect(x, y, w, hImg).lineWidth(0.5).strokeColor(COLORI.linea).stroke();
      doc.font("Plex").fontSize(8.8).fillColor(COLORI.testo).text(`Foto ${f.n} – ${f.didascalia}${f.ubicazione ? ` (${f.ubicazione})` : ""}`, x, y + hImg + 5, { width: w });
    }
    doc.y = y + hImg + hTesto + 18;
    doc.x = MARGINE.left;
  }
}

export async function generaPdf(d: DocumentoCompleto, c: Composto, o: OpzioniPdf): Promise<Buffer> {
  const numero = d.numero ? `${d.numero} · Rev. ${d.revisione}` : `Bozza · Rev. ${d.revisione}`;
  const doc = nuovoPdf({ titolo: `${NOMI_TIPO[d.tipo]}${d.numero ? ` ${d.numero}` : ""}`, autore: d.autore.nome || "LiftCon", soggetto: c.titolo });
  copertina(doc, d, c);
  for (const s of c.sezioni) {
    titoloSezione(doc, s.titolo);
    for (const b of s.blocchi) disegnaBlocco(doc, b);
  }
  firma(doc, d);
  await reportFotografico(doc, c, o);
  intestazioniPiePagina(doc, { numero, piede: PIEDE, bozza: d.stato !== "EMESSO" });
  return aBuffer(doc);
}
