import type {
  DeliveryContext,
  DeliveryEvent,
} from '../src/services/integrations/connectors/types.js';
import type { HttpRequest, HttpResponse } from '../src/services/integrations/http.js';
import type { ExternalTicket } from '../src/services/integrations/payload.js';

/** Общите фикстури на unit тестовете за интеграцията с helpdesk (не е тест сам по себе си). */

export const TICKET: ExternalTicket = {
  version: 1,
  ticket: {
    number: 'TS-2026-000123',
    status: 'IN_PROGRESS',
    queue: 'SUPPORT',
    createdAt: '2026-10-10T10:00:00.000Z',
    closedAt: null,
  },
  case: { number: 'CASE-2026-000777', link: 'https://chatchat.test/#case=c1' },
  board: {
    productModel: 'LTX-500',
    hardwareRevision: 'B',
    firmware: '4.2',
    serial: 'SN-1',
    errorCode: 'E37',
    phase: 'doors',
  },
  diagnosis: {
    generatedBy: 'ai',
    status: 'probable',
    confidence: 'high',
    summary: 'Contatto porta di piano',
    safetyLevel: 'standard',
    checks: [
      { step: 1, action: 'Leggere il codice', expected: 'Leggibile', actionClass: 'DIAGNOSTIC' },
    ],
    missingData: [],
  },
  executedSteps: [
    { step: 1, action: 'Leggere il codice', result: 'KO', actionClass: 'DIAGNOSTIC' },
  ],
  sources: [{ documentCode: 'MAN-LTX', revision: 'C', pages: [17] }],
  attachments: { count: 2, link: 'https://chatchat.test/#case=c1' },
  resolution: null,
};

export const EVENT: DeliveryEvent = {
  id: 'ev1',
  type: 'ticket.claimed',
  at: new Date('2026-10-10T10:05:00Z'),
  from: 'OPEN',
  to: 'IN_PROGRESS',
  queue: 'SUPPORT',
  assigneeRole: 'SUPPORT',
};

export function fakeHttp(reply: (req: HttpRequest) => Partial<HttpResponse> & { status: number }) {
  const calls: HttpRequest[] = [];
  const http = async (req: HttpRequest): Promise<HttpResponse> => {
    calls.push(req);
    const r = reply(req);
    return {
      status: r.status,
      body: r.body ?? '',
      headers: r.headers ?? { retryAfter: null, contentType: 'application/json' },
    };
  };
  return { http, calls };
}

export function ctx<S>(
  settings: S,
  secrets: Record<string, string>,
  http: DeliveryContext<S>['http'],
  over: Partial<DeliveryContext<S>> = {},
): DeliveryContext<S & { language: 'it' }> {
  return {
    http,
    settings: { ...settings, language: 'it' },
    secrets,
    deliveryId: 'dlv_1',
    attempt: 1,
    event: EVENT,
    ticket: TICKET,
    link: null,
    ...over,
  } as DeliveryContext<S & { language: 'it' }>;
}
