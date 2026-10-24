import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { isBreachedPassword } from '../src/auth/breached.js';
import { logger } from '../src/logger.js';

// SHA-1('password') = 5BAA6 | 1E4C9B93F3F0682250B6CF8331B7EE68FD8, a published value, not computed by the code
const PASSWORD = 'password';
const PREFIX = '5BAA6';
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const OTHER = '0018A45C4D1DEF81644B54AB7F969B88D65:1';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** Replaces the global fetch for one test (t.mock restores it) and silences the warnings. */
function fakeFetch(t: TestContext, respond: () => Promise<Response>) {
  const calls: Call[] = [];
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  });
  const warn = t.mock.method(logger, 'warn', () => undefined);
  return { calls, warn };
}

const body = (lines: string[]) => async () => new Response(lines.join('\r\n'), { status: 200 });

test('only the first five characters of the SHA-1 leave the server, with padding asked for', async (t) => {
  const { calls } = fakeFetch(t, body([OTHER]));
  assert.equal(await isBreachedPassword(PASSWORD), false);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call?.url, `https://api.pwnedpasswords.com/range/${PREFIX}`);
  // the exact URL already rules out the password and the other 35 characters; the headers carry none either
  assert.ok(!JSON.stringify(call?.init?.headers).includes(SUFFIX.slice(0, 6)));
  const headers = new Headers(call?.init?.headers);
  assert.equal(headers.get('Add-Padding'), 'true');
  assert.ok(call?.init?.signal instanceof AbortSignal, 'the request has a timeout');
});

test('a listed suffix with a count is a breached password; the CRLF lines are read', async (t) => {
  fakeFetch(t, body([OTHER, `${SUFFIX}:3861493`, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2']));
  assert.equal(await isBreachedPassword(PASSWORD), true);
});

test('a padding row (count 0) and a near miss are not a match', async (t) => {
  fakeFetch(
    t,
    body([OTHER, `${SUFFIX}:0`, `${SUFFIX.slice(0, -1)}9:12`, `${SUFFIX}0:5`, `X${SUFFIX}:7`]),
  );
  assert.equal(await isBreachedPassword(PASSWORD), false);
});

test('an error answer does not stop the registration: null and a warning without the password', async (t) => {
  const { warn } = fakeFetch(t, async () => new Response('busy', { status: 503 }));
  assert.equal(await isBreachedPassword(PASSWORD), null);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0]?.arguments[0], { status: 503 });
});

test('an unreachable service or a timeout is null too, and the log has only the error name', async (t) => {
  const { warn } = fakeFetch(t, async () => {
    throw new DOMException(`timeout for ${PASSWORD}`, 'TimeoutError');
  });
  assert.equal(await isBreachedPassword(PASSWORD), null);
  assert.deepEqual(warn.mock.calls[0]?.arguments[0], { err: 'TimeoutError' });
  const logged = JSON.stringify(warn.mock.calls.map((call) => call.arguments));
  assert.ok(!logged.includes(PASSWORD) && !logged.includes(SUFFIX), logged);
});
