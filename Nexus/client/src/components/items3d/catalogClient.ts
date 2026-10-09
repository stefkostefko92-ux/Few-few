// Клиентски кеш на /assets/items3d/catalog.json — зарежда се веднъж, споделя се между
// ItemViewer3D и SetViewer3D (само те строят живо 3D; решетката вече е изцяло на старата
// рисувана икона, виж Sprite.tsx — там вече не влиза catalogClient).
import type { CatalogEntry } from '../../combat/engine/items/theme';
import { fallbackTheme } from '../../combat/engine/items/theme';

let catalogPromise: Promise<Map<string, CatalogEntry>> | null = null;

function loadCatalog(): Promise<Map<string, CatalogEntry>> {
  if (!catalogPromise) {
    catalogPromise = fetch('/assets/items3d/catalog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: CatalogEntry[]) => new Map(arr.map((e) => [e.slug, e])))
      .catch(() => new Map());
  }
  return catalogPromise;
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
