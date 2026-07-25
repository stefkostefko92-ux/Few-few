// Сглобява FatturaPA от базата. Заявките са отделени от генератора, за да може
// оформлението на XML-а да се тества без база (`fatturapa.test.ts`).

import { prisma } from "@/lib/prisma";
import type { FatturaSdi } from "@/lib/sdi/fatturapa";
import { progressivoDaNumero } from "@/lib/sdi/fatturapa";

export interface EsitoSdi {
  fattura: FatturaSdi;
  /** Реквизитите, които липсват — празен списък значи „може да тръгне". */
  problemi: string[];
  nomeFile: string;
}

/**
 * Прогресивният код на подаването.
 *
 * Изведен е от БРОЯ издадени фактури на фирмата, а не от случайност: SDI
 * отхвърля повторено име на файл като дубликат, а повторяемата стойност
 * позволява документът да бъде преиздаден със същото име след поправка,
 * вместо да заеме нов номер при всяко натискане на бутона.
 */
export async function progressivo(tenantId: string | null, numero: string): Promise<string> {
  const precedenti = await prisma.fattura.count({
    where: { tenantId, numero: { lte: numero } },
  });
  return progressivoDaNumero(precedenti);
}

export async function fatturaPerSdi(
  id: string,
  tenantId: string | null,
): Promise<FatturaSdi | null> {
  const f = await prisma.fattura.findFirst({
    where: { id, tenantId },
    include: {
      amministratore: true,
      voci: { orderBy: { ordine: "asc" } },
    },
  });
  if (!f) return null;

  const a = await prisma.datiAzienda.findFirst({ where: { tenantId } });
  const c = f.amministratore;

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
    cliente: {
      denominazione: c?.ragioneSociale ?? `${c?.nome ?? ""} ${c?.cognome ?? ""}`.trim(),
      nome: c?.nome ?? null,
      cognome: c?.cognome ?? null,
      persona: c?.tipo === "PERSONA_FISICA",
      partitaIva: c?.partitaIva ?? null,
      codiceFiscale: c?.codiceFiscale ?? null,
      indirizzo: c?.indirizzo ?? null,
      cap: c?.cap ?? null,
      citta: c?.citta ?? null,
      provincia: c?.provincia ?? null,
      codiceSdi: c?.codiceSdi ?? null,
      pec: c?.pec ?? null,
    },
    righe: f.voci.map((v) => ({
      descrizione: v.descrizione,
      quantita: String(v.quantita),
      prezzoUnitario: String(v.prezzoUnitario),
      aliquotaIva: String(v.aliquotaIva),
      naturaIva: v.naturaIva,
    })),
    progressivoInvio: await progressivo(tenantId, f.numero),
  };
}
