// backend/src/middleware/mfa.js
// Втори фактор (TOTP) за ПРИВИЛЕГИРОВАНИТЕ роли — държавно ниво на достъп до
// администрацията.
//
// Принципи (v3.4, 13.09.2026):
//   • Staff (MAIN_OWNER · SUPER_USER · SUPPORT_STAFF) НЯМА достъп до /api/admin
//     без записан втори фактор — първо записва (`MFA_ENROLL_REQUIRED`), после
//     потвърждава в тази сесия (`MFA_REQUIRED`). Discord OAuth сам по себе си
//     е един фактор, който е толкова силен, колкото е Discord акаунтът.
//   • Потвърждението има срок (12 h) и лежи на бездействие (30 min) — след това
//     втори фактор пак. Разрушителните действия (изтриване, роли, планове,
//     purge) искат СВЕЖО потвърждение (≤10 min) — step-up, като при банка.
//   • Кодовете са замислени за таблото: 403 + машинен `code`, за да покаже
//     предизвикателството за MFA, вместо да тълкува текст.
//   • Всичко се чете от `req.session` (express-session, Postgres) и `req.user`
//     (loadUser) — без нова тайна, без нов бисквитка.
//
// `MFA_ENFORCE_STAFF=false` изключва ЗАДЪЛЖИТЕЛНОСТТА (само за лаборатория —
// записалите MFA пак се проверяват); в продукция не го пипай.

export const STAFF_ROLES = new Set(["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"]);
export const MFA_SESSION_MAX_MS = 12 * 60 * 60 * 1000;
export const MFA_IDLE_MAX_MS = 30 * 60 * 1000;
export const MFA_STEP_UP_MAX_MS = 10 * 60 * 1000;

export function mfaEnforced() {
  return String(process.env.MFA_ENFORCE_STAFF ?? "true").toLowerCase() !== "false";
}

export function isStaff(user) {
  return !!user && STAFF_ROLES.has(user.globalRole);
}

/** Валидно ли е потвърждението в тази сесия (срок + бездействие). */
export function mfaSessionState(session, nowMs = Date.now()) {
  const verifiedAt = Number(session?.mfaVerifiedAt || 0);
  const lastActivity = Number(session?.mfaLastActivity || verifiedAt);
  if (!verifiedAt) return { verified: false, reason: "none" };
  if (nowMs - verifiedAt > MFA_SESSION_MAX_MS) return { verified: false, reason: "expired" };
  if (nowMs - lastActivity > MFA_IDLE_MAX_MS) return { verified: false, reason: "idle" };
  return { verified: true, verifiedAt, ageMs: nowMs - verifiedAt };
}

/**
 * Изисква записан + потвърден в сесията втори фактор за staff. Не-staff минава
 * (маршрутите за admin бездруго искат роля преди това).
 */
export function requireMfa(req, res, next) {
  const user = req.user;
  if (!isStaff(user)) return next();

  if (!user.mfaEnabledAt) {
    if (!mfaEnforced()) return next();
    return res.status(403).json({
      error: "Two-factor authentication must be enabled for staff accounts before using the admin console.",
      code: "MFA_ENROLL_REQUIRED",
    });
  }

  const state = mfaSessionState(req.session);
  if (!state.verified) {
    return res.status(403).json({
      error: "Two-factor verification required for this session.",
      code: "MFA_REQUIRED",
      reason: state.reason,
    });
  }
  // Бездействието се мери по последната ПРИВИЛЕГИРОВАНА заявка.
  req.session.mfaLastActivity = Date.now();
  next();
}

/**
 * Step-up: потвърждението трябва да е по-скорошно от `maxAgeMs`. Слага се СЛЕД
 * requireMfa на разрушителните маршрути.
 */
export function requireFreshMfa(maxAgeMs = MFA_STEP_UP_MAX_MS) {
  return (req, res, next) => {
    const user = req.user;
    if (!isStaff(user)) return next();
    if (!user.mfaEnabledAt && !mfaEnforced()) return next();
    const state = mfaSessionState(req.session);
    if (!state.verified || state.ageMs > maxAgeMs) {
      return res.status(403).json({
        error: "Please confirm your second factor again to perform this action.",
        code: "MFA_STEP_UP",
        maxAgeSec: Math.floor(maxAgeMs / 1000),
      });
    }
    next();
  };
}

/** Каква е политиката за този потребител — за таблото. */
export function mfaPolicyFor(user, session) {
  const staff = isStaff(user);
  const enabled = !!user?.mfaEnabledAt;
  const state = mfaSessionState(session);
  return {
    enabled,
    enabledAt: user?.mfaEnabledAt || null,
    required: staff && mfaEnforced(),
    enrollmentRequired: staff && mfaEnforced() && !enabled,
    verifiedInSession: enabled && state.verified,
    verifiedAt: state.verified ? new Date(state.verifiedAt).toISOString() : null,
    freshForSec: state.verified ? Math.max(0, Math.floor((MFA_STEP_UP_MAX_MS - state.ageMs) / 1000)) : 0,
    sessionMaxSec: Math.floor(MFA_SESSION_MAX_MS / 1000),
    idleMaxSec: Math.floor(MFA_IDLE_MAX_MS / 1000),
    stepUpMaxSec: Math.floor(MFA_STEP_UP_MAX_MS / 1000),
  };
}
