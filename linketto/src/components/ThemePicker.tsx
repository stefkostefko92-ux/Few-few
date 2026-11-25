import type { CSSProperties } from 'react';
import {
  PROFILE_THEMES,
  THEME_DEFS,
  themeVars,
  type ProfileThemeId,
} from '@/lib/profile-themes';

// Избор на тема с живо превю (чист HTML: радио бутони, без JS). Превюто се
// рисува от същите токени като публичния профил — какво се вижда тук, това
// получават посетителите.

function Mini({
  id,
  side,
  accent,
}: {
  id: ProfileThemeId;
  side?: 'light' | 'dark';
  accent: string;
}) {
  const def = THEME_DEFS[id];
  const vars = themeVars(id, side) as CSSProperties;
  const framed = def.tokens.card !== '#00000000';
  const sceneBg = def.previewBg;
  return (
    <span
      aria-hidden="true"
      className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5 px-3"
      style={sceneBg ? { ...vars, backgroundImage: sceneBg } : vars}
    >
      <span
        className="flex w-full flex-col items-center gap-1.5 rounded-lg px-2 py-2"
        style={
          framed
            ? {
                background: 'var(--pf-card)',
                boxShadow: 'inset 0 0 0 1px var(--pf-card-bd)',
              }
            : undefined
        }
      >
        <span
          className="h-5 w-5 rounded-full"
          style={{ background: accent, boxShadow: '0 0 0 2px var(--pf-card, transparent)' }}
        />
        <span
          className={`text-[11px] font-semibold leading-none ${
            def.displayName === 'serif' ? 'font-serif' : ''
          }`}
          style={{ color: 'var(--pf-fg)' }}
        >
          Aa
        </span>
        {[0, 1].map((i) => (
          <span
            key={i}
            className="h-3 w-full rounded-full"
            style={{
              background: 'var(--pf-surface)',
              boxShadow: `inset 0 0 0 1px ${
                i === 0 ? accent : 'var(--pf-surface-bd)'
              }`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function ThemePicker({
  name,
  legend,
  value,
  accent,
  labels,
  className,
}: {
  name: string;
  legend: string;
  value: string;
  accent: string;
  labels: Record<ProfileThemeId, string>;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PROFILE_THEMES.map((id) => (
          <label key={id} className="group relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={id}
              defaultChecked={value === id}
              className="peer sr-only"
            />
            <span className="block overflow-hidden rounded-card border border-line bg-surface p-1.5 transition peer-checked:border-accent peer-checked:shadow-focus peer-focus-visible:shadow-focus group-hover:border-accent">
              <span className="flex h-28 overflow-hidden rounded-control">
                {id === 'auto' ? (
                  <>
                    <Mini id={id} side="light" accent={accent} />
                    <Mini id={id} side="dark" accent={accent} />
                  </>
                ) : (
                  <Mini id={id} accent={accent} />
                )}
              </span>
              <span className="mt-1.5 block px-1 text-xs font-semibold text-fg-2">
                {labels[id]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
