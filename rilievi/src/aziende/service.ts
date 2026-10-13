import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import type { SessionUser } from '../types.js';
import type { Logo } from './logo.js';

/**
 * Фирмите. Създава ги и ги управлява само MASTER (маршрутите проверяват `aziende:manage`); тук е
 * записът и одитът. Фирма не се изтрива — деактивира се: хората ѝ спират да влизат, картите остават.
 */

const ID = /^[a-z0-9]{20,40}$/;

export function isAziendaId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

const SUMMARY = {
  id: true,
  name: true,
  logoType: true,
  logoWidth: true,
  logoHeight: true,
  logoUpdatedAt: true,
  deactivatedAt: true,
  createdAt: true,
} satisfies Prisma.AziendaSelect;

export type AziendaSummary = Prisma.AziendaGetPayload<{ select: typeof SUMMARY }>;

/** Всички фирми по име, с броя на хората и на живите карти. */
export function listAziende() {
  return prisma.azienda.findMany({
    orderBy: { name: 'asc' },
    select: {
      ...SUMMARY,
      _count: { select: { memberships: true, schede: { where: { deletedAt: null } } } },
    },
  });
}

/** Активните фирми — за избора във формите (покана, нова карта, филтър). */
export function activeAziende() {
  return prisma.azienda.findMany({
    where: { deactivatedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/** Всички фирми (и деактивираните) — за филтъра на MASTER в списъците. */
export function allAziendeNames() {
  return prisma.azienda.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}

export function getAzienda(id: string): Promise<AziendaSummary | null> {
  if (!isAziendaId(id)) return Promise.resolve(null);
  return prisma.azienda.findUnique({ where: { id }, select: SUMMARY });
}

/** Активна фирма по id — за покана и нова карта от MASTER. */
export async function activeAzienda(id: unknown): Promise<{ id: string; name: string } | null> {
  if (!isAziendaId(id)) return null;
  return prisma.azienda.findFirst({
    where: { id, deactivatedAt: null },
    select: { id: true, name: true },
  });
}

/** Байтовете на логото за показване и PDF. */
export async function aziendaLogo(id: string): Promise<{ data: Buffer; type: string } | null> {
  if (!isAziendaId(id)) return null;
  const row = await prisma.azienda.findUnique({
    where: { id },
    select: { logo: true, logoType: true },
  });
  if (!row?.logo || !row.logoType) return null;
  return { data: Buffer.from(row.logo), type: row.logoType };
}

function logoData(logo: Logo | null) {
  return logo
    ? {
        logo: new Uint8Array(logo.data),
        logoType: logo.type,
        logoWidth: logo.width,
        logoHeight: logo.height,
        logoUpdatedAt: new Date(),
      }
    : { logo: null, logoType: null, logoWidth: null, logoHeight: null, logoUpdatedAt: null };
}

/** Името е уникално без значение от главни/малки букви („Panev“ и „PANEV“ са една фирма). */
export async function nameTaken(
  name: string,
  exceptId?: string,
  db: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const found = await db.azienda.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export type SaveAziendaResult = { ok: true; id: string } | { ok: false; error: 'nameTaken' };

export async function createAzienda(
  actor: SessionUser,
  input: { name: string; logo: Logo | null },
): Promise<SaveAziendaResult> {
  if (await nameTaken(input.name)) return { ok: false, error: 'nameTaken' };
  try {
    const azienda = await prisma.$transaction((tx) => insertAzienda(tx, actor, input));
    return { ok: true, id: azienda.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'nameTaken' };
    throw error;
  }
}

/** Записът на нова фирма с одита ѝ — в транзакцията на извикващия (името е проверено от него). */
export async function insertAzienda(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  input: { name: string; logo: Logo | null },
): Promise<{ id: string }> {
  const created = await tx.azienda.create({
    data: { name: input.name, ...logoData(input.logo) },
    select: { id: true },
  });
  await writeAudit(
    {
      actorId: actor.id,
      action: 'AZIENDA_CREATE',
      aziendaId: created.id,
      targetType: 'azienda',
      targetId: created.id,
    },
    tx,
  );
  return created;
}

export async function renameAzienda(
  actor: SessionUser,
  id: string,
  name: string,
): Promise<SaveAziendaResult | null> {
  const current = await getAzienda(id);
  if (!current) return null;
  if (current.name === name) return { ok: true, id };
  if (await nameTaken(name, id)) return { ok: false, error: 'nameTaken' };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.azienda.update({ where: { id }, data: { name } });
      await writeAudit(
        {
          actorId: actor.id,
          action: 'AZIENDA_UPDATE',
          aziendaId: id,
          targetType: 'azienda',
          targetId: id,
        },
        tx,
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'nameTaken' };
    throw error;
  }
}

/** Ново лого (вече прекодирано) или null — махане на логото. */
export async function setAziendaLogo(
  actor: SessionUser,
  id: string,
  logo: Logo | null,
): Promise<boolean> {
  if (!(await getAzienda(id))) return false;
  await prisma.$transaction(async (tx) => {
    await tx.azienda.update({ where: { id }, data: logoData(logo) });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_LOGO',
        aziendaId: id,
        targetType: 'azienda',
        targetId: id,
        meta: { removed: logo === null },
      },
      tx,
    );
  });
  return true;
}

/**
 * Деактивирана фирма: хората ѝ не влизат и сесиите им падат веднага; поканите ѝ спират да важат
 * (проверява се при отварянето им). Картите остават — MASTER ги вижда и фирмата може да се върне.
 */
export async function setAziendaActive(
  actor: SessionUser,
  id: string,
  active: boolean,
): Promise<boolean> {
  const current = await getAzienda(id);
  if (!current) return false;
  if (active === (current.deactivatedAt === null)) return true;
  await prisma.$transaction(async (tx) => {
    await tx.azienda.update({ where: { id }, data: { deactivatedAt: active ? null : new Date() } });
    // Хората без друга активна фирма излизат веднага (resolveSession би ги спрял и сам); останалите
    // продължават в другите си фирми, без тази.
    if (!active) {
      await tx.session.deleteMany({
        where: {
          user: {
            master: false,
            memberships: { some: { aziendaId: id }, none: { azienda: { deactivatedAt: null } } },
          },
        },
      });
    }
    await writeAudit(
      {
        actorId: actor.id,
        action: active ? 'AZIENDA_REACTIVATE' : 'AZIENDA_DEACTIVATE',
        aziendaId: id,
        targetType: 'azienda',
        targetId: id,
      },
      tx,
    );
  });
  return true;
}
