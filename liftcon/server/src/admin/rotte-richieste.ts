// Панорама и заявките: списък с филтри, детайл, статус и бележки, изтриване (GDPR), CSV. Спецификация т. 9–12.
import { Router } from "express";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { pagina, avviso, csrf, esc, data } from "./html.js";
import { auth } from "../auth/sessione.js";
import { richiedePermesso } from "../auth/guards.js";
import { puo } from "../auth/ruoli.js";
import { STATI_RICHIESTA, type StatoRichiesta } from "../store/types.js";
import { ETICHETTE_STATO, nuovoTermine, csvRichieste } from "../richieste/servizio.js";
import { ETICHETTE_RUOLO, ETICHETTE_SERVIZIO } from "../richieste/schema.js";

const PER_PAGINA = 25;
const stato = (v: unknown): StatoRichiesta | undefined => (STATI_RICHIESTA as readonly string[]).includes(String(v)) ? (v as StatoRichiesta) : undefined;
const etichettaServizio = (k: string) => (ETICHETTE_SERVIZIO as Record<string, string>)[k] ?? k;
const etichettaRuolo = (k: string) => (ETICHETTE_RUOLO as Record<string, string>)[k] ?? k;
const badge = (s: StatoRichiesta) => `<span class="badge badge-${s.toLowerCase()}">${ETICHETTE_STATO[s]}</span>`;

