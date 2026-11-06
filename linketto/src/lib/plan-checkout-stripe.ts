// Stripe адаптер на PlanCheckoutPorts (без server-only — тества се с mock
// клиент в __tests__/plan-checkout.test.ts). Решенията са в plan-checkout.ts.
import {
  founderSessionPayment,
  isPlanSession,
  type FounderSessionPayment,
  type FounderSessionView,
  type PlanCheckoutPorts,
} from './plan-checkout';

interface SessionView extends FounderSessionView {
  id: string;
}

/** Минималната част от Stripe клиента, която ползваме (реалният я покрива). */
export interface PlanStripeClient {
  customers: {
    create(
      params: { email: string; metadata: Record<string, string> },
      options: { idempotencyKey: string },
    ): PromiseLike<{ id: string }>;
  };
  subscriptions: {
    list(params: { customer: string; status: 'all'; limit: number }): AsyncIterable<{
      status: string;
    }>;
  };
  checkout: {
    sessions: {
      list(params: {
        customer: string;
        status: 'open' | 'complete';
        limit: number;
      }): AsyncIterable<SessionView>;
      expire(id: string): PromiseLike<unknown>;
    };
  };
  paymentIntents: {
    retrieve(id: string): PromiseLike<{ status: string }>;
  };
}

export type PlanStripePorts = Pick<
  PlanCheckoutPorts,
  | 'createCustomer'
  | 'listSubscriptionStatuses'
  | 'listFounderSessions'
  | 'paymentIntentStatus'
  | 'listOpenPlanSessionIds'
  | 'expireSession'
>;

export function createPlanStripePorts(stripe: PlanStripeClient): PlanStripePorts {
  return {
    async createCustomer({ userId, email }, idempotencyKey) {
      const customer = await stripe.customers.create(
        { email, metadata: { userId } },
        { idempotencyKey },
      );
      return customer.id;
    },
    async listSubscriptionStatuses(customerId) {
      const statuses: string[] = [];
      for await (const sub of stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      })) {
        statuses.push(sub.status);
      }
      return statuses;
    },
    async listFounderSessions(customerId) {
      const founders: FounderSessionPayment[] = [];
      for await (const session of stripe.checkout.sessions.list({
        customer: customerId,
        status: 'complete',
        limit: 100,
      })) {
        const founder = founderSessionPayment(session);
        if (founder) founders.push(founder);
      }
      return founders;
    },
    async paymentIntentStatus(paymentIntentId) {
      return (await stripe.paymentIntents.retrieve(paymentIntentId)).status;
    },
    async listOpenPlanSessionIds(customerId) {
      const ids: string[] = [];
      for await (const session of stripe.checkout.sessions.list({
        customer: customerId,
        status: 'open',
        limit: 100,
      })) {
        if (isPlanSession(session.metadata)) ids.push(session.id);
      }
      return ids;
    },
    async expireSession(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },
  };
}
