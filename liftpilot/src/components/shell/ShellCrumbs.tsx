'use client';

// The top bar's path on the pages that do not draw their own (the dashboard, the library, the management): the group
// and the section, as the sidebar names them. A page with its own breadcrumbs (Crumbs: installation / record) puts them
// in this place on wide screens instead (shell.css), and this one is hidden.
import { useSection, type NavGroup } from '../NavLinks';

export default function ShellCrumbs({ groups, extra, label }: { groups: NavGroup[]; extra: { key: string; label: string }[]; label: string }) {
  const current = useSection(groups, extra.map((e) => e.key));
  const group = groups.find((g) => g.items.some((i) => i.key === current));
  const page = group?.items.find((i) => i.key === current)?.label ?? extra.find((e) => e.key === current)?.label;
  if (!page) return null;
  return (
    <nav className="ws-crumbs" aria-label={label}>
      <ol className="crumbs">
        {group ? <li><span>{group.label}</span></li> : null}
        <li><span aria-current="page">{page}</span></li>
      </ol>
    </nav>
  );
}
