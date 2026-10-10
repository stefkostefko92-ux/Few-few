// Приемането през опашката (§4.1, §7.3): файлът минава антивирус при качването, после влиза в
// пакет и опашката го обработва (текст, OCR на сканираното, DOCX/XLSX, логове) → ЧЕРНОВА.
// Общото за единичното и пакетното качване: качване, добавяне, следене (polling), текстове.

import { has, t } from '../i18n.js';
import { call, callDetailed, uploadRaw } from './core.js';
import { errText } from './ui.js';

/** Разширенията, които диалозите предлагат (сървърът проверява по съдържанието). */
export const ACCEPT_FILES =
  '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.log,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const FINAL = new Set(['DONE', 'FAILED']);
export const isFinal = (item) => FINAL.has(item?.status);

/** Грешка на API → текст: първо кодовете на приемането (`admin.ingest.err.*`), после общите. */
export function ingestErrText(err) {
  const key = `admin.ingest.err.${err?.code}`;
  return err?.code && has(key) ? t(key) : errText(err);
}

export async function createBatch(body) {
  const res = await callDetailed('POST', '/admin/ingest/batches', body);
  return res.batch;
}

/** Качване (антивирус) + добавяне в пакета; хвърля ApiError с подробностите. */
export async function sendFile(batchId, file, extra = {}) {
  const up = await uploadRaw(`/admin/attachments?name=${encodeURIComponent(file.name)}`, file);
  const res = await callDetailed('POST', `/admin/ingest/batches/${batchId}/items`, {
    attachmentId: up.attachment.id,
    ...extra,
  });
  return res.item;
}

export async function retryItem(itemId) {
  const res = await callDetailed('POST', `/admin/ingest/items/${itemId}/retry`, {});
  return res.item;
}

/**
 * Следи пакета, докато всички файлове са готови/неуспешни (или `stop()`); `onUpdate` получава
 * пакета при всяка промяна. Връща функция за спиране.
 */
export function watchBatch(batchId, onUpdate, { everyMs = 1500, until } = {}) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await call('GET', `/admin/ingest/batches/${batchId}`);
      if (stopped) return;
      onUpdate(res.batch);
      const pending = res.batch.items.some((i) => !isFinal(i));
      if ((until ? !until(res.batch) : pending) || res.batch.items.length === 0) {
        timer = setTimeout(tick, everyMs);
      }
    } catch {
      // Временна грешка на мрежата — следващият опит.
      if (!stopped) timer = setTimeout(tick, everyMs * 2);
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Състоянието на файла с думи (етапът и напредъкът на OCR). */
export function statusText(item) {
  if (item.status === 'RUNNING') {
    if (item.stage === 'ocr') return t('admin.ingest.status.ocr', { progress: item.progress ?? 0 });
    if (item.stage === 'index') return t('admin.ingest.status.index');
    return t('admin.ingest.status.extract');
  }
  return t(`admin.ingest.status.${item.status}`);
}

/** Резултат на готов файл: страници, OCR, кодове. */
export function resultText(item) {
  if (item.status === 'FAILED') return failureText(item.errorCode);
  if (item.status !== 'DONE') return '';
  return t('admin.ingest.result', {
    pages: item.pages ?? 0,
    ocr: item.ocrPages ?? 0,
    codes: item.errorCodes ?? 0,
  });
}

/** Кодът на провала (`ingest.err.*`) → текст; непознат → общото „неуспех“. */
export function failureText(code) {
  return code && has(code) ? t(code) : t('admin.ingest.status.FAILED');
}

/** Предупрежденията (`ingest.warn.*` с page/row/count) → редове текст. */
export function warningTexts(warnings) {
  return (warnings ?? []).map((w) =>
    has(w.code)
      ? t(w.code, { page: w.page ?? '', row: w.row ?? '', count: w.count ?? '' })
      : w.code,
  );
}
