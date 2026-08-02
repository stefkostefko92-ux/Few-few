import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  channelKey,
  clampViewers,
  compareStreamers,
  groupByPlatform,
  isBulgarianLanguage,
  isStreamPlatform,
  MAX_VIEWERS,
  normalizeChannel,
  PLATFORM_BADGE,
  profileUrl,
  STREAM_PLATFORMS,
} from '../streamers';

// ── Нормализиране на канала ─────────────────────────────────────────────────

test('цял адрес, „@име“ и голо име дават ЕДИН ключ', () => {
  const expected = 'galaxyrp';
  for (const input of [
    'https://www.twitch.tv/GalaxyRP',
    'https://twitch.tv/galaxyrp/',
    '@GalaxyRP',
    'GalaxyRP',
    '  galaxyrp  ',
  ]) {
    assert.equal(normalizeChannel('TWITCH', input), expected, `разминаване за „${input}“`);
  }
});

test('YouTube пази регистъра в АДРЕСА — UCxxx и ucxxx сочат различни страници', () => {
  assert.equal(normalizeChannel('YOUTUBE', 'UCabcDEF123'), 'UCabcDEF123');
  assert.equal(normalizeChannel('YOUTUBE', 'https://www.youtube.com/@BulgarRP'), 'BulgarRP');
});

test('РЕГРЕСИЯ: ключът за уникалност НЕ различава регистър — иначе свален канал се връща', () => {
  // Докато уникалността беше по `channel`, „UCabc“ и „ucabc“ бяха два реда:
  // единият свален по чл. 21, другият — нов и публичен.
  assert.equal(channelKey(normalizeChannel('YOUTUBE', 'UCabc123')!), 'ucabc123');
  assert.equal(channelKey(normalizeChannel('YOUTUBE', 'ucABC123')!), 'ucabc123');
  assert.equal(
    channelKey(normalizeChannel('YOUTUBE', 'https://www.youtube.com/channel/UCabc123')!),
    channelKey(normalizeChannel('YOUTUBE', 'ucabc123')!),
  );
});

test('РЕГРЕСИЯ: адрес с подраздел дава СВОЯ канал, не последната част от пътя', () => {
  // Взимаше се последната част → „twitch.tv/galaxyrp/videos“ ставаше канал
  // „videos“, тоест линк към чужд/несъществуващ канал.
  assert.equal(normalizeChannel('TWITCH', 'https://www.twitch.tv/galaxyrp/videos'), 'galaxyrp');
  assert.equal(normalizeChannel('KICK', 'https://kick.com/kickbg/clips'), 'kickbg');
  assert.equal(normalizeChannel('TWITCH', 'https://www.twitch.tv/galaxyrp/clip/AbcDef'), 'galaxyrp');
  assert.equal(
    normalizeChannel('YOUTUBE', 'https://www.youtube.com/channel/UCabc/streams'),
    'UCabc',
  );
  assert.equal(normalizeChannel('YOUTUBE', 'https://www.youtube.com/c/BulgarRP'), 'BulgarRP');
  assert.equal(normalizeChannel('YOUTUBE', 'https://www.youtube.com/user/BulgarRP'), 'BulgarRP');
});

test('РЕГРЕСИЯ: служебен път не става канал', () => {
  for (const bad of [
    'https://www.twitch.tv/videos/1234567',
    'https://www.twitch.tv/directory/game/Grand%20Theft%20Auto%20V',
    'https://www.youtube.com/watch',
    'videos',
    '@clips',
  ]) {
    assert.equal(normalizeChannel('TWITCH', bad), null, `прие „${bad}“`);
  }
});

test('боклук не става канал', () => {
  for (const bad of ['', '   ', '@', 'a', 'има интервал', 'сървър/../../etc', '<script>']) {
    assert.equal(normalizeChannel('TWITCH', bad), null, `прие „${bad}“`);
  }
});

