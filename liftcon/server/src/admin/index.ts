// /admin: статика → парсер → сесия → CSRF → вход/2FA → (пазач) → заявки, съдържание, потребители.
import express, { Router } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const STATIC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "admin-static");
// Общите модули за браузъра (сглобяване, текстове) — компилираните condiviso/*.js без каталога.
const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "documenti", "condiviso");

export function routerAdmin(d: AdminDeps): Router {
  const r = Router();
  r.use("/static", express.static(STATIC, { maxAge: "1h", index: false, dotfiles: "deny" }));
  r.use("/static/lib", (req, res, next) => (/^\/[a-z-]+\.js$/.test(req.path) ? next() : res.status(404).end()), express.static(LIB, { maxAge: "1h", index: false, dotfiles: "deny" }));
  // Service worker-ът на документите: на пътя на обхвата си (/admin/documenti/), без вход — само статичен код.
  r.get("/documenti/sw.js", (_req, res) => {
    res.set("cache-control", "no-cache").set("service-worker-allowed", "/admin/documenti/").type("application/javascript").sendFile(join(STATIC, "documenti", "sw.js"));
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
