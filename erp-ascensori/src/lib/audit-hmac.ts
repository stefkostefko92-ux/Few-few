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
  /** Подписът на ПРЕДХОДНИЯ ред (версия 3+). `null` за първия. */
  hmacPrecedente?: string | null;
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

/** Текущата версия на канона. Всяка промяна В ПОКРИТИТЕ ПОЛЕТА я вдига —
 *  не само промяна в подредбата им. Иначе стари редове стават непроверими
 *  безшумно и фалшивата тревога заглушава истинската манипулация. */
export const VERSIONE_CORRENTE = 3;

export type VersioneFirma = 1 | 2 | 3;

/** Каноничен низ на редицата — стабилен ред на полетата.
 *
 *  Версия 1: сериализация в реда на вмъкване (преди да се разбере, че jsonb
 *            пренарежда ключовете).
 *  Версия 2: рекурсивно сортирани ключове.
 *  Версия 3: + `hmacPrecedente` — ВЕРИГА. Дотогава подписът ловеше промяна на
 *            ред, но не и ИЗТРИВАНЕ на цял ред: махнеш ли редица, останалите
 *            се проверяват успешно и липсата е невидима. С веригата всеки ред
 *            сочи предходния, и изваденото звено се вижда веднага. */
export function canonico(
  r: RigaAudit,
  versione: VersioneFirma = VERSIONE_CORRENTE,
): string {
  const serializza = versione === 1 ? JSON.stringify : serializzaStabile;
  const campi = [
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
  ];
  if (versione >= 3) campi.push(r.hmacPrecedente ?? "");
  return JSON.stringify(campi);
}

export function firmaAudit(
  r: RigaAudit,
  chiave: string,
  versione: VersioneFirma = VERSIONE_CORRENTE,
): string {
  return createHmac("sha256", chiave)
    .update(canonico(r, versione))
    .digest("hex");
}

export function verificaAudit(
  r: RigaAudit,
  hmac: string,
  chiave: string,
  versione: VersioneFirma = VERSIONE_CORRENTE,
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

/**
 * Проверява с ТЕКУЩИЯ ключ, а при неуспех — с предишния.
 *
 * Без това ротацията на `AUDIT_HMAC_KEY` е еднопосочна щета: всичко подписано
 * преди смяната става непроверимо ЗАВИНАГИ, а регистърът губи точно
 * доказателствената стойност, заради която съществува. Подписването винаги
 * ползва текущия ключ — старият важи само при проверка.
 */
export function verificaConRotazione(
  r: RigaAudit,
  hmac: string,
  chiavi: { corrente: string; precedente?: string | null },
  versione: VersioneFirma = VERSIONE_CORRENTE,
): { valida: boolean; conChiavePrecedente: boolean } {
  if (verificaAudit(r, hmac, chiavi.corrente, versione))
    return { valida: true, conChiavePrecedente: false };
  if (chiavi.precedente && verificaAudit(r, hmac, chiavi.precedente, versione))
    return { valida: true, conChiavePrecedente: true };
  return { valida: false, conChiavePrecedente: false };
}
