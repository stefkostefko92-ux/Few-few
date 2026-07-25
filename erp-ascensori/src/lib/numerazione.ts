// Прогресивна номерация с префикс и година: PRV-2026-0001, ODL-…, FT-…, FR-…, DDT-…
// Уникалният индекс `[tenantId, numero]` пази от състезания; при P2002 се опитва пак.
//
// Номерацията е ПО ФИРМА. Глобална последователност значи, че втората фирма
// започва от номера, до който е стигнала първата: регистърът ѝ има дупки, а
// самият номер издава колко документа е издал съседът. Чл. 21, ал. 2, б. „б"
// D.P.R. 633/1972 иска номерацията да е на данъчнозадълженото лице.

import { prisma } from "@/lib/prisma";

type ModelloNumerato =
  | "preventivo"
  | "ordineLavoro"
  | "fattura"
  | "ddt"
  | "contratto"
  | "rapportino";

export const PREFISSI = {
  contratto: "CTR",
  rapportino: "RAP",
  preventivo: "PRV",
  ordineLavoro: "ODL",
  fatturaEmessa: "FT",
  fatturaRicevuta: "FR",
  ddt: "DDT",
} as const;

export async function prossimoNumero(
  model: ModelloNumerato,
  prefisso: string,
  tenantId: string | null,
  anno = new Date().getFullYear(),
): Promise<string> {
  const base = `${prefisso}-${anno}-`;
  // Извеждаме от максималния номер, НЕ от бройката: изтриване на не-последен
  // документ би направило count-базирания следващ номер дубликат (P2002 завинаги).
  // 4-цифреното допълване прави лексикографската наредба = числовата.
  const d = prisma[model] as unknown as {
    findFirst(args: object): Promise<{ numero: string } | null>;
  };
  const ultimo = await d.findFirst({
    where: { numero: { startsWith: base }, tenantId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  const n = ultimo ? Number(ultimo.numero.slice(base.length)) : 0;
  return `${base}${String(n + 1).padStart(4, "0")}`;
}

/** Изпълнява fn с ново numero; при дубликат (P2002) опитва до 3 пъти. */
export async function conNumero<T>(
  model: ModelloNumerato,
  prefisso: string,
  tenantId: string | null,
  fn: (numero: string) => Promise<T>,
): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn(await prossimoNumero(model, prefisso, tenantId));
    } catch (e) {
      ultimo = e;
      const codice = (e as { code?: string }).code;
      if (codice !== "P2002") throw e;
    }
  }
  throw ultimo;
}
