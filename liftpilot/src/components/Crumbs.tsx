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
        {items.map((it) => {
          // the dashboard has one name, the sidebar's, wherever the path starts from it
          const label = it.href === '/app' ? t('dashboard') : it.label;
          return <li key={`${it.href ?? ''}${label}`}>{it.href ? <Link href={it.href}>{label}</Link> : <span aria-current="page">{label}</span>}</li>;
        })}
      </ol>
    </nav>
  );
}
