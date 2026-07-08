"use client";

import { THEMES } from "@/lib/themes";

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function ThemePicker({ value, onChange }: Props) {
  // ARIA radiogroup: един таб-стоп (избраната тема), стрелките местят избора.
  function onKeyDown(e: React.KeyboardEvent) {
    const idx = THEMES.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % THEMES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + THEMES.length) % THEMES.length;
    }
    if (next >= 0) {
      e.preventDefault();
      const id = THEMES[next]!.id;
      onChange(id);
      (e.currentTarget.querySelector(`[data-theme-id="${id}"]`) as HTMLElement | null)?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Цветова тема"
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-2"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          data-theme-id={t.id}
          title={t.name}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1.5 text-xs font-semibold transition ${
            value === t.id
              ? "border-tera shadow-soft"
              : "border-ink/10 hover:border-ink/30"
          }`}
        >
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border border-ink/10"
            style={{ background: t.bg }}
          />
          <span
            aria-hidden
            className="h-4 w-4 rounded-full"
            style={{ background: t.accent }}
          />
          {t.name}
        </button>
      ))}
    </div>
  );
}
