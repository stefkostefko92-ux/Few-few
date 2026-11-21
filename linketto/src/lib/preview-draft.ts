// Жив преглед в таблото: незапазените промени по формите пътуват към
// /u/<slug>/preview като компактна чернова (base64url JSON в адреса).
// Сървърът НЕ ѝ вярва: всяко поле минава през същата валидация като при
// запис, а непознатото се пропуска. Нищо от черновата не се записва.

import { isProfileTheme } from '@/lib/profile-themes';
import { parseStyle, styleInput, styleSchema } from '@/lib/style';

/** Таван на кодираната чернова — защита от огромен адрес. */
export const DRAFT_MAX = 8000;
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_ENTRIES = 60;

export type PreviewDraft = {
  /** Тема (id от PROFILE_THEMES). */
  theme?: string;
  /** Акцент (#rrggbb или '' = без). */
  accent?: string;
  /** Полетата на формата „Персонализация“ (сурови, както при запис). */
  style?: Record<string, string>;
  /** Име/био по език. */
  tr?: Record<string, { n?: string; b?: string }>;
  /** Заглавия на блокове: linkId → език → заглавие. */
  lt?: Record<string, Record<string, string>>;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Кодира черновата за адреса (браузър и сървър). Празна → ''. */
export function encodeDraft(draft: PreviewDraft): string {
  if (Object.keys(draft).length === 0) return '';
  return toBase64Url(new TextEncoder().encode(JSON.stringify(draft)));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined;

/**
 * Разкодира и почиства черновата. Невалидно/прекалено дълго → null
 * (прегледът тогава показва записаното състояние).
 */
export function decodeDraft(raw: string | null | undefined): PreviewDraft | null {
  if (!raw || raw.length > DRAFT_MAX || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const draft: PreviewDraft = {};
  const theme = str(parsed.theme, 40);
  if (theme !== undefined) draft.theme = theme;
  const accent = str(parsed.accent, 7);
  if (accent !== undefined) draft.accent = accent;
  if (isRecord(parsed.style)) {
    const style: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.style).slice(0, MAX_ENTRIES)) {
      const text = str(value, 2000);
      if (text !== undefined) style[key] = text;
    }
    draft.style = style;
  }
  if (isRecord(parsed.tr)) {
    const tr: NonNullable<PreviewDraft['tr']> = {};
    for (const [locale, value] of Object.entries(parsed.tr).slice(0, MAX_ENTRIES)) {
      if (!LOCALE_RE.test(locale) || !isRecord(value)) continue;
      tr[locale] = { n: str(value.n, 100), b: str(value.b, 500) };
    }
    draft.tr = tr;
  }
  if (isRecord(parsed.lt)) {
    const lt: NonNullable<PreviewDraft['lt']> = {};
    for (const [linkId, byLocale] of Object.entries(parsed.lt).slice(0, MAX_ENTRIES)) {
      if (linkId.length > 40 || !isRecord(byLocale)) continue;
      const titles: Record<string, string> = {};
      for (const [locale, title] of Object.entries(byLocale).slice(0, MAX_ENTRIES)) {
        const text = str(title, 100);
        if (LOCALE_RE.test(locale) && text !== undefined) titles[locale] = text;
      }
      lt[linkId] = titles;
    }
    draft.lt = lt;
  }
  return draft;
}

type DraftableProfile = {
  id: string;
  defaultLocale: string;
  theme: string | null;
  accent: string | null;
  style: unknown;
  translations: { id: string; profileId: string; locale: string; displayName: string; bio: string | null }[];
  links: { id: string; translations: { id: string; linkId: string; locale: string; title: string }[] }[];
};

/**
 * Прилага черновата върху заредения профил (копие — оригиналът не се пипа).
 * Същите правила като при запис: тема само от списъка, акцент само hex,
 * стил през styleSchema (иначе прощаващият parseStyle), скрит бадж само ако
 * планът позволява, празно име/заглавие = остава записаното.
 */
export function applyDraft<P extends DraftableProfile>(
  profile: P,
  draft: PreviewDraft,
  opts: { canHideBadge: boolean },
): P {
  const next: P = { ...profile };
  if (draft.theme !== undefined && isProfileTheme(draft.theme)) next.theme = draft.theme;
  if (draft.accent !== undefined) {
    const accent = draft.accent.trim();
    if (accent === '') next.accent = null;
    else if (HEX_RE.test(accent)) next.accent = accent;
  }
  if (draft.style) {
    const fields = draft.style;
    const raw = styleInput((name) => fields[name]);
    const result = styleSchema.safeParse(raw);
    const style = result.success ? result.data : parseStyle(raw);
    (next as DraftableProfile).style = { ...style, hideBadge: style.hideBadge && opts.canHideBadge };
  }
  if (draft.tr) {
    const tr = draft.tr;
    next.translations = profile.translations.map((translation) => {
      const change = tr[translation.locale];
      if (!change) return translation;
      const name = change.n?.trim();
      const bio = change.b?.trim();
      return {
        ...translation,
        displayName: name ? name : translation.displayName,
        bio: bio === undefined ? translation.bio : bio || null,
      };
    });
  }
  if (draft.lt) {
    const lt = draft.lt;
    next.links = profile.links.map((link) => {
      const titles = lt[link.id];
      if (!titles) return link;
      const translations = link.translations
        .map((item) => {
          const title = titles[item.locale]?.trim();
          // Празно на основния език = остава записаното (както при запис).
          if (title === undefined || (title === '' && item.locale === profile.defaultLocale)) return item;
          return { ...item, title };
        })
        // Празно заглавие на допълнителен език = „махни превода“ (както при запис).
        .filter((item) => item.title !== '');
      for (const [locale, rawTitle] of Object.entries(titles)) {
        const title = rawTitle.trim();
        if (title && !translations.some((item) => item.locale === locale)) {
          translations.push({ id: `draft-${locale}`, linkId: link.id, locale, title } as (typeof translations)[number]);
        }
      }
      return { ...link, translations };
    });
  }
  return next;
}
