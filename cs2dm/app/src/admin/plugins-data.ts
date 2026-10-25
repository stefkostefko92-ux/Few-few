import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MAX_CONFIG_CHARS,
  PLUGIN_CATALOG,
  PLUGIN_STATES,
  type PluginEntry,
  type PluginState,
} from './plugins-catalog.js';

/**
 * Отговорите за плъгините (CONTRACT §14): списъкът от агента (`plugins`) и конфигът от плъгина
 * (`plugins.config.get`). Непознат id от агента се пренебрегва — каталогът е нашият.
 */
const listSchema = z.object({
  mods: z
    .array(
      z.object({
        id: z.string().max(64),
        kind: z.string().max(16).nullish(),
        version: z.string().max(64).nullish(),
        state: z.enum(PLUGIN_STATES),
      }),
    )
    .max(64),
  busy: z.boolean(),
});

export interface PluginRow extends PluginEntry {
  version: string | null;
  /** null — агентът не върна реда (или не отговаря). */
  state: PluginState | null;
}

export interface PluginList {
  rows: PluginRow[];
  busy: boolean;
}

/** Каталогът без данни от агента — показва се, когато той не отговаря (без бутони). */
export function catalogRows(): PluginRow[] {
  return PLUGIN_CATALOG.map((entry) => ({ ...entry, version: null, state: null }));
}

export function parsePluginList(data: unknown): PluginList | null {
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) return null;
  const byId = new Map(parsed.data.mods.map((mod) => [mod.id, mod]));
  return {
    busy: parsed.data.busy,
    rows: PLUGIN_CATALOG.map((entry) => {
      const mod = byId.get(entry.id);
      return { ...entry, version: mod?.version ?? null, state: mod?.state ?? null };
    }),
  };
}

const configSchema = z.object({
  text: z.string().max(MAX_CONFIG_CHARS),
  edited: z.boolean(),
  hasDefault: z.boolean(),
});
export type PluginConfig = z.infer<typeof configSchema>;

export function parsePluginConfig(data: unknown): PluginConfig | null {
  const parsed = configSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Конфигът трябва да е JSON обект (не масив, не null) — същата проверка прави и плъгинът. */
export function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

/** За одита: размер и отпечатък, никога съдържанието. */
export function configFingerprint(text: string): { bytes: number; sha256: string } {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}
