// K2 (ядро: пари/ДДС): Customer Portal без `configuration` ползва Dashboard
// настройката; ако там е разрешен `tax_id`, клиентът добавя номер, който е
// `pending` при подновяване → 0% ДДС по формат. Порталната конфигурация се
// прави с код (без tax_id), създава се веднъж (metadata маркер + idempotency
// key + кеш в процеса) и винаги се подава в sessions.create.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensurePortalConfiguration,
  portalAllowsTaxId,
  portalConfigMarker,
  portalConfigurationParams,
  portalSessionParams,
  PORTAL_METADATA_KEY,
  type PortalConfigCache,
  type PortalConfigView,
  type PortalPorts,
} from '../billing-portal';
import { createPortalStripePorts, type PortalStripeClient } from '../billing-portal-stripe';

function cfg(id: string, marker: string | null, allowed: string[] = ['address', 'email', 'name']): PortalConfigView {
  return {
    id,
    active: true,
    metadata: marker ? { [PORTAL_METADATA_KEY]: marker } : {},
    features: { customer_update: { enabled: true, allowed_updates: allowed } },
  };
}

function fake(
  existing: PortalConfigView[] = [],
  prices: Record<string, { product: string; recurring: boolean }> = {},
  // Какво връща create: по подразбиране — обект от подадените params (нормалният случай).
  createResult?: (params: ReturnType<typeof portalConfigurationParams>, n: number) => PortalConfigView,
) {
  const calls = { list: 0, create: [] as { params: unknown; key: string }[], price: [] as string[], retrieve: [] as string[] };
  const store = new Map<string, PortalConfigView>(existing.map((c) => [c.id, c]));
  const ports: PortalPorts = {
    async listActiveConfigurations() {
      calls.list += 1;
      return [...store.values()].filter((c) => c.active);
    },
    async createConfiguration(params, idempotencyKey) {
      calls.create.push({ params, key: idempotencyKey });
      const n = calls.create.length;
      const view: PortalConfigView = createResult
        ? createResult(params as ReturnType<typeof portalConfigurationParams>, n)
        : {
            id: `bpc_new_${n}`,
            active: true,
            metadata: (params.metadata as Record<string, string>) ?? null,
            features: {
              customer_update: {
                enabled: params.features.customer_update?.enabled ?? false,
                allowed_updates: [...((params.features.customer_update?.allowed_updates as string[]) ?? [])],
              },
            },
          };
      store.set(view.id, view);
      return view;
    },
    async retrieveConfiguration(id) {
      calls.retrieve.push(id);
      const c = store.get(id);
      if (!c) throw new Error(`no config ${id}`);
      return c;
    },
    async priceProduct(priceId) {
      calls.price.push(priceId);
      const p = prices[priceId];
      if (!p) throw new Error(`no price ${priceId}`);
      return p;
    },
  };
  return { ports, calls, store };
}

const newCache = (): PortalConfigCache => ({ marker: null, id: null });

test('P1 конфигурацията НЕ позволява tax_id; отмяна, начин на плащане и фактури са разрешени', () => {
  const p = portalConfigurationParams([], 'v1-x');
  const allowed = p.features.customer_update?.allowed_updates;
  assert.ok(Array.isArray(allowed));
  assert.ok(!allowed.includes('tax_id'));
  assert.equal(p.features.customer_update?.enabled, true);
  assert.equal(p.features.subscription_cancel?.enabled, true);
  assert.equal(p.features.payment_method_update?.enabled, true);
  assert.equal(p.features.invoice_history?.enabled, true);
  assert.deepEqual(p.metadata, { [PORTAL_METADATA_KEY]: 'v1-x' });
  assert.equal(p.features.subscription_update?.enabled, false);
});

test('P1b смяна на план: продуктите с техните цени; празен списък → без subscription_update', () => {
  const products = [{ product: 'prod_pro', prices: ['price_pm', 'price_pa'] }];
  const p = portalConfigurationParams(products, 'v1-x');
  assert.equal(p.features.subscription_update?.enabled, true);
  assert.deepEqual(p.features.subscription_update?.products, products);
  assert.deepEqual(p.features.subscription_update?.default_allowed_updates, ['price']);
});

