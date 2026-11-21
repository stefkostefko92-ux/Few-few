'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeDraft, type PreviewDraft } from '@/lib/preview-codec';
import { cn } from '@/components/ui/cn';

/**
 * Жив преглед на профила до формите в таблото. Следи формите с
 * data-preview и при промяна (без запис!) праща незапазените стойности като
 * чернова към /u/<slug>/preview в iframe. След запис (нов `rev` от сървъра)
 * прегледът се презарежда със записаното състояние.
 *
 *   data-preview="profile"      — тема и акцент
 *   data-preview="style"        — персонализацията
 *   data-preview="translation"  — име/био (скрито поле locale)
 *   data-preview="link"         — заглавие на блок (скрити linkId + locale)
 *   data-preview="link-edit"    — редакция на блок (заглавие на основния език)
 */
type Labels = {
  title: string;
  hint: string;
  language: string;
  open: string;
  close: string;
  toggle: string;
  frame: string;
};

const SKIP = new Set(['uiLocale', 'profileId', 'tz']);

function serialize(form: HTMLFormElement): string {
  const parts: string[] = [];
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string' && !SKIP.has(key)) parts.push(`${key}=${value}`);
  });
  return parts.join('\u0001');
}

function fields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string' && !SKIP.has(key)) out[key] = value;
  });
  return out;
}

export function LivePreview({
  slug,
  locales,
  defaultLocale,
  rev,
  labels,
}: {
  slug: string;
  locales: { code: string; name: string }[];
  defaultLocale: string;
  rev: string;
  labels: Labels;
}) {
  const [hl, setHl] = useState(defaultLocale);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [loading, setLoading] = useState(true);
  const snapshots = useRef(new WeakMap<HTMLFormElement, string>());
  const pending = useRef(new Set<HTMLFormElement>());
  const timer = useRef<number | undefined>(undefined);

  const forms = () => Array.from(document.querySelectorAll<HTMLFormElement>('form[data-preview]'));

  const build = useCallback(() => {
    const next: PreviewDraft = {};
    for (const form of forms()) {
      const base = snapshots.current.get(form);
      if (base === undefined || base === serialize(form)) continue;
      const values = fields(form);
      switch (form.dataset.preview) {
        case 'profile':
          next.theme = values.theme;
          next.accent = values.accent ?? '';
          break;
        case 'style':
          next.style = values;
          break;
        case 'translation':
          if (values.locale) (next.tr ??= {})[values.locale] = { n: values.displayName, b: values.bio };
          break;
        case 'link':
        case 'link-edit': {
          const locale = values.locale ?? form.dataset.locale;
          if (values.linkId && locale && values.title !== undefined) {
            ((next.lt ??= {})[values.linkId] ??= {})[locale] = values.title;
          }
          break;
        }
      }
    }
    setDraft(encodeDraft(next));
  }, []);

  // Снимка на записаното състояние: при първо зареждане, за нови форми и за
  // току-що изпратените (след запис идва нов rev).
  useEffect(() => {
    for (const form of forms()) {
      if (!snapshots.current.has(form) || pending.current.has(form)) {
        snapshots.current.set(form, serialize(form));
      }
    }
    pending.current.clear();
    build();
  }, [rev, build]);

  useEffect(() => {
    const onEdit = (event: Event) => {
      const form = (event.target as Element | null)?.closest?.('form[data-preview]') as HTMLFormElement | null;
      if (!form) return;
      // Редакция на друг език → прегледът показва този език.
      const locale = (form.elements.namedItem('locale') as HTMLInputElement | null)?.value ?? form.dataset.locale;
      if (locale && locales.some((item) => item.code === locale)) setHl(locale);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(build, 350);
    };
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement;
      if (form.matches?.('form[data-preview]')) pending.current.add(form);
    };
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('submit', onSubmit, true);
      window.clearTimeout(timer.current);
    };
  }, [build, locales]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 80rem)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const src = `/u/${encodeURIComponent(slug)}/preview?hl=${encodeURIComponent(hl)}${draft ? `&d=${draft}` : ''}&r=${rev}`;
  useEffect(() => setLoading(true), [src]);
  const showFrame = desktop || open;

  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-small font-semibold text-fg">
            <span
              aria-hidden
              className={cn('h-2 w-2 shrink-0 rounded-full bg-success', loading && 'animate-pulse bg-warning')}
            />
            {labels.title}
          </p>
          <p className="truncate text-micro text-fg-muted">{labels.hint}</p>
        </div>
        {locales.length > 1 && (
          <label className="shrink-0">
            <span className="sr-only">{labels.language}</span>
            <select
              value={hl}
              onChange={(event) => setHl(event.target.value)}
              className="focus-ring max-w-[9rem] rounded-control border border-line-input bg-surface px-2 py-1 text-micro font-semibold text-fg"
            >
              {locales.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code.toUpperCase()} · {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[2rem] border-[6px] border-fg/85 bg-black shadow-e3">
        {showFrame && (
          <iframe
            key="preview"
            title={labels.frame}
            src={src}
            onLoad={() => setLoading(false)}
            sandbox="allow-same-origin"
            tabIndex={-1}
            className="h-full w-full bg-white"
          />
        )}
      </div>
      <a
        href={`/u/${encodeURIComponent(slug)}?hl=${encodeURIComponent(hl)}`}
        target="_blank"
        rel="noopener"
        className="focus-ring mt-2 self-center rounded-control px-2 py-1 text-micro font-semibold text-accent-text hover:underline"
      >
        {labels.open} ↗
      </a>
    </div>
  );

  return (
    <>
      {/* Десктоп: залепен панел до формите */}
      <div className="sticky top-[calc(var(--header-h)+1rem)] hidden h-[calc(100vh-var(--header-h)-2rem)] max-h-[52rem] xl:block">
        {desktop && panel}
      </div>

      {/* Мобилно/таблет: плаващ бутон → преглед на цял екран */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="focus-ring fixed bottom-4 end-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-small font-semibold text-accent-fg shadow-e3 xl:hidden"
      >
        <span aria-hidden className="h-4 w-2.5 rounded-[3px] border-2 border-current" />
        {labels.toggle}
      </button>
      {open && !desktop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.title}
          className="fixed inset-0 z-50 flex flex-col bg-bg/95 p-4 backdrop-blur-xl xl:hidden"
        >
          <div className="mx-auto flex h-full w-full max-w-sm flex-col">
            <button
              type="button"
              onClick={() => setOpen(false)}
              autoFocus
              className="focus-ring mb-3 self-end rounded-control border border-line bg-surface px-3 py-1.5 text-small font-semibold text-fg"
            >
              {labels.close}
            </button>
            <div className="min-h-0 flex-1">{panel}</div>
          </div>
        </div>
      )}
    </>
  );
}
