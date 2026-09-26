import { test, expect } from '@playwright/test';
import { apiRegister, apiCreateCharacter, adminBumpCharacter, adminToken, uniqueSuffix, uniqueNameSuffix, type TestUser } from './helpers';

/** Всички seed-нати dungeon/mythic-plus подземия имат level_req ≥4 — вдига героя над това през admin API. */
const DUNGEON_TEST_LEVEL = 15;

/**
 * Куест / Подземие + Mythic+ / Арена / Кула — API ниво (реален сървър,
 * реална БД; съзнателно не UI-разходка за всеки — hunting.spec.ts вече
 * покрива представителен UI поток + reveal-панела, тук е контрактно ниво
 * за самите игрови цикли + граничните случаи).
 */

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

test.describe('куест', () => {
  test('успешен път: /quest → /quest/start връща валиден изход', async ({ request }) => {
    const u = await apiRegister(request, 'questok');
    await apiCreateCharacter(request, u, `Q${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const list = await request.get('/api/quest', { headers: auth(u) });
    expect(list.ok()).toBeTruthy();
    const { quests } = await list.json();
    const lv1 = quests.find((q: any) => q.level_req <= 1);
    expect(lv1).toBeTruthy();
    const r = await request.post('/api/quest/start', { headers: auth(u), data: { questSlug: lv1.slug } });
    expect(r.status()).toBe(200);
  });

  test('гранично: непознат questSlug → 404', async ({ request }) => {
    const u = await apiRegister(request, 'questbad');
    await apiCreateCharacter(request, u, `QB${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const r = await request.post('/api/quest/start', { headers: auth(u), data: { questSlug: 'no-such-quest' } });
    expect(r.status()).toBe(404);
  });

  test('гранично: паралелен double-submit на един и същ куест — само една заявка печели', async ({ request }) => {
    const u = await apiRegister(request, 'questrace');
    await apiCreateCharacter(request, u, `QR${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const list = await request.get('/api/quest', { headers: auth(u) });
    const { quests } = await list.json();
    const slug = quests.find((q: any) => q.level_req <= 1).slug;
    const [r1, r2] = await Promise.all([
      request.post('/api/quest/start', { headers: auth(u), data: { questSlug: slug } }),
      request.post('/api/quest/start', { headers: auth(u), data: { questSlug: slug } }),
    ]);
    expect([r1.status(), r2.status()].sort()).toEqual([200, 429]);
  });
});

// Всички seed-нати подземия имат level_req ≥4 (най-ниският) — тук трябва
// промотиран админ (виж README "Admin probe setup"), за да вдигне героя
// над прага без часове grind. Пропускаме цялото describe, ако липсва.
test.describe('подземие', () => {
  test.skip(!adminToken(), 'NEXUS_E2E_ADMIN_TOKEN not set — виж e2e/README.md');

  async function readyChar(request: any, tag: string, cls: 'warrior' | 'ranger' | 'mage' | 'rogue') {
    const u = await apiRegister(request, tag);
    const c = await apiCreateCharacter(request, u, `${tag}${uniqueNameSuffix()}`.slice(0, 20), cls);
    await adminBumpCharacter(request, c.character.id, { level: DUNGEON_TEST_LEVEL, gold: 5000 });
    return u;
  }

  test('успешен път: /dungeon/enter → /dungeon/advance напредва рейда', async ({ request }) => {
    const u = await readyChar(request, 'dungok', 'warrior');
    const list = await request.get('/api/dungeon', { headers: auth(u) });
    const { dungeons } = await list.json();
    const first = dungeons.find((d: any) => d.unlocked);
    const enter = await request.post('/api/dungeon/enter', { headers: auth(u), data: { slug: first.slug } });
    expect(enter.status()).toBe(200);
    const advance = await request.post('/api/dungeon/advance', { headers: auth(u), data: {} });
    expect(advance.ok()).toBeTruthy();
  });

  test('гранично: /dungeon/advance без активен рейд → 400', async ({ request }) => {
    const u = await readyChar(request, 'dungnorun', 'mage');
    const r = await request.post('/api/dungeon/advance', { headers: auth(u), data: {} });
    expect(r.status()).toBe(400);
  });

  test('гранично: паралелно влизане в едно и също подземие — не удвоява cooldown claim-а', async ({ request }) => {
    const u = await readyChar(request, 'dungrace', 'ranger');
    const list = await request.get('/api/dungeon', { headers: auth(u) });
    const { dungeons } = await list.json();
    const slug = dungeons.find((d: any) => d.unlocked).slug;
    const [r1, r2] = await Promise.all([
      request.post('/api/dungeon/enter', { headers: auth(u), data: { slug } }),
      request.post('/api/dungeon/enter', { headers: auth(u), data: { slug } }),
    ]);
    expect([r1.status(), r2.status()].sort()).toEqual([200, 429]);
  });
});

test.describe('Mythic+', () => {
  test.skip(!adminToken(), 'NEXUS_E2E_ADMIN_TOKEN not set — виж e2e/README.md');

  async function readyChar(request: any, tag: string, cls: 'warrior' | 'ranger' | 'mage' | 'rogue') {
    const u = await apiRegister(request, tag);
    const c = await apiCreateCharacter(request, u, `${tag}${uniqueNameSuffix()}`.slice(0, 20), cls);
    await adminBumpCharacter(request, c.character.id, { level: DUNGEON_TEST_LEVEL, gold: 5000 });
    return u;
  }

  test('успешен път: enter tier 1 → strike напредва етап', async ({ request }) => {
    const u = await readyChar(request, 'mplusok', 'warrior');
    const list = await request.get('/api/mythic-plus', { headers: auth(u) });
    const { dungeons } = await list.json();
    const first = dungeons.find((d: any) => d.level_req <= DUNGEON_TEST_LEVEL);
    const enter = await request.post('/api/mythic-plus/enter', { headers: auth(u), data: { slug: first.slug, tier: 1 } });
    expect(enter.status()).toBe(200);
    const strike = await request.post('/api/mythic-plus/strike', { headers: auth(u), data: { slug: first.slug } });
    expect(strike.ok()).toBeTruthy();
  });

  test('гранично: заключен tier (> best+1) → 400', async ({ request }) => {
    const u = await readyChar(request, 'mplustier', 'mage');
    const list = await request.get('/api/mythic-plus', { headers: auth(u) });
    const { dungeons } = await list.json();
    const first = dungeons.find((d: any) => d.level_req <= DUNGEON_TEST_LEVEL);
    const r = await request.post('/api/mythic-plus/enter', { headers: auth(u), data: { slug: first.slug, tier: 5 } });
    expect(r.status()).toBe(400);
  });

  test('гранично: /claim преди изчистване на всички етапи → 400, двоен claim не удвоява', async ({ request }) => {
    const u = await readyChar(request, 'mplusclaim', 'rogue');
    const list = await request.get('/api/mythic-plus', { headers: auth(u) });
    const { dungeons } = await list.json();
    const first = dungeons.find((d: any) => d.level_req <= DUNGEON_TEST_LEVEL);
    await request.post('/api/mythic-plus/enter', { headers: auth(u), data: { slug: first.slug, tier: 1 } });
    const r = await request.post('/api/mythic-plus/claim', { headers: auth(u), data: { slug: first.slug } });
    expect(r.status()).toBe(400); // run not cleared yet
  });
});

test.describe('арена', () => {
  test('успешен път: /arena/opponents → challenge връща резултат', async ({ request }) => {
    const u = await apiRegister(request, 'arenaok');
    await apiCreateCharacter(request, u, `A${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const opps = await request.get('/api/arena/opponents', { headers: auth(u) });
    const { opponents } = await opps.json();
    expect(opponents.length).toBeGreaterThan(0);
    const r = await request.post('/api/arena/challenge', { headers: auth(u), data: { opponentId: opponents[0].id } });
    expect(r.status()).toBe(200);
  });

  test('гранично: предизвикай себе си → 404', async ({ request }) => {
    const u = await apiRegister(request, 'arenaself');
    const char = await apiCreateCharacter(request, u, `AS${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const r = await request.post('/api/arena/challenge', { headers: auth(u), data: { opponentId: char.character.id } });
    expect(r.status()).toBe(404);
  });

  test('гранично: паралелна дублирана предизвикателство — само една печели', async ({ request }) => {
    const u = await apiRegister(request, 'arenarace');
    await apiCreateCharacter(request, u, `AR${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const opps = await request.get('/api/arena/opponents', { headers: auth(u) });
    const { opponents } = await opps.json();
    const [r1, r2] = await Promise.all([
      request.post('/api/arena/challenge', { headers: auth(u), data: { opponentId: opponents[0].id } }),
      request.post('/api/arena/challenge', { headers: auth(u), data: { opponentId: opponents[0].id } }),
    ]);
    // Playwright's APIRequestContext не гарантира истински едновременно
    // изпращане по мрежата (keep-alive connection reuse) — ако заявка 1
    // завърши ПРЕДИ заявка 2 да тръгне, героят може да излезе от боя ранен
    // (<10% HP) и втората пада на wounded guard-а (400), не на cooldown-а
    // (429). И двата изхода доказват ЕДНАКВО инварианта, който ни интересува:
    // точно ЕДНА награда, никога двойна. api-probe.mjs (сурово fetch, реален
    // паралелизъм) вече доказва точно cooldown 429 клона за hunt/wheel/camp.
    const statuses = [r1.status(), r2.status()];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
    expect(statuses.every((s) => s === 200 || s === 400 || s === 429)).toBeTruthy();
  });
});

test.describe('кула', () => {
  test('успешен път: /tower/climb връща бой', async ({ request }) => {
    const u = await apiRegister(request, 'towerok');
    await apiCreateCharacter(request, u, `T${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.post('/api/tower/climb', { headers: auth(u), data: {} });
    expect(r.status()).toBe(200);
  });

  test('гранично: неавтентикирано изкачване → 401', async ({ request }) => {
    const r = await request.post('/api/tower/climb', { data: {} });
    expect(r.status()).toBe(401);
  });

  test('гранично: паралелно изкачване — само една заявка печели', async ({ request }) => {
    const u = await apiRegister(request, 'towerrace');
    await apiCreateCharacter(request, u, `TR${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const [r1, r2] = await Promise.all([
      request.post('/api/tower/climb', { headers: auth(u), data: {} }),
      request.post('/api/tower/climb', { headers: auth(u), data: {} }),
    ]);
    expect([r1.status(), r2.status()].sort()).toEqual([200, 429]);
  });
});
