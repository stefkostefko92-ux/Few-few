import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { MINUTE } from '../time.js';
import { cifraStatoOidc, decifraStatoOidc } from './chiavi.js';

/**
 * Състоянието на един вход или свързване с доставчика на самоличност (D1): `state` (срещу подменен отговор и
 * CSRF при входа), `nonce` (токенът е за ТАЗИ заявка) и PKCE verifier (S256, RFC 7636 — откраднатият код не
 * стига) пътуват шифровани в бисквитка на браузъра, който е започнал, 10 минути. Свързването носи и акаунта
 * и сесията, които са го започнали — друга сесия в същия браузър не го довършва.
 */
export const STATO_MS = 10 * MINUTE;

export type Fornitore = 'microsoft' | 'google';
export const FORNITORI: readonly Fornitore[] = ['microsoft', 'google'];
export const isFornitore = (v: unknown): v is Fornitore =>
  typeof v === 'string' && (FORNITORI as readonly string[]).includes(v);

export type Scopo = 'accesso' | 'collega';

export interface StatoOidc {
  fornitore: Fornitore;
  scopo: Scopo;
  next: string;
  stato: string;
  nonce: string;
  verifier: string;
  scade: number;
  uid?: string;
  sid?: string;
}

/** 32 случайни байта в base64url (43 знака) — за state, nonce и verifier. */
const casuale = (): string => randomBytes(32).toString('base64url');

/** `code_challenge` за `code_challenge_method=S256`. */
export const sfidaPkce = (verifier: string): string =>
  createHash('sha256').update(verifier, 'ascii').digest('base64url');

const RANDOM = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const schema = z
  .object({
    f: z.enum(['microsoft', 'google']),
    s: z.enum(['accesso', 'collega']),
    n: z.string().max(500),
    st: RANDOM,
    no: RANDOM,
    v: RANDOM,
    e: z.number().int().positive(),
    u: z.string().min(1).max(40).optional(),
    i: z.string().min(1).max(40).optional(),
  })
  .strict();

export function nuovoStato(
  dati: { fornitore: Fornitore; scopo: Scopo; next: string; uid?: string; sid?: string },
  now: number = Date.now(),
): { cookie: string; stato: string; nonce: string; verifier: string } {
  const stato = casuale();
  const nonce = casuale();
  const verifier = casuale();
  const payload: z.infer<typeof schema> = {
    f: dati.fornitore,
    s: dati.scopo,
    n: dati.next.slice(0, 500),
    st: stato,
    no: nonce,
    v: verifier,
    e: now + STATO_MS,
    ...(dati.uid ? { u: dati.uid } : {}),
    ...(dati.sid ? { i: dati.sid } : {}),
  };
  return { cookie: cifraStatoOidc(JSON.stringify(payload)), stato, nonce, verifier };
}

/**
 * Изразходените състояния (отпечатък → срок): бисквитката се трие в браузъра, но копие от нея би минало до
 * срока си — сървърът помни, че state вече е минал, и второто връщане не стига до доставчика. Процесът е един
 * (контейнерът `app`); рестарт забравя само изтеклото до 10 минути назад.
 */
const consumati = new Map<string, number>();
const MAX_CONSUMATI = 100_000;

/** true — първото връщане с това състояние; false — вече е минало (или паметта е пълна: fail closed). */
export function consumaStato(s: StatoOidc, now: number = Date.now()): boolean {
  for (const [chiave, scade] of consumati) {
    if (scade > now) break;
    consumati.delete(chiave);
  }
  const chiave = createHash('sha256').update(s.stato, 'ascii').digest('base64url');
  if (consumati.has(chiave) || consumati.size >= MAX_CONSUMATI) return false;
  consumati.set(chiave, s.scade);
  return true;
}

/** Живото състояние от бисквитката, или null: липсва, подправено, изтекло, непознато. */
export function leggiStato(cookie: string | undefined, now: number = Date.now()): StatoOidc | null {
  if (!cookie || cookie.length > 2048) return null;
  const testo = decifraStatoOidc(cookie);
  if (!testo) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(testo);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data.e <= now) return null;
  const d = parsed.data;
  return {
    fornitore: d.f,
    scopo: d.s,
    next: d.n,
    stato: d.st,
    nonce: d.no,
    verifier: d.v,
    scade: d.e,
    ...(d.u ? { uid: d.u } : {}),
    ...(d.i ? { sid: d.i } : {}),
  };
}
