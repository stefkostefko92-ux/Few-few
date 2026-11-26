// Пазачите на /admin: вход (пълна сесия), право по ролята, CSRF + Origin за всеки POST.
import type { Request, Response, NextFunction } from "express";
import { auth } from "./sessione.js";
import { accessoAdmin, puo, type Permesso } from "./ruoli.js";
import { ugualeCostante } from "./seal.js";

/** Пълна сесия с достъп до панела; иначе към входа или към 2FA. */
export function richiedeAccesso() {
  return (req: Request, res: Response, next: NextFunction) => {
    const a = auth(res);
    if (!a) return res.redirect(303, `/admin/login${req.method === "GET" ? `?dopo=${encodeURIComponent(req.originalUrl)}` : ""}`);
    if (!accessoAdmin(a.utente.ruolo)) return res.status(403).type("text").send("Accesso non consentito.");
    if (a.sessione.stato !== "COMPLETA") return res.redirect(303, a.utente.totpAttivaDal ? "/admin/2fa" : "/admin/2fa/configura");
    if (a.utente.cambiarePassword && !req.path.startsWith("/profilo")) return res.redirect(303, "/admin/profilo?primo=1");
    next();
  };
}

/** Сесия „само парола“ — за стъпката 2FA. */
export function richiedeSessioneParziale() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const a = auth(res);
    if (!a) return res.redirect(303, "/admin/login");
    if (a.sessione.stato === "COMPLETA") return res.redirect(303, "/admin");
    next();
  };
}

export function richiedePermesso(p: Permesso) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const a = auth(res);
    if (!a || !puo(a.utente.ruolo, p)) return res.status(403).type("text").send("Permesso insufficiente.");
    next();
  };
}

/**
 * CSRF: токенът на сесията в полето `_csrf` (или заглавие) + същият Origin. Без Origin заявката минава само
 * с `Sec-Fetch-Site: same-origin` (браузърът го слага сам; страница от друг сайт не може да го подправи).
 */
export function controlloCsrf(origineConsentita: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const origin = req.get("origin");
    const stessaOrigine = origin ? origin === origineConsentita : req.get("sec-fetch-site") === "same-origin";
    if (!stessaOrigine) return res.status(403).type("text").send("Origine non consentita.");
    const a = auth(res);
    if (!a) return next(); // форма за вход: няма сесия; пазят я лимитът и Origin
    const dato = (typeof req.body?._csrf === "string" ? req.body._csrf : "") || req.get("x-csrf-token") || "";
    if (!ugualeCostante(dato, a.sessione.csrf)) return res.status(403).type("text").send("Token di sicurezza non valido: ricarichi la pagina.");
    next();
  };
}