export function rotteRichieste(d: AdminDeps): Router {
  const r = Router();

  r.get("/", async (_req, res) => {
    const a = auth(res)!;
    const conti = await d.store.richieste.contaPerStato();
    const ultime = await d.store.richieste.cerca({ limite: 5, offset: 0 });
    const pubbl = (await d.store.pubblicazioni.ultime(1))[0];
    const tile = (s: StatoRichiesta) => `<a class="tile" href="/admin/richieste?stato=${s}"><span class="tile-n">${conti[s]}</span><span>${ETICHETTE_STATO[s]}</span></a>`;
    res.send(
      pagina({
        titolo: "Panoramica",
        auth: a,
        attivo: "/admin",
        corpo: `${puo(a.utente.ruolo, "richieste.leggi") ? `<section class="tiles">${STATI_RICHIESTA.map(tile).join("")}</section>` : ""}
<section class="scheda"><h2>Ultime richieste</h2>${
          ultime.righe.length
            ? `<ul class="elenco">${ultime.righe.map((x) => `<li><a href="/admin/richieste/${x.id}">${esc(x.nome)} · ${esc(x.comune)}</a> ${badge(x.stato)} <span class="nota">${data(x.creataIl)}</span></li>`).join("")}</ul>`
            : `<p class="nota">Nessuna richiesta per ora.</p>`
        }</section>
${
  puo(a.utente.ruolo, "contenuti.modifica")
    ? `<section class="scheda"><h2>Sito</h2><p>Ultima pubblicazione: ${pubbl ? `${data(pubbl.iniziataIl)} — ${pubbl.esito === "OK" ? "riuscita" : pubbl.esito === "ERRORE" ? "non riuscita" : "in corso"}` : "nessuna dal pannello"}.</p><a class="btn btn-sec" href="/admin/contenuti">Gestisci i contenuti</a></section>`
    : ""
}`,
      }),
    );
  });

  r.get("/richieste", richiedePermesso("richieste.leggi"), async (req, res) => {
    const a = auth(res)!;
    const s = stato(req.query.stato);
    const q = String(req.query.q ?? "").slice(0, 100);
    const pag = Math.max(1, Math.min(1000, Number(req.query.p) || 1));
    const { righe, totale } = await d.store.richieste.cerca({ stato: s, testo: q || undefined, limite: PER_PAGINA, offset: (pag - 1) * PER_PAGINA });
    const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
    const qs = (p: number) => `?${new URLSearchParams({ ...(s ? { stato: s } : {}), ...(q ? { q } : {}), p: String(p) })}`;
    res.send(
      pagina({
        titolo: "Richieste",
        auth: a,
        attivo: "/admin/richieste",
        corpo: `<form class="filtri" method="get" action="/admin/richieste"><label for="stato">Stato</label><select id="stato" name="stato"><option value="">Tutti</option>${STATI_RICHIESTA.map(
          (x) => `<option value="${x}"${x === s ? " selected" : ""}>${ETICHETTE_STATO[x]}</option>`,
        ).join("")}</select><label for="q">Cerca</label><input id="q" name="q" value="${esc(q)}" maxlength="100"><button class="btn btn-sec" type="submit">Filtra</button>${
          puo(a.utente.ruolo, "richieste.esporta") ? `<a class="btn btn-sec" href="/admin/richieste.csv${s ? `?stato=${s}` : ""}">Esporta CSV</a>` : ""
        }</form>
<p class="nota">${totale} richieste. Quelle senza incarico vengono eliminate automaticamente 6 mesi dopo l'ultima modifica.</p>
<div class="tabella-wrap" tabindex="0"><table class="tabella"><thead><tr><th>Data</th><th>Nome</th><th>Comune</th><th>Servizio</th><th>Stato</th></tr></thead><tbody>${righe
          .map(
            (x) =>
              `<tr><td>${data(x.creataIl)}</td><td><a href="/admin/richieste/${x.id}">${esc(x.nome)}</a></td><td>${esc(x.comune)}</td><td>${esc(etichettaServizio(x.servizio))}</td><td>${badge(x.stato)}</td></tr>`,
          )
          .join("")}</tbody></table></div>
${pagine > 1 ? `<nav class="pagine" aria-label="Pagine">${pag > 1 ? `<a href="${qs(pag - 1)}">Precedente</a>` : ""}<span>Pagina ${pag} di ${pagine}</span>${pag < pagine ? `<a href="${qs(pag + 1)}">Successiva</a>` : ""}</nav>` : ""}`,
      }),
    );
  });

  r.get("/richieste.csv", richiedePermesso("richieste.esporta"), async (req, res) => {
    const a = auth(res)!;
    const s = stato(req.query.stato);
    const { righe } = await d.store.richieste.cerca({ stato: s, limite: 10_000, offset: 0 });
    await registra(d, req, a.utente.id, "richieste.esportate", undefined, { numero: righe.length, stato: s ?? "tutti" });
    res.set("content-type", "text/csv; charset=utf-8").set("content-disposition", `attachment; filename="richieste-liftcon-${new Date(d.now()).toISOString().slice(0, 10)}.csv"`).set("cache-control", "no-store").send(csvRichieste(righe));
  });

  r.get("/richieste/:id", richiedePermesso("richieste.leggi"), async (req, res) => {
    const a = auth(res)!;
    const x = await d.store.richieste.perId(String(req.params.id));
    if (!x) return res.status(404).send(pagina({ titolo: "Richiesta non trovata", auth: a, corpo: `<p><a href="/admin/richieste">Torna alle richieste</a></p>` }));
    const campo = (t: string, v: string) => `<div><dt>${t}</dt><dd>${v}</dd></div>`;
    res.send(
      pagina({
        titolo: `Richiesta di ${x.nome}`,
        auth: a,
        attivo: "/admin/richieste",
        corpo: `${req.query.ok ? avviso("ok", "Modifiche salvate.") : ""}<div class="griglia2">
<section class="scheda"><dl class="dati">${campo("Ricevuta", data(x.creataIl))}${campo("Email", `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`)}${campo("Telefono", x.telefono ? `<a href="tel:${esc(x.telefono.replace(/[^\d+]/g, ""))}">${esc(x.telefono)}</a>` : "—")}${campo(
          "Ruolo",
          esc(etichettaRuolo(x.ruolo)),
        )}${campo("Comune", esc(x.comune))}${campo("Servizio", esc(etichettaServizio(x.servizio)))}${campo(
          "Eliminazione automatica",
          x.eliminareDopo ? data(x.eliminareDopo) : "no (incarico conferito)",
        )}</dl><h2>Messaggio</h2><p class="messaggio">${esc(x.messaggio)}</p></section>
<section class="scheda"><h2>Gestione</h2><form method="post" action="/admin/richieste/${x.id}">${csrf(a)}<label for="st">Stato</label><select id="st" name="stato">${STATI_RICHIESTA.map(
          (s) => `<option value="${s}"${s === x.stato ? " selected" : ""}>${ETICHETTE_STATO[s]}</option>`,
        ).join("")}</select><label for="note">Note interne</label><textarea id="note" name="note" rows="8" maxlength="5000">${esc(x.note)}</textarea><button class="btn" type="submit">Salva</button></form>
${
  puo(a.utente.ruolo, "richieste.elimina")
    ? `<form method="post" action="/admin/richieste/${x.id}/elimina" class="pericolo">${csrf(a)}<label class="spunta"><input type="checkbox" name="conferma" value="si" required> Confermo l'eliminazione definitiva (diritto alla cancellazione)</label><button class="btn btn-pericolo" type="submit">Elimina richiesta</button></form>`
    : ""
}</section></div>`,
      }),
    );
  });

  r.post("/richieste/:id", richiedePermesso("richieste.modifica"), async (req, res) => {
    const a = auth(res)!;
    const id = String(req.params.id);
    const x = await d.store.richieste.perId(id);
    const s = stato(req.body?.stato);
    if (!x || !s) return res.status(400).send("Dati non validi.");
    const note = String(req.body?.note ?? "").slice(0, 5000);
    await d.store.richieste.aggiorna(id, { stato: s, note, eliminareDopo: nuovoTermine(s, new Date(d.now())) });
    if (s !== x.stato) await registra(d, req, a.utente.id, "richiesta.stato", id, { da: x.stato, a: s });
    res.redirect(303, `/admin/richieste/${id}?ok=1`);
  });

  r.post("/richieste/:id/elimina", richiedePermesso("richieste.elimina"), async (req, res) => {
    const a = auth(res)!;
    const id = String(req.params.id);
    if (req.body?.conferma !== "si") return res.redirect(303, `/admin/richieste/${id}`);
    await d.store.richieste.elimina(id);
    await registra(d, req, a.utente.id, "richiesta.eliminata", id);
    res.redirect(303, "/admin/richieste");
  });

  return r;
}
