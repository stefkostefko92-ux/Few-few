// Разпознаване на платформата по домейна на линка (за бранд иконата)
// и на чувствителното 18+ съдържание (за age gate-а) — както правят
// Linktree и другите link-in-bio платформи.

const DOMAIN_BRANDS: Record<string, string> = {
  'snapchat.com': 'snapchat',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'twitch.tv': 'twitch',
  'kick.com': 'kick',
  'instagram.com': 'instagram',
  'x.com': 'x',
  'twitter.com': 'x',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'threads.net': 'threads',
  'threads.com': 'threads',
  'discord.gg': 'discord',
  'discord.com': 'discord',
  'onlyfans.com': 'onlyfans',
  'tiktok.com': 'tiktok',
  'spotify.com': 'spotify',
  't.me': 'telegram',
  'telegram.me': 'telegram',
  'wa.me': 'whatsapp',
  'whatsapp.com': 'whatsapp',
  'github.com': 'github',
  'pinterest.com': 'pinterest',
  'reddit.com': 'reddit',
  'patreon.com': 'patreon',
  'buymeacoffee.com': 'buymeacoffee',
  'paypal.com': 'paypal',
  'paypal.me': 'paypal',
  'vimeo.com': 'vimeo',
  'soundcloud.com': 'soundcloud',
  'music.apple.com': 'applemusic',
  'ko-fi.com': 'kofi',
  'substack.com': 'substack',
  'tumblr.com': 'tumblr',
  'medium.com': 'medium',
  'bsky.app': 'bluesky',
  'mastodon.social': 'mastodon',
};

// Платформи със съдържание за пълнолетни — линковете към тях минават
// през страница за потвърждение на възрастта (18+).
const SENSITIVE_HOSTS = new Set([
  'onlyfans.com',
  'fansly.com',
  'justfor.fans',
  'loyalfans.com',
  'fanvue.com',
  'manyvids.com',
  'chaturbate.com',
  'stripchat.com',
  'myfreecams.com',
  'pornhub.com',
  'xvideos.com',
  'xhamster.com',
  'f2f.com',
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Namира записа за host или родителски домейн (m.youtube.com → youtube.com). */
function lookup<T>(host: string, has: (candidate: string) => T | undefined) {
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const hit = has(candidate);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Бранд slug за URL (за иконата) или null. */
export function brandFor(url: string | null): string | null {
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  return (
    lookup(host, (candidate) => DOMAIN_BRANDS[candidate] ?? undefined) ?? null
  );
}

/** Чувствително (18+) съдържание ли е целта на линка? */
export function isSensitiveUrl(url: string | null): boolean {
  if (!url) return false;
  const host = hostOf(url);
  if (!host) return false;
  return (
    lookup(host, (candidate) =>
      SENSITIVE_HOSTS.has(candidate) ? true : undefined,
    ) ?? false
  );
}
