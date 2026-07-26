// Сглобява данните за PDF от базата — общо за четирите типа документ.
//
// Отделено от самия генератор, за да може оформлението да се тества без база,
// а заявките да се преизползват от бъдещия експорт за SDI.

import { prisma } from "@/lib/prisma";
import { riepilogoIva, toCents, fromCents } from "@/lib/totals";
import { calcolaRitenuta } from "@/lib/fiscale/ritenuta";
import type {
  Azienda,
  Controparte,
  DocumentoPdf,
  RigaDocumento,
} from "@/lib/pdf/documento";

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

function controparte(
  a: {
    ragioneSociale: string | null;
    nome: string;
    cognome: string | null;
    indirizzo: string | null;
    cap: string | null;
    citta: string | null;
    provincia: string | null;
    partitaIva: string | null;
    codiceFiscale: string | null;
  } | null,
): Controparte | null {
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
  voci: {
    descrizione: string;
    quantita: unknown;
    prezzoUnitario: unknown;
    aliquotaIva: unknown;
    totale: unknown;
  }[],
): RigaDocumento[] =>
  voci.map((v) => ({
    descrizione: v.descrizione,
    quantita: String(v.quantita),
    prezzoUnitario: String(v.prezzoUnitario),
    aliquotaIva: String(v.aliquotaIva),
    totale: String(v.totale),
  }));

/** Оферта. */
export async function pdfPreventivo(
  id: string,
  tenantId: string | null,
): Promise<DocumentoPdf | null> {
  const p = await prisma.preventivo.findFirst({
    where: { id, tenantId },
    include: {
      amministratore: true,
      voci: { orderBy: { ordine: "asc" } },
      impianto: true,
    },
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
      ...(p.impianto
        ? [{ label: "Impianto", valore: p.impianto.matricola }]
        : []),
    ],
    note: p.note,
  };
}

