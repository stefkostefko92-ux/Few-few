import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import {
  chiaveSigillo,
  firmeGiaUsate,
  LOCK_FIRME,
  parseDueFirme,
  valoriDueFirme,
  type ErroreFirma,
} from '../interventi/conferma.js';
import type { Firma } from '../interventi/firma.js';
import { improntaFirma } from '../interventi/sigillo.js';
import { logger } from '../logger.js';
import { improntaVerbale, sigilloVerbale, sigilloVerbaleValido } from './sigillo.js';

/**
 * „Firma e conferma“ на протокола — като листа за интервенция (собственикът, 5 ноември 2026: „като листа
 * за интервенция“): техникът изпълнител и супервайзърът подписват на страницата, която показва
 * окончателния протокол само за четене и отпечатъка му. Формата връща версията (`base`) и отпечатъка;
 * различни — „conflict“, нищо не се пише. Без „Verbale positivo“ протоколът не се подписва
 * („incompleto“). Подписите, имената, отпечатъкът, печатът и потвърждението влизат с ЕДИН UPDATE.
 */

export const CAMPI_FIRMA = ['firmaTecnico', 'firmaSupervisore'] as const;
export type CampoFirmaVerbale =
  'firmaTecnico' | 'firmaTecnicoNome' | 'firmaSupervisore' | 'firmaSupervisoreNome';
export type ErroriFirmaVerbale = Partial<Record<CampoFirmaVerbale, ErroreFirma>>;

export interface DatiFirmaVerbale {
  firmaTecnico: Firma;
  firmaTecnicoNome: string;
  firmaSupervisore: Firma;
  firmaSupervisoreNome: string;
}

export function parseFirmeVerbale(
  body: unknown,
): { ok: true; data: DatiFirmaVerbale } | { ok: false; errors: ErroriFirmaVerbale } {
  const parsed = parseDueFirme(body, CAMPI_FIRMA);
  if (!parsed.ok) return { ok: false, errors: parsed.errors as ErroriFirmaVerbale };
  const { firme, nomi } = parsed.data;
  return {
    ok: true,
    data: {
      firmaTecnico: firme[0],
      firmaTecnicoNome: nomi[0],
      firmaSupervisore: firme[1],
      firmaSupervisoreNome: nomi[1],
    },
  };
}

export const valoriFirmeVerbale = (body: unknown): Record<CampoFirmaVerbale, string> =>
  valoriDueFirme(body, CAMPI_FIRMA) as Record<CampoFirmaVerbale, string>;

export type EsitoConfermaVerbale =
  | 'ok'
  | 'conflict'
  | 'chiuso'
  | 'missing'
  | 'incompleto'
  | { ripetute: Array<'firmaTecnico' | 'firmaSupervisore'> };

export async function confermaVerbale(
  scope: Scope,
  id: string,
  vista: { base: string; impronta: string },
  dati: DatiFirmaVerbale,
  actorId: string,
): Promise<EsitoConfermaVerbale> {
  const baseDate = new Date(vista.base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.verbale.findFirst({ where: { id, ...aziendaWhere(scope) } });
    if (!current) return 'missing';
    if (current.confermatoAt) return 'chiuso';
    if (Number.isNaN(baseDate.getTime()) || current.updatedAt.getTime() !== baseDate.getTime())
      return 'conflict';
    const impronta = improntaVerbale(current);
    if (impronta !== vista.impronta) return 'conflict';
    if (current.positivo === null) return 'incompleto';
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_FIRME})`;
    const firmaTecnicoHash = improntaFirma(dati.firmaTecnico);
    const firmaSupervisoreHash = improntaFirma(dati.firmaSupervisore);
    const hashes = [firmaTecnicoHash, firmaSupervisoreHash];
    const giaUsati = await firmeGiaUsate(tx, hashes);
    const ripetute = CAMPI_FIRMA.filter((_, i) => giaUsati.has(hashes[i]!));
    if (ripetute.length) return { ripetute };
    const confermatoAt = new Date();
    const firme = { ...dati, confermatoAt, confermatoById: actorId };
    const sigillo = sigilloVerbale(chiaveSigillo(), impronta, firme);
    const updated = await tx.verbale.updateMany({
      where: { id, aziendaId: current.aziendaId, confermatoAt: null, updatedAt: baseDate },
      data: { ...firme, impronta, sigillo, firmaTecnicoHash, firmaSupervisoreHash },
    });
    if (updated.count === 0) return 'conflict';
    await writeAudit(
      {
        actorId,
        action: 'VERBALE_CONFIRM',
        aziendaId: current.aziendaId,
        targetType: 'verbale',
        targetId: id,
        meta: { impronta },
      },
      tx,
    );
    return 'ok';
  });
}

/** Печатът на потвърден протокол — преди всяко показване и PDF; несъвпадение — събитие в лога. */
export function sigilloVerbaleIntatto(row: Parameters<typeof sigilloVerbaleValido>[1]): boolean {
  const ok = sigilloVerbaleValido(chiaveSigillo(), row);
  if (!ok) logger.warn({ event: 'verbale.sigillo', verbaleId: row.id }, 'seal check failed');
  return ok;
}
