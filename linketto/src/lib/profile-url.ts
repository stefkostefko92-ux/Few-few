// Публичен адрес за СПОДЕЛЯНЕ на профил. С PROFILE_HOST (кратък домейн,
// напр. „lnkt.to“) линкът става https://<PROFILE_HOST>/<slug> — по-кратък за
// био в Instagram/TikTok, по-рядък QR и без чужд бранд в средата на URL-а.
// middleware.ts пренаписва /<slug> на този хост към /u/<slug>.
// Без PROFILE_HOST — <PUBLIC_BASE_URL>/u/<slug> (както досега).
// Canonical/sitemap/Stripe/имейл линковете остават на основния домейн.

import { SITE_URL } from '@/lib/seo';

const HOST_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Същата форма като isValidSlug (slug.ts) — един сегмент, без резервираните.
const SHORT_PATH_RE = /^\/([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)\/?$/;

/** Валидиран кратък хост от env или null (празно/невалидно = изключено). */
export function parseProfileHost(raw: string | undefined): string | null {
  const host = (raw ?? '').trim().toLowerCase();
  return HOST_RE.test(host) ? host : null;
}

export function profileHost(): string | null {
  return parseProfileHost(process.env.PROFILE_HOST);
}

export function buildProfileUrl(
  slug: string,
  input: { base: string; host: string | null },
): string {
  return input.host
    ? `https://${input.host}/${slug}`
    : `${input.base}/u/${slug}`;
}

/** Абсолютният линк за споделяне (бутон „Сподели“, QR, vCard, табло). */
export function profileUrl(slug: string): string {
  return buildProfileUrl(slug, { base: SITE_URL, host: profileHost() });
}

/** Slug от пътя на краткия хост („/maria“ → „maria“) или null. */
export function shortPathSlug(pathname: string): string | null {
  return SHORT_PATH_RE.exec(pathname)?.[1] ?? null;
}
