'use client';

// The words of a refusal of the survey sheets' actions (`rilievi.error.<code>`). The sheet's form (`form`) holds what the
// person typed: its texts say the data are still there and what to do; a button or the order of the sections say
// nothing changed. An expired session links to the sign-in in a new tab, so that this page — and what it holds — stays.
import { useLocale, useTranslations } from 'next-intl';
import type { RilievoActionError } from '@/lib/rilievi/action-state';

/** The codes whose words depend on whether the page holds typed data. */
const AS_ACTION: ReadonlySet<RilievoActionError> = new Set<RilievoActionError>(['sessionExpired', 'offline', 'failed']);

export default function RefusalText({ code, form = false }: { code: RilievoActionError; form?: boolean }) {
  const t = useTranslations('rilievi'), locale = useLocale();
  const key = !form && AS_ACTION.has(code) ? `${code}Action` : code;
  if (code !== 'sessionExpired') return <>{t(`error.${key}`)}</>;
  return <>{t.rich(`error.${key}`, { login: (c) => <a href={`/${locale}/login`} target="_blank" rel="noopener">{c}</a> })}</>;
}
