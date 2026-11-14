/**
 * Разчитане на webhook-а за коментари. Документацията на Meta показва две форми
 * (webhooks/examples, 2026-11-06): `entry[].changes[]` и `field`/`value` направо в `entry`;
 * id-то на коментара е `value.id` или `value.comment_id`. Приемаме и двете.
 *
 * Минимизация (ОРЗД чл. 5(1)(в)): името и IGSID-ът на коментиращия НЕ излизат оттук —
 * текстът живее само в паметта, колкото да се сравни с ключовите думи.
 */
export interface CommentEvent {
  /** Нашият професионален акаунт (`entry.id`). */
  accountIgId: string;
  commentId: string;
  text: string;
  mediaId: string | null;
  /** Кога Meta е изпратила известието (`entry.time`) — горна граница за 7-те дни. */
  eventAt: Date;
}

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const idOf = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{1,40}$/.test(value) ? value : null;

function eventFrom(accountIgId: string, eventAt: Date, field: unknown, value: unknown) {
  if (field !== 'comments' || !isObject(value)) return null;
  const commentId = idOf(value.id) ?? idOf(value.comment_id);
  if (!commentId) return null;
  const text = typeof value.text === 'string' ? value.text : '';
  if (!text.trim()) return null;
  // Собственият коментар на акаунта (вкл. нашите отговори) — иначе цикъл.
  const from = isObject(value.from) ? idOf(value.from.id) : null;
  if (from === accountIgId) return null;
  const mediaId = isObject(value.media) ? idOf(value.media.id) : null;
  const event: CommentEvent = { accountIgId, commentId, text, mediaId, eventAt };
  return event;
}

export function parseCommentEvents(payload: unknown): CommentEvent[] {
  if (!isObject(payload) || payload.object !== 'instagram' || !Array.isArray(payload.entry)) {
    return [];
  }
  const events: CommentEvent[] = [];
  for (const entry of payload.entry) {
    if (!isObject(entry)) continue;
    const accountIgId = idOf(entry.id);
    if (!accountIgId || typeof entry.time !== 'number' || !Number.isFinite(entry.time)) continue;
    // `time` идва в секунди; милисекунди би било година ~50 000 — пазим се и от двете.
    const ms = entry.time > 1e12 ? entry.time : entry.time * 1000;
    // Невалидна или бъдеща дата би отровила цялата партида (грешка от базата → 500 → Meta
    // повтаря 36 ч. и останалите събития никога не минават) — такова събитие се пропуска.
    if (!Number.isFinite(ms) || ms > Date.now() + 24 * 3600 * 1000) continue;
    const eventAt = new Date(ms);

    const candidates: Array<{ field: unknown; value: unknown }> = [];
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (isObject(change)) candidates.push({ field: change.field, value: change.value });
      }
    }
    if ('field' in entry) candidates.push({ field: entry.field, value: entry.value });

    for (const { field, value } of candidates) {
      const event = eventFrom(accountIgId, eventAt, field, value);
      if (event) events.push(event);
    }
  }
  return events;
}
