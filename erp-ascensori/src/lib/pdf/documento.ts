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
// какво обобщение) идват от конфигурацията, а ВИДЪТ — от шаблона на фирмата
// (`modello.ts`: лого, цвят, шрифт, полета, заглавия, текстове). Какво шаблонът
// НЕ може да махне, е описано там.

import PDFDocument from "pdfkit";
import {
  CARATTERI,
  MARGINI,
  MODELLO_PREDEFINITO,
  TITOLO_FISSO,
  compila,
  type ModelloDocumenti,
  type TipoDocumento,
} from "@/lib/pdf/modello";
import { riconosciLogo } from "@/lib/pdf/logo";

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
  sitoWeb?: string | null;
  /** PNG/JPEG, вече проверено и почистено при качването (`logo.ts`). */
  logo?: Uint8Array | null;
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
  /** Кой раздел от шаблона важи за документа. */
  chiave: TipoDocumento;
  /** Заглавието по подразбиране; шаблонът го сменя, освен ако е фиксирано. */
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
  /**
   * Удържането по чл. 25-ter D.P.R. 600/1973.
   *
   * Печата се, защото получателят превежда НЕТНОТО: без реда фактурата казва
   * една сума, а по банка идва друга, и разликата се търси от две счетоводства.
   */
  ritenuta?: { aliquota: string; importo: string; netto: string } | null;
  /** Чл. 17-ter: ДДС-то се внася от публичния получател, не от нас. */
  splitPayment?: boolean;
  /** Допълнителни редове в заглавната част (causale, vettore, scadenza…). */
  dettagli?: { label: string; valore: string }[];
  note?: string | null;
  /** Текст, който документът ЗАДЪЛЖИТЕЛНО носи (напр. че не е е-фактура). */
  avvertenza?: string | null;
  /** Блок за подпис: PNG (data URL) + кой е подписал. */
  firma?: {
    immagine: string;
    nome: string;
    ruolo?: string | null;
    data: Date;
  } | null;
  /** Свободен текст под таблицата (описание на намесата). */
  corpo?: string | null;
  /** Шаблонът на фирмата; без него — видът по подразбиране. */
  modello?: ModelloDocumenti | null;
}

const GRIGIO = "#6b7280";
const SCURO = "#111827";
/** Височина на логото в заглавната част — таван, за да не изяде листа. */
const LOGO_ALTEZZA_MAX = 60;

/** Всичко, което шаблонът решава за рисуването, събрано на едно място. */
interface Stile {
  chiave: TipoDocumento;
  m: number;
  accento: string;
  normale: string;
  grassetto: string;
  corsivo: string;
  modello: ModelloDocumenti;
  doc: ModelloDocumenti["documenti"][TipoDocumento];
  titolo: string;
  valori: Parameters<typeof compila>[1];
}

function stile(doc: DocumentoPdf): Stile {
  const modello = doc.modello ?? MODELLO_PREDEFINITO;
  const f = CARATTERI[modello.carattere];
  const cfg = modello.documenti[doc.chiave];
  return {
    chiave: doc.chiave,
    m: MARGINI[modello.margine],
    accento: modello.colore,
    normale: f.normale,
    grassetto: f.grassetto,
    corsivo: f.corsivo,
    modello,
    doc: cfg,
    titolo: TITOLO_FISSO.has(doc.chiave) ? doc.tipo : cfg.titolo || doc.tipo,
    valori: {
      azienda: doc.azienda.ragioneSociale,
      numero: doc.numero,
      data: dataIt(doc.data),
      destinatario: doc.destinatario?.denominazione,
      iban: doc.azienda.iban,
      totale: doc.conPrezzi ? euro(doc.totaleLordo) : null,
    },
  };
}

