// Impostazioni → Email (Brevo): ключ (шифрован, не се показва отново), подател, получател, проверка на връзката
// и тестово писмо. Само MASTER и ADMIN. Спецификация т. 20–23.
import { Router } from "express";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { pagina, avviso, csrf, esc, data } from "./html.js";
import { auth } from "../auth/sessione.js";
import { richiedePermesso } from "../auth/guards.js";
import { EMAIL_RE } from "../email/configurazione.js";

export function rotteImpostazioni(d: AdminDeps): Router {
  const r = Router();
  r.use("/impostazioni", richiedePermesso("impostazioni.gestisci"));

  async function mostra(res: Parameters<Parameters<typeof r.get>[1]>[1], msg: string, valori?: Record<string, string>) {
    const a = auth(res)!;
    const c = await d.email.leggi();
    const coda = await d.email.codaChiave();
    const salvate = await d.store.impostazioni.leggi("email");
    const v = valori ?? { mittente: c.mittente, nomeMittente: c.nomeMittente, destinatario: c.destinatario };
    const fonte = c.fonte === "pannello" ? "impostazioni del pannello" : c.fonte === "ambiente" ? "file di configurazione del server (.env)" : "nessuna: le notifiche non partono";
    res.set("cache-control", "no-store").send(
      pagina({
        titolo: "Impostazioni email (Brevo)",
        auth: a,
        attivo: "/admin/impostazioni",
        corpo: `${msg}<section class="scheda"><h2>Stato</h2><dl class="dati"><div><dt>Configurazione in uso</dt><dd>${esc(fonte)}</dd></div><div><dt>Chiave API</dt><dd>${
          coda ? `configurata (termina con <code>…${esc(coda)}</code>)` : "non configurata"
        }</dd></div><div><dt>Ultima modifica</dt><dd>${data(salvate?.aggiornatoIl ?? null)}</dd></div></dl>
<p class="nota">Le richieste dal modulo vengono sempre salvate nel pannello; l'email è solo un avviso. Il mittente deve essere un indirizzo verificato in Brevo (Mittenti, domini e IP dedicati).</p>
<div class="azioni-riga"><form method="post" action="/admin/impostazioni/verifica">${csrf(a)}<button class="btn btn-sec" type="submit">Verifica connessione</button></form><form method="post" action="/admin/impostazioni/prova">${csrf(a)}<button class="btn btn-sec" type="submit">Invia email di prova</button></form></div></section>
<form method="post" action="/admin/impostazioni" class="scheda stretta">${csrf(a)}<h2>Brevo</h2>
<label for="apiKey">Chiave API (v3)</label><input id="apiKey" name="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="200" placeholder="${coda ? "Lasci vuoto per non cambiarla" : "xkeysib-…"}">
<p class="nota">In Brevo: Impostazioni → SMTP e API → Chiavi API. La chiave viene salvata cifrata e non sarà più mostrata.</p>
<label for="mittente">Email del mittente</label><input id="mittente" name="mittente" type="email" required maxlength="200" value="${esc(v.mittente ?? "")}">
<label for="nomeMittente">Nome del mittente</label><input id="nomeMittente" name="nomeMittente" required maxlength="60" value="${esc(v.nomeMittente ?? "LiftCon")}">
<label for="destinatario">Email che riceve le richieste</label><input id="destinatario" name="destinatario" type="email" required maxlength="200" value="${esc(v.destinatario ?? "")}">
<button class="btn" type="submit">Salva</button></form>`,
      }),
    );
  }

  r.get("/impostazioni", async (req, res) => {
    await mostra(res, req.query.ok ? avviso("ok", "Impostazioni salvate.") : "");
  });

  r.post("/impostazioni", async (req, res) => {
    const a = auth(res)!;
    const v = {
      apiKey: String(req.body?.apiKey ?? "").trim(),
      mittente: String(req.body?.mittente ?? "").trim(),
      nomeMittente: String(req.body?.nomeMittente ?? "").trim().slice(0, 60),
      destinatario: String(req.body?.destinatario ?? "").trim(),
    };
    const errori: string[] = [];
    if (v.apiKey && !/^[A-Za-z0-9_-]{20,200}$/.test(v.apiKey)) errori.push("La chiave API non ha un formato valido.");
    if (!EMAIL_RE.test(v.mittente)) errori.push("Email del mittente non valida.");
    if (!EMAIL_RE.test(v.destinatario)) errori.push("Email del destinatario non valida.");
    if (!v.nomeMittente) errori.push("Inserisca il nome del mittente.");
    if (errori.length) return mostra(res.status(400), avviso("errore", errori.join(" ")), { mittente: v.mittente, nomeMittente: v.nomeMittente, destinatario: v.destinatario });
    const cambiata = await d.email.salva(v, a.utente.id);
    // Никога ключът в регистъра — само дали е сменен.
    await registra(d, req, a.utente.id, "impostazioni.email_salvate", undefined, { chiaveCambiata: cambiata });
    res.redirect(303, "/admin/impostazioni?ok=1");
  });

  r.post("/impostazioni/verifica", async (req, res) => {
    const a = auth(res)!;
    const e = await d.email.verifica();
    await registra(d, req, a.utente.id, "impostazioni.email_verificata", undefined, { ok: e.ok, stato: e.stato ?? null });
    const c = await d.email.leggi();
    const msg = !e.ok
      ? avviso("errore", e.errore ?? "Verifica non riuscita.")
      : e.mittenteAttivo
        ? avviso("ok", `Connessione riuscita (account: ${e.account || "Brevo"}). Il mittente ${c.mittente} è attivo.`)
        : avviso("info", `Connessione riuscita (account: ${e.account || "Brevo"}), ma il mittente ${c.mittente || "—"} non è tra quelli attivi${e.mittentiAttivi.length ? ` (${e.mittentiAttivi.join(", ")})` : ""}: lo verifichi in Brevo.`);
    await mostra(res, msg);
  });

  r.post("/impostazioni/prova", async (req, res) => {
    const a = auth(res)!;
    try {
      await d.email.mailer().send({ subject: "LiftCon: email di prova", text: `Email di prova inviata dal pannello LiftCon da ${a.utente.nome}.\nSe la ricevi, le notifiche delle richieste funzionano.` });
      await registra(d, req, a.utente.id, "impostazioni.email_prova", undefined, { ok: true });
      await mostra(res, avviso("ok", `Email di prova inviata a ${(await d.email.leggi()).destinatario}.`));
    } catch (err) {
      await registra(d, req, a.utente.id, "impostazioni.email_prova", undefined, { ok: false });
      await mostra(res, avviso("errore", `Invio non riuscito: ${err instanceof Error ? err.message : "errore sconosciuto"}.`));
    }
  });

  return r;
}
