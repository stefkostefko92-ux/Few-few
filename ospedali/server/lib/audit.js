// @ts-check
// Дневник на админ действията (append-only, JSON Lines) — GDPR-safe.
//
// Записва САМО действие + timestamp + резултат (+ безопасни неброими детайли).
// НИКОГА суров IP, User-Agent или парола — само агрегатни/неидентифициращи полета.
// Записът е best-effort: при грешка на диска НЕ блокира заявката (само лог).

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @typedef {Object} AuditEvent
 * @property {string} azione   Вид действие, напр. „login" | „logout" | „visibility".
 * @property {'ok'|'fail'} esito  Резултат от действието.
 * @property {Record<string, string|number|boolean>} [dettagli]
 *   По избор: неидентифициращи детайли (напр. брой скрити страници). БЕЗ лични данни.
 */

// Разрешени примитиви в „dettagli" — гарантира, че не се промъква обект/масив с PII.
const PRIMITIVI = new Set(['string', 'number', 'boolean']);

/**
 * Изгражда един ред от дневника (чиста функция, тестваема без ФС).
 * Пресява „dettagli" до примитиви и отрязва потенциално чувствителни ключове.
 * @param {AuditEvent} event
 * @param {number} [now]  Timestamp в ms (за детерминиран тест).
 * @returns {string}  JSON ред (без завършващ нов ред).
 */
export function formatEntry(event, now = Date.now()) {
  /** @type {Record<string, string|number|boolean>} */
  const dettagli = {};
  const src = event && event.dettagli;
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      // изрично отрязваме всичко, което мирише на лични данни
      if (/ip|user.?agent|password|token|cookie|email/i.test(k)) continue;
      if (PRIMITIVI.has(typeof v)) dettagli[k] = v;
    }
  }
  /** @type {{ ts: string, azione: string, esito: string, dettagli?: Record<string, string|number|boolean> }} */
  const riga = {
    ts: new Date(now).toISOString(),
    azione: String(event && event.azione ? event.azione : 'sconosciuta'),
    esito: event && event.esito === 'ok' ? 'ok' : 'fail',
  };
  if (Object.keys(dettagli).length) riga.dettagli = dettagli;
  return JSON.stringify(riga);
}

/**
 * Добавя събитие към дневника (append-only). Best-effort: НЕ хвърля при грешка,
 * само логва — записът на одита не бива да сваля админ заявка.
 * @param {string} file  Път до `.state/audit.log`.
 * @param {AuditEvent} event
 * @param {number} [now]
 * @returns {Promise<boolean>}  true при успешен запис, false при (погълната) грешка.
 */
export async function appendAudit(file, event, now = Date.now()) {
  try {
    await mkdir(dirname(file), { recursive: true }).catch(() => {});
    await appendFile(file, formatEntry(event, now) + '\n');
    return true;
  } catch (err) {
    console.error('audit: неуспешен запис:', err instanceof Error ? err.message : err);
    return false;
  }
}