const numeroIt = (v?: string | null) =>
  v === null || v === undefined
    ? "—"
    : Number(v).toLocaleString("it-IT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const euro = (v?: string | null) =>
  v === null || v === undefined
    ? "—"
    : `${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Количество/тегло по италиански; празното (свободен ред) остава празно. */
const quantitaIt = (v?: string | null) => {
  if (v === null || v === undefined || v === "") return v ?? "—";
  const n = Number(v);
  return Number.isNaN(n)
    ? v
    : n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
};

const dataIt = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Връща готовия PDF като буфер. */
export function generaPdf(doc: DocumentoPdf): Promise<Buffer> {
  const st = stile(doc);
  const pdf = new PDFDocument({
    size: "A4",
    margin: st.m,
    // Страниците се държат в паметта до края — номерът „di N" се знае едва тогава.
    bufferPages: true,
    info: {
      Title: `${st.titolo} ${doc.numero}`,
      Author: doc.azienda.ragioneSociale,
    },
  });

  const chunks: Buffer[] = [];
  const fine = new Promise<Buffer>((risolvi, rifiuta) => {
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => risolvi(Buffer.concat(chunks)));
    pdf.on("error", rifiuta);
  });

  const yIntestazione = intestazione(pdf, doc, st);
  const yControparti = controparti(pdf, doc, st, yIntestazione);
  const yIniziale = testoLibero(pdf, st, st.doc.testoIniziale, yControparti);
  const yCorpo = testoCorpo(pdf, doc, st, yIniziale);
  const yDopo = tabellaRighe(pdf, doc, st, yCorpo);
  const yTotali = totali(pdf, doc, st, yDopo);
  const yFinale = testoLibero(pdf, st, st.doc.testoFinale, yTotali + 8);
  bloccoFirma(pdf, doc, st, yFinale);
  piePagina(pdf, doc, st);
  if (st.modello.numeriPagina) numeriPagina(pdf, st);

  pdf.end();
  return fine;
}

/** Размерите, в които логото се рисува: вписано в ширина × LOGO_ALTEZZA_MAX. */
function misuraLogo(
  logo: Uint8Array | null | undefined,
  larghezzaMax: number,
): { l: number; h: number } | null {
  const info = logo ? riconosciLogo(logo) : null;
  if (!info) return null;
  const k = Math.min(
    larghezzaMax / info.larghezza,
    LOGO_ALTEZZA_MAX / info.altezza,
  );
  return { l: info.larghezza * k, h: info.altezza * k };
}

/** Рисува логото; повреден файл не проваля документа — просто липсва. */
function disegnaLogo(
  pdf: PDFKit.PDFDocument,
  logo: Uint8Array,
  x: number,
  y: number,
  dim: { l: number; h: number },
): boolean {
  try {
    pdf.image(Buffer.from(logo), x, y, { width: dim.l, height: dim.h });
    return true;
  } catch {
    return false;
  }
}

/** Заглавната част; връща y, от което продължава документът. */
function intestazione(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
): number {
  const a = doc.azienda;
  const m = st.m;
  const larghezzaDestra = 180;
  const xDestra = pdf.page.width - m - larghezzaDestra;
  const larghezzaSinistra = xDestra - m - 12;
  const ml = st.modello.logo;

  // ── Логото ──
  let x = m;
  let y = m;
  let yLogo = m;
  const dim =
    ml.posizione !== "nessuna" && a.logo
      ? misuraLogo(a.logo, Math.min(ml.larghezza, larghezzaSinistra))
      : null;
  if (a.logo && dim && disegnaLogo(pdf, a.logo, m, m, dim)) {
    yLogo = m + dim.h;
    if (ml.posizione === "sinistra") x = m + dim.l + 12;
    else y = yLogo + 8;
  }
  const larghezzaTesto = xDestra - x - 12;

  // ── Издателят. Наименование, седалище и ДДС номер — винаги. ──
  pdf
    .fillColor(SCURO)
    .fontSize(dim && ml.posizione === "sinistra" ? 13 : 16)
    .font(st.grassetto)
    .text(a.ragioneSociale, x, y, { width: larghezzaTesto });

  const int = st.modello.intestazione;
  const righeAzienda = [
    [
      a.indirizzo,
      [a.cap, a.citta, a.provincia && `(${a.provincia})`]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(" — "),
    [
      a.partitaIva && `P. IVA ${a.partitaIva}`,
      a.codiceFiscale && `C.F. ${a.codiceFiscale}`,
    ]
      .filter(Boolean)
      .join(" · "),
    [
      int.mostraTelefono && a.telefono,
      int.mostraEmail && a.email,
      int.mostraPec && a.pec && `PEC ${a.pec}`,
    ]
      .filter(Boolean)
      .join(" · "),
    int.mostraSitoWeb ? a.sitoWeb : null,
    ...int.righeExtra.split("\n").map((r) => r.trim()),
  ].filter((r): r is string => typeof r === "string" && r.length > 0);

  pdf.fontSize(8).font(st.normale).fillColor(GRIGIO);
  for (const r of righeAzienda)
    pdf.text(r, x, pdf.y, { width: larghezzaTesto });
  const ySinistra = Math.max(pdf.y, yLogo);

  // ── Тип и номер горе вдясно — първото, което окото търси. ──
  pdf
    .fillColor(st.accento)
    .fontSize(14)
    .font(st.grassetto)
    .text(st.titolo.toUpperCase(), xDestra, m, {
      width: larghezzaDestra,
      align: "right",
    });
  pdf.fillColor(SCURO).fontSize(12).text(doc.numero, xDestra, pdf.y, {
    width: larghezzaDestra,
    align: "right",
  });
  pdf
    .fillColor(GRIGIO)
    .fontSize(9)
    .font(st.normale)
    .text(`del ${dataIt(doc.data)}`, xDestra, pdf.y + 2, {
      width: larghezzaDestra,
      align: "right",
    });

  const linea = Math.max(ySinistra, pdf.y) + 8;
  pdf
    .moveTo(m, linea)
    .lineTo(pdf.page.width - m, linea)
    .strokeColor("#e5e7eb")
    .stroke();
  return linea + 14;
}

function controparti(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
  yInizio: number,
): number {
  const MARGINE = st.m;
  let y = yInizio;
  if (doc.destinatario) {
    const d = doc.destinatario;
    pdf
      .fillColor(GRIGIO)
      .fontSize(8)
      .font(st.normale)
      .text("DESTINATARIO", MARGINE, y);
    pdf
      .fillColor(SCURO)
      .fontSize(10)
      .font(st.grassetto)
      .text(d.denominazione, MARGINE, y + 12);
    const righe = [
      [
        d.indirizzo,
        [d.cap, d.citta, d.provincia && `(${d.provincia})`]
          .filter(Boolean)
          .join(" "),
      ]
        .filter(Boolean)
        .join(" — "),
      [
        d.partitaIva && `P. IVA ${d.partitaIva}`,
        d.codiceFiscale && `C.F. ${d.codiceFiscale}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ].filter((r) => r && r.length > 0);
    pdf.fontSize(9).font(st.normale).fillColor(SCURO);
    for (const r of righe)
      pdf.text(r as string, MARGINE, pdf.y, { width: 260 });
    y = Math.max(y + 50, pdf.y + 6);
  }

  if (doc.oggetto) {
    pdf.fillColor(GRIGIO).fontSize(8).text("OGGETTO", MARGINE, y);
    pdf
      .fillColor(SCURO)
      .fontSize(10)
      .text(doc.oggetto, MARGINE, y + 11, {
        width: pdf.page.width - MARGINE * 2,
      });
    y = pdf.y + 8;
  }

  if (doc.dettagli?.length) {
    pdf.fontSize(9).font(st.normale);
    for (const d of doc.dettagli) {
      pdf
        .fillColor(GRIGIO)
        .text(`${d.label}: `, MARGINE, y, { continued: true });
      pdf.fillColor(SCURO).text(d.valore);
      y = pdf.y + 2;
    }
    y += 6;
  }
  return y + 6;
}

