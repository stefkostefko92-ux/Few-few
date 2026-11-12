import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import {
  CAPACITA_CONFIGURABILI,
  chiudi,
  predefiniti,
  RUOLI_AZIENDA,
  RUOLI_CONFIGURABILI,
  type CapacitaConfigurabile,
  type NomiRuoli,
  type PermessiRuoli,
} from '../auth/permessi.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';

/**
 * Имената и правата на ролите на фирмата от настройките (`aziende:settings` — администраторът ѝ и
 * MASTER). Пазят се само разликите от подразбиране: роля с правата по подразбиране не се записва, име
 * като това от речника — също; така промяна в йерархията по-късно стига и до фирмите, които не са я
 * пипали. Одитът е в същата транзакция и казва кои роли са сменени, не самите имена.
 */

export type ErroriRuoli = Partial<Record<string, 'tooLong' | 'duplicato' | 'invalid'>>;

const MAX_NOME = 40;

const pulito = (value: string): string =>
  value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Формата: `nome-<РОЛЯ>` (празно — името по подразбиране) и `perm-<РОЛЯ>` (отметките, повтарящ се
 * ключ). Масив на мястото на име или непозната способност е подправка — `invalid`. Две роли с едно и
 * също име (без значение главни/малки, и с имената по подразбиране) — `duplicato`.
 */
export function parseRuoli(
  body: Record<string, unknown>,
  predefinito: (role: (typeof RUOLI_AZIENDA)[number]) => string,
):
  | { ok: true; nomi: NomiRuoli; permessi: PermessiRuoli }
  | { ok: false; errors: ErroriRuoli; valori: Record<string, string | string[]> } {
  const errors: ErroriRuoli = {};
  const valori: Record<string, string | string[]> = {};
  const nomi: NomiRuoli = {};
  const visti = new Map<string, string>();
  for (const role of RUOLI_AZIENDA) {
    const raw = body[`nome-${role}`];
    if (raw !== undefined && typeof raw !== 'string') {
      errors[`nome-${role}`] = 'invalid';
      continue;
    }
    const value = pulito(raw ?? '');
    valori[`nome-${role}`] = value.slice(0, 200);
    if (value.length > MAX_NOME) {
      errors[`nome-${role}`] = 'tooLong';
      continue;
    }
    const effettivo = value || predefinito(role);
    const chiave = effettivo.toLocaleLowerCase('it-IT');
    if (visti.has(chiave)) errors[`nome-${role}`] = 'duplicato';
    visti.set(chiave, role);
    if (value && value !== predefinito(role)) nomi[role] = value;
  }
  const permessi: PermessiRuoli = {};
  for (const role of RUOLI_CONFIGURABILI) {
    const raw = body[`perm-${role}`];
    const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    valori[`perm-${role}`] = list.filter((v): v is string => typeof v === 'string');
    if (
      !list.every(
        (v) => typeof v === 'string' && (CAPACITA_CONFIGURABILI as readonly string[]).includes(v),
      )
    ) {
      errors[`perm-${role}`] = 'invalid';
      continue;
    }
    const scelti = chiudi(list as CapacitaConfigurabile[]);
    const base = predefiniti(role);
    if (scelti.length !== base.length || scelti.some((c, i) => c !== base[i]))
      permessi[role] = scelti;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors, valori };
  return { ok: true, nomi, permessi };
}

/** Записва имената и правата; false — фирмата я няма. */
export async function setRuoli(
  actor: SessionUser,
  aziendaId: string,
  nomi: NomiRuoli,
  permessi: PermessiRuoli,
): Promise<boolean> {
  const vuoto = (value: object) => Object.keys(value).length === 0;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: {
        nomiRuoli: vuoto(nomi) ? Prisma.DbNull : (nomi as Prisma.InputJsonObject),
        permessiRuoli: vuoto(permessi)
          ? Prisma.DbNull
          : (permessi as unknown as Prisma.InputJsonObject),
      },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_RUOLI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { nomi: Object.keys(nomi), permessi: Object.keys(permessi) },
      },
      tx,
    );
    return true;
  });
}
