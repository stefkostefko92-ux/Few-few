import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { REQUEST_RETENTION_DAYS } from '../requests/service.js';
import { ANNI_CONSERVAZIONE } from './versioni.js';

/**
 * Регистърът на дейностите по обработване (чл. 30 GDPR; собственикът, 12 ноември 2026 — точка A6): като
 * обработващ (чл. 30(2)) и като администратор (чл. 30(1)). Текстът е файл в `legale/registri/` (на италиански, за
 * органа); сроковете идват от кода (`{auditGiorni}`, `{richiesteGiorni}`, `{anni}`), за да не се разминат.
 * Администраторите (фирмите-клиенти) — живо от базата, на страницата `/master/registri`.
 */
const riga = z
  .object({
    id: z.string().regex(/^[A-Z]\d{1,2}$/),
    nome: z.string().min(1),
    dati: z.string().min(1),
    interessati: z.string().min(1),
    sub: z.string().min(1).optional(),
    base: z.string().min(1).optional(),
    conservazione: z.string().min(1),
  })
  .strict();

const schema = z
  .object({
    versione: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revisione: z.string().min(1),
    rappresentante: z.string().min(1),
    rpd: z.string().min(1),
    responsabile: z
      .object({
        titolo: z.string().min(1),
        trattamenti: z.array(riga).min(1),
        trasferimenti: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    titolare: z.object({ titolo: z.string().min(1), trattamenti: z.array(riga).min(1) }).strict(),
    subResponsabili: z.array(
      z
        .object({
          nome: z.string().min(1),
          sede: z.string().min(1),
          attivita: z.string().min(1),
          accordo: z.string().min(1),
        })
        .strict(),
    ),
    misure: z.string().min(1),
  })
  .strict();

export type RegistroTrattamenti = z.infer<typeof schema>;

let cache: RegistroTrattamenti | null = null;

/** Регистърът със сроковете от кода; хвърля, ако файлът е счупен (тестът го пази). */
export function registroTrattamenti(): RegistroTrattamenti {
  if (cache) return cache;
  const raw = readFileSync(
    join(import.meta.dirname, '..', '..', 'legale', 'registri', 'trattamenti.json'),
    'utf8',
  );
  const valori: Record<string, string> = {
    auditGiorni: String(config().AUDIT_RETENTION_DAYS),
    richiesteGiorni: String(REQUEST_RETENTION_DAYS),
    anni: String(ANNI_CONSERVAZIONE),
  };
  const testo = raw.replace(/\{(\w+)\}/g, (m, k: string) => valori[k] ?? m);
  cache = schema.parse(JSON.parse(testo));
  return cache;
}
