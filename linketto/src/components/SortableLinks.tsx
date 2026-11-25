'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reorderLinksAction } from '@/app/actions/profile';
import { moveInOrder } from '@/lib/link-order';
import { cn } from '@/components/ui/cn';

/**
 * Списъкът с блокове в таблото: влачене за дръжката (мишка и пръст — pointer
 * events, не HTML5 DnD, който не работи на телефон) и стрелки ↑/↓ от
 * клавиатурата върху дръжката. Новият ред се записва веднага; сървърът го
 * приема само ако е точно същото множество блокове (validReorder).
 * Редовете (формите вътре) идват готови от сървъра.
 */
export function SortableLinks({
  profileId,
  items,
  labels,
}: {
  profileId: string;
  items: { id: string; label: string; node: React.ReactNode }[];
  labels: { handle: string; saving: string; saved: string; failed: string };
}) {
  const router = useRouter();
  const serverIds = items.map((item) => item.id);
  const serverKey = serverIds.join(',');
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const drag = useRef<{ id: string; start: string } | null>(null);

  // Нов ред от сървъра (запис, добавяне, триене) → локалният се нулира.
  useEffect(() => setOrder(null), [serverKey]);

  const current = order ?? serverIds;
  const byId = new Map(items.map((item) => [item.id, item]));

  const save = (next: string[]) => {
    setStatus('saving');
    startTransition(async () => {
      const result = await reorderLinksAction(profileId, next).catch(() => ({ ok: false }));
      if (result.ok) {
        setStatus('saved');
        router.refresh();
      } else {
        setOrder(null);
        setStatus('error');
      }
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, start: current.join(',') };
    setDragging(id);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = drag.current;
    const list = listRef.current;
    if (!active || !list) return;
    const others = Array.from(list.querySelectorAll<HTMLElement>(':scope > li[data-id]')).filter(
      (row) => row.dataset.id !== active.id,
    );
    let index = 0;
    for (const row of others) {
      const box = row.getBoundingClientRect();
      if (event.clientY > box.top + box.height / 2) index += 1;
    }
    const next = others.map((row) => row.dataset.id as string);
    next.splice(index, 0, active.id);
    if (next.join(',') !== current.join(',')) setOrder(next);
  };

  const onPointerEnd = () => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    setDragging(null);
    if (current.join(',') !== active.start) save(current);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = moveInOrder(current, id, event.key === 'ArrowUp' ? 'up' : 'down');
    if (!next) return;
    setOrder(next);
    save(next);
    // Фокусът остава на дръжката на преместения ред.
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector<HTMLButtonElement>(`li[data-id="${CSS.escape(id)}"] [data-drag-handle]`)
        ?.focus(),
    );
  };

  return (
    <div>
      <ol
        ref={listRef}
        className="space-y-3"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {current.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              data-id={id}
              className={cn(
                'flex gap-2 rounded-card border border-line bg-surface p-3 transition-shadow',
                dragging === id && 'relative z-10 shadow-e3 ring-2 ring-accent',
              )}
            >
              <button
                type="button"
                data-drag-handle
                aria-label={`${labels.handle}: ${item.label}`}
                title={labels.handle}
                onPointerDown={(event) => onPointerDown(event, id)}
                onKeyDown={(event) => onKeyDown(event, id)}
                className={cn(
                  'focus-ring flex w-7 shrink-0 touch-none select-none items-center justify-center self-stretch rounded-control text-fg-muted hover:bg-surface-3 hover:text-fg',
                  dragging === id ? 'cursor-grabbing' : 'cursor-grab',
                )}
              >
                <span aria-hidden className="grid grid-cols-2 gap-[3px]">
                  {Array.from({ length: 6 }, (_, dot) => (
                    <span key={dot} className="h-[3px] w-[3px] rounded-full bg-current" />
                  ))}
                </span>
              </button>
              <div className="min-w-0 flex-1">{item.node}</div>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-micro text-fg-muted">
        {status === 'saving' && labels.saving}
        {status === 'saved' && labels.saved}
        {status === 'error' && <span className="text-danger-text">{labels.failed}</span>}
      </p>
    </div>
  );
}
