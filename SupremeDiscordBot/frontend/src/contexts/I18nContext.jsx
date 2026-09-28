// frontend/src/contexts/I18nContext.jsx
// Превод на дашборда. Езикът идва от акаунта (user.language, зареден през
// /auth/me), затова изборът пътува с потребителя, не със сесията или браузъра.
//
// Fallback: непреведен ключ показва английския канон, а напълно непознат ключ
// връща самия ключ — така липсващ превод НИКОГА не чупи екрана (най-лошото е
// английска дума на иначе преведена страница).
import { createContext, useContext, useMemo, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { DASHBOARD_LOCALES, DEFAULT_LOCALE } from "../i18n/dashboard";

const I18nContext = createContext(null);

// Прости {placeholder} замествания — без библиотека за интерполация.
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }) {
  const { user } = useAuth();
  const lang = DASHBOARD_LOCALES[user?.language] ? user.language : DEFAULT_LOCALE;

  const t = useCallback(
    (key, vars) => {
      const table = DASHBOARD_LOCALES[lang] || DASHBOARD_LOCALES[DEFAULT_LOCALE];
      const value = table[key] ?? DASHBOARD_LOCALES[DEFAULT_LOCALE][key] ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ t, lang }), [t, lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  // Безопасно извън провайдъра (напр. в тест или на изолирана страница):
  // връщаме идентитет-функция, за да не гърми извикването на t().
  if (!ctx) return { t: (k) => k, lang: DEFAULT_LOCALE };
  return ctx;
}
