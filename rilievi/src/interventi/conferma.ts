import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { firmaDalForm, MAX_FIRMA_JSON, type Firma } from './firma.js';
import { improntaContenuto, improntaFirma, sigilloDi, sigilloValido } from './sigillo.js';

/**
 * „Firma e conferma“ (собственикът, 30 октомври 2026 — подписът е обвързан със съдържанието): техникът
 * и клиентът подписват на страницата, която показва окончателния лист само за четене и отпечатъка му.
 * Формата връща версията (`base`) и отпечатъка, които е показала; в транзакцията листът трябва да е
 * същият и по двете, иначе нищо не се пише и подписва се наново. Подписите, имената, отпечатъкът, печатът
 * и потвърждението влизат с ЕДИН UPDATE — подпис без потвърждение в базата няма (CHECK в миграцията).
 */

const NOME_MAX = 120;

export type CampoFirma = 'firmaTecnico' | 'firmaTecnicoNome' | 'firmaCliente' | 'firmaClienteNome';
export type ErroreFirma = 'mancante' | 'invalid' | 'tooLong' | 'uguale' | 'ripetuta';
export type ErroriConferma = Partial<Record<CampoFirma, ErroreFirma>>;

export interface DatiConferma {
  firmaTecnico: Firma;
  firmaTecnicoNome: string;
  firmaCliente: Firma;
  firmaClienteNome: string;
}

/** Името: един ред, без контролни знаци, задължително. */
function nome(raw: unknown): { ok: true; value: string } | { ok: false; error: ErroreFirma } {
  if (raw !== undefined && typeof raw !== 'string') return { ok: false, error: 'invalid' };
  const value = (raw ?? '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return { ok: false, error: 'mancante' };
  if (value.length > NOME_MAX) return { ok: false, error: 'tooLong' };
  return { ok: true, value };
}

function firma(raw: unknown): { ok: true; value: Firma } | { ok: false; error: ErroreFirma } {
  const parsed = firmaDalForm(raw);
  if (!parsed.ok) return { ok: false, error: 'invalid' };
  return parsed.firma ? { ok: true, value: parsed.firma } : { ok: false, error: 'mancante' };
}

/** Двата подписа и двете имена — всички грешки наведнъж. Един и същ подпис в двете полета — грешка. */
export function parseConferma(
  body: unknown,
): { ok: true; data: DatiConferma } | { ok: false; errors: ErroriConferma } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const tecnico = firma(raw.firmaTecnico);
  const cliente = firma(raw.firmaCliente);
  const tecnicoNome = nome(raw.firmaTecnicoNome);
  const clienteNome = nome(raw.firmaClienteNome);
  const errors: ErroriConferma = {};
  if (!tecnico.ok) errors.firmaTecnico = tecnico.error;
  if (!tecnicoNome.ok) errors.firmaTecnicoNome = tecnicoNome.error;
  if (!cliente.ok) errors.firmaCliente = cliente.error;
  else if (tecnico.ok && JSON.stringify(tecnico.value) === JSON.stringify(cliente.value))
    errors.firmaCliente = 'uguale';
  if (!clienteNome.ok) errors.firmaClienteNome = clienteNome.error;
  if (!tecnico.ok || !cliente.ok || !tecnicoNome.ok || !clienteNome.ok || errors.firmaCliente)
    return { ok: false, errors };
  return {
    ok: true,
    data: {
      firmaTecnico: tecnico.value,
      firmaTecnicoNome: tecnicoNome.value,
      firmaCliente: cliente.value,
      firmaClienteNome: clienteNome.value,
    },
  };
}

/** Пратеното за повторно показване при грешка (същата версия): само низове, с таваните на полетата. */
export function valoriFirmaDalBody(body: unknown): Record<CampoFirma, string> {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.length <= max ? value : '';
  return {
    firmaTecnico: text(raw.firmaTecnico, MAX_FIRMA_JSON),
    firmaTecnicoNome: text(raw.firmaTecnicoNome, NOME_MAX * 2),
    firmaCliente: text(raw.firmaCliente, MAX_FIRMA_JSON),
    firmaClienteNome: text(raw.firmaClienteNome, NOME_MAX * 2),
  };
}

