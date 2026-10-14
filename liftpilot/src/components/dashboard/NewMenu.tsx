'use client';

// The dashboard's primary action, «Nuovo impianto»: a button that opens the choice between the two modules under it
// (a <details>, so it works before the page runs). Esc or a click outside closes it; Esc gives the focus back.
import { useEffect, useRef, type ReactNode } from 'react';

export default function NewMenu({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const d = menu.current;
      if (e.key !== 'Escape' || !d?.open) return;
      d.open = false;
      d.querySelector('summary')?.focus();
    };
    const onDown = (e: PointerEvent): void => {
      const d = menu.current;
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);
  return (
    <details ref={menu} className="dash-new">
      <summary className="btn btn-primary">
        {/* drawn in the button's ink: the painted icons are cyan, like the button */}
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        {label}
        <svg className="dash-new-chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="dash-new-panel">{children}</div>
    </details>
  );
}
