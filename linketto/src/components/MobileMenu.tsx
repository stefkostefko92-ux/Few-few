'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CloseGlyph, MenuGlyph } from '@/components/ui/glyphs';

// Мобилното меню на хедъра: бутон (aria-expanded/controls) + панел под
// хедъра. Escape и навигация го затварят. Съдържанието идва от сървъра.
export function MobileMenu({
  labels,
  children,
}: {
  labels: { open: string; close: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((value) => !value)}
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-control text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
      >
        {open ? <CloseGlyph className="h-5 w-5" /> : <MenuGlyph className="h-5 w-5" />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        onClick={(event) => {
          // клик по връзка/бутон-за-подаване затваря панела
          if ((event.target as HTMLElement).closest('a')) setOpen(false);
        }}
        className="absolute inset-x-0 top-full max-h-[calc(100vh-var(--header-h))] overflow-y-auto border-b border-line bg-bg px-5 pb-6 pt-3 shadow-e3"
      >
        {children}
      </div>
    </div>
  );
}
