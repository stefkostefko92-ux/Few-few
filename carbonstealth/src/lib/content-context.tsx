// Контекст: активният език + заредените content/site данни за него.
import { createContext, useContext } from 'react';
import type { Content, Lang, SiteData } from './types';

export interface ContentCtx {
  lang: Lang;
  content: Content;
  site: SiteData;
}

const Ctx = createContext<ContentCtx | null>(null);

export const ContentProvider = Ctx.Provider;

export function useContent(): ContentCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useContent извън ContentProvider');
  return v;
}

/** Кратък достъп до UI речника. */
export function useUI(): Record<string, string> {
  return useContent().content.ui;
}
