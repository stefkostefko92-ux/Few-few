// Express приложението: POST /api/richiesta (форма → имейл) и GET /health. Нищо не се записва;
// в лога — само изход и услуга, никога име, имейл или текст (лични данни).
import express, { type Request, type Response, type NextFunction } from "express";
import type { Logger } from "pino";
import { Richiesta, sembraBot, riga, ETICHETTE_SERVIZIO, ETICHETTE_RUOLO, type RichiestaValida } from "./richiesta.js";
import type { Mailer } from "./mailer.js";
import { fixedWindowLimiter, type Limiter } from "./rate-limit.js";

export interface AppDeps {
  mailer: Mailer;
  logger: Logger;
  allowedOrigin: string;
  now?: () => number;
  limiter?: Limiter;
  phone?: string;
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

function testoEmail(r: RichiestaValida): string {
  return [
    "Nuova richiesta dal sito LiftCon",
    "",
    `Nome: ${r.nome}`,
    `Email: ${r.email}`,
    `Telefono: ${r.telefono || "-"}`,
    `Ruolo: ${ETICHETTE_RUOLO[r.ruolo]}`,
    `Comune dell'impianto: ${r.comune}`,
    `Servizio: ${ETICHETTE_SERVIZIO[r.servizio]}`,
    "",
    "Messaggio:",
    r.messaggio,
    "",
    "Informativa privacy letta: sì. I dati non sono salvati sul server del sito.",
  ].join("\n");
}

export function createApp(deps: AppDeps): express.Express {
  const now = deps.now ?? (() => Date.now());
  const limiter = deps.limiter ?? fixedWindowLimiter(5, 15 * 60_000);
  const phone = deps.phone ?? "+39 379 296 9699";
  const app = express();
  app.disable("x-powered-by");
  // Пред приложението стои само Nginx на същата машина.
  app.set("trust proxy", "loopback");

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
      if (!limiter.hit(req.ip ?? "sconosciuto", now())) {
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
      if (sembraBot(r, now())) {
        // На бота отговаряме „успех“, за да не учи кое го издава; писмо не тръгва.
        deps.logger.info({ event: "richiesta", esito: "scartata_bot" });
        ok();
        return;
      }
      try {
        await deps.mailer.send({
          subject: riga(`Richiesta LiftCon: ${ETICHETTE_SERVIZIO[r.servizio]} – ${r.comune}`),
          text: testoEmail(r),
          replyTo: { email: r.email, name: riga(r.nome) },
        });
      } catch (err) {
        deps.logger.error({ event: "richiesta", esito: "invio_fallito", err: err instanceof Error ? err.message : "sconosciuto" });
        const msg = `Invio non riuscito. Riprovi tra poco o ci chiami al ${phone}.`;
        if (vuoleJson(req)) res.status(502).json({ ok: false, message: msg });
        else paginaErrore(res, 502, msg);
        return;
      }
      deps.logger.info({ event: "richiesta", esito: "inviata", servizio: r.servizio });
      ok();
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ ok: false, message: "Non trovato." });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    deps.logger.warn({ event: "errore_http", status });
    const message = status === 413 ? "Messaggio troppo lungo." : status < 500 ? MSG_DATI : "Errore interno.";
    if (vuoleJson(req)) res.status(status).json({ ok: false, message });
    else paginaErrore(res, status, message);
  });

  return app;
}
