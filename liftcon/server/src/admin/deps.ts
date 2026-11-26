// Зависимостите на панела и регистърът на събитията (без лични данни; IP — само като HMAC).
import type { Request } from "express";
import type { Logger } from "pino";
import type { Store } from "../store/types.js";
import type { GestoreSessioni } from "../auth/sessione.js";
import type { Sigillo } from "../auth/seal.js";
import type { Limiter } from "../rate-limit.js";
import { clientKey } from "../rate-limit.js";
import type { Catalogo } from "../content/catalogo.js";
import type { Pubblicatore } from "../content/pubblica.js";
import type { GestoreEmail } from "../email/configurazione.js";

export interface AdminDeps {
  store: Store;
  sessioni: GestoreSessioni;
  sigillo: Sigillo;
  catalogo: Catalogo;
  pubblicatore: Pubblicatore;
  logger: Logger;
  origine: string;
  limiteAccesso: Limiter;
  now: () => number;
  siteDir: string;
  email: GestoreEmail;
}

export async function registra(d: AdminDeps, req: Request, utenteId: string | null, azione: string, oggetto?: string, dettagli?: Record<string, unknown>): Promise<void> {
  try {
    await d.store.eventi.registra({
      utenteId,
      azione,
      oggetto: oggetto ?? null,
      dettagli: dettagli ?? null,
      ipHmac: d.sigillo.hmac("ip-v1", clientKey(req.ip)).slice(0, 16),
    });
  } catch (err) {
    d.logger.error({ event: "registro", esito: "errore", err: err instanceof Error ? err.message : "?" });
  }
}

/** Пренасочване само вътре в панела (без отворен redirect). */
export function dopoSicuro(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return /^\/admin(\/[A-Za-z0-9\-._~/?=&%]*)?$/.test(s) && !s.startsWith("//") ? s : "/admin";
}
