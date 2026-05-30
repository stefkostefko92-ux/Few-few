import { Router } from "express";
import { Prisma, prisma } from "@aso/db";
import { loginSchema, registerSchema, DEFAULT_LOCALE } from "@aso/shared";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import {
  clearAuthCookies,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../auth/tokens.js";
import { asyncHandler, conflict, unauthorized } from "../http.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { toPublicUser } from "./users.js";

export const authRouter: Router = Router();

authRouter.use(authLimiter);

/** POST /api/auth/register */
authRouter.post(
  "/register",
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
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("email_taken", "Имейлът вече е регистриран");
      }
      throw e;
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role, locale: user.locale });
    setAuthCookies(res, accessToken, signRefreshToken(user.id));
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/login */
authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Constant-ish: verify even when user missing to avoid trivial enumeration.
    const ok = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(
          "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000",
          input.password,
        );

    if (!user || !ok) {
      throw unauthorized("Грешен имейл или парола");
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
    if (!user) throw unauthorized("User no longer exists");

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
    if (!user) throw unauthorized("User no longer exists");
    res.json({ user: toPublicUser(user) });
  }),
);
