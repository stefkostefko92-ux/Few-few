import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import type { ProjectKind } from '@/lib/schemas';
import type { IconName } from '@/components/icon-names';

/** The two modules: the machine replacement alone, or a whole project; their slug in the address and their icon. */
export const MODULES: readonly { kind: ProjectKind; slug: string; icon: IconName }[] = [
  { kind: 'REPLACEMENT', slug: 'replacement', icon: 'motor' },
  { kind: 'FULL', slug: 'full', icon: 'elevator' },
];

/** The choice of a new installation: one card per module, each opening the new installation with it chosen. */
export default async function ModuleCards() {
  const t = await getTranslations('projects');
  return (
    <div className="app-modules">
      {MODULES.map((m) => (
        <Link key={m.kind} href={`/app/projects/new?kind=${m.slug}`} className={`app-module app-module-${m.slug}`}>
          <span className="app-module-head">
            <span className="icon-tile"><Icon name={m.icon} size={24} /></span>
            <span className="eyebrow plain">{t(`kind_${m.kind}`)}</span>
          </span>
          <strong>{t(`module_${m.kind}_title`)}</strong>
          <span className="note">{t(`module_${m.kind}_lead`)}</span>
          <span className="btn btn-primary btn-sm">{t(`module_${m.kind}_new`)}</span>
        </Link>
      ))}
    </div>
  );
}
