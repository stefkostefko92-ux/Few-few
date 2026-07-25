// Ключове за публичното API.
//
// Пази се САМО отпечатък. Ключът се показва веднъж при създаване и не може да
// бъде възстановен — компрометирана база тогава не отваря API-то, а изгубен
// ключ се СМЕНЯ, вместо да се търси. Същото решение като при refresh token-а.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Видим префикс: разпознава ключа в списък, без нищо да се пази от него. */
export const PREFISSO = "ea_live_";

export const AMBITI = [
  "impianti:read",
  "ordini:read",
  "ordini:write",
  "fatture:read",
  "contratti:read",
  "webhook:manage",
] as const;
export type Ambito = (typeof AMBITI)[number];

export interface ChiaveGenerata {
  /** Единственият момент, в който съществува в четим вид. */
  chiave: string;
  prefisso: string;
  chiaveHash: string;
}

/**
 * Нов ключ.
 *
 * 32 байта случайност: с по-малко брутфорсът става смислен, а ключът така или
 * иначе се копира, не се въвежда на ръка.
 */
export function generaChiave(): ChiaveGenerata {
  const segreto = randomBytes(32).toString("base64url");
  const chiave = `${PREFISSO}${segreto}`;
  return { chiave, prefisso: `${PREFISSO}${segreto.slice(0, 8)}`, chiaveHash: hashChiave(chiave) };
}

/**
 * SHA-256, не bcrypt.
 *
 * Причината е различна от паролите: ключът е 32 байта истинска случайност, не
 * човешки избор — речников или брутфорс срещу отпечатъка е безсмислен, а bcrypt
 * на всяка заявка към API-то би добавил десетки милисекунди без нищо в замяна.
 */
export function hashChiave(chiave: string): string {
  return createHash("sha256").update(chiave).digest("hex");
}

/** Сравнение в постоянно време — заглавието идва от непознат. */
export function confrontaHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Ключът от заглавието `Authorization`. `null`, ако липсва или е с грешен вид. */
export function chiaveDaHeader(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  const chiave = m[1];
  return chiave.startsWith(PREFISSO) ? chiave : null;
}

export interface StatoChiave {
  ambiti: string[];
  scadenza?: Date | null;
  revocataAt?: Date | null;
}

export type EsitoChiave =
  | { valida: true }
  | { valida: false; motivo: "revocata" | "scaduta" | "ambito" };

/**
 * Може ли този ключ да направи това.
 *
 * Празният списък права значи НИЩО, не „всичко": ключ, създаден без изричен
 * избор, не бива да отваря системата.
 */
export function autorizza(chiave: StatoChiave, ambito: Ambito, ora = new Date()): EsitoChiave {
  if (chiave.revocataAt) return { valida: false, motivo: "revocata" };
  if (chiave.scadenza && chiave.scadenza.getTime() <= ora.getTime())
    return { valida: false, motivo: "scaduta" };
  if (!chiave.ambiti.includes(ambito)) return { valida: false, motivo: "ambito" };
  return { valida: true };
}

/** Само познати права влизат в базата — печатна грешка иначе е тих отказ. */
export function ambitiValidi(ambiti: string[]): boolean {
  return ambiti.length > 0 && ambiti.every((a) => (AMBITI as readonly string[]).includes(a));
}
