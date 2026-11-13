import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { hmacCodiceFirma } from '../auth/chiavi.js';
import { prisma } from '../db.js';
import { MINUTE } from '../time.js';
import type { SessionUser } from '../types.js';
import { condizioniValide, versioneDaFirmare } from './versioni.js';

/** Колко важи кодът, колко грешни опита се допускат, колко често и колко пъти се праща нов. */
export const CODICE_MINUTI = 10;
export const MAX_TENTATIVI = 5;
export const ATTESA_NUOVO_CODICE_MS = MINUTE;
export const MAX_CODICI_ORA = 5;

const testo = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(2).max(max));

/**
 * Данните на фирмата, които ADMIN декларира при приемането (чл. 3.3 от условията): ако са грешни, отговаря
 * лично. Партида по ДДС — италианска (11 цифри, с или без „IT“) или от друга държава от ЕС (код + 2–13).
 */
export const dichiaratiSchema = z.object({
  ragioneSociale: testo(200),
  sede: testo(300).pipe(z.string().min(5)),
  partitaIva: z
    .string()
    .transform((v) => v.replace(/[\s.-]/g, '').toUpperCase())
    .pipe(z.string().regex(/^(?:IT)?[0-9]{11}$|^[A-Z]{2}[0-9A-Z]{2,13}$/)),
});
export type Dichiarati = z.output<typeof dichiaratiSchema>;

/** Само поредица от 6 цифри, без интервалите, които човек слага при преписване. */
export const codiceSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ''))
  .pipe(z.string().regex(/^[0-9]{6}$/));

/** ADMIN ли е човекът (прочетено от базата сега) на активна фирма с неприети условия в текущата версия. */
async function firmatarioDi(
  db: Prisma.TransactionClient | typeof prisma,
  user: SessionUser,
  aziendaId: string,
): Promise<{ name: string } | null> {
  const rows = await db.$queryRaw<Array<{ role: Role; name: string; versione: string | null }>>`
    SELECT m.role, a.name, a."condizioniVersione" AS versione
    FROM "Membership" m JOIN "Azienda" a ON a.id = m."aziendaId"
    WHERE m."userId" = ${user.id} AND m."aziendaId" = ${aziendaId} AND a."deactivatedAt" IS NULL
    FOR UPDATE OF a`;
  const row = rows[0];
  return row && row.role === 'ADMIN' && !condizioniValide(row.versione) ? { name: row.name } : null;
}

export type EsitoAvvio =
  | { ok: true; id: string; codice: string; email: string; scadeAt: Date }
  | { ok: false; motivo: 'ruolo' | 'attendi' | 'troppi' };

/**
 * Първата стъпка на подписа: нов код от 6 цифри (CSPRNG) към имейла на ADMIN — адресът, проверен с
 * поканата. Старите неизползвани опити падат; в базата е само HMAC, вързан за опита.
 */
export async function avviaFirma(
  user: SessionUser,
  aziendaId: string,
  dichiarati: Dichiarati,
): Promise<EsitoAvvio> {
  return prisma.$transaction(async (tx) => {
    if (!(await firmatarioDi(tx, user, aziendaId))) return { ok: false, motivo: 'ruolo' } as const;
    const ora = Date.now();
    const recenti = await tx.firmaCondizioni.findMany({
      where: { userId: user.id, inviatoAt: { gt: new Date(ora - 60 * MINUTE) } },
      select: { inviatoAt: true },
      orderBy: { inviatoAt: 'desc' },
    });
    const ultimo = recenti[0]?.inviatoAt.getTime() ?? 0;
    if (ora - ultimo < ATTESA_NUOVO_CODICE_MS) return { ok: false, motivo: 'attendi' } as const;
    if (recenti.length >= MAX_CODICI_ORA) return { ok: false, motivo: 'troppi' } as const;
    await tx.firmaCondizioni.updateMany({
      where: { userId: user.id, usataAt: null },
      data: { usataAt: new Date(ora) },
    });
    const id = randomBytes(12).toString('hex');
    const codice = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const scadeAt = new Date(ora + CODICE_MINUTI * MINUTE);
    await tx.firmaCondizioni.create({
      data: {
        id,
        userId: user.id,
        aziendaId,
        versione: versioneDaFirmare('CONDIZIONI'),
        dichiarati,
        codiceHmac: hmacCodiceFirma(id, codice),
        email: user.email,
        inviatoAt: new Date(ora),
        scadeAt,
      },
    });
    return { ok: true, id, codice, email: user.email, scadeAt } as const;
  });
}

/** Опитът, който чака кода: последният неизползван и неизтекъл на човека; null — няма. */
export function sfidaAperta(userId: string) {
  return prisma.firmaCondizioni.findFirst({
    where: { userId, usataAt: null, scadeAt: { gt: new Date() } },
    orderBy: { inviatoAt: 'desc' },
  });
}

export type Sfida = NonNullable<Awaited<ReturnType<typeof sfidaAperta>>>;

export type EsitoCodice =
  | { ok: true; sfida: Sfida; aziendaNome: string; verificatoAt: Date }
  | { ok: false; motivo: 'scaduto' | 'bloccato' | 'codice' | 'ruolo' };

/**
 * Проверява кода и „изгаря“ опита в същата транзакция, в която се пише приемането (`tx`): един код —
 * един подпис. Грешен код брои опит (след MAX_TENTATIVI — опитът пада и трябва нов код).
 */
export async function verificaCodice(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  codice: string,
): Promise<EsitoCodice> {
  // Редът на опита — заключен преди сравнението: паралелни заявки се редят и всяка вижда брояча на
  // предишната (иначе N едновременни опита минават за един).
  const aperta = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "FirmaCondizioni"
    WHERE "userId" = ${user.id} AND "usataAt" IS NULL AND "scadeAt" > now()
    ORDER BY "inviatoAt" DESC LIMIT 1
    FOR UPDATE`;
  const sfida = aperta[0]
    ? await tx.firmaCondizioni.findUnique({ where: { id: aperta[0].id } })
    : null;
  if (!sfida || sfida.usataAt) return { ok: false, motivo: 'scaduto' };
  if (sfida.tentativi >= MAX_TENTATIVI) return { ok: false, motivo: 'bloccato' };
  const atteso = Buffer.from(sfida.codiceHmac, 'hex');
  const dato = Buffer.from(hmacCodiceFirma(sfida.id, codice), 'hex');
  if (atteso.length !== dato.length || !timingSafeEqual(atteso, dato)) {
    await tx.firmaCondizioni.update({
      where: { id: sfida.id },
      data: {
        tentativi: { increment: 1 },
        ...(sfida.tentativi + 1 >= MAX_TENTATIVI ? { usataAt: new Date() } : {}),
      },
    });
    return { ok: false, motivo: 'codice' };
  }
  const firmatario = await firmatarioDi(tx, user, sfida.aziendaId);
  if (!firmatario) return { ok: false, motivo: 'ruolo' };
  const verificatoAt = new Date();
  const bruciata = await tx.firmaCondizioni.updateMany({
    where: { id: sfida.id, usataAt: null },
    data: { usataAt: verificatoAt },
  });
  if (bruciata.count !== 1) return { ok: false, motivo: 'scaduto' };
  return { ok: true, sfida, aziendaNome: firmatario.name, verificatoAt };
}
