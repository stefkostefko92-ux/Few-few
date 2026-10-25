/**
 * Седмичната купа (CONTRACT §17): седмицата е като `CupRules.WeekOf` в C# (същите вектори като xunit `CupTests`,
 * и при смяна на часа), константите са същите (тестът чете `.cs`), а страницата `/{език}/cup` носи таблицата, колко
 * остава, победителите, `Event` в JSON-LD и линковете от менюто, долния колонтитул и началото.
 */
import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CUP, CUP_BADGES, closedWeeks, cupWeek } from '../src/cup.js';
import { BADGE_KINDS } from '../src/data/honors.js';
import { CUP_JOB, CUP_SCHEDULE } from '../src/queue.js';
import { timeLeft, weekRange } from '../src/routes/cup.js';
import { PLAYER_ID, decode, fakeRepo, metaContent, sampleData, start } from './helpers.js';

const cs = (file: string) =>
  readFileSync(new URL(`../../plugins/src/CarbonStealth.Logic/${file}`, import.meta.url), 'utf8');
const SOFIA = 'Europe/Sofia';
const iso = (date: Date) => date.toISOString();

test('седмицата: понеделник 00:00 местно време — същите вектори като CupTests в C#', () => {
  const w = cupWeek(new Date('2026-10-28T12:00:00Z'), SOFIA);
  assert.deepEqual(
    [w.key, iso(w.start), iso(w.end)],
    ['2026-10-26', '2026-10-25T22:00:00.000Z', '2026-11-01T22:00:00.000Z'],
  );
  assert.equal(cupWeek(new Date('2026-11-01T21:59:59Z'), SOFIA).key, '2026-10-26');
  assert.equal(cupWeek(new Date('2026-11-01T22:00:00Z'), SOFIA).key, '2026-11-02');
  const autumn = cupWeek(new Date('2026-10-25T12:00:00Z'), SOFIA);
  assert.deepEqual(
    [autumn.key, iso(autumn.start), iso(autumn.end)],
    ['2026-10-19', '2026-10-18T21:00:00.000Z', '2026-10-25T22:00:00.000Z'],
  );
  assert.equal((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000, 169);
  const spring = cupWeek(new Date('2026-03-27T12:00:00Z'), SOFIA);
  assert.equal((spring.end.getTime() - spring.start.getTime()) / 3_600_000, 167);
  const utc = cupWeek(new Date('2026-10-25T23:30:00Z'), 'UTC');
  assert.equal(utc.key, '2026-10-19');
  assert.deepEqual(
    closedWeeks(new Date('2026-10-28T12:00:00Z'), SOFIA, 2).map((week) => week.key),
    ['2026-10-19', '2026-10-12'],
  );
});

test('константите са същите като CupRules в C#; значките са видове на профила', () => {
  const rules = cs('Cup.cs');
  assert.match(rules, new RegExp(`const int Podium = ${CUP.podium};`));
  assert.match(rules, new RegExp(`WinnerBadge = "${CUP_BADGES.winner}";`));
  assert.match(rules, new RegExp(`PodiumBadge = "${CUP_BADGES.podium}";`));
  assert.ok(BADGE_KINDS.includes(CUP_BADGES.winner) && BADGE_KINDS.includes(CUP_BADGES.podium));
  assert.equal(CUP_JOB, 'cup-awards');
  assert.match(CUP_SCHEDULE, /^\d{1,2} \* \* \* \*$/);
});

test('колко остава и обхватът на седмицата за показ', () => {
  const week = cupWeek(new Date('2026-10-28T12:00:00Z'), SOFIA);
  assert.deepEqual(timeLeft(week, new Date('2026-10-28T12:00:00Z')), { days: 4, hours: 10 });
  assert.deepEqual(timeLeft(week, new Date('2026-11-02T00:00:00Z')), { days: 0, hours: 0 });
  const range = weekRange('2026-10-26');
  assert.deepEqual(
    [iso(range.from), iso(range.to)],
    ['2026-10-26T12:00:00.000Z', '2026-11-01T12:00:00.000Z'],
  );
});

test('страницата: класиране, подиум, колко остава, победители и Event в JSON-LD', async () => {
  const data = sampleData();
  data.cup = [
    { place: 1, steamId: PLAYER_ID, name: 'Sandstorm', xp: 1520, matches: 6 },
    { place: 2, steamId: '76561198000000002', name: 'Rival', xp: 900, matches: 4 },
    { place: 4, steamId: '76561198000000004', name: '<b>Fourth</b>', xp: 120, matches: 1 },
  ];
  data.cupWinners = [{ week: '2026-10-19', steamId: PLAYER_ID, name: 'Sandstorm', xp: 2210 }];
  const app = await start({ repo: fakeRepo(data), now: () => new Date('2026-10-28T12:00:00Z') });
  try {
    for (const locale of ['bg', 'en', 'it'] as const) {
      const res = await app.get(`/${locale}/cup`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
      const keywords = metaContent(html, 'name', 'keywords') ?? '';
      assert.ok(keywords.split(',').length >= 5 && keywords.includes('Carbon Stealth'), locale);
      const ld = /<script type="application\/ld\+json" nonce="[^"]+">([\s\S]*?)<\/script>/.exec(
        html,
      );
      const graph = JSON.parse(ld?.[1] ?? '{}') as { '@graph': Array<Record<string, unknown>> };
      const event = graph['@graph'].find((node) => node['@type'] === 'Event');
      assert.ok(event, `${locale}: Event`);
      assert.equal(event.startDate, '2026-10-25T22:00:00.000Z');
      assert.equal(event.endDate, '2026-11-01T22:00:00.000Z');
      assert.equal(event.eventAttendanceMode, 'https://schema.org/OnlineEventAttendanceMode');
      assert.ok(graph['@graph'].some((node) => node['@type'] === 'BreadcrumbList'));
    }
    const raw = await (await app.get('/bg/cup')).text();
    assert.match(raw, /&lt;b&gt;Fourth&lt;\/b&gt;/, 'името се екранира');
    assert.doesNotMatch(raw, /<b>Fourth/);
    const bg = decode(raw);
    assert.match(bg, /<h1>Седмична купа<\/h1>/);
    assert.match(bg, /Седмица 26\.10\.2026 г\. – 1\.11\.2026 г\./);
    assert.match(bg, /Остават 4 д 10 ч/);
    assert.match(bg, /<tr class="is-podium">\s*<td class="c-num">1<\/td>/);
    assert.match(bg, /<a href="\/bg\/player\/76561198000000001">Sandstorm<\/a>/);
    assert.match(bg, /<td class="c-num">1520<\/td>/);
    assert.match(bg, /Последни победители/);
    assert.match(bg, /<strong>2210 XP<\/strong>/);
    assert.match(bg, /Седмица 19\.10\.2026 г\. – 25\.10\.2026 г\./);
    assert.match(bg, /\(Europe\/Sofia\)/);
  } finally {
    await app.close();
  }
});

