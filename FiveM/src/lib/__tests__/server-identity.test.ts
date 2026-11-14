import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildServerSlug,
  fitAtWord,
  indexDecision,
  INDEXABLE_ACTIVE_DAYS,
  isGenericServerName,
  planIdentities,
  REGISTRATION_ALIVE_MS,
  serverFullName,
  serverIdentityKey,
  serverTitle,
  type IdentityRow,
  type IndexableInput,
} from '../server-identity';

// Всички имена тук са ДОСЛОВНО от живия сайт (обход от 22.10.2026).

test('заглавието е марката: без цветни кодове, емоджи и рекламна опашка', () => {
  assert.equal(
    serverTitle('BALKAN RP | 💸 $50 000 START BONUS 💸 | 👮♂️ STAFF TEAM 👮♂️ | ☠️ DRUGS ☠️ | 🚨'),
    'BALKAN RP',
  );
  assert.equal(serverTitle('Nova RP | ESX Legacy Server'), 'Nova RP');
  assert.equal(serverTitle('VISION ROLEPLAY|NON WH|CRIME💰|ROLEPLAY🌐|SOCIAL🟢'), 'VISION ROLEPLAY');
  assert.equal(serverTitle('New Order RP: НАЙ-РЕАЛИСТИЧНИЯТ БЪЛГАРСКИ РОЛПЛЕЙ СЪРВЪР!'), 'New Order RP');
  assert.equal(serverTitle('^1Nova ^7RP ~r~| старт'), 'Nova RP');
});

test('етикетите в скоби и водещите „^“ падат', () => {
  assert.equal(serverTitle('[ESX] MBT ROLEPLAY SEASON 1| 🏎️Къстъм коли | 🎭Къстъм дрехи🎭'), 'MBT ROLEPLAY SEASON 1');
  assert.equal(serverTitle('^ [ESX] NEXUS LIFE REBORN | Bulgarian | 150k Start Money'), 'NEXUS LIFE REBORN');
  assert.equal(serverTitle('[QB] LIMITED RP'), 'LIMITED RP');
  // Име САМО в скоби — тогава скобите са името.
  assert.equal(serverTitle('[NOVA RP]'), 'NOVA RP');
});

test('емоджито е разделител: името свършва там, където започва рекламата', () => {
  assert.equal(serverTitle('MECHKA RP 💵 150000 НАЧАЛЕН БОНУС💵 | 🏎️КЪСТЪМ КОЛИ🏎️'), 'MECHKA RP');
  assert.equal(serverTitle('GORILLA ROLEPLAY 🦍 | 💸 $30 000 START BONUS 💸'), 'GORILLA ROLEPLAY');
  assert.equal(serverTitle('[QBX] 🔒Los Custom RP🔒 | 🎉SERIOUS RP🎉'), 'Los Custom RP');
});

test('опашката на рецептата на FXServer не е част от името', () => {
  assert.equal(serverTitle('Velora Roleplay built with QBCore Framework by JericoFx & Kakarot & Hamy!'), 'Velora Roleplay');
  assert.equal(serverTitle('LYULIN STATE RP built with Qbox Project by The Community!'), 'LYULIN STATE RP');
  assert.equal(serverTitle('TDE built with FiveM Basic Server!'), 'TDE');
});

test('„шрифтовете“ от математически букви стават обикновени букви', () => {
  assert.equal(serverTitle('[BG/ESX] 𝐏𝐀𝐑𝐀𝐃𝐈𝐒𝐄 𝐂𝐈𝐓𝐘 𝐑𝐏 🌴 | 💵 𝟓𝟎𝟎𝟎𝟎 НАЧАЛЕН БОНУС 💵'), 'PARADISE CITY RP');
});

test('„RP“ точно след марката е част от името; възрастовият етикет не е', () => {
  assert.equal(serverTitle('NEW ERA | ROLEPLAY | 🚗CUSTOM CARS🚗'), 'NEW ERA ROLEPLAY');
  assert.equal(serverTitle('VOID ROLEPLAY 18 + | | 💲 50 000 START BONUS 💲'), 'VOID ROLEPLAY');
  assert.equal(serverTitle('VOLT ROLEPLAY 18+'), 'VOLT ROLEPLAY');
});

test('адреси в името са реклама', () => {
  assert.equal(
    serverTitle('Apex City Development || Join Our Discord : https://dsc.gg/apexcityrp'),
    'Apex City Development · Join Our Discord',
  );
});

