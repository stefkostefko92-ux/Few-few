'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  /** Съдържанието на панела (Tabs). За SegmentedControl не е нужно. */
  content?: React.ReactNode;
  disabled?: boolean;
}

function useRovingKeys(
  items: readonly TabItem[],
  currentIndex: number,
  select: (index: number) => void,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  function onKeyDown(event: React.KeyboardEvent) {
    const pos = enabled.indexOf(currentIndex);
    let target: number | undefined;
    if (event.key === next) target = enabled[(pos + 1) % enabled.length];
    else if (event.key === prev) target = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled[enabled.length - 1];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
    refs.current[target]?.focus();
  }
  return { refs, onKeyDown };
}

/** Табове с панели (WAI-ARIA tabs, автоматично активиране). */
export function Tabs({
  items,
  defaultId,
  label,
  className,
}: {
  items: readonly TabItem[];
  defaultId?: string;
  /** aria-label на списъка с табове */
  label: string;
  className?: string;
}) {
  const base = useId();
  const [activeId, setActiveId] = useState(defaultId ?? items.find((i) => !i.disabled)?.id ?? items[0]?.id);
  const index = Math.max(0, items.findIndex((i) => i.id === activeId));
  const { refs, onKeyDown } = useRovingKeys(items, index, (i) => setActiveId(items[i].id));

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item, i) => {
          const selected = i === index;
          return (
            <button
              key={item.id}
              ref={(node) => {
                refs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => setActiveId(item.id)}
              className={cn(
                'focus-ring relative -mb-px whitespace-nowrap px-3.5 py-2.5 text-body font-semibold transition-colors disabled:opacity-50',
                selected
                  ? 'text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, i) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={i !== index}
          tabIndex={0}
          className="focus-ring pt-5"
        >
          {i === index ? item.content : null}
        </div>
      ))}
    </div>
  );
}

/** Сегментиран избор (radiogroup) — за малък брой взаимно изключващи се режими. */
export function SegmentedControl({
  items,
  value,
  defaultValue,
  onChange,
  label,
  className,
}: {
  items: readonly TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label: string;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const current = value ?? inner;
  const index = Math.max(0, items.findIndex((i) => i.id === current));
  const choose = (i: number) => {
    setInner(items[i].id);
    onChange?.(items[i].id);
  };
  const { refs, onKeyDown } = useRovingKeys(items, index, choose);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('inline-flex gap-0.5 rounded-control border border-line bg-surface-2 p-0.5', className)}
    >
      {items.map((item, i) => {
        const selected = i === index;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => choose(i)}
            className={cn(
              'focus-ring h-8 whitespace-nowrap rounded-[0.375rem] px-3 text-small font-semibold transition-colors disabled:opacity-50',
              selected ? 'bg-surface text-fg shadow-e2' : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
