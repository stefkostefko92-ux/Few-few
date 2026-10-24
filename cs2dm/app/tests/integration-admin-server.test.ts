/**
 * Панелът срещу истинската база и Redis: банери (§8), сървърът през cs2-agent (двойник по
 * договора на агента, §9), нулиране на TOTP и проверка на одит-веригата (вкл. подправен ред).
 * Тестови SteamID-та 76561190000995xxx; чисти ги преди и след себе си.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AGENT_CHANNELS, UNAVAILABLE } from '../src/admin/commands.js';
import { RESTART_WAIT_MS } from '../src/admin/routes/server.js';
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

const ADMIN = '76561190000995001';
const HEAD = '76561190000995002';
const OWNER = '76561190000995003';
const IDS = [ADMIN, HEAD, OWNER];
const MAP = 'it_admin_server_test';

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

describe(
  'панел: банери, сървър, TOTP, одит',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    let close: () => Promise<void> = async () => {};
    const closers: Array<() => void> = [];
    const as: Record<string, Browser> = {};
    let agentGot: Received[] = [];
    let agentAnswer: (command: Received) => Answer = () => ({ ok: true });
    /** Одитът не се чисти (веригата) — проверките гледат само редовете от това пускане. */
    const since = new Date();

    async function wipe(): Promise<void> {
      await cleanup(db, IDS);
      await db.mapBanner.deleteMany({ where: { map: MAP } });
    }

    before(async () => {
      db = new PrismaClient();
      await wipe();
      await makePlayers(db, [
        { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
        { steamId: HEAD, name: 'IT Head', role: 'HEADADMIN' },
        { steamId: OWNER, name: 'IT Owner', role: 'OWNER' },
      ]);
      const agentKey = testKey();
      const agent = await fakePeer(AGENT_CHANNELS, agentKey, (command) => agentAnswer(command));
      agentGot = agent.received;
      const agentChannel = channel(AGENT_CHANNELS, agentKey);
      closers.push(agent.close, agentChannel.close);
      const app = await panelApp({
        db,
        live: memoryLive([]),
        bridge: UNAVAILABLE,
        agent: agentChannel.sender,
      });
      close = app.close;
      for (const [name, steamId] of Object.entries({ ADMIN, HEAD, OWNER })) {
        as[name] = new Browser(app.base);
        await enrol(as[name]!, steamId);
      }
    });

    after(async () => {
      await close();
      for (const fn of closers) fn();
      if (db) {
        await wipe();
        await db.$disconnect();
      }
    });

    test('банери: само главен админ; триенето е в одита', async () => {
      const banner = await db.mapBanner.create({
        data: {
          map: MAP,
          bannerKey: 'carbonstealth',
          x: 1,
          y: 2,
          z: 3,
          pitch: 0,
          yaw: 90,
          roll: 0,
          createdBy: HEAD,
        },
      });
      assert.equal((await as.ADMIN!.get('/admin/banners')).status, 403);
      assert.ok((await (await as.HEAD!.get('/admin/banners')).text()).includes(MAP));
      assert.equal(
        result(await as.HEAD!.send(`/admin/banners/${banner.id}/delete`, {}, '/admin/banners')),
        'saved',
      );
      assert.equal(await db.mapBanner.count({ where: { map: MAP } }), 0);
      const audit = await db.auditLog.findFirstOrThrow({
        orderBy: { id: 'desc' },
        where: { at: { gte: since }, action: 'banner.remove', actorSteamId: HEAD },
      });
      assert.equal((audit.details as { map?: string }).map, MAP);
    });

    test('сървърът през агента: статус и логове ADMIN+, рестарт HEADADMIN+, busy', async () => {
      agentAnswer = (command) => {
        if (command.action === 'status') {
          return {
            ok: true,
            data: {
              active: true,
              state: 'active',
              since: Date.now() - 60_000,
              gameVersion: '1.41.2.0',
              modsLoaded: true,
              broken: null,
              busy: null,
            },
          };
        }
        if (command.action === 'logs') {
          return {
            ok: true,
            data: { source: 'css', lines: ['player joined from 203.0.113.50:27005', 'ok line'] },
          };
        }
        return { ok: true };
      };
      assert.ok((await (await as.ADMIN!.get('/admin/server')).text()).includes('1.41.2.0'));
      const logs = await (await as.ADMIN!.get('/admin/server/logs?source=css&lines=50')).text();
      assert.ok(logs.includes('x.x.x.x') && !logs.includes('203.0.113.50'), 'редакция и в панела');
      assert.deepEqual(agentGot.find((c) => c.action === 'logs')?.args, {
        source: 'css',
        lines: 50,
      });

      assert.equal(
        (await as.ADMIN!.send('/admin/server/restart', {}, '/admin/server')).status,
        403,
      );
      assert.equal(
        result(await as.HEAD!.send('/admin/server/restart', {}, '/admin/server')),
        'sent',
      );
      assert.deepEqual(agentGot.at(-1), { action: 'restart', args: {}, actor: HEAD });
      for (const action of ['start', 'stop'] as const) {
        assert.equal(
          (await as.ADMIN!.send(`/admin/server/${action}`, {}, '/admin/server')).status,
          403,
        );
        assert.equal(
          result(await as.HEAD!.send(`/admin/server/${action}`, {}, '/admin/server')),
          'sent',
        );
        assert.deepEqual(agentGot.at(-1), { action, args: {}, actor: HEAD });
      }
      agentAnswer = () => ({ ok: false, error: 'busy' });
      assert.equal(
        result(await as.HEAD!.send('/admin/server/update', {}, '/admin/server')),
        'cmdBusy',
      );
      agentAnswer = () => ({
        ok: false,
        error: 'failed',
        data: { detail: 'systemctl: exit 1 at 10.1.2.3' },
      });
      const failed = await (await as.ADMIN!.get('/admin/server')).text();
      assert.ok(failed.includes('systemctl: exit 1 at x.x.x.x'));
      const audit = await db.auditLog.findMany({
        where: { actorSteamId: HEAD, action: { startsWith: 'server.' }, at: { gte: since } },
      });
      assert.deepEqual(audit.map((row) => row.action).sort(), [
        'server.restart',
        'server.start',
        'server.stop',
        'server.update',
      ]);

      // Рестартът: агентът чака systemd до 120 s — мълчанието е „още тече“, не грешка. Второ копие
      // на сайта със същата база (сесиите са в нея) и агент, който не отговаря навреме.
      const waits: Array<number | undefined> = [];
      const slow = await panelApp({
        db,
        live: memoryLive([]),
        bridge: UNAVAILABLE,
        agent: {
          send: async (_action, _args, _actor, options) => {
            waits.push(options?.timeoutMs);
            return { ok: false, error: 'timeout' };
          },
        },
      });
      try {
        const head = new Browser(slow.base);
        for (const [name, value] of as.HEAD!.cookies) head.cookies.set(name, value);
        assert.equal(
          result(await head.send('/admin/server/restart', {}, '/admin/server')),
          'cmdPending',
        );
        assert.equal(
          result(await head.send('/admin/server/stop', {}, '/admin/server')),
          'cmdPending',
        );
        assert.equal(
          result(await head.send('/admin/server/update', {}, '/admin/server')),
          'cmdTimeout',
        );
        assert.ok(waits.includes(RESTART_WAIT_MS) && RESTART_WAIT_MS < 30_000, 'под 30 s на nginx');
      } finally {
        await slow.close();
      }
    });

    test('нулиране на TOTP: само над целта; тайна, кодове и сесии изчезват', async () => {
      assert.equal(
        result(
          await as.HEAD!.send(`/admin/players/${OWNER}/totp-reset`, {}, `/admin/players/${OWNER}`),
        ),
        'immune',
      );
      assert.equal(
        result(
          await as.HEAD!.send(`/admin/players/${ADMIN}/totp-reset`, {}, `/admin/players/${ADMIN}`),
        ),
        'saved',
      );
      const admin = await db.player.findUniqueOrThrow({ where: { steamId: ADMIN } });
      assert.equal(admin.totpSecretEnc, null);
      assert.equal(admin.totpEnabledAt, null);
      assert.equal(await db.webRecoveryCode.count({ where: { steamId: ADMIN } }), 0);
      assert.equal(await db.webSession.count({ where: { steamId: ADMIN } }), 0);
      assert.equal((await as.ADMIN!.get('/admin')).headers.get('location'), '/admin/login');
    });

    test('одит-веригата: цяла; подправен ред се открива; върнат — пак цяла', async () => {
      assert.equal((await as.ADMIN!.get('/admin/audit')).status, 303, 'ADMIN е излязъл');
      const ok = await (await as.HEAD!.get('/admin/audit?verify=1')).text();
      assert.match(ok, /class="a-chip is-ok"/);
      const row = await db.auditLog.findFirstOrThrow({
        orderBy: { id: 'desc' },
        where: { at: { gte: since }, action: 'banner.remove', actorSteamId: HEAD },
      });
      const [original] = await db.$queryRaw<
        Array<{ text: string }>
      >`SELECT details::text AS text FROM audit_log WHERE id = ${row.id}`;
      try {
        await db.$executeRaw`UPDATE audit_log SET details = '{"tampered": true}'::jsonb WHERE id = ${row.id}`;
        const broken = await (await as.HEAD!.get('/admin/audit?verify=1')).text();
        assert.match(broken, /class="a-chip is-err"/);
        assert.ok(broken.includes(`${row.id}`));
      } finally {
        await db.$executeRaw`UPDATE audit_log SET details = ${original!.text}::jsonb WHERE id = ${row.id}`;
      }
      assert.match(
        await (await as.HEAD!.get('/admin/audit?verify=1')).text(),
        /class="a-chip is-ok"/,
      );
      const filtered = await (
        await as.HEAD!.get(`/admin/audit?action=server.&actor=${HEAD}`)
      ).text();
      assert.ok(filtered.includes('server.restart') && !filtered.includes('banner.remove'));
    });
  },
);
