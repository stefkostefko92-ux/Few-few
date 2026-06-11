import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma, prisma, AuthTokenType, OAuthProvider } from "@aso/db";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  DEFAULT_LOCALE,
} from "@aso/shared";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import {
  clearAuthCookies,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../auth/tokens.js";
import { issueAuthToken, consumeAuthToken } from "../auth/authTokens.js";
import { isRevoked } from "../auth/revocation.js";
import {
  providerEnabled,
  buildAuthorizeUrl,
  exchangeCodeForProfile,
  type OAuthProfile,
} from "../auth/oauth.js";
import { sendEmail } from "../email/mailer.js";
import { verificationEmail, passwordResetEmail } from "../email/templates.js";
import { notifyRegistration } from "../integrations/discord.js";
import { asyncHandler, badRequest, conflict, forbidden, unauthorized } from "../http.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { toPublicUser } from "./users.js";

export const authRouter: Router = Router();

// The strict brute-force limiter is applied per-route to the credential
// endpoints only, so the SPA's routine /refresh calls don't share (and exhaust)
// the login budget. All routes still sit behind the app-wide globalLimiter.

const EMAIL_VERIFY_TTL_SEC = 60 * 60 * 24; // 24h
const PASSWORD_RESET_TTL_SEC = 60 * 60; // 1h
const OAUTH_STATE_COOKIE = "aso_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 min

/** Build a deep link into the SPA (which may live under a base path in prod). */
function webUrl(path: string): string {
  return `${env.PUBLIC_WEB_URL}${env.WEB_BASE_PATH}${path}`;
}

/** Issue a verification token and email the link. Best-effort (never throws). */
async function sendVerification(userId: string, email: string): Promise<void> {
  const { raw } = await issueAuthToken(userId, AuthTokenType.EMAIL_VERIFY, EMAIL_VERIFY_TTL_SEC);
  const url = webUrl(`/verify-email?token=${encodeURIComponent(raw)}`);
  await sendEmail(verificationEmail(email, url));
}

/** POST /api/auth/register */
authRouter.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          locale: input.locale ?? DEFAULT_LOCALE,
          termsAcceptedAt: new Date(),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("email_taken", "Имейлът вече е регистриран");
      }
      throw e;
    }

    await sendVerification(user.id, user.email);
    notifyRegistration({ email: user.email, displayName: user.displayName });

    // Sign the player in immediately; verification is a soft gate surfaced in
    // the UI, not a hard block on entering the lobby.
    const accessToken = signAccessToken({ sub: user.id, role: user.role, locale: user.locale });
    setAuthCookies(res, accessToken, signRefreshToken(user.id));
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/login */
authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Constant-ish: verify even when the user is missing or has no local
    // password (OAuth-only) to avoid trivial account enumeration.
    const dummy =
      "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000";
    const ok = await verifyPassword(user?.passwordHash ?? dummy, input.password);

    if (!user || !user.passwordHash || !ok || user.deletedAt) {
      throw unauthorized("Грешен имейл или парола");
    }
    if (user.banned) {
      throw forbidden("Този акаунт е блокиран");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const accessToken = signAccessToken({ sub: user.id, role: user.role, locale: user.locale });
    setAuthCookies(res, accessToken, signRefreshToken(user.id));
    res.json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/refresh — rotates the access token from the refresh cookie. */
authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.aso_rt as string | undefined;
    if (!token) throw unauthorized("Missing refresh token");

    let userId: string;
    try {
      userId = verifyRefreshToken(token).sub;
    } catch {
      throw unauthorized("Invalid refresh token");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw unauthorized("User no longer exists");
    // Refresh must honor bans/erasure/revocation — otherwise a long-lived
    // refresh cookie mints fresh access tokens forever, defeating the denylist.
    // DB `banned` is the backstop here, so the revocation lookup may fail open.
    if (user.banned || (await isRevoked(user.id).catch(() => false))) {
      clearAuthCookies(res);
      throw forbidden("Този акаунт е блокиран");
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role, locale: user.locale });
    setAuthCookies(res, accessToken, signRefreshToken(user.id));
    res.json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/logout */
authRouter.post("/logout", (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

/** GET /api/auth/me */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.deletedAt) throw unauthorized("User no longer exists");
    // A ban applied mid-session ends it at the next /me (cookie restore).
    if (user.banned) throw forbidden("Този акаунт е блокиран");
    res.json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/verify-email — consume a verification token. */
authRouter.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    const userId = await consumeAuthToken(token, AuthTokenType.EMAIL_VERIFY);
    if (!userId) throw badRequest("invalid_token", "Линкът е невалиден или изтекъл");

    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    res.json({ ok: true });
  }),
);

/** POST /api/auth/resend-verification — re-send the link for an unverified email. */
authRouter.post(
  "/resend-verification",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = resendVerificationSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Only act for a real, still-unverified account — but always answer 200 so
    // the endpoint can't be used to probe which emails exist.
    if (user && !user.emailVerified) {
      await sendVerification(user.id, user.email);
    }
    res.json({ ok: true });
  }),
);