test('дългият вход се отхвърля, не се реже — рязането прави чужд канал', () => {
  assert.equal(normalizeChannel('TWITCH', 'a'.repeat(65)), null);
  assert.equal(normalizeChannel('TWITCH', 'a'.repeat(64)), 'a'.repeat(64));
});

// ── Адреси ──────────────────────────────────────────────────────────────────

test('YouTube ID върви по /channel/, handle — по /@', () => {
  assert.equal(profileUrl('YOUTUBE', 'UCabc'), 'https://www.youtube.com/channel/UCabc');
  assert.equal(profileUrl('YOUTUBE', 'bulgarrp'), 'https://www.youtube.com/@bulgarrp');
});

test('всяка платформа има адрес и значка', () => {
  for (const platform of STREAM_PLATFORMS) {
    assert.ok(profileUrl(platform, 'test').startsWith('https://'), `${platform}: не е https`);
    assert.ok(PLATFORM_BADGE[platform], `${platform}: липсва значка`);
    assert.ok(isStreamPlatform(platform));
  }
  assert.equal(isStreamPlatform('MYSPACE'), false);
});

// ── Език ────────────────────────────────────────────────────────────────────

test('езикът се приема само когато е обявен български', () => {
  for (const yes of ['bg', 'BG', 'bg-BG', 'Bulgarian', ' bulgarian ']) {
    assert.equal(isBulgarianLanguage(yes), true, `отхвърли „${yes}“`);
  }
  // Празно/непознато НЕ е български: тези записи трябва да чакат човек, не да
  // влизат публично. Кирилицата пак не е признак — руският я има.
  for (const no of [null, undefined, '', 'en', 'ru', 'uk', 'bgr', 'bulgaria']) {
    assert.equal(isBulgarianLanguage(no), false, `прие „${no}“`);
  }
});

// ── Зрители ─────────────────────────────────────────────────────────────────

test('чуждата бройка минава през таван — иначе препълва int4', () => {
  assert.equal(clampViewers(42), 42);
  assert.equal(clampViewers(12.7), 12);
  assert.equal(clampViewers(999_999_999_999), MAX_VIEWERS);
  for (const bad of [-1, NaN, Infinity, undefined]) {
    assert.equal(clampViewers(bad as number), 0, `прие ${bad}`);
  }
});

// ── Подредба и групиране ────────────────────────────────────────────────────

const streamer = (displayName: string, live: boolean, viewers: number, platform: 'TWITCH' | 'KICK' = 'TWITCH') =>
  ({ displayName, live, viewers, platform }) as const;

test('на живо изпреварва изгасналия, независимо от зрителите', () => {
  const off = streamer('Аз', false, 9000);
  const on = streamer('Ти', true, 1);
  assert.ok(compareStreamers(on, off) < 0);
  assert.ok(compareStreamers(off, on) > 0);
});

test('при равен статус решават зрителите, после азбуката', () => {
  assert.ok(compareStreamers(streamer('А', true, 10), streamer('Б', true, 5)) < 0);
  assert.ok(compareStreamers(streamer('Ани', true, 5), streamer('Боби', true, 5)) < 0);
});

test('групирането пази ОБЯВЕНИЯ ред на платформите и маха празните секции', () => {
  const groups = groupByPlatform([
    streamer('Kick човек', true, 3, 'KICK'),
    streamer('Twitch човек', false, 0, 'TWITCH'),
  ]);
  assert.deepEqual(
    groups.map((group) => group.platform),
    ['TWITCH', 'KICK'],
    'редът трябва да е фиксиран, не по брой — иначе страницата подскача',
  );
  assert.equal(groups.length, 2, 'празните платформи не бива да излизат');
});

test('вътре в секцията подредбата е по compareStreamers', () => {
  const [group] = groupByPlatform([
    streamer('Трети', false, 0),
    streamer('Първи', true, 100),
    streamer('Втори', true, 5),
  ]);
  assert.deepEqual(
    group.streamers.map((s) => s.displayName),
    ['Първи', 'Втори', 'Трети'],
  );
});
