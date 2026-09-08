import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, type AppConfig } from '../src/config.js';
import { InstagramApiError } from '../src/instagram/client.js';
import { buildAuthorizeUrl, exchangeCodeForToken } from '../src/instagram/oauth.js';
import {
  createContainer,
  getPublishingQuota,
  publishContainer,
  waitForContainer,
  type PublishDeps,
} from '../src/instagram/publish.js';

const cfg: AppConfig = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_BASE_URL: 'https://publikator.example.com',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  REDIS_URL: 'redis://127.0.0.1:6379/3',
  IG_APP_ID: '123456',
  IG_APP_SECRET: 'app-secret',
  IG_REDIRECT_URI: 'https://publikator.example.com/auth/instagram/callback',
  TOKEN_ENC_KEY: 'a'.repeat(64),
  ADMIN_API_TOKEN: 'x'.repeat(40),
} as NodeJS.ProcessEnv);

interface Call {
  url: string;
  method: string;
  body: string | null;
}

function stubFetch(responses: Array<{ status?: number; json: unknown }>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const entry = responses[index++];
    if (!entry) throw new Error('неочаквана допълнителна заявка');
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : null,
    });
    return new Response(JSON.stringify(entry.json), {
      status: entry.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const deps = (fetchImpl: typeof fetch): PublishDeps => ({
  cfg,
  igUserId: '17841400000000000',
  accessToken: 'IGQV-token',
  fetchImpl,
});

test('authorize URL носи scope, redirect_uri и state', () => {
  const url = new URL(buildAuthorizeUrl(cfg, 'state-value'));
  assert.equal(url.origin + url.pathname, 'https://api.instagram.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '123456');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(
    url.searchParams.get('scope'),
    'instagram_business_basic,instagram_business_content_publish',
  );
});

test('размяната на код връща user_id като низ', async () => {
  const { fetchImpl, calls } = stubFetch([
    { json: { access_token: 'short-lived', user_id: 17841400000000000 } },
  ]);
  const token = await exchangeCodeForToken(cfg, 'the-code', fetchImpl);
  assert.equal(token.access_token, 'short-lived');
  assert.equal(typeof token.user_id, 'string');
  assert.equal(calls[0]?.method, 'POST');
  assert.match(calls[0]?.body ?? '', /grant_type=authorization_code/);
});

test('контейнер за снимка носи image_url, alt_text и caption', async () => {
  const { fetchImpl, calls } = stubFetch([{ json: { id: '999' } }]);
  const container = await createContainer(deps(fetchImpl), {
    kind: 'IMAGE',
    mediaUrl: 'https://cdn.example.com/a.jpg',
    caption: 'текст',
    altText: 'описание',
  });
  assert.equal(container.id, '999');
  const body = calls[0]?.body ?? '';
  assert.match(body, /image_url=https/);
  assert.match(body, /alt_text=/);
  assert.doesNotMatch(body, /media_type=/);
});

test('контейнер за Reel носи media_type=REELS, video_url и cover_url', async () => {
  const { fetchImpl, calls } = stubFetch([{ json: { id: '1000' } }]);
  await createContainer(deps(fetchImpl), {
    kind: 'REELS',
    mediaUrl: 'https://cdn.example.com/a.mp4',
    caption: 'текст',
    coverUrl: 'https://cdn.example.com/cover.jpg',
  });
  const body = calls[0]?.body ?? '';
  assert.match(body, /media_type=REELS/);
  assert.match(body, /video_url=https/);
  assert.match(body, /cover_url=https/);
});

test('чакаме контейнера до FINISHED', async () => {
  const { fetchImpl } = stubFetch([
    { json: { id: '1', status_code: 'IN_PROGRESS' } },
    { json: { id: '1', status_code: 'FINISHED' } },
  ]);
  const status = await waitForContainer(deps(fetchImpl), '1', {
    delayMs: 0,
    sleep: async () => {},
  });
  assert.equal(status.status_code, 'FINISHED');
});

test('контейнер със статус ERROR хвърля, вместо да публикува', async () => {
  const { fetchImpl } = stubFetch([{ json: { id: '1', status_code: 'ERROR', status: 'бум' } }]);
  await assert.rejects(
    () => waitForContainer(deps(fetchImpl), '1', { delayMs: 0, sleep: async () => {} }),
    InstagramApiError,
  );
});

test('публикуването подава creation_id', async () => {
  const { fetchImpl, calls } = stubFetch([{ json: { id: 'media-1' } }]);
  const media = await publishContainer(deps(fetchImpl), 'container-1');
  assert.equal(media.id, 'media-1');
  assert.match(calls[0]?.body ?? '', /creation_id=container-1/);
});

test('квотата се чете от content_publishing_limit', async () => {
  const { fetchImpl } = stubFetch([
    { json: { data: [{ quota_usage: 97, config: { quota_total: 100 } }] } },
  ]);
  const quota = await getPublishingQuota(deps(fetchImpl));
  assert.deepEqual(quota, { used: 97, total: 100, remaining: 3 });
});

test('грешка от Meta се превежда в InstagramApiError с код', async () => {
  const { fetchImpl } = stubFetch([
    {
      status: 400,
      json: { error: { message: 'Invalid OAuth token', type: 'OAuthException', code: 190 } },
    },
  ]);
  await assert.rejects(
    () => publishContainer(deps(fetchImpl), 'c1'),
    (error: unknown) => {
      assert.ok(error instanceof InstagramApiError);
      assert.equal(error.code, 190);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test('throttling от Meta се маркира като повторим', async () => {
  const { fetchImpl } = stubFetch([
    { status: 400, json: { error: { message: 'rate limited', code: 4 } } },
  ]);
  await assert.rejects(
    () => publishContainer(deps(fetchImpl), 'c1'),
    (error: unknown) => error instanceof InstagramApiError && error.retryable,
  );
});
