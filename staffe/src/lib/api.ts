import { NextResponse } from 'next/server';
import { ZodError, type output as ZodOutput, type ZodTypeAny } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthError } from './auth';
import { StockError } from './stock';

/**
 * Contratto REST del prodotto — un solo formato di risposta per tutte le rotte.
 *
 * Successo: `{ data, meta? }`. Errore: `{ error: { message, code, details? } }`.
 * Il messaggio è in italiano ed è mostrabile all'operatore così com'è; i
 * dettagli tecnici (stack, SQL, vincoli) non escono mai dal server.
 */

export type ApiMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export function ok<T>(data: T, meta?: ApiMeta, status = 200): NextResponse {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function fail(
  status: number,
  message: string,
  code = 'errore',
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: details ? { message, code, details } : { message, code } },
    { status },
  );
}

/**
 * Involucro per ogni rotta API: traduce le eccezioni note in risposte HTTP
 * corrette e tutto il resto in un 500 muto (nessuna fuga di dettagli interni).
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof AuthError) {
        return fail(err.status, err.message, err.status === 401 ? 'non_autenticato' : 'vietato');
      }
      if (err instanceof StockError) {
        return fail(409, err.message, 'giacenza');
      }
      if (err instanceof ZodError) {
        return fail(422, 'Dati non validi.', 'validazione', err.flatten());
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return fail(409, 'Questo codice è già in uso: deve essere unico.', 'duplicato');
        }
        if (err.code === 'P2025') {
          return fail(404, 'Elemento non trovato.', 'non_trovato');
        }
        if (err.code === 'P2003') {
          return fail(
            409,
            'Riferimento non valido, oppure l’elemento è ancora collegato ad altri documenti.',
            'vincolo',
          );
        }
      }
      console.error('[staffe] errore non gestito:', err);
      return fail(500, 'Errore interno del server.', 'interno');
    }
  };
}

/**
 * Legge e valida il corpo JSON. Lancia `ZodError` → 422 con i campi in errore.
 *
 * Il tipo restituito è quello di USCITA dello schema (`z.output`), non quello di
 * ingresso. Con la firma generica su `T` (`ZodSchema<T>`) TypeScript deduceva il
 * tipo d'INGRESSO: un campo con `.default()` risultava `possibly undefined`
 * anche se dopo il parse c'è sempre, e con `.transform()`/`.coerce` il tipo
 * dichiarato era addirittura diverso dal valore reale. Si finiva per evitare
 * `.default()` o per aggiungere guardie contro un caso impossibile.
 */
export async function readBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ZodOutput<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ZodError([
      {
        code: 'custom',
        path: [],
        message: 'Il corpo della richiesta non è un JSON valido.',
      },
    ]);
  }
  return schema.parse(raw);
}

const MAX_PER_PAGE = 200;

export type Pagination = { page: number; perPage: number; skip: number; take: number };

export function pagination(url: URL, defaultPerPage = 25): Pagination {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const requested = Number(url.searchParams.get('perPage') ?? defaultPerPage) || defaultPerPage;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, requested));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function meta(p: Pagination, total: number): ApiMeta {
  return {
    page: p.page,
    perPage: p.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.perPage)),
  };
}
