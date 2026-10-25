/**
 * Каталогът на плъгините за панела (CONTRACT §14) — само проверените модове от `server/mods/mods.lock`.
 * Същите id като в `mods-lib.sh`, агента и C# `PluginCatalog`; `test/plugins-catalog.test.mjs` (в корена на
 * cs2dm) пази паритета и чете този файл с регулярен израз — затова всеки запис е на ОДИН ред.
 * `config` е името на конфига (`configs/plugins/<К>/<К>.json`); `hasDefault` — дали има наш
 * `<К>.default.json` (CheaterTroll пази свои данни и няма „по подразбиране“).
 */
export type PluginKind = 'css' | 'metamod';

export interface PluginEntry {
  readonly id: string;
  readonly kind: PluginKind;
  readonly config: string | null;
  readonly hasDefault: boolean;
}

export const PLUGIN_CATALOG = [
  { id: 'serverlistplayersfix', kind: 'metamod', config: null, hasDefault: false },
  { id: 'quakesounds', kind: 'css', config: 'QuakeSounds', hasDefault: true },
  { id: 'cosmetics', kind: 'css', config: 'Cosmetics', hasDefault: true },
  { id: 'demorecorder', kind: 'css', config: 'DemoRecorder', hasDefault: true },
  { id: 'cheatertroll', kind: 'css', config: 'CheaterTroll', hasDefault: false },
  { id: 'metablock', kind: 'css', config: 'MetaBlock', hasDefault: true },
] as const satisfies ReadonlyArray<PluginEntry>;

export type PluginId = (typeof PLUGIN_CATALOG)[number]['id'];

/** id-тата като непразен кортеж — за `z.enum`. */
export const PLUGIN_IDS = PLUGIN_CATALOG.map((entry) => entry.id) as [PluginId, ...PluginId[]];

/** Ядрото и MultiAddonManager (решава се от Workshop addon-ите): показват се, но не се пипат. */
export const CORE_PLUGINS = [
  'metamod',
  'counterstrikesharp',
  'deathmatch',
  'carbonstealth',
  'multiaddonmanager',
] as const;

export const PLUGIN_OPS = ['install', 'remove', 'enable', 'disable'] as const;
export type PluginOp = (typeof PLUGIN_OPS)[number];

export const PLUGIN_STATES = ['enabled', 'disabled', 'removed'] as const;
export type PluginState = (typeof PLUGIN_STATES)[number];

/** Таванът на конфига (знаци) — същият като в плъгина (`plugins.config.set`). */
export const MAX_CONFIG_CHARS = 32_768;

export function pluginEntry(id: PluginId): PluginEntry {
  const entry = PLUGIN_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`плъгин извън каталога: ${id}`);
  return entry;
}
