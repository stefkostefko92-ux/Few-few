import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import SectionTitle from '@/components/project/SectionTitle';

// The drawing sets issued for an installation, newest first (round 53: on «Tavole e documenti», out of the overview), each
// to its page; and the installation's data that sheet 1 reads.
export default async function TavoleEmesse({ projectId, sets, locale }: {
  projectId: string; sets: { id: string; number: string; revision: number; createdAt: Date; authorInitials: string; user: { name: string } | null }[]; locale: string;
}) {
  const [tt, td] = await Promise.all([getTranslations('tavole'), getTranslations('documenti')]), fd = dateFormat(locale);
  return (
    <div className="flex flex-col gap-3" id="doc-emesse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle level={3} icon="history">{td('emesse', { n: sets.length })}</SectionTitle>
        <Link className="btn btn-sm" href={`/app/projects/${projectId}/impianto`}>{tt('plantTitle')}</Link>
      </div>
      {sets.length ? (
        <ul className="rec-list" aria-label={tt('list')}>
          {sets.map((x) => (
            <li key={x.id}>
              <Link href={`/app/drawing-sets/${x.id}`} className="num">{tt('number')} {x.number}{x.revision ? ` R${x.revision}` : ''}</Link>
              <span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span>
            </li>
          ))}
        </ul>
      ) : <p className="note">{tt('none')}</p>}
    </div>
  );
}
