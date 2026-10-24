import { z } from 'zod';

/**
 * Живите настройки на сървъра — CONTRACT.md §11. Таблицата `server_settings` пази по един ред на
 * група (ключ → JSON). Пише панелът (`/admin/settings`) и WASD менюто в играта (патрони, ботове);
 * C# плъгинът ги чете при старт, на 60 s и при `settings.reload` и ги проверява наново
 * (`ServerSettings.Parse`) — невалиден ред там пада към конфига на плъгина. Затова тук формата е
 * строга (`.strict()`): каквото панелът запише, плъгинът го приема без изненади.
 */
export const SETTING_KEYS = ['adverts', 'ammo', 'bots', 'xp', 'join'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && (SETTING_KEYS as readonly string[]).includes(value);
}

/** Вградените реклами на плъгина (`advert.<ключ>` в lang/*.json) — в този ред се въртят. */
export const BUILTIN_ADVERTS = ['carbonstealth', 'adblock', 'site'] as const;
/** Езиците на плъгина (lang/bg.json, lang/en.json) — италианците виждат английския текст. */
export const ADVERT_LANGS = ['bg', 'en'] as const;
export const MAX_CUSTOM_ADVERTS = 5;
/** Като тавана на `Text.SafeText` в C# (192 знака). */
export const ADVERT_TEXT_MAX = 192;
export const ADVERT_INTERVAL = { off: 0, min: 60, max: 3600 } as const;
export const BOT_QUOTA_MAX = 16;
/** Множителят на XP — 1,0…3,0 със стъпка 0,1 (пресмята се в десети, без float — CONTRACT §3). */
export const XP_MULTIPLIER = { min: 1, max: 3 } as const;

/**
 * Свободен текст към чата на играта — същото правило като `Text.SafeText` в C#: без контролни
 * знаци (те са цветови кодове в CS2), `{`/`}` → `(`/`)` (цветовите тагове на CSS), таван по
 * UTF-16 единици и trim. Сурогатна двойка не се цепи (C# би я срязал; тук спираме преди нея).
 */
export function safeChatText(input: string, max = ADVERT_TEXT_MAX): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    const next = char === '{' ? '(' : char === '}' ? ')' : char;
    if (out.length + next.length > max) break;
    out += next;
  }
  return out.trim();
}

const advertText = z
  .string()
  .min(1)
  .max(ADVERT_TEXT_MAX)
  .refine((text) => safeChatText(text) === text, { message: 'unsafe text' });

export const advertsSchema = z
  .object({
    intervalSec: z
      .number()
      .int()
      .refine(
        (value) =>
          value === ADVERT_INTERVAL.off ||
          (value >= ADVERT_INTERVAL.min && value <= ADVERT_INTERVAL.max),
      ),
    builtin: z
      .object({ carbonstealth: z.boolean(), adblock: z.boolean(), site: z.boolean() })
      .strict(),
    custom: z
      .object({
        bg: z.array(advertText).max(MAX_CUSTOM_ADVERTS),
        en: z.array(advertText).max(MAX_CUSTOM_ADVERTS),
      })
      .strict(),
  })
  .strict();

export const ammoSchema = z.object({ infiniteReserve: z.boolean() }).strict();
export const botsSchema = z.object({ quota: z.number().int().min(0).max(BOT_QUOTA_MAX) }).strict();
export const xpSchema = z
  .object({
    multiplier: z
      .number()
      .min(XP_MULTIPLIER.min)
      .max(XP_MULTIPLIER.max)
      .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9),
  })
  .strict();
export const joinSchema = z.object({ welcome: z.boolean() }).strict();

export const SETTING_SCHEMAS = {
  adverts: advertsSchema,
  ammo: ammoSchema,
  bots: botsSchema,
  xp: xpSchema,
  join: joinSchema,
} as const satisfies Record<SettingKey, z.ZodTypeAny>;

export type Settings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> };

/**
 * Поведението днес (конфигът на плъгина от /etc/cs2/cs2.env и `gamemode_deathmatch_server.cfg`):
 * реклама на 240 s, трите вградени, безкраен резерв, `bot_quota 10`, XP ×1, поздрав при влизане.
 * Без ред в базата плъгинът ползва СВОЯ конфиг — тези стойности са само за показ в панела.
 */
export const SETTING_DEFAULTS: Settings = {
  adverts: {
    intervalSec: 240,
    builtin: { carbonstealth: true, adblock: true, site: true },
    custom: { bg: [], en: [] },
  },
  ammo: { infiniteReserve: true },
  bots: { quota: 10 },
  xp: { multiplier: 1 },
  join: { welcome: true },
};

export function parseSetting<K extends SettingKey>(key: K, value: unknown): Settings[K] | null {
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  return parsed.success ? (parsed.data as Settings[K]) : null;
}

/** Множителят в десети (10…30) — така го смятат и C# (`Progression.ApplyMultiplier`), и levels.ts. */
export function multiplierTenths(multiplier: number): number {
  return Math.min(30, Math.max(10, Math.round(multiplier * 10)));
}

/** Множител от формата („1,5“ / „1.5“ / „2“) → число с една десетична; невалиден → null. */
export function parseMultiplier(input: string): number | null {
  const match = /^([1-3])(?:[.,](\d))?$/.exec(input.trim());
  if (!match) return null;
  const tenths = Number(match[1]) * 10 + Number(match[2] ?? '0');
  return tenths >= 10 && tenths <= 30 ? tenths / 10 : null;
}