test('P2 няма наша конфигурация → създава веднъж с маркер + idempotency key; вторият път — от кеша', async () => {
  const f = fake([cfg('bpc_default', null)], {
    price_pm: { product: 'prod_pro', recurring: true },
    price_bm: { product: 'prod_biz', recurring: true },
    price_pa: { product: 'prod_pro', recurring: true },
  });
  const cache = newCache();
  const ids = ['price_pm', 'price_bm', 'price_pa'];
  const id1 = await ensurePortalConfiguration(f.ports, ids, cache);
  const id2 = await ensurePortalConfiguration(f.ports, ids, cache);
  assert.equal(id1, 'bpc_new_1');
  assert.equal(id2, 'bpc_new_1');
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.list, 1);
  // кешът не се вярва сляпо: вторият път id-то се преизпитва срещу Stripe
  assert.deepEqual(f.calls.retrieve, ['bpc_new_1']);
  const marker = portalConfigMarker(ids);
  assert.equal(f.calls.create[0]?.key, `linketto-portal-config-${marker}`);
  const params = f.calls.create[0]?.params as ReturnType<typeof portalConfigurationParams>;
  assert.equal(params.metadata?.[PORTAL_METADATA_KEY], marker);
  assert.deepEqual(params.features.subscription_update?.products, [
    { product: 'prod_biz', prices: ['price_bm'] },
    { product: 'prod_pro', prices: ['price_pa', 'price_pm'] },
  ]);
});

test('P3 наша конфигурация с текущия маркер вече съществува → преизползва, без create', async () => {
  const ids = ['price_pm'];
  const f = fake([cfg('bpc_ours', portalConfigMarker(ids))]);
  assert.equal(await ensurePortalConfiguration(f.ports, ids, newCache()), 'bpc_ours');
  assert.equal(f.calls.create.length, 0);
  assert.deepEqual(f.calls.price, []);
});

test('P4 конфигурация с маркера, но с tax_id (пипната в Dashboard) → не се ползва, прави нова', async () => {
  const ids = ['price_pm'];
  const f = fake([cfg('bpc_bad', portalConfigMarker(ids), ['address', 'tax_id'])], {
    price_pm: { product: 'prod_pro', recurring: true },
  });
  assert.equal(await ensurePortalConfiguration(f.ports, ids, newCache()), 'bpc_new_1');
});

test('P10 create връща стар idempotent отговор с tax_id (пипнат в Dashboard) → грешка, без кеш (fail-closed)', async () => {
  const ids = ['price_pm'];
  const marker = portalConfigMarker(ids);
  const f = fake([], { price_pm: { product: 'prod_pro', recurring: true } }, () => ({
    ...cfg('bpc_old', marker, ['address', 'tax_id']),
  }));
  const cache = newCache();
  await assert.rejects(ensurePortalConfiguration(f.ports, ids, cache), /портал/i);
  assert.deepEqual(cache, newCache());
});

test('P11 create връща стар idempotent отговор, вече деактивиран или с чужд маркер → грешка', async () => {
  const ids = ['price_pm'];
  const marker = portalConfigMarker(ids);
  const prices = { price_pm: { product: 'prod_pro', recurring: true } };
  const inactive = fake([], prices, () => ({ ...cfg('bpc_off', marker), active: false }));
  await assert.rejects(ensurePortalConfiguration(inactive.ports, ids, newCache()), /портал/i);
  const foreign = fake([], prices, () => cfg('bpc_x', 'v1-other'));
  await assert.rejects(ensurePortalConfiguration(foreign.ports, ids, newCache()), /портал/i);
});

test('P12 остарял кеш: конфигурацията е деактивирана/с tax_id след кеширането → преизпитва и не я дава', async () => {
  const ids = ['price_pm'];
  const marker = portalConfigMarker(ids);
  const prices = { price_pm: { product: 'prod_pro', recurring: true } };
  // (а) кешираната е пипната (tax_id), има друга валидна наша → взема нея
  const a = fake([cfg('bpc_cached', marker), cfg('bpc_other', marker)], prices);
  const cacheA: PortalConfigCache = { marker, id: 'bpc_cached' };
  a.store.set('bpc_cached', cfg('bpc_cached', marker, ['address', 'tax_id']));
  assert.equal(await ensurePortalConfiguration(a.ports, ids, cacheA), 'bpc_other');
  assert.deepEqual(a.calls.retrieve, ['bpc_cached']);
  assert.deepEqual(cacheA, { marker, id: 'bpc_other' });
  // (б) кешираната е деактивирана и няма друга → create; idempotent отговорът е същата
  // деактивирана → грешка, кешът е изчистен
  const off = { ...cfg('bpc_cached', marker), active: false };
  const b = fake([off], prices, () => off);
  const cacheB: PortalConfigCache = { marker, id: 'bpc_cached' };
  await assert.rejects(ensurePortalConfiguration(b.ports, ids, cacheB), /портал/i);
  assert.deepEqual(b.calls.retrieve, ['bpc_cached']);
  assert.equal(cacheB.id, null);
});

