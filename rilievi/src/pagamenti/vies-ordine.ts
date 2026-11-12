import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { consultaVies } from './vies.js';

/**
 * Проверката във VIES при приемането на офертата (условията 2026-11-13, чл. 12.10): за фирма от друга държава
 * от ЕС обратното начисляване важи само с номер, потвърден от VIES в този момент — иначе нищо не се записва и
 * нищо не тръгва към Revolut. Българска фирма плаща 20 % ДДС и не се пита. Същата оферта, приета втори път,
 * докато поръчката ѝ е отворена, не пита пак: доказателството вече е при плащането.
 */
export interface ProvaVies {
  viesConsultazione: string | null;
  viesAt: Date;
  viesNome: string | null;
  viesIndirizzo: string | null;
}

export type EsitoVerificaIva =
  /** `prova` null: български номер (без проверка) или вече проверено за отворената поръчка (`gia`). */
  | { ok: true; prova: ProvaVies | null; gia: boolean }
  | { ok: false; errore: 'viesNonValida' | 'viesNonDisponibile' };

export async function verificaPartitaIva(
  aziendaId: string,
  offertaHash: string,
  partitaIva: { numero: string; paese: string },
  apertiDa: Date,
): Promise<EsitoVerificaIva> {
  if (partitaIva.paese === 'BG') return { ok: true, prova: null, gia: false };
  const gia = await prisma.pagamento.findFirst({
    where: {
      aziendaId,
      stato: 'IN_ATTESA',
      offertaHash,
      partitaIva: partitaIva.numero,
      viesAt: { not: null },
      createdAt: { gt: apertiDa },
    },
    select: { id: true },
  });
  if (gia) return { ok: true, prova: null, gia: true };
  const esito = await consultaVies(partitaIva.numero);
  if (esito.esito === 'nonValida') return { ok: false, errore: 'viesNonValida' };
  if (esito.esito === 'nonDisponibile') {
    logger.warn({ evento: 'vies.non_disponibile', codice: esito.codice }, 'VIES non risponde');
    return { ok: false, errore: 'viesNonDisponibile' };
  }
  return {
    ok: true,
    gia: false,
    prova: {
      viesConsultazione: esito.consultazione,
      viesAt: esito.at,
      viesNome: esito.nome,
      viesIndirizzo: esito.indirizzo,
    },
  };
}
