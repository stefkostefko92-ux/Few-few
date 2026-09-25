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

/**
 * Колко пъти опитваме при дубликат.
 *
 * ГРАНИЦАТА Е ДЕТЕРМИНИРАНА, не статистическа: при N едновременни заявки във
 * всеки кръг поне една печели (записът, който се потвърди пръв), тоест
 * последната има нужда от най-много N опита. Пет покрива пет души, които
 * натискат „Salva" в един и същ миг — повече от реалното за една фирма.
 */
const TENTATIVI_NUMERO = 5;

/** Изпълнява fn с ново numero; при дубликат (P2002) опитва отново. */
export async function conNumero<T>(
  model: ModelloNumerato,
  prefisso: string,
  tenantId: string | null,
  fn: (numero: string) => Promise<T>,
): Promise<T> {
  // ЗАВИСИ ОТ ИНДЕКСА. Целият механизъм е „опитай, и ако базата откаже —
  // опитай пак“. До миграция `20260925090000_unici_nulls_not_distinct` базата
  // НЕ отказваше при `tenantId` NULL и две заявки получаваха един и същ номер
  // без нито една грешка. `/api/readyz` (`unicita`) пази тази предпоставка.
  let ultimo: unknown;
  for (let i = 0; i < TENTATIVI_NUMERO; i++) {
    try {
      return await fn(await prossimoNumero(model, prefisso, tenantId));
    } catch (e) {
      ultimo = e;
      const codice = (e as { code?: string }).code;
      if (codice !== "P2002") throw e;
      // Разсейване: без него загубилите тръгват пак в една и съща милисекунда
      // и се сблъскват отново.
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
    }
  }
  throw ultimo;
}
