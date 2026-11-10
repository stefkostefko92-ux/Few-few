import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bg } from '../../i18n/dictionaries/bg';
import { en } from '../../i18n/dictionaries/en';
import { formatDay, serverMetaDescription, serverPageTitle, SERVER_TITLE_MAX, type ServerFacts } from '../server-meta';

const facts = (over: Partial<ServerFacts> = {}): ServerFacts => ({
  name: 'Nova RP',
  frameworkLabel: 'ESX',
  whitelist: false,
  maxPlayers: 128,
  lastProbe: 'OFFLINE',
  lastOnlineLabel: '21.10.2026 г.',
  peak24h: 0,
  hasDiscord: false,
  approvedReviews: 0,
  tagline: null,
  ...over,
});

test('заглавието носи рамката и се събира в 60 знака с бранда', () => {
  assert.equal(serverPageTitle('Nova RP', 'ESX', bg.server), 'Nova RP — ESX FiveM сървър');
  assert.equal(serverPageTitle('Nova RP', null, bg.server), 'Nova RP — FiveM RP сървър');
  assert.equal(serverPageTitle('Nova RP', 'QBCore', en.server), 'Nova RP — QBCore FiveM server');
  // Шаблонът на layout-а добавя „ · FiveM BG“ (11 знака).
  const long = serverPageTitle('Euphoric City Rolleplay SUMMER SEASON EDITION', 'ESX', bg.server);
  assert.ok(long.length <= SERVER_TITLE_MAX, long);
  assert.ok(`${long} · FiveM BG`.length <= 60);
});

test('описанието е от фактите на сървъра — различни сървъри, различни описания', () => {
  const a = serverMetaDescription(facts(), bg.server);
  const b = serverMetaDescription(
    facts({ name: 'BALKAN RP', frameworkLabel: 'Qbox', maxPlayers: 64, lastOnlineLabel: '02.09.2026 г.' }),
    bg.server,
  );
  assert.equal(a, 'Nova RP — ESX FiveM сървър, свободен вход, 128 слота. Последно онлайн: 21.10.2026 г.');
  assert.notEqual(a, b);
  // Нищо от общия рекламен текст на сайта.
  assert.ok(!a.includes('Всички български'));
});

test('описанието: онлайн, скрит, никога виждан, пик, Discord, ревюта', () => {
  const online = serverMetaDescription(
    facts({ lastProbe: 'ONLINE', peak24h: 41, hasDiscord: true, approvedReviews: 3, whitelist: true }),
    bg.server,
  );
  assert.match(online, /с whitelist/);
  assert.match(online, /Онлайн при последната проверка\./);
  assert.match(online, /Пик за последните 24 ч\.: 41 играчи\./);
  assert.match(online, /Има Discord\./);
  assert.match(online, /Ревюта от посетители: 3\./);
  assert.match(serverMetaDescription(facts({ lastProbe: 'HIDDEN' }), bg.server), /скрил публичния статус/);
  assert.match(serverMetaDescription(facts({ lastOnlineLabel: null }), en.server), /Not seen online yet\./);
});

test('описанието е ≤160 знака и се реже по цяло изречение', () => {
  const text = serverMetaDescription(
    facts({
      tagline: 'Сериозен български roleplay с икономика, банди, полиция и медици, активен екип и чести събития',
      lastProbe: 'ONLINE',
      peak24h: 64,
      hasDiscord: true,
      approvedReviews: 12,
    }),
    bg.server,
  );
  assert.ok(text.length <= 160, String(text.length));
  assert.ok(/[.!?…]$/.test(text), text);
});

test('без рамка не пише „Собствена рамка FiveM сървър“', () => {
  const text = serverMetaDescription(facts({ frameworkLabel: null, maxPlayers: 0 }), bg.server);
  assert.ok(text.startsWith('Nova RP — FiveM RP сървър, свободен вход.'), text);
});

test('датата е в часовата зона на София', () => {
  // 22:30 UTC на 21.10 е вече 22.10 в София (UTC+3 лятно време).
  assert.match(formatDay(new Date('2026-10-21T22:30:00Z'), 'bg'), /22\.10\.2026/);
});
