// Генератор на PDF за документите — сървърно, с pdfkit.
//
// Защо сървърно, а не „печат от браузъра": документът, който клиентът получава,
// трябва да изглежда еднакво независимо от браузър, шрифтове и настройки за
// печат, и трябва да носи данните на издателя по закон (чл. 1, ал. 3
// D.P.R. 472/1996 за DDT). Печатът от браузъра дава различен резултат при
// всеки и не може да се приложи към имейл.
//
// Оформлението е общо за четирите типа документа: заглавна част с издател и
// получател, таблица с редовете, обобщение и подпис. Разликите (кои колони,
// какво обобщение) идват от конфигурацията.

import PDFDocument from "pdfkit";

/** Данните на издаващата фирма (cedente/prestatore). */
export interface Azienda {
  ragioneSociale: string;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
  telefono?: string | null;
  email?: string | null;
  pec?: string | null;
  iban?: string | null;
  rea?: string | null;
  capitaleSociale?: string | null;
  notePiePagina?: string | null;
}

export interface Controparte {
  denominazione: string;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
}

export interface RigaDocumento {
  descrizione: string;
  quantita: string;
  /** Само за документи с цени. */
  prezzoUnitario?: string | null;
  aliquotaIva?: string | null;
  totale?: string | null;
  /** Само за DDT. */
  um?: string | null;
  peso?: string | null;
}

export interface Riepilogo {
  aliquota: string;
  imponibile: string;
  imposta: string;
}

export interface DocumentoPdf {
  tipo: string;
  numero: string;
  data: Date;
  oggetto?: string | null;
  azienda: Azienda;
  destinatario?: Controparte | null;
  righe: RigaDocumento[];
  /** С цени (оферта, фактура) или без (DDT). */
  conPrezzi: boolean;
  /** Обобщение по аликвота — задължително за фискален документ. */
  riepilogo?: Riepilogo[];
  totaleNetto?: string | null;
  totaleIva?: string | null;
  totaleLordo?: string | null;
  /** Допълнителни редове в заглавната част (causale, vettore, scadenza…). */
  dettagli?: { label: string; valore: string }[];
  note?: string | null;
  /** Текст, който документът ЗАДЪЛЖИТЕЛНО носи (напр. че не е е-фактура). */
  avvertenza?: string | null;
}

const MARGINE = 40;
const GRIGIO = "#6b7280";
const SCURO = "#111827";
const ACCENTO = "#116bb5";

