/**
 * Мисиите за деня (CONTRACT §16): пулът, хешът и изборът са същите като в C# — тестът чете `Missions.cs` и
 * `Progression.cs`, вместо да вярва на копие, и проверява същите вектори като xunit (`MissionTests`). Плюс денят в
 * DISPLAY_TZ и показът: профилът (<progress>), началото и „Как се смята“.
 */
import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LOCALES, translate } from '../src/i18n.js';
import { MISSIONS, missionXp } from '../src/levels.js';
import { MISSION_KINDS, MISSION_POOL, assignMissions, fnv1a, missionDay } from '../src/missions.js';
import { PLAYER_ID, decode, fakeRepo, sampleData, start } from './helpers.js';

const LOGIC = new URL('../../plugins/src/CarbonStealth.Logic/', import.meta.url);
const cs = (file: string) => readFileSync(new URL(file, LOGIC), 'utf8');

test('пулът е същият като MissionPool в C# — ключ, вид, цел, трудност, ред', () => {
  const parsed = [
    ...cs('Missions.cs').matchAll(/new\("([a-z]+)_(\d+)", MissionKind\.(\w+), (\d+), (\d)\)/g),
  ].map(([, kind, suffix, kindName, target, tier]) => {
    assert.equal(kindName?.toLowerCase(), kind);
    assert.equal(suffix, target);
    return `${tier}:${kind}_${target}`;
  });
  const ours = MISSION_POOL.flatMap((pool, tier) =>
    pool.map((def) => {
      assert.equal(def.tier, tier);
      assert.equal(def.key, `${def.kind}_${def.target}`);
      return `${tier}:${def.key}`;
    }),
  );
  assert.deepEqual(ours, parsed);
  const kinds = [...cs('Missions.cs').matchAll(/^ {4}(\w+),$/gm)].map(([, k]) => k?.toLowerCase());
  assert.deepEqual([...MISSION_KINDS], kinds);
});

test('XP по трудност и серията — същите като Progression/MissionPool в C#', () => {
  const progression = cs('Progression.cs');
  const constant = (name: string) =>
    Number(new RegExp(`const int ${name} = (\\d+);`).exec(progression)?.[1]);
  assert.deepEqual(
    [...MISSIONS.xp],
    [constant('MissionEasyXp'), constant('MissionMediumXp'), constant('MissionHardXp')],
  );
  assert.deepEqual([0, 1, 2, 3].map(missionXp), [50, 100, 150, 0]);
  assert.match(cs('Missions.cs'), new RegExp(`StreakBadgeDays = ${MISSIONS.streakDays};`));
  assert.match(cs('Missions.cs'), new RegExp(`PerDay = ${MISSIONS.perDay};`));
});

test('FNV-1a 32 и изборът — същите вектори като xunit', () => {
  assert.equal(fnv1a(''), 2166136261);
  assert.equal(fnv1a('a'), 3826002220);
  assert.equal(fnv1a('foobar'), 3214735720);
  assert.equal(fnv1a('76561198000000001:2026-10-25:0'), 4140767131);
  const keys = (steamId: string, day: string) => assignMissions(steamId, day).map((d) => d.key);
  assert.deepEqual(keys('76561198000000001', '2026-10-25'), [
    'pistol_10',
    'minutes_60',
    'headshots_50',
  ]);
  assert.deepEqual(keys('76561198000000001', '2026-10-26'), [
    'headshots_10',
    'headshots_25',
    'wanted_1',
  ]);
  assert.deepEqual(keys('76561190000986101', '2026-10-25'), [
    'pistol_10',
    'headshots_25',
    'headshots_50',
  ]);
  assert.deepEqual(keys('76561197960265728', '2026-03-29'), ['smg_10', 'zone_3', 'streak_10']);
  assert.deepEqual(
    assignMissions('76561198000000001', '2026-10-25').map((d) => d.xp),
    [50, 100, 150],
  );
});

test('денят е местната дата в София — и при смяна на часа (като DayOf в C#)', () => {
  const day = (iso: string) => missionDay(new Date(iso), 'Europe/Sofia');
  assert.equal(day('2026-07-01T21:59:00Z'), '2026-07-02');
  assert.equal(day('2026-07-01T20:59:00Z'), '2026-07-01');
  assert.equal(day('2026-12-01T22:00:00Z'), '2026-12-02');
  assert.equal(day('2026-12-01T21:59:00Z'), '2026-12-01');
  assert.equal(day('2026-10-25T01:30:00Z'), '2026-10-25');
});

test('всеки вид мисия има текст на трите езика', () => {
  for (const locale of LOCALES) {
    for (const kind of MISSION_KINDS) {
      const text = translate(locale, `missions.kinds.${kind}`, { target: 7 });
      assert.ok(!text.startsWith('missions.'), `${locale}: ${kind}`);
    }
  }
});

test('профилът: трите мисии с <progress>, изпълнената и броят за срока', async () => {
  const data = sampleData();
  const today = assignMissions(PLAYER_ID, '2026-10-25');
  data.missions = {
    day: '2026-10-25',
    today: today.map((def, index) => ({
      ...def,
      progress: index === 0 ? def.target : index === 2 ? 12 : 0,
      done: index === 0,
    })),
    completed: 11,
  };
  const app = await start({ repo: fakeRepo(data) });
  const fresh = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = decode(await (await app.get(`/bg/player/${PLAYER_ID}`)).text());
    assert.match(html, /<h2 id="missions-title">Мисии за днес<\/h2>/);
    assert.match(html, /<progress id="mission-0" max="10" value="10">/);
    assert.match(html, /<progress id="mission-1" max="60" value="0">/);
    assert.match(html, /<progress id="mission-2" max="50" value="12">/);
    assert.match(html, /<li class="is-done">/);
    assert.match(html, /Лесна · \+50 XP/);
    assert.match(html, /10 убийства с пистолет/);
    assert.match(html, /Играй 60 минути/);
    assert.match(html, /12 от 50/);
    assert.match(html, /Изпълнени 11 мисии за последните 90 дни\./);
    assert.match(html, /\(Europe\/Sofia\)/);
    const en = decode(await (await fresh.get(`/en/player/${PLAYER_ID}`)).text());
    assert.equal((en.match(/<progress id="mission-\d"/g) ?? []).length, 3);
    assert.match(en, /0 missions completed in the last 90 days\./);
  } finally {
    await app.close();
    await fresh.close();
  }
});

test('началото и „Как се смята“: мисиите с XP от константите', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const home = decode(await (await app.get('/bg/')).text());
    assert.match(home, /<h2 id="daily-title">Всеки ден\. Всяка седмица\.<\/h2>/);
    assert.match(home, /\+50 \/ \+100 \/ \+150 XP/);
    assert.match(home, /и трите 7 дни подред — значка в профила/);
    assert.match(home, /<code id="cmd-missions">!missions<\/code>/);
    const board = decode(await (await app.get('/bg/leaderboard')).text());
    assert.match(
      board,
      /<th scope="row">Мисия за деня — лесна \/ средна \/ трудна<\/th><td class="c-num">\+50 \/ \+100 \/ \+150<\/td>/,
    );
    assert.match(board, /всеки ден в полунощ \(Europe\/Sofia\) всеки получава три/);
    assert.match(board, /значката „7 дни подред“/);
  } finally {
    await app.close();
  }
});
