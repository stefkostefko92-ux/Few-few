import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STEAM_OPENID_ENDPOINT,
  parseKeyValue,
  steamLoginUrl,
  verifySteamResponse,
  type FetchLike,
} from '../src/admin/steam-openid.js';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const STEAM_ID = '76561198000000042';
const RETURN_TO = 'https://cs2.carbonstealth.eu/admin/login/return?n=abcDEF123';
const CLAIMED = `https://steamcommunity.com/openid/id/${STEAM_ID}`;

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    n: 'abcDEF123',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': CLAIMED,
    'openid.identity': CLAIMED,
    'openid.return_to': RETURN_TO,
    'openid.response_nonce': '2026-10-24T11:59:30ZaBcD1234',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...overrides,
  };
}

/** Двойник на Steam: записва заявките и отговаря с подадения текст. Нула мрежа. */
function steam(body: string, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return { fetch, calls };
}

const VALID = 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n';

test('адресът към Steam: identifier_select, нашият return_to и realm', () => {
  const url = new URL(steamLoginUrl(RETURN_TO, 'https://cs2.carbonstealth.eu/'));
  assert.equal(`${url.origin}${url.pathname}`, STEAM_OPENID_ENDPOINT);
  assert.equal(url.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(url.searchParams.get('openid.return_to'), RETURN_TO);
  assert.equal(url.searchParams.get('openid.realm'), 'https://cs2.carbonstealth.eu/');
  assert.match(url.searchParams.get('openid.claimed_id') ?? '', /identifier_select$/);
});

test('валиден отговор → check_authentication (POST към Steam) → SteamID64', async () => {
  const fake = steam(VALID);
  const result = await verifySteamResponse({
    query: response(),
    expectedReturnTo: RETURN_TO,
    fetch: fake.fetch,
    now: NOW,
  });
  assert.deepEqual(result, { ok: true, steamId: STEAM_ID });
  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0]!;
  assert.equal(call.url, STEAM_OPENID_ENDPOINT);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.redirect, 'error');
  const sent = new URLSearchParams(String(call.init.body));
  assert.equal(sent.get('openid.mode'), 'check_authentication');
  assert.equal(sent.get('openid.sig'), 'c2lnbmF0dXJl');
  assert.equal(sent.get('openid.claimed_id'), CLAIMED);
  assert.equal(sent.get('n'), null, 'само полетата openid.* отиват към Steam');
});

test('отказите — без заявка към Steam, ако отговорът не е наш или е подменен', async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ 'openid.return_to': 'https://evil.example/admin/login/return?n=abcDEF123' }, 'mismatch'],
    [{ 'openid.return_to': `${RETURN_TO}x` }, 'mismatch'],
    [{ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000043' }, 'mismatch'],
    [{ 'openid.claimed_id': 'https://evil.example/openid/id/76561198000000042' }, 'malformed'],
    [{ 'openid.claimed_id': 'https://steamcommunity.com/openid/id/12345' }, 'malformed'],
    [{ 'openid.op_endpoint': 'https://evil.example/openid/login' }, 'malformed'],
    [{ 'openid.mode': 'cancel' }, 'malformed'],
    [{ 'openid.signed': 'op_endpoint,claimed_id,identity' }, 'unsigned'],
    [{ 'openid.response_nonce': '2026-10-24T11:40:00Zold' }, 'stale'],
    [{ 'openid.response_nonce': '2026-10-24T12:10:00Zfuture' }, 'stale'],
    [{ 'openid.sig': ['a', 'b'] }, 'malformed'],
  ];
  for (const [overrides, reason] of cases) {
    const fake = steam(VALID);
    const result = await verifySteamResponse({
      query: response(overrides),
      expectedReturnTo: RETURN_TO,
      fetch: fake.fetch,
      now: NOW,
    });
    assert.deepEqual(result, { ok: false, reason }, JSON.stringify(overrides));
    assert.equal(fake.calls.length, 0, `${reason}: без заявка към Steam`);
  }
});

test('Steam казва is_valid:false, не отговаря или отговаря с грешка → отказ', async () => {
  for (const [body, status, reason] of [
    ['ns:http://specs.openid.net/auth/2.0\nis_valid:false\n', 200, 'rejected'],
    ['is_valid:true\n', 200, 'rejected'],
    [VALID, 503, 'unreachable'],
  ] as const) {
    const result = await verifySteamResponse({
      query: response(),
      expectedReturnTo: RETURN_TO,
      fetch: steam(body, status).fetch,
      now: NOW,
    });
    assert.deepEqual(result, { ok: false, reason });
  }
  const throwing: FetchLike = async () => {
    throw new Error('ECONNRESET');
  };
  assert.deepEqual(
    await verifySteamResponse({
      query: response(),
      expectedReturnTo: RETURN_TO,
      fetch: throwing,
      now: NOW,
    }),
    { ok: false, reason: 'unreachable' },
  );
});

test('key:value отговорът се чете по редове', () => {
  assert.deepEqual(parseKeyValue('ns:a:b\nis_valid:true\r\nbroken\n'), {
    ns: 'a:b',
    is_valid: 'true',
  });
});
