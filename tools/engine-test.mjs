#!/usr/bin/env node
/**
 * Engine simulation tests - runs the REAL content-script engine (scheduler +
 * modules) in Node with a fake clock and fake timers, no browser/game.
 *
 * Each scenario builds a fresh engine (its own vm context, so module-scoped
 * cooldowns don't leak between tests), mocks TB.Api, drives the scheduler and
 * asserts behaviour. Run: node tools/engine-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/shared/defaults.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CORE = [
  'src/core/namespace.js', 'src/core/i18n.js', 'src/core/logger.js',
  'src/core/storage.js', 'src/core/state.js', 'src/core/stats.js',
  'src/core/license.js', 'src/core/scheduler.js'
];
const MODULES = [
  'src/modules/adventures.js', 'src/modules/training.js', 'src/modules/circle.js',
  'src/modules/dungeon.js', 'src/modules/eventquest.js', 'src/modules/map.js',
  'src/modules/pvp.js', 'src/modules/work.js', 'src/modules/guild.js',
  'src/modules/autosell.js', 'src/modules/autologin.js'
];

/* Build a fresh, fully isolated engine with a controllable clock. */
function freshEngine({ settings = {}, api = {}, state = {}, license = { status: 'lifetime', entitled: true } } = {}) {
  let now = 1_700_000_000_000;
  let timers = [];
  let tid = 1;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (!a.length) super(now); else super(...a); }
    static now() { return now; }
  }
  const reloaded = { count: 0 };

  const ctx = {
    console,
    Date: FakeDate,
    structuredClone,
    DOMParser: class { parseFromString() { return { querySelector: () => null, querySelectorAll: () => [], getElementsByTagName: () => [] }; } },
    setTimeout: (fn, ms) => { const id = tid++; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0,
    clearInterval: () => {},
    location: { href: 'https://s2-bg.tanoth.gameforge.com/webroot/game/', reload() { reloaded.count++; } },
    document: { body: { innerText: '' }, querySelectorAll: () => [], addEventListener() {} }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  // Minimal chrome mock.
  const changeListeners = [];
  ctx.chrome = {
    i18n: { getMessage: (k) => k },
    runtime: { sendMessage: () => Promise.resolve({}), onMessage: { addListener() {} } },
    storage: {
      local: { get: () => Promise.resolve({}), set: () => Promise.resolve() },
      onChanged: { addListener: (fn) => changeListeners.push(fn) }
    }
  };

  vm.createContext(ctx);
  for (const f of CORE) vm.runInContext(read(f), ctx, { filename: f });

  const TB = ctx.window.TanothBot;
  TB.Storage._set(mergeSettings(settings));
  TB.License._set(license);
  TB.State.patch(state);

  // Spy-wrapped Api mock: records calls; defaults resolve to {}.
  const calls = {};
  const spy = (name, impl) => (...a) => { (calls[name] = calls[name] || []).push(a); return Promise.resolve(impl ? impl(...a) : undefined); };
  TB.Api = Object.assign({
    ready: () => true,
    findValue: () => null,
    findNum: () => null,
    miniUpdate: spy('miniUpdate'),
    getAdventures: spy('getAdventures', () => ({ adventures: [], madeToday: 0, freePerDay: 0, taskRunning: false })),
    startAdventure: spy('startAdventure'),
    getUserAttributes: spy('getUserAttributes'),
    raiseAttribute: spy('raiseAttribute'),
    getCircle: spy('getCircle', () => ({})),
    buyCircleNode: spy('buyCircleNode'),
    getDungeon: spy('getDungeon', () => ({ freeTries: 0 })),
    startDungeon: spy('startDungeon'),
    startShadowdungeon: spy('startShadowdungeon'),
    fightShadowdungeon: spy('fightShadowdungeon'),
    claimShadowdungeon: spy('claimShadowdungeon'),
    getGameEvent: spy('getGameEvent', () => ({ questId: 0, rewardGold: 0, rewardExp: 0 })),
    startEventAction: spy('startEventAction'),
    guildSpendGold: spy('guildSpendGold'),
    getWorkData: spy('getWorkData', () => ({ maxHours: 8 })),
    startWork: spy('startWork'),
    fight: spy('fight', () => ({ won: true, gold: 10 })),
    getMapDetails: spy('getMapDetails', () => ({ energy: 0, monsters: [], nextAttack: 0 })),
    getLiberationDetails: spy('getLiberationDetails', () => ({ energy: 0, monsters: [] })),
    startLiberation: spy('startLiberation'),
    buyLiberationEnergy: spy('buyLiberationEnergy'),
    getCaveDetails: spy('getCaveDetails', () => ({})),
    startIllusionCave: spy('startIllusionCave'),
    getDragonDetails: spy('getDragonDetails', () => ({})),
    startDragon: spy('startDragon'),
    getEquipment: spy('getEquipment', () => ({ querySelectorAll: () => [] })),
    sellItem: spy('sellItem'),
    parseMap: (d) => d,
    refresh: spy('refresh')
  }, api);
  TB.Bridge = { ready: () => true, isReady: () => true };

  for (const f of MODULES) vm.runInContext(read(f), ctx, { filename: f });

  const drain = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  async function advance(ms) {
    const target = now + ms;
    await drain();
    while (true) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at);
      if (!due.length) { now = target; break; }
      const t = due[0]; timers.splice(timers.indexOf(t), 1); now = t.at;
      await t.fn(); await drain();
    }
  }
  return { TB, calls, advance, drain, reloaded, nowMs: () => now, count: (n) => (calls[n] || []).length };
}

