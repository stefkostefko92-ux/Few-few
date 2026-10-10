'use client';

// The top bar's search of the company's installations: a GET form to the dashboard (`/app?q=…`), which filters them on
// the server by name, address, municipality and plant number (src/server/queries.ts listProjects). On the dashboard it
// keeps the list's filters (archived, module) and shows the words searched. Wide screens: the field in the bar, with
// Ctrl+K / ⌘K to reach it; phones: a search button that opens the field under the bar.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import Form from 'next/form';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/routing';
import { SEARCH_MAX_CHARS } from '@/lib/dashboard';
import Icon from '../Icon';

const noop = (): (() => void) => () => undefined;
/** The shortcut's name on this computer; nothing on the server (the hint appears once the page runs). */
const shortcutName = (): string => (/Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? '⌘ K' : 'Ctrl K');

export default function ShellSearch({ label, placeholder }: { label: string; placeholder: string }) {
  const locale = useLocale(), pathname = usePathname(), sp = useSearchParams();
  const kbd = useSyncExternalStore(noop, shortcutName, () => '');
  const wide = useRef<HTMLInputElement>(null), narrow = useRef<HTMLDetailsElement>(null);
  const onDashboard = pathname === '/app';
  const q = onDashboard ? (sp.get('q') ?? '') : '';
  const keep = onDashboard ? (['archived', 'kind'] as const).flatMap((k) => { const v = sp.get(k); return v ? [[k, v] as const] : []; }) : [];

  // Ctrl+K / ⌘K: the field takes the focus (on a phone the search opens first)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      e.preventDefault();
      if (wide.current?.getClientRects().length) {
        wide.current.focus();
        wide.current.select();
      } else if (narrow.current) {
        narrow.current.open = true;
        narrow.current.querySelector('input')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const field = (id: string, ref?: typeof wide, hint?: string) => (
    // keyed by the words: after a search the field shows them, after leaving the dashboard it is empty again
    <Form key={`${pathname}?${q}`} action={`/${locale}/app`} role="search" className="ws-search" aria-label={label}>
      {keep.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Icon name="search" size={16} />
      <input ref={ref} id={id} type="search" name="q" defaultValue={q} placeholder={placeholder} aria-label={label}
        maxLength={SEARCH_MAX_CHARS} enterKeyHint="search" autoComplete="off" spellCheck={false} />
      {hint ? <kbd aria-hidden="true">{hint}</kbd> : null}
    </Form>
  );
  return (
    <>
      <div className="ws-search-wide">{field('ws-q', wide, kbd)}</div>
      <details ref={narrow} className="ws-search-narrow">
        <summary aria-label={label}><Icon name="search" size={18} /></summary>
        {field('ws-q-phone')}
      </details>
    </>
  );
}
