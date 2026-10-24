"use strict";
// ПИН-ове, сесии и пазачът за произход.
// Сесията е JWT в HttpOnly бисквитка (SameSite=Strict) — JavaScript на страницата не я вижда, друг сайт не я
// праща. Ролята се чете от базата при всяка заявка, а отпечатъкът на ПИН-а в сесията я прекратява при смяна.
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const COOKIE = "sklad_session";
const SESSION_HOURS = 12;
const BCRYPT_ROUNDS = 12;

const isPinHash = (s) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(s || ""));
const hashPin = (pin) => bcrypt.hash(String(pin), BCRYPT_ROUNDS);

// Хеш, на който не отговаря ничий ПИН: сравнява се при непознат имейл, за да не издава времето кой има акаунт.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(18).toString("base64url"), BCRYPT_ROUNDS);

/** Вярно само срещу bcrypt хеш — ПИН в чист вид в базата не пуска никого (seed.js ги хешира при старт). */
async function verifyPin(pin, stored) {
  if (!isPinHash(stored)) {
    await bcrypt.compare(String(pin), DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(String(pin), stored);
}

/** Отпечатък на записания ПИН: влиза в сесията; нов ПИН → всички по-стари сесии на човека падат. */
const pinVersion = (stored) =>
  crypto.createHash("sha256").update(String(stored)).digest("base64url").slice(0, 22);

/** `weak`: ПИН-ът при входа е стар (под 6 цифри) — сесията пуска само смяната на ПИН-а. */
function issueSession(res, user, config, { weak = false } = {}) {
  const claims = { sub: user.id, pv: pinVersion(user.pin), ...(weak ? { wk: 1 } : {}) };
  const token = jwt.sign(claims, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
}

function clearSession(res, config) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.secureCookies, sameSite: "strict", path: "/" });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Пуска само заявка с жива сесия; req.user е от базата (ролята никога не идва от токена).
 * Сесия от вход със стар ПИН (под 6 цифри) минава само където `allowWeak` — /me и смяната на ПИН-а.
 */
function requireUser({ prisma, config, allowWeak = false }) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, COOKIE);
      if (!token) return res.status(401).json({ error: "Не си влязъл" });
      let claims;
      try {
        claims = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
      } catch {
        return res.status(401).json({ error: "Сесията е изтекла" });
      }
      const user = await prisma.user.findUnique({ where: { id: String(claims.sub) } });
      if (!user || claims.pv !== pinVersion(user.pin)) {
        return res.status(401).json({ error: "Сесията е прекратена" });
      }
      if (claims.wk && !allowWeak) {
        return res.status(403).json({ error: "Смени ПИН-а си (6–12 цифри), за да продължиш", code: "PIN_CHANGE_REQUIRED" });
      }
      req.user = { id: user.id, nome: user.nome, email: user.email, ruolo: user.ruolo, pinChangeRequired: Boolean(claims.wk) };
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Втората ключалка срещу CSRF (първата е SameSite=Strict): заявка, която променя нещо, трябва да е JSON —
// чужд формуляр не може да прати такава без CORS preflight, а CORS няма — и ако браузърът каже откъде идва,
// произходът трябва да е нашият.
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
function sameOriginJson(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (!type.startsWith("application/json")) return res.status(415).json({ error: "Очаква се JSON" });
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (!host || host !== req.headers.host) return res.status(403).json({ error: "Забранен произход" });
  }
  next();
}

module.exports = {
  COOKIE,
  SESSION_HOURS,
  isPinHash,
  hashPin,
  verifyPin,
  pinVersion,
  issueSession,
  clearSession,
  readCookie,
  requireUser,
  sameOriginJson,
};