function tabellaRighe(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
  yInizio: number,
): number {
  const MARGINE = st.m;
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
    pdf.fillColor(GRIGIO).fontSize(8).font(st.grassetto);
    for (const c of colonne) {
      pdf.text(c.l.toUpperCase(), x, y + 5, { width: c.w - 8, align: c.a });
      x += c.w;
    }
    y += 22;
  };
  testa();

  pdf.font(st.normale).fontSize(9);
  for (const r of doc.righe) {
    // Нова страница, ако редът не се събира — заглавието на таблицата се повтаря.
    if (y > pdf.page.height - 160) {
      pdf.addPage();
      y = MARGINE;
      testa();
      pdf.font(st.normale).fontSize(9);
    }
    const valori = doc.conPrezzi
      ? [
          r.descrizione,
          quantitaIt(r.quantita),
          euro(r.prezzoUnitario),
          r.aliquotaIva ? quantitaIt(r.aliquotaIva) : "—",
          euro(r.totale),
        ]
      : [
          r.descrizione,
          quantitaIt(r.quantita),
          r.um ?? "—",
          r.peso ? quantitaIt(r.peso) : "—",
        ];

    const altezza = Math.max(
      14,
      pdf.heightOfString(r.descrizione, { width: colonne[0].w - 8 }) + 4,
    );
    let x = MARGINE + 4;
    pdf.fillColor(SCURO);
    for (let i = 0; i < colonne.length; i++) {
      pdf.text(valori[i], x, y, {
        width: colonne[i].w - 8,
        align: colonne[i].a,
      });
      x += colonne[i].w;
    }
    y += altezza;
    pdf
      .moveTo(MARGINE, y - 2)
      .lineTo(MARGINE + larghezza, y - 2)
      .strokeColor("#f3f4f6")
      .stroke();
  }

  if (doc.righe.length === 0) {
    pdf
      .fillColor(GRIGIO)
      .fontSize(9)
      .text("Nessuna riga", MARGINE + 4, y);
    y += 16;
  }
  return y + 10;
}

