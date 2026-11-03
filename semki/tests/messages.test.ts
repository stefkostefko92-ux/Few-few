import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAlertMessages,
  buildAlertParts,
  buildInfoMessages,
  discordTime,
  formatDuration,
  formatPercent,
  formatThreshold,
  MESSAGE_LIMIT,
} from '../src/domain/messages.js';
import { HOUR_MS } from '../src/domain/decay.js';
import type { AlertGroup, BatchLike } from '../src/domain/alerts.js';

const t0 = new Date('2026-11-03T10:00:00Z');
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const labels = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};

function batch(id: number, percent: number, seedTypeKey = 'amnesia'): BatchLike {
  return { id, seedTypeKey, count: 5, percent, anchoredAt: t0, rate };
}

test('процентът се показва с два знака, закръглен до стотни, с BG запетая', () => {
  assert.equal(formatPercent(87.4), '87,40%');
  assert.equal(formatPercent(87.39999), '87,40%');
  assert.equal(formatPercent(19.994), '19,99%');
  assert.equal(formatPercent(0.29), '0,29%');
  assert.equal(formatPercent(0), '0,00%');
  assert.equal(formatPercent(100), '100,00%');
});

test('продължителност: дни, часове, минути', () => {
  assert.equal(formatDuration((166 * 60 + 40) * 60_000), '6 д 22 ч 40 мин');
  assert.equal(formatDuration(3 * HOUR_MS + 5 * 60_000), '3 ч 5 мин');
  assert.equal(formatDuration(45 * 60_000 + 59_000), '45 мин');
  assert.equal(formatDuration(30_000), '< 1 мин');
  assert.equal(formatDuration(0), '0 мин');
  assert.equal(formatDuration(24 * HOUR_MS), '1 д 0 ч 0 мин');
});

test('Discord timestamp е в секунди', () => {
  assert.equal(discordTime(t0, 'R'), `<t:${t0.getTime() / 1000}:R>`);
  assert.equal(discordTime(new Date(t0.getTime() + 999), 'f'), `<t:${t0.getTime() / 1000}:f>`);
});

test('прагът се описва на български', () => {
  assert.equal(formatThreshold('PERCENT', 20), '≤ 20%');
  assert.equal(formatThreshold('PERCENT', 2.5), '≤ 2,5%');
  assert.equal(formatThreshold('HOURS_LEFT', 12), '≤ 12 ч до 0%');
});

test('известието тагва ролята веднъж и описва партидата', () => {
  const group: AlertGroup = {
    channelId: '111111111111111111',
    roleId: '222222222222222222',
    items: [
      {
        batch: batch(7, 15),
        rule: {
          id: 1,
          kind: 'PERCENT',
          threshold: 20,
          seedTypeKey: null,
          channelId: '111111111111111111',
          roleId: '222222222222222222',
          enabled: true,
        },
      },
    ],
  };
  const parts = buildAlertMessages(group, labels, t0);
  assert.equal(parts.length, 1);
  const msg = parts[0] ?? '';
  assert.ok(msg.startsWith('<@&222222222222222222>'));
  assert.match(msg, /Amnesia/);
  assert.match(msg, /#7/);
  assert.match(msg, /×5/);
  assert.match(msg, /15,00%/);
  assert.match(msg, /≤ 20%/);
  assert.match(msg, /<t:\d+:R>/);
});

test('дълго известие се дели на части до лимита, ролята е само в първата', () => {
  const rule = {
    id: 1,
    kind: 'PERCENT' as const,
    threshold: 20,
    seedTypeKey: null,
    channelId: '111111111111111111',
    roleId: '222222222222222222',
    enabled: true,
  };
  const items = Array.from({ length: 80 }, (_, i) => ({ batch: batch(i + 1, 10), rule }));
  const parts = buildAlertMessages(
    { channelId: rule.channelId, roleId: rule.roleId, items },
    labels,
    t0,
  );
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= MESSAGE_LIMIT, `дължина ${p.length}`);
  assert.equal(parts.filter((p) => p.includes('<@&222222222222222222>')).length, 1);
  const all = parts.join('\n');
  for (let i = 1; i <= 80; i++) assert.ok(all.includes(`#${i} `), `липсва #${i}`);
});

test('частите на известието делят партидите без застъпване', () => {
  const rule = {
    id: 1,
    kind: 'PERCENT' as const,
    threshold: 20,
    seedTypeKey: null,
    channelId: '111111111111111111',
    roleId: '222222222222222222',
    enabled: true,
  };
  const items = Array.from({ length: 60 }, (_, i) => ({ batch: batch(i + 1, 10), rule }));
  const parts = buildAlertParts(
    { channelId: rule.channelId, roleId: rule.roleId, items },
    labels,
    t0,
  );
  const ids = parts.flatMap((p) => p.batchIds);
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, 60);
  for (const p of parts) {
    for (const id of p.batchIds) assert.ok(p.content.includes(`#${id} `));
  }
});

test('/infosemki: празно, групирано по вид, първо изтичащите, изтеклите са отбелязани', () => {
  assert.deepEqual(buildInfoMessages([], labels, t0), ['Няма въведени семки.']);
  const parts = buildInfoMessages([batch(1, 80), batch(2, 0, 'ak'), batch(3, 50)], labels, t0);
  const text = parts.join('\n');
  assert.match(text, /Amnesia/);
  assert.match(text, /AK/);
  assert.match(text, /80,00%/);
  assert.match(text, /изтекла/);
  // в рамките на вида: първо тази, която изтича най-скоро (#3 при 50% преди #1 при 80%)
  assert.ok(text.indexOf('#3 ') < text.indexOf('#1 '));
  for (const p of parts) assert.ok(p.length <= MESSAGE_LIMIT);
});
