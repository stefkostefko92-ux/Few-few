import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LOCALES, translate, type Locale } from '../src/i18n.js';
import { PAGES } from '../src/content.js';
import {
  LIVE_KNOWN,
  PLAYER_ID,
  decode,
  fakeRepo,
  fixedLive,
  metaContent,
  sampleData,
  start,
} from './helpers.js';

const BASE = 'https://cs2.carbonstealth.eu';
const SLUGS = [
  '',
  'leaderboard',
  'matches',
  'match/41',
  `match/41/player/${PLAYER_ID}`,
  `player/${PLAYER_ID}`,
  'bans',
  'vip',
  'rules',
  'privacy',
  'vip-terms',
  'imprint',
  'contact',
];

interface Graph {
  '@context': string;
  '@graph': Array<Record<string, unknown>>;
}

function jsonLd(html: string): Graph {
  const found = /<script type="application\/ld\+json" nonce="[^"]+">([\s\S]*?)<\/script>/.exec(
    html,
  );
  assert.ok(found, 'липсва JSON-LD');
  return JSON.parse(found[1] ?? '') as Graph;
}

/** „бот/ботове“ и „bot/bots“ като дума — без „работи“, „robots“, „aimbot“, „triggerbots“. */
const BOT_WORD = /(?<![а-яё])бот|\bbots?\b/iu;

function types(graph: Graph): string[] {
  return graph['@graph'].map((node) => String(node['@type']));
}

