import { scrub } from '../admin/integration-checks.js';
import type { PeppolSettings } from '../admin/integrations.js';
import { AccessPointError, type AccessPoint, type EnrollInput } from './access-point.js';

/**
 * eConnect PSB (Procurement Service Bus) — сертифицирана точка за достъп и SMP в списъка на OpenPeppol.
 * По документацията им (econnect.eu/en/docs/developers, прочетена 13.11.2026): OAuth2 client credentials
 * към identity (`/connect/token`, scope `ap`, токен за 1 час), Bearer към PSB; изпращане
 * `POST /api/v1/{partyId}/salesInvoice/send` с UBL тялото и `X-EConnect-DocumentId` (повторение → 409);
 * проверка на получател `POST /api/v1/{partyId}/salesInvoice/queryRecipientParty`; регистрация
 * `PUT /api/v1-beta/{partyId}/enroll` (роля ApManager); изтегляне
 * `GET /api/v1/{partyId}/purchaseInvoice/{documentId}/download`. Формата на регистрацията е потвърдена
 * само по описанието — първата проба в acceptance я сверява (грешката на доставчика се показва в панела).
 */
export const ECONNECT_HOSTS = {
  acceptance: {
    api: 'https://accp-psb.econnect.eu',
    identity: 'https://accp-identity.econnect.eu',
  },
  production: { api: 'https://psb.econnect.eu', identity: 'https://identity.econnect.eu' },
} as const;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 20_000;
/** Документите, които точката за достъп приема и предлага: фактура и кредитно известие (BIS Billing 3). */
export const HOOK_TOPICS = [
  'InvoiceReceived',
  'InvoiceReceivedError',
  'InvoiceSent',
  'InvoiceSentRetry',
  'InvoiceSentError',
] as const;

/** Регистрацията на получател — единственото място с формата на заявката (за сверка в acceptance). */
export function enrollBody(input: EnrollInput) {
  return {
    services: [
      {
        name: 'peppolService',
        isActive: true,
        config: {
          businessCard: {
            names: { values: [{ value: input.name }], state: 'on' },
            address: { value: input.address, state: 'on' },
            countryCode: { value: input.countryCode, state: 'on' },
            state: 'on',
          },
          capabilities: {
            invoices: { state: 'on' },
            orders: { state: 'off' },
            reviews: { state: 'on' },
          },
        },
      },
    ],
    hooks: [{ name: 'fakturist', action: input.hookUrl, topics: [...HOOK_TOPICS], isActive: true }],
  };
}

export class EConnectAccessPoint implements AccessPoint {
  private token: { value: string; until: number } | null = null;

