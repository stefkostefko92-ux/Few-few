// Импорт от Linktree за 1 минута — чисти функции (тестват се с fixture).
// Публичната страница linktr.ee/<име> е Next.js приложение: данните са в
// <script id="__NEXT_DATA__"> като JSON. Четем само полетата, които ни трябват;
// всичко външно е НЕДОВЕРЕНИ ДАННИ — валидира се, режe се и се нормализира.

export const LINKTREE_MAX_LINKS = 60;

export type ImportedBlock =
  | { kind: 'LINK'; title: string; url: string }
  | { kind: 'HEADER'; title: string };

export type LinktreeImport = {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  blocks: ImportedBlock[];
};

const USERNAME_RE = /^[A-Za-z0-9_.]{1,40}$/;

/**
 * „maria“, „@maria“, „linktr.ee/maria“, „https://linktr.ee/maria?x=1“ →
 * „maria“. Всичко друго (чужд домейн, път с няколко сегмента) → null —
 * хостът НИКОГА не идва от потребителя (защита от SSRF).
 */
export function linktreeUsername(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  value = value.replace(/^@/, '');
  const hostMatch = /^(?:https?:\/\/)?(?:www\.)?linktr\.ee\/(.*)$/i.exec(value);
  if (hostMatch) {
    value = hostMatch[1].split(/[?#]/)[0].replace(/\/+$/, '');
  } else if (/[/:]/.test(value)) {
    return null;
  }
  return USERNAME_RE.test(value) ? value : null;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? Array.from(clean).slice(0, max).join('') : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

// „INSTAGRAM“ → „Instagram“, „X_TWITTER“ → „X Twitter“
function platformTitle(type: unknown): string | null {
  const raw = str(type, 40);
  if (!raw) return null;
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const NEXT_DATA_RE =
  /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

/** HTML на linktr.ee страница → профил + блокове, или null. */
export function parseLinktreeHtml(
  html: string,
  username: string,
): LinktreeImport | null {
  const match = NEXT_DATA_RE.exec(html);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const pageProps = asRecord(asRecord(asRecord(data).props).pageProps);
  const account = asRecord(pageProps.account);
  const rawLinks = asArray(pageProps.links).length
    ? asArray(pageProps.links)
    : asArray(account.links);

  const blocks: ImportedBlock[] = [];
  const seen = new Set<string>();
  const ordered = [...rawLinks].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
  for (const link of ordered) {
    if (blocks.length >= LINKTREE_MAX_LINKS) break;
    if (link.locked === true) continue; // заключени (18+/парола) — не се пренасят
    const title = str(link.title, 100);
    const type = String(link.type ?? '').toUpperCase();
    if (type === 'HEADER') {
      if (title) blocks.push({ kind: 'HEADER', title });
      continue;
    }
    const url = httpUrl(link.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    blocks.push({ kind: 'LINK', title: title ?? new URL(url).hostname, url });
  }
  for (const social of asArray(account.socialLinks ?? pageProps.socialLinks)) {
    if (blocks.length >= LINKTREE_MAX_LINKS) break;
    const url = httpUrl(social.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    blocks.push({
      kind: 'LINK',
      title: platformTitle(social.type) ?? new URL(url).hostname,
      url,
    });
  }

  const displayName =
    str(account.pageTitle, 100) ?? str(account.username, 100);
  const avatar = httpUrl(account.profilePictureUrl);
  if (!displayName && blocks.length === 0) return null;
  return {
    username,
    displayName,
    bio: str(account.description, 300),
    // Само от CDN-а на Linktree (сваля се и се прекодира през sharp).
    avatarUrl:
      avatar && /^https:\/\/ugc\.production\.linktr\.ee\//.test(avatar)
        ? avatar
        : null,
    blocks,
  };
}
