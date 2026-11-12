// МОДЕЛ, НЕ PRODUCTION. Чисти „reducer“-и, които прилагат решенията от
// billing-sync.ts върху snapshot в паметта — само за тестовете на
// идемпотентност и ред (повторено/разместено събитие → едно крайно състояние).
// В production прилагането е с условни записи (CAS) в webhook route-а.
import type {
  FounderDecision,
  PlanSubscriptionDisputeDecision,
  PlanSyncDecision,
  PlanUserSnapshot,
  ReferralDecision,
  ReferralSnapshot,
} from '../billing-sync';

export function applyPlanSync(user: PlanUserSnapshot, d: PlanSyncDecision): PlanUserSnapshot {
  if (d.action === 'noop') return user;
  return {
    ...user,
    plan: d.plan,
    planSubscriptionId: d.adoptSubscriptionId ?? user.planSubscriptionId,
  };
}

export function applyFounderDecision(user: PlanUserSnapshot, d: FounderDecision): PlanUserSnapshot {
  if (d.action === 'revoke') return { ...user, plan: 'FREE', planRevokedReason: d.reason };
  if (d.action === 'restore') return { ...user, plan: 'FOUNDER', planRevokedReason: null };
  return user;
}

export function applyPlanSubscriptionDispute(
  user: PlanUserSnapshot,
  d: PlanSubscriptionDisputeDecision,
  paymentIntentId?: string | null,
): PlanUserSnapshot {
  if (d.action === 'revoke') {
    return {
      ...user,
      plan: 'FREE',
      planRevokedReason: 'dispute',
      planDisputedPaymentIntentId: paymentIntentId ?? null,
    };
  }
  // Restore чисти причината и оспорения PI; планът идва от decideSubscriptionSync.
  if (d.action === 'restore') {
    return { ...user, planRevokedReason: null, planDisputedPaymentIntentId: null };
  }
  return user;
}

export function applyReferralDecision(
  state: { referral: ReferralSnapshot; balanceCents: number },
  d: ReferralDecision,
  now: Date,
): { referral: ReferralSnapshot; balanceCents: number } {
  if (d.action === 'reverse') {
    return {
      referral: { ...state.referral, reversedAt: now, reversalReason: d.reason },
      balanceCents: state.balanceCents - d.decrementCents,
    };
  }
  if (d.action === 'restore') {
    return {
      referral: { ...state.referral, reversedAt: null, reversalReason: null },
      balanceCents: state.balanceCents + d.incrementCents,
    };
  }
  return state;
}
