import { createHash } from 'node:crypto';
import { sigilloIntatto } from '../interventi/conferma.js';
import { prisma } from '../db.js';
import { CAMPI_ACCETTAZIONE, CAMPI_EMISSIONE, sigilloValido } from '../legale/sigillo.js';
import { sigilloVerbaleIntatto } from '../verbali/conferma.js';

/** Какво е написал човекът: „Rif.“ на изчисление (12 знака) или отпечатък/SHA-256 (64 знака). */
export type Codice = { tipo: 'rif'; valore: string } | { tipo: 'hash'; valore: string };

/**
 * Кодът от листа, както го препише човек — с интервали, тирета, малки букви — в каноничния вид: Rif.
 * „ABCD-EF01-2345“ (както е в базата) или 64 малки шестнайсетични знака. Друго — null.
 */
export function leggiCodice(raw: unknown): Codice | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const hex = raw.replace(/^\s*rif\.?/i, '').replace(/[\s\-–—:.]/g, '');
  if (/^[0-9a-f]{12}$/i.test(hex)) {
    const u = hex.toUpperCase();
    return { tipo: 'rif', valore: `${u.slice(0, 4)}-${u.slice(4, 8)}-${u.slice(8, 12)}` };
  }
  if (/^[0-9a-f]{64}$/i.test(hex)) return { tipo: 'hash', valore: hex.toLowerCase() };
  return null;
}

/** Едно намерено доказателство. `integro` — печатът му съвпада със съдържанието. */
export type Trovato =
  | {
      tipo: 'emissione';
      id: string;
      at: Date;
      calcolo: string;
      impronta: string;
      build: string;
      azienda: string;
      autore: string;
      /** По какво е намерено: Rif. или байтовете на самия PDF. */
      per: 'rif' | 'pdf';
      integro: boolean;
    }
  | {
      tipo: 'accettazione';
      id: string;
      at: Date;
      versione: string;
      azienda: string | null;
      autore: string;
      integro: boolean;
    }
  | {
      tipo: 'intervento' | 'verbale';
      id: string;
      at: Date | null;
      numero: number | null;
      azienda: string;
      integro: boolean;
    };

const MAX = 20;

async function emissioni(where: { impronta: string } | { pdfHash: string }, per: 'rif' | 'pdf') {
  const righe = await prisma.emissioneCalcolo.findMany({
    where,
    orderBy: { at: 'desc' },
    take: MAX,
  });
  return righe.map((r): Trovato => ({
    tipo: 'emissione',
    id: r.id,
    at: r.at,
    calcolo: r.calcolo,
    impronta: r.impronta,
    build: r.build,
    azienda: r.aziendaNome,
    autore: r.userNome,
    per,
    integro: sigilloValido(r, CAMPI_EMISSIONE),
  }));
}

/**
 * Доказателствата по 64-знаков код: изтеглен PDF с изчисление (SHA-256 на файла), копието на условията
 * (SHA-256 на PDF-а, пратен на администратора), подписан лист за интервенция или протокол (отпечатъкът
 * под подписите). Всяко — с проверката на печата си.
 */
async function perHash(hash: string): Promise<Trovato[]> {
  const [calcoli, copie, interventi, verbali] = await Promise.all([
    emissioni({ pdfHash: hash }, 'pdf'),
    prisma.accettazione.findMany({ where: { copiaHash: hash }, take: MAX }),
    prisma.intervento.findMany({
      where: { impronta: hash },
      include: { azienda: { select: { name: true } } },
      take: MAX,
    }),
    prisma.verbale.findMany({
      where: { impronta: hash },
      include: { azienda: { select: { name: true } } },
      take: MAX,
    }),
  ]);
  return [
    ...calcoli,
    ...copie.map((a): Trovato => ({
      tipo: 'accettazione',
      id: a.id,
      at: a.at,
      versione: a.versione,
      azienda: a.aziendaNome,
      autore: a.userNome,
      integro: sigilloValido(a, CAMPI_ACCETTAZIONE),
    })),
    ...interventi.map((i): Trovato => ({
      tipo: 'intervento',
      id: i.id,
      at: i.confermatoAt,
      numero: i.numero,
      azienda: i.azienda.name,
      integro: sigilloIntatto(i),
    })),
    ...verbali.map((v): Trovato => ({
      tipo: 'verbale',
      id: v.id,
      at: v.confermatoAt,
      numero: null,
      azienda: v.azienda.name,
      integro: sigilloVerbaleIntatto(v),
    })),
  ];
}

/** Търсене по кода, написан от човек. */
export async function verificaCodice(codice: Codice): Promise<Trovato[]> {
  return codice.tipo === 'rif'
    ? emissioni({ impronta: codice.valore }, 'rif')
    : perHash(codice.valore);
}

/** Търсене по самия файл: SHA-256 на байтовете му — същият PDF, до байт. */
export async function verificaFile(byte: Buffer): Promise<{ hash: string; trovati: Trovato[] }> {
  const hash = createHash('sha256').update(byte).digest('hex');
  return { hash, trovati: await perHash(hash) };
}
