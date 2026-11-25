'use client';

import { useEffect, useRef, useState } from 'react';
import {
  THEME_KEY,
  THEME_PREFS,
  applyThemePref,
  readThemePref,
  type ThemePref,
} from '@/components/ui/theme';
import { MonitorGlyph, MoonGlyph, SunGlyph } from '@/components/ui/glyphs';
import { cn } from '@/components/ui/cn';

const ICONS = {
  light: SunGlyph,
  dark: MoonGlyph,
  system: MonitorGlyph,
} as const;

// Превключвател светла / тъмна / системна (radiogroup със стрелки).
// Избраното се рисува от CSS по data-theme-pref на <html> (globals.css) —
// затова е вярно още в първия кадър; тук се пази само ARIA състоянието.
// Размерите са фиксирани → превключването не мести нищо (нула CLS).
export function ThemeToggle({
  labels,
  showLabels = false,
  className,
}: {
  labels: { group: string; light: string; dark: string; system: string };
  showLabels?: boolean;
  className?: string;
}) {
  const [pref, setPref] = useState<ThemePref>('system');
  const refs = useRef<Record<ThemePref, HTMLButtonElement | null>>({
    light: null,
    dark: null,
    system: null,
  });

  useEffect(() => {
    setPref(readThemePref());
    // Системната тема се сменя на живо, докато изборът е „системна“
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => {
      if (readThemePref() === 'system') applyThemePref('system');
    };
    // Друг раздел сменя темата → следваме го
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        const next = readThemePref();
        applyThemePref(next);
        setPref(next);
      }
    };
    media.addEventListener('change', onMedia);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onMedia);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function choose(next: ThemePref) {
    applyThemePref(next);
    setPref(next);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = THEME_PREFS.length - 1;
    let target = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      target = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      target = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = last;
    if (target < 0) return;
    event.preventDefault();
    const next = THEME_PREFS[target];
    choose(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={labels.group}
      className={cn(
        'theme-toggle inline-flex items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {THEME_PREFS.map((value, index) => {
        const Icon = ICONS[value];
        const checked = pref === value;
        return (
          <button
            key={value}
            ref={(node) => {
              refs.current[value] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={labels[value]}
            title={labels[value]}
            tabIndex={checked ? 0 : -1}
            data-theme-opt={value}
            onClick={() => choose(value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'focus-ring inline-flex h-7 items-center justify-center gap-1.5 rounded-[0.375rem] text-fg-muted transition-colors hover:text-fg',
              showLabels ? 'min-w-0 flex-1 px-2.5 text-small font-semibold' : 'w-7',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabels && <span className="truncate">{labels[value]}</span>}
          </button>
        );
      })}
    </div>
  );
}
