import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

/** Общото за HTTP тестовете: сървърът на свой порт, вход с CSRF токена, POST на форма, GET. */
export interface Session {
  cookie: string;
  csrf: string;
}

export interface HttpClient {
  origin: string;
  close(): Promise<void>;
  login(email: string, password: string): Promise<Session>;
  post(session: Session | null, path: string, fields: Record<string, string>): Promise<Response>;
  get(session: Session | null, path: string): Promise<Response>;
}

export async function startHttp(createServer: () => Express): Promise<HttpClient> {
  const server: Server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (session: Session | null, path: string, fields: Record<string, string>) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(session ? { cookie: session.cookie } : {}),
      },
      body: new URLSearchParams(session ? { _csrf: session.csrf, ...fields } : fields),
    });
  const get = (session: Session | null, path: string) =>
    fetch(`${origin}${path}`, {
      redirect: 'manual',
      headers: session ? { cookie: session.cookie } : {},
    });
  return {
    origin,
    post,
    get,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    async login(email, password) {
      const res = await post(null, '/vhod', { email, password });
      assert.equal(res.status, 303, `вход ${email}`);
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      const page = await fetch(`${origin}/app`, { headers: { cookie } });
      const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
      assert.ok(csrf, 'CSRF токен на страницата');
      return { cookie, csrf };
    },
  };
}
