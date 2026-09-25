// Клиентски кеш на /assets/items3d/{catalog,manifest}.json — зареждат се веднъж, споделят се
// между Sprite (кой предмет има изпечена икона), ItemViewer3D и SetViewer3D.
import type { CatalogEntry } from '../../combat/engine/items/theme';
import { fallbackTheme } from '../../combat/engine/items/theme';

let catalogPromise: Promise<Map<string, CatalogEntry>> | null = null;
let manifestPromise: Promise<Set<string>> | null = null;

function loadCatalog(): Promise<Map<string, CatalogEntry>> {
  if (!catalogPromise) {
    catalogPromise = fetch('/assets/items3d/catalog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: CatalogEntry[]) => new Map(arr.map((e) => [e.slug, e])))
      .catch(() => new Map());
  }
  return catalogPromise;
}

function loadManifest(): Promise<Set<string>> {
  if (!manifestPromise) {
    manifestPromise = fetch('/assets/items3d/manifest.json')
      .then((r) => (r.ok ? r.json() : { slugs: [] }))
      .then((m: { slugs?: string[] }) => new Set(m.slugs || []))
      .catch(() => new Set<string>());
  }
  return manifestPromise;
}

/** Синхронен, best-effort кеш за Sprite (не иска да чака Promise на всеки рендер на списък). */
let manifestCache: Set<string> | null = null;
loadManifest().then((s) => { manifestCache = s; });

export function hasBakedIcon(slug: string | undefined): boolean {
  if (!slug || !manifestCache) return false;
  return manifestCache.has(slug);
}

export async function getCatalogEntry(slug: string, fallback: { tier: number; rarity: string; category: string; sub_type?: string }): Promise<CatalogEntry> {
  const map = await loadCatalog();
  const found = map.get(slug);
  if (found) return found;
  return { slug, name: slug, category: fallback.category as CatalogEntry['category'], sub_type: fallback.sub_type, tier: fallback.tier, rarity: fallback.rarity as CatalogEntry['rarity'], theme: fallbackTheme(fallback) };
}

export async function getAllCatalog(): Promise<CatalogEntry[]> {
  const map = await loadCatalog();
  return [...map.values()];
}
