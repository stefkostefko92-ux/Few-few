import { test, expect } from '@playwright/test';
import { apiRegister, apiCreateCharacter, adminBumpCharacter, adminToken, uniqueSuffix, uniqueNameSuffix, type TestUser } from './helpers';

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const needsAdmin = () => test.skip(!adminToken(), 'NEXUS_E2E_ADMIN_TOKEN not set — виж e2e/README.md');

test.describe('фракции', () => {
  needsAdmin();

  test('успешен път: достатъчен ранг + злато → покупка от вендора', async ({ request }) => {
    const u = await apiRegister(request, 'facok');
    const c = await apiCreateCharacter(request, u, `Fac${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, c.character.id, { gold: 10_000 });
    const token = adminToken()!;
    await request.put(`/api/admin/characters/${c.character.id}/reputation/iron_watch`, { headers: { Authorization: `Bearer ${token}` }, data: { rep: 500 } });
    const r = await request.post('/api/faction/iron_watch/vendor/buy', { headers: auth(u), data: { slug: 'elite_armor_4' } });
    expect(r.ok()).toBeTruthy();
  });

  test('гранично: недостатъчен ранг → 403', async ({ request }) => {
    const u = await apiRegister(request, 'faclow');
    const c = await apiCreateCharacter(request, u, `FacL${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    await adminBumpCharacter(request, c.character.id, { gold: 10_000 });
    const r = await request.post('/api/faction/iron_watch/vendor/buy', { headers: auth(u), data: { slug: 'gorvak_mace' } }); // tier 4
    expect(r.status()).toBe(403);
  });

  test('гранично: непознат предмет във вендора → 404', async ({ request }) => {
    const u = await apiRegister(request, 'facbad');
    await apiCreateCharacter(request, u, `FacB${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const r = await request.post('/api/faction/iron_watch/vendor/buy', { headers: auth(u), data: { slug: 'no-such-item' } });
    expect(r.status()).toBe(404);
  });
});

test.describe('маунт', () => {
  needsAdmin();

  test('успешен път: купи и екипирай маунт', async ({ request }) => {
    const u = await apiRegister(request, 'mountok');
    const c = await apiCreateCharacter(request, u, `Mnt${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, c.character.id, { gems: 10_000 });
    const catalog = await (await request.get('/api/mount', { headers: auth(u) })).json();
    const cheapest = [...catalog.catalog].sort((a: any, b: any) => a.gem_cost - b.gem_cost)[0];
    const buy = await request.post('/api/mount/buy', { headers: auth(u), data: { slug: cheapest.slug } });
    expect(buy.ok()).toBeTruthy();
  });

  test('гранично: недостатъчно гемове → 400', async ({ request }) => {
    const u = await apiRegister(request, 'mountpoor');
    await apiCreateCharacter(request, u, `MntP${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const catalog = await (await request.get('/api/mount', { headers: auth(u) })).json();
    const r = await request.post('/api/mount/buy', { headers: auth(u), data: { slug: catalog.catalog[0].slug } });
    expect(r.status()).toBe(400);
  });

  test('гранично: паралелна двойна покупка на един маунт — плаща се веднъж', async ({ request }) => {
    const u = await apiRegister(request, 'mountrace');
    const c = await apiCreateCharacter(request, u, `MntR${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    await adminBumpCharacter(request, c.character.id, { gems: 10_000 });
    const catalog = await (await request.get('/api/mount', { headers: auth(u) })).json();
    const slug = catalog.catalog[0].slug;
    const [r1, r2] = await Promise.all([
      request.post('/api/mount/buy', { headers: auth(u), data: { slug } }),
      request.post('/api/mount/buy', { headers: auth(u), data: { slug } }),
    ]);
    const statuses = [r1.status(), r2.status()];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
  });
});

test.describe('световен бос', () => {
  needsAdmin();

  test('успешен път: удар по боса', async ({ request }) => {
    const u = await apiRegister(request, 'bossok');
    const c = await apiCreateCharacter(request, u, `Boss${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, c.character.id, { level: 120 });
    const r = await request.post('/api/realm-boss/strike', { headers: auth(u) });
    expect(r.ok()).toBeTruthy();
  });

  test('гранично: под ниво 100 → 400', async ({ request }) => {
    const u = await apiRegister(request, 'bosslow');
    await apiCreateCharacter(request, u, `BossL${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const r = await request.post('/api/realm-boss/strike', { headers: auth(u) });
    expect(r.status()).toBe(400);
  });

  test('гранично: паралелен двоен удар не удвоява щетата извън cooldown-а', async ({ request }) => {
    const u = await apiRegister(request, 'bossrace');
    const c = await apiCreateCharacter(request, u, `BossR${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    await adminBumpCharacter(request, c.character.id, { level: 120 });
    const [r1, r2] = await Promise.all([
      request.post('/api/realm-boss/strike', { headers: auth(u) }),
      request.post('/api/realm-boss/strike', { headers: auth(u) }),
    ]);
    const statuses = [r1.status(), r2.status()];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
  });
});

test.describe('известия', () => {
  test('успешен път: маркирай като прочетено', async ({ request }) => {
    const u = await apiRegister(request, 'notifok');
    await apiCreateCharacter(request, u, `Ntf${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.post('/api/notifications/read', { headers: auth(u), data: {} });
    expect(r.ok()).toBeTruthy();
  });

  test('гранично: неавтентикирано → 401', async ({ request }) => {
    const r = await request.post('/api/notifications/read', { data: {} });
    expect(r.status()).toBe(401);
  });
});

test.describe('профил', () => {
  test('успешен път: преименуване', async ({ request }) => {
    needsAdmin();
    const u = await apiRegister(request, 'profren');
    const c = await apiCreateCharacter(request, u, `Pr${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    await adminBumpCharacter(request, c.character.id, { gold: 500 }); // rename costs 250g
    const newName = `Renamed${Math.floor(Math.random() * 1e6)}`.slice(0, 20);
    const r = await request.post('/api/profile/rename', { headers: auth(u), data: { name: newName } });
    expect(r.ok()).toBeTruthy();
  });

  test('гранично: невалидно име (започва с цифра) → 400', async ({ request }) => {
    const u = await apiRegister(request, 'profbad');
    await apiCreateCharacter(request, u, `Pb${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const r = await request.post('/api/profile/rename', { headers: auth(u), data: { name: '1InvalidName' } });
    expect(r.status()).toBe(400);
  });

  test('гранично: козметика с непозволено дълго bio → 400', async ({ request }) => {
    const u = await apiRegister(request, 'profcos');
    await apiCreateCharacter(request, u, `Pc${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.post('/api/profile/cosmetics', { headers: auth(u), data: { bio: 'x'.repeat(501) } });
    expect(r.status()).toBe(400);
  });
});

test.describe('акаунт — смяна на парола / изтриване / GDPR експорт', () => {
  test('успешен път: смяна на парола → старата вече не работи, новата работи', async ({ request }) => {
    const u = await apiRegister(request, 'pwok');
    await apiCreateCharacter(request, u, `Pw${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const change = await request.post('/api/account/password', { headers: auth(u), data: { current: u.password, next: 'NewPassword123' } });
    expect(change.ok()).toBeTruthy();

    const oldLogin = await request.post('/api/auth/login', { data: { username: u.username, password: u.password } });
    expect(oldLogin.status()).toBe(401);
    const newLogin = await request.post('/api/auth/login', { data: { username: u.username, password: 'NewPassword123' } });
    expect(newLogin.ok()).toBeTruthy();
  });

  test('гранично: грешна текуща парола → 401, паролата остава непроменена', async ({ request }) => {
    const u = await apiRegister(request, 'pwwrong');
    await apiCreateCharacter(request, u, `PwW${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const change = await request.post('/api/account/password', { headers: auth(u), data: { current: 'WrongCurrentPass1', next: 'AnotherNew123' } });
    expect(change.status()).toBe(401);
    const stillOldLogin = await request.post('/api/auth/login', { data: { username: u.username, password: u.password } });
    expect(stillOldLogin.ok()).toBeTruthy();
  });

  test('успешен път: GDPR експорт съдържа героя, без парола хеш', async ({ request }) => {
    const u = await apiRegister(request, 'export');
    await apiCreateCharacter(request, u, `Ex${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.get('/api/account/export', { headers: auth(u) });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.characters.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('password_hash');
  });

  test('гранично: изтриване на акаунт с грешна парола → 401, акаунтът оцелява', async ({ request }) => {
    const u = await apiRegister(request, 'delwrong');
    await apiCreateCharacter(request, u, `DelW${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const del = await request.post('/api/account/delete-account', { headers: auth(u), data: { password: 'WrongPass1', confirm: 'DELETE MY ACCOUNT' } });
    expect(del.status()).toBe(401);
    const login = await request.post('/api/auth/login', { data: { username: u.username, password: u.password } });
    expect(login.ok()).toBeTruthy();
  });

  test('успешен път: изтриване на акаунт → последващ вход отказан', async ({ request }) => {
    const u = await apiRegister(request, 'delok');
    await apiCreateCharacter(request, u, `DelO${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const del = await request.post('/api/account/delete-account', { headers: auth(u), data: { password: u.password, confirm: 'DELETE MY ACCOUNT' } });
    expect(del.ok()).toBeTruthy();
    const login = await request.post('/api/auth/login', { data: { username: u.username, password: u.password } });
    expect(login.status()).toBe(401);
  });
});
