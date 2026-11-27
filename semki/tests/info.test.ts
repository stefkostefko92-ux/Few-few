import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BatchLike } from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';
import {
  buildInfoEmbeds,
  EMBED_TEXT_LIMIT,
  EMBEDS_PER_MESSAGE,
  infoAsText,
  MESSAGE_EMBEDS_LIMIT,
  type InfoEmbed,
} from '../src/domain/info.js';
import { MESSAGE_LIMIT } from '../src/domain/messages.js';
import { infoPayload } from '../src/discord/cards.js';

const now = new Date('2026-11-27T21:14:00Z');
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const labels = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};
const batch = (id: number, key: string, percent: number, count: number, anchoredAt = now) =>
  ({ id, seedTypeKey: key, count, percent, anchoredAt, rate }) satisfies BatchLike;
const lines = (e: InfoEmbed) => e.description.split('\n');
const size = (e: InfoEmbed) => e.title.length + e.description.length + (e.footer?.length ?? 0);

test('/infosemki: празно — само текст', () => {
  assert.deepEqual(buildInfoEmbeds([], labels, now), [
    { content: 'Няма въведени семки.', embeds: [] },
  ]);
});

test('/infosemki: карта за всеки вид — сборът в заглавието, всяка партида на ред, снимката на най-ниската', () => {
  const old = new Date(now.getTime() - 200 * HOUR_MS);
  const [msg, ...more] = buildInfoEmbeds(
    [batch(76, 'ak', 98.69, 118), batch(3, 'skunk', 40, 2, old), batch(69, 'ak', 33.86, 202)],
    labels,
    now,
  );
  assert.equal(more.length, 0);
  assert.ok(msg);
  assert.equal(msg.content, '**Общо** — 322 семки в 3 партиди');
  // по реда на видовете, не по реда на въвеждане
  assert.deepEqual(
    msg.embeds.map((e) => e.title),
    ['AK — 320 семки в 2 партиди · 0,6% на 60 мин', 'Skunk — 2 семки в 1 партида · 0,6% на 60 мин'],
  );
  const [ak, skunk] = msg.embeds;
  assert.ok(ak && skunk);
  // първо изтичащата; без номера на партидата
  assert.deepEqual(
    lines(ak).map((l) => l.replace(/<t:\d+:[fR]>/g, '<t>')),
    [
      '🟠 **202 семки** · Остарява · **33,86%** · остават 2 д 8 ч 26 мин · изтича <t> (<t>)',
      '🟢 **118 семки** · Свежа · **98,69%** · остават 6 д 20 ч 29 мин · изтича <t> (<t>)',
    ],
  );
  assert.equal(ak.image, 'ak-aging.jpg');
  assert.equal(ak.footer, 'На снимката: най-ниската — 202 семки, 33,86% (Остарява)');
  assert.equal(ak.color, 0xd95926);
  // само изтекли — снимката е на изтекло семе
  assert.deepEqual(lines(skunk), ['⚫ **2 семки** · Изтекла']);
  assert.equal(skunk.image, 'skunk-dead.jpg');
  assert.equal(skunk.footer, 'На снимката: изтекли семки');
  for (const e of msg.embeds) assert.doesNotMatch(e.description, /#\d/);
});

test('/infosemki: изтеклите не заемат снимката, докато видът има живи', () => {
  const old = new Date(now.getTime() - 200 * HOUR_MS);
  const [msg] = buildInfoEmbeds(
    [batch(1, 'purple', 5, 1, old), batch(2, 'purple', 60, 4)],
    labels,
    now,
  );
  assert.equal(msg?.embeds[0]?.image, 'purple-healthy.jpg');
});

test('/infosemki: непознат вид — карта без снимка', () => {
  const [msg] = buildInfoEmbeds([batch(1, 'haze', 50, 3)], labels, now);
  assert.equal(msg?.embeds[0]?.title.startsWith('haze — 3 семки'), true);
  assert.equal(msg?.embeds[0]?.image, undefined);
});

test('/infosemki: много партиди — лимитите на Discord се пазят и нищо не се губи', () => {
  const many = [
    ...Array.from({ length: 300 }, (_, i) => batch(i + 1, 'ak', 1 + (i % 99), i + 1)),
    ...Array.from({ length: 40 }, (_, i) => batch(1000 + i, 'ogkush', 50, 2)),
  ];
  const messages = buildInfoEmbeds(many, labels, now);
  assert.ok(messages.length > 1);
  for (const m of messages) {
    assert.ok(m.embeds.length <= EMBEDS_PER_MESSAGE);
    assert.ok(m.embeds.reduce((n, e) => n + size(e), 0) <= MESSAGE_EMBEDS_LIMIT);
    for (const e of m.embeds) assert.ok(e.description.length <= EMBED_TEXT_LIMIT);
  }
  const embeds = messages.flatMap((m) => m.embeds);
  assert.equal(embeds.flatMap(lines).length, 340);
  const akEmbeds = embeds.filter((e) => e.title.startsWith('AK'));
  assert.ok(akEmbeds.length > 1);
  // снимката и бележката — само на първата карта на вида; следващите са „(продължение)“
  assert.equal(akEmbeds.filter((e) => e.image).length, 1);
  assert.ok(akEmbeds.slice(1).every((e) => e.title.endsWith('(продължение)') && !e.footer));
  assert.equal(messages[0]?.content.startsWith('**Общо** — '), true);
  assert.ok(messages.slice(1).every((m) => m.content === ''));
});

test('/infosemki като текст (ако Discord откаже картите): заглавия и редове, до 2000 знака', () => {
  const [msg] = buildInfoEmbeds(
    [batch(69, 'ak', 33.86, 202), batch(76, 'ak', 98.69, 118)],
    labels,
    now,
  );
  assert.ok(msg);
  const parts = infoAsText(msg);
  const text = parts.join('\n');
  assert.match(
    text,
    /^\*\*Общо\*\* — 320 семки в 2 партиди\n\n\*\*AK — 320 семки в 2 партиди · 0,6% на 60 мин\*\*\n🟠 \*\*202 семки\*\*/,
  );
  for (const p of parts) assert.ok(p.length <= MESSAGE_LIMIT);
});

test('/infosemki в Discord: карта със снимка от assets/seeds; липсващ файл — карта без снимка', () => {
  const [msg] = buildInfoEmbeds(
    [batch(69, 'ak', 33.86, 202), batch(5, 'haze', 50, 1)],
    labels,
    now,
  );
  assert.ok(msg);
  const p = infoPayload(msg);
  assert.equal(p.content, '**Общо** — 203 семки в 2 партиди');
  assert.deepEqual(
    p.files.map((f) => f.name),
    ['ak-aging.jpg'],
  );
  assert.equal(p.embeds[0]?.image?.url, 'attachment://ak-aging.jpg');
  assert.equal(
    p.embeds[0]?.footer?.text,
    'На снимката: най-ниската — 202 семки, 33,86% (Остарява)',
  );
  assert.equal(p.embeds[1]?.image, undefined);
  const bare = infoPayload(msg, '/няма/такава');
  assert.deepEqual(bare.files, []);
  assert.equal(bare.embeds[0]?.image, undefined);
  assert.equal('content' in infoPayload({ content: '', embeds: [] }), false);
});
