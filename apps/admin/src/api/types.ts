export type AdminRole = 'VIEWER' | 'MODERATOR' | 'ADMIN';

export type ReportStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SENT'
  | 'REJECTED'
  | 'RESOLVED';

export type MediaKind = 'IMAGE' | 'VIDEO';

export type Admin = {
  id: string;
  email: string;
  role: AdminRole;
};

export type Ref = {
  slug: string;
  nameBg: string;
};

export type ReportListItem = {
  id: string;
  publicCode: string;
  status: ReportStatus;
  category: Ref;
  settlement: Ref;
  description: string | null;
  mediaCount: number;
  createdAt: string;
};

export type ReportList = {
  page: number;
  pageSize: number;
  total: number;
  items: ReportListItem[];
};

export type ReportMedia = {
  id: string;
  kind: MediaKind;
  bytes: number;
  url: string;
  createdAt: string;
};

export type ReportEvent = {
  type: string;
  note: string | null;
  actor: string | null;
  createdAt: string;
};

export type ReportDetail = {
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
};
