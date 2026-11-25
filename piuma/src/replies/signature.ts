import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписът на Meta върху webhook-а: `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 с App
 * Secret върху СУРОВИТЕ байтове на тялото (webhooks/setup, сверено 2026-11-06). Подписва се
 * точно полученото — `ц` и „ц“ са различни байтове, затова тялото не минава през JSON
 * парсер преди проверката.
 */
export const SIGNATURE_HEADER = 'x-hub-signature-256';

export function signWebhook(appSecret: string, raw: Buffer): string {
  return `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`;
}

export function verifyWebhookSignature(
  appSecret: string,
  raw: Buffer,
  header: string | undefined,
): boolean {
  if (typeof header !== 'string') return false;
  const match = /^sha256=([0-9a-f]{64})$/.exec(header);
  if (!match) return false;
  const expected = createHmac('sha256', appSecret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(match[1]!, 'hex'));
}

/** Предизвикателството се отразява само в този вид — нищо, което браузър би изпълнил. */
const CHALLENGE = /^[A-Za-z0-9_-]{1,128}$/;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // Сравнението се прави и при различна дължина, за да не издава времето колко е близо.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Проверката при абониране: `hub.mode=subscribe` + нашият verify token → връщаме
 * `hub.challenge`. Всичко друго → null (маршрутът отговаря 403).
 */
export function challengeResponse(
  query: Record<string, unknown>,
  verifyToken: string,
): string | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode !== 'subscribe') return null;
  if (typeof token !== 'string' || !constantTimeEquals(token, verifyToken)) return null;
  if (typeof challenge !== 'string' || !CHALLENGE.test(challenge)) return null;
  return challenge;
}
