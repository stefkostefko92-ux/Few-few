// Качване на файл към случай: суровото тяло (без multipart) към
// POST /api/v1/cases/:id/attachments?kind=PHOTO|LOG&name=… — през XMLHttpRequest, защото само
// той дава напредък на качването. Типът се определя от сървъра по съдържанието, не по името.

import { ApiError } from '../api.js';
import { state } from '../store.js';

/** Таваните на сървъра (services/filetype.ts) — проверка преди да хабим мобилни данни. */
export const MAX_BYTES = { PHOTO: 10 * 1024 * 1024, LOG: 2 * 1024 * 1024 };

/**
 * @param {string} caseId
 * @param {'PHOTO'|'LOG'} kind
 * @param {File} file
 * @param {{ onProgress?: (ratio: number) => void }} [opts]
 * @returns {{ promise: Promise<object>, abort: () => void }}
 */
export function uploadAttachment(caseId, kind, file, { onProgress } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      kind,
      name: file.name || (kind === 'PHOTO' ? 'photo' : 'log'),
    });
    xhr.open('POST', `/api/v1/cases/${encodeURIComponent(caseId)}/attachments?${query}`);
    xhr.responseType = 'text';
    xhr.timeout = 180000;
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (state.csrf) xhr.setRequestHeader('x-csrf-token', state.csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.ontimeout = () => reject(new ApiError(0, 'network'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted'));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.attachment) resolve(data.attachment);
      else reject(new ApiError(xhr.status, data?.code, data?.error));
    };
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}
