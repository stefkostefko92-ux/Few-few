// Вход: имейл + парола → сесия PARZIALE → TOTP или резервен код → сесия COMPLETA.
// Първа настройка на 2FA (задължителна), изход. Спецификация т. 1–8.
import { Router, type Request } from "express";
import QRCode from "qrcode";
import type { AdminDeps } from "./deps.js";
import { registra, dopoSicuro } from "./deps.js";
import { pagina, avviso, csrf, esc } from "./html.js";
import { auth } from "../auth/sessione.js";
import { richiedeSessioneParziale } from "../auth/guards.js";
import { verificaPassword, verificaFittizia } from "../auth/password.js";
import { generateTotpSecret, verifyTotp, otpauthUrl, segretoLeggibile } from "../auth/totp.js";
import { nuoviCodici, trovaCodice } from "../auth/recupero.js";
import { clientKey } from "../rate-limit.js";
import { accessoAdmin } from "../auth/ruoli.js";
import type { Utente } from "../store/types.js";

export const MAX_TENTATIVI = 5;
export const BLOCCO_MS = 15 * 60_000;
const ERRORE_ACCESSO = "Email o password non corretti.";

/** `a` — съществуваща сесия (напр. непълна): тогава формата носи и нейния CSRF токен. */
function formLogin(errore = "", dopo = "/admin", a?: Parameters<typeof csrf>[0]): string {
  return pagina({
    titolo: "Accesso",
    semplice: true,
    corpo: `${errore ? avviso("errore", errore) : ""}<form method="post" action="/admin/login" class="scheda stretta">${csrf(a)}
<input type="hidden" name="dopo" value="${esc(dopo)}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="200" autofocus>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
<button class="btn" type="submit">Accedi</button>
<p class="nota">L'accesso richiede la verifica in due passaggi (app di autenticazione).</p>
</form>`,
  });
}

function form2fa(a: Parameters<typeof csrf>[0], errore = "", dopo = "/admin"): string {
  const azione = dopo === "/admin" ? "/admin/2fa" : `/admin/2fa?dopo=${encodeURIComponent(dopo)}`;
  return pagina({
    titolo: "Verifica in due passaggi",
    semplice: true,
    auth: a,
    corpo: `${errore ? avviso("errore", errore) : ""}<form method="post" action="${esc(azione)}" class="scheda stretta">${csrf(a)}
<label for="codice">Codice dell'app (6 cifre) o codice di recupero</label>
<input id="codice" name="codice" inputmode="numeric" autocomplete="one-time-code" required maxlength="20" autofocus>
<button class="btn" type="submit">Verifica</button>
</form><form method="post" action="/admin/logout" class="scheda stretta trasparente">${csrf(a)}<button class="link" type="submit">Annulla ed esci</button></form>`,
  });
}

