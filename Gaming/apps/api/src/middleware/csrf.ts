import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Extract the scheme://host[:port] origin from a URL or Origin header value. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests (§S14).
 *
 * The app authenticates with httpOnly cookies, so SameSite is the first line of
 * defence; this adds an Origin/Referer allowlist check as defence-in-depth on
 * every non-safe `/api/*` request. Requests with NO Origin/Referer are allowed
 * — those are non-browser clients (server-to-server, curl, native apps) which a
 * browser-driven CSRF cannot forge a cookie session for. When an Origin IS
 * present it must be one of the configured CORS origins.
 */
export function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
  if (origin === null || env.corsOrigins.includes(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: { code: "csrf_origin", message: "Cross-origin request rejected" } });
}
