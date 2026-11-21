'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { CloseGlyph, MenuGlyph } from '@/components/ui/glyphs';

/**
 * Обвивка на приложението със странично меню (фази 2–3). ≥lg: фиксирана
 * колона 15 rem; по-малко: чекмедже с бутон „Меню“, Escape/клик встрани/
 * навигация го затварят. Подай готовия <Sidebar/> като `sidebar`.
 *
 *   <AppShell sidebar={<Sidebar … />} topbar={<h1>…</h1>}
 *             labels={{ open: 'Меню', close: 'Затвори менюто' }}>
 *     {страницата}
 *   </AppShell>
 *
 * Страничното меню е логически преди съдържанието (редът за четци/Tab).
 */
export function AppShell({
  sidebar,
  topbar,
  labels,
  children,
  className,
}: {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  labels: { open: string; close: string };
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    // Фокусът влиза в чекмеджето (WCAG 2.4.3): иначе Tab минава зад слоя към съдържанието.
    asideRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={cn('min-h-screen bg-bg text-fg lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]', className)}>
      <aside
        ref={asideRef}
        id={panelId}
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-[15rem] border-e border-line bg-surface transition-[transform,visibility] duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:bg-surface-2/50 lg:rtl:translate-x-0',
          open ? 'visible translate-x-0' : 'invisible -translate-x-full rtl:translate-x-full lg:visible',
        )}
        // Клик по връзка в чекмеджето го затваря (котвите в същата страница
        // не сменят pathname)
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {sidebar}
      </aside>
      {open && (
        <button
          type="button"
          aria-label={labels.close}
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-fg/40 backdrop-blur-[2px] lg:hidden"
        />
      )}
      <div className="min-w-0">
        <div className="sticky top-0 z-30 flex h-header items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? labels.close : labels.open}
            onClick={() => setOpen((value) => !value)}
            className="focus-ring -ms-1 inline-flex h-9 w-9 items-center justify-center rounded-control text-fg-2 hover:bg-surface-3 lg:hidden"
          >
            {open ? <CloseGlyph className="h-5 w-5" /> : <MenuGlyph className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">{topbar}</div>
        </div>
        <div className="px-4 py-8 sm:px-6 lg:px-10" inert={open}>
          {children}
        </div>
      </div>
    </div>
  );
}
