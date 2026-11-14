import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Typed HTTP error with a status code and stable client-facing code. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Допълнителни полета към `error` в отговора (напр. `until` при бан). */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "Forbidden") => new HttpError(403, "forbidden", msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

/**
 * Цяло число от query параметър в [min, max]; липсващ или нечислов → `def`.
 * (`Number("abc")` е NaN и `Math.min/max` го пропуска — заявката падаше с 500.)
 */
export function intQuery(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : def;
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : def;
}

/** Wrap an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
