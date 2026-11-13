import { z } from 'zod';
import { pivaDa } from '../preventivi/form.js';
import { ERROR_CODES, textParser, type FieldErrorCode } from '../schede/field-parsers.js';
import { normalizeSearch } from '../schede/search.js';

/**
 * Профилът на клиент на фирмата (собственикът, 13 ноември 2026 — „да регистрират клиентите си с техни
 * профили и да не трябва да ги пишат всеки път когато правят Preventivi“): име (задължително) и по избор
 * адрес, P. IVA или данъчен код (същото правило като в офертата), имейл, телефон, лице за контакт и бележка.
 * Всичко от външния свят минава оттук (zod). Без база — тества се сам.
 */

export const MAX_CLIENTE = {
  nome: 200,
  indirizzo: 300,
  piva: 20,
  email: 254,
  telefono: 40,
  referente: 120,
  note: 2000,
} as const;

export interface ClienteData {
  nome: string;
  indirizzo: string | null;
  piva: string | null;
  email: string | null;
  telefono: string | null;
  referente: string | null;
  note: string | null;
}
export const CAMPI_CLIENTE = [
  'nome',
  'indirizzo',
  'piva',
  'email',
  'telefono',
  'referente',
  'note',
] as const satisfies ReadonlyArray<keyof ClienteData>;
export type ErroriCliente = Partial<Record<keyof ClienteData, FieldErrorCode>>;

const testo = (max: number, kind: 'text' | 'textarea' = 'text') =>
  textParser({ kind, maxLength: max });

const schema = z.object({
  nome: testo(MAX_CLIENTE.nome),
  indirizzo: testo(MAX_CLIENTE.indirizzo),
  telefono: testo(MAX_CLIENTE.telefono),
  referente: testo(MAX_CLIENTE.referente),
  note: testo(MAX_CLIENTE.note, 'textarea'),
});
const CHIAVI = Object.keys(schema.shape) as Array<keyof typeof schema.shape>;
const emailSchema = z.string().trim().max(MAX_CLIENTE.email).email();

/** Телефон: цифри (поне 5) с „+“ отпред и обичайните разделители — без букви. */
const TELEFONO = /^\+?[\d\s()./-]+$/;
const cifre = (value: string): string => value.replace(/\D/g, '');

const vuoto = (value: unknown): boolean =>
  value === undefined || (typeof value === 'string' && value.trim() === '');

export function parseCliente(
  body: unknown,
): { ok: true; data: ClienteData } | { ok: false; errors: ErroriCliente } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: ErroriCliente = {};
  const parsed = schema.safeParse(Object.fromEntries(CHIAVI.map((key) => [key, raw[key]])));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'nome') as keyof ClienteData;
      errors[key] ??= (
        ERROR_CODES.has(issue.message) ? issue.message : 'invalid'
      ) as FieldErrorCode;
    }
  } else {
    if (!parsed.data.nome) errors.nome = 'required';
    const telefono = parsed.data.telefono;
    if (telefono && (!TELEFONO.test(telefono) || cifre(telefono).length < 5))
      errors.telefono = 'invalid';
  }
  const piva = pivaDa(raw.piva);
  if (!piva.ok) errors.piva = 'invalid';
  let email: string | null = null;
  if (!vuoto(raw.email)) {
    const letta = emailSchema.safeParse(raw.email);
    if (letta.success) email = letta.data.toLowerCase();
    else errors.email = 'invalid';
  }
  if (Object.keys(errors).length > 0 || !parsed.success || !piva.ok) return { ok: false, errors };
  return {
    ok: true,
    data: {
      nome: parsed.data.nome!,
      indirizzo: parsed.data.indirizzo,
      piva: piva.value,
      email,
      telefono: parsed.data.telefono,
      referente: parsed.data.referente,
      note: parsed.data.note,
    },
  };
}

/** Профилът → стойностите на формата (празното не се пише). */
export function valoriCliente(cliente: ClienteData | null): Record<string, string> {
  if (!cliente) return {};
  return Object.fromEntries(
    CAMPI_CLIENTE.filter((key) => cliente[key] !== null).map((key) => [key, cliente[key]!]),
  );
}

/** Пратеното от формата, както е написано — за връщането ѝ с грешките. */
export function valoriDalBody(body: unknown): Record<string, string> {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return Object.fromEntries(
    CAMPI_CLIENTE.map((key) => [
      key,
      typeof raw[key] === 'string' ? (raw[key] as string).slice(0, MAX_CLIENTE[key] + 100) : '',
    ]),
  );
}

/**
 * Каквото търсенето намира: името, адресът, P. IVA, имейлът, телефонът (и само цифрите му) и лицето за
 * контакт. Бележката не се търси — тя е за клиента, не начин да бъде намерен.
 */
export function searchTextCliente(data: ClienteData): string {
  return [
    data.nome,
    data.indirizzo ?? '',
    data.piva ?? '',
    data.email ?? '',
    data.telefono ?? '',
    data.telefono ? cifre(data.telefono) : '',
    data.referente ?? '',
  ]
    .map((part) => normalizeSearch(part))
    .filter(Boolean)
    .join(' ');
}

/** Клиентът от регистъра → полетата за клиента във формата на офертата. */
export function valoriPreventivoDa(
  cliente: Pick<ClienteData, 'nome' | 'indirizzo' | 'piva' | 'email'> & { id: string },
): Record<string, string> {
  return {
    clienteId: cliente.id,
    cliente: cliente.nome,
    ...(cliente.indirizzo ? { clienteIndirizzo: cliente.indirizzo } : {}),
    ...(cliente.piva ? { clientePiva: cliente.piva } : {}),
    ...(cliente.email ? { clienteEmail: cliente.email } : {}),
  };
}

/** Клиентът, написан в оферта → профил за регистъра (телефон и лице за контакт офертата няма). */
export function clienteDaPreventivo(preventivo: {
  cliente: string;
  clienteIndirizzo: string | null;
  clientePiva: string | null;
  clienteEmail: string | null;
}): ClienteData {
  return {
    nome: preventivo.cliente,
    indirizzo: preventivo.clienteIndirizzo,
    piva: preventivo.clientePiva,
    email: preventivo.clienteEmail,
    telefono: null,
    referente: null,
    note: null,
  };
}
