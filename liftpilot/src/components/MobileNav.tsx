'use client';

// The public header's drawer on narrow screens: a <details> (it opens and closes without JavaScript too); the script
// only closes it on Escape (focus back on the button), on the backdrop and on a link.
import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';

export default function MobileNav({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const close = (focus: boolean): void => {
      if (!d.open) return;
      d.open = false;
      if (focus) d.querySelector('summary')?.focus();
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(true); };
    const onClick = (e: MouseEvent): void => {
      if (e.target instanceof Element && e.target.closest('a, .drawer-backdrop')) close(false);
    };
    document.addEventListener('keydown', onKey);
    d.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      d.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <details ref={ref} className="nav-drawer">
      <summary className="btn btn-sm btn-icon" aria-label={label}>
        <Icon name="menu" size={20} className="when-closed" />
        <Icon name="x" size={18} className="when-open" />
      </summary>
      <div className="drawer-backdrop" aria-hidden="true" />
      <div className="drawer-panel">{children}</div>
    </details>
  );
}
