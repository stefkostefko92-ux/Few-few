/**
 * Събитията по график (§12) срещу истинската база: права (ADMIN+), създаване/редакция/отмяна с одит,
 * без застъпване (панелът и EXCLUDE в базата), публичното четене. SteamID-та 76561190000998xxx;
 * трият се и събитията, създадени от тях.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { UNAVAILABLE } from '../src/admin/commands.js';
import { loadEvents } from '../src/data/public-extra.js';
import { utcToZonedInput } from '../src/events.js';
import {
  Browser,
  cleanup,
  enabled,
  enrol,
  makePlayers,
  memoryLive,
  panelApp,
} from './admin-harness.js';

const ADMIN = '76561190000998001';
const MOD = '76561190000998002';
const IDS = [ADMIN, MOD];
const TZ = 'Europe/Sofia';
const HOUR = 3_600_000;

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

/** Кръгъл час след `hours` часа — като стойността на полето datetime-local. */
function at(hours: number): string {
  return utcToZonedInput(new Date(Math.ceil(Date.now() / HOUR) * HOUR + hours * HOUR), TZ);
}

describe('панел: събития по график', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const as: Record<string, Browser> = {};
  const since = new Date();
  const form = (startH: number, endH: number, extra: Record<string, string> = {}) => ({
    kind: 'XP_BOOST',
    titleBg: 'Тест XP уикенд',
    titleEn: 'Test XP weekend',
    titleIt: 'Weekend XP di prova',
    startsAt: at(startH),
    endsAt: at(endH),
    xpMultiplier: '2',
    dmModeId: '',
    ...extra,
  });

  async function wipe(): Promise<void> {
    await db.scheduledEvent.deleteMany({ where: { createdBy: { in: IDS } } });
    await cleanup(db, IDS);
  }

  before(async () => {
    db = new PrismaClient();
    await wipe();
    await makePlayers(db, [
      { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
      { steamId: MOD, name: 'IT Mod', role: 'MODERATOR' },
    ]);
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: UNAVAILABLE,
      agent: UNAVAILABLE,
    });
    close = app.close;
    for (const [name, steamId] of Object.entries({ ADMIN, MOD })) {
      as[name] = new Browser(app.base);
      await enrol(as[name]!, steamId);
    }
  });

  after(async () => {
    await close();
    if (db) {
      await wipe();
      await db.$disconnect();
    }
  });

  test('само ADMIN+: модераторът не вижда и не пише', async () => {
    assert.equal((await as.MOD!.get('/admin/events')).status, 403);
    const csrf = await as.MOD!.csrf();
    assert.equal((await as.MOD!.post('/admin/events', { _csrf: csrf, ...form(1, 3) })).status, 403);
    assert.equal(await db.scheduledEvent.count({ where: { createdBy: { in: IDS } } }), 0);
  });

  test('създаване, застъпване, редакция и отмяна — с одит', async () => {
    const send = (path: string, body: Record<string, string>) =>
      as.ADMIN!.send(path, body, '/admin/events');
    assert.equal(result(await send('/admin/events', form(1, 3))), 'saved');
    assert.equal(result(await send('/admin/events', form(2, 4))), 'overlap');
    assert.equal(result(await send('/admin/events', form(3, 5))), 'saved', 'край = начало е ок');
    assert.equal(result(await send('/admin/events', form(6, 5))), 'invalid');
    const [first, second] = await db.scheduledEvent.findMany({
      where: { createdBy: ADMIN },
      orderBy: { startsAt: 'asc' },
    });
    assert.ok(first && second);
    assert.equal(first.xpMultiplier.toFixed(1), '2.0');
    assert.equal(
      result(await send(`/admin/events/${first.id}`, form(1, 4, { kind: 'MODE', dmModeId: '2' }))),
      'overlap',
      'редакция към застъпване',
    );
    assert.equal(
      result(await send(`/admin/events/${first.id}`, form(1, 2, { kind: 'MODE', dmModeId: '2' }))),
      'saved',
    );
    assert.equal(
      (await db.scheduledEvent.findUniqueOrThrow({ where: { id: first.id } })).dmModeId,
      2,
    );
    assert.equal(result(await send(`/admin/events/${second.id}/cancel`, {})), 'saved');
    assert.equal(result(await send(`/admin/events/${second.id}/cancel`, {})), 'notActive');
    assert.equal(result(await send('/admin/events', form(3, 5))), 'saved', 'отмененото не пречи');
    const audit = await db.auditLog.findMany({
      where: { actorSteamId: ADMIN, action: { startsWith: 'event.' }, at: { gte: since } },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(
      audit.map((row) => row.action),
      ['event.create', 'event.create', 'event.update', 'event.cancel', 'event.create'],
    );
    const update = audit[2]!.details as {
      before: { kind: string };
      after: { kind: string; dmModeId: number };
    };
    assert.equal(update.before.kind, 'XP_BOOST');
    assert.deepEqual([update.after.kind, update.after.dmModeId], ['MODE', 2]);
    const page = await (await as.ADMIN!.get('/admin/events')).text();
    assert.ok(page.includes('Тест XP уикенд') && page.includes('name="startsAt"'));
  });

  test('базата сама отказва застъпване (EXCLUDE), дори панелът да го пропусне', async () => {
    const base = Math.ceil(Date.now() / HOUR) * HOUR;
    await assert.rejects(
      db.scheduledEvent.create({
        data: {
          kind: 'COMMUNITY',
          titleBg: 'x',
          titleEn: 'x',
          titleIt: 'x',
          startsAt: new Date(base + 1.5 * HOUR),
          endsAt: new Date(base + 1.75 * HOUR),
          createdBy: ADMIN,
        },
      }),
      /events_no_overlap|23P01|exclusion/i,
    );
  });

  test('публичното четене: само неотменени, текущи и предстоящи', async () => {
    const events = (await loadEvents(db, new Date())).filter(
      (e) => e.titles.bg === 'Тест XP уикенд',
    );
    assert.equal(events.length, 2);
    assert.equal(events[0]?.modeName, 'Only Deagle');
    assert.equal(events[1]?.xpTenths, 20);
  });
});
