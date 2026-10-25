/**
 * Панелът срещу истинската база: вход със Steam (двойник — нула заявки към Steam), задължителен
 * TOTP, сесии, CSRF, изход при смяна на роля. Пропуска се чисто без DATABASE_URL.
 * Тестови SteamID-та 76561190000991xxx; чисти ги преди и след себе си (одитът остава — веригата).
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { UNAVAILABLE } from '../src/admin/commands.js';
import { sha256Hex } from '../src/admin/crypto.js';
import { translate } from '../src/i18n.js';
import {
  Browser,
  cleanup,
  codeAt,
  codeFor,
  enabled,
  enrol,
  makePlayers,
  memoryLive,
  panelApp,
  steamLogin,
} from './admin-harness.js';
import { decode } from './helpers.js';

const HELPER = '76561190000991001';
const PLAYER = '76561190000991002';
const MOD = '76561190000991004';
const STRANGER = '76561190000991009';
const IDS = [HELPER, PLAYER, MOD, STRANGER];

describe('панел: вход, TOTP, сесии', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let base = '';
  let close: () => Promise<void> = async () => {};
  let modSecret = '';
  /** Одитът не се чисти (веригата) — проверките гледат само редовете от това пускане. */
  const since = new Date();

  before(async () => {
    db = new PrismaClient();
    await cleanup(db, IDS);
    await makePlayers(db, [
      { steamId: HELPER, name: 'IT Helper', role: 'HELPER' },
      { steamId: PLAYER, name: 'IT Player', role: 'PLAYER' },
      { steamId: MOD, name: 'IT Mod', role: 'MODERATOR' },
    ]);
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: UNAVAILABLE,
      agent: UNAVAILABLE,
    });
    base = app.base;
    close = app.close;
  });

  after(async () => {
    await close();
    if (db) {
      await cleanup(db, IDS);
      await db.$disconnect();
    }
  });

  test('играч без роля и непознат SteamID: отказ без сесия', async () => {
    for (const steamId of [PLAYER, STRANGER]) {
      const browser = new Browser(base);
      const response = await steamLogin(browser, steamId);
      assert.equal(response.status, 403);
      assert.ok(
        decode(await response.text()).includes(translate('bg', 'admin.login.error.denied')),
      );
      assert.ok(!browser.cookies.has('__Host-cs2dm_sid'));
    }
    assert.equal(await db.webSession.count({ where: { steamId: { in: [PLAYER, STRANGER] } } }), 0);
  });

  test('помощник: само записването на TOTP, докато не го включи; после пълен вход', async () => {
    const browser = new Browser(base);
    const login = await steamLogin(browser, HELPER);
    assert.equal(login.headers.get('location'), '/admin/2fa/setup');
    const pending = browser.cookies.get('__Host-cs2dm_sid') ?? '';
    for (const path of ['/admin', '/admin/punishments', '/admin/players']) {
      assert.equal((await browser.get(path)).headers.get('location'), '/admin/2fa/setup', path);
    }
    const setup = await (await browser.get('/admin/2fa/setup')).text();
    assert.match(setup, /<img class="a-qr" src="data:image\/png;base64,/);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(setup)?.[1] ?? '';
    const wrong = await browser.post('/admin/2fa/setup', { _csrf: csrf, code: '000000' });
    assert.equal(wrong.status, 400);

    const secret = (/class="a-secret"><code>([A-Z2-7 ]+)</.exec(setup)?.[1] ?? '').replace(
      / /g,
      '',
    );
    const done = await browser.post('/admin/2fa/setup', { _csrf: csrf, code: codeFor(secret) });
    assert.equal(done.status, 200);
    const codes = [...(await done.text()).matchAll(/<code>([a-z0-9]{5}-[a-z0-9]{5})<\/code>/g)];
    assert.equal(codes.length, 10);
    const active = browser.cookies.get('__Host-cs2dm_sid') ?? '';
    assert.notEqual(active, pending, 'нов токен след втория фактор');

    // В базата: тайната е шифрована, кодовете — само HMAC, токенът — само sha256.
    const player = await db.player.findUniqueOrThrow({ where: { steamId: HELPER } });
    assert.ok(player.totpEnabledAt && player.totpSecretEnc);
    assert.ok(!player.totpSecretEnc.includes(secret));
    const stored = await db.webRecoveryCode.findMany({ where: { steamId: HELPER } });
    assert.equal(stored.length, 10);
    assert.ok(stored.every((row) => /^[0-9a-f]{64}$/.test(row.codeHash)));
    assert.ok(!stored.some((row) => codes.some((m) => row.codeHash.includes(m[1]!))));
    const session = await db.webSession.findFirstOrThrow({ where: { steamId: HELPER } });
    assert.equal(session.tokenHash, sha256Hex(active));
    assert.equal(session.mfaPassed, true);
    assert.ok(session.expiresAt.getTime() - session.createdAt.getTime() <= 12 * 3_600_000);

    const old = new Browser(base);
    old.cookies.set('__Host-cs2dm_sid', pending);
    assert.equal((await old.get('/admin')).headers.get('location'), '/admin/login');

    const dash = await browser.get('/admin');
    assert.equal(dash.status, 200);
    const html = await dash.text();
    assert.match(html, /href="\/admin\/punishments"/);
    assert.doesNotMatch(html, /href="\/admin\/(vip|audit|server|banners|appeals)"/);
    for (const path of ['/admin/vip', '/admin/audit', '/admin/server', '/admin/appeals']) {
      assert.equal((await browser.get(path)).status, 403, path);
    }

    const audit = await db.auditLog.findMany({
      where: { actorSteamId: HELPER, source: 'WEB', at: { gte: since } },
    });
    assert.ok(audit.some((row) => row.action === 'totp.enable'));
    assert.ok(audit.some((row) => row.action === 'web.login'));
    assert.ok(
      audit.every((row) => /^[0-9a-f]{64}$/.test(row.hash ?? '')),
      'hash от тригера',
    );

    // CSRF: без токен, с чужд Origin — отказ; с токена — минава.
    assert.equal((await browser.post('/admin/lang', { lang: 'en' })).status, 403);
    const token = await browser.csrf();
    const foreign = await browser.post(
      '/admin/lang',
      { _csrf: token, lang: 'en' },
      { origin: 'https://evil.example' },
    );
    assert.equal(foreign.status, 403);
    const lang = await browser.post('/admin/lang', {
      _csrf: token,
      lang: 'en',
      to: '/admin/players',
    });
    assert.equal(lang.headers.get('location'), '/admin/players');
    assert.ok(
      (await (await browser.get('/admin')).text()).includes(
        translate('en', 'admin.dashboard.title'),
      ),
    );
    const evil = await browser.post('/admin/lang', {
      _csrf: token,
      lang: 'bg',
      to: '//evil.example',
    });
    assert.equal(evil.headers.get('location'), '/admin', 'само към страница на панела');

    // Изход: сесията изчезва от базата.
    await browser.send('/admin/logout');
    assert.equal(await db.webSession.count({ where: { steamId: HELPER } }), 0);
    assert.equal((await browser.get('/admin')).headers.get('location'), '/admin/login');

    // Нов вход: пет грешни кода → сесията пада; после резервен код — еднократен.
    const again = new Browser(base);
    assert.equal((await steamLogin(again, HELPER)).headers.get('location'), '/admin/2fa');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await again.send('/admin/2fa', { code: '123456' }, '/admin/2fa');
      if (attempt < 5) assert.equal(result.status, 400, `опит ${attempt}`);
      else assert.equal(result.headers.get('location'), '/admin/login?e=locked');
    }
    assert.equal(await db.webSession.count({ where: { steamId: HELPER } }), 0);
    const third = new Browser(base);
    await steamLogin(third, HELPER);
    const recovery = codes[0]![1]!;
    const ok = await third.send('/admin/2fa', { code: recovery.toUpperCase() }, '/admin/2fa');
    assert.equal(ok.headers.get('location'), '/admin');
    const fourth = new Browser(base);
    await steamLogin(fourth, HELPER);
    assert.equal((await fourth.send('/admin/2fa', { code: recovery }, '/admin/2fa')).status, 400);

    // Нов комплект резервни кодове — срещу текущ код от приложението.
    const renewed = await third.send('/admin/account/recovery', { code: codeFor(secret, 1) });
    assert.equal(renewed.status, 200);
    assert.equal(await db.webRecoveryCode.count({ where: { steamId: HELPER, usedAt: null } }), 10);
  });

  test('смяна на ролята откъдето и да е → изход на всички устройства', async () => {
    const browser = new Browser(base);
    modSecret = (await enrol(browser, MOD)).secret;
    assert.equal((await browser.get('/admin/appeals')).status, 200);
    // Както би го направил плъгинът (`!admin` в играта): само players.role.
    await db.player.update({ where: { steamId: MOD }, data: { role: 'HELPER' } });
    assert.equal((await browser.get('/admin')).headers.get('location'), '/admin/login');
    assert.equal(await db.webSession.count({ where: { steamId: MOD } }), 0);
    await db.player.update({ where: { steamId: MOD }, data: { role: 'PLAYER' } });
    assert.equal((await steamLogin(new Browser(base), MOD)).status, 403);
  });

  test('изход от всички устройства', async () => {
    await db.player.update({ where: { steamId: MOD }, data: { role: 'MODERATOR' } });
    const browser = new Browser(base);
    assert.equal((await steamLogin(browser, MOD)).headers.get('location'), '/admin/2fa');
    // Стъпката от записването вече е изразходвана — същата не минава втори път, следващата — да.
    const used = (await db.player.findUniqueOrThrow({ where: { steamId: MOD } })).totpLastStep ?? 0;
    const replay = await browser.send(
      '/admin/2fa',
      { code: codeAt(modSecret, used) },
      '/admin/2fa',
    );
    assert.equal(replay.status, 400);
    const ok = await browser.send(
      '/admin/2fa',
      { code: codeAt(modSecret, used + 1) },
      '/admin/2fa',
    );
    assert.equal(ok.headers.get('location'), '/admin');
    await steamLogin(new Browser(base), MOD);
    assert.equal(await db.webSession.count({ where: { steamId: MOD } }), 2);
    const out = await browser.send('/admin/account/logout-all');
    assert.equal(out.headers.get('location'), '/admin/login');
    assert.equal(await db.webSession.count({ where: { steamId: MOD } }), 0);
  });
});
