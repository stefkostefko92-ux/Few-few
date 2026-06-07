import type { ReportStatus } from '@/api/types';
import { STATUS_BADGE, STATUS_LABEL } from '@/lib/labels';

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
