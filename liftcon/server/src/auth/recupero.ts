// Резервни кодове на 2FA (изгубен телефон): 10, всеки за еднократна употреба, показват се само веднъж;
// в базата е само HMAC. 10 знака без двусмислени — ~49 бита.
import { randomInt } from "node:crypto";
import type { Sigillo } from "./seal.js";

const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
export const NUMERO_CODICI = 10;
const LUNGHEZZA = 10;

const formato = (c: string) => `${c.slice(0, LUNGHEZZA / 2)}-${c.slice(LUNGHEZZA / 2)}`;

export function normalizzaCodice(input: string): string {
  const c = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  return c.length === LUNGHEZZA && [...c].every((x) => ALFABETO.includes(x)) ? formato(c) : "";
}

export function nuoviCodici(s: Sigillo): { codici: string[]; hmac: string[] } {
  const codici = Array.from({ length: NUMERO_CODICI }, () => formato(Array.from({ length: LUNGHEZZA }, () => ALFABETO[randomInt(ALFABETO.length)]).join("")));
  return { codici, hmac: codici.map((c) => s.hmac("recupero-v1", c)) };
}

/** Индексът на използвания код или -1. */
export function trovaCodice(s: Sigillo, salvati: string[], input: string): number {
  const c = normalizzaCodice(input);
  if (!c) return -1;
  return salvati.indexOf(s.hmac("recupero-v1", c));
}