let chiave: Buffer | null = null;
/** INTERVENTI_SEAL_KEY като байтове (config.ts го е проверил: 32 байта в hex). */
export const chiaveSigillo = (): Buffer =>
  (chiave ??= Buffer.from(config().INTERVENTI_SEAL_KEY, 'hex'));

export type EsitoConferma =
  'ok' | 'conflict' | 'chiuso' | 'missing' | { ripetute: Array<'firmaTecnico' | 'firmaCliente'> };

/** Ключът на заключването, което реди потвържденията — проверката за повторен подпис е за всички листове. */
const LOCK_FIRME = 0x52_49_4c_46; // „RILF“

/**
 * Потвърждението. `base` и `impronta` са каквото страницата за подписа е показала: различна версия или
 * различен отпечатък — „conflict“, нищо не се пише. Условията са и в самия UPDATE (два клика, запис
 * между прочитането и записа). Подпис, чиито щрихи вече стоят на друг лист (на която и да е фирма, в
 * което и да е от двете полета), се отказва: копиран е от страницата, PDF-а или прихванат, не е положен
 * тук. Потвържденията се редят със заключване в транзакцията — два листа с едни и същи щрихи
 * едновременно не минават и двата.
 */
export async function confermaIntervento(
  scope: Scope,
  id: string,
  vista: { base: string; impronta: string },
  dati: DatiConferma,
  actorId: string,
): Promise<EsitoConferma> {
  const baseDate = new Date(vista.base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.intervento.findFirst({ where: { id, ...aziendaWhere(scope) } });
    if (!current) return 'missing';
    if (current.confermatoAt) return 'chiuso';
    if (Number.isNaN(baseDate.getTime()) || current.updatedAt.getTime() !== baseDate.getTime())
      return 'conflict';
    const impronta = improntaContenuto(current);
    if (impronta !== vista.impronta) return 'conflict';
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_FIRME})`;
    const firmaTecnicoHash = improntaFirma(dati.firmaTecnico);
    const firmaClienteHash = improntaFirma(dati.firmaCliente);
    const hashes = [firmaTecnicoHash, firmaClienteHash];
    const usate = await tx.intervento.findMany({
      where: {
        OR: [{ firmaTecnicoHash: { in: hashes } }, { firmaClienteHash: { in: hashes } }],
      },
      select: { firmaTecnicoHash: true, firmaClienteHash: true },
    });
    const giaUsati = new Set(usate.flatMap((r) => [r.firmaTecnicoHash, r.firmaClienteHash]));
    const ripetute = (['firmaTecnico', 'firmaCliente'] as const).filter((campo, i) =>
      giaUsati.has(hashes[i]!),
    );
    if (ripetute.length) return { ripetute };
    const confermatoAt = new Date();
    const firme = { ...dati, confermatoAt, confermatoById: actorId };
    const sigillo = sigilloDi(chiaveSigillo(), impronta, firme);
    const updated = await tx.intervento.updateMany({
      where: { id, aziendaId: current.aziendaId, confermatoAt: null, updatedAt: baseDate },
      data: { ...firme, impronta, sigillo, firmaTecnicoHash, firmaClienteHash },
    });
    if (updated.count === 0) return 'conflict';
    await writeAudit(
      {
        actorId,
        action: 'INTERVENTO_CONFIRM',
        aziendaId: current.aziendaId,
        targetType: 'intervento',
        targetId: id,
        meta: { numero: current.numero, impronta },
      },
      tx,
    );
    return 'ok';
  });
}

/**
 * Печатът на потвърден лист — преди всяко показване, PDF и имейл. Несъвпадението се пише в лога като
 * събитие за сигурност (само id-то, без съдържание): някой е пипал листа след подписа.
 */
export function sigilloIntatto(row: Parameters<typeof sigilloValido>[1]): boolean {
  const ok = sigilloValido(chiaveSigillo(), row);
  if (!ok) logger.warn({ event: 'intervento.sigillo', interventoId: row.id }, 'seal check failed');
  return ok;
}
