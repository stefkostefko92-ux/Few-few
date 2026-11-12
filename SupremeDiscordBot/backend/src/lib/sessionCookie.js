// backend/src/lib/sessionCookie.js
// Сесийната бисквитка — едно място за името и настройките (23.10.2026).
//
// В продукция името е с префикс `__Host-`. Браузърът приема такава бисквитка
// САМО ако е Secure, с Path=/ и БЕЗ Domain — тоест страница на поддомейн или
// по чист HTTP не може да я засади или подмени (cookie tossing → фиксиране на
// сесията). При нас това е реално: продуктът живее на поддомейн на
// carbonstealth.eu, до други продукти на същия домейн.
//
// В разработка (HTTP на localhost) префиксът би накарал браузъра да отхвърли
// бисквитката (няма Secure) — там остава старото име `sid`.
//
// Смяната на името разлогва всички веднъж: старата `sid` вече не се чете.
// `clearLegacySessionCookie` я трие от браузъра при първата заявка, за да не
// виси седем дни като мъртъв товар.

export const LEGACY_SESSION_COOKIE = "sid";

export function sessionCookieName(env = process.env.NODE_ENV) {
  return env === "production" ? "__Host-sid" : LEGACY_SESSION_COOKIE;
}

/** Настройките, с които бисквитката се СЛАГА и се ТРИЕ — едни и същи, иначе триенето не хваща. */
export function sessionCookieOptions(env = process.env.NODE_ENV) {
  return {
    secure: env === "production",
    httpOnly: true,
    sameSite: "lax", // "lax" работи с OAuth пренасочването; "strict" го чупи
    path: "/",
    // БЕЗ domain — `__Host-` го забранява, а и без префикса бисквитката остава само за този хост.
  };
}

// `sid=` в началото или след „; “ — но не частта от `__Host-sid=`.
const LEGACY_RE = new RegExp(`(?:^|;\\s*)${LEGACY_SESSION_COOKIE}=`);

/** Express middleware: в продукция трие остатъчната `sid` от времето преди префикса. */
export function clearLegacySessionCookie(env = process.env.NODE_ENV) {
  return (req, res, next) => {
    if (env === "production" && LEGACY_RE.test(req.headers.cookie || "")) {
      res.clearCookie(LEGACY_SESSION_COOKIE, sessionCookieOptions(env));
    }
    next();
  };
}