test('празна седмица — празно състояние, без измислени победители', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = decode(await (await app.get('/en/cup')).text());
    assert.match(html, /No finished match with XP this week yet/);
    assert.match(html, /No finished week with a winner yet\./);
    assert.doesNotMatch(html, /class="data-table cup-table"/);
  } finally {
    await app.close();
  }
});

test('линковете: менюто, долният колонтитул, началото, !cup; профилът показва значките от купата', async () => {
  const data = sampleData();
  data.honors = {
    badges: [
      { kind: 'cup_winner', count: 2, lastAt: new Date('2026-10-26T00:10:00Z'), best: 2210 },
      { kind: 'cup_podium', count: 1, lastAt: new Date('2026-10-12T00:10:00Z'), best: 800 },
      { kind: 'mission_streak', count: 1, lastAt: new Date('2026-10-20T20:00:00Z'), best: 7 },
    ],
    duels: { wins: 0, losses: 0, draws: 0 },
  };
  const app = await start({ repo: fakeRepo(data) });
  try {
    const home = decode(await (await app.get('/bg/')).text());
    assert.ok((home.match(/href="\/bg\/cup"/g) ?? []).length >= 3, 'меню, колонтитул, карта');
    assert.match(home, /<code id="cmd-cup">!cup<\/code>/);
    assert.match(home, /Седмицата има победител/);
    const profile = decode(await (await app.get(`/bg/player/${PLAYER_ID}`)).text());
    assert.match(profile, /badge-cup_winner/);
    assert.match(profile, /Шампион на седмицата/);
    assert.match(profile, /Подиум на седмицата/);
    assert.match(profile, /най-много: 2210 XP за седмица/);
    assert.match(profile, /7 дни подред/);
    assert.match(profile, /рекорд: 7 дни подред/);
    const sitemap = await (await app.get('/sitemap.xml')).text();
    assert.match(sitemap, /<loc>https:\/\/cs2\.carbonstealth\.eu\/it\/cup<\/loc>/);
    const llms = await (await app.get('/llms.txt')).text();
    assert.match(llms, /## Weekly cup/);
    assert.match(llms, /## Daily missions/);
    const redirect = await app.get('/cup');
    assert.equal(redirect.headers.get('location'), '/bg/cup');
  } finally {
    await app.close();
  }
});
