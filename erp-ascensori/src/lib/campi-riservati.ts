// Полета, които се виждат и пишат само от определено ниво нагоре. Чисто.
//
// Пример: часовата цена на служителя (`costoOrario`) е заплата + осигуровки.
// През общата CRUD фабрика всеки OPERATOR я четеше, а техник виждаше цената на
// колегите си; OPERATOR можеше и да я смени — тоест да изкриви отчета за
// рентабилност, който иначе е само за DIREZIONE+.
//
// Скриването е ДЪЛБОКО: полето пада и от вложените обекти (назначение →
// служител), иначе изтича през `include` на съседна същност.

import { haPermesso, type Ruolo } from "@/lib/roles";

export interface Riservati {
  ruolo: Ruolo;
  campi: readonly string[];
}

/** Копие без запазените полета, на всяко ниво на вложеност. */
export function oscuraRiservati<T>(dato: T, campi: ReadonlySet<string>): T {
  if (Array.isArray(dato))
    return dato.map((x) => oscuraRiservati(x, campi)) as T;
  if (dato && typeof dato === "object" && !(dato instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dato as Record<string, unknown>))
      if (!campi.has(k)) out[k] = oscuraRiservati(v, campi);
    return out as T;
  }
  return dato;
}

/** Кои запазени полета ролята НЕ може да види/пише (празно = всички може). */
export function campiNascosti(
  r: Riservati | undefined,
  ruolo: Ruolo,
): ReadonlySet<string> {
  return r && !haPermesso(ruolo, r.ruolo) ? new Set(r.campi) : new Set();
}

/** Запазените полета, които тялото на заявката все пак носи. */
export function scritturaVietata(
  data: unknown,
  nascosti: ReadonlySet<string>,
): string[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data).filter(
    (k) =>
      nascosti.has(k) && (data as Record<string, unknown>)[k] !== undefined,
  );
}