const numeroIt = (v?: string | null) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const euro = (v?: string | null) =>
  v === null || v === undefined
    ? "—"
    : `${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const dataIt = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Връща готовия PDF като буфер. */
export function generaPdf(doc: DocumentoPdf): Promise<Buffer> {
  const pdf = new PDFDocument({ size: "A4", margin: MARGINE, info: {
    Title: `${doc.tipo} ${doc.numero}`,
    Author: doc.azienda.ragioneSociale,
  } });

  const chunks: Buffer[] = [];
  const fine = new Promise<Buffer>((risolvi, rifiuta) => {
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => risolvi(Buffer.concat(chunks)));
    pdf.on("error", rifiuta);
  });

  intestazione(pdf, doc);
  const yTabella = controparti(pdf, doc);
  const yDopo = tabellaRighe(pdf, doc, yTabella);
  totali(pdf, doc, yDopo);
  piePagina(pdf, doc);

  pdf.end();
  return fine;
}

function intestazione(pdf: PDFKit.PDFDocument, doc: DocumentoPdf) {
  const a = doc.azienda;
  pdf.fillColor(SCURO).fontSize(16).font("Helvetica-Bold").text(a.ragioneSociale, MARGINE, MARGINE);

  const righeAzienda = [
    [a.indirizzo, [a.cap, a.citta, a.provincia && `(${a.provincia})`].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" — "),
    [a.partitaIva && `P. IVA ${a.partitaIva}`, a.codiceFiscale && `C.F. ${a.codiceFiscale}`]
      .filter(Boolean)
      .join(" · "),
    [a.telefono, a.email, a.pec].filter(Boolean).join(" · "),
  ].filter((r) => r && r.length > 0);

  pdf.fontSize(8).font("Helvetica").fillColor(GRIGIO);
  for (const r of righeAzienda) pdf.text(r as string, MARGINE, pdf.y, { width: 320 });

  // Тип и номер горе вдясно — първото, което окото търси.
  const destra = pdf.page.width - MARGINE - 180;
  pdf.fillColor(ACCENTO).fontSize(14).font("Helvetica-Bold")
    .text(doc.tipo.toUpperCase(), destra, MARGINE, { width: 180, align: "right" });
  pdf.fillColor(SCURO).fontSize(12).text(doc.numero, destra, pdf.y, { width: 180, align: "right" });
  pdf.fillColor(GRIGIO).fontSize(9).font("Helvetica")
    .text(`del ${dataIt(doc.data)}`, destra, pdf.y + 2, { width: 180, align: "right" });

  pdf.moveTo(MARGINE, 118).lineTo(pdf.page.width - MARGINE, 118).strokeColor("#e5e7eb").stroke();
}

function controparti(pdf: PDFKit.PDFDocument, doc: DocumentoPdf): number {
  let y = 132;
  if (doc.destinatario) {
    const d = doc.destinatario;
    pdf.fillColor(GRIGIO).fontSize(8).font("Helvetica").text("DESTINATARIO", MARGINE, y);
    pdf.fillColor(SCURO).fontSize(10).font("Helvetica-Bold").text(d.denominazione, MARGINE, y + 12);
    const righe = [
      [d.indirizzo, [d.cap, d.citta, d.provincia && `(${d.provincia})`].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — "),
      [d.partitaIva && `P. IVA ${d.partitaIva}`, d.codiceFiscale && `C.F. ${d.codiceFiscale}`]
        .filter(Boolean)
        .join(" · "),
    ].filter((r) => r && r.length > 0);
    pdf.fontSize(9).font("Helvetica").fillColor(SCURO);
    for (const r of righe) pdf.text(r as string, MARGINE, pdf.y, { width: 260 });
    y = Math.max(y + 50, pdf.y + 6);
  }

  if (doc.oggetto) {
    pdf.fillColor(GRIGIO).fontSize(8).text("OGGETTO", MARGINE, y);
    pdf.fillColor(SCURO).fontSize(10).text(doc.oggetto, MARGINE, y + 11, {
      width: pdf.page.width - MARGINE * 2,
    });
    y = pdf.y + 8;
  }

  if (doc.dettagli?.length) {
    pdf.fontSize(9).font("Helvetica");
    for (const d of doc.dettagli) {
      pdf.fillColor(GRIGIO).text(`${d.label}: `, MARGINE, y, { continued: true });
      pdf.fillColor(SCURO).text(d.valore);
      y = pdf.y + 2;
    }
    y += 6;
  }
  return y + 6;
}

function tabellaRighe(pdf: PDFKit.PDFDocument, doc: DocumentoPdf, yInizio: number): number {
  const larghezza = pdf.page.width - MARGINE * 2;
  const colonne = doc.conPrezzi
    ? [
        { l: "Descrizione", w: larghezza - 260, a: "left" as const },
        { l: "Q.tà", w: 50, a: "right" as const },
        { l: "Prezzo", w: 70, a: "right" as const },
        { l: "IVA %", w: 45, a: "right" as const },
        { l: "Totale", w: 95, a: "right" as const },
      ]
    : [
        { l: "Descrizione", w: larghezza - 200, a: "left" as const },
        { l: "Q.tà", w: 60, a: "right" as const },
        { l: "U.M.", w: 60, a: "left" as const },
        { l: "Peso (kg)", w: 80, a: "right" as const },
      ];

  let y = yInizio;
  const testa = () => {
    pdf.rect(MARGINE, y, larghezza, 18).fill("#f3f4f6");
    let x = MARGINE + 4;
    pdf.fillColor(GRIGIO).fontSize(8).font("Helvetica-Bold");
    for (const c of colonne) {
      pdf.text(c.l.toUpperCase(), x, y + 5, { width: c.w - 8, align: c.a });
      x += c.w;
    }
    y += 22;
  };
  testa();

  pdf.font("Helvetica").fontSize(9);
  for (const r of doc.righe) {
    // Нова страница, ако редът не се събира — заглавието на таблицата се повтаря.
    if (y > pdf.page.height - 160) {
      pdf.addPage();
      y = MARGINE;
      testa();
      pdf.font("Helvetica").fontSize(9);
    }
    const valori = doc.conPrezzi
      ? [r.descrizione, r.quantita, euro(r.prezzoUnitario), r.aliquotaIva ?? "—", euro(r.totale)]
      : [r.descrizione, r.quantita, r.um ?? "—", r.peso ?? "—"];

    const altezza = Math.max(
      14,
      pdf.heightOfString(r.descrizione, { width: colonne[0].w - 8 }) + 4,
    );
    let x = MARGINE + 4;
    pdf.fillColor(SCURO);
    for (let i = 0; i < colonne.length; i++) {
      pdf.text(valori[i], x, y, { width: colonne[i].w - 8, align: colonne[i].a });
      x += colonne[i].w;
    }
    y += altezza;
    pdf.moveTo(MARGINE, y - 2).lineTo(MARGINE + larghezza, y - 2).strokeColor("#f3f4f6").stroke();
  }

  if (doc.righe.length === 0) {
    pdf.fillColor(GRIGIO).fontSize(9).text("Nessuna riga", MARGINE + 4, y);
    y += 16;
  }
  return y + 10;
}

function totali(pdf: PDFKit.PDFDocument, doc: DocumentoPdf, yInizio: number) {
  if (!doc.conPrezzi) return;
  let y = yInizio;
  if (y > pdf.page.height - 160) {
    pdf.addPage();
    y = MARGINE;
  }

  // Riepilogo IVA по аликвота — това е формата, която фискът очаква, и
  // основата на бъдещия XML за SDI. Сумиране по редове дава ±1 цент разлика.
  if (doc.riepilogo?.length) {
    pdf.fillColor(GRIGIO).fontSize(8).font("Helvetica-Bold").text("RIEPILOGO IVA", MARGINE, y);
    y += 12;
    pdf.font("Helvetica").fontSize(8).fillColor(SCURO);
    for (const r of doc.riepilogo) {
      pdf.text(
        `Aliquota ${numeroIt(r.aliquota)} %  ·  imponibile ${euro(r.imponibile)}  ·  imposta ${euro(r.imposta)}`,
        MARGINE,
        y,
      );
      y += 11;
    }
    y += 6;
  }

  const destra = pdf.page.width - MARGINE - 200;
  const riga = (label: string, valore: string, grassetto = false) => {
    pdf.font(grassetto ? "Helvetica-Bold" : "Helvetica").fontSize(grassetto ? 11 : 9);
    pdf.fillColor(grassetto ? SCURO : GRIGIO).text(label, destra, y, { width: 100 });
    pdf.fillColor(SCURO).text(valore, destra + 100, y, { width: 100, align: "right" });
    y += grassetto ? 16 : 13;
  };
  riga("Imponibile", euro(doc.totaleNetto));
  riga("IVA", euro(doc.totaleIva));
  pdf.moveTo(destra, y).lineTo(destra + 200, y).strokeColor("#e5e7eb").stroke();
  y += 4;
  riga("TOTALE", euro(doc.totaleLordo), true);
}

function piePagina(pdf: PDFKit.PDFDocument, doc: DocumentoPdf) {
  // Височината се мери ПРЕДИ рисуването: предупреждението е дълго и при
  // фиксирано начало преливаше на втора, празна страница — документ, който
  // изглежда като грешка в очите на клиента.
  const larghezza = pdf.page.width - MARGINE * 2;
  pdf.fontSize(7).font("Helvetica-Oblique");
  const hAvvertenza = doc.avvertenza
    ? pdf.heightOfString(doc.avvertenza, { width: larghezza }) + 4
    : 0;
  pdf.font("Helvetica");
  const hNote =
    (doc.note ? pdf.heightOfString(doc.note, { width: 460 }) + 2 : 0) +
    (doc.azienda.notePiePagina
      ? pdf.heightOfString(doc.azienda.notePiePagina, { width: 460 }) + 2
      : 0);
  const y = pdf.page.height - MARGINE - 18 - hNote - hAvvertenza;
  pdf.moveTo(MARGINE, y).lineTo(pdf.page.width - MARGINE, y).strokeColor("#e5e7eb").stroke();

  const parti = [
    doc.azienda.iban && `IBAN ${doc.azienda.iban}`,
    doc.azienda.rea && `REA ${doc.azienda.rea}`,
    doc.azienda.capitaleSociale && `Cap. soc. ${doc.azienda.capitaleSociale}`,
  ].filter(Boolean);

  pdf.fontSize(7).font("Helvetica").fillColor(GRIGIO);
  if (parti.length) pdf.text(parti.join("  ·  "), MARGINE, y + 6, { width: 460 });
  if (doc.note) pdf.text(doc.note, MARGINE, pdf.y + 2, { width: 460 });
  if (doc.azienda.notePiePagina)
    pdf.text(doc.azienda.notePiePagina, MARGINE, pdf.y + 2, { width: 460 });

  // Предупреждението не е козметика: документ, който НЕ е минал през SDI, не
  // бива да изглежда като издадена електронна фактура.
  if (doc.avvertenza) {
    pdf.fillColor("#b45309").fontSize(7).font("Helvetica-Oblique").text(
      doc.avvertenza,
      MARGINE,
      pdf.y + 3,
      // `lineBreak` + изрична височина: текстът се събира тук, вместо да
      // отвори нова страница.
      { width: larghezza, height: hAvvertenza, lineBreak: true },
    );
  }
}
