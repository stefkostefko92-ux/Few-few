import type { ReportStatus } from '@/api/types';

export const STATUS_LABEL: Record<ReportStatus, string> = {
  PENDING: 'Чака преглед',
  UNDER_REVIEW: 'В преглед',
  APPROVED: 'Одобрен',
  SENT: 'Изпратен',
  REJECTED: 'Отказан',
  RESOLVED: 'Решен',
};

/** Tailwind класове за цветен бадж според статуса. */
export const STATUS_BADGE: Record<ReportStatus, string> = {
  PENDING: 'bg-accent-soft text-accent',
  UNDER_REVIEW: 'bg-primary-soft text-primary-dark',
  APPROVED: 'bg-primary-soft text-primary-dark',
  SENT: 'bg-primary text-white',
  REJECTED: 'bg-danger-soft text-danger',
  RESOLVED: 'bg-surface-muted text-ink-muted',
};

/** Подреждане на филтрите в опашката. */
export const STATUS_TABS: ReportStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'SENT',
  'RESOLVED',
  'REJECTED',
];

const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Подаден',
  UNDER_REVIEW: 'Поет за преглед',
  APPROVED: 'Одобрен',
  REJECTED: 'Отказан',
  SENT: 'Изпратен към общината',
  RESOLVED: 'Отбелязан като разрешен',
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type;
}