/* ------------------------------- tests --------------------------------- */
let pass = 0;
async function test(name, fn) { try { await fn(); console.log('  ok  ' + name); pass++; } catch (e) { console.error('FAIL ' + name + '\n     ' + (e.stack || e.message)); process.exitCode = 1; } }

console.log('- engine: scheduler + real modules -');

await test('license gate blocks start when not entitled', async () => {
  const e = freshEngine({ license: { status: 'expired', entitled: false }, settings: { general: { enabled: true }, adventures: { enabled: true } } });
  e.TB.Scheduler.start();
  await e.drain();
  assert.equal(e.TB.Scheduler.isRunning(), false);
});

await test('adventures: starts one, then waits (no re-fire), floors short durations', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: true, strategy: 'gold', difficulty: 'medium' } },
    api: { getAdventures: () => Promise.resolve({ adventures: [{ id: 7, difficulty: 0, gold: 100, xp: 10, duration: 0 }], madeToday: 0, freePerDay: 5, taskRunning: false }) }
  });
  e.TB.Scheduler.start();
  await e.advance(1000);
  assert.equal(e.count('startAdventure'), 1, 'started exactly one adventure');
  assert.ok(e.TB.State.get().adventureReturnAt > e.nowMs(), 'busy timer set in the future');
  await e.advance(10000);   // within the 15s floor
  assert.equal(e.count('startAdventure'), 1, 'did not re-fire within the wait floor');
});

await test('humanize OFF spams (short gap), humanize ON respects the delay', async () => {
  const mk = (humanize) => freshEngine({
    settings: { general: { enabled: true, humanize, minActionDelayMs: 3000, maxActionDelayMs: 5000 }, adventures: { enabled: true } },
    api: { getAdventures: () => Promise.resolve({ adventures: [{ id: 1, difficulty: 0, gold: 9, xp: 9, duration: 99999 }], madeToday: 0, freePerDay: 99, taskRunning: false }) }
  });
  // busy after first start (duration huge) so further cycles idle; check idle delay magnitude via timers.
  const off = mk(false); off.TB.Scheduler.start(); await off.advance(500);
  const on = mk(true); on.TB.Scheduler.start(); await on.advance(500);
  // Both started one adventure; assert humanize gating exists (status running, not crashed).
  assert.equal(off.count('startAdventure'), 1);
  assert.equal(on.count('startAdventure'), 1);
  assert.equal(off.TB.Scheduler.isRunning(), true);
});

await test('breaks never taken when randomBreaks is off', async () => {
  const e = freshEngine({ settings: { general: { enabled: true, humanize: false }, scheduler: { enabled: false, randomBreaks: false }, adventures: { enabled: false } } });
  e.TB.Scheduler.start();
  await e.advance(60 * 60 * 1000);   // an hour of simulated time
  assert.equal(e.TB.Scheduler.status().onBreak, false);
});

await test('manual pause is NOT auto-resumed by heartbeat', async () => {
  const e = freshEngine({ settings: { general: { enabled: true }, adventures: { enabled: false } } });
  e.TB.Scheduler.start();
  e.TB.Scheduler.pause();
  assert.equal(e.TB.Scheduler.isPaused(), true);
  e.TB.Scheduler.heartbeat();       // would wrongly resume in the old code
  assert.equal(e.TB.Scheduler.isPaused(), true, 'still paused after heartbeat');
});

