import type { AmbienteRevolut, Prisma } from '@prisma/client';
import type { CampiAbbonamento } from '../abbonamenti/regole.js';
import { isProduction } from '../config.js';
import type { Segmento } from './periodo.js';

/**
 * Абонаментът на фирмата и плащанията зад него — входът на `periodoDi` (pagamenti/periodo.ts), еднакъв за
 * офертата и за плащането. Плащане в Sandbox на живия сървър е проба: завършва, но период не дава (иначе тестова
 * карта би дала истински Premium) — и не се брои във веригата.
 */
export const CAMPI_ABBONAMENTO = {
  abbonamentoFino: true,
  abbonamentoProva: true,
  abbonamentoLivello: true,
  abbonamentoCambioAt: true,
  abbonamentoCambioLivello: true,
} as const;

/** Плащането в тази среда дава ли период: всичко, освен Sandbox на живия сървър. */
export const daPeriodo = (ambiente: AmbienteRevolut): boolean =>
  !(isProduction() && ambiente === 'SANDBOX');

export async function situazioneDi(
  db: Prisma.TransactionClient,
  aziendaId: string,
  now: Date,
): Promise<{ campi: CampiAbbonamento; segmenti: Segmento[] }> {
  const [campi, pagati] = await Promise.all([
    db.azienda.findUniqueOrThrow({ where: { id: aziendaId }, select: CAMPI_ABBONAMENTO }),
    db.pagamento.findMany({
      where: {
        aziendaId,
        stato: 'COMPLETATO',
        fine: { gt: now },
        ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
      },
      select: { inizio: true, fine: true, imponibileCent: true, creditoCent: true },
    }),
  ]);
  const segmenti = pagati.flatMap((p) =>
    p.inizio && p.fine
      ? [{ inizio: p.inizio, fine: p.fine, valoreCent: p.imponibileCent + p.creditoCent }]
      : [],
  );
  return { campi, segmenti };
}
