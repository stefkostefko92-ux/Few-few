// HMAC-SHA256 подпис на редовете в audit_log — чиста логика (node:crypto).
// Подписът покрива: azione, entita, entitaId, dettagli, utenteId, createdAt.
// Промяна направо в базата → невалиден подпис → доказуема манипулация.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface RigaAudit {
  azione: string;
  entita: string;
  entitaId: string | null;
  dettagli: unknown;
  ip: string | null;
  userAgent: string | null;
  utenteId: string | null;
  createdAt: Date;
}

/** Детерминистична сериализация: ключовете се подреждат РЕКУРСИВНО.
 *
 *  Задължително е, защото Postgres `jsonb` НЕ пази реда на вмъкване — записва
 *  ключовете в свой ред. Ако подписваме в реда на JS обекта, а проверяваме
 *  прочетеното от базата, подписите се разминават и контролът за цялост дава
 *  фалшива тревога върху напълно легитимни редове (а истинската манипулация
 *  се скрива в шума). */
export function serializzaStabile(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(serializzaStabile).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const chiavi = Object.keys(o).sort();
    return `{${chiavi.map((k) => `${JSON.stringify(k)}:${serializzaStabile(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Каноничен низ на редицата — стабилен ред на полетата.
 *  Подписът покрива и ip/userAgent, за да не се променят в базата без следа. */
export function canonico(r: RigaAudit, versione: 1 | 2 = 2): string {
  // Версия 1 сериализираше в реда на вмъкване (преди да се разбере, че jsonb
  // пренарежда ключовете). Пазим я, за да остане проверим и старият регистър.
  const serializza = versione === 1 ? JSON.stringify : serializzaStabile;
  return JSON.stringify([
    r.azione,
    r.entita,
    r.entitaId ?? "",
    r.dettagli === undefined || r.dettagli === null
      ? ""
      : serializza(r.dettagli),
    r.ip ?? "",
    r.userAgent ?? "",
    r.utenteId ?? "",
    r.createdAt.toISOString(),
  ]);
}

export function firmaAudit(
  r: RigaAudit,
  chiave: string,
  versione: 1 | 2 = 2,
): string {
  return createHmac("sha256", chiave)
    .update(canonico(r, versione))
    .digest("hex");
}

export function verificaAudit(
  r: RigaAudit,
  hmac: string,
  chiave: string,
  versione: 1 | 2 = 2,
): boolean {
  const atteso = Buffer.from(firmaAudit(r, chiave, versione), "hex");
  let dato: Buffer;
  try {
    dato = Buffer.from(hmac, "hex");
  } catch {
    return false;
  }
  return atteso.length === dato.length && timingSafeEqual(atteso, dato);
}