/** Описателният текст между заглавната част и таблицата. */
function testoCorpo(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
  yInizio: number,
): number {
  const MARGINE = st.m;
  if (!doc.corpo) return yInizio;
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .font(st.grassetto)
    .text("DESCRIZIONE", MARGINE, yInizio);
  pdf
    .fillColor(SCURO)
    .fontSize(9)
    .font(st.normale)
    .text(doc.corpo, MARGINE, yInizio + 12, {
      width: pdf.page.width - MARGINE * 2,
    });
  return pdf.y + 12;
}

/**
 * Свободният текст на фирмата от шаблона (преди таблицата / след тоталите).
 * Полетата `{numero}`, `{data}`… се попълват (`compila`), непознатите остават.
 */
function testoLibero(
  pdf: PDFKit.PDFDocument,
  st: Stile,
  testo: string,
  yInizio: number,
): number {
  const t = compila(testo, st.valori).trim();
  if (!t) return yInizio;
  const larghezza = pdf.page.width - st.m * 2;
  pdf.fontSize(9).font(st.normale);
  let y = yInizio;
  if (y + pdf.heightOfString(t, { width: larghezza }) > pdf.page.height - 120) {
    pdf.addPage();
    y = st.m;
  }
  pdf.fillColor(SCURO).text(t, st.m, y, { width: larghezza });
  return pdf.y + 10;
}

/**
 * Празно поле за подпис: „за приемане" на офертата (връща се подписана и
 * подпечатана) или „за получаване" на стоката по DDT.
 */
function bloccoAccettazione(
  pdf: PDFKit.PDFDocument,
  st: Stile,
  yInizio: number,
) {
  let y = yInizio + 10;
  if (y > pdf.page.height - 170) {
    pdf.addPage();
    y = st.m;
  }
  const larghezza = 220;
  const xDestra = pdf.page.width - st.m - larghezza;
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .font(st.grassetto)
    .text(
      st.chiave === "ddt" ? "FIRMA DEL DESTINATARIO" : "PER ACCETTAZIONE",
      xDestra,
      y,
      { width: larghezza },
    );
  pdf
    .font(st.normale)
    .text(
      st.chiave === "ddt"
        ? "Per ricevuta della merce"
        : "Timbro e firma del cliente",
      xDestra,
      pdf.y + 1,
      { width: larghezza },
    );
  const yLinea = y + 60;
  pdf
    .moveTo(xDestra, yLinea)
    .lineTo(xDestra + larghezza, yLinea)
    .strokeColor("#9ca3af")
    .stroke();
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .text("Data ____ / ____ / ________", xDestra, yLinea + 6, {
      width: larghezza,
    });
}

