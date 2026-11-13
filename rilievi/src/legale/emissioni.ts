import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { CAMPI_EMISSIONE, sigilloDi, taglia } from './sigillo.js';
import { ANNI_CONSERVAZIONE } from './versioni.js';

/** Един изтеглен PDF с изчисление — какво е въведено, какво е отпечатано, кой, с кой софтуер. */
export interface Emissione {
  calcolo: 'argano' | 'limitatore';
  /** Отпечатъкът „Rif.“ от листа (src/build.ts). */
  impronta: string;
  build: string;
  dati: unknown;
  /** Редовете на резултата, както са отпечатани. */
  risultato: unknown;
  calcoloId: string | null;
  schedaId: string | null;
  azienda: { id: string; name: string };
  user: { id: string; name: string; email: string };
  /** Байтовете на PDF-а, както тръгват — пази се само SHA-256 от тях. */
  pdf: Buffer;
}

/** До кога се пази доказателство от момента `at`: ANNI_CONSERVAZIONE календарни години. */
export function conservaFinoDa(at: Date): Date {
  const fino = new Date(at);
  fino.setUTCFullYear(fino.getUTCFullYear() + ANNI_CONSERVAZIONE);
  return fino;
}

/** Само чист JSON (без Date, undefined, класове) — така, както ще се прочете след години. */
const comeJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value ?? null) as string) as Prisma.InputJsonValue;

/**
 * Записва изтеглянето ПРЕДИ PDF-ът да тръгне (собственикът, 10 ноември 2026 — „legalmente coperti e
 * minimamente esposti“): без запис няма PDF — грешката стига до потребителя като 500, листът не излиза.
 * Редът няма връзки и надживява изчислението, картата и фирмата (чл. 17, ал. 3, б. „e“ GDPR).
 */
export async function registraEmissione(e: Emissione): Promise<void> {
  const at = new Date();
  const campi = {
    at,
    calcolo: e.calcolo,
    impronta: e.impronta,
    build: e.build,
    pdfHash: createHash('sha256').update(e.pdf).digest('hex'),
    dati: comeJson(e.dati),
    risultato: comeJson(e.risultato),
    calcoloId: e.calcoloId,
    schedaId: e.schedaId,
    aziendaId: e.azienda.id,
    aziendaNome: taglia(e.azienda.name, 120),
    userId: e.user.id,
    userNome: taglia(e.user.name, 120),
    userEmail: taglia(e.user.email, 254),
  };
  await prisma.emissioneCalcolo.create({
    data: {
      ...campi,
      sigillo: sigilloDi(campi, CAMPI_EMISSIONE),
      conservaFino: conservaFinoDa(at),
    },
  });
}

/**
 * Доказателствата след срока им — изтрити (поддръжката, веднъж на час); колко. Приемане на фирма, която
 * още съществува, не се трие: срокът на приеманията тече от края на договора (чл. 19.2 от условията) —
 * изтриването на фирмата го мести (aziende/eliminazione.ts). Чакащите кодове — ден след изтичането им.
 */
export async function pulisciProve(now: number): Promise<number> {
  const limite = new Date(now);
  const emissioni = await prisma.emissioneCalcolo.deleteMany({
    where: { conservaFino: { lt: limite } },
  });
  const accettazioni = await prisma.$executeRaw`
    DELETE FROM "Accettazione" a
    WHERE a."conservaFino" < ${limite}
      AND (a."aziendaId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Azienda" z WHERE z.id = a."aziendaId"))`;
  const firme = await prisma.firmaCondizioni.deleteMany({
    where: { scadeAt: { lt: new Date(now - 24 * 3_600_000) } },
  });
  // Приетите оферти (#31) — като приеманията; плащането им си отива с тях (данните на плана, privacy).
  const offerte = await prisma.$executeRaw`
    WITH via AS (
      DELETE FROM "AccettazioneOfferta" o
      WHERE o."conservaFino" < ${limite}
        AND (o."aziendaId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Azienda" z WHERE z.id = o."aziendaId"))
      RETURNING o."pagamentoId"
    )
    DELETE FROM "Pagamento" p WHERE p.id IN (SELECT "pagamentoId" FROM via)`;
  return emissioni.count + accettazioni + firme.count + offerte;
}
