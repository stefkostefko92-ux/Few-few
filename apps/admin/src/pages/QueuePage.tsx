import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import type { ReportStatus } from '@/api/types';
import { listReports } from '@/api/reports';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABEL, STATUS_TABS } from '@/lib/labels';

const PAGE_SIZE = 20;

export function QueuePage() {
  const [status, setStatus] = useState<ReportStatus>('PENDING');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['reports', status, page],
    queryFn: () => listReports({ status, page, pageSize: PAGE_SIZE }),
  });

  const selectStatus = (next: ReportStatus): void => {
    setStatus(next);
    setPage(1);
  };

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => selectStatus(tab)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              status === tab
                ? 'bg-primary text-white'
                : 'bg-surface text-ink-muted hover:bg-surface-muted'
            }`}
          >
            {STATUS_LABEL[tab]}
          </button>
        ))}
      </div>

      {query.isPending ? <Spinner label="Зареждане…" /> : null}

      {query.isError ? (
        <p className="rounded-card bg-danger-soft px-4 py-3 text-danger">
          {query.error.message}
        </p>
      ) : null}

      {query.data && query.data.items.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-8 text-center text-ink-muted shadow-card">
          Няма сигнали в този статус.
        </p>
      ) : null}

      <ul className="space-y-3">
        {query.data?.items.map((report) => (
          <li key={report.id}>
            <Link
              to={`/report/${report.id}`}
              className="block rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {report.category.nameBg} · {report.settlement.nameBg}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {report.publicCode} · {formatDateTime(report.createdAt)}
                  </p>
                </div>
                <StatusBadge status={report.status} />
              </div>
              {report.description ? (
                <p className="mt-2 line-clamp-2 text-ink-muted">{report.description}</p>
              ) : null}
              <p className="mt-2 text-sm text-ink-muted">
                {report.mediaCount} файл(а)
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE ? (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Назад
          </Button>
          <span className="text-sm text-ink-muted">
            Страница {page} от {pageCount}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Напред
          </Button>
        </div>
      ) : null}
    </div>
  );
}