/** Фактура. */
export async function pdfFattura(
  id: string,
  tenantId: string | null,
): Promise<DocumentoPdf | null> {
  const f = await prisma.fattura.findFirst({
    where: { id, tenantId },
    include: {
      condominio: true,
      amministratore: true,
      voci: { orderBy: { ordine: "asc" } },
      ordineLavoro: true,
    },
  });
  if (!f) return null;
  const voci = f.voci.map((v) => ({
    quantita: v.quantita.toString(),
    prezzoUnitario: v.prezzoUnitario.toString(),
    aliquotaIva: v.aliquotaIva.toString(),
  }));

  const imponibile = toCents(f.totaleNetto);
  const imposta = toCents(f.totaleIva);
  const r = f.ritenuta
    ? calcolaRitenuta(imponibile, imposta, toCents(f.ritenutaAliquota))
    : null;

  return {
    tipo: f.tipo === "EMESSA" ? "Documento contabile" : "Fattura ricevuta",
    numero: f.numero,
    data: f.data,
    oggetto: f.oggetto,
    azienda: await datiAzienda(tenantId),
    // Получателят е кондоминиумът, когато го има: администраторът само го
    // представлява и НЕ е страна по документа.
    destinatario: f.condominio
      ? {
          denominazione: f.condominio.nome,
          indirizzo: f.condominio.indirizzo,
          cap: f.condominio.cap,
          citta: f.condominio.citta,
          provincia: f.condominio.provincia,
          partitaIva: null,
          codiceFiscale: f.condominio.codiceFiscale,
        }
      : controparte(f.amministratore),
    righe: righeConPrezzi(f.voci),
    conPrezzi: true,
    riepilogo: riepilogoIva(voci),
    totaleNetto: f.totaleNetto.toString(),
    totaleIva: f.totaleIva.toString(),
    totaleLordo: f.totaleLordo.toString(),
    ritenuta: r
      ? {
          aliquota: f.ritenutaAliquota.toString(),
          importo: fromCents(r.importo),
          netto: fromCents(f.splitPayment ? imponibile - r.importo : r.netto),
        }
      : null,
    splitPayment: f.splitPayment,
    dettagli: [
      ...(f.dataScadenza
        ? [
            {
              label: "Scadenza",
              valore: f.dataScadenza.toISOString().slice(0, 10),
            },
          ]
        : []),
      ...(f.ordineLavoro
        ? [{ label: "Ordine", valore: f.ordineLavoro.numero }]
        : []),
      ...(f.condominio && f.amministratore
        ? [
            {
              label: "Amministratore",
              valore:
                f.amministratore.ragioneSociale ??
                `${f.amministratore.nome} ${f.amministratore.cognome ?? ""}`.trim(),
            },
          ]
        : []),
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
export async function pdfDdt(
  id: string,
  tenantId: string | null,
): Promise<DocumentoPdf | null> {
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
    destinatario: d.destinatario
      ? { denominazione: d.destinatario, indirizzo: d.indirizzoConsegna }
      : null,
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
      ...(d.ordineLavoro
        ? [{ label: "Ordine", valore: d.ordineLavoro.numero }]
        : []),
    ],
    note: d.note,
    avvertenza:
      "Verificare che i dati del cedente e del cessionario siano completi: sono richiesti dall'art. 1, comma 3, D.P.R. 472/1996.",
  };
}

/** Отчет за намесата — документът, който клиентът подписва на място. */
export async function pdfRapportino(
  id: string,
  tenantId: string | null,
): Promise<DocumentoPdf | null> {
  const r = await prisma.rapportino.findFirst({
    where: { id, tenantId },
    include: {
      tecnico: { select: { nome: true, cognome: true } },
      ordineLavoro: {
        select: {
          numero: true,
          oggetto: true,
          impianto: { select: { matricola: true, indirizzo: true } },
        },
      },
      materialiUsati: {
        include: { articolo: { select: { codice: true, nome: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!r) return null;

  const ESITO: Record<string, string> = {
    RISOLTO: "Risolto",
    DA_COMPLETARE: "Da completare",
    RINVIATO: "Rinviato",
    NON_RISOLVIBILE: "Non risolvibile",
  };

  return {
    tipo: "Rapportino di intervento",
    numero: r.numero,
    data: r.dataOra,
    oggetto: r.ordineLavoro.oggetto,
    azienda: await datiAzienda(tenantId),
    destinatario: null,
    corpo: r.descrizione,
    // Вложеното — първо артикулите ОТ СКЛАДА (с количество; те са свалили
    // наличността), после свободният текст за онова, което не е складов артикул.
    //
    // Листът трябва да казва СЪЩОТО, което казва системата: клиентът подписва
    // тази хартия, а „взети две части" срещу „вписана една" е спор, който после
    // никой не може да разреши.
    righe: [
      ...r.materialiUsati.map((m) => ({
        descrizione: `${m.articolo.codice} — ${m.articolo.nome}`,
        quantita: String(m.quantita),
      })),
      ...(r.materiali
        ? r.materiali
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean)
            .map((descrizione) => ({ descrizione, quantita: "" }))
        : []),
    ],
    conPrezzi: false,
    dettagli: [
      { label: "Ordine di lavoro", valore: r.ordineLavoro.numero },
      ...(r.ordineLavoro.impianto
        ? [
            {
              label: "Impianto",
              valore: `${r.ordineLavoro.impianto.matricola}${
                r.ordineLavoro.impianto.indirizzo
                  ? ` — ${r.ordineLavoro.impianto.indirizzo}`
                  : ""
              }`,
            },
          ]
        : []),
      {
        label: "Tecnico",
        valore: r.tecnico ? `${r.tecnico.nome} ${r.tecnico.cognome}` : "—",
      },
      { label: "Ore di lavoro", valore: r.oreLavoro.toString() },
      { label: "Esito", valore: ESITO[r.esito] ?? r.esito },
    ],
    firma:
      r.firmaCliente && r.firmatoAt
        ? {
            immagine: r.firmaCliente,
            nome: r.firmatarioNome ?? "—",
            ruolo: r.firmatarioRuolo,
            data: r.firmatoAt,
          }
        : null,
    // Неподписаният отчет не доказва приемане — казва го на самия лист.
    avvertenza: r.firmatoAt
      ? null
      : "Rapportino non ancora firmato dal cliente: non costituisce accettazione dell'intervento.",
  };
}
