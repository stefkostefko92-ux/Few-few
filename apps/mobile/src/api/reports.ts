import { config } from '@/config';
import type { QueuedReport, SubmitResult } from '@/types';

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
    throw new Error(`Сигналът не беше приет (HTTP ${response.status}).`);
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
