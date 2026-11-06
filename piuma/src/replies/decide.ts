import { InstagramApiError } from '../instagram/client.js';
import { normalizeKeyword } from './match.js';

/** Private Replies: до 7 дни от коментара (документацията на Meta, 2026-11-06). */
export const REPLY_WINDOW_MS = 7 * 24 * 3600 * 1000;
/** Messaging API: текстът е UTF-8 и до 1000 байта. */
export const MESSAGE_MAX_BYTES = 1000;
export const COMMENTS_SCOPE = 'instagram_business_manage_comments';

export type ReplyStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';

export function hasCommentsScope(scopes: string): boolean {
  return scopes
    .split(',')
    .map((scope) => scope.trim())
    .includes(COMMENTS_SCOPE);
}

export interface SendInput {
  status: ReplyStatus;
  /** null = правилото е изтрито след приемането. */
  ruleStatus: RuleStatus | null;
  accountStatus: 'ACTIVE' | 'TOKEN_EXPIRED' | 'DISABLED';
  accountScopes: string;
  /** IG_ID е пазен (свързан след 2026-11-06) — без него адресът на /messages е грешен. */
  hasProfessionalId: boolean;
  /** REPLY_PRIVACY_URL е зададен — без него бележката (PR16a) би носила измислен адрес. */
  privacyConfigured: boolean;
  eventAt: Date;
  now: Date;
}

export type SendDecision =
  | { action: 'send' }
  | { action: 'skip'; reason: string }
  | { action: 'fail'; reason: string }
  | { action: 'noop' };

/** PR12/PR13 — решение без странични ефекти; работникът само го изпълнява. */
export function decideSend(input: SendInput): SendDecision {
  if (input.status === 'SENDING') return { action: 'fail', reason: 'неясен изход' };
  if (input.status !== 'QUEUED') return { action: 'noop' };
  if (input.ruleStatus !== 'ACTIVE') return { action: 'skip', reason: 'правилото не е активно' };
  if (input.accountStatus !== 'ACTIVE') return { action: 'skip', reason: 'акаунтът не е активен' };
  if (!hasCommentsScope(input.accountScopes)) {
    return { action: 'skip', reason: `токенът няма ${COMMENTS_SCOPE}` };
  }
  if (!input.hasProfessionalId) return { action: 'skip', reason: 'нужно е ново свързване (IG_ID)' };
  if (!input.privacyConfigured) return { action: 'skip', reason: 'политиката липсва' };
  if (input.now.getTime() - input.eventAt.getTime() >= REPLY_WINDOW_MS) {
    return { action: 'skip', reason: 'изтекъл срок (7 дни)' };
  }
  return { action: 'send' };
}

/**
 * PR15. Отговор от Meta с повторима грешка → не е изпратено, безопасно е да повторим.
 * Без отговор (мрежа, таймаут → 599) или непозната грешка → не знаем дали е стигнало, а
 * второ съобщение е забранено — затова не повтаряме.
 */
export function classifySendError(error: unknown): 'retry' | 'ambiguous' | 'fail' {
  if (!(error instanceof InstagramApiError)) return 'ambiguous';
  // 599 = без отговор; 2xx с непозната форма = Meta може да е приела съобщението.
  if (error.httpStatus === 599 || error.httpStatus < 300) return 'ambiguous';
  return error.retryable ? 'retry' : 'fail';
}

export function messageBytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

export interface RuleInput {
  keyword: string;
  message: string;
  mediaId: string;
}

export type RuleValidation =
  { ok: true; keyword: string; message: string; mediaId: string } | { ok: false; error: string };

/**
 * PR8 + PR16. Грешката е ключ от речника — маршрутът я превежда. Тук таванът е само за текста;
 * с бележката отдолу (PR16a) го мери `composeMessage`.
 */
export function validateRuleInput(input: RuleInput): RuleValidation {
  const keyword = normalizeKeyword(input.keyword);
  if (!keyword) return { ok: false, error: 'replies.errKeyword' };
  const message = input.message.trim();
  if (!message || messageBytes(message) > MESSAGE_MAX_BYTES) {
    return { ok: false, error: 'replies.errMessage' };
  }
  const media = input.mediaId.trim();
  if (!/^\d{5,40}$/.test(media)) return { ok: false, error: 'replies.errMedia' };
  return { ok: true, keyword, message, mediaId: media };
}
