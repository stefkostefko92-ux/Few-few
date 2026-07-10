// Асинхронно зареждане + кеш на JSON dataset-а от /public/data/.
// Всеки файл се тегли максимум веднъж и остава в паметта.

import type {
  BlogData,
  Content,
  GeoData,
  Lang,
  SeoData,
  SiteData,
} from './types';

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Неуспешно зареждане на ${file}: ${r.status}`);
      return r.json();
    });
    // Провалено зареждане не остава в кеша — следващият опит тегли наново.
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return cache.get(file) as Promise<T>;
}

export function loadContent(lang: Lang): Promise<Content> {
  return load<Content>(`content.${lang}.json`);
}

export function loadSite(): Promise<SiteData> {
  return load<SiteData>('site.json');
}

export function loadBlog(): Promise<BlogData> {
  return load<BlogData>('blog.json');
}

export function loadGeo(): Promise<GeoData> {
  return load<GeoData>('geo.json');
}

export function loadSeo(): Promise<SeoData> {
  return load<SeoData>('seo.json');
}
