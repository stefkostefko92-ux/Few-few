// Прогресивна номерация с префикс и година: PRV-2026-0001, ODL-…, FT-…, FR-…, DDT-…
// Уникалният индекс на `numero` пази от състезания; при P2002 маршрутът опитва пак.

import { prisma } from "@/lib/prisma";

type ModelloNumerato = "preventivo" | "ordineLavoro" | "fattura" | "ddt";

export const PREFISSI = {
  preventivo: "PRV",
  ordineLavoro: "ODL",
  fatturaEmessa: "FT",
  fatturaRicevuta: "FR",
  ddt: "DDT",
} as const;

export async function prossimoNumero(
  model: ModelloNumerato,
  prefisso: string,
  anno = new Date().getFullYear()
): Promise<string> {
  const base = `${prefisso}-${anno}-`;
  const d = prisma[model] as unknown as {
    count(args: { where: { numero: { startsWith: string } } }): Promise<number>;
  };
  const n = await d.count({ where: { numero: { startsWith: base } } });
  return `${base}${String(n + 1).padStart(4, "0")}`;
}

/** Изпълнява fn с ново numero; при дубликат (P2002) опитва до 3 пъти. */
export async function conNumero<T>(
  model: ModelloNumerato,
  prefisso: string,
  fn: (numero: string) => Promise<T>
): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn(await prossimoNumero(model, prefisso));
    } catch (e) {
      ultimo = e;
      const codice = (e as { code?: string }).code;
      if (codice !== "P2002") throw e;
    }
  }
  throw ultimo;
}
