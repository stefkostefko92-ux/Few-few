// Общи помощници за API маршрутите: JSON отговори, Zod валидация, обработка на грешки.
import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { ErroreHttp } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errore(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Валидира тялото по Zod схема; хвърля ErroreHttp(400) с четимо съобщение. */
export async function corpoValidato<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ErroreHttp(400, "Corpo JSON non valido");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`)
      .join("; ");
    throw new ErroreHttp(400, msg);
  }
  return parsed.data;
}

/** Обвива handler: превежда ErroreHttp/Zod/Prisma грешки в HTTP отговори. */
export function gestito(
  fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ErroreHttp) return errore(e.status, e.message);
      if (e instanceof ZodError) return errore(400, "Dati non validi");
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") return errore(409, "Valore duplicato su campo univoco");
        if (e.code === "P2003")
          return errore(409, "Record referenziato da altri documenti: usare la disattivazione");
        if (e.code === "P2025") return errore(404, "Record non trovato");
      }
      console.error("[api]", e);
      return errore(500, "Errore interno del server");
    }
  };
}
