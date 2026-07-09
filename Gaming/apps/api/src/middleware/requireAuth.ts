import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ACCESS_COOKIE, type AccessTokenClaims } from "@aso/shared";
import { verifyAccessToken } from "../auth/tokens.js";
import { isRevoked } from "../auth/revocation.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { forbidden, unauthorized } from "../http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenClaims;
    }
  }
}

/** Reads the httpOnly access cookie, verifies it, rejects revoked sessions
 *  (banned/erased), and attaches claims to req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) {
    next(unauthorized("Missing access token"));
    return;
  }
  let claims: AccessTokenClaims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    next(unauthorized("Invalid or expired token"));
    return;
  }
  isRevoked(claims.sub)
    .then((revoked) => {
      if (revoked) {
        next(unauthorized("Session revoked"));
        return;
      }
      req.user = claims;
      next();
    })
    .catch((err) => {
      // No DB backstop here, so fail CLOSED in production: a banned/revoked user
      // must not slip through on a revocation-store hiccup. Dev stays fail-open.
      if (env.isProd) {
        logger.error({ err }, "revocation check failed; rejecting (fail-closed)");
        next(unauthorized("Session check unavailable"));
        return;
      }
      req.user = claims;
      next();
    });
}

/** Gate a route to one of the given roles (authz, §14). Use after requireAuth. */
export function requireRole(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      next(forbidden("Insufficient role"));
      return;
    }
    next();
  };
}