test('P5 маркерът не зависи от реда; сменени цени → нов маркер (нова конфигурация)', () => {
  assert.equal(portalConfigMarker(['b', 'a']), portalConfigMarker(['a', 'b', 'a']));
  assert.notEqual(portalConfigMarker(['a']), portalConfigMarker(['a', 'c']));
  assert.match(portalConfigMarker(['a']), /^v1-[0-9a-f]{16}$/);
});

test('P6 еднократни цени се прескачат; грешка от Stripe се пропагира (fail-closed)', async () => {
  const f = fake([], { price_one: { product: 'prod_f', recurring: false } });
  await ensurePortalConfiguration(f.ports, ['price_one'], newCache());
  const params = f.calls.create[0]?.params as ReturnType<typeof portalConfigurationParams>;
  assert.equal(params.features.subscription_update?.enabled, false);
  const g = fake([], {});
  await assert.rejects(ensurePortalConfiguration(g.ports, ['price_missing'], newCache()), /no price/);
});

test('P7 portalAllowsTaxId', () => {
  assert.equal(portalAllowsTaxId(cfg('a', null, ['tax_id'])), true);
  assert.equal(portalAllowsTaxId(cfg('a', null, ['address'])), false);
  assert.equal(
    portalAllowsTaxId({ ...cfg('a', null, ['tax_id']), features: { customer_update: { enabled: false, allowed_updates: ['tax_id'] } } }),
    false,
  );
});

test('P8 сесията на портала винаги носи configuration', () => {
  assert.deepEqual(portalSessionParams({ customerId: 'cus_1', configurationId: 'bpc_1', returnUrl: 'https://x/d' }), {
    customer: 'cus_1',
    configuration: 'bpc_1',
    return_url: 'https://x/d',
  });
});

test('P9 Stripe адаптер: list само активни, create с idempotency key, product обект → id', async () => {
  const seen: unknown[] = [];
  const client: PortalStripeClient = {
    billingPortal: {
      configurations: {
        list(params) {
          seen.push(['list', params]);
          return (async function* () {
            yield cfg('bpc_1', null);
          })();
        },
        async create(params, options) {
          seen.push(['create', options.idempotencyKey, params.metadata]);
          return { ...cfg('bpc_2', 'v1-y'), livemode: false };
        },
        async retrieve(id) {
          seen.push(['retrieve', id]);
          return { ...cfg(id, 'v1-y', ['email']), active: false };
        },
      },
    },
    prices: {
      async retrieve(id) {
        return id === 'price_obj'
          ? { product: { id: 'prod_o' }, recurring: { interval: 'month' } }
          : { product: 'prod_s', recurring: null };
      },
    },
  };
  const ports = createPortalStripePorts(client);
  assert.deepEqual((await ports.listActiveConfigurations()).map((c) => c.id), ['bpc_1']);
  assert.deepEqual(await ports.priceProduct('price_obj'), { product: 'prod_o', recurring: true });
  assert.deepEqual(await ports.priceProduct('price_str'), { product: 'prod_s', recurring: false });
  // create/retrieve връщат проверимия изглед (active, metadata, customer_update), без излишни полета
  assert.deepEqual(await ports.createConfiguration(portalConfigurationParams([], 'v1-y'), 'k1'), cfg('bpc_2', 'v1-y'));
  assert.deepEqual(await ports.retrieveConfiguration('bpc_9'), { ...cfg('bpc_9', 'v1-y', ['email']), active: false });
  assert.deepEqual(seen, [
    ['list', { active: true, limit: 100 }],
    ['create', 'k1', { [PORTAL_METADATA_KEY]: 'v1-y' }],
    ['retrieve', 'bpc_9'],
  ]);
});
