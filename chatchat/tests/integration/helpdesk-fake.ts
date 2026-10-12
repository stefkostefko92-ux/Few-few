import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Локален фалшив helpdesk за интеграционните тестове: общият webhook (`/hook`), Zendesk Tickets API
 * (`/api/v2/tickets…`, с Idempotency-Key и търсене по external_id) и JSM Service Desk API
 * (`/rest/servicedeskapi/…`). Записва всяка заявка; `failNext` връща грешка на следващите N заявки
 * (по желание СЛЕД като ги е изпълнил — „създадено, но отговорът се изгуби“).
 */

export interface Recorded {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Failure {
  status: number;
  /** Изпълни заявката (напр. създай тикета) и чак тогава върни грешката. */
  afterHandle?: boolean;
  headers?: Record<string, string>;
}

interface ZdTicket {
  id: number;
  externalId: string;
  status: string;
  subject: string;
  comments: string[];
}

interface JsmRequest {
  issueId: string;
  issueKey: string;
  summary: string;
  description: string;
  comments: Array<{ body: string; public: boolean }>;
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

export class FakeHelpdesk {
  readonly requests: Recorded[] = [];
  failNext: Failure[] = [];
  /** Какво връща общият webhook: externalId за връзката (или нищо). */
  webhookAck: string | null = null;
  readonly zendesk = new Map<number, ZdTicket>();
  readonly jsm = new Map<string, JsmRequest>();
  private readonly idempotency = new Map<string, number>();
  private server: Server | null = null;
  base = '';

  /** `port` 0 = свободен; e2e сървърът ползва фиксиран (спецификацията го знае). */
  async start(port = 0): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const rec: Recorded = {
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        // Управлението от e2e спецификацията (друг процес): следващите грешки. Не се записва.
        if (rec.path === '/__control' && rec.method === 'POST') {
          this.failNext = (JSON.parse(rec.body || '{}') as { failNext?: Failure[] }).failNext ?? [];
          res.writeHead(204).end();
          return;
        }
        this.requests.push(rec);
        const failure = this.failNext.shift();
        let reply: Reply = failure && !failure.afterHandle ? { status: 0 } : this.handle(rec);
        if (failure) reply = { status: failure.status, body: {}, headers: failure.headers ?? {} };
        res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers });
        res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => this.server?.listen(port, '127.0.0.1', () => r()));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }

  reset(): void {
    this.requests.length = 0;
    this.failNext = [];
    this.webhookAck = null;
    this.zendesk.clear();
    this.jsm.clear();
    this.idempotency.clear();
  }

  /** Само заявките по път (префикс). */
  to(prefix: string): Recorded[] {
    return this.requests.filter((r) => r.path.startsWith(prefix));
  }

  private handle(rec: Recorded): Reply {
    const url = new URL(rec.path, 'http://fake');
    const json = () => (rec.body ? (JSON.parse(rec.body) as Record<string, unknown>) : {});
    if (url.pathname === '/hook') {
      return {
        status: 200,
        body: this.webhookAck ? { externalId: this.webhookAck } : { ok: true },
      };
    }
    if (url.pathname.startsWith('/api/v2/') || url.pathname.startsWith('/rest/')) {
      if (!rec.headers.authorization)
        return { status: 401, body: { error: 'Couldn’t authenticate you' } };
    }
    // ── Zendesk ──
    if (url.pathname === '/api/v2/tickets/count')
      return { status: 200, body: { count: { value: this.zendesk.size } } };
    if (url.pathname === '/api/v2/tickets' && rec.method === 'GET') {
      const ext = url.searchParams.get('external_id');
      const tickets = [...this.zendesk.values()]
        .filter((t) => t.externalId === ext)
        .map((t) => ({ id: t.id }));
      return { status: 200, body: { tickets } };
    }
    if (url.pathname === '/api/v2/tickets' && rec.method === 'POST') {
      const key = String(rec.headers['idempotency-key'] ?? '');
      const seen = key ? this.idempotency.get(key) : undefined;
      if (seen !== undefined) {
        return {
          status: 201,
          body: { ticket: { id: seen } },
          headers: { 'x-idempotency-lookup': 'hit' },
        };
      }
      const t = json().ticket as {
        subject: string;
        status: string;
        external_id: string;
        comment: { body: string };
      };
      const id = this.zendesk.size + 1;
      this.zendesk.set(id, {
        id,
        externalId: t.external_id,
        status: t.status,
        subject: t.subject,
        comments: [t.comment.body],
      });
      if (key) this.idempotency.set(key, id);
      return { status: 201, body: { ticket: { id } }, headers: { 'x-idempotency-lookup': 'miss' } };
    }
    const zd = /^\/api\/v2\/tickets\/(\d+)$/.exec(url.pathname);
    if (zd && rec.method === 'PUT') {
      const t = this.zendesk.get(Number(zd[1]));
      if (!t) return { status: 404, body: { error: 'RecordNotFound' } };
      const upd = json().ticket as { status?: string; comment?: { body: string } };
      if (upd.status) t.status = upd.status;
      if (upd.comment) t.comments.push(upd.comment.body);
      return { status: 200, body: { ticket: { id: t.id, status: t.status } } };
    }
    // ── JSM ──
    if (url.pathname === '/rest/servicedeskapi/request' && rec.method === 'GET') {
      const term = url.searchParams.get('searchTerm') ?? '';
      const values = [...this.jsm.values()].filter((r) => r.summary.includes(term));
      return {
        status: 200,
        body: {
          values: values.map((r) => ({
            issueId: r.issueId,
            issueKey: r.issueKey,
            summary: r.summary,
          })),
        },
      };
    }
    if (url.pathname === '/rest/servicedeskapi/request' && rec.method === 'POST') {
      const b = json() as { requestFieldValues: { summary: string; description: string } };
      const n = this.jsm.size + 1;
      const r: JsmRequest = {
        issueId: String(107000 + n),
        issueKey: `HD-${n}`,
        summary: b.requestFieldValues.summary,
        description: b.requestFieldValues.description,
        comments: [],
      };
      this.jsm.set(r.issueKey, r);
      return { status: 201, body: { issueId: r.issueId, issueKey: r.issueKey } };
    }
    const jc = /^\/rest\/servicedeskapi\/request\/([^/]+)\/comment$/.exec(url.pathname);
    if (jc && rec.method === 'POST') {
      const r = this.jsm.get(decodeURIComponent(jc[1] ?? ''));
      if (!r) return { status: 404, body: {} };
      r.comments.push(json() as { body: string; public: boolean });
      return { status: 201, body: { id: String(r.comments.length) } };
    }
    if (/^\/rest\/servicedeskapi\/servicedesk\/\d+$/.test(url.pathname)) {
      return { status: 200, body: { id: '10', projectKey: 'HD' } };
    }
    return { status: 404, body: {} };
  }
}
