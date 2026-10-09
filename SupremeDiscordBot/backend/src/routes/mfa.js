// backend/src/routes/mfa.js
// Втори фактор (TOTP, RFC 6238) за акаунта в таблото. Монтира се на /api/auth/mfa.
//
//   GET  /status          — политика + състояние за този потребител/сесия
//   POST /setup           — нова тайна (чака в сесията до потвърждение)
//   POST /enable  {code}  — потвърждава тайната → записва (шифрирана) + резервни кодове (веднъж)
//   POST /verify  {code}  — потвърждава сесията (TOTP или резервен код)
//   POST /disable {code}  — изключва (иска валиден код)
//   POST /backup-codes {code} — нови резервни кодове (старите се анулират)
//
// Сигурност:
//   • тайната е шифрирана при покой (AES-256-GCM, lib/crypto.js) и НИКОГА не се
//     връща след записване; при setup стои само в сървърната сесия (Postgres), 15 min;
//   • replay: всеки TOTP код важи веднъж (`mfaLastUsedStep`);
//   • налучкване: стълбата в lib/bruteForce.js, обхват "mfa", ключ = потребителят
//     (не IP — нападателят с чужда сесия сменя IP по-лесно от акаунт);
//   • при потвърждение сесията се РЕГЕНЕРИРА (нов id) — срещу фиксация;
//   • резервните кодове са SHA-256 хешове, еднократни;
//   • всяко събитие е в одита (MFA_ENABLED / MFA_DISABLED / MFA_VERIFY_FAILED /
//     MFA_BACKUP_CODES_REGENERATED / MFA_BACKUP_CODE_USED).

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { encrypt, decryptSafe } from "../lib/crypto.js";
import { writeAudit } from "../lib/auditLog.js";
import { requireAuth, loadUser } from "../middleware/auth.js";
import { check, recordFailure, recordSuccess } from "../lib/bruteForce.js";
import {
  generateSecret, otpauthUri, verifyTotp, generateBackupCodes, hashBackupCode, consumeBackupCode,
} from "../lib/totp.js";
import { mfaPolicyFor } from "../middleware/mfa.js";

const router = Router();
router.use(requireAuth, loadUser);

const ISSUER = process.env.MFA_ISSUER || "Supreme Bot";
const PENDING_TTL_MS = 15 * 60 * 1000;

const codeSchema = z.object({ code: z.string().min(6).max(16) });

function accountLabel(user) {
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

function bruteKey(user) {
  return `user:${user.id}`;
}

/** Регенерира сесията (нов id), като пренася полетата — срещу фиксация. */
function rotateSession(req, patch = {}) {
  return new Promise((resolve, reject) => {
    const keep = { ...req.session };
    delete keep.cookie;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, keep, patch);
      req.session.save((err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

/**
 * Проверява TOTP (с replay защита) ИЛИ резервен код. Пише в базата само при
 * успех. Връща { ok, via } или { ok: false }.
 */
async function verifyFactor(user, code) {
  const secret = decryptSafe(user.mfaSecret);
  if (!secret) return { ok: false };

  const step = verifyTotp(secret, code, { minStep: user.mfaLastUsedStep ?? -1 });
  if (step !== null) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaLastUsedStep: step } });
    return { ok: true, via: "totp" };
  }

  let hashes = [];
  try { hashes = JSON.parse(user.mfaBackupCodes || "[]"); } catch { hashes = []; }
  const remaining = consumeBackupCode(code, hashes);
  if (remaining) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: JSON.stringify(remaining) } });
    await writeAudit({ actorId: user.id, action: "MFA_BACKUP_CODE_USED", targetId: user.id, metadata: { remaining: remaining.length } });
    return { ok: true, via: "backup", remaining: remaining.length };
  }
  return { ok: false };
}

/** Общ гард срещу налучкване + одит на провала. */
async function guardedVerify(req, res, user, code) {
  const blocked = await check("mfa", bruteKey(user)).catch(() => ({ blocked: false }));
  if (blocked.blocked) {
    res.setHeader("Retry-After", String(blocked.retryAfterSec));
    res.status(429).json({ error: "Too many failed codes. Try again later.", code: "TOO_MANY_FAILED_ATTEMPTS", retryAfterSeconds: blocked.retryAfterSec });
    return null;
  }
  const result = await verifyFactor(user, code);
  if (!result.ok) {
    await recordFailure("mfa", bruteKey(user)).catch(() => {});
    await writeAudit({ actorId: user.id, action: "MFA_VERIFY_FAILED", targetId: user.id, metadata: { ip: req.ip } });
    res.status(400).json({ error: "Invalid code.", code: "MFA_INVALID_CODE" });
    return null;
  }
  await recordSuccess("mfa", bruteKey(user)).catch(() => {});
  return result;
}

// ─── GET /status ─────────────────────────────────────────────────────────────
router.get("/status", (req, res) => {
  let backupCodesLeft = 0;
  try { backupCodesLeft = JSON.parse(req.user.mfaBackupCodes || "[]").length; } catch { backupCodesLeft = 0; }
  res.json({ ...mfaPolicyFor(req.user, req.session), backupCodesLeft, issuer: ISSUER });
});

