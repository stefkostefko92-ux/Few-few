// /admin: статика → парсер → сесия → CSRF → вход/2FA → (пазач) → заявки, съдържание, потребители.
import express, { Router } from "express";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { LIB_DIR, STATIC_DIR, manifest, versione } from "./pwa.js";
import type { AdminDeps } from "./deps.js";
import { controlloCsrf, richiedeAccesso } from "../auth/guards.js";
import { rotteAccesso } from "./rotte-accesso.js";
import { rotteRichieste } from "./rotte-richieste.js";
import { rotteContenuti } from "./rotte-contenuti.js";
import { rotteUtenti } from "./rotte-utenti.js";
import { rotteImpostazioni } from "./rotte-impostazioni.js";
import { apiDocumenti } from "./api-documenti.js";
import { rotteDocumenti } from "./rotte-documenti.js";
import { pagina } from "./html.js";
import { auth } from "../auth/sessione.js";

/** CSP на панела (Nginx не слага своя за /admin): като на сайта + blob: за снимките от устройството и worker. */
export const CSP_ADMIN =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'";

const STATIC = STATIC_DIR;
const LIB = LIB_DIR;

export function routerAdmin(d: AdminDeps): Router {
  const r = Router();
  r.use((_req, res, next) => {
    res.set("content-security-policy", CSP_ADMIN);
    next();
  });
  // Качване (снимки): ако заявката се откаже рано (сесия, CSRF, права), тялото първо се изчита — иначе Node
  // затваря връзката, докато Nginx още праща, и човекът получава 502 вместо 401/403 (Nginx го буферира целия).
  r.use("/api/documenti", (req, res, next) => {
    if (!Number(req.get("content-length") ?? 0)) return next();
    const fine = res.end.bind(res) as (...a: unknown[]) => typeof res;
    res.end = ((...args: unknown[]) => {
      if (req.complete || req.readableEnded) return fine(...args);
      let fatto = false;
      const invia = () => (fatto ? undefined : ((fatto = true), fine(...args)));
      req.once("end", invia).once("error", invia).resume();
      setTimeout(invia, 10_000).unref();
      return res;
    }) as typeof res.end;
    next();
  });
  r.use("/static", express.static(STATIC, { maxAge: "1h", index: false, dotfiles: "deny" }));
  r.use("/static/lib", (req, res, next) => (/^\/[a-z-]+\.js$/.test(req.path) ? next() : res.status(404).end()), express.static(LIB, { maxAge: "1h", index: false, dotfiles: "deny" }));
  // PWA (pwa.ts): манифестът и service worker-ът с обхват /admin/ — без вход (само статично съдържание).
  r.get("/manifest.webmanifest", (_req, res) => {
    res.set("cache-control", "no-cache").type("application/manifest+json").send(JSON.stringify(manifest(versione())));
  });
  const swSorgente = readFileSync(join(STATIC, "documenti", "sw.js"), "utf8");
  r.get("/sw.js", (_req, res) => {
    res.set("cache-control", "no-cache").type("application/javascript").send(swSorgente.replace("__VERSIONE__", versione()));
  });
  r.use((_req, res, next) => {
    res.set("x-robots-tag", "noindex, nofollow").set("cache-control", "no-store").set("referrer-policy", "same-origin");
    next();
  });
  r.use(express.urlencoded({ extended: false, limit: "256kb", parameterLimit: 3000 }));
  r.use(d.sessioni.carica());
  r.use(controlloCsrf(d.origine));
  r.use(rotteAccesso(d));
  r.use("/api", apiDocumenti(d));
  r.use(richiedeAccesso());
  r.use(rotteRichieste(d));
  r.use(rotteContenuti(d));
  r.use(rotteUtenti(d));
  r.use(rotteImpostazioni(d));
  r.use(rotteDocumenti(d));
  r.use((_req, res) => {
    res.status(404).send(pagina({ titolo: "Pagina non trovata", auth: auth(res), corpo: `<p><a href="/admin">Torna alla panoramica</a></p>` }));
  });
  return r;
}
