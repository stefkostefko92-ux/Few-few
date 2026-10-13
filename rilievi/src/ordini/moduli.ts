import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Модулите на доставчиците — официалните им празни PDF-и (assets/moduli/) и картата на полетата им
 * (JSON до всеки PDF): кутийките и редовете на Pelazza в точки, имената на полетата във формуляра на
 * Montanari. Изходният PDF е самият оригинал с нашите данни върху него — затова PDF-ът е закрепен по
 * SHA-256: друга версия на модула значи други координати, и процесът отказва да тръгне.
 */

const ASSETS = new URL('../../assets/moduli/', import.meta.url);

/**
 * Откъде идва предварителната стойност на поле, което не е в никоя връзка (src/ordini/prefill.ts и
 * public/js/app.js). Данните на уредбата, които стоят на няколко места (спирки, врати, товар, въжета…),
 * са в src/ordini/collegati.ts — там се и сравняват.
 */
export const PREFILL_TOKENS = [
  'data',
  'rif',
  'azienda',
  'utente',
  'ruolo',
  'email',
  'operatoreMarca',
] as const;
export type PrefillToken = (typeof PREFILL_TOKENS)[number];

/** Отметка от огледа: „поле=СТОЙНОСТ“ (хидравличен асансьор → таблото „Idraulico“). */
const CHECK_PREFILL = /^tipoImpianto=[A-Z]+$/;

const num = z.number().finite();
const base = {
  key: z.string().regex(/^[a-z][A-Za-z0-9]{1,40}$/),
  label: z.string().min(1).max(120),
  /** На хартията полето няма свой етикет (стойност до отметка) — на екрана етикетът е скрит. */
  labelNascosta: z.literal(true).optional(),
};
const checkPrefill = z.string().regex(CHECK_PREFILL).optional();
const textPrefill = z.enum(PREFILL_TOKENS).optional();
const maxLength = z.number().int().min(1).max(600);

const overlayField = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('check'),
    prefill: checkPrefill,
    /** Вътрешността на кутийката: x0, y0 (от горе), x1, y1 — в точки. */
    box: z.tuple([num, num, num, num]),
  }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    /** Редът: от x0 до x1, върху линията на височина y (от горе). */
    line: z.tuple([num, num, num]),
  }),
  z.object({
    ...base,
    kind: z.literal('textarea'),
    prefill: textPrefill,
    maxLength,
    area: z.tuple([num, num, num, num]),
  }),
]);

const acroField = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('check'), prefill: checkPrefill, acro: z.string().min(1) }),
  z.object({
    ...base,
    kind: z.literal('text'),
    prefill: textPrefill,
    maxLength,
    acro: z.string().min(1),
  }),
  z.object({
    ...base,
    kind: z.literal('textarea'),
    prefill: textPrefill,
    maxLength,
    acro: z.string().min(1),
  }),
]);

function moduloSchema<F extends z.ZodTypeAny, T extends string>(field: F, tipo: T) {
  return z.object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    fornitore: z.string().min(1),
    titolo: z.string().min(1),
    fonte: z.string().url(),
    file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    tipo: z.literal(tipo),
    gruppi: z.array(
      z.object({
        titolo: z.string().min(1),
        righe: z.array(
          z.object({
            campi: z.array(field).min(1),
            /** Стрелката от хартията: след толкова полета от реда. */
            freccia: z.number().int().min(1).optional(),
          }),
        ),
      }),
    ),
  });
}

export type OverlayField = z.output<typeof overlayField>;
export type AcroField = z.output<typeof acroField>;
export type ModuloField = OverlayField | AcroField;
export type ModuloOverlay = z.output<
  ReturnType<typeof moduloSchema<typeof overlayField, 'overlay'>>
>;
export type ModuloAcro = z.output<ReturnType<typeof moduloSchema<typeof acroField, 'acroform'>>>;
export type Modulo = ModuloOverlay | ModuloAcro;

function load<S extends z.ZodTypeAny>(name: string, schema: S): z.output<S> {
  const map: z.output<S> = schema.parse(JSON.parse(readFileSync(new URL(name, ASSETS), 'utf8')));
  const keys = fieldsOf(map as Modulo).map((field) => field.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${name}: повтарящ се ключ на поле`);
  return map;
}

/** Полетата на модула в реда на документа. */
export function fieldsOf(modulo: Modulo): ModuloField[] {
  return modulo.gruppi.flatMap((g) => g.righe.flatMap((r): ModuloField[] => r.campi));
}

export const PELAZZA: ModuloOverlay = load(
  'pelazza-ordine-quadri-032026.json',
  moduloSchema(overlayField, 'overlay'),
);
export const MONTANARI: ModuloAcro = load(
  'montanari-richiesta-preventivo-argani-ita.json',
  moduloSchema(acroField, 'acroform'),
);

const bytes = new Map<string, Uint8Array>();

/** Празният официален PDF — проверен по SHA-256 (при старт, после от паметта). */
export function moduloPdf(modulo: Modulo): Uint8Array {
  const cached = bytes.get(modulo.id);
  if (cached) return cached;
  const data = readFileSync(new URL(modulo.file, ASSETS));
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== modulo.sha256) {
    throw new Error(`${modulo.file}: друга версия на модула (SHA-256 ${sha}) — картата не пасва`);
  }
  const copy = new Uint8Array(data);
  bytes.set(modulo.id, copy);
  return copy;
}

/** Проверка при старт: двата модула са на мястото си и са точно версията на картите. */
export function assertModuli(): void {
  for (const modulo of [PELAZZA, MONTANARI]) moduloPdf(modulo);
}
