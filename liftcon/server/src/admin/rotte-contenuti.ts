// Съдържанието: списък, редакция (чернова в базата + история), преглед, връщане към стойността от репото,
// скриване на ръководство, ново ръководство и публикуване. Спецификация т. 13–16.
import { Router } from "express";
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { pagina, avviso, csrf, esc, data } from "./html.js";
import { campiForm } from "./form-contenuti.js";
import { auth } from "../auth/sessione.js";
import { richiedePermesso } from "../auth/guards.js";
import { puo } from "../auth/ruoli.js";
import { leggiForm, CAMPI, type Valori } from "../content/campi.js";
import { randomToken } from "../auth/seal.js";

const TIPI: Record<string, string> = { site: "Dati del sito", servizio: "Servizio", guida: "Guida", "faq-home": "FAQ", glossario: "Glossario" };
const idValido = (id: string) => /^(site|faq-home|glossario|servizio:[a-z]+|guida:[a-z0-9-]+)$/.test(id);
const urlEntita = (id: string) => `/admin/contenuti/e/${encodeURIComponent(id)}`;

export function rotteContenuti(d: AdminDeps): Router {
  const r = Router();
  r.use(["/contenuti", "/anteprima"], richiedePermesso("contenuti.modifica"));

  r.get("/contenuti", async (req, res) => {
    const a = auth(res)!;
    const voci = await d.catalogo.elenco();
    const pubb = await d.store.pubblicazioni.ultime(5);
    const modificate = voci.filter((v) => v.modificata).length;
    const pubblica = puo(a.utente.ruolo, "contenuti.pubblica")
      ? `<form method="post" action="/admin/contenuti/pubblica" class="scheda pubblica">${csrf(a)}<h2>Pubblicazione</h2><p>${modificate} contenuti modificati rispetto ai valori predefiniti. La pubblicazione rigenera tutto il sito; se qualcosa va storto, il sito online non cambia.</p><button class="btn" type="submit">Pubblica il sito</button>${
          pubb.length
            ? `<ul class="elenco">${pubb.map((p) => `<li>${data(p.iniziataIl)} — ${p.esito === "OK" ? "riuscita" : p.esito === "ERRORE" ? `non riuscita` : "in corso"}${p.errore ? `<details><summary>Dettagli</summary><pre>${esc(p.errore)}</pre></details>` : ""}</li>`).join("")}</ul>`
            : ""
        }</form>`
      : "";
    const righe = voci
      .map(
        (v) =>
          `<tr><td><a href="${urlEntita(v.id)}">${esc(v.titolo)}</a></td><td>${TIPI[v.tipo] ?? v.tipo}</td><td>${v.nascosta ? '<span class="badge">nascosta</span>' : v.nuova ? '<span class="badge badge-nuova">nuova</span>' : v.modificata ? '<span class="badge badge-in_lavorazione">modificata</span>' : "predefinito"}</td><td>${data(v.aggiornataIl)}</td><td>${v.path && !v.nascosta ? `<a href="${esc(v.path)}" target="_blank" rel="noopener">Vedi</a>` : ""}</td></tr>`,
      )
      .join("");
    res.send(
      pagina({
        titolo: "Contenuti",
        auth: a,
        attivo: "/admin/contenuti",
        corpo: `${req.query.pubblicato ? avviso("ok", "Sito pubblicato.") : ""}${req.query.errore ? avviso("errore", "Pubblicazione non riuscita: il sito online non è cambiato. Vedi i dettagli qui sotto.") : ""}${pubblica}
<p><a class="btn btn-sec" href="/admin/contenuti/nuova-guida">Nuova guida</a></p>
<div class="tabella-wrap" tabindex="0"><table class="tabella"><thead><tr><th>Contenuto</th><th>Tipo</th><th>Stato</th><th>Aggiornato</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>`,
      }),
    );
  });

  r.post("/contenuti/pubblica", richiedePermesso("contenuti.pubblica"), async (req, res) => {
    const a = auth(res)!;
    const esito = await d.pubblicatore.pubblica(a.utente.id);
    await registra(d, req, a.utente.id, esito.ok ? "sito.pubblicato" : "sito.pubblicazione_fallita", esito.versione);
    res.redirect(303, `/admin/contenuti?${esito.ok ? "pubblicato=1" : "errore=1"}`);
  });

  r.get("/contenuti/nuova-guida", (req, res) => {
    const a = auth(res)!;
    res.send(
      pagina({
        titolo: "Nuova guida",
        auth: a,
        attivo: "/admin/contenuti",
        corpo: `${req.query.errore ? avviso("errore", "Indirizzo non valido o già usato: solo lettere minuscole, numeri e trattini.") : ""}<form method="post" action="/admin/contenuti/nuova-guida" class="scheda stretta">${csrf(a)}<label for="slug">Indirizzo della guida</label><p class="nota">Diventa liftcon.it/guide/<em>indirizzo</em>/ — per esempio «sostituzione-porte-ascensore».</p><input id="slug" name="slug" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*"><button class="btn" type="submit">Crea e modifica</button></form>`,
      }),
    );
  });

  r.post("/contenuti/nuova-guida", async (req, res) => {
    const a = auth(res)!;
    const slug = String(req.body?.slug ?? "").trim();
    const id = `guida:${slug}`;
    if (!d.catalogo.slugValido(slug) || d.catalogo.esisteSlug(slug) || (await d.store.contenuti.perId(id))) return res.redirect(303, "/admin/contenuti/nuova-guida?errore=1");
    await d.catalogo.salva(id, { valori: {}, nuova: true, nascosta: true }, a.utente.id);
    await registra(d, req, a.utente.id, "contenuto.guida_creata", id);
    res.redirect(303, urlEntita(id));
  });

  async function mostra(res: Parameters<Parameters<typeof r.get>[1]>[1], id: string, valori: Valori, errori: Record<string, string>, msg = "") {
    const a = auth(res)!;
    const info = await d.catalogo.valori(id);
    const tipo = info?.tipo ?? id.split(":")[0] ?? "";
    const salvato = info?.salvato;
    const revisioni = await d.store.contenuti.revisioni(id, 5);
    const base = urlEntita(id);
    const guida = tipo === "guida";
    res.status(Object.keys(errori).length ? 400 : 200).send(
      pagina({
        titolo: `Modifica: ${String(valori.h1 ?? valori.nome ?? TIPI[tipo] ?? id).slice(0, 80) || id}`,
        auth: a,
        attivo: "/admin/contenuti",
        corpo: `${msg}${Object.keys(errori).length ? avviso("errore", "Controlli i campi segnalati: le modifiche non sono state salvate.") : ""}
<p class="nota">Le modifiche salvate vanno online con «Pubblica il sito». ${salvato ? "Questo contenuto è modificato rispetto al predefinito." : "Questo contenuto usa i valori predefiniti."}</p>
<form method="post" action="${base}" class="modulo">${csrf(a)}${campiForm(tipo, valori, errori)}
<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn btn-sec" type="submit" formaction="${base}/anteprima" formtarget="_blank">Anteprima</button></div></form>
${guida ? `<form method="post" action="${base}/visibilita" class="scheda">${csrf(a)}<p>${salvato?.nascosta ? "La guida è nascosta: non compare sul sito." : "La guida è visibile sul sito."}</p><button class="btn btn-sec" type="submit">${salvato?.nascosta ? "Mostra sul sito" : "Nascondi dal sito"}</button></form>` : ""}
${salvato && !salvato.nuova ? `<form method="post" action="${base}/ripristina" class="scheda pericolo">${csrf(a)}<label class="spunta"><input type="checkbox" name="conferma" value="si" required> Torna ai valori predefiniti (le modifiche vengono annullate)</label><button class="btn btn-pericolo" type="submit">Ripristina</button></form>` : ""}
${revisioni.length ? `<section class="scheda"><h2>Versioni salvate</h2><ul class="elenco">${revisioni.map((v) => `<li>${data(v.creataIl)}</li>`).join("")}</ul></section>` : ""}`,
      }),
    );
  }

  r.get("/contenuti/e/:id", async (req, res) => {
    const id = String(req.params.id);
    const info = idValido(id) ? await d.catalogo.valori(id) : null;
    if (!info) return res.status(404).send(pagina({ titolo: "Contenuto non trovato", auth: auth(res), corpo: `<p><a href="/admin/contenuti">Torna ai contenuti</a></p>` }));
    await mostra(res, id, info.valori, {}, req.query.ok ? avviso("ok", "Salvato. Per metterlo online: «Pubblica il sito».") : "");
  });

  r.post("/contenuti/e/:id", async (req, res) => {
    const a = auth(res)!;
    const id = String(req.params.id);
    const info = idValido(id) ? await d.catalogo.valori(id) : null;
    if (!info || !CAMPI[info.tipo]) return res.status(404).send("Contenuto non trovato.");
    const { valori, errori } = leggiForm(info.tipo, req.body ?? {});
    if (Object.keys(errori).length) return mostra(res, id, valori, errori);
    await d.catalogo.salva(id, { valori, ...(info.salvato?.nuova ? { nuova: true } : {}), ...(info.salvato?.nascosta ? { nascosta: true } : {}) }, a.utente.id);
    await registra(d, req, a.utente.id, "contenuto.salvato", id);
    res.redirect(303, `${urlEntita(id)}?ok=1`);
  });

  r.post("/contenuti/e/:id/anteprima", async (req, res) => {
    const id = String(req.params.id);
    const info = idValido(id) ? await d.catalogo.valori(id) : null;
    if (!info) return res.status(404).send("Contenuto non trovato.");
    const { valori, errori } = leggiForm(info.tipo, req.body ?? {});
    if (Object.keys(errori).length) return mostra(res, id, valori, errori);
    const token = randomToken(12);
    try {
      const out = await d.pubblicatore.anteprima(token, { id, dati: { valori, nuova: Boolean(info.salvato?.nuova) } });
      if (out === null) return res.status(429).send("Un'altra anteprima o una pubblicazione è in corso: riprovi tra qualche secondo.");
    } catch (err) {
      d.logger.error({ event: "anteprima", esito: "errore", err: err instanceof Error ? err.message.slice(0, 300) : "?" });
      return res.status(500).send("Anteprima non riuscita: controlli i campi.");
    }
    const voce = (await d.catalogo.elenco()).find((v) => v.id === id);
    res.redirect(303, `/admin/anteprima/${token}${voce?.path ?? "/"}`);
  });

  r.post("/contenuti/e/:id/ripristina", async (req, res) => {
    const a = auth(res)!;
    const id = String(req.params.id);
    if (!idValido(id) || req.body?.conferma !== "si") return res.redirect(303, urlEntita(id));
    await d.catalogo.ripristina(id);
    await registra(d, req, a.utente.id, "contenuto.ripristinato", id);
    res.redirect(303, "/admin/contenuti");
  });

  r.post("/contenuti/e/:id/visibilita", async (req, res) => {
    const a = auth(res)!;
    const id = String(req.params.id);
    const info = id.startsWith("guida:") && idValido(id) ? await d.catalogo.valori(id) : null;
    if (!info) return res.status(404).send("Contenuto non trovato.");
    const nascosta = !info.salvato?.nascosta;
    // Нова guida без попълнени полета не се показва (записаните стойности вече са минали проверката на формата).
    if (!nascosta && info.salvato?.nuova && !info.valori.h1) {
      return mostra(res, id, info.valori, {}, avviso("errore", "Completi e salvi tutti i campi prima di mostrare la guida sul sito."));
    }
    await d.catalogo.salva(id, { valori: info.valori, ...(info.salvato?.nuova ? { nuova: true } : {}), nascosta }, a.utente.id);
    await registra(d, req, a.utente.id, nascosta ? "contenuto.nascosto" : "contenuto.mostrato", id);
    res.redirect(303, `${urlEntita(id)}?ok=1`);
  });

  // Прегледът: файловете от anteprime/<token>/ (само за влезли с право на редакция; без излизане от папката).
  r.get(/^\/anteprima\/([A-Za-z0-9_-]{8,40})(\/.*)?$/, (req, res) => {
    const params = req.params as unknown as Record<string, string | undefined>;
    const token = params[0] ?? "";
    const rel = decodeURIComponent(params[1] ?? "/");
    const radice = resolve(join(d.siteDir, "anteprime", token));
    let file = resolve(join(radice, rel));
    if (!file.startsWith(radice + sep) && file !== radice) return res.status(400).send("Percorso non valido.");
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return res.status(404).send("Anteprima scaduta: la rigeneri dal modulo.");
    res.set("cache-control", "no-store").set("x-robots-tag", "noindex").sendFile(file);
  });

  return r;
}
