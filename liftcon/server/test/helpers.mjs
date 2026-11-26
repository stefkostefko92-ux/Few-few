// Общи помощници за тестовете на панела: приложение върху Store в паметта, часовник, бисквитки, CSRF.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { createApp } from "../dist/app.js";
import { memoryStore } from "../dist/store/memory.js";
import { gestoreSessioni } from "../dist/auth/sessione.js";
import { sigillo } from "../dist/auth/seal.js";
import { catalogo } from "../dist/content/catalogo.js";
import { pubblicatore } from "../dist/content/pubblica.js";
import { fixedWindowLimiter } from "../dist/rate-limit.js";
import { hashPassword } from "../dist/auth/password.js";
import { totpCodeAt, totpStep } from "../dist/auth/totp.js";
import { gestoreEmail } from "../dist/email/configurazione.js";
import { servizioDocumenti } from "../dist/documenti/servizio.js";
import { archivio } from "../dist/documenti/archivio.js";
import { CATALOGO } from "../dist/documenti/condiviso/catalogo/index.js";
import { registroEliminazioni } from "../dist/eliminazioni.js";

/** Двойник на Brevo: записва заявките, отговаря според `risposte` (по път). Нищо не излиза навън. */
export function brevoFinto(risposte = {}) {
  const chiamate = [];
  const fetchFinto = async (url, init) => {
    chiamate.push({ url, init });
    const path = new URL(url).pathname;
    const r = risposte[path] ?? { status: path.endsWith("/smtp/email") ? 201 : 200, body: {} };
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { chiamate, fetch: fetchFinto };
}

export const SITE_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ORIGIN = "https://liftcon.it";
export const SEAL = "a".repeat(64);
let defaultsFile;

export function defaults() {
  if (!defaultsFile) {
    defaultsFile = join(mkdtempSync(join(tmpdir(), "liftcon-def-")), "defaults.json");
    execFileSync(process.execPath, [join(SITE_SRC, "build.mjs"), "--dump-content", defaultsFile]);
  }
  return defaultsFile;
}

export async function setup({ siteSrc = SITE_SRC, brevo = brevoFinto(), mailerDaPannello = false } = {}) {
  const clock = { t: Date.UTC(2026, 10, 26, 10, 0, 0) };
  const store = memoryStore({ now: () => clock.t });
  const logger = pino({ level: "silent" });
  const sig = sigillo(SEAL);
  const siteDir = mkdtempSync(join(tmpdir(), "liftcon-site-"));
  const dataDir = mkdtempSync(join(tmpdir(), "liftcon-data-"));
  const elimDir = mkdtempSync(join(tmpdir(), "liftcon-elim-"));
  const cat = catalogo(store, defaults());
  const admin = {
    store,
    sessioni: gestoreSessioni({ store, jwtSecret: "x".repeat(40), produzione: false, now: () => clock.t }),
    sigillo: sig,
    catalogo: cat,
    pubblicatore: pubblicatore({ store, catalogo: cat, siteSrc, siteDir, siteUrl: ORIGIN }),
    logger,
    origine: ORIGIN,
    limiteAccesso: fixedWindowLimiter(1000, 60_000),
    now: () => clock.t,
    siteDir,
    email: gestoreEmail({ store, sigillo: sig, env: { nomeMittente: "LiftCon" }, fetch: brevo.fetch }),
    documenti: servizioDocumenti({ store, archivio: archivio(dataDir), catalogo: CATALOGO, now: () => clock.t }),
    eliminazioni: registroEliminazioni(elimDir, () => clock.t),
  };
  const sent = [];
  const mailer = mailerDaPannello ? admin.email.mailer() : { async send(m) { sent.push(m); } };
  const app = createApp({ mailer, logger, allowedOrigin: ORIGIN, store, admin, baseUrl: ORIGIN, now: () => clock.t, limiter: fixedWindowLimiter(1000, 60_000) });
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, sig, clock, base, sent, siteDir, dataDir, elimDir, admin, brevo, close: () => new Promise((r) => server.close(r)) };
}

/** Клиент с бисквитки (един браузър). */
export function client(base) {
  let cookie = "";
  async function req(path, { method = "GET", form, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { ...(cookie ? { cookie } : {}), ...(form ? { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      cookie = v ? `${k}=${v}` : "";
      if (/expires=Thu, 01 Jan 1970/i.test(c)) cookie = "";
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get("location"), text, headers: res.headers };
  }
  return { req, get cookie() { return cookie; } };
}

export const csrfDa = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1] ?? "";

export async function creaUtente(store, { email = "master@liftcon.it", nome = "Mario Bianchi", ruolo = "MASTER", password = "una frase lunga e sicura 2026", conTotp = true, sig } = {}) {
  const u = await store.utenti.crea({ email, nome, ruolo, passwordHash: await hashPassword(password), cambiarePassword: false });
  const segreto = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  if (conTotp) await store.utenti.aggiorna(u.id, { totpSecretEnc: sig.cifra("totp-v1", segreto), totpAttivaDal: new Date() });
  return { u, password, segreto };
}

export const codice = (segreto, clock) => totpCodeAt(segreto, totpStep(Math.floor(clock.t / 1000)));

/** Вход до пълна сесия (парола + TOTP). */
export async function entra(c, clock, { email, password, segreto }) {
  let r = await c.req("/admin/login", { method: "POST", form: { email, password } });
  if (r.status !== 303) throw new Error(`login ${r.status}`);
  r = await c.req("/admin/2fa");
  r = await c.req("/admin/2fa", { method: "POST", form: { _csrf: csrfDa(r.text), codice: codice(segreto, clock) } });
  if (r.status !== 303) throw new Error(`2fa ${r.status}: ${r.text.slice(0, 200)}`);
  return r;
}
