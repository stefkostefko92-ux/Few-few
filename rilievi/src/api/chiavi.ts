import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeAudit } from '../audit.js';
import { hmacChiaveApi } from '../auth/chiavi.js';
import { prisma } from '../db.js';
import { DAY, MINUTE } from '../time.js';

/**
 * Ключовете за API само за четене (точка D2). Ключът е `rk_<префикс>_<тайна>`: префиксът (12 знака) намира реда,
 * тайната (32 случайни байта, base64url) се сверява с HMAC в постоянно време — в базата никога не стои ключът.
 * Ключът е на една фирма, изтича след година, отменя се по всяко време; до 10 живи на фирма. Създава и отменя
 * администраторът на фирмата (и MASTER), с одит без ключа.
 */

export const MAX_CHIAVI = 10;
export const DURATA_GIORNI = 365;
const FORMATO = /^rk_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$/;
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Нов ключ: каквото се показва веднъж, и каквото отива в базата. */
export function nuovaChiave(): { chiave: string; prefisso: string; hash: string } {
  const bytes = randomBytes(12);
  const prefisso = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  const segreto = randomBytes(32).toString('base64url');
  return { chiave: `rk_${prefisso}_${segreto}`, prefisso, hash: hmacChiaveApi(prefisso, segreto) };
}

/** Ключът от заглавката `Authorization: Bearer …`; null — не е ключ на този формат. */
export function chiaveDa(header: string | undefined): { prefisso: string; segreto: string } | null {
  const m = /^Bearer\s+(\S+)$/.exec(header ?? '');
  const f = m ? FORMATO.exec(m[1]!) : null;
  return f ? { prefisso: f[1]!, segreto: f[2]! } : null;
}

const uguali = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Фирмата на валиден ключ (жив, неизтекъл, фирмата — активна); null — няма достъп. */
export async function aziendaDellaChiave(
  header: string | undefined,
  now: Date = new Date(),
): Promise<{ chiaveId: string; aziendaId: string; prefisso: string } | null> {
  const parsed = chiaveDa(header);
  if (!parsed) return null;
  const row = await prisma.chiaveApi.findUnique({
    where: { prefisso: parsed.prefisso },
    select: {
      id: true,
      aziendaId: true,
      hash: true,
      scadeAt: true,
      revocataAt: true,
      usataAt: true,
      azienda: { select: { deactivatedAt: true } },
    },
  });
  // Сравнението минава и без ред (фиктивен отпечатък) — грешният префикс не се познава по времето.
  const atteso = row?.hash ?? '0'.repeat(64);
  const ok = uguali(hmacChiaveApi(parsed.prefisso, parsed.segreto), atteso);
  if (!row || !ok || row.revocataAt || row.scadeAt <= now || row.azienda.deactivatedAt) return null;
  // Последното ползване — най-много веднъж в минута (не на всяка заявка).
  if (!row.usataAt || now.getTime() - row.usataAt.getTime() > MINUTE)
    await prisma.chiaveApi.update({ where: { id: row.id }, data: { usataAt: now } });
  return { chiaveId: row.id, aziendaId: row.aziendaId, prefisso: parsed.prefisso };
}

export function chiaviDi(aziendaId: string) {
  return prisma.chiaveApi.findMany({
    where: { aziendaId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      nome: true,
      prefisso: true,
      createdAt: true,
      usataAt: true,
      scadeAt: true,
      revocataAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export type EsitoChiave = { esito: 'ok'; chiave: string } | { esito: 'piene' | 'missing' };

/** Нов ключ на фирмата; ключът се връща само тук — после го няма никъде. */
export async function creaChiave(
  actorId: string,
  aziendaId: string,
  nome: string,
): Promise<EsitoChiave> {
  const nuova = nuovaChiave();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const azienda = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Azienda" WHERE "id" = ${aziendaId} AND "deactivatedAt" IS NULL FOR UPDATE`;
    if (azienda.length === 0) return { esito: 'missing' } as const;
    const vive = await tx.chiaveApi.count({
      where: { aziendaId, revocataAt: null, scadeAt: { gt: now } },
    });
    if (vive >= MAX_CHIAVI) return { esito: 'piene' } as const;
    const row = await tx.chiaveApi.create({
      data: {
        aziendaId,
        nome,
        prefisso: nuova.prefisso,
        hash: nuova.hash,
        scadeAt: new Date(now.getTime() + DURATA_GIORNI * DAY),
        createdById: actorId,
      },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId,
        action: 'API_CHIAVE_CREATA',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { chiave: row.id },
      },
      tx,
    );
    return { esito: 'ok', chiave: nuova.chiave } as const;
  });
}

export async function revocaChiave(
  actorId: string,
  aziendaId: string,
  id: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.chiaveApi.updateMany({
      where: { id, aziendaId, revocataAt: null },
      data: { revocataAt: new Date() },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'API_CHIAVE_REVOCATA',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { chiave: id },
      },
      tx,
    );
    return true;
  });
}