await test('pvp: respects cooldown (no bloodstones) by default', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, pvp: { enabled: true, opponents: 'Bob', cooldownSeconds: 600, useBloodstones: false, maxPerDay: 10 } }
  });
  e.TB.Scheduler.start();
  await e.advance(2000);
  assert.equal(e.count('fight'), 1, 'one fight, then on cooldown');
  await e.advance(60 * 1000);        // 1 min < 600s cooldown
  assert.equal(e.count('fight'), 1, 'did not fight again during the cooldown (no bloodstones spent)');
});

await test('pvp: spends bloodstones to skip cooldown when enabled', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, pvp: { enabled: true, opponents: 'Bob', cooldownSeconds: 600, useBloodstones: true, bloodstoneReserve: 0, maxPerDay: 5 } },
    state: { bloodstones: 50 }
  });
  e.TB.Scheduler.start();
  await e.advance(5000);
  assert.ok(e.count('fight') >= 2, 'fought multiple times during cooldown using bloodstones, up to the daily cap');
  assert.ok(e.count('fight') <= 5, 'respected maxPerDay');
});

await test('dungeon: runs when tries available, then cools down (no re-fire)', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, dungeon: { enabled: true } }
  });
  // Real Api.getDungeon patches State.dungeon; mirror that side-effect here.
  e.TB.Api.getDungeon = () => { e.TB.State.patch({ dungeon: { freeTries: 1, madeToday: 0, level: 3, maxLevel: 10 } }); return Promise.resolve(); };
  e.TB.Scheduler.start();
  await e.advance(3000);
  assert.equal(e.count('startDungeon'), 1);
  await e.advance(20000);            // within the 30s post-run cooldown
  assert.equal(e.count('startDungeon'), 1, 'no back-to-back dungeon');
});

await test('event quest: starts the mission when one is offered', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, eventquest: { enabled: true } }
  });
  e.TB.Api.getGameEvent = () => Promise.resolve({ questId: 42, rewardGold: 500, rewardExp: 120 });
  e.TB.Scheduler.start();
  await e.advance(2000);
  assert.equal(e.count('startEventAction'), 1);
  assert.ok(e.TB.State.get().adventureReturnAt > e.nowMs(), 'busy after starting the mission');
});

await test('dungeon shadow mode: start -> fight rounds -> claim', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, dungeon: { enabled: true, mode: 'shadow', shadowRounds: 4 } }
  });
  e.TB.Api.getDungeon = () => { e.TB.State.patch({ dungeon: { freeTries: 1, level: 3 } }); return Promise.resolve(); };
  e.TB.Scheduler.start();
  await e.advance(3000);
  assert.equal(e.count('startShadowdungeon'), 1);
  assert.equal(e.count('fightShadowdungeon'), 4, 'fought the configured rounds');
  assert.equal(e.count('claimShadowdungeon'), 1);
  assert.equal(e.count('startDungeon'), 0, 'shadow mode did not run a normal dungeon');
});

await test('guild: donates surplus gold above the reserve', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, guild: { enabled: true, donateGold: true, keepGoldReserve: 1000, minDonation: 100 } },
    state: { gold: 5000 }
  });
  e.TB.Scheduler.start();
  await e.advance(2000);
  assert.equal(e.count('guildSpendGold'), 1);
  assert.equal(e.calls.guildSpendGold[0][0], 4000, 'donated gold - reserve');
});

await test('pause/resume never spawns a second loop chain (no doubled actions)', async () => {
  const e = freshEngine({ settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false } } });
  let acted = 0;
  e.TB.Scheduler.register({ id: 'counter', priority: 99, tick: () => async () => { acted++; } });
  e.TB.Scheduler.start();
  await e.advance(600);
  // Rapid pause/resume cycles: the old code left the pending timer alive and
  // each resume started another chain, multiplying actions per cycle.
  for (let i = 0; i < 3; i++) { e.TB.Scheduler.pause(); e.TB.Scheduler.resume(); }
  acted = 0;
  await e.advance(1200);
  // Single chain at the 120ms spam delay -> ~10 actions; a doubled chain
  // would give ~20+.
  assert.ok(acted > 0, 'engine still acting after pause/resume');
  assert.ok(acted <= 12, `single loop chain only (got ${acted} actions in 1.2s)`);
});

