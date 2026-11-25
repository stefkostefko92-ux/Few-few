'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

// Мобилното меню на публичния хедър: <details> (работи и без JS), а тук само се затваря —
// при избор на връзка (котвите #features не презареждат страницата), Escape и клик навън.
export function LxMenu({ label, navLabel, links }: { label: string; navLabel: string; links: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);
  return (
    <details ref={ref} className="lx-menu">
      <summary className="lx-menu-btn">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="sr-only">{label}</span>
      </summary>
      <nav aria-label={navLabel} className="lx-menu-panel">
        {links.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => ref.current?.removeAttribute('open')}>
            {link.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