test('всяка страница на всеки език носи пълния SEO head', async () => {
  const app = await start({ repo: fakeRepo(sampleData()), live: fixedLive(LIVE_KNOWN) });
  try {
    for (const locale of LOCALES) {
      const titles = new Set<string>();
      for (const slug of SLUGS) {
        const path = `/${locale}/${slug}`;
        const response = await app.get(path);
        assert.equal(response.status, 200, path);
        const html = await response.text();
        const where = `${path}`;

        const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '');
        assert.ok(
          title.length > 10 && title.length < 60,
          `${where}: заглавие ${title.length} знака`,
        );
        assert.ok(!titles.has(title), `${where}: заглавието се повтаря`);
        titles.add(title);

        const description = metaContent(html, 'name', 'description') ?? '';
        assert.ok(
          description.length >= 70 && description.length < 160,
          `${where}: описание ${description.length} знака`,
        );

        const keywords = (metaContent(html, 'name', 'keywords') ?? '')
          .split(',')
          .map((word) => word.trim())
          .filter(Boolean);
        assert.ok(keywords.length >= 5, `${where}: ${keywords.length} ключови думи`);
        assert.ok(keywords.includes('Carbon Stealth'), `${where}: без „Carbon Stealth“`);

        assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${where}: точно един H1`);
        // Решение на собственика: публичният сайт не споменава ботове (LIVE_KNOWN има 3 бота).
        assert.doesNotMatch(html, BOT_WORD, `${where}: споменава ботове`);
        assert.match(html, new RegExp(`<html lang="${locale}">`));

        const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1];
        assert.equal(canonical, `${BASE}${path}`, `${where}: canonical`);
        for (const code of LOCALES) {
          assert.match(
            html,
            new RegExp(`<link rel="alternate" hreflang="${code}" href="${BASE}/${code}/${slug}">`),
            `${where}: hreflang ${code}`,
          );
        }
        assert.match(
          html,
          new RegExp(`<link rel="alternate" hreflang="x-default" href="${BASE}/bg/${slug}">`),
          `${where}: x-default → bg`,
        );

        assert.equal(metaContent(html, 'property', 'og:title'), title);
        assert.equal(metaContent(html, 'property', 'og:url'), `${BASE}${path}`);
        assert.equal(metaContent(html, 'property', 'og:image'), `${BASE}/static/og.png`);
        assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');

        const graph = jsonLd(html);
        assert.equal(graph['@context'], 'https://schema.org');
        const kinds = types(graph);
        for (const kind of ['Organization', 'WebSite', 'BreadcrumbList']) {
          assert.ok(kinds.includes(kind), `${where}: JSON-LD без ${kind}`);
        }
        const org = graph['@graph'].find((node) => node['@type'] === 'Organization');
        assert.equal(org?.name, 'Carbon Stealth VCC');
        assert.equal(org?.url, 'https://carbonstealth.eu');

        // Подписът в долния колонтитул — на всяка страница, непреведен.
        assert.match(
          html,
          /<a href="https:\/\/carbonstealth\.eu" target="_blank" rel="noopener">Created and Designed by Carbon Stealth VCC<\/a>/,
          `${where}: подписът на Carbon Stealth VCC`,
        );

        for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
          assert.match(tag, /\salt="/, `${where}: img без alt`);
          assert.match(tag, /\swidth="\d+"/, `${where}: img без width`);
          assert.match(tag, /\sheight="\d+"/, `${where}: img без height`);
        }
        // Строгият CSP (style-src 'self') спира inline стилове — не бива да ги има.
        assert.doesNotMatch(html, /\sstyle="/, `${where}: inline стил`);
      }
    }
  } finally {
    await app.close();
  }
});

test('началото има GameServer със статус само когато е известен, и FAQPage', async () => {
  for (const [live, expectStatus] of [
    [LIVE_KNOWN, true],
    [{ known: false } as const, false],
  ] as const) {
    const app = await start({ repo: fakeRepo(sampleData()), live: fixedLive(live) });
    try {
      const html = await (await app.get('/bg/')).text();
      const graph = jsonLd(html);
      const server = graph['@graph'].find((node) => node['@type'] === 'GameServer');
      assert.ok(server, 'липсва GameServer');
      assert.deepEqual(server.game, { '@type': 'VideoGame', name: 'Counter-Strike 2' });
      assert.equal('serverStatus' in server, expectStatus);
      assert.equal('playersOnline' in server, expectStatus);
      if (expectStatus) {
        assert.equal(server.serverStatus, 'https://schema.org/Online');
        assert.equal(server.playersOnline, 7);
        assert.match(html, /7\/20/);
      } else {
        assert.match(html, new RegExp(translate('bg', 'home.status.unknown')));
        assert.doesNotMatch(html, new RegExp(translate('bg', 'home.status.live')));
      }
      const faq = graph['@graph'].find((node) => node['@type'] === 'FAQPage') as
        { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> } | undefined;
      assert.ok(faq && faq.mainEntity.length >= 5);
      // Въпросите в JSON-LD са дума по дума тези на екрана (H3).
      for (const item of faq.mainEntity) {
        assert.ok(decode(html).includes(`<h3>${item.name}</h3>`), `въпросът не е H3: ${item.name}`);
      }
    } finally {
      await app.close();
    }
  }
});

test('пълен сървър → OnlineFull', async () => {
  const app = await start({
    repo: fakeRepo(sampleData()),
    live: fixedLive({ ...LIVE_KNOWN, humans: 20, maxPlayers: 20 }),
  });
  try {
    const graph = jsonLd(await (await app.get('/en/')).text());
    const server = graph['@graph'].find((node) => node['@type'] === 'GameServer');
    assert.equal(server?.serverStatus, 'https://schema.org/OnlineFull');
  } finally {
    await app.close();
  }
});

test('банлистът е noindex (мета и заглавие), останалите се индексират', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const bans = await app.get('/en/bans');
    assert.equal(bans.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(metaContent(await bans.text(), 'name', 'robots'), 'noindex, follow');
    const vip = await app.get('/en/vip');
    assert.equal(vip.headers.get('x-robots-tag'), null);
    assert.match(metaContent(await vip.text(), 'name', 'robots') ?? '', /^index/);
  } finally {
    await app.close();
  }
});

test('заглавията и описанията в речниците са под таваните', () => {
  for (const locale of LOCALES as readonly Locale[]) {
    for (const page of [...PAGES, 'notFound', 'serverError', 'tooMany'] as const) {
      const title = translate(locale, `meta.${page}.title`);
      const description = translate(locale, `meta.${page}.description`);
      assert.ok(title.length < 60, `${locale}/${page}: заглавие ${title.length}`);
      assert.ok(description.length < 160, `${locale}/${page}: описание ${description.length}`);
    }
  }
});

test('дълъг ник не пробива тавана на заглавието и описанието на профила', async () => {
  const data = sampleData();
  const long = 'Ж'.repeat(64);
  data.players = data.players.map((p) => ({ ...p, name: long }));
  const app = await start({ repo: fakeRepo(data) });
  try {
    for (const locale of LOCALES) {
      const html = await (await app.get(`/${locale}/player/${PLAYER_ID}`)).text();
      const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '');
      const description = metaContent(html, 'name', 'description') ?? '';
      assert.ok([...title].length < 60, `${locale}: ${title.length}`);
      assert.ok([...description].length < 160, `${locale}: ${description.length}`);
      assert.ok(title.includes('Ж'), 'името остава в заглавието');
    }
  } finally {
    await app.close();
  }
});

test('robots.txt, sitemap.xml с lastmod и hreflang, llms.txt', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const robots = await (await app.get('/robots.txt')).text();
    assert.match(robots, /Sitemap: https:\/\/cs2\.carbonstealth\.eu\/sitemap\.xml/);
    assert.doesNotMatch(
      robots,
      /Disallow: \/(bg|en|it)?\/?bans/,
      'noindex се вижда само ако не е забранено',
    );

    const sitemap = await (await app.get('/sitemap.xml')).text();
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /<loc>https:\/\/cs2\.carbonstealth\.eu\/bg\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/cs2\.carbonstealth\.eu\/it\/vip-terms<\/loc>/);
    assert.match(
      sitemap,
      new RegExp(`<loc>https://cs2\\.carbonstealth\\.eu/en/player/${PLAYER_ID}</loc>`),
    );
    assert.doesNotMatch(sitemap, /\/bans</, 'банлистът не е в sitemap');
    const urls = sitemap.match(/<url>/g) ?? [];
    assert.equal(
      urls.length,
      (sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length,
    );
    assert.match(sitemap, /hreflang="x-default"/);

    const llms = await (await app.get('/llms.txt')).text();
    assert.match(llms, /^# CarbonStealth\.eu \| Dust2 DM/);
    assert.match(llms, /connect dm\.carbonstealth\.eu:27015/);
    assert.match(llms, /https:\/\/carbonstealth\.eu/);
    assert.doesNotMatch(llms, BOT_WORD, 'llms.txt споменава ботове');

    const key = readFileSync('public/indexnow-key.txt', 'utf8').trim();
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.equal((await (await app.get('/indexnow-key.txt')).text()).trim(), key);
    assert.equal((await (await app.get(`/${key}.txt`)).text()).trim(), key);
  } finally {
    await app.close();
  }
});

test('адреси без език водят към езиковия вариант (съобщението за бан сочи /bans)', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const root = await app.get('/', { 'accept-language': 'it-IT,it;q=0.9' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/it/');
    const bans = await app.get('/bans?page=2', { 'accept-language': 'en' });
    assert.equal(bans.headers.get('location'), '/en/bans?page=2');
    const player = await app.get(`/player/${PLAYER_ID}`);
    assert.equal(player.headers.get('location'), `/bg/player/${PLAYER_ID}`);
    const bare = await app.get('/en');
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/en/');
    const slash = await app.get('/en/rules/');
    assert.equal(slash.headers.get('location'), '/en/rules');
  } finally {
    await app.close();
  }
});

test('404 и 500 са страници на езика на заявката, noindex', async () => {
  const repo = fakeRepo(sampleData());
  const app = await start({
    repo: { ...repo, vipTiers: async () => Promise.reject(new Error('паднала база')) },
  });
  try {
    const missing = await app.get('/it/nessuna-pagina');
    assert.equal(missing.status, 404);
    const html404 = await missing.text();
    assert.match(html404, /<html lang="it">/);
    assert.match(
      html404,
      new RegExp(translate('it', 'error.notFound.heading').replace(/'/g, '&#39;')),
    );
    assert.equal(metaContent(html404, 'name', 'robots'), 'noindex, follow');

    const broken = await app.get('/en/vip');
    assert.equal(broken.status, 500);
    const html500 = await broken.text();
    assert.match(html500, new RegExp(translate('en', 'error.serverError.heading')));
    assert.doesNotMatch(html500, /паднала база/, 'вътрешната грешка не стига до посетителя');
  } finally {
    await app.close();
  }
});

test('сигурност: строг CSP, без бисквитки, само GET/HEAD', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const response = await app.get('/bg/');
    const csp = response.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(response.headers.get('set-cookie'), null, 'сайтът не слага бисквитки');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const post = await fetch(`${app.base}/bg/`, { method: 'POST' });
    assert.equal(post.status, 405);
  } finally {
    await app.close();
  }
});
