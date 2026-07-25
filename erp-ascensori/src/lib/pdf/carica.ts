// Сглобява данните за PDF от базата — общо за четирите типа документ.
//
// Отделено от самия генератор, за да може оформлението да се тества без база,
// а заявките да се преизползват от бъдещия експорт за SDI.

import { prisma } from "@/lib/prisma";
import { riepilogoIva } from "@/lib/totals";
import type { Azienda, Controparte, DocumentoPdf, RigaDocumento } from "@/lib/pdf/documento";

/**
 * Данните на издаващата фирма.
 *
 * Ако още не са попълнени, документът НЕ се отказва — връща се минимален
 * запис с явно указание. Празен документ е по-лош от документ с липсващо
 * поле: първият блокира работата, вторият показва какво трябва да се допълни.
 */
export async function datiAzienda(tenantId: string | null): Promise<Azienda> {
  const d = await prisma.datiAzienda.findFirst({ where: { tenantId } });
  if (d) return d;
  return {
    ragioneSociale: "— Dati azienda non configurati —",
    notePiePagina:
      "Completare i dati aziendali in Impostazioni: sono obbligatori sui documenti di trasporto (art. 1 D.P.R. 472/1996).",
  };
}

function controparte(a: {
  ragioneSociale: string | null;
  nome: string;
  cognome: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  partitaIva: string | null;
  codiceFiscale: string | null;
} | null): Controparte | null {
  if (!a) return null;
  return {
    denominazione: a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`.trim(),
    indirizzo: a.indirizzo,
    cap: a.cap,
    citta: a.citta,
    provincia: a.provincia,
    partitaIva: a.partitaIva,
    codiceFiscale: a.codiceFiscale,
  };
}

const righeConPrezzi = (
  voci: { descrizione: string; quantita: unknown; prezzoUnitario: unknown; aliquotaIva: unknown; totale: unknown }[],
): RigaDocumento[] =>
  voci.map((v) => ({
    descrizione: v.descrizione,
    quantita: String(v.quantita),
    prezzoUnitario: String(v.prezzoUnitario),
    aliquotaIva: String(v.aliquotaIva),
    totale: String(v.totale),
  }));

/** Оферта. */
export async function pdfPreventivo(id: string, tenantId: string | null): Promise<DocumentoPdf | null> {
  const p = await prisma.preventivo.findFirst({
    where: { id, tenantId },
    include: { amministratore: true, voci: { orderBy: { ordine: "asc" } }, impianto: true },
  });
  if (!p) return null;
  const voci = p.voci.map((v) => ({
    quantita: v.quantita.toString(),
    prezzoUnitario: v.prezzoUnitario.toString(),
    aliquotaIva: v.aliquotaIva.toString(),
  }));
  return {
    tipo: "Preventivo",
    numero: p.numero,
    data: p.createdAt,
    oggetto: p.oggetto,
    azienda: await datiAzienda(tenantId),
    destinatario: controparte(p.amministratore),
    righe: righeConPrezzi(p.voci),
    conPrezzi: true,
    riepilogo: riepilogoIva(voci),
    totaleNetto: p.totaleNetto.toString(),
    totaleIva: p.totaleIva.toString(),
    totaleLordo: p.totaleLordo.toString(),
    dettagli: [
      { label: "Validità", valore: `${p.validitaGiorni} giorni` },
      ...(p.impianto ? [{ label: "Impianto", valore: p.impianto.matricola }] : []),
    ],
    note: p.note,
  };
}

/** Фактура. */
export async function pdfFattura(id: string, tenantId: string | null): Promise<DocumentoPdf | null> {
  const f = await prisma.fattura.findFirst({
    where: { id, tenantId },
    include: { amministratore: true, voci: { orderBy: { ordine: "asc" } }, ordineLavoro: true },
  });
  if (!f) return null;
  const voci = f.voci.map((v) => ({
    quantita: v.quantita.toString(),
    prezzoUnitario: v.prezzoUnitario.toString(),
    aliquotaIva: v.aliquotaIva.toString(),
  }));
  return {
    tipo: f.tipo === "EMESSA" ? "Documento contabile" : "Fattura ricevuta",
    numero: f.numero,
    data: f.data,
    oggetto: f.oggetto,
    azienda: await datiAzienda(tenantId),
    destinatario: controparte(f.amministratore),
    righe: righeConPrezzi(f.voci),
    conPrezzi: true,
    riepilogo: riepilogoIva(voci),
    totaleNetto: f.totaleNetto.toString(),
    totaleIva: f.totaleIva.toString(),
    totaleLordo: f.totaleLordo.toString(),
    dettagli: [
      ...(f.dataScadenza
        ? [{ label: "Scadenza", valore: f.dataScadenza.toISOString().slice(0, 10) }]
        : []),
      ...(f.ordineLavoro ? [{ label: "Ordine", valore: f.ordineLavoro.numero }] : []),
      { label: "Stato", valore: f.stato },
    ],
    note: f.note,
    // Продуктът не изпраща през SDI. Документ, който изглежда като издадена
    // електронна фактура, но не е минал през SDI, се третира като НЕИЗДАДЕН
    // (чл. 6 D.Lgs. 471/1997) — затова го пише на самия лист.
    avvertenza:
      f.tipo === "EMESSA"
        ? "Documento generato dal gestionale a uso interno e per il cliente. NON costituisce fattura elettronica: la trasmissione al Sistema di Interscambio va effettuata tramite il proprio intermediario."
        : null,
  };
}

/** DDT — реквизитите по чл. 1, ал. 3 D.P.R. 472/1996. */
export async function pdfDdt(id: string, tenantId: string | null): Promise<DocumentoPdf | null> {
  const d = await prisma.ddt.findFirst({
    where: { id, tenantId },
    include: { righe: { orderBy: { ordine: "asc" } }, ordineLavoro: true },
  });
  if (!d) return null;
  return {
    tipo: "Documento di trasporto",
    numero: d.numero,
    data: d.data,
    oggetto: null,
    azienda: await datiAzienda(tenantId),
    // Получателят на DDT е свободен текст в модела — показва се както е въведен.
    destinatario: d.destinatario ? { denominazione: d.destinatario, indirizzo: d.indirizzoConsegna } : null,
    righe: d.righe.map((r) => ({
      descrizione: r.descrizione,
      quantita: String(r.quantita),
      um: r.um,
      peso: r.peso?.toString() ?? null,
    })),
    conPrezzi: false,
    dettagli: [
      { label: "Causale del trasporto", valore: d.causale ?? "—" },
      { label: "Trasporto a cura di", valore: d.vettore ?? "mittente" },
      ...(d.ordineLavoro ? [{ label: "Ordine", valore: d.ordineLavoro.numero }] : []),
    ],
    note: d.note,
    avvertenza:
      "Verificare che i dati del cedente e del cessionario siano completi: sono richiesti dall'art. 1, comma 3, D.P.R. 472/1996.",
  };
}
