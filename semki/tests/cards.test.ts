import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seedCards, weakestCard } from '../src/domain/cards.js';
import { HEALTH_LEGEND } from '../src/domain/health.js';
import { buildAlertParts } from '../src/domain/messages.js';
import { SEED_KEYS } from '../src/domain/seeds.js';
import { cardPayload, SEEDS_DIR } from '../src/discord/cards.js';
import type { BatchLike } from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';

const now = new Date('2026-11-04T10:00:00Z');
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const labels = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};
const batch = (
  id: number,
  key: string,
  percent: number,
  count = 3,
  anchoredAt = now,
): BatchLike => ({
  id,
  seedTypeKey: key,
  count,
  percent,
  anchoredAt,
  rate,
});

test('снимките: за всеки вид × всяка степен на здраве има JPEG в assets/seeds', () => {
  for (const key of SEED_KEYS)
    for (const l of HEALTH_LEGEND) {
      const buf = readFileSync(path.join(SEEDS_DIR, `${key}-${l.stage}.jpg`));
      assert.ok(buf.length > 4000, `${key}-${l.stage} е празна`);
      assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], `${key}-${l.stage} не е JPEG`);
    }
});

test('карти: по една за вид, по реда на видовете, здравето на най-слабата партида', () => {
  const cards = seedCards(
    [batch(1, 'skunk', 80), batch(2, 'ak', 40, 4), batch(3, 'ak', 9, 2), batch(4, 'ak', 70)],
    labels,
    now,
  );
  assert.deepEqual(
    cards.map((c) => c.file),
    ['ak-rotting.jpg', 'skunk-fresh.jpg'],
  );
  const ak = cards[0];
  assert.ok(ak);
  assert.equal(ak.title, 'AK — Гние');
  assert.equal(ak.text, '3 партиди, 9 семки · най-слабата #3 — 9,00%');
  assert.equal(ak.color, 0xd95926);
  assert.equal(cards[1]?.text, '1 партида, 3 семки · #1 — 80,00%');
});

test('карти: изтеклите — „изтекла“; непознат вид — без карта', () => {
  const old = new Date(now.getTime() - 10 * HOUR_MS);
  const [dead] = seedCards([batch(1, 'purple', 3, 1, old)], labels, now);
  assert.equal(dead?.file, 'purple-dead.jpg');
  assert.equal(dead?.title, 'Purple — Изтекла');
  assert.equal(dead?.text, '1 партида, 1 семка · всички са изтекли');
  assert.deepEqual(seedCards([batch(2, 'haze', 50)], labels, now), []);
});

test('/infosemki: една снимка — партидата с най-нисък процент от всички видове', () => {
  const card = weakestCard(
    [batch(1, 'skunk', 80), batch(2, 'ak', 40), batch(3, 'purple', 12), batch(4, 'ak', 30)],
    labels,
    now,
  );
  assert.equal(card?.file, 'purple-spoiling.jpg');
  assert.equal(card?.title, 'Най-нисък процент: Purple #3 — 12,00% · Разваля се');
  assert.equal(card?.text, '');
  assert.equal(weakestCard([], labels, now), null);
});

test('/infosemki: изтеклите не скриват живите; ако всички са изтекли — снимката на изтекла', () => {
  const old = new Date(now.getTime() - 10 * HOUR_MS);
  const live = weakestCard([batch(1, 'ak', 2, 1, old), batch(2, 'ogkush', 55)], labels, now);
  assert.equal(live?.file, 'ogkush-healthy.jpg');
  const dead = weakestCard([batch(1, 'ak', 2, 1, old)], labels, now);
  assert.equal(dead?.file, 'ak-dead.jpg');
  assert.equal(dead?.title, 'Всички са изтекли: AK #1');
  assert.equal(weakestCard([batch(9, 'haze', 5)], labels, now), null);
});

test('известието носи картите на видовете в своята част', () => {
  const rule = {
    id: 1,
    kind: 'PERCENT' as const,
    threshold: 20,
    seedTypeKey: null,
    channelId: '1',
    roleId: '2',
    enabled: true,
    repeatMinutes: null,
    message: null,
  };
  const [part] = buildAlertParts(
    {
      channelId: '1',
      roleId: '2',
      message: null,
      items: [{ batch: batch(5, 'purple', 18), rule }],
    },
    labels,
    now,
  );
  assert.deepEqual(
    part?.cards.map((c) => c.file),
    ['purple-spoiling.jpg'],
  );
});

test('прикачването: файл + карта със снимката; липсващ или странен файл се пропуска', () => {
  const [card] = seedCards([batch(1, 'ogkush', 60)], labels, now);
  assert.ok(card);
  const p = cardPayload([card]);
  assert.equal(p.files.length, 1);
  assert.equal(p.files[0]?.name, 'ogkush-healthy.jpg');
  assert.equal(p.embeds[0]?.image?.url, 'attachment://ogkush-healthy.jpg');
  assert.equal(p.embeds[0]?.title, 'OG Kush — Здрава');
  assert.deepEqual(cardPayload([{ ...card, file: '../secret.jpg' }]), { files: [], embeds: [] });
  assert.deepEqual(cardPayload([card], '/няма/такава'), { files: [], embeds: [] });
});

test('прикачването: карта без текст (/infosemki) не праща празно описание — Discord го отказва', () => {
  const weakest = weakestCard([batch(1, 'ogkush', 60)], labels, now);
  assert.ok(weakest);
  const [embed] = cardPayload([weakest]).embeds;
  assert.ok(embed);
  assert.equal('description' in embed, false);
  assert.equal(embed.image?.url, 'attachment://ogkush-healthy.jpg');
});
