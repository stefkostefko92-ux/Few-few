'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { LocaleChoice } from '@/components/LocaleChoice';
import { ChevronDownGlyph, GlobeGlyph } from '@/components/ui/glyphs';
import { cn } from '@/components/ui/cn';

// Избор на език в хедъра: бутон + списък от всички езици (чисти <a> —
// ръчният избор пише бисквитката през LocaleChoice). Адресът е текущата
// страница на избрания език. Escape/клик встрани затварят; под `inline`
// списъкът стои в потока (мобилното меню).
export function LanguageMenu({
  locale,
  label,
  inline = false,
}: {
  locale: Locale;
  label: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.replace(/^\/[^/]+/, '');
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, inline]);

  const list = (
    <ul
      id={panelId}
      className={cn(
        'grid gap-0.5 text-small',
        inline
          ? 'mt-2 max-h-64 grid-cols-2 overflow-y-auto'
          : 'max-h-[min(26rem,70vh)] grid-cols-2 overflow-y-auto',
      )}
    >
      {LOCALES.map((loc) => (
        <li key={loc}>
          <LocaleChoice
            locale={loc}
            href={`/${loc}${rest}`}
            className={cn(
              'focus-ring flex items-center justify-between gap-2 rounded-[0.375rem] px-2.5 py-1.5 transition-colors',
              loc === locale
                ? 'bg-accent-soft font-semibold text-accent-soft-fg'
                : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
            )}
          >
            <span className="truncate">{LOCALE_NAMES[loc]}</span>
            <span className="text-micro uppercase text-fg-muted">{loc}</span>
          </LocaleChoice>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={root} className={cn('relative', inline && 'w-full')}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'focus-ring inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-small font-semibold text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg',
          inline && 'w-full justify-between border border-line bg-surface px-3',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <GlobeGlyph className="h-4 w-4" />
          <span className="sr-only">{label}: </span>
          <span className="uppercase" aria-hidden>
            {locale}
          </span>
          {inline && (
            <span className="font-medium normal-case text-fg-muted" aria-hidden>
              {LOCALE_NAMES[locale]}
            </span>
          )}
        </span>
        <ChevronDownGlyph
          className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open &&
        (inline ? (
          list
        ) : (
          <div className="absolute end-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-2 shadow-e3">
            {list}
          </div>
        ))}
    </div>
  );
}
