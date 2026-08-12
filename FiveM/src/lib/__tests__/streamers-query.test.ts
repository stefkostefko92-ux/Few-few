import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { discoverKick, discoverTwitch, discoverYouTube } from '../streamers-query';

/**
 * Мрежовият слой към Twitch/Kick/YouTube нямаше нито един тест: формата на
 * чуждия отговор се приемаше на доверие, а тя е точно мястото, където чужда
 * страна може да ни изненада. Тук `fetch` се подменя, тоест нула реални
 * заявки, нула ключове и нула зависимост от чужда услуга.
 */
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

type Route = { status?: number; body: unknown };
let routes: Record<string, Route> = {};
let calls: string[] = [];

function stub(map: Record<string, Route>) {
  routes = map;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const route = key ? routes[key] : undefined;
    if (!route) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  process.env.TWITCH_CLIENT_ID = 'id';
  process.env.TWITCH_CLIENT_SECRET = 'secret';
  process.env.KICK_CLIENT_ID = 'id';
  process.env.KICK_CLIENT_SECRET = 'secret';
  process.env.YOUTUBE_API_KEY = 'key';
  delete process.env.KICK_CATEGORY_ID;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

const token = { body: { access_token: 'тестов-токен' } };

// ── Липсващ ключ ────────────────────────────────────────────────────────────

test('липсващ ключ пропуска платформата и НЕ прави заявка', async () => {
  stub({});
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.KICK_CLIENT_SECRET;
  delete process.env.YOUTUBE_API_KEY;

  assert.deepEqual(await discoverTwitch(), []);
  assert.deepEqual(await discoverKick(), []);
  assert.deepEqual(await discoverYouTube(), []);
  assert.equal(calls.length, 0, 'направена е заявка без ключ');
});

// ── Twitch ──────────────────────────────────────────────────────────────────

test('Twitch: чете полетата и обявява български език', async () => {
  stub({
    'id.twitch.tv': token,
    'api.twitch.tv': {
      body: {
        data: [
          { user_login: 'GalaxyRP', user_name: 'Galaxy RP', language: 'bg', viewer_count: 142, title: 'Ден 3' },
        ],
      },
    },
  });

  const [found] = await discoverTwitch();
  assert.equal(found.channel, 'galaxyrp', 'каналът се нормализира до малки букви');
  assert.equal(found.displayName, 'Galaxy RP');
  assert.equal(found.profileUrl, 'https://www.twitch.tv/galaxyrp');
  assert.equal(found.viewers, 142);
  assert.equal(found.streamTitle, 'Ден 3');
  assert.equal(found.declaredBulgarian, true, 'език bg трябва да значи публично автоматично');
  assert.ok(
    calls.some((u) => u.includes('game_id=32982') && u.includes('language=bg')),
    'заявката трябва да филтрира по GTA V и по език СЪРВЪРНО',
  );
});

test('Twitch: чужд език НЕ влиза публично автоматично', async () => {
  stub({
    'id.twitch.tv': token,
    'api.twitch.tv': { body: { data: [{ user_login: 'ru_guy', language: 'ru', viewer_count: 9 }] } },
  });
  const [found] = await discoverTwitch();
  assert.equal(found.declaredBulgarian, false);
});

test('Twitch: отказан токен спира тихо, без изключение', async () => {
  stub({ 'id.twitch.tv': { status: 401, body: { message: 'нема' } } });
  assert.deepEqual(await discoverTwitch(), []);
});

// ── Kick ────────────────────────────────────────────────────────────────────

test('Kick: намира категорията по име и после излъчванията', async () => {
  stub({
    'id.kick.com': token,
    '/categories': { body: { data: [{ id: 7, name: 'Grand Theft Auto V' }] } },
    '/livestreams': {
      body: { data: [{ slug: 'KickBG', language: 'bg', viewer_count: 12, stream_title: 'RP вечер' }] },
    },
  });

  const [found] = await discoverKick();
  assert.equal(found.channel, 'kickbg');
  assert.equal(found.profileUrl, 'https://kick.com/kickbg');
  assert.equal(found.declaredBulgarian, true);
  assert.ok(calls.some((u) => u.includes('category_id=7')), 'намереното id не е ползвано');
});

test('Kick: „Bulgarian“ и „bg“ значат едно и също', async () => {
  stub({
    'id.kick.com': token,
    '/categories': { body: { data: [{ id: 7, name: 'grand theft auto v' }] } },
    // Каналът е поне 2 знака: `normalizeChannel` отхвърля по-къси, а и
    // самите платформи не позволяват такива.
    '/livestreams': { body: { data: [{ slug: 'bgkick', language: 'Bulgarian' }] } },
  });
  const [found] = await discoverKick();
  assert.equal(found.declaredBulgarian, true, 'форматът на езика в Kick не е документиран');
});

test('Kick: ненамерена категория спира, вместо да тегли всичко', async () => {
  stub({
    'id.kick.com': token,
    '/categories': { body: { data: [{ id: 3, name: 'Just Chatting' }] } },
  });
  assert.deepEqual(await discoverKick(), []);
  assert.ok(!calls.some((u) => u.includes('/livestreams')), 'дърпа излъчвания без категория');
});

// ── YouTube ─────────────────────────────────────────────────────────────────

test('YouTube НИКОГА не обявява български — платформата не дава език', async () => {
  stub({
    'googleapis.com': {
      body: {
        items: [{ snippet: { channelId: 'UCabc123', channelTitle: 'БГ РП', title: 'На живо' } }],
      },
    },
  });
  const found = await discoverYouTube();
  assert.equal(found.length, 1);
  assert.equal(found[0].declaredBulgarian, false, 'иначе непроверен канал влиза публично');
  assert.equal(found[0].profileUrl, 'https://www.youtube.com/channel/UCabc123');
});

test('YouTube: един канал в два резултата се брои веднъж', async () => {
  stub({
    'googleapis.com': {
      body: {
        items: [
          { snippet: { channelId: 'UCabc', channelTitle: 'Х' } },
          { snippet: { channelId: 'UCabc', channelTitle: 'Х' } },
        ],
      },
    },
  });
  assert.equal((await discoverYouTube()).length, 1);
});

// ── ВРАЖДЕБЕН / счупен отговор ──────────────────────────────────────────────

test('чужд тип вместо масив не хвърля, а дава празен резултат', async () => {
  for (const hostile of [{ data: 'низ' }, { data: null }, {}, [], 'просто текст', 42]) {
    stub({ 'id.twitch.tv': token, 'api.twitch.tv': { body: hostile } });
    assert.deepEqual(await discoverTwitch(), [], `падна при ${JSON.stringify(hostile)}`);
  }
});

test('запис без задължително поле се пропуска, останалите минават', async () => {
  stub({
    'id.twitch.tv': token,
    'api.twitch.tv': {
      body: {
        data: [
          { user_name: 'без login' },
          { user_login: '', language: 'bg' },
          { user_login: 'ok', language: 'bg' },
          null,
          'боклук',
        ],
      },
    },
  });
  const found = await discoverTwitch();
  assert.equal(found.length, 1);
  assert.equal(found[0].channel, 'ok');
});

test('чуждото число минава през таван, чуждият текст — през чистене', async () => {
  stub({
    'id.twitch.tv': token,
    'api.twitch.tv': {
      body: {
        data: [
          {
            user_login: 'testbg',
            language: 'bg',
            viewer_count: 999_999_999_999,
            // Двупосочен маркер: с него чуждо заглавие обръща текста наоколо.
            title: 'нормално‮обърнато',
          },
        ],
      },
    },
  });
  const [found] = await discoverTwitch();
  assert.ok(found.viewers <= 10_000_000, `зрителите не са клампнати: ${found.viewers}`);
  assert.ok(!found.streamTitle?.includes('‮'), 'двупосочният маркер остана в заглавието');
});

test('`__proto__` в чуждия JSON не замърсява прототипа', async () => {
  stub({
    'id.twitch.tv': token,
    'api.twitch.tv': {
      body: JSON.parse('{"data":[{"user_login":"testbg","__proto__":{"полюция":true}}]}'),
    },
  });
  await discoverTwitch();
  assert.equal(({} as Record<string, unknown>).полюция, undefined, 'прототипът е замърсен');
});

// ── Kick: форматът на `language` не е документиран ──────────────────────────
// Kick описва параметъра само като „Language of the livestream“. Грешната
// стойност дава HTTP 200 с ПРАЗЕН списък — тоест изглежда като „никой не
// излъчва“, а не като грешка. Затова форматите се пробват по ред.

test('Kick пробва следващия формат на езика, ако първият върне празно', async () => {
  const seen: string[] = [];
  routes = {};
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('id.kick.com')) {
      return new Response(JSON.stringify({ access_token: 'т' }), { status: 200 });
    }
    if (url.includes('/categories')) {
      return new Response(JSON.stringify({ data: [{ id: 7, name: 'Grand Theft Auto V' }] }), { status: 200 });
    }
    const language = new URL(url).searchParams.get('language') ?? '';
    seen.push(language);
    // САМО пълното име дава редове — точно случаят, който чупеше откриването.
    const data = language === 'Bulgarian' ? [{ slug: 'bgkick', language: 'Bulgarian', viewer_count: 4 }] : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;

  const found = await discoverKick();
  assert.deepEqual(seen, ['bg', 'Bulgarian'], `пробваните формати: ${seen.join(', ')}`);
  assert.equal(found.length, 1, 'вторият формат трябваше да намери канала');
  assert.equal(found[0].channel, 'bgkick');
});

test('KICK_LANGUAGE заковава формата — една заявка, без пробване', async () => {
  const seen: string[] = [];
  process.env.KICK_LANGUAGE = 'Bulgarian';
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('id.kick.com')) return new Response(JSON.stringify({ access_token: 'т' }), { status: 200 });
    if (url.includes('/categories')) {
      return new Response(JSON.stringify({ data: [{ id: 7, name: 'gta v' }] }), { status: 200 });
    }
    seen.push(new URL(url).searchParams.get('language') ?? '');
    return new Response(JSON.stringify({ data: [{ slug: 'bgkick', language: 'Bulgarian' }] }), { status: 200 });
  }) as typeof fetch;

  await discoverKick();
  assert.deepEqual(seen, ['Bulgarian'], 'закованият формат не бива да пробва другите');
});
