/**
 * Плъгините от панела (CONTRACT §14) срещу истинската база и Redis: двойник на cs2-agent (`plugins`,
 * `plugin`) и двойник на C# плъгина (`plugins.load|unload`, `plugins.config.*`). Редът на командите,
 * правото (HEADADMIN+), отказът без команда при невалиден вход и одитът без съдържанието на конфига.
 * Тестови SteamID-та 76561190000999xxx; чисти ги преди и след себе си.
 */
import './env.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AGENT_CHANNELS, BRIDGE_CHANNELS } from '../src/admin/commands.js';
import {
  Browser,
  channel,
  cleanup,
  enabled,
  enrol,
  fakePeer,
  makePlayers,
  memoryLive,
  panelApp,
  testKey,
  type Answer,
  type Received,
} from './admin-harness.js';

const ADMIN = '76561190000999001';
const HEAD = '76561190000999002';
const IDS = [ADMIN, HEAD];

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

const LIST = {
  busy: false,
  mods: [
    { id: 'serverlistplayersfix', kind: 'metamod', version: '2.1', state: 'enabled' },
    { id: 'quakesounds', kind: 'css', version: '26.08.1', state: 'enabled' },
    { id: 'cosmetics', kind: 'css', version: '26.05.1', state: 'removed' },
    { id: 'demorecorder', kind: 'css', version: '26.05.1', state: 'enabled' },
    { id: 'cheatertroll', kind: 'css', version: '26.08.1', state: 'enabled' },
    { id: 'metablock', kind: 'css', version: '1.0.0', state: 'disabled' },
  ],
};

