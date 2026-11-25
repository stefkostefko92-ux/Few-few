/**
 * Решението „ново ли е“ за спор (src/billing/disputes.ts) — без база и без мрежа, за да се тества само.
 * Записът в одита е последното известно състояние; ново писмо до мастъра има само при нещо ново за него.
 */
export type DisputeState = 'needs_response' | 'under_review' | 'won' | 'lost' | 'unread';

export interface DisputeSnapshot {
  state: DisputeState;
  substate: string | null;
  responseDueAt: string | null;
  /** `updated_at` от Revolut (ISO) — по него по-старо състояние не се пише върху по-ново. */
  updatedAt: string | null;
  amountCents: number | null;
  currency: string | null;
  reasonCode: string | null;
  orderId: string | null;
}

type Recorded = Record<string, unknown> | null;

const time = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/**
 * - `last` — последният запис за спора (и „не се прочете“); `lastRead` — последният прочетен от Revolut;
 *   `event` — видът на известието, което се обработва сега.
 * - Непрочетен → пропуска се само ако ПОСЛЕДНИЯТ запис е от същото известие: повторна доставка на вече
 *   прочетено известие не казва „не се прочете“, а второто „не се прочете“ не праща второ писмо. По-стар
 *   запис от същото известие не пречи — спорът минава през кръгове (отговор → преглед → отговор при
 *   пред-арбитраж), и новият кръг трябва да стигне до мастъра.
 * - Прочетен с `updated_at` преди записаното → никога (закъсняла доставка не връща старо състояние).
 * - Иначе ново, ако се различава от последния запис по състояние, подсъстояние или срок; след „не се
 *   прочете“ прочетеното винаги е ново — мастърът получава подробностите.
 */
export function isNew(input: {
  last: Recorded;
  lastRead: Recorded;
  event: string;
  snap: DisputeSnapshot;
}): boolean {
  const { last, lastRead, event, snap } = input;
  if (snap.state === 'unread') return event !== last?.['event'];
  const seenAt = time(lastRead?.['updatedAt']);
  const nowAt = time(snap.updatedAt);
  if (seenAt !== null && nowAt !== null && nowAt < seenAt) return false;
  if (!last) return true;
  return (
    last['state'] !== snap.state ||
    last['substate'] !== snap.substate ||
    last['responseDueAt'] !== snap.responseDueAt
  );
}
