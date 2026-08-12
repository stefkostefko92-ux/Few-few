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
 * Части от пътя, които НЕ са канал. Без този списък
 * `https://www.twitch.tv/videos/12345` даваше канал „12345“, а
 * `https://kick.com/някой/clips` — канал „clips“: тоест въведеш ли адрес на
 * клип или видео, в базата влизаше линк към ЧУЖД или несъществуващ канал.
 */
const NOT_A_CHANNEL = new Set([
  'videos',
  'video',
  'clips',
  'clip',
  'directory',
  'watch',
  'live',
  'shorts',
  'about',
  'streams',
  'schedule',
  'featured',
  'playlists',
  'community',
]);

/**
 * Нормализира канала. Панелът приема каквото собственикът е копирал — цял
 * адрес, „@handle“ или голо име — и трите трябва да дадат ЕДИН ключ, иначе
 * `@@unique([platform, channelKey])` пуска дубликати на един и същи човек.
 *
 * Взима се ПЪРВАТА смислена част от пътя, не последната: каналът стои най-отпред
 * (`twitch.tv/<канал>/videos`), а последната част е подраздел.
 */
export function normalizeChannel(platform: StreamPlatformId, raw: string): string | null {
  let value = raw.trim();
  if (value === '') return null;

  const url = value.match(/^https?:\/\/[^/]+\/(.+)$/i);
  if (url) {
    const path = url[1].split(/[?#]/)[0].replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    // youtube.com/channel/UC…, /c/name, /user/name — там каналът е ВТОРИ.
    const first = parts[0].toLowerCase();
    const picked =
      platform === 'YOUTUBE' && ['channel', 'c', 'user'].includes(first) ? parts[1] : parts[0];
    if (!picked) return null;
    if (NOT_A_CHANNEL.has(picked.toLowerCase().replace(/^@/, ''))) return null;
    value = picked;
  }

  value = value.replace(/^@/, '').trim();
  if (value === '') return null;
  if (NOT_A_CHANNEL.has(value.toLowerCase())) return null;

  // Регистърът се ПАЗИ (за YouTube `UCxxx` ≠ `ucxxx` са различни канала и
  // адресът трябва да е точен), но уникалността се проверява по `channelKey`
  // — виж по-долу защо това не е едно и също.
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(value)) return null;
  return platform === 'YOUTUBE' ? value : value.toLowerCase();
}

/**
 * Ключът за уникалност и за ЗАГЛУШАВАНЕТО. Винаги малки букви, за всички
 * платформи — включително YouTube, където адресът пази регистъра.
 *
 * Разликата не е педантизъм: докато уникалността беше по `channel`, свален по
 * чл. 21 канал `UCabc` можеше да бъде вкаран отново като `ucabc` — нов ред,
 * нов статус, и възражението тихо отпада. Ключът трябва да е по-груб от
 * адреса, за да не може разцепването на регистъра да заобиколи свалянето.
 */
export function channelKey(channel: string): string {
  return channel.toLowerCase();
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

/**
 * Категорията на GTA V в каталога на Kick.
 *
 * Точното сравнение по име НЕ работи и това е измерено на живо: Kick я нарича
 * **„Grand Theft Auto V (GTA)“** (id 8), тоест с наставка. Кодът търсеше
 * буквално `grand theft auto v` или `gta v`, не намираше нищо и спираше ПРЕДИ
 * заявката за излъчвания — външно това изглеждаше като „никой не излъчва“.
 *
 * Затова името се нормализира: махат се скобите („(GTA)“), реже се след
 * двоеточие или тире („: Roleplay“), и чак тогава се сравнява. Сравнението
 * остава ТОЧНО, а не „съдържа“ — в същия отговор стоят „Grand Theft Auto“,
 * „Grand Theft Auto VI (GTA)“ и още петнайсет, а частичното съвпадение би
 * хванало грешната и щеше да пълни сайта с чужди излъчвания.
 */
const GTA_V_NAMES = ['grand theft auto v', 'gta v', 'grand theft auto 5', 'gta 5'];

export function isGtaVCategory(name: string | null | undefined): boolean {
  if (!name) return false;
  const cleaned = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[:\-\u2013\u2014]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return GTA_V_NAMES.includes(cleaned);
}
