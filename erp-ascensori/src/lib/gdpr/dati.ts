// Износ и анонимизация — частта, която пипа базата.
//
// Планът (`piano.ts`) е чист и тестван; тук е само изпълнението, за да не се
// смесват правилото и заявката.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { scriviAudit } from "@/lib/audit";
import { revocaTutte } from "@/lib/sessioni";
import {
  pianoAnonimizzazione,
  residuiPersonali,
  datiAnonimizzati,
  type TipoSoggetto,
  type PianoAnonimizzazione,
} from "@/lib/gdpr/piano";

export interface Soggetto {
  tipo: TipoSoggetto;
  id: string;
  etichetta: string;
  /** Вече анонимизиран? Втора анонимизация няма смисъл и обърква одита. */
  anonimizzato: boolean;
}

/** Полетата, по които се търси субект — свободният текст не пипа базата сляпо. */
export async function cercaSoggetti(
  q: string,
  tenantId: string | null,
  vedeTutti: boolean,
): Promise<Soggetto[]> {
  const dove = vedeTutti ? {} : { tenantId };
  const contiene = { contains: q, mode: "insensitive" as const };
  const [utenti, dipendenti, amministratori] = await Promise.all([
    prisma.user.findMany({
      where: { ...dove, OR: [{ nome: contiene }, { cognome: contiene }, { email: contiene }] },
      select: { id: true, nome: true, cognome: true, email: true },
      take: 20,
    }),
    prisma.dipendente.findMany({
      where: { ...dove, OR: [{ nome: contiene }, { cognome: contiene }, { email: contiene }] },
      select: { id: true, nome: true, cognome: true, email: true },
      take: 20,
    }),
    prisma.amministratore.findMany({
      where: {
        ...dove,
        OR: [
          { nome: contiene },
          { cognome: contiene },
          { ragioneSociale: contiene },
          { email: contiene },
        ],
      },
      select: { id: true, nome: true, cognome: true, ragioneSociale: true, email: true },
      take: 20,
    }),
  ]);

  const anonimo = (nome: string) => nome === "Anonimizzato";
  return [
    ...utenti.map((u) => ({
      tipo: "utente" as const,
      id: u.id,
      etichetta: `${u.nome} ${u.cognome} · ${u.email}`,
      anonimizzato: anonimo(u.nome),
    })),
    ...dipendenti.map((d) => ({
      tipo: "dipendente" as const,
      id: d.id,
      etichetta: `${d.nome} ${d.cognome}${d.email ? ` · ${d.email}` : ""}`,
      anonimizzato: anonimo(d.nome),
    })),
    ...amministratori.map((a) => ({
      tipo: "amministratore" as const,
      id: a.id,
      etichetta: a.ragioneSociale ?? `${a.nome} ${a.cognome ?? ""}`.trim(),
      anonimizzato: anonimo(a.nome),
    })),
  ];
}

