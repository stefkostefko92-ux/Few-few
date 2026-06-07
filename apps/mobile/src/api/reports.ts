import { config } from '@/config';
import type { QueuedReport, ReportStatusResult, SubmitResult } from '@/types';

/**
 * Проверява състоянието на сигнал по публичния му номер. Връща `null`, когато
 * няма сигнал с този номер (HTTP 404), за да го разграничим от реална грешка.
 */
export async function getReportStatus(
  code: string,
): Promise<ReportStatusResult | null> {
  const normalized = code.trim().toUpperCase();
  const response = await fetch(
    `${config.apiBaseUrl}/reports/${encodeURIComponent(normalized)}/status`,
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Грешка при проверката (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  if (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { statusLabel?: unknown }).statusLabel === 'string' &&
    typeof (data as { publicCode?: unknown }).publicCode === 'string'
  ) {
    return data as ReportStatusResult;
  }
  throw new Error('Неочакван отговор от сървъра.');
}

/**
 * Грешка при подаване. `permanent` означава, че ретрай няма да помогне (4xx) —
 * опашката маха такъв сигнал, вместо да го опитва безкрайно.
 */
export class SubmitError extends Error {
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = 'SubmitError';
    this.permanent = permanent;
  }
}

/**
 * Подава сигнал към API-то като multipart: структурирани метаданни плюс
 * медийните файлове. Backend-ът записва статус PENDING и връща publicCode.
 *
 * React Native поддиржа подаване на файлове през FormData с
 * `{ uri, name, type }`.
 */
export async function submitReport(report: QueuedReport): Promise<SubmitResult> {
  const form = new FormData();
  form.append('categorySlug', report.categorySlug);
  form.append('settlementSlug', report.settlementSlug);

  if (report.location) {
    form.append('lat', String(report.location.lat));
    form.append('lng', String(report.location.lng));
  }
  if (report.description.trim()) {
    form.append('description', report.description.trim());
  }
  if (report.reporterName.trim()) {
    form.append('reporterName', report.reporterName.trim());
  }
  if (report.reporterPhone.trim()) {
    form.append('reporterPhone', report.reporterPhone.trim());
  }
  form.append('clientReportId', report.id);

  for (const asset of report.media) {
    form.append('media', {
      uri: asset.uri,
      name: asset.fileName,
      type: asset.mimeType,
    } as unknown as Blob);
  }

  const response = await fetch(`${config.apiBaseUrl}/reports`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    // 4xx (освен 408/429) са постоянни — сигналът няма да мине при ретрай.
    const permanent =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429;
    throw new SubmitError(`Сигналът не беше приет (HTTP ${response.status}).`, permanent);
  }

  const data: unknown = await response.json();
  if (
    typeof data === 'object' &&
    data !== null &&
    'publicCode' in data &&
    typeof (data as { publicCode: unknown }).publicCode === 'string'
  ) {
    return { publicCode: (data as { publicCode: string }).publicCode };
  }
  throw new Error('Неочакван отговор от сървъра.');
}
