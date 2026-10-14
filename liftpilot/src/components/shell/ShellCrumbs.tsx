'use client';

// The top bar's path on the pages that do not draw their own (the dashboard, the library, the management): the group
// and the section, as the sidebar names them. A page with its own breadcrumbs (Crumbs: installation / record) puts them
// in this place on wide screens instead (shell.css), and this one is hidden. Under the Rilievi home (/app) its full list
// and the sheets (/app/rilievi…) belong to «Rilievi» in the sidebar: the path goes on to the list («Schede», its own
// heading), so that only the home is called by the home's name.
import { usePathname } from '@/i18n/routing';
import { useSection, type NavGroup } from '../NavLinks';

export default function ShellCrumbs({ groups, extra, label, list }: { groups: NavGroup[]; extra: { key: string; label: string }[]; label: string; list: string }) {
  const current = useSection(groups, extra.map((e) => e.key)), pathname = usePathname();
  const group = groups.find((g) => g.items.some((i) => i.key === current));
  const page = group?.items.find((i) => i.key === current)?.label ?? extra.find((e) => e.key === current)?.label;
  if (!page) return null;
  const sub = current === 'rilievi' && pathname !== '/app' ? list : null;
  return (
    <nav className="ws-crumbs" aria-label={label}>
      <ol className="crumbs">
        {/* a long name is cut in the bar: the whole of it on hover (as Crumbs) */}
        {group ? <li><span title={group.label}>{group.label}</span></li> : null}
        <li><span aria-current={sub ? undefined : 'page'} title={page}>{page}</span></li>
        {sub ? <li><span aria-current="page" title={sub}>{sub}</span></li> : null}
      </ol>
    </nav>
  );
}
