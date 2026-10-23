'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/routing';
import { navCurrent, shellSection } from '@/lib/dashboard';
import Icon from './Icon';
import type { IconName } from './icon-names';

export interface NavItem {
  /** `dashboard`, `archived`, `new-replacement`, `new-full`, or the section's path (src/lib/dashboard.ts shellSection) */
  key: string;
  href: string;
  label: string;
  icon: IconName;
  /** a page outside the application (the public guide): opened in a new tab, this text said to screen readers */
  newTab?: string;
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
  return shellSection(pathname, { archived: sp.get('archived') === '1' }, pathsOf(groups, extra));
}

// The sidebar's sections in their groups (Area di lavoro, Libreria, Gestione), each with its painted icon; the current one
// marked (aria-current: `page` on its own page, `true` on a page that belongs to it) with the template's cyan edge.
// A link followed in the phone drawer closes it (shell/Drawer).
export default function NavLinks({ groups, label }: { groups: NavGroup[]; label: string }) {
  const current = useSection(groups), pathname = usePathname();
  return (
    <nav className="ws-navs" aria-label={label}>
      {groups.map((g, gi) => (
        <div key={g.label} className="ws-group">
          <p className="ws-nav-label" id={`ws-group-${gi}`}>{g.label}</p>
          <ul className="ws-nav" aria-labelledby={`ws-group-${gi}`}>
            {g.items.map((it) => (
              <li key={it.key}>
                <Link href={it.href} aria-current={current === it.key ? navCurrent(it.key, pathname) : undefined}
                  {...(it.newTab ? { target: '_blank', rel: 'noopener' } : {})}>
                  <Icon name={it.icon} size={20} />
                  <span>{it.label}{it.newTab ? <span className="sr-only"> ({it.newTab})</span> : null}</span>
                  {it.newTab ? <Icon name="external-link" size={14} className="ws-nav-ext" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The help pinned at the sidebar's bottom (round 48): the public guide in a new tab and «Segnala un problema», which
 *  takes the page the person is on (`?da=`, path only — feedback.ts pagePath checks it again) so that the administrator
 *  sees the screen the report is about. On the report's own page it is marked and carries nothing. */
export function HelpLinks({ label, guide, newTab, feedback }: { label: string; guide: string; newTab: string; feedback: string }) {
  const pathname = usePathname();
  const here = pathname === '/app/segnala';
  const report = here ? '/app/segnala' : `/app/segnala?da=${encodeURIComponent(pathname)}`;
  return (
    <nav className="ws-help" aria-label={label}>
      <Link href="/guida" target="_blank" rel="noopener">
        <Icon name="book-open" size={16} />
        <span>{guide}<span className="sr-only"> ({newTab})</span></span>
        <Icon name="external-link" size={12} className="ws-nav-ext" />
      </Link>
      <Link href={report} aria-current={here ? 'page' : undefined}>
        <Icon name="message-circle" size={16} />
        <span>{feedback}</span>
      </Link>
    </nav>
  );
}

/** A link of the shell to a page outside the groups (the account): marked when it is the page. */
export function ShellLink({ href, className, title, children }: { href: string; className?: string; title?: string; children: ReactNode }) {
  const pathname = usePathname();
  return <Link href={href} className={className} title={title} aria-current={pathname === href ? 'page' : undefined}>{children}</Link>;
}
