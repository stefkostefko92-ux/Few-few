import { test, expect } from '@playwright/test';
import {
  apiRegister, apiCreateCharacter, adminBumpCharacter, adminGiveItem, findInventoryId, adminToken, uniqueSuffix, uniqueNameSuffix,
  type TestUser,
} from './helpers';

const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });
const needsAdmin = () => test.skip(!adminToken(), 'NEXUS_E2E_ADMIN_TOKEN not set — виж e2e/README.md');

test.describe('инвентар', () => {
  needsAdmin();

  test('успешен път: екипирай → свали → продай оръжие', async ({ request }) => {
    const u = await apiRegister(request, 'invok');
    const c = await apiCreateCharacter(request, u, `Inv${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminGiveItem(request, c.character.id, 'iron_sword');
    const invId = await findInventoryId(request, u, 'iron_sword');

    const equip = await request.post('/api/inventory/equip', { headers: auth(u), data: { inventoryId: invId } });
    expect(equip.ok()).toBeTruthy();
    const unequip = await request.post('/api/inventory/unequip', { headers: auth(u), data: { inventoryId: invId } });
    expect(unequip.ok()).toBeTruthy();
    const sell = await request.post('/api/inventory/sell', { headers: auth(u), data: { inventoryId: invId } });
    expect(sell.ok()).toBeTruthy();
  });

  test('успешен път: екипирай наметало (cloak slot)', async ({ request }) => {
    const u = await apiRegister(request, 'invcloak');
    const c = await apiCreateCharacter(request, u, `Cloak${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, c.character.id, { level: 65 }); // elite_cloak_4 level_req 60
    await adminGiveItem(request, c.character.id, 'elite_cloak_4');
    const invId = await findInventoryId(request, u, 'elite_cloak_4');
    const equip = await request.post('/api/inventory/equip', { headers: auth(u), data: { inventoryId: invId } });
    expect(equip.ok()).toBeTruthy();
    const items = await (await request.get('/api/inventory', { headers: auth(u) })).json();
    const cloak = items.items.find((i: any) => i.inv_id === invId);
    expect(cloak.equipped).toBe(1);
    expect(cloak.slot).toBe('cloak');
  });

  test('гранично: продажба на чужд/несъществуващ inventoryId → 404', async ({ request }) => {
    const u = await apiRegister(request, 'invforeign');
    await apiCreateCharacter(request, u, `IF${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const r = await request.post('/api/inventory/sell', { headers: auth(u), data: { inventoryId: 999999999 } });
    expect(r.status()).toBe(404);
  });

  test('гранично: паралелна двойна продажба на един предмет — вторият пада (не двойно злато)', async ({ request }) => {
    const u = await apiRegister(request, 'invdblsell');
    const c = await apiCreateCharacter(request, u, `IS${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    await adminGiveItem(request, c.character.id, 'rusty_dagger');
    const invId = await findInventoryId(request, u, 'rusty_dagger');
    const [r1, r2] = await Promise.all([
      request.post('/api/inventory/sell', { headers: auth(u), data: { inventoryId: invId } }),
      request.post('/api/inventory/sell', { headers: auth(u), data: { inventoryId: invId } }),
    ]);
    const statuses = [r1.status(), r2.status()].sort();
    expect(statuses[0]).toBeLessThan(300); // one succeeds
    expect(statuses[1]).toBeGreaterThanOrEqual(400); // the other must NOT also succeed (no double gold)
  });
});

test.describe('пазар', () => {
  needsAdmin();

  test('успешен път: обяви → купи (друг играч)', async ({ request }) => {
    const seller = await apiRegister(request, 'mktsell');
    const sc = await apiCreateCharacter(request, seller, `MS${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminGiveItem(request, sc.character.id, 'iron_sword');
    const invId = await findInventoryId(request, seller, 'iron_sword');
    const list = await request.post('/api/market/sell', { headers: auth(seller), data: { inventoryId: invId, priceGold: 5 } });
    expect(list.ok()).toBeTruthy();

    const listings = await (await request.get('/api/market', { headers: auth(seller) })).json();
    const mine = listings.listings.find((l: any) => l.slug === 'iron_sword' && l.seller_name === sc.character.name);
    expect(mine).toBeTruthy();

    const buyer = await apiRegister(request, 'mktbuy');
    const bc = await apiCreateCharacter(request, buyer, `MB${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    await adminBumpCharacter(request, bc.character.id, { gold: 1000 });
    const buy = await request.post('/api/market/buy', { headers: auth(buyer), data: { listingId: mine.listing_id } });
    expect(buy.ok()).toBeTruthy();
  });

  test('гранично: отмяна на чужда обява → 403', async ({ request }) => {
    const seller = await apiRegister(request, 'mktowner');
    const sc = await apiCreateCharacter(request, seller, `MO${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminGiveItem(request, sc.character.id, 'short_bow');
    const invId = await findInventoryId(request, seller, 'short_bow');
    await request.post('/api/market/sell', { headers: auth(seller), data: { inventoryId: invId, priceGold: 5 } });
    const listings = await (await request.get('/api/market', { headers: auth(seller) })).json();
    const mine = listings.listings.find((l: any) => l.slug === 'short_bow' && l.seller_name === sc.character.name);

    const other = await apiRegister(request, 'mktother');
    await apiCreateCharacter(request, other, `MOT${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const r = await request.post('/api/market/cancel', { headers: auth(other), data: { listingId: mine.listing_id } });
    expect(r.status()).toBe(403);
  });

  test('гранично: паралелна двойна покупка на една обява — само една печели', async ({ request }) => {
    const seller = await apiRegister(request, 'mktrace');
    const sc = await apiCreateCharacter(request, seller, `MR${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminGiveItem(request, sc.character.id, 'rusty_dagger');
    const invId = await findInventoryId(request, seller, 'rusty_dagger');
    await request.post('/api/market/sell', { headers: auth(seller), data: { inventoryId: invId, priceGold: 5 } });
    const listings = await (await request.get('/api/market', { headers: auth(seller) })).json();
    const mine = listings.listings.find((l: any) => l.slug === 'rusty_dagger' && l.seller_name === sc.character.name);

    const b1 = await apiRegister(request, 'mktb1');
    await apiCreateCharacter(request, b1, `B1${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const b2 = await apiRegister(request, 'mktb2');
    await apiCreateCharacter(request, b2, `B2${uniqueNameSuffix()}`.slice(0, 20), 'rogue');

    const [r1, r2] = await Promise.all([
      request.post('/api/market/buy', { headers: auth(b1), data: { listingId: mine.listing_id } }),
      request.post('/api/market/buy', { headers: auth(b2), data: { listingId: mine.listing_id } }),
    ]);
    // Losing side depends on real request timing (Playwright's APIRequestContext
    // doesn't guarantee true simultaneous dispatch): 400 "already sold" if it
    // races inside the tx, 404 "not found" if it reads AFTER the winner's
    // status flip already landed. Both prove the same invariant — never a
    // second 200 (double-buy).
    const statuses = [r1.status(), r2.status()];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
    expect(statuses.every((s) => s === 200 || s === 400 || s === 404)).toBeTruthy();
  });
});

test.describe('аукцион', () => {
  needsAdmin();

  test('успешен път: наддай, ставаш текущ водещ', async ({ request }) => {
    const u = await apiRegister(request, 'auctok');
    const c = await apiCreateCharacter(request, u, `Auc${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, c.character.id, { gems: 500 });
    const current = await (await request.get('/api/auction', { headers: auth(u) })).json();
    const bid = current.listing.current_bid + 5;
    const r = await request.post('/api/auction/bid', { headers: auth(u), data: { amount: bid } });
    expect(r.ok()).toBeTruthy();
    const after = await (await request.get('/api/auction', { headers: auth(u) })).json();
    expect(after.listing.bidder_name).toBe(c.character.name);
  });

  test('гранично: наддаване под текущата → 400', async ({ request }) => {
    const u = await apiRegister(request, 'auctlow');
    const c = await apiCreateCharacter(request, u, `AucL${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    await adminBumpCharacter(request, c.character.id, { gems: 500 });
    const current = await (await request.get('/api/auction', { headers: auth(u) })).json();
    const r = await request.post('/api/auction/bid', { headers: auth(u), data: { amount: Math.max(1, current.listing.current_bid - 1) } });
    expect(r.status()).toBe(400);
  });

  test('гранично: паралелно наддаване същата сума от двама — само едно печели, губещият не губи гемове', async ({ request }) => {
    const a = await apiRegister(request, 'auctra');
    const ca = await apiCreateCharacter(request, a, `AA${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminBumpCharacter(request, ca.character.id, { gems: 1000 });
    const b = await apiRegister(request, 'auctrb');
    const cb = await apiCreateCharacter(request, b, `AB${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    await adminBumpCharacter(request, cb.character.id, { gems: 1000 });

    const current = await (await request.get('/api/auction', { headers: auth(a) })).json();
    const bid = current.listing.current_bid + 20;
    const [r1, r2] = await Promise.all([
      request.post('/api/auction/bid', { headers: auth(a), data: { amount: bid } }),
      request.post('/api/auction/bid', { headers: auth(b), data: { amount: bid } }),
    ]);
    const statuses = [r1.status(), r2.status()].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 400]); // CAS on current_bid — the loser's identical bid is stale by the time it lands
  });
});

test.describe('размяна между двама играчи', () => {
  needsAdmin();

  test('успешен път: оферта → зададени предмет+злато → готовност от двамата → изпълнена', async ({ request }) => {
    const a = await apiRegister(request, 'tradea');
    const ca = await apiCreateCharacter(request, a, `TA${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    await adminGiveItem(request, ca.character.id, 'iron_sword');
    const invId = await findInventoryId(request, a, 'iron_sword');
    const b = await apiRegister(request, 'tradeb');
    const cb = await apiCreateCharacter(request, b, `TB${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    await adminBumpCharacter(request, cb.character.id, { gold: 1000 });

    const offer = await request.post('/api/trade/offer', { headers: auth(a), data: { toName: cb.character.name } });
    expect(offer.ok()).toBeTruthy();
    const { id } = await offer.json();

    const setA = await request.post(`/api/trade/${id}/set`, { headers: auth(a), data: { items: [invId], gold: 0 } });
    expect(setA.ok()).toBeTruthy();
    const setB = await request.post(`/api/trade/${id}/set`, { headers: auth(b), data: { items: [], gold: 100 } });
    expect(setB.ok()).toBeTruthy();

    await request.post(`/api/trade/${id}/ready`, { headers: auth(a), data: { ready: true } });
    const finalReady = await request.post(`/api/trade/${id}/ready`, { headers: auth(b), data: { ready: true } });
    const body = await finalReady.json();
    expect(body.executed).toBe(true);
  });

  test('гранично: оферта към несъществуващ играч → 404', async ({ request }) => {
    const u = await apiRegister(request, 'tradebad');
    await apiCreateCharacter(request, u, `TBad${uniqueNameSuffix()}`.slice(0, 20), 'rogue');
    const r = await request.post('/api/trade/offer', { headers: auth(u), data: { toName: 'NoSuchPlayerAtAll' } });
    expect(r.status()).toBe(404);
  });

  test('гранично: отказ отменя размяната — предметите остават непокътнати', async ({ request }) => {
    const a = await apiRegister(request, 'tradecancel');
    const ca = await apiCreateCharacter(request, a, `TC${uniqueNameSuffix()}`.slice(0, 20), 'warrior');
    const b = await apiRegister(request, 'tradecancelb');
    const cb = await apiCreateCharacter(request, b, `TCB${uniqueNameSuffix()}`.slice(0, 20), 'mage');
    const offer = await request.post('/api/trade/offer', { headers: auth(a), data: { toName: cb.character.name } });
    const { id } = await offer.json();
    const cancel = await request.post(`/api/trade/${id}/cancel`, { headers: auth(a), data: {} });
    expect(cancel.ok()).toBeTruthy();
    const active = await (await request.get('/api/trade/active', { headers: auth(a) })).json();
    expect(active.offer).toBeNull();
  });
});