/** Намира субекта В ОБХВАТА на заявителя. Извън обхвата = не съществува. */
async function trova(tipo: TipoSoggetto, id: string, dove: object) {
  if (tipo === "utente")
    return prisma.user.findFirst({
      where: { id, ...dove },
      // Хешът на паролата и тайната на втория фактор НЕ излизат в износа:
      // правото на достъп е върху личните данни, не върху удостоверенията.
      select: {
        id: true,
        email: true,
        nome: true,
        cognome: true,
        ruolo: true,
        attivo: true,
        ultimoAccesso: true,
        totpAttivo: true,
        passwordCambiataAt: true,
        note: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  if (tipo === "dipendente")
    return prisma.dipendente.findFirst({ where: { id, ...dove } });
  return prisma.amministratore.findFirst({ where: { id, ...dove } });
}

export interface EsportazioneGdpr {
  soggetto: Record<string, unknown>;
  tipo: TipoSoggetto;
  /** Записите, в които лицето участва — без чужди лични данни в тях. */
  collegati: Record<string, unknown[]>;
  /** Кога е изготвен износът: чл. 15 иска отговор в един месец. */
  generatoIl: string;
  nota: string;
}

/**
 * Износът по чл. 15 GDPR.
 *
 * Форматът е JSON, защото чл. 20 иска „структуриран, широко използван и машинно
 * четим" — PDF не е нито едно от трите.
 */
export async function esporta(
  tipo: TipoSoggetto,
  id: string,
  tenantId: string | null,
  vedeTutti: boolean,
): Promise<EsportazioneGdpr | null> {
  const dove = vedeTutti ? {} : { tenantId };
  const soggetto = await trova(tipo, id, dove);
  if (!soggetto) return null;

  const collegati: Record<string, unknown[]> = {};

  if (tipo === "utente") {
    collegati.sessioni = await prisma.sessioneAttiva.findMany({
      where: { utenteId: id },
      select: { id: true, userAgent: true, ip: true, ultimoUso: true, createdAt: true },
    });
    // Само СОБСТВЕНИТЕ действия. `dettagli` не влиза: то съдържа стойности от
    // чужди записи, а чл. 15(4) пази правата на другите.
    collegati.operazioni = await prisma.auditLog.findMany({
      where: { utenteId: id },
      select: { azione: true, entita: true, entitaId: true, createdAt: true },
      orderBy: { seq: "desc" },
      take: 1000,
    });
  }

  if (tipo === "dipendente") {
    collegati.assegnazioni = await prisma.assegnazioneTecnico.findMany({
      where: { dipendenteId: id },
      select: { impiantoId: true, dataInizio: true, dataFine: true, attiva: true },
    });
    collegati.ordini = await prisma.ordineLavoro.findMany({
      where: { tecnicoId: id },
      select: { numero: true, oggetto: true, stato: true, dataInizio: true, dataFine: true },
      orderBy: { createdAt: "desc" },
    });
    collegati.rapportini = await prisma.rapportino.findMany({
      where: { tecnicoId: id },
      select: { numero: true, dataOra: true, oreLavoro: true, esito: true, descrizione: true },
      orderBy: { dataOra: "desc" },
    });
  }

  if (tipo === "amministratore") {
    collegati.condomini = await prisma.condominio.findMany({
      where: { amministratoreId: id },
      select: { nome: true, indirizzo: true, citta: true },
    });
    collegati.fatture = await prisma.fattura.findMany({
      where: { amministratoreId: id },
      select: { numero: true, data: true, stato: true, totaleLordo: true },
      orderBy: { data: "desc" },
    });
    collegati.preventivi = await prisma.preventivo.findMany({
      where: { amministratoreId: id },
      select: { numero: true, oggetto: true, stato: true, totaleLordo: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  return {
    tipo,
    soggetto: soggetto as unknown as Record<string, unknown>,
    collegati,
    generatoIl: new Date().toISOString(),
    nota:
      "Estrazione ai sensi degli artt. 15 e 20 GDPR. Non contiene credenziali " +
      "(password, secret del secondo fattore) né dati personali di terzi.",
  };
}

export interface EsitoAnonimizzazione {
  piano: PianoAnonimizzazione;
  sessioniRevocate: number;
  residui: string[];
}

/**
 * Прилага плана. Необратимо — и точно затова маршрутът иска потвърждение.
 *
 * Всичко е в ЕДНА транзакция заедно с одита: половин анонимизация е по-лоша от
 * никаква, защото лицето вече е получило отговор „заличено".
 */
export async function anonimizza(
  tipo: TipoSoggetto,
  id: string,
  tenantId: string | null,
  vedeTutti: boolean,
  attore: { sub: string; tenantId: string | null },
): Promise<EsitoAnonimizzazione | null> {
  const dove = vedeTutti ? {} : { tenantId };
  const esistente = await trova(tipo, id, dove);
  if (!esistente) return null;

  const piano = pianoAnonimizzazione(tipo, id);
  const dati = datiAnonimizzati(piano);

  const { aggiornato, sessioniRevocate } = await prisma.$transaction(async (tx) => {
    const delegato: Record<TipoSoggetto, { update(a: object): Promise<unknown> }> = {
      utente: tx.user,
      dipendente: tx.dipendente,
      amministratore: tx.amministratore,
    };
    const aggiornato = (await delegato[tipo].update({
      where: { id },
      data: { ...dati, attivo: false },
    })) as Record<string, unknown>;

    const sessioniRevocate = piano.revocaSessioni ? await revocaTutte(id, undefined, tx) : 0;

    // Одитът записва СЪБИТИЕТО, не съдържанието: вписването на старите стойности
    // тук би върнало обратно точно данните, които току-що махнахме.
    await scriviAudit(
      {
        azione: "DELETE",
        entita: `gdpr:${tipo}`,
        entitaId: id,
        dettagli: { campi: piano.campi.map((c) => c.campo), sessioniRevocate },
        utenteId: attore.sub,
        tenantId: attore.tenantId,
      },
      tx,
    );

    return { aggiornato, sessioniRevocate };
  });

  return { piano, sessioniRevocate, residui: residuiPersonali(piano, aggiornato) };
}

/** Типизиран поглед към транзакционния клиент — само за четимост горе. */
export type TxGdpr = Prisma.TransactionClient;
