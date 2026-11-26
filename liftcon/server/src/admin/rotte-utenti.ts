// Потребители (роли, деактивиране, нулиране на 2FA и парола), профил (парола, резервни кодове) и регистър.
// Временните пароли се показват веднъж; всяка смяна на сигурността прекратява сесиите на човека.
import { Router } from "express";
import { randomInt } from "node:crypto";
import type { AdminDeps } from "./deps.js";
import { registra } from "./deps.js";
import { pagina, avviso, csrf, esc, data } from "./html.js";
import { auth } from "../auth/sessione.js";
import { richiedePermesso } from "../auth/guards.js";
import { puoGestire, ETICHETTE_RUOLO } from "../auth/ruoli.js";
import { hashPassword, verificaPassword, problemaPassword, MESSAGGI_PASSWORD } from "../auth/password.js";
import { verifyTotp } from "../auth/totp.js";
import { nuoviCodici } from "../auth/recupero.js";
import { RUOLI, type Ruolo, type Utente } from "../store/types.js";

const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const passwordTemporanea = (): string => Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
const ruoloValido = (v: unknown): Ruolo | null => ((RUOLI as readonly string[]).includes(String(v)) ? (v as Ruolo) : null);

export function rotteUtenti(d: AdminDeps): Router {
  const r = Router();

  // Временната парола се показва директно в отговора (никога в адреса: щеше да остане в логовете и в историята).
  async function mostraUtenti(res: Parameters<Parameters<typeof r.get>[1]>[1], msg: string) {
    const a = auth(res)!;
    const utenti = await d.store.utenti.tutti();
    const ruoliAssegnabili = RUOLI.filter((x) => puoGestire(a.utente, null, x));
    const opzioni = (sel?: Ruolo) => ruoliAssegnabili.map((x) => `<option value="${x}"${x === sel ? " selected" : ""}>${ETICHETTE_RUOLO[x]}</option>`).join("");
    const righe = utenti
      .map((u) => {
        const gestibile = puoGestire(a.utente, u) && u.id !== a.utente.id;
        const azioni = gestibile
          ? `<form method="post" action="/admin/utenti/${u.id}" class="inline">${csrf(a)}<select name="ruolo" aria-label="Ruolo di ${esc(u.nome)}">${opzioni(u.ruolo)}</select><button class="link" name="azione" value="ruolo">Cambia ruolo</button><button class="link" name="azione" value="${u.attivo ? "disattiva" : "attiva"}">${u.attivo ? "Disattiva" : "Riattiva"}</button><button class="link" name="azione" value="reset2fa">Azzera 2FA</button><button class="link" name="azione" value="resetpw">Nuova password</button></form>`
          : `<span class="nota">${u.id === a.utente.id ? "Lei" : "—"}</span>`;
        return `<tr><td>${esc(u.nome)}<br><span class="nota">${esc(u.email)}</span></td><td>${ETICHETTE_RUOLO[u.ruolo]}</td><td>${u.totpAttivaDal ? "attiva" : "da configurare"}</td><td>${u.attivo ? "attivo" : "disattivato"}</td><td>${data(u.ultimoAccesso)}</td><td>${azioni}</td></tr>`;
      })
      .join("");
    res.set("cache-control", "no-store").send(
      pagina({
        titolo: "Utenti",
        auth: a,
        attivo: "/admin/utenti",
        corpo: `${msg}<div class="tabella-wrap" tabindex="0"><table class="tabella"><thead><tr><th>Utente</th><th>Ruolo</th><th>2FA</th><th>Stato</th><th>Ultimo accesso</th><th>Azioni</th></tr></thead><tbody>${righe}</tbody></table></div>
<form method="post" action="/admin/utenti" class="scheda stretta">${csrf(a)}<h2>Nuovo utente</h2><label for="nome">Nome e cognome</label><input id="nome" name="nome" required maxlength="100"><label for="email">Email</label><input id="email" name="email" type="email" required maxlength="200"><label for="ruolo">Ruolo</label><select id="ruolo" name="ruolo">${opzioni("OPERATORE")}</select><button class="btn" type="submit">Crea utente</button><p class="nota">Viene generata una password temporanea; al primo accesso l'utente la cambia e attiva la verifica in due passaggi.</p></form>`,
      }),
    );
  }

  const avvisoPw = (pw: string) => avviso("info", `Password temporanea (mostrata una sola volta): ${pw} — la comunichi di persona; al primo accesso andrà cambiata.`);

  r.get("/utenti", richiedePermesso("utenti.gestisci"), async (req, res) => {
    await mostraUtenti(res, req.query.ok ? avviso("ok", "Modifica salvata.") : req.query.errore ? avviso("errore", String(req.query.errore).slice(0, 200)) : "");
  });

  r.post("/utenti", richiedePermesso("utenti.gestisci"), async (req, res) => {
    const a = auth(res)!;
    const nome = String(req.body?.nome ?? "").trim().slice(0, 100);
    const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 200);
    const ruolo = ruoloValido(req.body?.ruolo);
    if (!nome || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || !ruolo || !puoGestire(a.utente, null, ruolo)) return res.redirect(303, "/admin/utenti?errore=Dati+non+validi+o+ruolo+non+consentito");
    if (await d.store.utenti.perEmail(email)) return res.redirect(303, "/admin/utenti?errore=Email+gi%C3%A0+registrata");
    const pw = passwordTemporanea();
    const u = await d.store.utenti.crea({ nome, email, ruolo, passwordHash: await hashPassword(pw), cambiarePassword: true });
    await registra(d, req, a.utente.id, "utente.creato", u.id, { ruolo });
    await mostraUtenti(res, avvisoPw(pw));
  });

  r.post("/utenti/:id", richiedePermesso("utenti.gestisci"), async (req, res) => {
    const a = auth(res)!;
    const u = await d.store.utenti.perId(String(req.params.id));
    if (!u || u.id === a.utente.id || !puoGestire(a.utente, u)) return res.redirect(303, "/admin/utenti?errore=Operazione+non+consentita");
    const azione = String(req.body?.azione ?? "");
    let patch: Partial<Utente> = {};
    let pw: string | null = null;
    if (azione === "ruolo") {
      const ruolo = ruoloValido(req.body?.ruolo);
      if (!ruolo || !puoGestire(a.utente, u, ruolo)) return res.redirect(303, "/admin/utenti?errore=Ruolo+non+consentito");
      patch = { ruolo };
    } else if (azione === "disattiva") patch = { attivo: false };
    else if (azione === "attiva") patch = { attivo: true, tentativiFalliti: 0, bloccatoFino: null };
    else if (azione === "reset2fa") patch = { totpSecretEnc: null, totpAttivaDal: null, totpUltimoPasso: null, codiciRecupero: [] };
    else if (azione === "resetpw") {
      pw = passwordTemporanea();
      patch = { passwordHash: await hashPassword(pw), cambiarePassword: true, tentativiFalliti: 0, bloccatoFino: null };
    } else return res.redirect(303, "/admin/utenti");
    await d.store.utenti.aggiorna(u.id, patch);
    await d.store.sessioni.eliminaDiUtente(u.id);
    await registra(d, req, a.utente.id, `utente.${azione}`, u.id, azione === "ruolo" ? { da: u.ruolo, a: patch.ruolo } : undefined);
    if (pw) await mostraUtenti(res, avvisoPw(pw));
    else res.redirect(303, "/admin/utenti?ok=1");
  });

  r.get("/profilo", (req, res) => {
    const a = auth(res)!;
    const u = a.utente;
    const msg = req.query.primo ? avviso("info", "Primo accesso: imposti una password personale per continuare.") : req.query.ok ? avviso("ok", "Password aggiornata.") : req.query.errore ? avviso("errore", String(req.query.errore).slice(0, 200)) : "";
    res.send(
      pagina({
        titolo: "Profilo",
        auth: a,
        attivo: "/admin/profilo",
        corpo: `${msg}<form method="post" action="/admin/profilo/password" class="scheda stretta">${csrf(a)}<h2>Password</h2><input type="hidden" name="username" value="${esc(u.email)}" autocomplete="username"><label for="attuale">Password attuale</label><input id="attuale" name="attuale" type="password" autocomplete="current-password" required><label for="nuova">Nuova password (almeno 12 caratteri; meglio una frase)</label><input id="nuova" name="nuova" type="password" autocomplete="new-password" required minlength="12" maxlength="256"><label for="conferma">Ripeta la nuova password</label><input id="conferma" name="conferma" type="password" autocomplete="new-password" required><button class="btn" type="submit">Cambia password</button><p class="nota">Il cambio chiude tutte le altre sessioni.</p></form>
${u.cambiarePassword ? "" : `<form method="post" action="/admin/profilo/codici" class="scheda stretta">${csrf(a)}<h2>Codici di recupero</h2><p>Ne restano ${u.codiciRecupero.length}. Generarne di nuovi annulla quelli vecchi.</p><label for="codice">Codice dell'app (6 cifre)</label><input id="codice" name="codice" inputmode="numeric" autocomplete="one-time-code" required maxlength="8"><button class="btn btn-sec" type="submit">Genera nuovi codici</button></form>`}
<p class="nota">Ruolo: ${ETICHETTE_RUOLO[u.ruolo]} · Verifica in due passaggi attiva dal ${data(u.totpAttivaDal)}</p>`,
      }),
    );
  });

  r.post("/profilo/password", async (req, res) => {
    const a = auth(res)!;
    const u = a.utente;
    const nuova = String(req.body?.nuova ?? "");
    if (!(await verificaPassword(u.passwordHash, String(req.body?.attuale ?? "")))) return res.redirect(303, "/admin/profilo?errore=Password+attuale+non+corretta");
    if (nuova !== String(req.body?.conferma ?? "")) return res.redirect(303, "/admin/profilo?errore=Le+due+password+non+coincidono");
    const problema = problemaPassword(nuova, [u.email, u.nome]);
    if (problema) return res.redirect(303, `/admin/profilo?errore=${encodeURIComponent(MESSAGGI_PASSWORD[problema])}`);
    if (await verificaPassword(u.passwordHash, nuova)) return res.redirect(303, "/admin/profilo?errore=La+nuova+password+deve+essere+diversa");
    await d.store.utenti.aggiorna(u.id, { passwordHash: await hashPassword(nuova), cambiarePassword: false });
    await d.store.sessioni.eliminaDiUtente(u.id);
    await d.sessioni.apri(res, { ...u, cambiarePassword: false }, "COMPLETA");
    await registra(d, req, u.id, "password.cambiata");
    res.redirect(303, "/admin/profilo?ok=1");
  });

  r.post("/profilo/codici", async (req, res) => {
    const a = auth(res)!;
    const u = a.utente;
    const passo = u.totpSecretEnc ? verifyTotp(d.sigillo.decifra("totp-v1", u.totpSecretEnc), String(req.body?.codice ?? ""), u.totpUltimoPasso, Math.floor(d.now() / 1000)) : null;
    if (passo === null) return res.redirect(303, "/admin/profilo?errore=Codice+non+valido");
    const { codici, hmac } = nuoviCodici(d.sigillo);
    await d.store.utenti.aggiorna(u.id, { codiciRecupero: hmac, totpUltimoPasso: passo });
    await registra(d, req, u.id, "2fa.nuovi_codici");
    res.set("cache-control", "no-store").send(
      pagina({
        titolo: "Nuovi codici di recupero",
        auth: a,
        corpo: `<div class="scheda stretta"><p>I vecchi codici non valgono più. Conservi questi in un luogo sicuro: non verranno mostrati di nuovo.</p><ul class="codici">${codici.map((c) => `<li><code>${c}</code></li>`).join("")}</ul><a class="btn" href="/admin/profilo">Fatto</a></div>`,
      }),
    );
  });

  r.get("/registro", richiedePermesso("registro.leggi"), async (req, res) => {
    const a = auth(res)!;
    const pag = Math.max(1, Math.min(1000, Number(req.query.p) || 1));
    const eventi = await d.store.eventi.ultimi(50, (pag - 1) * 50);
    const nomi = new Map((await d.store.utenti.tutti()).map((u) => [u.id, u.nome]));
    const righe = eventi
      .map((e) => `<tr><td>${data(e.creatoIl)}</td><td>${esc(e.utenteId ? (nomi.get(e.utenteId) ?? "utente eliminato") : "—")}</td><td><code>${esc(e.azione)}</code></td><td>${esc(e.oggetto ?? "")}</td><td>${e.dettagli ? `<code>${esc(JSON.stringify(e.dettagli))}</code>` : ""}</td></tr>`)
      .join("");
    res.send(
      pagina({
        titolo: "Registro delle attività",
        auth: a,
        attivo: "/admin/registro",
        corpo: `<p class="nota">Accessi, modifiche e pubblicazioni degli ultimi 12 mesi. Gli indirizzi IP sono conservati solo in forma non reversibile.</p><div class="tabella-wrap" tabindex="0"><table class="tabella"><thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Oggetto</th><th>Dettagli</th></tr></thead><tbody>${righe}</tbody></table></div><nav class="pagine" aria-label="Pagine">${pag > 1 ? `<a href="?p=${pag - 1}">Più recenti</a>` : ""}${eventi.length === 50 ? `<a href="?p=${pag + 1}">Meno recenti</a>` : ""}</nav>`,
      }),
    );
  });

  return r;
}
