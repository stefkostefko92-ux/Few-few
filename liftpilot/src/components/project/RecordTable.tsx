import type { ReactNode } from 'react';
import type { Verdict } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import VerdictPill from '@/components/VerdictPill';

export interface RecordRow {
  id: string;
  label: string | null;
  verdict: Verdict;
  failCount: number;
  warnCount: number;
  summary: string;
  createdAt: Date;
  user: { name: string } | null;
  /** the running engines no longer reproduce it (src/server/records.ts, `outdated`): «da aggiornare» */
  old: boolean;
}

/** The saved records of one kind on an installation's page: the date (the link) with the label, the result with the
 *  mark of a record to update, what it is, who saved it; `extra` adds a column, `under` a line under the result. */
export default async function RecordTable({ rows, href, what, locale, extra, under }: {
  rows: RecordRow[]; href: (id: string) => string; what: string; locale: string;
  extra?: { label: string; cell: (r: RecordRow) => ReactNode }; under?: (r: RecordRow) => ReactNode;
}) {
  const [tc, tf] = await Promise.all([getTranslations('calculations'), getTranslations('refresh')]);
  const fd = dateFormat(locale);
  return (
    <div className="table-panel">
      <table className="data-table stack">
        <thead>
          <tr><th>{tc('col_date')}</th><th>{tc('col_result')}</th><th>{what}</th><th>{tc('col_author')}</th>{extra ? <th>{extra.label}</th> : null}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="row-title">
                <Link href={href(r.id)} className="font-semibold">{fd.dateTime(r.createdAt)}</Link>
                {r.label ? <div className="note">{r.label}</div> : null}
              </td>
              <td data-label={tc('col_result')}>
                <div className="cell-stack">
                  <VerdictPill verdict={r.verdict} fails={r.failCount} warns={r.warnCount} />
                  {r.old ? <span className="chip old">{tf('outdated')}</span> : null}
                  {under ? under(r) : null}
                </div>
              </td>
              <td data-label={what} className="spec">{r.summary}</td>
              <td data-label={tc('col_author')}>{r.user?.name ?? '—'}</td>
              {extra ? <td data-label={extra.label}>{extra.cell(r)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
