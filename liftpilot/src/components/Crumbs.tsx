import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export interface Crumb {
  href?: string;
  label: string;
}

/** Where the page sits: Installations / installation / calculation. The last item is the page itself. As the first
 *  child of the page's <main>, on wide screens it stands in the workspace's top bar (shell.css, .crumbs-nav). */
export default async function Crumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations('nav');
  return (
    <nav className="crumbs-nav" aria-label={t('breadcrumb')}>
      <ol className="crumbs">
        {items.map((it) => (
          <li key={`${it.href ?? ''}${it.label}`}>{it.href ? <Link href={it.href}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}