test('заглавието е до 60 знака, по граница на дума', () => {
  const long = 'Euphoric City Rolleplay SUMMER SEASON EDITION REBORN ULTIMATE EXPERIENCE TOTAL';
  const title = serverTitle(long);
  assert.ok(title.length <= 60, title);
  assert.ok(long.startsWith(title));
  assert.ok(!title.endsWith(' '));
  assert.equal(fitAtWord('едно две три', 7), 'едно');
  // Дума, по-дълга от тавана, се реже твърдо — не изчезва.
  assert.equal(fitAtWord('x'.repeat(80), 10), 'x'.repeat(10));
});

test('празно или нечетимо име дава заместителя на езика', () => {
  assert.equal(serverTitle('|', 60, 'FiveM server'), 'FiveM server');
  assert.equal(serverTitle(null), 'FiveM сървър');
  assert.equal(serverTitle('🔥🔥🔥'), 'FiveM сървър');
});

test('пълното име пази чуждия текст, без цветни кодове и управляващи знаци', () => {
  assert.equal(serverFullName('^1BALKAN ^7RP | 💸 START'), 'BALKAN RP | 💸 START');
  assert.equal(serverFullName('a\u202eb'), 'ab');
});

test('регистрациите на един сървър имат един ключ', () => {
  const key = serverIdentityKey('Nova RP | ESX Legacy Server');
  assert.equal(key, 'novarp');
  assert.equal(serverIdentityKey('💎 NOVA RP | 💸 $50K START | 🚓 ACTIVE POLICE & EMS'), key);
  assert.equal(serverIdentityKey('NOVA RP | ESX Legacy Server'), key);
  // Рекламата се мени между регистрациите, марката — не.
  assert.equal(
    serverIdentityKey('[ESX] OG DREAM RP SUMMER UPDATE 💲100000 НАЧАЛЕН БОНУС💲'),
    serverIdentityKey('[ESX] OG DREAM RP SUMMER UPDATE 💲550000 НАЧАЛЕН БОНУС💲'),
  );
  // Различни марки остават различни.
  assert.notEqual(serverIdentityKey('Balkan Squad RolePlay'), serverIdentityKey('Balkan Life RP'));
});

test('заводски, служебни и развойни имена не идентифицират никого', () => {
  for (const name of [
    'default FXServer',
    'Invalid server (internal validation failed)',
    'Dev',
    'Test Server | ESX Legacy Server',
    'DEV |Genesis RP',
    'Storyline Roleplay DEV',
    'Bulgarian RP Devel built with QBCore Framework by JericoFx & Kakarot & Hamy!',
    'test-58 built with Qbox Project by The Community!',
    'Example RP | ESX Legacy Server',
    'change-me built with QBCore Framework by JericoFx & Kakarot & Hamy!',
    '******* Bulgarian | ESX Legacy Server',
    '|',
  ]) {
    assert.equal(isGenericServerName(name), true, name);
  }
  // „Deva“ и „Developers“ не са „dev“.
  assert.equal(isGenericServerName('Deva built with QBCore Framework by JericoFx & Kakarot & Hamy!'), false);
  // Развойната инстанция показва и името, не само маркера.
  assert.equal(serverTitle('DEV |Genesis RP'), 'DEV · Genesis RP');
});

const NOW = new Date('2026-10-22T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const row = (over: Partial<IdentityRow> & Pick<IdentityRow, 'id' | 'name'>): IdentityRow => ({
  source: 'DISCOVERED',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  lastSeenInListAt: null,
  players: 0,
  ...over,
});

test('каноничният е НАЙ-СТАРИЯТ, останалите са псевдоними', () => {
  const plan = planIdentities(
    [
      row({ id: 'new', name: 'Nova RP | ESX Legacy Server', createdAt: new Date('2026-09-10') }),
      row({ id: 'old', name: 'NOVA RP | ESX Legacy Server', createdAt: new Date('2026-08-02') }),
      row({ id: 'other', name: 'Balkan Life RP' }),
    ],
    NOW,
  );
  assert.equal(plan.canonicalOf.get('old'), null);
  assert.equal(plan.canonicalOf.get('new'), 'old');
  assert.equal(plan.canonicalOf.get('other'), null);
});

test('подаденият от собственика бие по-стария открит', () => {
  const plan = planIdentities(
    [
      row({ id: 'old', name: 'Nova RP', createdAt: new Date('2026-08-01') }),
      row({ id: 'owner', name: 'Nova RP', source: 'SUBMITTED', createdAt: new Date('2026-09-01') }),
    ],
    NOW,
  );
  assert.equal(plan.canonicalOf.get('owner'), null);
  assert.equal(plan.canonicalOf.get('old'), 'owner');
});

