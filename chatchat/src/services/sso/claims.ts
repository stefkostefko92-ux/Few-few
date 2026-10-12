import type { SsoProvider } from '@prisma/client';
import { z } from 'zod';

/**
 * Какво четем от вече проверения id_token (подписът, iss, aud, exp/nbf/iat, nonce — в
 * openid-client, `provider.ts`). Тук са правилата на ДОСТАВЧИКА — недоверени данни, само четене:
 *
 * Microsoft Entra ID (документацията на Microsoft identity platform, „ID token claims reference“ и
 * „Optional claims reference“):
 * - `tid` трябва да е точно конфигурираната директория (iss я съдържа, проверяваме и двете);
 * - гост (B2B) не се приема: `idp` различен от `iss` или `acct` = 1 — това е идентичност на ДРУГА
 *   организация; Microsoft препоръчва гостът да се третира като нов потребител;
 * - стабилното свързване е `oid` (GUID, не се преизползва, еднакъв за всички приложения на
 *   директорията) — не `sub` (по приложение) и никога имейл;
 * - `email` НЕ е проверен по подразбиране — приема се само с `xms_edov` = true (опционален claim:
 *   домейнът е проверен от администратора на директорията); иначе `preferred_username` (UPN) на член
 *   на ЗАКОВАНАТА директория — UPN е в проверен домейн на директорията. И в двата случая домейнът
 *   трябва да е в позволения списък и важи САМО за първото свързване; после — само по `oid`;
 * - `amr` (опционален claim за v2.0 токени) — `mfa` се издава само след завършен MFA.
 *
 * Общ OIDC: свързване по `sub`; имейл само с `email_verified` = true; `amr` по RFC 8176.
 */

export interface ExternalLogin {
  /** Издателят от токена (вече сравнен с конфигурирания). */
  issuer: string;
  /** Entra — `oid`; общ OIDC — `sub`. */
  subject: string;
  /** Проверен имейл (малки букви) — само за първото свързване; null → не може да се свърже. */
  email: string | null;
  /** `amr` съдържа `mfa`. */
  idpMfa: boolean;
  /** Има ли изобщо `amr` (за теста на конфигурацията: в Entra е опционален claim). */
  amrPresent: boolean;
}

export type ClaimFailure = 'issuer_mismatch' | 'tenant_mismatch' | 'guest_account' | 'no_subject';

const Email = z.email().max(254);
const Guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Булев claim: JSON true (и низът „true“ — някои доставчици го пращат като низ). */
const isTrue = (v: unknown): boolean => v === true || v === 'true';

function asEmail(v: unknown): string | null {
  const s = str(v)?.trim().toLowerCase() ?? null;
  return s !== null && Email.safeParse(s).success ? s : null;
}

function amrOf(claims: Record<string, unknown>): { present: boolean; mfa: boolean } {
  const amr = claims.amr;
  if (!Array.isArray(amr)) return { present: false, mfa: false };
  return { present: true, mfa: amr.some((m) => m === 'mfa') };
}

export interface ProviderShape {
  provider: SsoProvider;
  issuer: string;
  entraTenantId: string | null;
}

/**
 * Издателите се сравняват като нормализиран URL — както discovery на openid-client (адрес-корен
 * със и без „/“ е същото; друг път — не). Точното `iss` = обявения издател е проверено вече там.
 */
function sameIssuer(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

export function readExternalLogin(
  cfg: ProviderShape,
  claims: Record<string, unknown>,
): { ok: true; login: ExternalLogin } | { ok: false; reason: ClaimFailure } {
  const iss = str(claims.iss);
  if (iss === null || !sameIssuer(iss, cfg.issuer)) return { ok: false, reason: 'issuer_mismatch' };
  const amr = amrOf(claims);
  if (cfg.provider === 'ENTRA') {
    const tid = str(claims.tid)?.toLowerCase() ?? null;
    if (!cfg.entraTenantId || tid !== cfg.entraTenantId.toLowerCase()) {
      return { ok: false, reason: 'tenant_mismatch' };
    }
    const idp = str(claims.idp);
    const acct = claims.acct;
    if ((idp !== null && idp !== iss) || acct === 1 || acct === '1') {
      return { ok: false, reason: 'guest_account' };
    }
    const oid = str(claims.oid)?.toLowerCase() ?? null;
    if (oid === null || !Guid.test(oid)) return { ok: false, reason: 'no_subject' };
    const email = isTrue(claims.xms_edov)
      ? asEmail(claims.email)
      : asEmail(claims.preferred_username);
    return {
      ok: true,
      login: { issuer: iss, subject: oid, email, idpMfa: amr.mfa, amrPresent: amr.present },
    };
  }
  const sub = str(claims.sub);
  if (sub === null || sub.length > 255) return { ok: false, reason: 'no_subject' };
  const email = isTrue(claims.email_verified) ? asEmail(claims.email) : null;
  return {
    ok: true,
    login: { issuer: iss, subject: sub, email, idpMfa: amr.mfa, amrPresent: amr.present },
  };
}
