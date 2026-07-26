// Сглобява FatturaPA от базата. Заявките са отделени от генератора, за да може
// оформлението на XML-а да се тества без база (`fatturapa.test.ts`).

import { prisma } from "@/lib/prisma";
import type { FatturaSdi, ClienteSdi } from "@/lib/sdi/fatturapa";
import { progressivoDaNumero } from "@/lib/sdi/fatturapa";
import { toCents } from "@/lib/totals";
import type { Prisma } from "@prisma/client";

export interface EsitoSdi {
  fattura: FatturaSdi;
  /** Реквизитите, които липсват — празен списък значи „може да тръгне". */
  problemi: string[];
  nomeFile: string;
}

/**
 * Прогресивният код на подаването — от истинска последователност.
 *
 * Досега се извеждаше от БРОЯ издадени фактури. Две неща не работеха:
 *
 *   • броят се мени между две генерирания на един и същ документ, тоест SDI
 *     виждаше нов файл вместо преиздаден;
 *   • при повече от 9999 фактури четирицифреното допълване се повтаря и SDI
 *     отхвърля файла като дубликат — независимо от съдържанието му.
 *
 * Сега кодът се тегли ВЕДНЪЖ от монотонен брояч на фирмата и се замразява
 * върху фактурата. Преиздаването след отказ ползва замразения — така файлът е
 * същият, както изисква преиздаването със същия номер и дата.
 */
export async function prossimoProgressivo(
  tenantId: string | null,
  tx: Prisma.TransactionClient,
): Promise<string> {
  // Ключалка по фирма за времето на транзакцията. `ON CONFLICT` не върши
  // работа тук: `tenantId` е NULL при еднофирмената инсталация — най-честият
  // случай — а в уникален индекс две NULL стойности НЕ се смятат за еднакви,
  // тоест конфликт не настъпва и всяко подаване би създавало нов брояч.
  // Същият похват пази и веригата на одита (`audit.ts`).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sdi:${tenantId ?? ""}`}, 0))`;

  const c = await tx.contatoreSdi.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  const dopo = c
    ? await tx.contatoreSdi.update({
        where: { id: c.id },
        data: { ultimo: { increment: 1 } },
        select: { ultimo: true },
      })
    : await tx.contatoreSdi.create({
        data: { tenantId, ultimo: 1 },
        select: { ultimo: true },
      });
  return progressivoDaNumero(dopo.ultimo);
}

const includeSdi = {
  condominio: true,
  amministratore: true,
  voci: { orderBy: { ordine: "asc" as const } },
  pagamenti: { orderBy: { data: "asc" as const } },
};

/**
 * Получателят на фактурата.
 *
 * Когато работата е за кондоминиум, ПОЛУЧАТЕЛЯТ е кондоминиумът: той е
 * фискалният субект, със свой данъчен номер и свой адрес. Администраторът е
 * само представител — плаща от името на кондоминиума и не е страна.
 *
 * Дотук продуктът пращаше фактурата на студиото. Последиците са три и всяка
 * една е достатъчна: документът е издаден на грешно лице; кондоминиумът не
 * може да приспадне разхода; удържането по чл. 25-ter не е направено от този,
 * който го дължи.
 */
function destinatario(
  f: Prisma.FatturaGetPayload<{ include: typeof includeSdi }>,
): ClienteSdi {
  const cond = f.condominio;
  if (cond)
    return {
      denominazione: cond.nome,
      persona: false,
      // Кондоминиумът НЕ е субект по ДДС — само данъчен номер.
      partitaIva: null,
      codiceFiscale: cond.codiceFiscale,
      indirizzo: cond.indirizzo,
      cap: cond.cap,
      citta: cond.citta,
      provincia: cond.provincia,
      codiceSdi: cond.codiceSdi,
      pec: cond.pec,
      condominio: true,
    };

  const a = f.amministratore;
  return {
    denominazione:
      a?.ragioneSociale ?? `${a?.nome ?? ""} ${a?.cognome ?? ""}`.trim(),
    nome: a?.nome ?? null,
    cognome: a?.cognome ?? null,
    persona: a?.tipo === "PERSONA_FISICA",
    partitaIva: a?.partitaIva ?? null,
    codiceFiscale: a?.codiceFiscale ?? null,
    indirizzo: a?.indirizzo ?? null,
    cap: a?.cap ?? null,
    citta: a?.citta ?? null,
    provincia: a?.provincia ?? null,
    codiceSdi: a?.codiceSdi ?? null,
    pec: a?.pec ?? null,
    condominio: false,
  };
}

export async function fatturaPerSdi(
  id: string,
  tenantId: string | null,
): Promise<FatturaSdi | null> {
  const f = await prisma.fattura.findFirst({
    where: { id, tenantId },
    include: includeSdi,
  });
  if (!f) return null;

  const a = await prisma.datiAzienda.findFirst({ where: { tenantId } });

  return {
    numero: f.numero,
    data: f.data,
    dataScadenza: f.dataScadenza,
    // Сторното НЕ е фактура с отрицателен знак, а nota di credito: TD04.
    tipoDocumento: f.stato === "STORNATA" ? "TD04" : "TD01",
    causale: f.oggetto,
    azienda: {
      ragioneSociale: a?.ragioneSociale ?? "",
      partitaIva: a?.partitaIva ?? null,
      codiceFiscale: a?.codiceFiscale ?? null,
      regimeFiscale: a?.regimeFiscale ?? "RF01",
      indirizzo: a?.indirizzo ?? null,
      cap: a?.cap ?? null,
      citta: a?.citta ?? null,
      provincia: a?.provincia ?? null,
      iban: a?.iban ?? null,
    },
    cliente: destinatario(f),
    righe: f.voci.map((v) => ({
      descrizione: v.descrizione,
      quantita: String(v.quantita),
      prezzoUnitario: String(v.prezzoUnitario),
      aliquotaIva: String(v.aliquotaIva),
      naturaIva: v.naturaIva,
      // Празно за всички редове значи „удържането е върху цялата фактура" —
      // обичайният случай при договор за изработка.
      ritenuta: null,
    })),
    ritenuta: f.ritenuta
      ? {
          tipo: f.ritenutaTipo,
          causale: f.ritenutaCausale,
          aliquota: toCents(f.ritenutaAliquota),
        }
      : null,
    splitPayment: f.splitPayment,
    cig: f.cig,
    cup: f.cup,
    modalitaPagamento: f.modalitaPagamento,
    condizioniPagamento: f.condizioniPagamento,
    // Замразеният код: празен само преди първото генериране.
    progressivoInvio: f.progressivoInvio ?? "",
  };
}
