// Обща рамка на панела (/admin): сървърно рендиране, без inline стилове и скриптове (строг CSP).
import type { Auth } from "../auth/sessione.js";
import { puo, ETICHETTE_RUOLO, type Permesso } from "../auth/ruoli.js";
import { esc } from "../content/mdlite.js";
import { testaPwa, versione } from "./pwa.js";

export { esc };

export const csrf = (a: Auth | undefined): string => (a ? `<input type="hidden" name="_csrf" value="${esc(a.sessione.csrf)}">` : "");

export function avviso(tipo: "ok" | "errore" | "info", testo: string): string {
  return `<p class="avviso avviso-${tipo}" role="${tipo === "errore" ? "alert" : "status"}">${esc(testo)}</p>`;
}

const VOCI: Array<{ href: string; testo: string; permesso?: Permesso }> = [
  { href: "/admin", testo: "Panoramica" },
  { href: "/admin/richieste", testo: "Richieste", permesso: "richieste.leggi" },
  { href: "/admin/documenti/", testo: "Documenti", permesso: "documenti.leggi" },
  { href: "/admin/contenuti", testo: "Contenuti", permesso: "contenuti.modifica" },
  { href: "/admin/utenti", testo: "Utenti", permesso: "utenti.gestisci" },
  { href: "/admin/registro", testo: "Registro", permesso: "registro.leggi" },
  { href: "/admin/impostazioni", testo: "Impostazioni", permesso: "impostazioni.gestisci" },
  { href: "/admin/profilo", testo: "Profilo" },
];

export function pagina(o: { titolo: string; corpo: string; auth?: Auth | undefined; attivo?: string; semplice?: boolean }): string {
  const a = o.auth;
  const nav =
    a && !o.semplice && a.sessione.stato === "COMPLETA"
      ? `<nav class="nav" aria-label="Pannello">${VOCI.filter((v) => !v.permesso || puo(a.utente.ruolo, v.permesso))
          .map((v) => `<a href="${v.href}"${o.attivo === v.href ? ' aria-current="page"' : ""}>${v.testo}</a>`)
          .join("")}<form method="post" action="/admin/logout" class="esci">${csrf(a)}<button type="submit">Esci</button></form></nav>`
      : "";
  const chi = a && !o.semplice ? `<p class="chi">${esc(a.utente.nome)} · ${esc(ETICHETTE_RUOLO[a.utente.ruolo])}</p>` : "";
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(o.titolo)} | LiftCon Admin</title>
<link rel="icon" href="/admin/static/favicon.png" type="image/png">
${testaPwa(versione())}
<link rel="stylesheet" href="/admin/static/admin.css">
<script src="/admin/static/admin.js" defer></script>
</head>
<body class="${o.semplice ? "semplice" : ""}">
<header class="testa"><a class="marchio" href="/admin"><img src="/admin/static/logo.webp" width="154" height="36" alt="LiftCon"><span>Admin</span></a>${chi}</header>
${nav}
<main class="corpo" id="contenuto">
<h1>${esc(o.titolo)}</h1>
${o.corpo}
</main>
</body>
</html>`;
}

export const data = (d: Date | null): string =>
  d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
