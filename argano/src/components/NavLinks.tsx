'use client';

import { Link, usePathname } from '@/i18n/routing';

export interface NavItem {
  href: string;
  label: string;
}

// The current section is marked; /app matches only itself and the project pages under it.
export default function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const current = (href: string): boolean =>
    href === '/app' ? pathname === '/app' || pathname.startsWith('/app/projects') || pathname.startsWith('/app/calculations') : pathname.startsWith(href);
  return (
    <nav className="nav" aria-label={label}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={current(it.href) ? 'page' : undefined}>{it.label}</Link>
      ))}
    </nav>
  );
}
