'use client';

// The list's search (rilievi list.ejs + app.js live search): a GET form, so it works without JavaScript; with it, the
// results follow the typing — 220 ms after the last key the address becomes `?q=…` (replaced, not pushed) and the server
// renders the results again; Enter searches at once. «/» jumps to the field from anywhere on the page (not while typing
// in a field). `live={false}` (the trash): the plain form only, as in rilievi. Its «?» (round 52) sits beside the box,
// not inside it: the box lights up while its field has the focus, never for the «?».
import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from '@/i18n/routing';
import { MAX_QUERY_LENGTH } from '@/lib/rilievi/search';
import Aiuto from '../aiuto/Aiuto';
import Icon from '../Icon';

export default function LiveSearch({ action, base, query, label, placeholder, aiuto, live = true }: {
  /** the form's own address (with the locale), for the browser without JavaScript */
  action: string;
  /** the same page for the router (without the locale) */
  base: string;
  query: string;
  label: string;
  placeholder: string;
  /** what to type (the page's text, messages/aiuto/rilievi.json); none — no «?» */
  aiuto?: string | null;
  live?: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const run = (): void => {
    const q = input.current?.value.trim() ?? '';
    start(() => router.replace(q ? { pathname: base, query: { q } } : base, { scroll: false }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (e.key !== '/' || typing || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, []);

  // the results' box says it is waiting while the new ones come (the status line is the server's, role=status)
  useEffect(() => {
    document.getElementById('results')?.setAttribute('aria-busy', busy ? 'true' : 'false');
  }, [busy]);

  const form = (
    <form className="rv-search" role="search" method="get" action={action}
      onSubmit={live ? (e) => { e.preventDefault(); window.clearTimeout(timer.current); run(); } : undefined}>
      <label className="sr-only" htmlFor="q">{label}</label>
      <Icon name="search" size={18} />
      <input ref={input} id="q" name="q" type="search" defaultValue={query} placeholder={placeholder} autoComplete="off" autoCapitalize="none"
        spellCheck={false} maxLength={MAX_QUERY_LENGTH} enterKeyHint="search" aria-describedby="search-status" aria-controls={live ? 'results' : undefined}
        onInput={live ? () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(run, 220); } : undefined} />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
  if (!aiuto) return form;
  return <div className="rv-search-row">{form}<span className="lbl"><Aiuto testo={aiuto} nome={label} /></span></div>;
}
