// Страниците на документите: обвивката на офлайн приложението, снимките и PDF-ът (само за влезли с право).
// Самото приложение е в admin-static/documenti/ и говори с API-то (api-documenti.ts).
import { Router } from "express";
import type { AdminDeps } from "./deps.js";
import { richiedePermesso } from "../auth/guards.js";
import { ID } from "../documenti/schema.js";
import { NOMI_TIPO } from "../documenti/condiviso/testi.js";

/** Обвивката е една и съща за всички (без лични данни и без CSRF токен) — кешира се от service worker-а. */
export const SHELL = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1F2328">
<title>Documenti | LiftCon Admin</title>
<link rel="icon" href="/admin/static/favicon.png" type="image/png">
<link rel="stylesheet" href="/admin/static/admin.css">
<link rel="stylesheet" href="/admin/static/documenti/documenti.css">
<script type="module" src="/admin/static/documenti/app.js"></script>
</head>
<body class="doc-app">
<header class="testa"><a class="marchio" href="/admin"><img src="/admin/static/logo.webp" width="154" height="36" alt="LiftCon"><span>Admin</span></a><p class="chi" id="chi"></p></header>
<div class="stato-rete" id="rete" role="status" aria-live="polite"></div>
<main class="corpo" id="app"><p class="nota">Caricamento…</p><noscript><p class="avviso avviso-errore">Per compilare i documenti serve JavaScript.</p></noscript></main>
</body>
</html>`;

export function rotteDocumenti(d: AdminDeps): Router {
  const r = Router();
  r.use("/documenti", richiedePermesso("documenti.leggi"));

  r.get("/documenti", (_req, res) => res.redirect(301, "/admin/documenti/"));
  r.get("/documenti/", (_req, res) => {
    res.set("cache-control", "no-cache").type("html").send(SHELL);
  });

  r.get("/documenti/:id/foto/:fotoId", async (req, res) => {
    const id = ID.safeParse(req.params.id);
    const fotoId = ID.safeParse(req.params.fotoId);
    if (!id.success || !fotoId.success) return res.status(400).send("Richiesta non valida.");
    const buf = await d.documenti.leggiFoto(id.data, fotoId.data, req.query.mini === "1");
    if (!buf) return res.status(404).send("Foto non trovata.");
    // Частно съдържание: само в кеша на браузъра на влезлия (service worker-ът го трие при изход).
    res.set("cache-control", "private, max-age=86400, immutable").type("image/jpeg").send(buf);
  });

  r.get("/documenti/:id/pdf", async (req, res) => {
    const id = ID.safeParse(req.params.id);
    const doc = id.success ? await d.documenti.carica(id.data) : null;
    if (!doc) return res.status(404).send("Documento non trovato.");
    const pdf = await d.documenti.pdf(doc);
    const nome = `${doc.numero ? `${doc.numero}-rev${doc.revisione}` : `bozza-${NOMI_TIPO[doc.tipo].toLowerCase().replace(/[^a-z]+/g, "-")}`}.pdf`;
    res.set("cache-control", "no-store").set("content-disposition", `inline; filename="${nome}"`).type("application/pdf").send(pdf);
  });

  return r;
}
