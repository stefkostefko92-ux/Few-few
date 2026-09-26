// frontend/src/contexts/I18nContext.jsx
// Превод на дашборда. Езикът идва от акаунта (user.language, зареден през
// /auth/me), затова изборът пътува с потребителя, не със сесията или браузъра.
//
// Fallback: непреведен ключ показва английския канон, а напълно непознат ключ
// връща самия ключ — така липсващ превод НИКОГА не чупи екрана (най-лошото е
// английска дума на иначе преведена страница).
import { createContext, useContext, useMemo, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { DASHBOARD_EN, LOCALE_LOADERS, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "../i18n/dashboard";

// Заредените таблици (английският е винаги тук). Кеш на ниво модул — езикът се
// тегли веднъж на сесия, не при всяко монтиране.
const LOADED = { [DEFAULT_LOCALE]: DASHBOARD_EN };

const I18nContext = createContext(null);

// Прости {placeholder} замествания — без библиотека за интерполация.
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }) {
  const { user } = useAuth();
  const lang = SUPPORTED_LOCALES.includes(user?.language) ? user.language : DEFAULT_LOCALE;
  const [, setLoaded] = useState(0); // само за пре-рендер, когато таблицата пристигне

  useEffect(() => {
    if (LOADED[lang]) return undefined;
    let alive = true;
    LOCALE_LOADERS[lang]?.()
      .then((m) => { LOADED[lang] = m.default; if (alive) setLoaded((n) => n + 1); })
      .catch(() => { LOADED[lang] = DASHBOARD_EN; if (alive) setLoaded((n) => n + 1); }); // мрежата падна → английски, не празен екран
    return () => { alive = false; };
  }, [lang]);

  const ready = !!LOADED[lang];
  const t = useCallback(
    (key, vars) => {
      const table = LOADED[lang] || DASHBOARD_EN;
      const value = table[key] ?? DASHBOARD_EN[key] ?? key;
      return interpolate(value, vars);
    },
    [lang, ready],
  );

  const value = useMemo(() => ({ t, lang }), [t, lang]);
  // Езикът на потребителя още пътува (~19 KB, веднъж на сесия): не рисуваме
  // английски за миг — това мига. Анонимните посетители са на английски и не чакат.
  if (!ready) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  // Безопасно извън провайдъра (напр. в тест или на изолирана страница):
  // връщаме идентитет-функция, за да не гърми извикването на t().
  if (!ctx) return { t: (k) => k, lang: DEFAULT_LOCALE };
  return ctx;
}
