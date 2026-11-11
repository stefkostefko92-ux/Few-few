import { prisma } from '../db.js';
import { daRegistrare } from './voci.js';

/**
 * Кога е излязла всяка новина (таблицата `Novita`). При първата нужда процесът записва новините, които
 * още нямат ред (`daRegistrare` — на нова инсталация в деня им, иначе сега: това е обновяването), и пази
 * всичко в паметта: редовете се сменят само тук, а един портал е един процес. Провал не се помни —
 * следващата страница опитва пак.
 */
let pubblicate: Promise<ReadonlyMap<string, Date>> | null = null;

async function carica(): Promise<ReadonlyMap<string, Date>> {
  const righe = await prisma.novita.findMany();
  const nuove = daRegistrare(new Set(righe.map((r) => r.id)), new Date());
  if (nuove.length === 0) return new Map(righe.map((r) => [r.id, r.pubblicataAt]));
  // Два процеса едновременно: вторият не пише нищо, а чете записаното от първия.
  await prisma.novita.createMany({ data: nuove, skipDuplicates: true });
  const tutte = await prisma.novita.findMany();
  return new Map(tutte.map((r) => [r.id, r.pubblicataAt]));
}

export function pubblicazioni(): Promise<ReadonlyMap<string, Date>> {
  pubblicate ??= carica().catch((error: unknown) => {
    pubblicate = null;
    throw error;
  });
  return pubblicate;
}

/**
 * „Ho capito“: новините до този момент са прочетени. Директен UPDATE — не е промяна на акаунта
 * (`updatedAt` остава), а времето е в UTC като всяка колона без часова зона.
 */
export async function segnaLette(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User" SET "novitaLetteAt" = (now() AT TIME ZONE 'UTC') WHERE id = ${userId}`;
}
