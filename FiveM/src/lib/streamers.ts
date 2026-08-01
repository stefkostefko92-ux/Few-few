/**
 * ЧИСТИТЕ функции около стриймърите — нула мрежа, нула Prisma, всичко тук е
 * покрито с тестове. Мрежата към платформите е в `streamers-query.ts`,
 * четенето от базата — в `streamers-db.ts`.
 */

export const STREAM_PLATFORMS = ['TWITCH', 'KICK', 'YOUTUBE', 'TIKTOK'] as const;
export type StreamPlatformId = (typeof STREAM_PLATFORMS)[number];

export function isStreamPlatform(value: string): value is StreamPlatformId {
  return (STREAM_PLATFORMS as readonly string[]).includes(value);
}

/** Значка за платформата. `kick` още го няма — виж `docs/ICONS.md`. */
export const PLATFORM_BADGE: Record<StreamPlatformId, string> = {
  TWITCH: 'twitch',
  KICK: 'kick',
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
};

/**
 * Нормализира канала. Панелът приема каквото собственикът е копирал — цял
 * адрес, „@handle“ или голо име — и трите трябва да дадат ЕДИН ключ, иначе
 * `@@unique([platform, channel])` пуска дубликати на един и същи човек.
 */
export function normalizeChannel(platform: StreamPlatformId, raw: string): string | null {
  let value = raw.trim();
  if (value === '') return null;

  // Цял адрес → последната смислена част от пътя.
  const url = value.match(/^https?:\/\/[^/]+\/(.+)$/i);
  if (url) {
    const path = url[1].split(/[?#]/)[0].replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    // youtube.com/@handle, youtube.com/c/name, youtube.com/channel/UC…
    value = parts[parts.length - 1] ?? '';
  }

  value = value.replace(/^@/, '').trim();
  if (value === '') return null;

  // YouTube ID-тата различават главни от малки букви (UCxxx ≠ ucxxx), затова
  // само там регистърът се пази. Другите платформи са case-insensitive.
  const normalized = platform === 'YOUTUBE' ? value : value.toLowerCase();
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(normalized)) return null;
  return normalized;
}

/** Адресът на канала. TikTok също се сглобява, но там входът е ръчен. */
export function profileUrl(platform: StreamPlatformId, channel: string): string {
  switch (platform) {
    case 'TWITCH':
      return `https://www.twitch.tv/${channel}`;
    case 'KICK':
      return `https://kick.com/${channel}`;
    case 'YOUTUBE':
      // Каналните ID-та започват с „UC“ и вървят по /channel/, всичко друго е
      // handle и върви по /@ — сбъркаш ли ги, линкът е 404.
      return channel.startsWith('UC')
        ? `https://www.youtube.com/channel/${channel}`
        : `https://www.youtube.com/@${channel}`;
    case 'TIKTOK':
      return `https://www.tiktok.com/@${channel}`;
  }
}

/**
 * Езикът, обявен от платформата. Twitch дава ISO код („bg“), Kick — засега
 * неясен формат, затова се приемат и двете изписвания. Празно/непознато НЕ е
 * „български“: тогава записът отива в опашка, не направо публично.
 */
export function isBulgarianLanguage(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'bg' || normalized.startsWith('bg-') || normalized === 'bulgarian';
}

/** Таван на зрителите — същата причина като `MAX_PLAYER_COUNT`: чуждо число. */
export const MAX_VIEWERS = 10_000_000;

export function clampViewers(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_VIEWERS);
}

type Sortable = { live: boolean; viewers: number; displayName: string };

/** На живо → повече зрители → азбучно. Тук няма платено класиране. */
export function compareStreamers(a: Sortable, b: Sortable): number {
  if (a.live !== b.live) return a.live ? -1 : 1;
  if (a.viewers !== b.viewers) return b.viewers - a.viewers;
  return a.displayName.localeCompare(b.displayName, 'bg');
}

/**
 * Групира по платформа в ОБЯВЕНИЯ ред и връща само непразните секции.
 * Редът е фиксиран, не по брой: иначе подредбата на страницата подскача при
 * всяко обновяване и хората губят ориентир.
 */
export function groupByPlatform<T extends Sortable & { platform: StreamPlatformId }>(
  streamers: readonly T[],
): { platform: StreamPlatformId; streamers: T[] }[] {
  return STREAM_PLATFORMS.map((platform) => ({
    platform,
    streamers: streamers.filter((s) => s.platform === platform).sort(compareStreamers),
  })).filter((group) => group.streamers.length > 0);
}