export function rotteAccesso(d: AdminDeps): Router {
  const r = Router();
  const ora = () => new Date(d.now());

  // Грешна парола и грешен 2FA код се броят заедно; брояч се нулира само след пълен вход (парола + 2FA),
  // иначе нов вход с паролата би дал още 5 опита за кода. Увеличението е атомарно (паралелни заявки).
  async function fallito(req: Request, u: Utente | null, motivo: string): Promise<void> {
    const bloccato = u ? await d.store.utenti.registraFallimento(u.id, MAX_TENTATIVI, new Date(d.now() + BLOCCO_MS)) : false;
    await registra(d, req, u?.id ?? null, bloccato ? "accesso.bloccato" : "accesso.fallito", undefined, { motivo });
  }

  const bloccato = (u: Utente) => Boolean(u.bloccatoFino && u.bloccatoFino.getTime() > d.now());

  r.get("/login", (req, res) => {
    if (auth(res)?.sessione.stato === "COMPLETA") return res.redirect(303, "/admin");
    res.send(formLogin("", dopoSicuro(req.query.dopo), auth(res)));
  });

  r.post("/login", async (req, res) => {
    if (!d.limiteAccesso.hit(`login:${clientKey(req.ip)}`, d.now())) {
      await registra(d, req, null, "accesso.limite");
      return res.status(429).send(formLogin("Troppi tentativi: riprovi tra qualche minuto.", "/admin", auth(res)));
    }
    const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 200);
    const password = String(req.body?.password ?? "");
    const u = email ? await d.store.utenti.perEmail(email) : null;
    if (!u || !u.attivo || !accessoAdmin(u.ruolo)) {
      await verificaFittizia(password);
      await fallito(req, null, "credenziali");
      return res.status(401).send(formLogin(ERRORE_ACCESSO, "/admin", auth(res)));
    }
    if (bloccato(u)) {
      // Същият отговор и същото време като при грешен имейл: заключването не издава, че акаунтът съществува.
      await verificaFittizia(password);
      await registra(d, req, u.id, "accesso.rifiutato_bloccato");
      return res.status(401).send(formLogin(ERRORE_ACCESSO, "/admin", auth(res)));
    }
    if (!(await verificaPassword(u.passwordHash, password))) {
      await fallito(req, u, "password");
      return res.status(401).send(formLogin(ERRORE_ACCESSO, "/admin", auth(res)));
    }
    // Предишна сесия в този браузър (напр. непълна) се затваря: една сесия на вход.
    const prima = auth(res);
    if (prima) await d.store.sessioni.elimina(prima.sessione.id);
    await d.sessioni.apri(res, u, "PARZIALE");
    await registra(d, req, u.id, "accesso.password_ok");
    res.redirect(303, u.totpAttivaDal ? `/admin/2fa?dopo=${encodeURIComponent(dopoSicuro(req.body?.dopo))}` : "/admin/2fa/configura");
  });

  r.get("/2fa", richiedeSessioneParziale(), (req, res) => {
    const a = auth(res)!;
    if (!a.utente.totpAttivaDal) return res.redirect(303, "/admin/2fa/configura");
    res.send(form2fa(a, "", dopoSicuro(req.query.dopo)));
  });

  r.post("/2fa", richiedeSessioneParziale(), async (req, res) => {
    const a = auth(res)!;
    const u = a.utente;
    if (!u.totpAttivaDal || !u.totpSecretEnc) return res.redirect(303, "/admin/2fa/configura");
    const dopo = dopoSicuro(req.query.dopo);
    if (!d.limiteAccesso.hit(`2fa:${clientKey(req.ip)}`, d.now()) || bloccato(u)) {
      return res.status(429).send(form2fa(a, "Troppi tentativi: riprovi tra qualche minuto.", dopo));
    }
    const codice = String(req.body?.codice ?? "");
    const segreto = d.sigillo.decifra("totp-v1", u.totpSecretEnc);
    const passo = verifyTotp(segreto, codice, u.totpUltimoPasso, Math.floor(d.now() / 1000));
    // Кодът се „изразходва“ атомарно в базата: две паралелни заявки със същия код не минават и двете.
    let usatoRecupero = false;
    let accettato = passo !== null && (await d.store.utenti.consumaPassoTotp(u.id, passo));
    if (passo === null) {
      const i = trovaCodice(d.sigillo, u.codiciRecupero, codice);
      const h = i >= 0 ? u.codiciRecupero[i] : undefined;
      accettato = h !== undefined && (await d.store.utenti.consumaCodice(u.id, h));
      usatoRecupero = accettato;
    }
    if (!accettato) {
      await fallito(req, u, "codice_2fa");
      return res.status(401).send(form2fa(a, "Codice non valido.", dopo));
    }
    await d.store.utenti.aggiorna(u.id, { tentativiFalliti: 0, bloccatoFino: null, ultimoAccesso: ora() });
    // Нова сесия след 2FA (без фиксиране на сесията): старата PARZIALE се трие.
    await d.store.sessioni.elimina(a.sessione.id);
    await d.sessioni.apri(res, u, "COMPLETA");
    await registra(d, req, u.id, usatoRecupero ? "accesso.codice_recupero" : "accesso.ok");
    res.redirect(303, dopo);
  });

  r.get("/2fa/configura", richiedeSessioneParziale(), async (req, res) => {
    const a = auth(res)!;
    if (a.utente.totpAttivaDal) return res.redirect(303, "/admin/2fa");
    // Тайната се пази шифрована, но още не е активна (totpAttivaDal празно) до потвърждението с код.
    let segreto: string;
    if (a.utente.totpSecretEnc) segreto = d.sigillo.decifra("totp-v1", a.utente.totpSecretEnc);
    else {
      segreto = generateTotpSecret();
      await d.store.utenti.aggiorna(a.utente.id, { totpSecretEnc: d.sigillo.cifra("totp-v1", segreto) });
    }
    const qr = await QRCode.toDataURL(otpauthUrl("LiftCon", a.utente.email, segreto), { margin: 1, width: 220, errorCorrectionLevel: "M" });
    res.send(
      pagina({
        titolo: "Attivi la verifica in due passaggi",
        semplice: true,
        auth: a,
        corpo: `${req.query.errore ? avviso("errore", "Codice non valido: controlli l'ora del telefono e riprovi.") : ""}<div class="scheda stretta"><p>La verifica in due passaggi è obbligatoria. Inquadri il codice con un'app di autenticazione (Google Authenticator, Microsoft Authenticator, Aegis, 1Password…) e inserisca il codice di 6 cifre.</p>
<img class="qr" src="${qr}" width="220" height="220" alt="Codice QR per l'app di autenticazione">
<p class="nota">Inserimento manuale: <code class="segreto">${esc(segretoLeggibile(segreto))}</code></p>
<form method="post" action="/admin/2fa/configura">${csrf(a)}<label for="codice">Codice di 6 cifre</label><input id="codice" name="codice" inputmode="numeric" autocomplete="one-time-code" required maxlength="8" autofocus><button class="btn" type="submit">Attiva</button></form></div>`,
      }),
    );
  });

  r.post("/2fa/configura", richiedeSessioneParziale(), async (req, res) => {
    const a = auth(res)!;
    const u = a.utente;
    if (u.totpAttivaDal || !u.totpSecretEnc) return res.redirect(303, "/admin/2fa");
    if (!d.limiteAccesso.hit(`2fa:${clientKey(req.ip)}`, d.now())) return res.status(429).send("Troppi tentativi.");
    const segreto = d.sigillo.decifra("totp-v1", u.totpSecretEnc);
    const passo = verifyTotp(segreto, String(req.body?.codice ?? ""), null, Math.floor(d.now() / 1000));
    if (passo === null) {
      await registra(d, req, u.id, "2fa.configurazione_fallita");
      return res.redirect(303, "/admin/2fa/configura?errore=1");
    }
    const { codici, hmac } = nuoviCodici(d.sigillo);
    await d.store.utenti.aggiorna(u.id, { totpAttivaDal: ora(), totpUltimoPasso: passo, codiciRecupero: hmac, ultimoAccesso: ora() });
    await d.store.sessioni.elimina(a.sessione.id);
    await d.sessioni.apri(res, u, "COMPLETA");
    await registra(d, req, u.id, "2fa.attivata");
    res.send(
      pagina({
        titolo: "Codici di recupero",
        semplice: true,
        corpo: `${avviso("ok", "Verifica in due passaggi attivata.")}<div class="scheda stretta"><p>Conservi questi codici in un luogo sicuro: ognuno vale <strong>una sola volta</strong> e serve se perde il telefono. Non verranno mostrati di nuovo.</p><ul class="codici">${codici
          .map((c) => `<li><code>${c}</code></li>`)
          .join("")}</ul><a class="btn" href="/admin">Ho salvato i codici, continua</a></div>`,
      }),
    );
  });

  r.post("/logout", async (req, res) => {
    const a = auth(res);
    if (a) await registra(d, req, a.utente.id, "uscita");
    await d.sessioni.chiudi(req, res);
    // Документите на устройството (IndexedDB, кешът на service worker-а, HTTP кешът) се трият от браузъра.
    res.set("clear-site-data", '"cache", "storage"');
    res.redirect(303, "/admin/login");
  });

  return r;
}
