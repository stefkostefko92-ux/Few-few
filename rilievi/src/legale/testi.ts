import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { VERSIONE, type TipoTesto } from './versioni.js';

const ROOT = join(import.meta.dirname, '..', '..');

const articoloSchema = z
  .object({
    numero: z.string().regex(/^[0-9A-Z]{1,4}(\.[0-9]{1,2})?$/),
    titolo: z.string().min(1).max(120),
    paragrafi: z.array(z.string().min(1).max(4000)).min(1),
  })
  .strict();

/**
 * Един правен текст — файл `legale/<вид>-<версия>.json`. Редът на ключовете тук е и редът в хеша
 * (zod връща обекта в реда на схемата): форматирането на файла не сменя хеша, думите — да.
 */
const testoSchema = z
  .object({
    tipo: z.enum(['CONDIZIONI', 'REGOLE']),
    versione: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    titolo: z.string().min(1).max(160),
    premessa: z.array(z.string().min(1).max(4000)),
    articoli: z.array(articoloSchema).min(1),
    allegati: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z]{1,20}$/),
          titolo: z.string().min(1).max(160),
          articoli: z.array(articoloSchema).min(1),
        })
        .strict(),
    ),
    /**
     * Клаузите за специалното одобрение (чл. 1341–1342 c.c.): номер на член или на точка („17.2“) от
     * `articoli` и описанието им, както е в члена за одобрението.
     */
    clausoleSpecifiche: z.array(
      z
        .object({
          numero: z.string().regex(/^[0-9]{1,2}(\.[0-9]{1,2})?$/),
          descrizione: z.string().min(1).max(300),
        })
        .strict(),
    ),
  })
  .strict();

export type TestoLegaleDoc = z.infer<typeof testoSchema>;
export type Articolo = z.infer<typeof articoloSchema>;

const cache = new Map<string, TestoLegaleDoc>();

/** Текстът на `tipo` във `versione` (по подразбиране — текущата); хвърля, ако файлът липсва или е счупен. */
export function leggiTesto(tipo: TipoTesto, versione: string = VERSIONE[tipo]): TestoLegaleDoc {
  const chiave = `${tipo}:${versione}`;
  const cached = cache.get(chiave);
  if (cached) return cached;
  const file = join(ROOT, 'legale', `${tipo.toLowerCase()}-${versione}.json`);
  const doc = testoSchema.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  if (doc.tipo !== tipo || doc.versione !== versione)
    throw new Error(`legale/${tipo.toLowerCase()}-${versione}.json: вид или версия не съвпадат`);
  cache.set(chiave, doc);
  return doc;
}

/**
 * SHA-256 (hex) на текста, както е записан в `TestoLegale.testo` и отпечатан в копието (`testoPiano`):
 * всеки може да го пресметне от самия текст, без репото.
 */
export function hashTesto(doc: TestoLegaleDoc): string {
  return createHash('sha256').update(testoPiano(doc), 'utf8').digest('hex');
}

/** Членът по номер (и в приложенията); null — няма такъв. */
export function articoloDi(doc: TestoLegaleDoc, numero: string): Articolo | null {
  for (const articolo of doc.articoli) if (articolo.numero === numero) return articolo;
  for (const allegato of doc.allegati)
    for (const articolo of allegato.articoli) if (articolo.numero === numero) return articolo;
  return null;
}

export interface ClausolaSpecifica {
  numero: string;
  descrizione: string;
  /** Текстът ѝ за разгъване: целият член или само точката („17.2 …“). */
  paragrafi: string[];
}

/** Клаузите за специалното одобрение с текста им; хвърля, ако клауза сочи несъществуващ член или точка. */
export function clausoleSpecifiche(doc: TestoLegaleDoc): ClausolaSpecifica[] {
  return doc.clausoleSpecifiche.map(({ numero, descrizione }) => {
    const [base = '', punto] = numero.split('.');
    const articolo = articoloDi(doc, base);
    if (!articolo) throw new Error(`clausola specifica ${numero}: няма такъв член`);
    const paragrafi = punto
      ? articolo.paragrafi.filter((p) => p.startsWith(`${numero} `))
      : articolo.paragrafi;
    if (paragrafi.length === 0) throw new Error(`clausola specifica ${numero}: няма такава точка`);
    return { numero, descrizione, paragrafi };
  });
}

/** Целият текст като обикновен текст — за базата (`TestoLegale.testo`) и за писмото с копието. */
export function testoPiano(doc: TestoLegaleDoc): string {
  const articoli = (list: readonly Articolo[]): string[] =>
    list.flatMap((a) => [`Art. ${a.numero} — ${a.titolo}`, ...a.paragrafi, '']);
  return [
    doc.titolo,
    `Versione ${doc.versione}`,
    '',
    ...doc.premessa,
    '',
    ...articoli(doc.articoli),
    ...doc.allegati.flatMap((allegato) => [allegato.titolo, '', ...articoli(allegato.articoli)]),
  ]
    .join('\n')
    .trimEnd();
}
