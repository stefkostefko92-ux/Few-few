import { z } from 'zod';

/**
 * Споделен договор на „Помагам Бобов дол" — единен източник на истината за
 * enum-ите, схемата за подаване и формата на отговорите между `api` (продуцент)
 * и `admin` (консуматор). Датите тук са в сериализиран вид (ISO string), както
 * пътуват по мрежата.
 */

export const REPORT_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'SENT',
  'REJECTED',
  'RESOLVED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Български етикети на статусите за граждани и модератори (единен източник). */
export const REPORT_STATUS_LABELS_BG: Record<ReportStatus, string> = {
  PENDING: 'Получен, чака преглед',
  UNDER_REVIEW: 'В преглед',
  APPROVED: 'Одобрен',
  SENT: 'Изпратен към общината',
  REJECTED: 'Отхвърлен',
  RESOLVED: 'Разрешен',
};

export const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ADMIN_ROLES = ['VIEWER', 'MODERATOR', 'ADMIN'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Валидация на текстовите полета при подаване на сигнал (multipart). Описанието
 * на гражданина е ненадежден вход — само се съхранява, не се интерпретира.
 * `website` е honeypot: истински граждани не го попълват.
 */
export const reportSubmitSchema = z.object({
  categorySlug: z.string().min(1).max(64),
  settlementSlug: z.string().min(1).max(64),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  description: z.string().trim().max(1000).optional(),
  reporterName: z.string().trim().max(120).optional(),
  reporterPhone: z.string().trim().max(30).optional(),
  clientReportId: z.string().trim().max(64).optional(),
  website: z.string().max(0).optional(),
});
export type ReportSubmitInput = z.infer<typeof reportSubmitSchema>;

/** Категория или населено място — четим slug + българско име. */
export interface Ref {
  slug: string;
  nameBg: string;
}

export interface Admin {
  id: string;
  email: string;
  role: AdminRole;
}

export interface ReportListItem {
  id: string;
  publicCode: string;
  status: ReportStatus;
  category: Ref;
  settlement: Ref;
  description: string | null;
  mediaCount: number;
  createdAt: string;
}

/**
 * Публична справка за гражданина по неговия код. Умишлено без лични данни,
 * описание или координати — разкрива само напредъка по сигнала.
 */
export interface PublicReportStatus {
  publicCode: string;
  status: ReportStatus;
  statusLabel: string;
  category: Ref;
  settlement: Ref;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReportList {
  page: number;
  pageSize: number;
  total: number;
  items: ReportListItem[];
}

export interface ReportMedia {
  id: string;
  kind: MediaKind;
  bytes: number;
  url: string;
  createdAt: string;
}

export interface ReportEvent {
  type: string;
  note: string | null;
  actor: string | null;
  createdAt: string;
}

export interface ReportDetail {
  id: string;
  publicCode: string;
  status: ReportStatus;
  category: Ref;
  settlement: Ref;
  description: string | null;
  lat: number | null;
  lng: number | null;
  reporterName: string | null;
  reporterPhone: string | null;
  createdAt: string;
  updatedAt: string;
  media: ReportMedia[];
  events: ReportEvent[];
}