// ─── POST /setup ─────────────────────────────────────────────────────────────
router.post("/setup", (req, res) => {
  if (req.user.mfaEnabledAt) {
    return res.status(409).json({ error: "Two-factor authentication is already enabled. Disable it first to re-enroll.", code: "MFA_ALREADY_ENABLED" });
  }
  const secret = generateSecret();
  // Сесията живее в Postgres (express_sessions) — тайната там е ШИФРИРАНА,
  // както и записаната; открит текст нямаше да е „при покой“ дори за 15 min.
  req.session.mfaPending = { secret: encrypt(secret), createdAt: Date.now() };
  res.json({
    secret,
    otpauth: otpauthUri({ issuer: ISSUER, account: accountLabel(req.user), secret }),
    issuer: ISSUER,
    account: accountLabel(req.user),
    expiresInSec: Math.floor(PENDING_TTL_MS / 1000),
  });
});

// ─── POST /enable ────────────────────────────────────────────────────────────
router.post("/enable", async (req, res, next) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "code is required" });
  const pending = req.session.mfaPending;
  if (!pending?.secret || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
    return res.status(400).json({ error: "Start enrollment first (setup), then confirm within 15 minutes.", code: "MFA_NO_PENDING" });
  }
  if (req.user.mfaEnabledAt) {
    return res.status(409).json({ error: "Already enabled.", code: "MFA_ALREADY_ENABLED" });
  }
  try {
    const blocked = await check("mfa", bruteKey(req.user)).catch(() => ({ blocked: false }));
    if (blocked.blocked) {
      res.setHeader("Retry-After", String(blocked.retryAfterSec));
      return res.status(429).json({ error: "Too many failed codes. Try again later.", code: "TOO_MANY_FAILED_ATTEMPTS", retryAfterSeconds: blocked.retryAfterSec });
    }
    const pendingSecret = decryptSafe(pending.secret);
    const step = pendingSecret ? verifyTotp(pendingSecret, parsed.data.code) : null;
    if (step === null) {
      await recordFailure("mfa", bruteKey(req.user)).catch(() => {});
      return res.status(400).json({ error: "The code does not match. Check the time on your phone and try again.", code: "MFA_INVALID_CODE" });
    }
    await recordSuccess("mfa", bruteKey(req.user)).catch(() => {});

    const backupCodes = generateBackupCodes();
    const now = new Date();
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        mfaSecret: encrypt(pendingSecret),
        mfaEnabledAt: now,
        mfaLastUsedStep: step,
        mfaBackupCodes: JSON.stringify(backupCodes.map(hashBackupCode)),
      },
    });
    delete req.session.mfaPending;
    await rotateSession(req, { mfaVerifiedAt: now.getTime(), mfaLastActivity: now.getTime() });
    await writeAudit({ actorId: req.user.id, action: "MFA_ENABLED", targetId: req.user.id, metadata: { ip: req.ip } });
    res.json({ ok: true, enabledAt: now.toISOString(), backupCodes });
  } catch (err) { next(err); }
});

// ─── POST /verify ────────────────────────────────────────────────────────────
router.post("/verify", async (req, res, next) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "code is required" });
  if (!req.user.mfaEnabledAt) return res.status(400).json({ error: "Two-factor authentication is not enabled.", code: "MFA_NOT_ENABLED" });
  try {
    const result = await guardedVerify(req, res, req.user, parsed.data.code);
    if (!result) return;
    const now = Date.now();
    await rotateSession(req, { mfaVerifiedAt: now, mfaLastActivity: now });
    res.json({ ok: true, via: result.via, verifiedAt: new Date(now).toISOString(), ...(result.via === "backup" && { backupCodesLeft: result.remaining }) });
  } catch (err) { next(err); }
});

// ─── POST /disable ───────────────────────────────────────────────────────────
router.post("/disable", async (req, res, next) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "code is required" });
  if (!req.user.mfaEnabledAt) return res.status(400).json({ error: "Not enabled.", code: "MFA_NOT_ENABLED" });
  try {
    const result = await guardedVerify(req, res, req.user, parsed.data.code);
    if (!result) return;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { mfaSecret: null, mfaEnabledAt: null, mfaLastUsedStep: null, mfaBackupCodes: null },
    });
    delete req.session.mfaVerifiedAt;
    delete req.session.mfaLastActivity;
    await writeAudit({ actorId: req.user.id, action: "MFA_DISABLED", targetId: req.user.id, metadata: { ip: req.ip, via: result.via } });
    if (["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"].includes(req.user.globalRole)) {
      const { alertOwner, ALERT_KINDS } = await import("../lib/securityAlerts.js");
      alertOwner(ALERT_KINDS.MFA_DISABLED, "A staff account disabled its second factor", `${req.user.username} (${req.user.id}, ${req.user.globalRole}) disabled TOTP from ${req.ip}. Admin access is closed for them until re-enrolled.`).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /backup-codes ──────────────────────────────────────────────────────
router.post("/backup-codes", async (req, res, next) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "code is required" });
  if (!req.user.mfaEnabledAt) return res.status(400).json({ error: "Not enabled.", code: "MFA_NOT_ENABLED" });
  try {
    const result = await guardedVerify(req, res, req.user, parsed.data.code);
    if (!result) return;
    const backupCodes = generateBackupCodes();
    await prisma.user.update({
      where: { id: req.user.id },
      data: { mfaBackupCodes: JSON.stringify(backupCodes.map(hashBackupCode)) },
    });
    await writeAudit({ actorId: req.user.id, action: "MFA_BACKUP_CODES_REGENERATED", targetId: req.user.id, metadata: { ip: req.ip } });
    res.json({ ok: true, backupCodes });
  } catch (err) { next(err); }
});

export default router;
