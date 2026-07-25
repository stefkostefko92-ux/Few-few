// HMAC-SHA256 подпис на редовете в audit_log — чиста логика (node:crypto).
// Подписът покрива: azione, entita, entitaId, dettagli, utenteId, createdAt.
// Промяна направо в базата → невалиден подпис → доказуема манипулация.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface RigaAudit {
  azione: string;
  entita: string;
  entitaId: string | null;
  dettagli: unknown;
  utenteId: string | null;
  createdAt: Date;
}

/** Каноничен низ на редицата — стабилен ред на полетата. */
export function canonico(r: RigaAudit): string {
  return JSON.stringify([
    r.azione,
    r.entita,
    r.entitaId ?? "",
    r.dettagli === undefined || r.dettagli === null ? "" : JSON.stringify(r.dettagli),
    r.utenteId ?? "",
    r.createdAt.toISOString(),
  ]);
}

export function firmaAudit(r: RigaAudit, chiave: string): string {
  return createHmac("sha256", chiave).update(canonico(r)).digest("hex");
}

export function verificaAudit(r: RigaAudit, hmac: string, chiave: string): boolean {
  const atteso = Buffer.from(firmaAudit(r, chiave), "hex");
  let dato: Buffer;
  try {
    dato = Buffer.from(hmac, "hex");
  } catch {
    return false;
  }
  return atteso.length === dato.length && timingSafeEqual(atteso, dato);
}
