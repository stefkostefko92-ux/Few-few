// Тема: светла / тъмна / системна. Изборът живее в localStorage (try/catch —
// режим „инкогнито“ и забранен достъп не чупят нищо), а ЕФЕКТИВНАТА тема
// стои като data-theme на <html>. THEME_BOOT е статичен низ (никакъв
// потребителски вход) и се изпълнява в <head> преди първия кадър.

export const THEME_KEY = 'linketto-theme';
export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_PREFS: readonly ThemePref[] = ['light', 'dark', 'system'];

export const THEME_BOOT = `(function(){var d=document.documentElement,p='system',m=false;try{var s=localStorage.getItem('${THEME_KEY}');if(s==='light'||s==='dark')p=s}catch(e){}try{m=window.matchMedia('(prefers-color-scheme: dark)').matches}catch(e){}d.setAttribute('data-theme',p==='system'?(m?'dark':'light'):p);d.setAttribute('data-theme-pref',p)})()`;

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function readThemePref(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage недостъпен — системната тема */
  }
  return 'system';
}

export function applyThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* няма да се запомни, но темата пак се прилага за тази страница */
  }
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(pref));
  root.setAttribute('data-theme-pref', pref);
}
