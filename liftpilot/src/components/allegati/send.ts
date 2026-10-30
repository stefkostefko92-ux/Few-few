// The multipart upload of a file to POST /api/projects/[id]/allegati (round 49; the survey sketches' panel since round
// 50): an XMLHttpRequest, since fetch reports no progress of the bytes sent, then the server's JSON answer. The server
// decides everything; this only reports.

/** The upload route's answer: the file kept (or the same bytes found again), or the errors.* key of the refusal. */
export type UploadAnswer<A> = { ok: true; duplicate: boolean; attachment: A } | { ok: false; error: string };

/** Where an upload is: nothing under way, its bytes being sent, the server checking the file. */
export type UploadPhase = { at: 'idle' } | { at: 'sending'; pct: number } | { at: 'checking' };

/** The answer's key when nginx or the network answered instead of the application, by HTTP status. */
export const BY_STATUS: Readonly<Record<number, string>> = { 401: 'unauthorized', 403: 'forbidden', 404: 'notFound', 413: 'fileTooLarge', 429: 'rateLimited', 503: 'rendererBusy' };

/** Sends the form; `onProgress` with the share sent (0..100), `onSent` once the last byte left. Never rejects. */
export function send<T extends UploadAnswer<unknown>>(url: string, body: FormData, onProgress: (pct: number) => void, onSent: () => void): Promise<{ status: number; answer: T | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
    xhr.upload.onload = onSent;
    xhr.onload = () => {
      let answer: T | null = null;
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        if (parsed && typeof parsed === 'object' && 'ok' in parsed) answer = parsed as T;
      } catch {
        answer = null;
      }
      resolve({ status: xhr.status, answer });
    };
    xhr.onerror = () => resolve({ status: 0, answer: null });
    xhr.send(body);
  });
}
