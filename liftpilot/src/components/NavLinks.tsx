'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';
import { shellSection } from '@/lib/dashboard';
import Icon from './Icon';
import type { IconName } from './icon-names';

export interface NavItem {
  /** `dashboard`, `archived`, `new-replacement`, `new-full`, or the section's path (src/lib/dashboard.ts shellSection) */
  key: string;
  href: string;
  label: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The section paths among the entries (their keys starting with "/"), with the extra pages the shell names. */
const pathsOf = (groups: readonly NavGroup[], extra: readonly string[]): string[] =>
  [...groups.flatMap((g) => g.items.map((i) => i.key)).filter((k) => k.startsWith('/')), ...extra];

/** The key of the page in the sidebar, from the address (its path and the dashboard's query). */
export function useSection(groups: readonly NavGroup[], extra: readonly string[] = []): string | null {
  const pathname = usePathname(), sp = useSearchParams();
  return shellSection(pathname, { archived: sp.get('archived') === '1', kind: sp.get('kind') }, pathsOf(groups, extra));
}

// The sidebar's sections in their groups (Workspace, Library, Management), each with its painted icon; the current one
// marked (aria-current) with the template's cyan edge. A link followed in the phone drawer closes it (shell/Drawer).
export default function NavLinks({ groups, label }: { groups: NavGroup[]; label: string }) {
  const current = useSection(groups);
  return (
    <nav className="ws-navs" aria-label={label}>
      {groups.map((g, gi) => (
        <div key={g.label} className="ws-group">
          <p className="ws-nav-label" id={`ws-group-${gi}`}>{g.label}</p>
          <ul className="ws-nav" aria-labelledby={`ws-group-${gi}`}>
            {g.items.map((it) => (
              <li key={it.key}>
                <Link href={it.href} aria-current={current === it.key ? 'page' : undefined}>
                  <Icon name={it.icon} size={20} />
                  <span>{it.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** A link of the shell to a page outside the groups (the account): marked when it is the page. */
export function ShellLink({ href, className, title, children }: { href: string; className?: string; title?: string; children: ReactNode }) {
  const pathname = usePathname();
  return <Link href={href} className={className} title={title} aria-current={pathname === href ? 'page' : undefined}>{children}</Link>;
}
