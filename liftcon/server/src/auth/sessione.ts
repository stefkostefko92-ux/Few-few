// Сесии: JWT (HS256) в httpOnly бисквитка носи само id на сесията; сесията е ред в базата (отменима).
// Без действие 2 ч → изход; абсолютно 12 ч. „PARZIALE“ = само парола (преди 2FA).
import type { Request, Response, NextFunction } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { Store, Sessione, Utente } from "../store/types.js";
import { randomToken } from "./seal.js";

export const INATTIVITA_MS = 2 * 60 * 60_000;
export const DURATA_MS = 12 * 60 * 60_000;
const SCORRIMENTO_MS = 60_000;

export interface Auth {
  utente: Utente;
  sessione: Sessione;
}

export interface OpzioniSessione {
  store: Store;
  jwtSecret: string;
  produzione: boolean;
  now?: () => number;
}

export function nomeCookie(produzione: boolean): string {
  // `__Host-` иска Secure + Path=/ без Domain: бисквитка от поддомейн не може да я подмени.
  return produzione ? "__Host-liftcon" : "liftcon_sid";
}

export function leggiCookie(req: Request, nome: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const parte of raw.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function gestoreSessioni(o: OpzioniSessione) {
  const now = o.now ?? (() => Date.now());
  const chiave = new TextEncoder().encode(o.jwtSecret);
  const nome = nomeCookie(o.produzione);

  function scriviCookie(res: Response, token: string, scadenza: Date): void {
    res.cookie(nome, token, { httpOnly: true, secure: o.produzione, sameSite: "strict", path: "/", expires: scadenza });
  }

  return {
    nome,
    async apri(res: Response, utente: Utente, stato: Sessione["stato"]): Promise<Sessione> {
      const scadeIl = new Date(now() + DURATA_MS);
      const s = await o.store.sessioni.crea({ utenteId: utente.id, stato, csrf: randomToken(24), scadeIl });
      const jwt = await new SignJWT({ sid: s.id })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(now() / 1000))
        .setExpirationTime(Math.floor(scadeIl.getTime() / 1000))
        .setIssuer("liftcon")
        .setAudience("liftcon-admin")
        .sign(chiave);
      scriviCookie(res, jwt, scadeIl);
      return s;
    },

    async chiudi(req: Request, res: Response): Promise<void> {
      const a = res.locals.auth as Auth | undefined;
      if (a) await o.store.sessioni.elimina(a.sessione.id);
      res.clearCookie(nome, { httpOnly: true, secure: o.produzione, sameSite: "strict", path: "/" });
      void req;
    },

    /** Чете сесията (ако има) в res.locals.auth. Не отказва — за това са guards. */
    carica() {
      return async (req: Request, res: Response, next: NextFunction) => {
        const token = leggiCookie(req, nome);
        if (!token) return next();
        try {
          const { payload } = await jwtVerify(token, chiave, { issuer: "liftcon", audience: "liftcon-admin", algorithms: ["HS256"], currentDate: new Date(now()) });
          const sid = typeof payload.sid === "string" ? payload.sid : null;
          const s = sid ? await o.store.sessioni.perId(sid) : null;
          const t = now();
          if (!s || s.scadeIl.getTime() <= t || t - s.ultimoUso.getTime() > INATTIVITA_MS) {
            if (s) await o.store.sessioni.elimina(s.id);
            return next();
          }
          const u = await o.store.utenti.perId(s.utenteId);
          if (!u || !u.attivo) return next();
          if (t - s.ultimoUso.getTime() > SCORRIMENTO_MS) await o.store.sessioni.aggiorna(s.id, { ultimoUso: new Date(t) });
          res.locals.auth = { utente: u, sessione: s } satisfies Auth;
        } catch {
          // Невалиден или изтекъл JWT — като без сесия.
        }
        next();
      };
    },
  };
}

export type GestoreSessioni = ReturnType<typeof gestoreSessioni>;

export function auth(res: Response): Auth | undefined {
  return res.locals.auth as Auth | undefined;
}
