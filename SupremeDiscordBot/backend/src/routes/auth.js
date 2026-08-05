// backend/src/routes/auth.js
import { Router } from "express";
import { randomBytes } from "crypto";
import { encrypt } from "../lib/crypto.js";
import axios from "axios";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser } from "../middleware/auth.js";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";

// ─── GET /api/auth/login ──────────────────────────────────────────────────────
// Redirect the user to Discord's OAuth2 consent page

router.get("/login", (req, res) => {
  // CSRF protection: bind the OAuth flow to this session via `state`
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    // `email` — иска се САМО за транзакционни известия по абонамента (изтичащ
    // пробен период, провалено плащане). Основание: GDPR чл. 6(1)(б) —
    // изпълнение на договора. Ако Discord върне сесия без имейл (потребителят
    // може да откаже scope-а), логинът пак минава — имейлът е незадължителен.
    // ВНИМАНИЕ: разширен scope → Discord показва отново екрана за съгласие на
    // вече свързаните потребители (очаквано, не е грешка).
    scope: "identify email guilds",
    state,
  });
  req.session.save(() => res.redirect(`https://discord.com/oauth2/authorize?${params}`));
});

// ─── GET /api/auth/callback ───────────────────────────────────────────────────
// Discord redirects here after the user authorises

router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${process.env.FRONTEND_URL}/?error=no_code`);

  // Validate the CSRF state issued in /login (single-use)
  const expectedState = req.session.oauthState;
  delete req.session.oauthState;
  if (!state || !expectedState || state !== expectedState) {
    return res.redirect(`${process.env.FRONTEND_URL}/?error=oauth_failed`);
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // 2. Fetch Discord user info
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const discordUser = userRes.data;

    // Имейлът идва от /users/@me само при одобрен scope `email`. Пазим го
    // единствено за транзакционни известия по абонамента (GDPR чл. 6(1)(б) —
    // изпълнение на договора). Празен низ третираме като липсващ, за да не
    // запишем "" в базата. Непотвърден имейл (verified=false) НЕ записваме —
    // изпращане до непотвърден адрес е доставка към чужд/неверен получател.
    const email =
      typeof discordUser.email === "string" && discordUser.email.trim() && discordUser.verified === true
        ? discordUser.email.trim()
        : null;

    // 3. Determine global role
    //    Main Owner is hardcoded from env — cannot be changed through the UI
    const isMainOwner = discordUser.id === process.env.MAIN_OWNER_ID;

    // 4. Upsert user in database
    const user = await prisma.user.upsert({
      where: { id: discordUser.id },
      create: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator || "0",
        avatar: discordUser.avatar,
        email,
        globalRole: isMainOwner ? "MAIN_OWNER" : "USER",
      },
      update: {
        username: discordUser.username,
        discriminator: discordUser.discriminator || "0",
        avatar: discordUser.avatar,
        // Само при наличен имейл — иначе логин без одобрен `email` scope би
        // ИЗТРИЛ вече записания адрес и би спрял транзакционните известия.
        ...(email && { email }),
        // Preserve existing role except if this is the Main Owner
        ...(isMainOwner && { globalRole: "MAIN_OWNER" }),
      },
    });

    if (user.isBlacklisted) {
      return res.redirect(`${process.env.FRONTEND_URL}/?error=blacklisted`);
    }

    // 5. Clean up expired sessions, then store new one
    await prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    await prisma.session.create({
      data: {
        userId: user.id,
        // Discord OAuth tokens encrypted at rest (AES-256-GCM), like customBotToken.
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        expiresAt: new Date(Date.now() + expires_in * 1000),
      },
    });

    req.session.userId = user.id;
    req.session.save(() => res.redirect(`${process.env.FRONTEND_URL}/dashboard`));
  } catch (err) {
    console.error("OAuth callback error:", err?.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/?error=oauth_failed`);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", requireAuth, loadUser, (req, res) => {
  const { id, username, discriminator, avatar, globalRole, language } = req.user;
  res.json({
    id,
    username,
    discriminator,
    avatar,
    globalRole,
    language: language || "en",
    avatarUrl: (() => {
      if (avatar) {
        const ext = avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}`;
      }
      try {
        return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> BigInt(22)) % 6}.png`;
      } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`;
      }
    })(),
  });
});

// PATCH /api/auth/me — update user preferences (language etc.)
router.patch("/me", requireAuth, loadUser, async (req, res, next) => {
  const { language } = req.body || {};
  const allowedLangs = ["en", "bg", "it"];
  if (language && !allowedLangs.includes(language)) {
    return res.status(400).json({ error: `Unsupported language. Allowed: ${allowedLangs.join(", ")}` });
  }
  try {
    const updated = await (await import("../lib/prisma.js")).prisma.user.update({
      where: { id: req.user.id },
      data: { language },
      select: { language: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Failed to destroy session" });
    res.clearCookie("sid", { path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
    res.json({ ok: true });
  });
});

export default router;