/** Подписът на клиента — доказателството, че работата е приета. */
function bloccoFirma(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
  yInizio: number,
) {
  const MARGINE = st.m;
  if (!doc.firma) {
    if (st.doc.firmaAccettazione) bloccoAccettazione(pdf, st, yInizio);
    return;
  }
  let y = yInizio + 10;
  // Блокът е висок ~110 px; ако не се събира, отива на нова страница цял —
  // подпис, разделен от името си, не върши работа.
  if (y > pdf.page.height - 200) {
    pdf.addPage();
    y = MARGINE;
  }
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .font(st.grassetto)
    .text("FIRMA DEL CLIENTE PER ACCETTAZIONE", MARGINE, y);
  y += 12;
  try {
    pdf.image(doc.firma.immagine, MARGINE, y, { fit: [220, 70] });
  } catch {
    // Повреден подпис не бива да проваля целия документ.
    pdf
      .fillColor(GRIGIO)
      .fontSize(8)
      .font(st.corsivo)
      .text("(firma non disponibile)", MARGINE, y);
  }
  y += 74;
  pdf
    .moveTo(MARGINE, y)
    .lineTo(MARGINE + 220, y)
    .strokeColor("#9ca3af")
    .stroke();
  pdf
    .fillColor(SCURO)
    .fontSize(9)
    .font(st.grassetto)
    .text(doc.firma.nome, MARGINE, y + 4, { width: 220 });
  const sotto = [doc.firma.ruolo, `firmato il ${dataIt(doc.firma.data)}`]
    .filter(Boolean)
    .join(" · ");
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .font(st.normale)
    .text(sotto, MARGINE, pdf.y, { width: 260 });
}

function totali(
  pdf: PDFKit.PDFDocument,
  doc: DocumentoPdf,
  st: Stile,
  yInizio: number,
): number {
  const MARGINE = st.m;
  if (!doc.conPrezzi) return yInizio;
  let y = yInizio;
  if (y > pdf.page.height - 160) {
    pdf.addPage();
    y = MARGINE;
  }

  // Riepilogo IVA по аликвота — това е формата, която фискът очаква, и
  // основата на бъдещия XML за SDI. Сумиране по редове дава ±1 цент разлика.
  if (doc.riepilogo?.length) {
    pdf
      .fillColor(GRIGIO)
      .fontSize(8)
      .font(st.grassetto)
      .text("RIEPILOGO IVA", MARGINE, y);
    y += 12;
    pdf.font(st.normale).fontSize(8).fillColor(SCURO);
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
    pdf
      .font(grassetto ? st.grassetto : st.normale)
      .fontSize(grassetto ? 11 : 9);
    pdf
      .fillColor(grassetto ? SCURO : GRIGIO)
      .text(label, destra, y, { width: 100 });
    pdf
      .fillColor(SCURO)
      .text(valore, destra + 100, y, { width: 100, align: "right" });
    y += grassetto ? 16 : 13;
  };
  riga("Imponibile", euro(doc.totaleNetto));
  riga(
    doc.splitPayment ? "IVA (scissione dei pagamenti)" : "IVA",
    euro(doc.totaleIva),
  );
  pdf
    .moveTo(destra, y)
    .lineTo(destra + 200, y)
    .strokeColor("#e5e7eb")
    .stroke();
  y += 4;
  riga("TOTALE", euro(doc.totaleLordo), true);

  // Удържането и нетното за плащане. Без тях получателят вижда една сума, а
  // превежда друга — и двете счетоводства търсят разликата.
  if (doc.ritenuta) {
    riga(
      `Ritenuta d'acconto ${numeroIt(doc.ritenuta.aliquota)} %`,
      `− ${euro(doc.ritenuta.importo)}`,
    );
    pdf
      .moveTo(destra, y)
      .lineTo(destra + 200, y)
      .strokeColor("#e5e7eb")
      .stroke();
    y += 4;
    riga("NETTO A PAGARE", euro(doc.ritenuta.netto), true);
  } else if (doc.splitPayment) {
    riga("NETTO A PAGARE", euro(doc.totaleNetto), true);
  }
  return y;
}

