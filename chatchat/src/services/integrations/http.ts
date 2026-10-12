import http from 'node:http';
import https from 'node:https';
import { checkUrl, guardedLookup, NetFailure, type NetPolicy } from './ssrf.js';

/**
 * Изходящата заявка към helpdesk: адресът минава `checkUrl` (схема, IP литерал), името —
 * `guardedLookup` (всеки адрес е публичен, връзката е към проверения), TLS ≥ 1.2, без
 * keep-alive (всяка заявка разрешава наново), БЕЗ пренасочвания (3xx → `redirect_refused`),
 * таймаут на цялата заявка и таван на отговора. Грешките са само кодове (`NetFailure`).
 */

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  /** Само заглавките, които конекторите ползват (имената са с малки букви). */
  headers: { retryAfter: string | null; contentType: string | null };
  body: string;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

/** Кодът на мрежова грешка без съобщението ѝ (то може да носи адрес). */
function codeOf(err: unknown): string {
  if (err instanceof NetFailure) return err.code;
  const code = (err as NodeJS.ErrnoException | null)?.code ?? '';
  if (/^(ERR_TLS|CERT_|UNABLE_TO|DEPTH_ZERO|SELF_SIGNED|ERR_SSL)/.test(code)) return 'tls_failed';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_failed';
  return 'network';
}

const header = (v: string | string[] | undefined): string | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export function createHttpClient(policy: NetPolicy): HttpClient {
  return (req) => safeRequest(policy, req);
}

export function safeRequest(policy: NetPolicy, req: HttpRequest): Promise<HttpResponse> {
  const checked = checkUrl(req.url, policy);
  if (!checked.ok) return Promise.reject(new NetFailure(checked.code));
  const url = checked.url;
  const transport = url.protocol === 'https:' ? https : http;
  const body = req.body ?? '';
  return new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    const done = (err: NetFailure | null, res?: HttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (err) reject(err);
      else if (res) resolve(res);
    };
    const request = transport.request(
      url,
      {
        method: req.method,
        headers: {
          ...req.headers,
          ...(req.method === 'GET' ? {} : { 'content-length': String(Buffer.byteLength(body)) }),
        },
        lookup: guardedLookup(policy),
        agent: false,
        minVersion: 'TLSv1.2',
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          request.destroy();
          done(new NetFailure('redirect_refused'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > policy.maxResponseBytes) {
            request.destroy();
            done(new NetFailure('response_too_large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          done(null, {
            status,
            headers: {
              retryAfter: header(res.headers['retry-after']),
              contentType: header(res.headers['content-type']),
            },
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', (err) => done(new NetFailure(codeOf(err))));
      },
    );
    const deadline = setTimeout(() => {
      request.destroy();
      done(new NetFailure('timeout'));
    }, policy.timeoutMs);
    request.on('error', (err) => done(new NetFailure(codeOf(err))));
    request.end(req.method === 'GET' ? undefined : body);
  });
}