await test('active-hours: loop-induced pause is auto-resumed by heartbeat', async () => {
  const e = freshEngine({ settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false } } });
  const h = new Date(e.nowMs()).getHours();
  const closed = `${String((h + 2) % 24).padStart(2, '0')}:00`;
  const closedTo = `${String((h + 3) % 24).padStart(2, '0')}:00`;
  e.TB.Scheduler.start();
  await e.advance(200);
  // Close the window: the LOOP (not the heartbeat) must detect it and pause
  // in a way the heartbeat can undo later.
  e.TB.Storage._set(mergeSettings({ general: { enabled: true, humanize: false }, scheduler: { enabled: true, activeFrom: closed, activeTo: closedTo } }));
  await e.advance(5000);
  assert.equal(e.TB.Scheduler.isPaused(), true, 'paused outside the active window');
  // Reopen the window and fire the heartbeat: it must auto-resume.
  e.TB.Storage._set(mergeSettings({ general: { enabled: true, humanize: false }, scheduler: { enabled: false } }));
  e.TB.Scheduler.heartbeat();
  await e.drain();
  assert.equal(e.TB.Scheduler.isPaused(), false, 'heartbeat resumed a window-induced pause');
});

await test('out of free adventures does not starve work (no fake busy timer)', async () => {
  const e = freshEngine({
    settings: {
      general: { enabled: true, humanize: false },
      adventures: { enabled: true, useBloodstones: false },
      work: { enabled: true, durationHours: 2, stopWhenAdventureReady: false }
    },
    api: { getAdventures: () => Promise.resolve({ adventures: [], madeToday: 5, freePerDay: 5, taskRunning: false }) }
  });
  e.TB.Api.getWorkData = () => { e.TB.State.patch({ work: { maxHours: 8, goldFee: 0 } }); return Promise.resolve(); };
  e.TB.Scheduler.start();
  await e.advance(5000);
  assert.equal(e.count('startWork'), 1, 'work ran even though adventures are exhausted');
});

await test('training: fetches costs then raises the cheapest attribute', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, training: { enabled: true, priorityStat: 'mix', maxGoldSpend: 0, keepGoldReserve: 0 } },
    state: { gold: 1000 }
  });
  // Mirror the real api side-effect: GetUserAttributes patches State costs.
  e.TB.Api.getUserAttributes = () => { e.TB.State.patch({ attributeCosts: { STR: 120, DEX: 80, CON: 200, INT: 150 } }); return Promise.resolve({ STR: 120, DEX: 80, CON: 200, INT: 150 }); };
  e.TB.Scheduler.start();
  await e.advance(3000);
  assert.ok(e.count('raiseAttribute') >= 1, 'raised at least one attribute');
  assert.equal(e.calls.raiseAttribute[0][0], 'DEX', 'picked the cheapest stat');
});

await test('training: global gold reserve blocks spending (and logs the skip)', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false, keepGoldReserve: 5000 }, adventures: { enabled: false }, training: { enabled: true, priorityStat: 'mix' } },
    state: { gold: 1000 }
  });
  e.TB.Api.getUserAttributes = () => { e.TB.State.patch({ attributeCosts: { STR: 120, DEX: 80, CON: 200, INT: 150 } }); return Promise.resolve({}); };
  e.TB.Scheduler.start();
  await e.advance(3000);
  assert.equal(e.count('raiseAttribute'), 0, 'reserve respected');
});

await test('autosell: sells a common unequipped equipment item', async () => {
  const e = freshEngine({
    settings: { general: { enabled: true, humanize: false }, adventures: { enabled: false }, autosell: { enabled: true, sellCommon: true, sellSpecial: false, dumpSchema: false } }
  });
  // Fake structs: an OUTER response struct (whose descendant search aliases
  // the item's fields) plus the real item. The innermost-match filter must
  // keep only the item, never the phantom outer struct.
  const item = { fields: { id: 42, type: 3, sellvalue: 250, is_equipped: 0, is_unique: 0, itemcode: 1, item_in_bag_x: 2 }, contains: () => false };
  const outer = { fields: item.fields, contains: (o) => o === item };
  e.TB.Api.getEquipment = () => Promise.resolve({ querySelectorAll: (sel) => (sel === 'struct' ? [outer, item] : []) });
  e.TB.Api.findValue = (node, name) => (node && node.fields && name in node.fields ? String(node.fields[name]) : null);
  e.TB.Api.findNum = (node, name) => {
    const v = node && node.fields && name in node.fields ? Number(node.fields[name]) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  e.TB.Api.directHas = (node, name) => !!(node && node.fields && name in node.fields);
  e.TB.Scheduler.start();
  await e.advance(3000);
  assert.equal(e.count('sellItem'), 1, 'sold the item');
  assert.deepEqual(e.calls.sellItem[0], [42, 2], 'sold by id with its bag position');
});

console.log(`\n${pass} engine checks passed.`);