function piePagina(pdf: PDFKit.PDFDocument, doc: DocumentoPdf, st: Stile) {
  const MARGINE = st.m;
  const notaTipo = compila(st.doc.notaPiede, st.valori).trim();
  // Височината се мери ПРЕДИ рисуването: предупреждението е дълго и при
  // фиксирано начало преливаше на втора, празна страница — документ, който
  // изглежда като грешка в очите на клиента.
  const larghezza = pdf.page.width - MARGINE * 2;
  pdf.fontSize(7).font(st.corsivo);
  const hAvvertenza = doc.avvertenza
    ? pdf.heightOfString(doc.avvertenza, { width: larghezza }) + 4
    : 0;
  pdf.font(st.normale);
  const hNote =
    (doc.note ? pdf.heightOfString(doc.note, { width: 460 }) + 2 : 0) +
    (notaTipo ? pdf.heightOfString(notaTipo, { width: 460 }) + 2 : 0) +
    (doc.azienda.notePiePagina
      ? pdf.heightOfString(doc.azienda.notePiePagina, { width: 460 }) + 2
      : 0);
  const y = pdf.page.height - MARGINE - 18 - hNote - hAvvertenza;
  pdf
    .moveTo(MARGINE, y)
    .lineTo(pdf.page.width - MARGINE, y)
    .strokeColor("#e5e7eb")
    .stroke();

  // REA и капиталът — ВИНАГИ, когато са попълнени (чл. 2250 c.c.); IBAN-ът
  // — по избор за всеки вид документ (на DDT няма работа).
  const parti = [
    st.doc.mostraIban && doc.azienda.iban && `IBAN ${doc.azienda.iban}`,
    doc.azienda.rea && `REA ${doc.azienda.rea}`,
    doc.azienda.capitaleSociale && `Cap. soc. ${doc.azienda.capitaleSociale}`,
  ].filter(Boolean);

  pdf.fontSize(7).font(st.normale).fillColor(GRIGIO);
  if (parti.length)
    pdf.text(parti.join("  ·  "), MARGINE, y + 6, { width: 460 });
  if (doc.note) pdf.text(doc.note, MARGINE, pdf.y + 2, { width: 460 });
  if (notaTipo) pdf.text(notaTipo, MARGINE, pdf.y + 2, { width: 460 });
  if (doc.azienda.notePiePagina)
    pdf.text(doc.azienda.notePiePagina, MARGINE, pdf.y + 2, { width: 460 });

  // Предупреждението не е козметика: документ, който НЕ е минал през SDI, не
  // бива да изглежда като издадена електронна фактура.
  if (doc.avvertenza) {
    pdf
      .fillColor("#b45309")
      .fontSize(7)
      .font(st.corsivo)
      .text(
        doc.avvertenza,
        MARGINE,
        pdf.y + 3,
        // `lineBreak` + изрична височина: текстът се събира тук, вместо да
        // отвори нова страница.
        { width: larghezza, height: hAvvertenza, lineBreak: true },
      );
  }
}

/**
 * „Pagina X di N" на всяка страница — пише се накрая, когато N вече е известно.
 * Долното поле се нулира за момента на писане: иначе pdfkit смята текста под
 * него за преливане и отваря празна страница.
 */
function numeriPagina(pdf: PDFKit.PDFDocument, st: Stile) {
  const { start, count } = pdf.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    pdf.switchToPage(i);
    const margine = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf
      .fontSize(7)
      .font(st.normale)
      .fillColor(GRIGIO)
      .text(
        `Pagina ${i - start + 1} di ${count}`,
        st.m,
        pdf.page.height - st.m / 2 - 6,
        { width: pdf.page.width - st.m * 2, align: "right", lineBreak: false },
      );
    pdf.page.margins.bottom = margine;
  }
}
