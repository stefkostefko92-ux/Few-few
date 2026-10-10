// Изпечените фотореалистични рендери на предметите (public/assets/items/<slug>.webp, виж
// scripts/bake-items.mjs). Манифестът се тегли веднъж за приложението; Sprite.tsx и прегледа
// питат „има ли рендер за този slug", иначе падат на старата рисувана икона.
import { useSyncExternalStore } from 'react';

export interface BakedManifest {
  version: number;
  size: number;
  /** slug → файл + хеш на съдържанието (кеш-бъстър). */
  items: Record<string, { file: string; hash: string }>;
  /** „sword-t6", „helm", … → slug на представителен предмет — за места без slug (награди, рецепти). */
  aliases?: Record<string, string>;
}

type State = BakedManifest | null | undefined; // undefined = още се тегли, null = няма/грешка

let state: State;
let promise: Promise<BakedManifest | null> | null = null;
const listeners = new Set<() => void>();

export function loadBakedManifest(): Promise<BakedManifest | null> {
  if (!promise) {
    promise = fetch('/assets/items/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<BakedManifest>) : null))
      .catch(() => null)
      .then((m) => {
        state = m;
        listeners.forEach((l) => l());
        return m;
      });
  }
  return promise;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  void loadBakedManifest();
  return () => listeners.delete(cb);
}

/** undefined = още се тегли (не рисувай стара икона — иначе премигва), null = рендери няма. */
export function useBakedManifest(): State {
  return useSyncExternalStore(subscribe, () => state, () => undefined);
}

/** URL на рендера за предмет: първо точният slug, после псевдоним по (категория-тир). */
export function bakedSrc(m: BakedManifest | null | undefined, slug?: string, iconSlug?: string): string | null {
  if (!m) return null;
  const pick = (key?: string): { file: string; hash: string } | undefined => (key ? m.items[key] : undefined);
  const hit = pick(slug) ?? pick(iconSlug) ?? pick(iconSlug ? m.aliases?.[iconSlug] : undefined);
  return hit ? `/assets/items/${hit.file}?v=${hit.hash}` : null;
}
