/**
 * Избор на език (EN/BG/IT). Пише в i18next (persist-ва се в
 * localStorage.nd_locale през детектора) и обновява <html lang>.
 * Ползва се в Navbar (в играта) и на Landing (преди вход).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED, switchLocale, type Locale } from '../i18n';

const LABELS: Record<Locale, string> = { en: 'EN', bg: 'БГ', it: 'IT' };

export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current = (SUPPORTED.find((l) => i18n.language?.startsWith(l)) ?? 'en') as Locale;
  return (
    <div className={`lang-selector${compact ? ' lang-selector--compact' : ''}`} role="group" aria-label="Language">
      {SUPPORTED.map((loc) => (
        <button
          key={loc}
          type="button"
          className={`lang-btn${current === loc ? ' active' : ''}`}
          aria-pressed={current === loc}
          onClick={() => switchLocale(loc)}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
