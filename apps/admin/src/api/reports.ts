import { apiGet, apiSend } from '@/api/client';
import type { ReportDetail, ReportList, ReportStatus } from '@/api/types';

export type ListParams = {
  status?: ReportStatus;
  categorySlug?: string;
  settlementSlug?: string;
  page?: number;
  pageSize?: number;
};

export function listReports(params: ListParams): Promise<ReportList> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.categorySlug) query.set('categorySlug', params.categorySlug);
  if (params.settlementSlug) query.set('settlementSlug', params.settlementSlug);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return apiGet<ReportList>(`/admin/reports${qs ? `?${qs}` : ''}`);
}

export function getReport(id: string): Promise<ReportDetail> {
  return apiGet<ReportDetail>(`/admin/reports/${id}`);
}

type StatusResult = { status: ReportStatus; queued?: boolean };

export function claimReport(id: string): Promise<StatusResult> {
  return apiSend<StatusResult>('POST', `/admin/reports/${id}/claim`);
}

export function approveReport(id: string, note?: string): Promise<StatusResult> {
  return apiSend<StatusResult>('POST', `/admin/reports/${id}/approve`, note ? { note } : {});
}

export function rejectReport(id: string, note: string): Promise<StatusResult> {
  return apiSend<StatusResult>('POST', `/admin/reports/${id}/reject`, { note });
}

export function resendReport(id: string): Promise<StatusResult> {
  return apiSend<StatusResult>('POST', `/admin/reports/${id}/resend`);
}