/** POST /api/auth/forgot-password — email a reset link (no account enumeration). */
authRouter.post(
  "/forgot-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const { raw } = await issueAuthToken(
        user.id,
        AuthTokenType.PASSWORD_RESET,
        PASSWORD_RESET_TTL_SEC,
      );
      const url = webUrl(`/reset-password?token=${encodeURIComponent(raw)}`);
      await sendEmail(passwordResetEmail(user.email, url));
    }
    res.json({ ok: true });
  }),
);

/** POST /api/auth/reset-password — set a new password from a reset token. */
authRouter.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const userId = await consumeAuthToken(token, AuthTokenType.PASSWORD_RESET);
    if (!userId) throw badRequest("invalid_token", "Линкът е невалиден или изтекъл");

    const passwordHash = await hashPassword(password);
    // A successful reset via the emailed link also proves email ownership.
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, emailVerified: true },
    });
    res.json({ ok: true });
  }),
);

// ── OAuth ──────────────────────────────────────────────────────────────────

function parseProvider(raw: string): OAuthProvider | null {
  if (raw === "google") return OAuthProvider.GOOGLE;
  if (raw === "facebook") return OAuthProvider.FACEBOOK;
  return null;
}

/** GET /api/auth/oauth/providers — which providers the client should surface. */
authRouter.get("/oauth/providers", (_req, res) => {
  res.json({
    google: providerEnabled(OAuthProvider.GOOGLE),
    facebook: providerEnabled(OAuthProvider.FACEBOOK),
  });
});

/** GET /api/auth/oauth/:provider/start — redirect the browser to the provider. */
authRouter.get(
  "/oauth/:provider/start",
  asyncHandler(async (req, res) => {
    const provider = parseProvider(String(req.params.provider));
    if (!provider || !providerEnabled(provider)) {
      res.redirect(webUrl("/login?error=oauth_unavailable"));
      return;
    }

    const state = randomBytes(16).toString("base64url");
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.isProd,
      sameSite: "lax",
      domain: env.COOKIE_DOMAIN || undefined,
      path: "/api/auth",
      maxAge: OAUTH_STATE_TTL_MS,
    });
    res.redirect(buildAuthorizeUrl(provider, state));
  }),
);

/** Find or create the local user for a federated profile, linking by email. */
async function resolveOAuthUser(provider: OAuthProvider, profile: OAuthProfile, retry = true) {
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
    },
    include: { user: true },
  });
  if (existingLink) return existingLink.user;

  // No link yet. If the provider gave us an email, attach to (or create) the
  // matching local account; otherwise we cannot safely create one.
  if (!profile.email) return null;

  try {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: { userId: byEmail.id, provider, providerAccountId: profile.providerAccountId },
      });
      // A verified federated email upgrades an unverified local account.
      if (profile.emailVerified && !byEmail.emailVerified) {
        return prisma.user.update({ where: { id: byEmail.id }, data: { emailVerified: true } });
      }
      return byEmail;
    }

    return await prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        emailVerified: profile.emailVerified,
        displayName: profile.displayName.slice(0, 32),
        oauth: { create: { provider, providerAccountId: profile.providerAccountId } },
      },
    });
  } catch (err) {
    // Concurrent first login for the same email/link → unique violation. The
    // other request won the race; re-resolve once to pick up its row.
    if (retry && (err as { code?: string }).code === "P2002") {
      return resolveOAuthUser(provider, profile, false);
    }
    throw err;
  }
}

/** GET /api/auth/oauth/:provider/callback — exchange the code and sign in. */
authRouter.get(
  "/oauth/:provider/callback",
  asyncHandler(async (req, res) => {
    const provider = parseProvider(String(req.params.provider));
    if (!provider || !providerEnabled(provider)) {
      res.redirect(webUrl("/login?error=oauth_unavailable"));
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/api/auth", domain: env.COOKIE_DOMAIN || undefined });

    if (!code || !state || !cookieState || state !== cookieState) {
      res.redirect(webUrl("/login?error=oauth_state"));
      return;
    }

    try {
      const profile = await exchangeCodeForProfile(provider, code);
      const user = await resolveOAuthUser(provider, profile);
      if (!user) {
        res.redirect(webUrl("/login?error=oauth_no_email"));
        return;
      }
      // Social login must not become a ban-bypass (DB flags are the backstop).
      if (user.banned || user.deletedAt || (await isRevoked(user.id).catch(() => false))) {
        res.redirect(webUrl("/login?error=banned"));
        return;
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      const accessToken = signAccessToken({ sub: user.id, role: user.role, locale: user.locale });
      setAuthCookies(res, accessToken, signRefreshToken(user.id));
      res.redirect(webUrl("/"));
    } catch (err) {
      logger.error({ err, provider }, "oauth callback failed");
      res.redirect(webUrl("/login?error=oauth_failed"));
    }
  }),
);