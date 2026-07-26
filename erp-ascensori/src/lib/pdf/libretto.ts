// „Libretto d'impianto“ — досието на един асансьор.
//
// Това е документът, който контролният орган иска: цялата история на уредбата
// на едно място. Дотук тя беше разпръсната из четири таблици и се събираше на
// ръка — при проверка това значи часове ровене и пропуснат запис.
//
// Не е задължителен по закон в този вид (D.P.R. 162/1999 не предписва образец),
// но съдържа точно това, което законът иска да е доказуемо: самоличността на
// уредбата, съобщението до Общината, периодичните проверки и извършената
// поддръжка. Затова документът го КАЗВА за себе си — да минава за официален
// образец би било по-лошо от липсата му.

import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { datiAzienda } from "@/lib/pdf/carica";
import type { Azienda } from "@/lib/pdf/documento";
import {
  TIPO_IMPIANTO_LABEL,
  REGIME_IMPIANTO_LABEL,
} from "@/lib/normativa/impianti";
import { TIPO_INTERVENTO_LABEL } from "@/lib/normativa/interventi";
import { CONTROLLI_ART15, problemiConformita } from "@/lib/normativa/verifiche";

const MARGINE = 40;
const GRIGIO = "#6b7280";
const SCURO = "#111827";
const ACCENTO = "#116bb5";
const ROSSO = "#b91c1c";

const dataIt = (d: Date | null | undefined) =>
  d
    ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
    : "—";

const ESITO_LABEL: Record<string, string> = {
  POSITIVO: "Positivo",
  CON_PRESCRIZIONI: "Positivo con prescrizioni",
  NEGATIVO: "Negativo",
};

export interface DatiLibretto {
  azienda: Azienda;
  impianto: {
    matricola: string;
    matricolaComune: string | null;
    comune: string | null;
    dataComunicazione: Date | null;
    tipo: string;
    regime: string;
    marca: string;
    modello: string;
    anno: number | null;
    portata: number | null;
    persone: number | null;
    velocita: string | null;
    fermate: number | null;
    stato: string;
    indirizzo: string | null;
    piano: string | null;
    dataInstallazione: Date | null;
    organismoNotificato: string | null;
    manutentoreDal: Date | null;
    prossimaRevisione: Date | null;
    condominio: {
      nome: string;
      codiceFiscale: string | null;
      indirizzo: string;
    } | null;
    amministratore: { denominazione: string; telefono: string | null } | null;
  };
  verifiche: {
    data: Date;
    tipo: string;
    esito: string;
    organismo: string | null;
    numeroVerbale: string | null;
    prescrizioni: string | null;
  }[];
  interventi: {
    numero: string;
    dataOra: Date;
    tipoIntervento: string;
    descrizione: string;
    esito: string;
    tecnico: string | null;
    firmatoAt: Date | null;
    controlli: Record<string, boolean | null>;
  }[];
  problemi: string[];
  generatoIl: Date;
}

/** Събира досието от базата. Филтърът по фирма НЕ е по избор. */
export async function caricaLibretto(
  id: string,
  tenantId: string | null,
): Promise<DatiLibretto | null> {
  const i = await prisma.impianto.findFirst({
    where: { id, tenantId },
    include: {
      condominio: true,
      amministratore: true,
      verifiche: { orderBy: { data: "desc" } },
      rapportini: {
        orderBy: { dataOra: "desc" },
        // Досието е за преглед, не архив: последните две години покриват
        // двугодишния цикъл на проверката, а по-старото се вади от списъка.
        take: 100,
        include: { tecnico: { select: { nome: true, cognome: true } } },
      },
    },
  });
  if (!i) return null;

  return {
    azienda: await datiAzienda(tenantId),
    impianto: {
      matricola: i.matricola,
      matricolaComune: i.matricolaComune,
      comune: i.comune,
      dataComunicazione: i.dataComunicazione,
      tipo: i.tipo,
      regime: i.regime,
      marca: i.marca,
      modello: i.modello,
      anno: i.anno,
      portata: i.portata,
      persone: i.persone,
      velocita: i.velocita?.toString() ?? null,
      fermate: i.fermate,
      stato: i.stato,
      indirizzo: i.indirizzo,
      piano: i.piano,
      dataInstallazione: i.dataInstallazione,
      organismoNotificato: i.organismoNotificato,
      manutentoreDal: i.manutentoreDal,
      prossimaRevisione: i.prossimaRevisione,
      condominio: i.condominio
        ? {
            nome: i.condominio.nome,
            codiceFiscale: i.condominio.codiceFiscale,
            indirizzo: `${i.condominio.indirizzo}, ${i.condominio.citta}`,
          }
        : null,
      amministratore: i.amministratore
        ? {
            denominazione:
              i.amministratore.ragioneSociale ??
              `${i.amministratore.nome} ${i.amministratore.cognome ?? ""}`.trim(),
            telefono: i.amministratore.telefono,
          }
        : null,
    },
    verifiche: i.verifiche.map((v) => ({
      data: v.data,
      tipo: v.tipo,
      esito: v.esito,
      organismo: v.organismo,
      numeroVerbale: v.numeroVerbale,
      prescrizioni: v.prescrizioni,
    })),
    interventi: i.rapportini.map((r) => ({
      numero: r.numero,
      dataOra: r.dataOra,
      tipoIntervento: r.tipoIntervento,
      descrizione: r.descrizione,
      esito: r.esito,
      tecnico: r.tecnico ? `${r.tecnico.nome} ${r.tecnico.cognome}` : null,
      firmatoAt: r.firmatoAt,
      controlli: Object.fromEntries(
        CONTROLLI_ART15.map((c) => [
          c.campo,
          (r as unknown as Record<string, boolean | null>)[c.campo] ?? null,
        ]),
      ),
    })),
    problemi: problemiConformita({
      matricolaComune: i.matricolaComune,
      comune: i.comune,
      dataComunicazione: i.dataComunicazione,
      regime: i.regime,
      organismoNotificato: i.organismoNotificato,
    }),
    generatoIl: new Date(),
  };
}

