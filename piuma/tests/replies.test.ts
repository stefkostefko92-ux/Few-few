/**
 * „Отговор по ключова дума“ — чистата логика, без база. Критериите (PR…) са в
 * `docs/private-replies.md`; всеки тест назовава своя.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { loadConfig, type AppConfig } from '../src/config.js';
import { can } from '../src/auth/rbac.js';
import { InstagramApiError } from '../src/instagram/client.js';
import { fetchProfile } from '../src/instagram/oauth.js';
import {
  fetchMediaCaption,
  sendPrivateReply,
  subscribeToComments,
} from '../src/instagram/messages.js';
import { announces, composeMessage, replyFooter } from '../src/replies/compose.js';
import {
  challengeResponse,
  signWebhook,
  verifyWebhookSignature,
} from '../src/replies/signature.js';
import { parseCommentEvents, type CommentEvent } from '../src/replies/events.js';
import { matchRule, normalizeKeyword, tokenize, type RuleCandidate } from '../src/replies/match.js';
import {
  REPLY_WINDOW_MS,
  classifySendError,
  decideSend,
  messageBytes,
  validateRuleInput,
} from '../src/replies/decide.js';
import { replyJobId } from '../src/queue/publish-queue.js';
import { webhookRouter } from '../src/replies/webhook-routes.js';

const SECRET = 'app-secret';
const ACCOUNT = '17841400000000000';

const cfg: AppConfig = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_BASE_URL: 'https://piuma.example.com',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  REDIS_URL: 'redis://127.0.0.1:6379/3',
  IG_APP_ID: '123456',
  IG_APP_SECRET: SECRET,
  IG_REDIRECT_URI: 'https://piuma.example.com/auth/instagram/callback',
  TOKEN_ENC_KEY: 'a'.repeat(64),
} as NodeJS.ProcessEnv);

// ───────────────────────── подпис и проверка (PR1, PR2) ─────────────────────────

test('PR2: верният подпис минава, а всяка промяна по тялото или заглавието пада', () => {
  const raw = Buffer.from('{"object":"instagram","entry":[]}', 'utf8');
  const header = signWebhook(SECRET, raw);
  assert.match(header, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verifyWebhookSignature(SECRET, raw, header), true);
  assert.equal(verifyWebhookSignature(SECRET, Buffer.from(`${raw} `), header), false, 'тяло');
  assert.equal(verifyWebhookSignature('друга-тайна', raw, header), false, 'тайна');
  assert.equal(verifyWebhookSignature(SECRET, raw, undefined), false, 'липсва');
  assert.equal(verifyWebhookSignature(SECRET, raw, header.slice(7)), false, 'без sha256=');
  assert.equal(verifyWebhookSignature(SECRET, raw, 'sha256=xyz'), false, 'не е hex');
  assert.equal(verifyWebhookSignature(SECRET, raw, `${header}00`), false, 'по-дълъг');
  assert.equal(verifyWebhookSignature(SECRET, raw, header.toUpperCase()), false, 'SHA256=');
});

test('PR2: подписва се суровото тяло — „\\u0446“ и „ц“ са различни байтове', () => {
  const escaped = Buffer.from('{"text":"\\u0446\\u0435\\u043d\\u0430"}', 'utf8');
  const literal = Buffer.from('{"text":"цена"}', 'utf8');
  const header = signWebhook(SECRET, escaped);
  assert.equal(verifyWebhookSignature(SECRET, escaped, header), true);
  assert.equal(verifyWebhookSignature(SECRET, literal, header), false);
});

test('PR1: предизвикателството се връща само при subscribe + верен токен + чист вид', () => {
  const token = 'v'.repeat(32);
  const ok = { 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '1158201444' };
  assert.equal(challengeResponse(ok, token), '1158201444');
  assert.equal(challengeResponse({ ...ok, 'hub.mode': 'unsubscribe' }, token), null);
  assert.equal(challengeResponse({ ...ok, 'hub.verify_token': 'грешен' }, token), null);
  assert.equal(challengeResponse({ ...ok, 'hub.verify_token': undefined }, token), null);
  assert.equal(challengeResponse({ ...ok, 'hub.challenge': '<script>' }, token), null);
  assert.equal(challengeResponse({ ...ok, 'hub.challenge': 'x'.repeat(129) }, token), null);
  assert.equal(challengeResponse({ ...ok, 'hub.challenge': ['1', '2'] }, token), null);
});

// ───────────────────────── разчитане на събитието (PR5–PR7) ─────────────────────────

const commentValue = (over: Record<string, unknown> = {}) => ({
  id: '17865799348089039',
  from: { id: '6543210', username: 'some_user' },
  text: 'Искам ЦЕНА!',
  media: { id: '18000000000000001', media_product_type: 'REELS' },
  ...over,
});

test('PR5: формата entry[].changes[] дава събитие без името на човека', () => {
  const events = parseCommentEvents({
    object: 'instagram',
    entry: [
      { id: ACCOUNT, time: 1762416000, changes: [{ field: 'comments', value: commentValue() }] },
    ],
  });
  assert.equal(events.length, 1);
  const [event] = events as [CommentEvent];
  assert.equal(event.accountIgId, ACCOUNT);
  assert.equal(event.commentId, '17865799348089039');
  assert.equal(event.mediaId, '18000000000000001');
  assert.equal(event.text, 'Искам ЦЕНА!');
  assert.equal(event.eventAt.getTime(), 1762416000 * 1000);
  assert.equal('username' in event, false, 'името не влиза в събитието');
  assert.equal(JSON.stringify(event).includes('some_user'), false);
});

test('PR5: формата field/value направо в entry и comment_id вместо id', () => {
  const events = parseCommentEvents({
    object: 'instagram',
    entry: [
      { id: ACCOUNT, time: 1762416000, field: 'comments', value: commentValue() },
      {
        id: ACCOUNT,
        time: 1762416001,
        changes: [
          {
            field: 'comments',
            value: { ...commentValue({ id: undefined }), comment_id: '17865799348089040' },
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    events.map((e) => e.commentId),
    ['17865799348089039', '17865799348089040'],
  );
});

test('PR5: само полето comments — live_comments, mentions и чуждият обект се пропускат', () => {
  const events = parseCommentEvents({
    object: 'instagram',
    entry: [
      {
        id: ACCOUNT,
        time: 1762416000,
        changes: [
          { field: 'live_comments', value: commentValue() },
          { field: 'mentions', value: { comment_id: '1', media_id: '2' } },
        ],
      },
    ],
  });
  assert.deepEqual(events, []);
  assert.deepEqual(parseCommentEvents({ object: 'page', entry: [] }), []);
});

test('PR6: собственият коментар на акаунта и коментар без текст или id се пропускат', () => {
  const events = parseCommentEvents({
    object: 'instagram',
    entry: [
      {
        id: ACCOUNT,
        time: 1762416000,
        changes: [
          { field: 'comments', value: commentValue({ from: { id: ACCOUNT, username: 'нашият' } }) },
          { field: 'comments', value: commentValue({ text: undefined }) },
          { field: 'comments', value: commentValue({ text: '   ' }) },
          { field: 'comments', value: commentValue({ id: undefined }) },
        ],
      },
    ],
  });
  assert.deepEqual(events, []);
});

test('PR7: повредена част от партидата не спира останалите', () => {
  const events = parseCommentEvents({
    object: 'instagram',
    entry: [
      null,
      { id: 42, time: 'вчера' },
      { id: ACCOUNT, time: 1762416000, changes: 'не е масив' },
      { id: ACCOUNT, time: 1762416000, changes: [null, { field: 'comments', value: 7 }] },
      { id: ACCOUNT, time: 1e20, changes: [{ field: 'comments', value: commentValue() }] },
      { id: ACCOUNT, time: Infinity, changes: [{ field: 'comments', value: commentValue() }] },
      { id: ACCOUNT, time: 1762416000, changes: [{ field: 'comments', value: commentValue() }] },
    ],
  });
  assert.equal(events.length, 1);
  assert.deepEqual(parseCommentEvents('не е обект'), []);
  assert.deepEqual(parseCommentEvents(null), []);
});

// ───────────────────────── съвпадение (PR8, PR9) ─────────────────────────

test('PR8: ключовата дума се нормализира и валидира', () => {
  assert.equal(normalizeKeyword('  LEARN '), 'learn');
  assert.equal(normalizeKeyword('ЦЕНА'), 'цена');
  assert.equal(normalizeKeyword('ｌｅａｒｎ'), 'learn', 'NFKC: широки латински букви');
  assert.equal(normalizeKeyword('e-book'), 'e-book');
  assert.equal(normalizeKeyword('x'), null, 'под 2 знака');
  assert.equal(normalizeKeyword('a'.repeat(31)), null, 'над 30 знака');
  assert.equal(normalizeKeyword('две думи'), null, 'интервал');
  assert.equal(normalizeKeyword('цена!'), null, 'препинателен знак');
  assert.equal(normalizeKeyword(''), null);
});

test('PR8: текстът се разбива на думи по всичко, което не е буква, цифра или тире', () => {
  assert.deepEqual(tokenize('Искам ЦЕНА!!! 🙏 #learn'), ['искам', 'цена', 'learn']);
  assert.deepEqual(tokenize('e-book, моля'), ['e-book', 'моля']);
});

const MEDIA = '18000000000000001';

const rule = (over: Partial<RuleCandidate>): RuleCandidate => ({
  id: 'r',
  keyword: 'learn',
  mediaId: MEDIA,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

const event = (text: string, mediaId: string | null = MEDIA): CommentEvent => ({
  accountIgId: ACCOUNT,
  commentId: '1',
  text,
  mediaId,
  eventAt: new Date('2026-11-06T10:00:00Z'),
});

test('PR8: съвпада цяла дума, без значение от главни букви и препинание', () => {
  const rules = [rule({ id: 'learn', keyword: 'learn' }), rule({ id: 'cena', keyword: 'цена' })];
  assert.equal(matchRule(rules, event('LEARN!'))?.id, 'learn');
  assert.equal(matchRule(rules, event('Каква е цената?')), null, '„цената“ не е „цена“');
  assert.equal(matchRule(rules, event('цена?'))?.id, 'cena');
  assert.equal(matchRule(rules, event('learning is fun')), null);
  assert.equal(matchRule(rules, event('unlearn')), null);
  assert.equal(matchRule(rules, event('нищо общо')), null);
});

test('PR9: само правило за СЪЩАТА медия; после по-дългата дума; после по-старото', () => {
  const forMedia = rule({ id: 'media', keyword: 'learn' });
  const otherMedia = rule({ id: 'other', keyword: 'learn', mediaId: '19999999999999999' });
  assert.equal(matchRule([forMedia, otherMedia], event('learn'))?.id, 'media');
  assert.equal(matchRule([otherMedia], event('learn')), null, 'правило за друга медия');
  assert.equal(matchRule([forMedia], event('learn', null)), null, 'коментар без медия');

  const short = rule({ id: 'short', keyword: 'ok' });
  const long = rule({ id: 'long', keyword: 'e-book' });
  assert.equal(matchRule([short, long], event('ok e-book'))?.id, 'long');

  const older = rule({ id: 'older', keyword: 'learn', createdAt: new Date('2026-10-01') });
  const newer = rule({ id: 'newer', keyword: 'learn', createdAt: new Date('2026-11-01') });
  assert.equal(matchRule([newer, older], event('learn'))?.id, 'older');
});

test('PR12a/PR18: обявата е думата в надписа на медията (цяла дума)', () => {
  assert.equal(announces('Напиши ЦЕНА в коментар и ще ти пратим цените.', 'цена'), true);
  assert.equal(announces('Коментирай #learn за безплатния гайд', 'learn'), true);
  assert.equal(announces('Цените са в профила.', 'цена'), false);
  assert.equal(announces('', 'цена'), false);
  assert.equal(announces(null, 'цена'), false);
});

// ───────────────────────── решение и грешки (PR11–PR15) ─────────────────────────

const now = new Date('2026-11-06T12:00:00Z');
const base = {
  status: 'QUEUED' as const,
  ruleStatus: 'ACTIVE' as const,
  accountStatus: 'ACTIVE' as const,
  accountScopes: 'instagram_business_basic,instagram_business_manage_comments',
  hasProfessionalId: true,
  privacyConfigured: true,
  eventAt: new Date(now.getTime() - 60_000),
  now,
};

test('PR12: изпраща само при QUEUED + жив акаунт с правото + активно правило + под 7 дни', () => {
  assert.deepEqual(decideSend(base), { action: 'send' });
  assert.equal(decideSend({ ...base, ruleStatus: 'PAUSED' }).action, 'skip');
  assert.equal(decideSend({ ...base, ruleStatus: 'DRAFT' }).action, 'skip');
  assert.equal(decideSend({ ...base, ruleStatus: null }).action, 'skip', 'изтрито правило');
  assert.equal(decideSend({ ...base, accountStatus: 'TOKEN_EXPIRED' }).action, 'skip');
  assert.equal(
    decideSend({ ...base, accountScopes: 'instagram_business_basic' }).action,
    'skip',
    'без правото за коментари',
  );
  assert.deepEqual(decideSend({ ...base, hasProfessionalId: false }), {
    action: 'skip',
    reason: 'нужно е ново свързване (IG_ID)',
  });
  assert.equal(decideSend({ ...base, status: 'SENT' }).action, 'noop');
  assert.equal(decideSend({ ...base, status: 'SKIPPED' }).action, 'noop');
});

test('PR12: точно 7 дни е изтекло; секунда по-малко — още може', () => {
  const at = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(REPLY_WINDOW_MS, 7 * 24 * 3600 * 1000);
  assert.equal(decideSend({ ...base, eventAt: at(REPLY_WINDOW_MS) }).action, 'skip');
  assert.equal(decideSend({ ...base, eventAt: at(REPLY_WINDOW_MS - 1000) }).action, 'send');
});

test('PR16a: без адрес на политиката не се праща — бележка с измислен адрес е по-лоша от нищо', () => {
  assert.deepEqual(decideSend({ ...base, privacyConfigured: false }), {
    action: 'skip',
    reason: 'политиката липсва',
  });
});

test('PR13: заварен SENDING не праща повторно — неясен изход', () => {
  assert.deepEqual(decideSend({ ...base, status: 'SENDING' }), {
    action: 'fail',
    reason: 'неясен изход',
  });
});

test('PR15: повторима грешка от Meta → повтор; без отговор → неясен изход; друга → провал', () => {
  assert.equal(classifySendError(new InstagramApiError('x', { httpStatus: 500 })), 'retry');
  assert.equal(classifySendError(new InstagramApiError('x', { httpStatus: 429 })), 'retry');
  assert.equal(
    classifySendError(new InstagramApiError('x', { httpStatus: 400, code: 4 })),
    'retry',
  );
  assert.equal(
    classifySendError(new InstagramApiError('x', { httpStatus: 400, code: 613 })),
    'retry',
  );
  assert.equal(
    classifySendError(new InstagramApiError('мрежа', { httpStatus: 599 })),
    'ambiguous',
    'мрежова грешка/таймаут — не знаем дали е стигнало',
  );
  assert.equal(
    classifySendError(new InstagramApiError('x', { httpStatus: 400, code: 10 })),
    'fail',
  );
  assert.equal(classifySendError(new Error('нещо друго')), 'ambiguous');
  assert.equal(
    classifySendError(new InstagramApiError('неочакван отговор', { httpStatus: 200 })),
    'ambiguous',
    '2xx с непозната форма — може да е изпратено',
  );
});

test('PR16: текстът и думата се валидират; медията е задължителна', () => {
  assert.equal(messageBytes('ц'), 2);
  assert.equal(messageBytes('a'), 1);
  const ok = { keyword: 'ЦЕНА', message: '  Цените са тук: https://example.com  ', mediaId: MEDIA };
  assert.deepEqual(validateRuleInput(ok), {
    ok: true,
    keyword: 'цена',
    mediaId: MEDIA,
    message: 'Цените са тук: https://example.com',
  });
  assert.deepEqual(validateRuleInput({ ...ok, message: '   ' }), {
    ok: false,
    error: 'replies.errMessage',
  });
  assert.deepEqual(validateRuleInput({ ...ok, message: 'ц'.repeat(501) }), {
    ok: false,
    error: 'replies.errMessage',
  });
  assert.deepEqual(validateRuleInput({ ...ok, keyword: 'две думи' }), {
    ok: false,
    error: 'replies.errKeyword',
  });
  assert.deepEqual(validateRuleInput({ ...ok, mediaId: '' }), {
    ok: false,
    error: 'replies.errMedia',
  });
  assert.deepEqual(validateRuleInput({ ...ok, mediaId: 'не-е-id' }), {
    ok: false,
    error: 'replies.errMedia',
  });
});

const footerArgs = {
  brand: 'Мастилко',
  keyword: 'цена',
  privacyUrl: 'https://carbonstealth.eu/privacy',
  contact: 'info@carbonstealth.eu',
};

test('PR16a: бележката назовава изпращача, думата, политиката и адреса за отказ — на трите езика', () => {
  for (const locale of ['bg', 'en', 'it'] as const) {
    const footer = replyFooter(locale, footerArgs);
    for (const part of [
      'Мастилко',
      'Carbon Stealth VCC',
      'цена',
      footerArgs.privacyUrl,
      footerArgs.contact,
    ]) {
      assert.ok(footer.includes(part), `${locale}: липсва „${part}“`);
    }
  }
  assert.equal(replyFooter('de', footerArgs), replyFooter('en', footerArgs), 'непознат език → en');
});

test('PR16a: текст + бележка ≤ 1000 байта; съобщението е текстът и бележката под него', () => {
  const footer = replyFooter('bg', footerArgs);
  const composed = composeMessage('Цените са тук.', footer);
  assert.equal(composed.ok, true);
  assert.equal(composed.ok && composed.text, `Цените са тук.\n\n${footer}`);
  assert.equal(composed.ok && composed.bytes, messageBytes(`Цените са тук.\n\n${footer}`));

  const room = 1000 - messageBytes(`\n\n${footer}`);
  assert.equal(composeMessage('a'.repeat(room), footer).ok, true, 'точно 1000 байта');
  assert.deepEqual(composeMessage('a'.repeat(room + 1), footer), {
    ok: false,
    error: 'replies.errTooLong',
    bytes: 1001,
  });
});

// ───────────────────────── заявките към Meta (PR14) ─────────────────────────

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
}

function stubFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const entry = responses[index++];
    if (!entry) throw new Error('неочаквана допълнителна заявка');
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : null,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return new Response(JSON.stringify(entry.json), {
      status: entry.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test('PR14: личното съобщение е JSON към /messages с Bearer; токенът не е в адреса', async () => {
  const { fetchImpl, calls } = stubFetch([
    { json: { recipient_id: '526000', message_id: 'aWdfZ-1' } },
  ]);
  const result = await sendPrivateReply(
    { cfg, igUserId: ACCOUNT, accessToken: 'IGQV-token', fetchImpl },
    '17865799348089039',
    'Ето линка: https://example.com',
  );
  assert.deepEqual(result, { messageId: 'aWdfZ-1' });
  const [call] = calls as [Call];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, `https://graph.instagram.com/${cfg.IG_GRAPH_VERSION}/${ACCOUNT}/messages`);
  assert.equal(call.url.includes('IGQV-token'), false);
  assert.equal(call.headers.authorization, 'Bearer IGQV-token');
  assert.equal(call.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(call.body ?? ''), {
    recipient: { comment_id: '17865799348089039' },
    message: { text: 'Ето линка: https://example.com' },
  });
});

test('PR14: грешката на Meta остава InstagramApiError с кода', async () => {
  const { fetchImpl } = stubFetch([
    { status: 400, json: { error: { message: 'too old', code: 10, type: 'OAuthException' } } },
  ]);
  await assert.rejects(
    sendPrivateReply({ cfg, igUserId: ACCOUNT, accessToken: 't', fetchImpl }, '1', 'x'),
    (error: unknown) => error instanceof InstagramApiError && error.code === 10,
  );
});

test('абонирането за коментари пита subscribed_apps само за полето comments', async () => {
  const { fetchImpl, calls } = stubFetch([{ json: { success: true } }]);
  await subscribeToComments({ cfg, igUserId: ACCOUNT, accessToken: 'IGQV-token', fetchImpl });
  const [call] = calls as [Call];
  assert.equal(call.method, 'POST');
  assert.equal(
    call.url,
    `https://graph.instagram.com/${cfg.IG_GRAPH_VERSION}/${ACCOUNT}/subscribed_apps`,
  );
  const form = new URLSearchParams(call.body ?? '');
  assert.equal(form.get('subscribed_fields'), 'comments');
  assert.equal(form.get('access_token'), 'IGQV-token');
});

test('PR12a: живият надпис се чете с Bearer, без токен в адреса', async () => {
  const { fetchImpl, calls } = stubFetch([{ json: { id: MEDIA, caption: 'Напиши ЦЕНА' } }]);
  const caption = await fetchMediaCaption(
    { cfg, igUserId: ACCOUNT, accessToken: 'IGQV-token', fetchImpl },
    MEDIA,
  );
  assert.equal(caption, 'Напиши ЦЕНА');
  const [call] = calls as [Call];
  assert.equal(call.method, 'GET');
  const url = new URL(call.url);
  assert.equal(url.pathname, `/${cfg.IG_GRAPH_VERSION}/${MEDIA}`);
  assert.equal(url.searchParams.get('fields'), 'caption');
  assert.equal(call.url.includes('IGQV-token'), false);
  assert.equal(call.headers.authorization, 'Bearer IGQV-token');

  const empty = stubFetch([{ json: { id: MEDIA } }]);
  assert.equal(
    await fetchMediaCaption(
      { cfg, igUserId: ACCOUNT, accessToken: 't', fetchImpl: empty.fetchImpl },
      MEDIA,
    ),
    null,
  );
});

test('профилът при свързване иска и user_id — това е id-то в webhook-а (IG_ID), не id от /me', async () => {
  const { fetchImpl, calls } = stubFetch([
    { json: { id: '2600000000000001', user_id: '17841400000000000', username: 'piuma' } },
  ]);
  const profile = await fetchProfile(cfg, 'IGQV-token', fetchImpl);
  assert.equal(profile.user_id, '17841400000000000');
  const [call] = calls as [Call];
  assert.equal(new URL(call.url).searchParams.get('fields'), 'id,user_id,username,account_type');
});

// ───────────────────────── опашка и права (PR10, PR17, PR18) ─────────────────────────

test('PR10: id-то на задачата е стабилно и без двоеточие (BullMQ го отказва)', () => {
  assert.equal(replyJobId('abc123'), 'reply-abc123');
  assert.equal(replyJobId('a:b/c'), 'reply-a-b-c');
});

test('PR17/PR18: редактор пише правила, ревюър ги одобрява, наблюдател само гледа', () => {
  assert.equal(can('EDITOR', 'replies:edit'), true);
  assert.equal(can('ANALYST', 'replies:edit'), false);
  assert.equal(can('REVIEWER', 'replies:approve'), true);
  assert.equal(can('EDITOR', 'replies:approve'), false);
  assert.equal(can('VIEWER', 'accounts:view'), true);
});

// ───────────────────────── маршрутът (PR1–PR4) ─────────────────────────

async function serve(options: Parameters<typeof webhookRouter>[0]) {
  const app = express();
  app.use(webhookRouter(options));
  app.use((_req, res) => {
    res.status(404).end();
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/instagram`;
  return { url, close: () => server.close() };
}

const TOKEN = 't'.repeat(32);

test('PR4: без verify token маршрутът го няма — 404 и за GET, и за POST', async (t) => {
  const seen: CommentEvent[][] = [];
  const { url, close } = await serve({
    appSecret: SECRET,
    verifyToken: undefined,
    ingest: async (e) => void seen.push(e),
  });
  t.after(close);
  const get = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`);
  assert.equal(get.status, 404);
  const body = '{"object":"instagram","entry":[]}';
  const post = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(SECRET, Buffer.from(body)),
    },
    body,
  });
  assert.equal(post.status, 404);
  assert.equal(seen.length, 0);
});

test('PR1: проверката от Meta връща challenge като чист текст', async (t) => {
  const { url, close } = await serve({
    appSecret: SECRET,
    verifyToken: TOKEN,
    ingest: async () => {},
  });
  t.after(close);
  const ok = await fetch(
    `${url}?hub.mode=subscribe&hub.verify_token=${TOKEN}&hub.challenge=1158201444`,
  );
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type') ?? '', /^text\/plain/);
  assert.equal(await ok.text(), '1158201444');
  const bad = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
  assert.equal(bad.status, 403);
});

test('PR2/PR3: грешен подпис → 401 и нищо; верен → събитията стигат до приема и 200', async (t) => {
  const seen: CommentEvent[][] = [];
  const { url, close } = await serve({
    appSecret: SECRET,
    verifyToken: TOKEN,
    ingest: async (events) => {
      seen.push(events);
    },
  });
  t.after(close);
  const body = JSON.stringify({
    object: 'instagram',
    entry: [
      { id: ACCOUNT, time: 1762416000, changes: [{ field: 'comments', value: commentValue() }] },
    ],
  });
  const forged = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook('чужда', Buffer.from(body)),
    },
    body,
  });
  assert.equal(forged.status, 401);
  const unsigned = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  assert.equal(unsigned.status, 401);
  assert.equal(seen.length, 0);

  const signed = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(SECRET, Buffer.from(body)),
    },
    body,
  });
  assert.equal(signed.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.[0]?.commentId, '17865799348089039');
});

test('PR3: подписано, но нечетимо тяло → 200 и нищо; провал на приема → 500 (Meta ще повтори)', async (t) => {
  let calls = 0;
  const { url, close } = await serve({
    appSecret: SECRET,
    verifyToken: TOKEN,
    ingest: async () => {
      calls += 1;
      throw new Error('базата е паднала');
    },
  });
  t.after(close);
  const garbage = 'не е JSON {';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(SECRET, Buffer.from(garbage)),
    },
    body: garbage,
  });
  assert.equal(res.status, 200);
  assert.equal(calls, 0);

  const body = JSON.stringify({
    object: 'instagram',
    entry: [
      { id: ACCOUNT, time: 1762416000, changes: [{ field: 'comments', value: commentValue() }] },
    ],
  });
  const failing = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(SECRET, Buffer.from(body)),
    },
    body,
  });
  assert.equal(failing.status, 500);
  assert.equal(calls, 1);
});

test('PR2: тялото над 1 MB се отказва преди подписа', async (t) => {
  const { url, close } = await serve({
    appSecret: SECRET,
    verifyToken: TOKEN,
    ingest: async () => {},
  });
  t.after(close);
  const huge = JSON.stringify({ object: 'instagram', pad: 'x'.repeat(1_100_000) });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(SECRET, Buffer.from(huge)),
    },
    body: huge,
  });
  assert.equal(res.status, 413);
});
