import { test, expect } from '@playwright/test';
import { apiRegister, apiCreateCharacter, adminBumpCharacter, adminToken, uniqueSuffix, uniqueNameSuffix, type TestUser } from './helpers';

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const needsAdmin = () => test.skip(!adminToken(), 'NEXUS_E2E_ADMIN_TOKEN not set — виж e2e/README.md');

test.describe('приятели / блок', () => {
  test('успешен път: заявка → приемане → в списъка с приятели', async ({ request }) => {
    const a = await apiRegister(request, 'frienda');
    const ca = await apiCreateCharacter(request, a, `FA${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const b = await apiRegister(request, 'friendb');
    const cb = await apiCreateCharacter(request, b, `FB${uniqueNameSuffix()}`.slice(0, 20), 'mage');

    const reqRes = await request.post('/api/social/friend/request', { headers: auth(a), data: { name: cb.character.name } });
    expect(reqRes.ok()).toBeTruthy();
    const accept = await request.post('/api/social/friend/accept', { headers: auth(b), data: { charId: ca.character.id } });
    expect(accept.ok()).toBeTruthy();

    const overviewA = await (await request.get('/api/social/overview', { headers: auth(a) })).json();
    expect(overviewA.friends.some((f: any) => f.id === cb.character.id)).toBeTruthy();
  });

  test('гранично: заявка към несъществуващ играч → 404', async ({ request }) => {
    const a = await apiRegister(request, 'friendbad');
    await apiCreateCharacter(request, a, `FBad${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const r = await request.post('/api/social/friend/request', { headers: auth(a), data: { name: 'NoSuchHeroEver' } });
    expect(r.status()).toBe(404);
  });

  test('гранично: блокиран играч не може да прати заявка за приятелство', async ({ request }) => {
    const a = await apiRegister(request, 'blocka');
    const ca = await apiCreateCharacter(request, a, `BA${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const b = await apiRegister(request, 'blockb');
    const cb = await apiCreateCharacter(request, b, `BB${uniqueNameSuffix()}`.slice(0, 20), 'mage');

    const block = await request.post('/api/social/block', { headers: auth(a), data: { name: cb.character.name } });
    expect(block.ok()).toBeTruthy();
    const r = await request.post('/api/social/friend/request', { headers: auth(b), data: { name: ca.character.name } });
    expect(r.status()).toBe(403);
  });
});

test.describe('чат', () => {
  test('успешен път: глобално съобщение се появява в /chat/global', async ({ request }) => {
    const u = await apiRegister(request, 'chatok');
    await apiCreateCharacter(request, u, `Ch${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const text = `probe-message-${uniqueSuffix()}`;
    const post = await request.post('/api/chat/global', { headers: auth(u), data: { channel: 'global', message: text } });
    expect(post.ok()).toBeTruthy();
    const feed = await (await request.get('/api/chat/global?channel=global', { headers: auth(u) })).json();
    expect(feed.messages.some((m: any) => m.message === text)).toBeTruthy();
  });

  test('гранично: непознат канал → 400', async ({ request }) => {
    const u = await apiRegister(request, 'chatbadchan');
    await apiCreateCharacter(request, u, `ChB${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const r = await request.post('/api/chat/global', { headers: auth(u), data: { channel: 'no-such-channel', message: 'x' } });
    expect(r.status()).toBe(400);
  });

  test('гранично: DM към не-приятел → 403', async ({ request }) => {
    const a = await apiRegister(request, 'dmno');
    await apiCreateCharacter(request, a, `DN${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const b = await apiRegister(request, 'dmnob');
    const cb = await apiCreateCharacter(request, b, `DNB${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.post(`/api/chat/dm/${cb.character.id}`, { headers: auth(a), data: { message: 'hi' } });
    expect(r.status()).toBe(403);
  });
});

test.describe('гилдия — пълен цикъл', () => {
  needsAdmin();

  async function leveledChar(request: any, tag: string, cls: 'warrior' | 'ranger' | 'mage' | 'rogue') {
    const u = await apiRegister(request, tag);
    const c = await apiCreateCharacter(request, u, `${tag}${uniqueNameSuffix()}`.slice(0, 20), cls);
    await adminBumpCharacter(request, c.character.id, { level: 5, gold: 5000 });
    return { u, c };
  }

  test('успешен път: създай → покани → приеми → напусни', async ({ request }) => {
    const { u: leader } = await leveledChar(request, 'guildlead', 'warrior');
    const { u: member, c: memberChar } = await leveledChar(request, 'guildmem', 'mage');

    const tag = `${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const create = await request.post('/api/guild/create', { headers: auth(leader), data: { name: `Probe Lifecycle ${uniqueNameSuffix()}`.slice(0, 30), tag } });
    expect(create.ok()).toBeTruthy();

    const invite = await request.post('/api/guild/invite', { headers: auth(leader), data: { characterName: memberChar.character.name } });
    expect(invite.ok()).toBeTruthy();

    const meBefore = await (await request.get('/api/guild/me', { headers: auth(member) })).json();
    expect(meBefore.invites.length).toBeGreaterThan(0);
    const accept = await request.post('/api/guild/invite/accept', { headers: auth(member), data: { inviteId: meBefore.invites[0].id } });
    expect(accept.ok()).toBeTruthy();

    const guildInfo = await (await request.get('/api/guild/me', { headers: auth(leader) })).json();
    expect(guildInfo.members.length).toBe(2);

    const memberLeave = await request.post('/api/guild/leave', { headers: auth(member), data: {} });
    expect(memberLeave.ok()).toBeTruthy();
    const leaderLeave = await request.post('/api/guild/leave', { headers: auth(leader), data: {} });
    // Sole remaining member leaving as leader either transfers leadership or
    // disbands — either is valid; the invariant is it does NOT 500.
    expect(leaderLeave.status()).toBeLessThan(500);
  });

  test('гранично: създаване без достатъчно ниво → 400', async ({ request }) => {
    const u = await apiRegister(request, 'guildlow');
    await apiCreateCharacter(request, u, `GL${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const r = await request.post('/api/guild/create', { headers: auth(u), data: { name: 'Too Low Level Guild', tag: 'TLL' } });
    expect(r.status()).toBe(400);
  });

  test('гранично: паралелно двойно създаване на гилдия от един герой — само едно печели', async ({ request }) => {
    const { u } = await leveledChar(request, 'guilddbl', 'rogue');
    // Уникален суфикс и в TAG-а, не само в името — литерален 'DB1'/'DB2'
    // колизираше с остатъчни гилдии от предишни run-ове на СЪЩАТА тестова
    // БД (без reset между run-овете), давайки 409+409 вместо истинската
    // 200+409 надпревара.
    const tagSuffix = Date.now().toString(36).slice(-3).toUpperCase();
    const [r1, r2] = await Promise.all([
      request.post('/api/guild/create', { headers: auth(u), data: { name: `Dbl One ${uniqueNameSuffix()}`.slice(0, 30), tag: `${tagSuffix}A` } }),
      request.post('/api/guild/create', { headers: auth(u), data: { name: `Dbl Two ${uniqueNameSuffix()}`.slice(0, 30), tag: `${tagSuffix}B` } }),
    ]);
    const statuses = [r1.status(), r2.status()];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
  });
});
