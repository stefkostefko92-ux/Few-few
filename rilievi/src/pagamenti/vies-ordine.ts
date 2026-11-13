import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { consultaVies } from './vies.js';

/**
 * Проверката във VIES при приемането на офертата (условията 2026-11-14, чл. 12.10): за фирма от друга държава
 * от ЕС тя решава режима на ДДС. Номер, потвърден от VIES в този момент — обратно начисляване, и номерът на
 * консултацията остава при плащането. Номер, който VIES НЕ потвърждава — фирмата се третира като данъчно
 * незадължено лице (чл. 18 Регл. 282/2011) и планът се продава с 20 % български ДДС; доказателството е моментът
 * на отговора „невалиден“. VIES не отговаря — нищо не се продава. Българска фирма плаща 20 % ДДС и не се пита.
 * Същата оферта, приета втори път, докато поръчката ѝ е отворена, не пита пак: режимът вече е при плащането.
 */
export interface ProvaVies {
  viesConsultazione: string | null;
  viesAt: Date;
  viesNome: string | null;
  viesIndirizzo: string | null;
}

export type EsitoVerificaIva =
  | {
      ok: true;
      /** Номерът не е валиден във VIES: 20 % български ДДС (`iva-bg-ue`). */
      senzaVies: boolean;
      /** Какво се записва при плащането; null — български номер или вече записано при отворената поръчка. */
      prova: ProvaVies | null;
      /** Режимът идва от отворена поръчка за същата оферта — VIES не е питан пак. */
      gia: boolean;
    }
  | { ok: false; errore: 'viesNonDisponibile' };

export async function verificaPartitaIva(
  aziendaId: string,
  /** Отпечатъкът на офертата, която човекът е видял и приема. */
  hashVisto: string,
  partitaIva: { numero: string; paese: string },
  apertiDa: Date,
): Promise<EsitoVerificaIva> {
  if (partitaIva.paese === 'BG') return { ok: true, senzaVies: false, prova: null, gia: false };
  const gia = await prisma.pagamento.findFirst({
    where: {
      aziendaId,
      stato: 'IN_ATTESA',
      offertaHash: hashVisto,
      partitaIva: partitaIva.numero,
      viesAt: { not: null },
      createdAt: { gt: apertiDa },
    },
    select: { regimeIva: true },
  });
  if (gia) return { ok: true, senzaVies: gia.regimeIva === 'iva-bg-ue', prova: null, gia: true };
  const esito = await consultaVies(partitaIva.numero);
  if (esito.esito === 'nonDisponibile') {
    logger.warn({ evento: 'vies.non_disponibile', codice: esito.codice }, 'VIES non risponde');
    return { ok: false, errore: 'viesNonDisponibile' };
  }
  if (esito.esito === 'nonValida')
    return {
      ok: true,
      senzaVies: true,
      gia: false,
      // Доказателството за отговора „невалиден“: моментът му и номерът на консултацията, ако VIES го е дал.
      prova: {
        viesConsultazione: esito.consultazione,
        viesAt: esito.at ?? new Date(),
        viesNome: null,
        viesIndirizzo: null,
      },
    };
  return {
    ok: true,
    senzaVies: false,
    gia: false,
    prova: {
      viesConsultazione: esito.consultazione,
      viesAt: esito.at,
      viesNome: esito.nome,
      viesIndirizzo: esito.indirizzo,
    },
  };
}