test('живата регистрация се мести към каноничния адрес, ако неговата е мъртва', () => {
  const plan = planIdentities(
    [
      row({ id: 'old', name: 'Nova RP', lastSeenInListAt: ago(20 * 86_400_000) }),
      row({ id: 'live', name: 'Nova RP', createdAt: new Date('2026-10-01'), lastSeenInListAt: ago(60_000), players: 12 }),
      row({ id: 'dead', name: 'Nova RP', createdAt: new Date('2026-09-01') }),
    ],
    NOW,
  );
  assert.deepEqual(plan.rebind, [{ canonicalId: 'old', liveId: 'live' }]);
});

test('жив каноничен остава с регистрацията си — няма преместване', () => {
  const plan = planIdentities(
    [
      row({ id: 'old', name: 'Nova RP', lastSeenInListAt: ago(REGISTRATION_ALIVE_MS / 2) }),
      row({ id: 'live', name: 'Nova RP', createdAt: new Date('2026-10-01'), lastSeenInListAt: ago(60_000) }),
    ],
    NOW,
  );
  assert.deepEqual(plan.rebind, []);
});

test('общите имена НЕ сливат различни сървъри', () => {
  const plan = planIdentities(
    [row({ id: 'a', name: 'Dev' }), row({ id: 'b', name: 'Dev' }), row({ id: 'c', name: 'default FXServer' })],
    NOW,
  );
  assert.equal(plan.canonicalOf.get('a'), null);
  assert.equal(plan.canonicalOf.get('b'), null);
  assert.equal(plan.canonicalOf.get('c'), null);
});

test('планът е идемпотентен: същите данни → същият резултат', () => {
  const rows = [
    row({ id: 'x', name: 'EternalRP', createdAt: new Date('2026-08-03') }),
    row({ id: 'y', name: 'EternalRP', createdAt: new Date('2026-08-05') }),
  ];
  const first = planIdentities(rows, NOW);
  const second = planIdentities([...rows].reverse(), NOW);
  assert.deepEqual([...first.canonicalOf].sort(), [...second.canonicalOf].sort());
});

const page = (over: Partial<IndexableInput> = {}): IndexableInput => ({
  name: 'Nova RP',
  source: 'DISCOVERED',
  description: null,
  tagline: null,
  lastActiveAt: null,
  approvedReviews: 0,
  canonicalId: null,
  ...over,
});

test('правилото за индексиране: празен открит запис е noindex', () => {
  assert.deepEqual(indexDecision(page(), NOW), { index: false, reason: 'no-unique-content' });
  // Активен ПРЕДИ прозореца — вече не е.
  assert.equal(indexDecision(page({ lastActiveAt: ago((INDEXABLE_ACTIVE_DAYS + 1) * 86_400_000) }), NOW).index, false);
});

test('правилото за индексиране: активност, ревю или собствено съдържание стигат', () => {
  assert.deepEqual(indexDecision(page({ lastActiveAt: ago(86_400_000) }), NOW), { index: true, reason: 'active' });
  assert.deepEqual(indexDecision(page({ approvedReviews: 1 }), NOW), { index: true, reason: 'reviews' });
  assert.deepEqual(indexDecision(page({ description: 'Сериозен RP.' }), NOW), { index: true, reason: 'owner-content' });
  assert.deepEqual(indexDecision(page({ source: 'SUBMITTED' }), NOW), { index: true, reason: 'owner-content' });
  // Само интервали не е съдържание.
  assert.equal(indexDecision(page({ tagline: '   ' }), NOW).index, false);
});

test('правилото за индексиране: псевдоним и общо име НИКОГА', () => {
  assert.deepEqual(indexDecision(page({ canonicalId: 'x', approvedReviews: 5 }), NOW), { index: false, reason: 'alias' });
  assert.deepEqual(indexDecision(page({ name: 'default FXServer', lastActiveAt: NOW }), NOW), {
    index: false,
    reason: 'generic-name',
  });
});

test('slug: от марката, а суфиксът с кода се събира и при дълго име', () => {
  assert.equal(buildServerSlug('BALKAN RP | 💸 $50 000 START BONUS', 'abc123', new Set()), 'balkan-rp');
  const long = 'ODYSSEY RolePlay Serious Custom Jobs LSPD EMS Mechanics Gangs Cartels';
  const base = buildServerSlug(long, 'm84k59', new Set());
  const second = buildServerSlug(long, 'vqqv3xx', new Set([base]));
  // Дотук вторият ставаше голото `server-<код>` — суфиксът се отрязваше.
  assert.ok(second.endsWith('-vqqv3xx'), second);
  assert.ok(second.length <= 60);
  assert.notEqual(second, base);
  assert.equal(buildServerSlug('🔥🔥', 'zz9', new Set()), 'server-zz9');
});
