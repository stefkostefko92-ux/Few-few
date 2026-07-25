// Общи помощници за API маршрутите: JSON отговори, Zod валидация, обработка на грешки.
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { ErroreHttp } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { ETICHETTE_CAMPI } from "@/lib/zod-it"; // регистрира и IT error map
import { log, descriviErrore, rottaModello } from "@/lib/log";
import { randomUUID } from "node:crypto";

/** `JSON.stringify` хвърля TypeError върху BigInt — а един такъв ключ в схемата
 *  сваля целия маршрут с 500. Тук се превръща в текст (числото не се побира
 *  безопасно в `Number`). Датите вече са минали през `toJSON`. */
function sostituisciBigInt(_chiave: string, valore: unknown): unknown {
  return typeof valore === "bigint" ? valore.toString() : valore;
}

export function ok(data: unknown, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(data, sostituisciBigInt), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errore(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Валидира тялото по Zod схема; хвърля ErroreHttp(400) с четимо съобщение. */
export async function corpoValidato<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ErroreHttp(400, "Corpo JSON non valido");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => {
        const campo = String(i.path[0] ?? "");
        const etichetta = ETICHETTE_CAMPI[campo] ?? campo;
        return etichetta ? `${etichetta}: ${i.message}` : i.message;
      })
      .join("; ");
    throw new ErroreHttp(400, msg);
  }
  return parsed.data;
}

/** Prisma кодове за недостъпна база — преходни, значи 503 (не 500). */
const CODICI_DB_NON_DISPONIBILE = new Set(["P1001", "P1002", "P1008", "P1017"]);

/** Обвива handler: превежда ErroreHttp/Zod/Prisma грешки в HTTP отговори.
 *
 *  Това е ЕДИНСТВЕНАТА точка за инструментация — всички API маршрути минават
 *  оттук, значи един файл дава correlation id, времетраене и структуриран лог. */
export function gestito(
  fn: (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<NextResponse>,
) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ) => {
    const inizio = Date.now();
    const reqId = req.headers.get("x-request-id") ?? randomUUID();
    const rotta = rottaModello(new URL(req.url).pathname);
    const base = { req_id: reqId, metodo: req.method, rotta };

    const conTraccia = (res: NextResponse): NextResponse => {
      res.headers.set("x-request-id", reqId);
      return res;
    };

    try {
      const res = await fn(req, ctx);
      log.info("richiesta", {
        ...base,
        stato: res.status,
        durata_ms: Date.now() - inizio,
      });
      return conTraccia(res);
    } catch (e) {
      const durata_ms = Date.now() - inizio;
      if (e instanceof ErroreHttp) {
        log.info("richiesta", { ...base, stato: e.status, durata_ms });
        return conTraccia(errore(e.status, e.message));
      }
      if (e instanceof ZodError) {
        log.info("richiesta", { ...base, stato: 400, durata_ms });
        return conTraccia(errore(400, "Dati non validi"));
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Известните кодове са ОЧАКВАНИ изходи, не аварии — логват се като
        // обикновена заявка с техния статус, за да не давят истинските грешки.
        const noto = (stato: number, messaggio: string) => {
          log.info("richiesta", { ...base, stato, durata_ms });
          return conTraccia(errore(stato, messaggio));
        };
        if (e.code === "P2002")
          return noto(409, "Valore già presente: il campo deve essere univoco");
        if (e.code === "P2003")
          return noto(
            409,
            "Record collegato ad altri documenti: non può essere eliminato, disattivarlo",
          );
        if (e.code === "P2025") return noto(404, "Record non trovato");
        // P2023 = невалидна стойност за колоната (напр. UUID параметър „pippo").
        // Това е грешка на ЗАЯВКАТА, не на сървъра → 400, не 500.
        if (e.code === "P2023") return noto(400, "Parametro non valido");
        if (CODICI_DB_NON_DISPONIBILE.has(e.code)) {
          // Загубата на базата е ПРЕХОДНА → 503 + Retry-After, не 500.
          log.error("base dati non raggiungibile", {
            ...base,
            durata_ms,
            ...descriviErrore(e),
          });
          const res = errore(
            503,
            "Servizio temporaneamente non disponibile: riprovare tra poco",
          );
          res.headers.set("Retry-After", "15");
          return conTraccia(res);
        }
      }
      if (e instanceof Prisma.PrismaClientInitializationError) {
        log.error("base dati non raggiungibile", {
          ...base,
          durata_ms,
          ...descriviErrore(e),
        });
        const res = errore(
          503,
          "Servizio temporaneamente non disponibile: riprovare tra poco",
        );
        res.headers.set("Retry-After", "15");
        return conTraccia(res);
      }
      // Никога не логваме e.message: съобщенията на Prisma носят аргументите
      // на заявката, тоест личните данни от тялото.
      log.error("errore non gestito", {
        ...base,
        stato: 500,
        durata_ms,
        ...descriviErrore(e),
      });
      return conTraccia(errore(500, "Errore interno del server"));
    }
  };
}
