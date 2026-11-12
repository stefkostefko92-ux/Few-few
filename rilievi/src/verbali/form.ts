import { z } from 'zod';
import {
  dateParser,
  ERROR_CODES,
  textParser,
  yesNoParser,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from '../schede/field-parsers.js';
import { dayFromDate } from '../time.js';
import { valoriVerbale, VOCI_VERBALE, vociDalForm, type ValoriVerbale } from './voci.js';

/**
 * Формата на черновата на протокола: главата (дата, адрес, „N° buono“), редовете по раздели (voci.ts) и
 * „Verbale positivo“ SÌ/NO. Подписите и имената не са тук — слагат се само с потвърждението (firma.ts на
 * протокола). Всичко от външния свят минава оттук (zod); грешките са кодовете на картата
 * (`scheda.error.<код>`).
 */
export const MAX_INDIRIZZO = 200;
export const MAX_BUONO = 60;

const headSchema = z.object({
  data: dateParser(),
  indirizzo: textParser({ kind: 'text', maxLength: MAX_INDIRIZZO }),
  buono: textParser({ kind: 'text', maxLength: MAX_BUONO }),
  positivo: yesNoParser(),
});

export interface VerbaleData extends z.infer<typeof headSchema> {
  voci: ValoriVerbale;
}

const HEAD_KEYS = Object.keys(headSchema.shape) as Array<keyof typeof headSchema.shape>;

export function parseVerbale(
  body: unknown,
): { ok: true; data: VerbaleData } | { ok: false; errors: FieldErrors } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: FieldErrors = {};
  const head = headSchema.safeParse(Object.fromEntries(HEAD_KEYS.map((key) => [key, raw[key]])));
  if (!head.success) {
    for (const issue of head.error.issues) {
      const key = String(issue.path[0] ?? 'data');
      if (!errors[key])
        errors[key] = (
          ERROR_CODES.has(issue.message) ? issue.message : 'invalid'
        ) as FieldErrorCode;
    }
  }
  const voci = vociDalForm(raw);
  if (!voci.ok) Object.assign(errors, voci.errors);
  if (!head.success || !voci.ok) return { ok: false, errors };
  return { ok: true, data: { ...head.data, voci: voci.voci } };
}

/** Записаната чернова във вида на формата (за „Modifica“). */
export function formValuesFromVerbale(row: {
  data: Date;
  indirizzo: string | null;
  buono: string | null;
  voci: unknown;
  positivo: boolean | null;
}): FormValues {
  const out: FormValues = {
    data: dayFromDate(row.data),
    indirizzo: row.indirizzo ?? '',
    buono: row.buono ?? '',
    positivo: row.positivo === null ? '' : row.positivo ? 'si' : 'no',
  };
  const voci = valoriVerbale(row.voci);
  for (const voce of VOCI_VERBALE) {
    out[`t-${voce.key}`] = voci[voce.key]?.t ?? '';
    if (voce.certificato) out[`c-${voce.key}`] = voci[voce.key]?.c ?? '';
  }
  return out;
}

/** Пратеното от формата за повторно показване при грешка: само низове, само имената на формата. */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 2000) : '');
  const out: FormValues = {};
  for (const key of [...HEAD_KEYS, 'azienda', 'scheda']) out[key] = text(raw[key]);
  for (const voce of VOCI_VERBALE) {
    out[`t-${voce.key}`] = text(raw[`t-${voce.key}`]);
    if (voce.certificato) out[`c-${voce.key}`] = text(raw[`c-${voce.key}`]);
  }
  return out;
}

/**
 * Новият протокол от картата (собственикът, 5 ноември 2026): от картата идват само адресът и „N° buono“
 * (работната поръчка на огледа), датата е днешната — всичко друго пише и избира човекът.
 */
export function valoriDaScheda(
  scheda: { indirizzo: string | null; buonoLavoro: string | null },
  oggi: string,
): FormValues {
  return { data: oggi, indirizzo: scheda.indirizzo ?? '', buono: scheda.buonoLavoro ?? '' };
}
