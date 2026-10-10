import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { safeRequest } from '../src/services/integrations/http.js';
import {
  checkUrl,
  guardedLookup,
  isBlockedAddress,
  NetFailure,
  type NetPolicy,
} from '../src/services/integrations/ssrf.js';

/** SSRF филтърът (§15.1): частни/loopback/link-local/metadata адреси, схема, DNS, пренасочвания. */

const strict: NetPolicy = { allowInsecureLocal: false, timeoutMs: 2000, maxResponseBytes: 1024 };

describe('забранени адреси', () => {
  test('частни, loopback, link-local, metadata, CGNAT, multicast, запазени — забранени', () => {
    for (const ip of [
      '127.0.0.1',
      '127.255.255.254',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '192.0.2.10',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd00:ec2::254',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:a9fe:a9fe',
      '64:ff9b::7f00:1',
      '2001:db8::1',
      '2002:7f00:1::',
      'ff02::1',
      'не е адрес',
    ]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
  });

  test('публичните адреси минават', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111']) {
      assert.equal(isBlockedAddress(ip), false, ip);
    }
  });
});

describe('checkUrl', () => {
  const code = (raw: string) => {
    const r = checkUrl(raw, strict);
    return r.ok ? 'ok' : r.code;
  };

  test('само https, без потребител/парола в адреса', () => {
    assert.equal(code('https://acme.zendesk.com/api/v2/tickets'), 'ok');
    assert.equal(code('http://acme.example.com/hook'), 'https_required');
    assert.equal(code('ftp://acme.example.com/'), 'https_required');
    assert.equal(code('https://user:pass@acme.example.com/'), 'credentials_in_url');
    assert.equal(code('не е адрес'), 'invalid_url');
  });

  test('IP литерали и вътрешни имена — забранени, и в „скрит“ запис (десетичен, hex)', () => {
    for (const raw of [
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://169.254.169.254/latest/meta-data/',
      'https://2130706433/',
      'https://0x7f.1/',
      'https://10.0.0.5:8443/hook',
      'https://localhost/',
      'https://api.localhost/',
      'https://helpdesk.internal/',
      'https://printer.local/',
    ]) {
      assert.equal(code(raw), 'ssrf_blocked', raw);
    }
  });

  test('отпуснатата политика (само тестове, от код) пуска локален http', () => {
    assert.equal(checkUrl('http://127.0.0.1:9/', { allowInsecureLocal: true }).ok, true);
  });
});

describe('guardedLookup — DNS', () => {
  const lookupWith = (addresses: Array<{ address: string; family: 4 | 6 }>, all: boolean) =>
    new Promise<{ err: unknown; value: unknown }>((resolve) => {
      guardedLookup({ ...strict, resolve: async () => addresses })(
        'helpdesk.example.com',
        { all },
        (err, value) => resolve({ err, value }),
      );
    });

  test('публичен адрес → връзката е към проверения адрес', async () => {
    const one = await lookupWith([{ address: '93.184.216.34', family: 4 }], false);
    assert.equal(one.err, null);
    assert.equal(one.value, '93.184.216.34');
    const all = await lookupWith([{ address: '93.184.216.34', family: 4 }], true);
    assert.deepEqual(all.value, [{ address: '93.184.216.34', family: 4 }]);
  });

  test('име, което сочи частен/metadata адрес (или смесени записи) → ssrf_blocked', async () => {
    for (const set of [
      [{ address: '10.0.0.7', family: 4 as const }],
      [{ address: '169.254.169.254', family: 4 as const }],
      [
        { address: '93.184.216.34', family: 4 as const },
        { address: '127.0.0.1', family: 4 as const },
      ],
      [{ address: 'fd00:ec2::254', family: 6 as const }],
    ]) {
      const r = await lookupWith(set, false);
      assert.ok(r.err instanceof NetFailure);
      assert.equal(r.err.code, 'ssrf_blocked');
    }
  });

  test('без адреси → dns_failed', async () => {
    const r = await lookupWith([], false);
    assert.ok(r.err instanceof NetFailure && r.err.code === 'dns_failed');
  });
});

describe('safeRequest — без пренасочвания, таван на отговора, таймаут', () => {
  let server: Server;
  let base = '';
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/' }).end();
      } else if (req.url === '/big') {
        res.writeHead(200).end('x'.repeat(4096));
      } else if (req.url === '/slow') {
        setTimeout(() => res.writeHead(200).end('late'), 1500);
      } else {
        res.writeHead(200, { 'retry-after': '7', 'content-type': 'text/plain' }).end('ok');
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  const local: NetPolicy = { allowInsecureLocal: true, timeoutMs: 500, maxResponseBytes: 1024 };
  const failure = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'ok';
    } catch (err) {
      return err instanceof NetFailure ? err.code : 'other';
    }
  };

  test('строгата политика не стига до локалния сървър', async () => {
    assert.equal(
      await failure(safeRequest(strict, { method: 'GET', url: `${base}/`, headers: {} })),
      'https_required',
    );
    assert.equal(
      await failure(
        safeRequest(strict, { method: 'GET', url: base.replace('http:', 'https:'), headers: {} }),
      ),
      'ssrf_blocked',
    );
  });

  test('успех: статус, тяло и Retry-After', async () => {
    const res = await safeRequest(local, {
      method: 'POST',
      url: `${base}/`,
      headers: {},
      body: '{}',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, 'ok');
    assert.equal(res.headers.retryAfter, '7');
  });

  test('3xx → redirect_refused (пренасочване не се следва)', async () => {
    assert.equal(
      await failure(safeRequest(local, { method: 'GET', url: `${base}/redirect`, headers: {} })),
      'redirect_refused',
    );
  });

  test('отговор над тавана → response_too_large; бавен → timeout', async () => {
    assert.equal(
      await failure(safeRequest(local, { method: 'GET', url: `${base}/big`, headers: {} })),
      'response_too_large',
    );
    assert.equal(
      await failure(safeRequest(local, { method: 'GET', url: `${base}/slow`, headers: {} })),
      'timeout',
    );
  });
});
