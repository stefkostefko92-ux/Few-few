import { env } from "./env.js";

/**
 * Дълбок линк към SPA-то (Stripe success/cancel/return, имейл, OAuth).
 *
 * Конвенция (виж `.env.example`): `PUBLIC_WEB_URL` = само origin
 * (`https://gaming.carbonstealth.eu`), `WEB_BASE_PATH` = пътят на SPA-то (`/app`).
 * За съвместимост със стари `.env` (където `PUBLIC_WEB_URL` вече завършва на
 * `/app`) базовият път НЕ се добавя втори път — иначе линковете стават
 * `/app/app/…`. Наклонените черти се нормализират.
 */
export function buildWebUrl(publicWebUrl: string, basePath: string, path: string): string {
  const origin = publicWebUrl.replace(/\/+$/, "");
  const trimmed = basePath.trim().replace(/^\/+|\/+$/g, "");
  const base = trimmed ? `/${trimmed}` : "";
  const prefix = base && !origin.endsWith(base) ? `${origin}${base}` : origin;
  const tail = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${prefix}${tail}`;
}

/** `buildWebUrl` с текущата конфигурация. */
export function webUrl(path: string): string {
  return buildWebUrl(env.PUBLIC_WEB_URL, env.WEB_BASE_PATH, path);
}
