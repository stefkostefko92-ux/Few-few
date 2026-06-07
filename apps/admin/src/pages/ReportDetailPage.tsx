import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { apiUrl } from '@/api/client';
import {
  approveReport,
  claimReport,
  getReport,
  rejectReport,
  resendReport,
} from '@/api/reports';
import type { ReportDetail, ReportMedia } from '@/api/types';
import { useMe, canModerate } from '@/auth/useAuth';
import { Button } from '@/components/Button';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import { formatBytes, formatDateTime } from '@/lib/format';
import { eventLabel } from '@/lib/labels';

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const query = useQuery({
    queryKey: ['report', id],
    queryFn: () => getReport(id as string),
    enabled: Boolean(id),
  });

  const onSettled = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['report', id] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    setNote('');
  };

  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: onSettled,
  });

  if (query.isPending) {
    return <Spinner label="Зареждане на сигнала…" />;
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <BackLink />
        <p className="rounded-card bg-danger-soft px-4 py-3 text-danger">
          {query.error?.message ?? 'Сигналът не е намерен.'}
        </p>
      </div>
    );
  }

  const report = query.data;
  const moderator = me.data ? canModerate(me.data) : false;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="rounded-card bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink">
              {report.category.nameBg} · {report.settlement.nameBg}
            </h1>
            <p className="mt-1 text-ink-muted">
              {report.publicCode} · подаден {formatDateTime(report.createdAt)}
            </p>
          </div>
          <StatusBadge status={report.status} />
        </div>

        {report.description ? (
          <p className="mt-4 whitespace-pre-wrap text-ink">{report.description}</p>
        ) : (
          <p className="mt-4 italic text-ink-muted">Без описание.</p>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="Локация">
            {report.lat != null && report.lng != null ? (
              <a
                className="text-primary underline"
                href={`https://www.google.com/maps?q=${report.lat},${report.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
              </a>
            ) : (
              <span className="text-ink-muted">няма</span>
            )}
          </Field>
          <Field label="Подател">
            {report.reporterName || report.reporterPhone ? (
              <span>
                {report.reporterName ?? '—'}
                {report.reporterPhone ? ` · ${report.reporterPhone}` : ''}
              </span>
            ) : (
              <span className="text-ink-muted">анонимен</span>
            )}
          </Field>
        </dl>
      </div>

      <MediaGallery media={report.media} />

      {moderator ? (
        <ActionPanel
          report={report}
          note={note}
          setNote={setNote}
          pending={action.isPending}
          error={action.error instanceof Error ? action.error.message : null}
          run={(fn) => action.mutate(fn)}
        />
      ) : (
        <p className="rounded-card bg-surface-muted px-4 py-3 text-ink-muted">
          Имаш права само за преглед.
        </p>
      )}

      <EventTimeline report={report} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="inline-block text-primary hover:underline">
      ← Към опашката
    </Link>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function MediaGallery({ media }: { media: ReportMedia[] }) {
  if (media.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {media.map((item) => (
        <figure key={item.id} className="overflow-hidden rounded-card bg-surface shadow-card">
          {item.kind === 'VIDEO' ? (
            <video controls className="aspect-video w-full bg-black" src={apiUrl(item.url)} />
          ) : (
            <img
              className="aspect-video w-full object-cover"
              src={apiUrl(item.url)}
              alt="Снимка от сигнала"
            />
          )}
          <figcaption className="px-3 py-2 text-sm text-ink-muted">
            {item.kind === 'VIDEO' ? 'Клип' : 'Снимка'} · {formatBytes(item.bytes)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

type ActionProps = {
  report: ReportDetail;
  note: string;
  setNote: (value: string) => void;
  pending: boolean;
  error: string | null;
  run: (fn: () => Promise<unknown>) => void;
};

function ActionPanel({ report, note, setNote, pending, error, run }: ActionProps) {
  const id = report.id;
  const isOpen = report.status === 'PENDING' || report.status === 'UNDER_REVIEW';
  const canResend = report.status === 'APPROVED';

  if (!isOpen && !canResend) {
    return null;
  }

  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="mb-3 text-lg font-bold text-ink">Действия</h2>

      {isOpen ? (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink">
            Бележка (по желание при одобрение, задължителна при отказ)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-card border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </label>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {report.status === 'PENDING' ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => claimReport(id))}
          >
            Поеми за преглед
          </Button>
        ) : null}

        {isOpen ? (
          <>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => run(() => approveReport(id, note.trim() || undefined))}
            >
              Одобри и изпрати
            </Button>
            <Button
              variant="danger"
              disabled={pending || note.trim().length === 0}
              onClick={() => run(() => rejectReport(id, note.trim()))}
            >
              Откажи
            </Button>
          </>
        ) : null}

        {canResend ? (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => resendReport(id))}>
            Изпрати отново към общината
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EventTimeline({ report }: { report: ReportDetail }) {
  return (
    <div className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="mb-3 text-lg font-bold text-ink">История</h2>
      <ol className="space-y-3">
        {report.events.map((event, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary" />
            <div>
              <p className="font-semibold text-ink">{eventLabel(event.type)}</p>
              <p className="text-sm text-ink-muted">
                {formatDateTime(event.createdAt)}
                {event.actor ? ` · ${event.actor}` : ''}
              </p>
              {event.note ? <p className="mt-0.5 text-ink">{event.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