export function generaLibretto(d: DatiLibretto): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: "A4",
    margin: MARGINE,
    info: {
      Title: `Libretto impianto ${d.impianto.matricolaComune ?? d.impianto.matricola}`,
      Author: d.azienda.ragioneSociale,
    },
  });
  const chunks: Buffer[] = [];
  const fine = new Promise<Buffer>((risolvi, rifiuta) => {
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => risolvi(Buffer.concat(chunks)));
    pdf.on("error", rifiuta);
  });

  const larghezza = pdf.page.width - MARGINE * 2;
  /** Нова страница, когато остават по-малко от `h` точки. */
  const spazio = (h: number) => {
    if (pdf.y > pdf.page.height - MARGINE - h) pdf.addPage();
  };
  const titolo = (t: string) => {
    spazio(60);
    pdf.moveDown(0.8);
    pdf
      .fillColor(ACCENTO)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(t.toUpperCase());
    pdf
      .moveTo(MARGINE, pdf.y + 2)
      .lineTo(pdf.page.width - MARGINE, pdf.y + 2)
      .strokeColor("#e5e7eb")
      .stroke();
    pdf.moveDown(0.5);
  };
  const coppia = (label: string, valore: string) => {
    pdf
      .fontSize(9)
      .font("Helvetica")
      .fillColor(GRIGIO)
      .text(label, { continued: true });
    pdf.fillColor(SCURO).text(`  ${valore}`);
  };

  // ── Заглавие ──────────────────────────────────────────────────────────────
  pdf
    .fillColor(ACCENTO)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text("LIBRETTO DELL'IMPIANTO");
  pdf
    .fillColor(SCURO)
    .fontSize(12)
    .text(
      `${TIPO_IMPIANTO_LABEL[d.impianto.tipo as keyof typeof TIPO_IMPIANTO_LABEL] ?? d.impianto.tipo} — matricola ${d.impianto.matricolaComune ?? d.impianto.matricola}`,
    );
  pdf
    .fillColor(GRIGIO)
    .fontSize(8)
    .font("Helvetica")
    .text(
      `${d.azienda.ragioneSociale} · documento generato il ${dataIt(d.generatoIl)}`,
    );

  // Честността за какво Е този документ идва ГОРЕ, не в бележка под линия.
  pdf.moveDown(0.5);
  pdf
    .fontSize(7)
    .font("Helvetica-Oblique")
    .fillColor(GRIGIO)
    .text(
      "Raccolta dei dati dell'impianto tenuti dalla ditta di manutenzione. Non sostituisce i verbali " +
        "originali delle verifiche periodiche né la dichiarazione di conformità, che restano " +
        "l'unica documentazione probante e sono conservati dal proprietario.",
      { width: larghezza },
    );

  if (d.problemi.length) {
    pdf.moveDown(0.6);
    pdf
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(ROSSO)
      .text("DATI MANCANTI");
    pdf.fontSize(8).font("Helvetica");
    for (const p of d.problemi) pdf.text(`•  ${p}`, { width: larghezza });
  }

  // ── Самоличност ───────────────────────────────────────────────────────────
  titolo("Identificazione");
  const i = d.impianto;
  coppia("Matricola Comune:", i.matricolaComune ?? "—");
  coppia("Comune:", i.comune ?? "—");
  coppia("Comunicazione art. 12 D.P.R. 162/1999:", dataIt(i.dataComunicazione));
  coppia("Matricola interna:", i.matricola);
  coppia(
    "Regime:",
    REGIME_IMPIANTO_LABEL[i.regime as keyof typeof REGIME_IMPIANTO_LABEL] ??
      i.regime,
  );
  coppia("Ubicazione:", i.indirizzo ?? "—");
  coppia(
    "Condominio:",
    i.condominio ? `${i.condominio.nome} — ${i.condominio.indirizzo}` : "—",
  );
  coppia("Amministratore:", i.amministratore?.denominazione ?? "—");

  // ── Технически данни ──────────────────────────────────────────────────────
  titolo("Dati tecnici");
  coppia("Costruttore e modello:", `${i.marca} ${i.modello}`);
  coppia("Anno:", i.anno ? String(i.anno) : "—");
  coppia("Portata:", i.portata ? `${i.portata} kg` : "—");
  coppia("Persone:", i.persone ? String(i.persone) : "—");
  coppia("Velocità:", i.velocita ? `${Number(i.velocita)} m/s` : "—");
  coppia("Fermate:", i.fermate ? String(i.fermate) : "—");
  coppia("Locale macchine:", i.piano ?? "—");
  coppia("Installazione:", dataIt(i.dataInstallazione));
  coppia("Manutenzione affidata dal:", dataIt(i.manutentoreDal));
  coppia("Verifiche periodiche a cura di:", i.organismoNotificato ?? "—");
  coppia("Prossima verifica:", dataIt(i.prossimaRevisione));

  // ── Проверките ────────────────────────────────────────────────────────────
  titolo("Verifiche periodiche (art. 13 e 14 D.P.R. 162/1999)");
  if (!d.verifiche.length) {
    pdf
      .fontSize(9)
      .font("Helvetica")
      .fillColor(GRIGIO)
      .text("Nessuna verifica registrata.");
  } else {
    for (const v of d.verifiche) {
      spazio(50);
      pdf.fontSize(9).font("Helvetica-Bold");
      pdf.fillColor(v.esito === "NEGATIVO" ? ROSSO : SCURO);
      pdf.text(
        `${dataIt(v.data)}  ·  ${ESITO_LABEL[v.esito] ?? v.esito}` +
          (v.numeroVerbale ? `  ·  verbale ${v.numeroVerbale}` : ""),
      );
      pdf.fontSize(8).font("Helvetica").fillColor(GRIGIO);
      pdf.text(
        `${v.tipo === "PERIODICA" ? "Periodica" : "Straordinaria"} — ${v.organismo ?? "organismo non indicato"}`,
      );
      if (v.prescrizioni)
        pdf
          .fillColor(SCURO)
          .text(`Prescrizioni: ${v.prescrizioni}`, { width: larghezza });
      pdf.moveDown(0.3);
    }
  }

  // ── Поддръжката ───────────────────────────────────────────────────────────
  titolo("Interventi di manutenzione (art. 15 D.P.R. 162/1999)");
  if (!d.interventi.length) {
    pdf
      .fontSize(9)
      .font("Helvetica")
      .fillColor(GRIGIO)
      .text("Nessun intervento registrato.");
  } else {
    for (const r of d.interventi) {
      spazio(60);
      pdf.fontSize(9).font("Helvetica-Bold").fillColor(SCURO);
      pdf.text(
        `${dataIt(r.dataOra)}  ·  ${r.numero}  ·  ${
          TIPO_INTERVENTO_LABEL[
            r.tipoIntervento as keyof typeof TIPO_INTERVENTO_LABEL
          ] ?? r.tipoIntervento
        }`,
      );
      pdf.fontSize(8).font("Helvetica").fillColor(SCURO);
      pdf.text(r.descrizione, { width: larghezza });

      // Проверките по чл. 15, ал. 4 се изписват ПОИМЕННО. Точно това се пита
      // при злополука: кое е било проверено и кога.
      const fatti = CONTROLLI_ART15.filter((c) => r.controlli[c.campo] != null);
      if (fatti.length) {
        const testo = fatti
          .map(
            (c) =>
              `${c.etichetta}: ${r.controlli[c.campo] ? "conforme" : "NON CONFORME"}`,
          )
          .join(" · ");
        pdf.fontSize(7).fillColor(GRIGIO).text(testo, { width: larghezza });
      }
      pdf
        .fontSize(7)
        .fillColor(GRIGIO)
        .text(
          `Tecnico: ${r.tecnico ?? "—"}` +
            (r.firmatoAt
              ? ` · firmato dal cliente il ${dataIt(r.firmatoAt)}`
              : " · non firmato"),
        );
      pdf.moveDown(0.4);
    }
  }

  pdf.end();
  return fine;
}
