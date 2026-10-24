import { z } from 'zod';
import {
  ADVERT_LANGS,
  BOT_QUOTA_MAX,
  BUILTIN_ADVERTS,
  MAX_CUSTOM_ADVERTS,
  parseMultiplier,
  parseSetting,
  safeChatText,
  type SettingKey,
  type Settings,
} from '../settings.js';
import { checkbox, first, optionalString, requiredInt } from './forms.js';

/**
 * Формите на `/admin/settings` → стойността на групата (CONTRACT §11). Полетата минават през zod,
 * текстовете към чата — през `safeChatText` (като `Text.SafeText` в C#), а готовата стойност — през
 * строгата схема на групата. null = невалидна форма (нищо не се записва).
 */
const intervalField = z.object({ intervalSec: requiredInt(0, 3600) });
const quotaField = z.object({ quota: requiredInt(0, BOT_QUOTA_MAX) });
const multiplierField = z.object({ multiplier: z.preprocess(first, z.string().max(8)) });
const ammoField = z.object({ infiniteReserve: checkbox });
const joinField = z.object({ welcome: checkbox });
/** Един рекламен текст от формата: до 400 знака вход, после се чисти до 192. */
const advertField = optionalString(400);

/** Името на полето за n-тия текст на езика: `bg_0` … `en_4`. */
export function advertFieldName(lang: (typeof ADVERT_LANGS)[number], index: number): string {
  return `${lang}_${index}`;
}

function advertsFromForm(body: Record<string, unknown>): unknown {
  const interval = intervalField.safeParse(body);
  if (!interval.success) return null;
  const builtin = Object.fromEntries(
    BUILTIN_ADVERTS.map((key) => [key, checkbox.parse(body[`b_${key}`])]),
  );
  const custom: Record<string, string[]> = {};
  for (const lang of ADVERT_LANGS) {
    const texts: string[] = [];
    for (let index = 0; index < MAX_CUSTOM_ADVERTS; index += 1) {
      const raw = advertField.safeParse(body[advertFieldName(lang, index)]);
      if (!raw.success) return null;
      const clean = raw.data === undefined ? '' : safeChatText(raw.data);
      if (clean.length > 0) texts.push(clean);
    }
    custom[lang] = texts;
  }
  return { intervalSec: interval.data.intervalSec, builtin, custom };
}

function candidate(key: SettingKey, body: Record<string, unknown>): unknown {
  switch (key) {
    case 'adverts':
      return advertsFromForm(body);
    case 'ammo':
      return { infiniteReserve: ammoField.parse(body).infiniteReserve };
    case 'bots': {
      const parsed = quotaField.safeParse(body);
      return parsed.success ? { quota: parsed.data.quota } : null;
    }
    case 'xp': {
      const parsed = multiplierField.safeParse(body);
      const multiplier = parsed.success ? parseMultiplier(parsed.data.multiplier) : null;
      return multiplier === null ? null : { multiplier };
    }
    case 'join':
      return { welcome: joinField.parse(body).welcome };
  }
}

export function settingFromForm<K extends SettingKey>(key: K, body: unknown): Settings[K] | null {
  if (!body || typeof body !== 'object') return null;
  const value = candidate(key, body as Record<string, unknown>);
  return value === null ? null : parseSetting(key, value);
}

/** JSON с подредени ключове — jsonb пренарежда ключовете, затова сравняваме канонично. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : nested,
  );
}
