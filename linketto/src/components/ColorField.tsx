'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PALETTE, PALETTE_GROUPS, dominantColors, isHex, normalizeHex, pushRecent, type PaletteGroup } from '@/lib/color-palette';
import { readableOn } from '@/lib/style';
import { cn } from '@/components/ui/cn';

export type ColorFieldLabels = {
  open: string;
  title: string;
  fromPhoto: string;
  recent: string;
  custom: string;
  auto: string;
  invalid: string;
  groups: Record<PaletteGroup, string>;
};

const RECENT_KEY = 'linketto:recent-colors';

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && isHex(c)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // частен прозорец/блокирано хранилище — само удобство, без последствия
  }
}

/** Цветовете на собствената снимка (само наш /media — иначе canvas е „замърсен“ от CORS). */
async function photoColors(url: string): Promise<string[]> {
  if (!/^\/media\/[a-z0-9-]+\.webp$/.test(url)) return [];
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, 48, 48);
  return dominantColors(ctx.getImageData(0, 0, 48, 48).data, 6);
}

/**
 * Поле за цвят, което се ползва без да знаеш какво е hex: бутон с мостра → палитра (подбрани
 * групи, цветовете от снимката ти, последно избрани, „друг цвят“ през системния избор,
 * „автоматичен“). Текстовото поле с `name` остава истинският вход — формата работи и без
 * JavaScript, а живият преглед (LivePreview) получава всяка промяна като `input` събитие.
 */
export function ColorField({
  label,
  name,
  defaultValue,
  allowEmpty = false,
  placeholder = '#3b82c4',
  photoUrl,
  labels,
  className,
}: {
  /** Видимият етикет — свързан с текстовото поле (екранен четец, клик). */
  label: string;
  name: string;
  defaultValue?: string | null;
  /** Празно = „автоматичен“ / по темата (иначе полето е задължително). */
  allowEmpty?: boolean;
  placeholder?: string;
  photoUrl?: string | null;
  labels: ColorFieldLabels;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [fromPhoto, setFromPhoto] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const inputId = useId();

  // Стойността в истинското поле + `input`/`change` събитие за формата и живия преглед.
  const commit = useCallback((next: string, remember = true) => {
    const input = inputRef.current;
    setValue(next);
    setInvalid(false);
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (remember && isHex(next)) {
      setRecent((list) => {
        const updated = pushRecent(list, next);
        writeRecent(updated);
        return updated;
      });
    }
  }, []);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    if (photoUrl && fromPhoto === null) {
      photoColors(photoUrl)
        .then(setFromPhoto)
        .catch(() => setFromPhoto([]));
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // Фокус в палитрата — на избрания цвят или на първия.
    requestAnimationFrame(() => {
      const panel = document.getElementById(panelId);
      const target =
        panel?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? panel?.querySelector<HTMLButtonElement>('button');
      target?.focus();
    });
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, photoUrl, fromPhoto, close, panelId]);

  const shown = isHex(value) ? value : null;
  const swatch = (hex: string, key: string) => {
    const selected = shown?.toLowerCase() === hex.toLowerCase();
    return (
      <button
        key={key}
        type="button"
        aria-label={hex}
        aria-pressed={selected}
        title={hex}
        onClick={() => {
          commit(hex);
          close();
        }}
        className={cn(
          'focus-ring h-7 w-7 rounded-full border border-black/15 transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100 dark:border-white/20',
          selected && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
        )}
        style={{ backgroundColor: hex }}
      />
    );
  };
  const row = (title: string, colors: readonly string[], prefix: string) =>
    colors.length > 0 && (
      <div>
        <p className="mb-1.5 text-micro font-semibold text-fg-muted">{title}</p>
        <div className="grid grid-cols-8 gap-1.5">{colors.map((c, i) => swatch(c, `${prefix}-${i}`))}</div>
      </div>
    );

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1 flex items-stretch gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={labels.open}
          onClick={() => setOpen((v) => !v)}
          className="focus-ring relative h-10 w-12 shrink-0 overflow-hidden rounded-control border border-line-input"
          style={
            shown
              ? { backgroundColor: shown }
              : { backgroundImage: 'repeating-conic-gradient(#d1d5db 0 25%, #f9fafb 0 50%)', backgroundSize: '12px 12px' }
          }
        >
          {shown && (
            <span aria-hidden className="text-micro font-bold" style={{ color: readableOn(shown) }}>
              Aa
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          name={name}
          value={value}
          required={!allowEmpty}
          placeholder={allowEmpty ? labels.auto : placeholder}
          pattern="#[0-9a-fA-F]{6}"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => {
            // Прощаващ вход: „22C55E“, „#2c5“ → #22c55e / #22cc55.
            const normalized = normalizeHex(value);
            if (normalized === null) setInvalid(true);
            else if (normalized !== value) commit(normalized);
          }}
          className={cn(
            'w-full rounded-control border border-line-input bg-surface px-3 py-2 font-mono text-sm',
            invalid && 'border-danger',
          )}
        />
      </div>
      {invalid && <p className="mt-1 text-micro text-danger-text">{labels.invalid}</p>}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={labels.title}
          className="absolute start-0 z-[60] mt-2 w-[min(19rem,calc(100vw-2.5rem))] space-y-3 rounded-card border border-line bg-surface p-3 shadow-e3"
        >
          {fromPhoto && row(labels.fromPhoto, fromPhoto, 'photo')}
          {row(labels.recent, recent, 'recent')}
          {PALETTE_GROUPS.map((group) => (
            <div key={group}>{row(labels.groups[group], PALETTE[group], group)}</div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <label className="focus-within:ring-2 focus-within:ring-accent relative inline-flex cursor-pointer items-center gap-2 rounded-control border border-line px-2.5 py-1.5 text-small font-semibold text-fg">
              <span
                aria-hidden
                className="h-4 w-4 rounded-full"
                style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
              />
              {labels.custom}
              <input
                type="color"
                value={shown ?? '#3b82c4'}
                // Докато се влачи в системния избор — само преглед; в „последно избрани“ — при излизане.
                onChange={(event) => commit(event.target.value, false)}
                onBlur={(event) => commit(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {allowEmpty && (
              <button
                type="button"
                aria-pressed={value === ''}
                onClick={() => {
                  commit('');
                  close();
                }}
                className="focus-ring rounded-control border border-line px-2.5 py-1.5 text-small font-semibold text-fg aria-pressed:border-accent aria-pressed:text-accent-text"
              >
                {labels.auto}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