describe('панел: плъгините (§14)', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const closers: Array<() => void> = [];
  const as: Record<string, Browser> = {};
  /** Общият ред на командите към двата двойника — „кой пръв“. */
  const order: string[] = [];
  let agentGot: Received[] = [];
  let pluginGot: Received[] = [];
  let agentAnswer: (command: Received) => Answer = () => ({ ok: true });
  let pluginAnswer: (command: Received) => Answer = () => ({ ok: true });
  const since = new Date();

  before(async () => {
    db = new PrismaClient();
    await cleanup(db, IDS);
    await makePlayers(db, [
      { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
      { steamId: HEAD, name: 'IT Head', role: 'HEADADMIN' },
    ]);
    const agentKey = testKey();
    const bridgeKey = testKey();
    const agent = await fakePeer(AGENT_CHANNELS, agentKey, (command) => {
      order.push(`agent:${command.action}`);
      return agentAnswer(command);
    });
    const plugin = await fakePeer(BRIDGE_CHANNELS, bridgeKey, (command) => {
      order.push(`plugin:${command.action}`);
      return pluginAnswer(command);
    });
    agentGot = agent.received;
    pluginGot = plugin.received;
    const agentChannel = channel(AGENT_CHANNELS, agentKey);
    const bridgeChannel = channel(BRIDGE_CHANNELS, bridgeKey);
    closers.push(agent.close, plugin.close, agentChannel.close, bridgeChannel.close);
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: bridgeChannel.sender,
      agent: agentChannel.sender,
    });
    close = app.close;
    for (const [name, steamId] of Object.entries({ ADMIN, HEAD })) {
      as[name] = new Browser(app.base);
      await enrol(as[name]!, steamId);
    }
  });

  after(async () => {
    await close();
    for (const fn of closers) fn();
    if (db) {
      await cleanup(db, IDS);
      await db.$disconnect();
    }
  });

  /** Командите, получени след `mark` — за „нищо не е изпратено“. */
  const sentSince = (mark: number) => order.slice(mark);

  test('списъкът: само HEADADMIN+; бутоните по състоянието; ядрото без действия', async () => {
    agentAnswer = (command) =>
      command.action === 'plugins' ? { ok: true, data: LIST } : { ok: true };
    assert.equal((await as.ADMIN!.get('/admin/plugins')).status, 403);
    const html = await (await as.HEAD!.get('/admin/plugins')).text();
    assert.deepEqual(agentGot.at(-1), { action: 'plugins', args: {}, actor: HEAD });
    for (const action of [
      '/admin/plugins/quakesounds/disable',
      '/admin/plugins/quakesounds/remove',
      '/admin/plugins/cosmetics/install',
      '/admin/plugins/metablock/enable',
      '/admin/plugins/quakesounds/config',
    ]) {
      assert.ok(html.includes(action), action);
    }
    assert.ok(!html.includes('/admin/plugins/cosmetics/config'), 'без конфиг за неинсталиран');
    assert.ok(!html.includes('/admin/plugins/cosmetics/remove'));
    assert.ok(!html.includes('/admin/plugins/metamod/'), 'ядрото не се пипа');
    assert.ok(html.includes('26.08.1'));

    // Зает агент → без бутони; недостъпен агент → каталогът без действия.
    agentAnswer = () => ({ ok: true, data: { ...LIST, busy: true } });
    assert.ok(!(await (await as.HEAD!.get('/admin/plugins')).text()).includes('/disable"'));
    agentAnswer = () => ({ ok: false, error: 'failed', data: { detail: 'boom at 10.1.2.3' } });
    const down = await (await as.HEAD!.get('/admin/plugins')).text();
    assert.ok(down.includes('boom at x.x.x.x') && !down.includes('10.1.2.3'));
    assert.ok(!down.includes('/install"') && down.includes('quakesounds'));
  });

  test('спиране/пускане: редът на командите и живият ефект; metamod — след рестарт', async () => {
    agentAnswer = () => ({ ok: true });
    pluginAnswer = () => ({ ok: true });
    assert.equal((await as.ADMIN!.send('/admin/plugins/quakesounds/disable')).status, 403);

    let mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/quakesounds/disable')), 'sent');
    assert.deepEqual(sentSince(mark), ['plugin:plugins.unload', 'agent:plugin']);
    assert.deepEqual(pluginGot.at(-1), {
      action: 'plugins.unload',
      args: { id: 'quakesounds' },
      actor: HEAD,
    });
    assert.deepEqual(agentGot.at(-1), {
      action: 'plugin',
      args: { op: 'disable', id: 'quakesounds' },
      actor: HEAD,
    });

    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/metablock/enable')), 'sent');
    assert.deepEqual(sentSince(mark), ['agent:plugin', 'plugin:plugins.load']);
    assert.deepEqual(pluginGot.at(-1)?.args, { id: 'metablock' });

    // Сървърът е спрян: файловете се местят, живият ефект не стига → „след рестарт“.
    pluginAnswer = () => null;
    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/quakesounds/enable')), 'pluginRestart');
    pluginAnswer = () => ({ ok: true });

    mark = order.length;
    assert.equal(
      result(await as.HEAD!.send('/admin/plugins/serverlistplayersfix/disable')),
      'pluginRestart',
    );
    assert.deepEqual(sentSince(mark), ['agent:plugin'], 'metamod — без мост');

    agentAnswer = () => ({ ok: false, error: 'busy' });
    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/metablock/enable')), 'cmdBusy');
    assert.deepEqual(sentSince(mark), ['agent:plugin'], 'зает агент → без живо зареждане');
    // Спрян на живо, но агентът отказа → пуска се обратно (файловете още казват „работи“).
    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/quakesounds/disable')), 'cmdBusy');
    assert.deepEqual(sentSince(mark), [
      'plugin:plugins.unload',
      'agent:plugin',
      'plugin:plugins.load',
    ]);
    agentAnswer = () => ({ ok: true });
  });

  test('инсталиране/премахване: само агентът (--no-block) → „пуснато“', async () => {
    let mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/cosmetics/install')), 'pluginQueued');
    assert.deepEqual(sentSince(mark), ['agent:plugin']);
    assert.deepEqual(agentGot.at(-1)?.args, { op: 'install', id: 'cosmetics' });
    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/demorecorder/remove')), 'pluginQueued');
    assert.deepEqual(agentGot.at(-1)?.args, { op: 'remove', id: 'demorecorder' });
    assert.deepEqual(sentSince(mark), ['agent:plugin']);
  });

  test('невалиден id или действие → нищо не тръгва', async () => {
    const mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/evil/install')), 'invalid');
    assert.equal(result(await as.HEAD!.send('/admin/plugins/metamod/disable')), 'invalid');
    assert.equal((await as.HEAD!.send('/admin/plugins/quakesounds/explode')).status, 404);
    assert.equal(
      result(await as.HEAD!.send('/admin/plugins/cheatertroll/config/reset')),
      'invalid',
      'CheaterTroll няма „по подразбиране“',
    );
    assert.equal((await as.HEAD!.get('/admin/plugins/serverlistplayersfix/config')).status, 404);
    assert.deepEqual(sentSince(mark), []);
  });

  test('конфигът: четене, проверка преди изпращане, запис без съдържание в одита, нулиране', async () => {
    const original = '{\n  "enabled": true,\n  "note": "<b>x</b>"\n}';
    pluginAnswer = (command) =>
      command.action === 'plugins.config.get'
        ? { ok: true, data: { text: original, edited: false, hasDefault: true } }
        : { ok: true };
    const page = await (await as.HEAD!.get('/admin/plugins/quakesounds/config')).text();
    assert.ok(page.includes('&lt;b&gt;x&lt;/b&gt;') && !page.includes('<b>x</b>'), 'екраниран');
    assert.ok(page.includes('/admin/plugins/quakesounds/config/reset'));
    assert.deepEqual(pluginGot.at(-1), {
      action: 'plugins.config.get',
      args: { id: 'quakesounds' },
      actor: HEAD,
    });

    let mark = order.length;
    for (const text of ['{"enabled": ', '[1, 2]', 'null', '']) {
      assert.equal(
        result(await as.HEAD!.send('/admin/plugins/quakesounds/config', { text })),
        'invalid',
        text,
      );
    }
    assert.deepEqual(sentSince(mark), [], 'невалиден JSON не стига до сървъра');

    // Голям конфиг (над общия таван от 16 KB на формата) минава през своя по-широк парсер.
    const secret = 'MARKER-not-in-audit';
    const text = JSON.stringify({ enabled: true, marker: secret, pad: 'x'.repeat(30_000) });
    mark = order.length;
    assert.equal(
      result(await as.HEAD!.send('/admin/plugins/quakesounds/config', { text })),
      'sent',
    );
    assert.deepEqual(pluginGot.at(-1), {
      action: 'plugins.config.set',
      args: { id: 'quakesounds', text },
      actor: HEAD,
    });
    const row = await db.auditLog.findFirstOrThrow({
      orderBy: { id: 'desc' },
      where: { at: { gte: since }, action: 'plugin.config', actorSteamId: HEAD },
    });
    assert.deepEqual(row.details, {
      id: 'quakesounds',
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      ok: true,
    });
    assert.ok(!JSON.stringify(row.details).includes(secret));

    pluginAnswer = () => ({ ok: false, error: 'invalid json' });
    assert.equal(
      result(await as.HEAD!.send('/admin/plugins/quakesounds/config', { text: '{}' })),
      'invalid',
    );
    pluginAnswer = () => ({ ok: true });
    mark = order.length;
    assert.equal(result(await as.HEAD!.send('/admin/plugins/quakesounds/config/reset')), 'sent');
    assert.deepEqual(sentSince(mark), ['plugin:plugins.config.reset']);
    pluginAnswer = () => ({ ok: false, error: 'no default' });
    assert.equal(
      result(await as.HEAD!.send('/admin/plugins/metablock/config/reset')),
      'cmdNoDefault',
    );
    // Спрян сървър: страницата казва защо, без формата.
    pluginAnswer = () => null;
    const offline = await (await as.HEAD!.get('/admin/plugins/metablock/config')).text();
    assert.ok(!offline.includes('name="text"'));
    pluginAnswer = () => ({ ok: true });
  });

  test('одитът: всяко действие с id и резултат', async () => {
    const rows = await db.auditLog.findMany({
      where: { actorSteamId: HEAD, action: { startsWith: 'plugin.' }, at: { gte: since } },
    });
    const actions = new Set(rows.map((row) => row.action));
    for (const action of [
      'plugin.disable',
      'plugin.enable',
      'plugin.install',
      'plugin.remove',
      'plugin.config',
      'plugin.config_reset',
    ]) {
      assert.ok(actions.has(action), action);
    }
    const busy = rows.find(
      (row) => row.action === 'plugin.enable' && (row.details as { ok?: boolean }).ok === false,
    );
    assert.deepEqual(busy?.details, { id: 'metablock', ok: false, error: 'busy' });
  });
});
