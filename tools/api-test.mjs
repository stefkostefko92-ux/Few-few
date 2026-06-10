#!/usr/bin/env node
/**
 * api.js parsing tests - runs the REAL src/core/api.js against crafted Tanoth
 * XML-RPC responses, using linkedom as a standards DOM (DOMParser + querySelector
 * + getElementsByTagName). Covers the most fragile area: field-name extraction,
 * fault handling (SESSION_EXPIRED vs FAULT), and the phantom-struct guard.
 *
 * Run: node tools/api-test.mjs   (requires `npm install`)
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function makeApi() {
  let nextXml = '';
  const ctx = {
    console, DOMParser, structuredClone,
    chrome: { i18n: { getMessage: (k) => k }, runtime: { sendMessage: () => Promise.resolve({}) }, storage: { onChanged: { addListener() {} } } }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['src/core/namespace.js', 'src/core/i18n.js', 'src/core/logger.js', 'src/core/state.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  const TB = ctx.window.TanothBot;
  TB.Bridge = { ready: () => true, callXmlRpc: () => Promise.resolve({ xml: nextXml }) };
  vm.runInContext(read('src/core/api.js'), ctx, { filename: 'api.js' });
  return { TB, setXml: (x) => { nextXml = x; } };
}

const resp = (innerStructMembers) =>
  `<?xml version="1.0"?><methodResponse><params><param><value><struct>${innerStructMembers}</struct></value></param></params></methodResponse>`;
const m = (name, type, val) => `<member><name>${name}</name><value><${type}>${val}</${type}></value></member>`;

let pass = 0;
async function test(name, fn) { try { await fn(); console.log('  ok  ' + name); pass++; } catch (e) { console.error('FAIL ' + name + '\n     ' + (e.stack || e.message)); process.exitCode = 1; } }

console.log('- api.js XML-RPC parsing -');

await test('miniUpdate parses gold/bs and sets a running-task timer', async () => {
  const a = makeApi();
  a.setXml(resp(m('gold', 'i4', 12345) + m('bs', 'i4', 37) + m('time', 'i4', 480) + m('type', 'string', 'adventure')));
  const r = await a.TB.Api.miniUpdate();
  assert.equal(r.gold, 12345);
  assert.equal(r.bloodstones, 37);
  assert.equal(a.TB.State.get().gold, 12345);
  assert.ok(a.TB.State.get().adventureReturnAt > Date.now());      // task time -> busy
  assert.equal(a.TB.State.get().taskType, 'adventure');
});

await test('getAdventures parses the array of adventures + counts', async () => {
  const a = makeApi();
  const adv = (id, d, g, x, dur) => `<value><struct>${m('quest_id','i4',id)+m('difficulty','i4',d)+m('gold','i4',g)+m('exp','i4',x)+m('duration','i4',dur)}</struct></value>`;
  a.setXml(resp(
    `<member><name>adventures</name><value><array><data>${adv(7,0,100,50,300)+adv(8,1,200,80,600)}</data></array></value></member>` +
    m('adventures_made_today', 'i4', 2) + m('free_adventures_per_day', 'i4', 5)
  ));
  const r = await a.TB.Api.getAdventures();
  assert.equal(r.adventures.length, 2);
  assert.deepEqual(r.adventures[0], { id: 7, difficulty: 0, gold: 100, xp: 50, duration: 300 });
  assert.equal(r.madeToday, 2);
  assert.equal(r.freePerDay, 5);
  assert.equal(r.taskRunning, false);
  assert.equal(a.TB.State.get().freeAdventures, 3);
});

await test('getAdventures flags taskRunning when the daily-count field is absent', async () => {
  const a = makeApi();
  a.setXml(resp(`<member><name>adventures</name><value><array><data></data></array></value></member>`));
  const r = await a.TB.Api.getAdventures();
  assert.equal(r.taskRunning, true);   // madeToday == null
});

await test('getUserAttributes computes costs via floor((bought*incr+base)*factor)', async () => {
  const a = makeApi();
  a.setXml(resp(
    m('attributeCostBase', 'i4', 15) + m('attributeCostFactor', 'double', '2.0') + m('attributeCostIncrement', 'i4', 5) +
    `<member><name>attributes</name><value><struct>${m('str_bought','i4',10)+m('dex_bought','i4',0)+m('con_bought','i4',0)+m('int_bought','i4',0)}</struct></value></member>`
  ));
  const c = await a.TB.Api.getUserAttributes();
  assert.equal(c.STR, 130);   // floor((10*5+15)*2)
  assert.equal(c.DEX, 30);    // floor((0+15)*2)
});

await test('getCircle parses node colon-strings into number arrays', async () => {
  const a = makeApi();
  a.setXml(resp(
    `<member><name>16</name><value><string>3:0:0</string></value></member>` +
    `<member><name>8</name><value><string>120:0:0:0:0:15:5:2</string></value></member>`
  ));
  const circle = await a.TB.Api.getCircle();
  assert.equal(circle[16][0], 3);
  assert.equal(circle[8][0], 120);
  assert.equal(circle[8][5], 15);   // base, used by the buy-cost formula
});

await test('parseMap reads energy/next_attack/monsters WITHOUT a phantom outer struct', async () => {
  const a = makeApi();
  const mon = (loc, st) => `<value><struct>${m('location','i4',loc)+m('stars','i4',st)+m('picture_id','i4',1)+m('special_type','i4',0)}</struct></value>`;
  const doc = a.TB.Api.parseMap(new DOMParser().parseFromString(resp(
    m('energy', 'i4', 9) + m('energy_cost', 'i4', 1) + m('next_attack', 'i4', 1700001234) +
    `<member><name>monsters</name><value><array><data>${mon(2,3)+mon(5,1)}</data></array></value></member>`
  ), 'text/xml'));
  assert.equal(doc.energy, 9);
  assert.equal(doc.nextAttack, 1700001234);
  assert.equal(doc.monsters.length, 2, 'exactly two monsters - no phantom from the wrapper struct');
  assert.deepEqual(doc.monsters.map((x) => x.location).sort(), [2, 5]);
});

await test('fault: session faultString -> SESSION_EXPIRED + loggedIn false', async () => {
  const a = makeApi();
  a.TB.State.patch({ loggedIn: true });
  a.setXml(`<?xml version="1.0"?><methodResponse><fault><value><struct>${m('faultString','string','Session expired, please log in')}${m('faultCode','i4',401)}</struct></value></fault></methodResponse>`);
  await assert.rejects(a.TB.Api.miniUpdate(), /SESSION_EXPIRED/);
  assert.equal(a.TB.State.get().loggedIn, false);
  assert.ok(a.TB.State.get().sessionLost > 0);
});

await test('fault: ordinary faultString -> FAULT (does not flip session)', async () => {
  const a = makeApi();
  a.TB.State.patch({ loggedIn: true });
  a.setXml(`<?xml version="1.0"?><methodResponse><fault><value><struct>${m('faultString','string','Not enough gold')}</struct></value></fault></methodResponse>`);
  await assert.rejects(a.TB.Api.miniUpdate(), /^Error: FAULT:/);
  assert.equal(a.TB.State.get().loggedIn, true, 'ordinary fault must NOT log the user out');
});

console.log(`\n${pass} api checks passed.`);
