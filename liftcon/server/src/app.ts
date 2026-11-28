// Express приложението: POST /api/richiesta (форма → имейл) и GET /health. Нищо не се записва;
// в лога — само изход и услуга, никога име, имейл или текст (лични данни).
import express, { type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { Richiesta, sembraBot, riga, ETICHETTE_SERVIZIO } from "./richieste/schema.js";
import { registraRichiesta, testoEmail } from "./richieste/servizio.js";
import type { Store } from "./store/types.js";
import { routerAdmin } from "./admin/index.js";
import type { AdminDeps } from "./admin/deps.js";
import type { Mailer } from "./mailer.js";
import { fixedWindowLimiter, clientKey, type Limiter } from "./rate-limit.js";

export interface AppDeps {
  mailer: Mailer;
  logger: Logger;
  allowedOrigin: string;
  now?: () => number;
  limiter?: Limiter;
  phone?: string;
  /** С база: заявките се пазят и се виждат в /admin; без база — само имейл (както преди). */
  store?: Store;
  baseUrl?: string;
  admin?: AdminDeps;
}

const MSG_DATI = "Alcuni dati non sono validi: controlli i campi e riprovi.";

function vuoleJson(req: Request): boolean {
  return req.is("application/json") === "application/json" || (req.get("accept") ?? "").includes("application/json");
}

function paginaErrore(res: Response, status: number, testo: string): void {
  res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Richiesta non inviata | LiftCon</title><body><h1>Richiesta non inviata</h1><p>${testo}</p><p><a href="/contatti/">Torni al modulo</a></p></body></html>`,
    );
}

export function createApp(deps: AppDeps): express.Express {
  const now = deps.now ?? (() => Date.now());
  const limiter = deps.limiter ?? fixedWindowLimiter(5, 15 * 60_000);
  const phone = deps.phone ?? "+39 379 296 9699";
  const app = express();
  app.disable("x-powered-by");
  // Пред приложението стои само Nginx на същата машина. В Docker (bridge) връзката идва от шлюза на
  // мрежата (172.x/10.x), затова се вярва и на uniquelocal; Nginx ПРЕЗАПИСВА X-Forwarded-For с $remote_addr,
  // така че клиентът не може да подправи адреса си.
  app.set("trust proxy", "loopback, uniquelocal");

  app.get("/health", (_req, res) => {
    res.set("cache-control", "no-store").json({ status: "ok" });
  });

  app.post(
    "/api/richiesta",
    (req, res, next) => {
      const origin = req.get("origin");
      if (origin && origin !== deps.allowedOrigin) {
        deps.logger.warn({ event: "richiesta", esito: "origin_rifiutato" });
        res.status(403).json({ ok: false, message: "Origine non consentita." });
        return;
      }
      if (!limiter.hit(clientKey(req.ip), now())) {
        deps.logger.warn({ event: "richiesta", esito: "limite" });
        if (vuoleJson(req)) res.status(429).json({ ok: false, message: "Troppe richieste: riprovi più tardi." });
        else paginaErrore(res, 429, `Troppe richieste in poco tempo. Riprovi più tardi o chiami il ${phone}.`);
        return;
      }
      next();
    },
    express.json({ limit: "16kb" }),
    express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 20 }),
    async (req, res) => {
      const parsed = Richiesta.safeParse(req.body ?? {});
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))].filter(Boolean);
        deps.logger.info({ event: "richiesta", esito: "dati_non_validi", fields });
        if (vuoleJson(req)) res.status(400).json({ ok: false, message: MSG_DATI, fields });
        else paginaErrore(res, 400, MSG_DATI);
        return;
      }
      const r = parsed.data;
      const ok = () => (vuoleJson(req) ? res.json({ ok: true }) : res.redirect(303, "/contatti/grazie/"));
      if (sembraBot(r)) {
        // На бота отговаряме „успех“, за да не учи кое го издава; писмо не тръгва.
        deps.logger.info({ event: "richiesta", esito: "scartata_bot" });
        ok();
        return;
      }
      let riuscita = false;
      if (deps.store) {
        riuscita = (await registraRichiesta({ store: deps.store, mailer: deps.mailer, logger: deps.logger, baseUrl: deps.baseUrl ?? deps.allowedOrigin }, r)).ok;
      } else {
        try {
          await deps.mailer.send({
            subject: riga(`Richiesta LiftCon: ${ETICHETTE_SERVIZIO[r.servizio]} – ${r.comune}`),
            text: testoEmail(r, undefined),
            replyTo: { email: r.email, name: riga(r.nome) },
          });
          riuscita = true;
        } catch (err) {
          deps.logger.error({ event: "richiesta", esito: "invio_fallito", err: err instanceof Error ? err.message : "sconosciuto" });
        }
      }
      if (!riuscita) {
        const msg = `Invio non riuscito. Riprovi tra poco o ci chiami al ${phone}.`;
        if (vuoleJson(req)) res.status(502).json({ ok: false, message: msg });
        else paginaErrore(res, 502, msg);
        return;
      }
      deps.logger.info({ event: "richiesta", esito: "ricevuta", servizio: r.servizio });
      ok();
    },
  );

  if (deps.admin) app.use("/admin", routerAdmin(deps.admin));

  app.use((_req, res) => {
    res.status(404).json({ ok: false, message: "Non trovato." });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    deps.logger.warn({ event: "errore_http", status });
    const message = status === 413 ? "Richiesta troppo grande: accorci il messaggio." : status < 500 ? MSG_DATI : "Errore interno.";
    if (vuoleJson(req)) res.status(status).json({ ok: false, message });
    else paginaErrore(res, status, message);
  });

  return app;
}
