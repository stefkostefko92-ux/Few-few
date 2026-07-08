// Блокова система (по модела на linkie.to): всеки блок има kind, опционален
// основен url и kind-специфични данни в meta. Тук живее цялата логика по
// валидиране на входа и построяване на целите — страниците само рендират.

import { z } from 'zod';

export const BLOCK_KINDS = [
  'LINK',
  'HEADER',
  'PHONE',
  'MAP',
  'VIDEO',
  'MUSIC',
  'APP',
  'FORM',
  'TIP',
  'VCARD',
] as const;

export type BlockKindId = (typeof BLOCK_KINDS)[number];

export interface BlockMeta {
  /** APP: App Store URL (iOS). */
  ios?: string;
  /** APP: Google Play URL (Android). */
  android?: string;
  /** MUSIC: Spotify URL. */
  spotify?: string;
  /** MUSIC: Apple Music URL. */
  apple?: string;
  /** VCARD: телефон. */
  phone?: string;
  /** VCARD: имейл. */
  email?: string;
  /** VCARD: организация. */
  org?: string;
  /** Пер-блок акцентен цвят (hex) — приоритет над цвета на профила. */
  color?: string;
  /** Spotlight: блокът се рендира открояващо (голяма карта със сияние). */
  featured?: boolean;
}

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//.test(value));

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{5,20}$/);

export interface BlockInput {
  kind: BlockKindId;
  url: string | null;
  meta: BlockMeta | null;
}

/**
 * Валидира суровия вход от формата за добавяне на блок и го нормализира
 * до {url, meta}. Връща null при невалиден вход.
 */
export function parseBlockInput(raw: {
  kind: string;
  url: string;
  extra1: string;
  extra2: string;
  color?: string;
  featured?: boolean;
}): BlockInput | null {
  const kind = raw.kind as BlockKindId;
  if (!BLOCK_KINDS.includes(kind)) return null;
  const base = parseBlockCore(raw, kind);
  if (!base) return null;
  // Пер-блок акцентен цвят — всяко копче може да е различно.
  const color = (raw.color ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    base.meta = { ...(base.meta ?? {}), color };
  }
  if (raw.featured) {
    base.meta = { ...(base.meta ?? {}), featured: true };
  }
  return base;
}

function parseBlockCore(
  raw: { url: string; extra1: string; extra2: string },
  kind: BlockKindId,
): BlockInput | null {

  switch (kind) {
    case 'HEADER':
    case 'FORM':
      return { kind, url: null, meta: null };
    case 'LINK':
    case 'TIP':
    case 'VIDEO': {
      const parsed = httpUrl.safeParse(raw.url);
      if (!parsed.success) return null;
      if (kind === 'VIDEO' && !videoEmbedSrc(parsed.data)) return null;
      return { kind, url: parsed.data, meta: null };
    }
    case 'PHONE': {
      const parsed = phone.safeParse(raw.url);
      if (!parsed.success) return null;
      return { kind, url: `tel:${parsed.data.replace(/[\s()-]/g, '')}`, meta: null };
    }
    case 'MAP': {
      const query = raw.url.trim().slice(0, 300);
      if (!query) return null;
      return {
        kind,
        url: `https://www.google.com/maps?q=${encodeURIComponent(query)}`,
        meta: null,
      };
    }
    case 'APP': {
      const ios = raw.extra1.trim() ? httpUrl.safeParse(raw.extra1) : null;
      const android = raw.extra2.trim() ? httpUrl.safeParse(raw.extra2) : null;
      const fallback = raw.url.trim() ? httpUrl.safeParse(raw.url) : null;
      if (ios?.success !== true && android?.success !== true) return null;
      if ((ios && !ios.success) || (android && !android.success)) return null;
      if (fallback && !fallback.success) return null;
      return {
        kind,
        url: fallback?.success ? fallback.data : null,
        meta: {
          ios: ios?.success ? ios.data : undefined,
          android: android?.success ? android.data : undefined,
        },
      };
    }
    case 'VCARD': {
      const phoneParsed = raw.url.trim() ? phone.safeParse(raw.url) : null;
      const emailParsed = raw.extra1.trim()
        ? z.string().trim().email().max(200).safeParse(raw.extra1)
        : null;
      const org = raw.extra2.trim().slice(0, 100);
      if (phoneParsed?.success !== true && emailParsed?.success !== true) {
        return null;
      }
      if (
        (phoneParsed && !phoneParsed.success) ||
        (emailParsed && !emailParsed.success)
      ) {
        return null;
      }
      return {
        kind,
        url: null,
        meta: {
          phone: phoneParsed?.success
            ? phoneParsed.data.replace(/[\s()-]/g, '')
            : undefined,
          email: emailParsed?.success ? emailParsed.data : undefined,
          org: org || undefined,
        },
      };
    }
    case 'MUSIC': {
      const spotify = raw.url.trim() ? httpUrl.safeParse(raw.url) : null;
      const apple = raw.extra1.trim() ? httpUrl.safeParse(raw.extra1) : null;
      if (spotify?.success !== true && apple?.success !== true) return null;
      if ((spotify && !spotify.success) || (apple && !apple.success)) return null;
      return {
        kind,
        url: spotify?.success ? spotify.data : null,
        meta: {
          spotify: spotify?.success ? spotify.data : undefined,
          apple: apple?.success ? apple.data : undefined,
        },
      };
    }
  }
}

/** iframe src за видео блок: YouTube (през nocookie домейна) и Vimeo. */
export function videoEmbedSrc(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parsed.searchParams.get('v');
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

/**
 * Цел за клик по „умен“ app линк: iOS → App Store, Android → Google Play,
 * иначе fallback url (или каквото има).
 */
export function pickAppTarget(
  userAgent: string | null,
  meta: BlockMeta | null,
  fallback: string | null,
): string | null {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua) && meta?.ios) return meta.ios;
  if (/Android/i.test(ua) && meta?.android) return meta.android;
  return fallback ?? meta?.ios ?? meta?.android ?? null;
}

/** vCard 3.0 — „Запази контакта“ с едно докосване (ноу-хау от vizitka). */
export function buildVCard(fields: {
  name: string;
  phone?: string;
  email?: string;
  org?: string;
  url?: string;
}): string {
  const esc = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${esc(fields.name)}`,
    `N:${esc(fields.name)};;;;`,
  ];
  if (fields.org) lines.push(`ORG:${esc(fields.org)}`);
  if (fields.phone) lines.push(`TEL;TYPE=CELL:${fields.phone}`);
  if (fields.email) lines.push(`EMAIL;TYPE=INTERNET:${fields.email}`);
  if (fields.url) lines.push(`URL:${fields.url}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/** Насрочване: видим ли е блокът в момента? */
export function isBlockVisible(
  block: { showFrom: Date | null; showUntil: Date | null },
  now: Date,
): boolean {
  if (block.showFrom && block.showFrom > now) return false;
  if (block.showUntil && block.showUntil < now) return false;
  return true;
}

/** Цел за клик по музикален блок според избраната услуга. */
export function pickMusicTarget(
  service: string | null,
  meta: BlockMeta | null,
  fallback: string | null,
): string | null {
  if (service === 'spotify' && meta?.spotify) return meta.spotify;
  if (service === 'apple' && meta?.apple) return meta.apple;
  return fallback ?? meta?.spotify ?? meta?.apple ?? null;
}
