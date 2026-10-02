import type { Plan, Role } from '@prisma/client';
import { isStaff } from '../auth/rbac.js';

export const TRIAL_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type PlanState = 'staff' | 'pending' | 'active' | 'expired';

export interface PlanSubject {
  role: Role;
  plan: Plan;
  planExpiresAt: Date | null;
  emailVerifiedAt: Date | null;
}

export interface PlanView {
  plan: Plan;
  state: PlanState;
  expiresAt: Date | null;
  /** Цели дни до края (закръглени нагоре); null за lifetime и персонал. */
  daysLeft: number | null;
  /** Може ли да създава и променя проекти. Изтеглянето на вече направеното е винаги позволено. */
  canCreate: boolean;
  /** Защо не може: имейлът не е потвърден или планът е изтекъл. */
  blockedBy: 'unverified' | 'expired' | null;
}

/**
 * Състоянието на плана към момента `now`. Изтеклият акаунт пази проектите си и ги изтегля,
 * но не създава нови и не променя старите.
 */
export function planView(subject: PlanSubject, now: Date = new Date()): PlanView {
  const base = { plan: subject.plan, expiresAt: subject.planExpiresAt };
  if (isStaff(subject.role)) {
    return { ...base, state: 'staff', daysLeft: null, canCreate: true, blockedBy: null };
  }
  if (!subject.emailVerifiedAt) {
    return { ...base, state: 'pending', daysLeft: null, canCreate: false, blockedBy: 'unverified' };
  }
  if (subject.plan === 'LIFETIME') {
    return { ...base, state: 'active', daysLeft: null, canCreate: true, blockedBy: null };
  }
  if (!subject.planExpiresAt) {
    return { ...base, state: 'pending', daysLeft: null, canCreate: false, blockedBy: 'expired' };
  }
  const left = subject.planExpiresAt.getTime() - now.getTime();
  if (left > 0) {
    return {
      ...base,
      state: 'active',
      daysLeft: Math.ceil(left / DAY),
      canCreate: true,
      blockedBy: null,
    };
  }
  return { ...base, state: 'expired', daysLeft: 0, canCreate: false, blockedBy: 'expired' };
}

export function trialEndsAt(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * DAY);
}

/**
 * Добавя календарни месеци в UTC; 31 януари + 1 месец = 28/29 февруари (денят се свива до края на
 * месеца, не прелива в март).
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Нов край на Premium: месеците се добавят към по-късното от „сега“ и текущия край — платеното
 * предсрочно не се губи.
 */
export function premiumUntil(
  currentExpiry: Date | null,
  months: number,
  now: Date = new Date(),
): Date {
  const start = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return addMonths(start, months);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}