  constructor(
    private readonly settings: PeppolSettings,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private get hosts() {
    return ECONNECT_HOSTS[this.settings.environment];
  }

  private fail(error: unknown): never {
    if (error instanceof AccessPointError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AccessPointError('network', scrub(message, [this.settings.clientSecret]));
  }

  /** Токенът — пазен до минута преди изтичането. */
  private async bearer(): Promise<string> {
    if (this.token && this.token.until > this.now()) return this.token.value;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.hosts.identity}/connect/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.settings.clientId,
          client_secret: this.settings.clientSecret,
          scope: 'ap',
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.fail(error);
    }
    if (response.status === 400 || response.status === 401) {
      await response.body?.cancel();
      throw new AccessPointError(
        'unauthorized',
        'eConnect отказа данните на клиента',
        response.status,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AccessPointError(
        'rejected',
        `eConnect identity HTTP ${response.status}`,
        response.status,
      );
    }
    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (!body || typeof body.access_token !== 'string' || !body.access_token) {
      throw new AccessPointError('invalidResponse', 'eConnect identity: няма access_token');
    }
    const seconds =
      typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 3600;
    this.token = { value: body.access_token, until: this.now() + (seconds - 60) * 1000 };
    return body.access_token;
  }

  /** Заявка към PSB; връща отговора (тялото — за извикващия). 401 → нов токен веднъж. */
  private async call(
    method: string,
    path: string,
    init: { body?: string; headers?: Record<string, string> } = {},
    retried = false,
  ): Promise<Response> {
    const token = await this.bearer();
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.hosts.api}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.fail(error);
    }
    if (response.status === 401 && !retried) {
      await response.body?.cancel();
      this.token = null;
      return this.call(method, path, init, true);
    }
    return response;
  }

  private async rejectFrom(response: Response, what: string): Promise<never> {
    const text = (await response.text().catch(() => '')).slice(0, 300);
    const code = response.status === 401 || response.status === 403 ? 'unauthorized' : 'rejected';
    throw new AccessPointError(
      code,
      scrub(`${what}: HTTP ${response.status}${text ? ` — ${text}` : ''}`, [
        this.settings.clientSecret,
      ]),
      response.status,
    );
  }

  async check(): Promise<void> {
    const response = await this.call('GET', '/api/v1/me', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) await this.rejectFrom(response, 'eConnect /me');
    await response.body?.cancel();
  }

  async send(input: { senderPartyId: string; documentId: string; ubl: string }) {
    const response = await this.call(
      'POST',
      `/api/v1/${encodeURIComponent(input.senderPartyId)}/salesInvoice/send`,
      {
        body: input.ubl,
        headers: {
          'Content-Type': 'application/xml',
          Accept: 'application/json',
          'X-EConnect-DocumentId': input.documentId,
        },
      },
    );
    if (response.status === 409) {
      await response.body?.cancel();
      return { alreadyAccepted: true };
    }
    if (!response.ok) await this.rejectFrom(response, 'eConnect send');
    await response.body?.cancel();
    return { alreadyAccepted: false };
  }

  async canReceive(input: { senderPartyId: string; receiverPartyId: string }) {
    const response = await this.call(
      'POST',
      `/api/v1/${encodeURIComponent(input.senderPartyId)}/salesInvoice/queryRecipientParty`,
      {
        body: JSON.stringify([input.receiverPartyId]),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      },
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return false;
    }
    if (!response.ok) await this.rejectFrom(response, 'eConnect queryRecipientParty');
    const body: unknown = await response.json().catch(() => null);
    return recipientVerdict(body, input.receiverPartyId);
  }

  async enroll(input: EnrollInput): Promise<void> {
    const response = await this.call(
      'PUT',
      `/api/v1-beta/${encodeURIComponent(input.partyId)}/enroll`,
      {
        body: JSON.stringify(enrollBody(input)),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      },
    );
    if (!response.ok) await this.rejectFrom(response, 'eConnect enroll');
    await response.body?.cancel();
  }

  async unenroll(partyId: string): Promise<void> {
    const response = await this.call(
      'DELETE',
      `/api/v1-beta/${encodeURIComponent(partyId)}/enroll`,
    );
    if (!response.ok && response.status !== 404)
      await this.rejectFrom(response, 'eConnect unenroll');
    await response.body?.cancel();
  }

  async download(input: { partyId: string; documentId: string }): Promise<string> {
    const response = await this.call(
      'GET',
      `/api/v1/${encodeURIComponent(input.partyId)}/purchaseInvoice/${encodeURIComponent(input.documentId)}/download`,
      { headers: { Accept: 'application/xml' } },
    );
    if (!response.ok) await this.rejectFrom(response, 'eConnect download');
    const xml = await response.text();
    if (xml.length > 2 * 1024 * 1024) {
      throw new AccessPointError('invalidResponse', 'Полученият документ е над 2 MB');
    }
    return xml;
  }
}

/**
 * Отговорът на queryRecipientParty не е описан подробно публично: приема се масив или обект със запис
 * за получателя; `true` само при изрично положителен запис, `false` при изрично отрицателен, иначе null.
 */
export function recipientVerdict(body: unknown, partyId: string): boolean | null {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as { parties?: unknown }).parties)
      ? (body as { parties: unknown[] }).parties
      : [];
  const id = partyId.toLowerCase();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const rowId = [record['partyId'], record['id'], record['identifier']].find(
      (v): v is string => typeof v === 'string',
    );
    if (rowId && rowId.toLowerCase() !== id) continue;
    for (const key of ['canReceive', 'isRegistered', 'found', 'reachable']) {
      if (typeof record[key] === 'boolean') return record[key] as boolean;
    }
  }
  return null;
}
