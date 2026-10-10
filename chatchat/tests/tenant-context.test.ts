import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentTenantId, withTenant, withTenantIfKnown } from '../src/db/tenant-context.js';

/**
 * Контекстът на клиента (src/db/tenant-context.ts) — основата на RLS в приложението: носи се през
 * await/таймери, не изтича навън, мързеливата заявка на Prisma тръгва ВЪТРЕ в него.
 */

/** Като PrismaPromise: нищо не прави до `.then` — и записва контекста в момента на `.then`. */
class LazyQuery implements PromiseLike<string | null> {
  seen: Array<string | null> = [];
  then<A = string | null, B = never>(
    ok?: ((v: string | null) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    this.seen.push(currentTenantId());
    return Promise.resolve(currentTenantId()).then(ok, fail);
  }
}

test('без контекст → null; вътре → клиентът; след това → пак null', async () => {
  assert.equal(currentTenantId(), null);
  const inside = await withTenant('t_a', async () => {
    await new Promise((r) => setTimeout(r, 1));
    return currentTenantId();
  });
  assert.equal(inside, 't_a');
  assert.equal(currentTenantId(), null);
});

test('мързелива заявка, върната направо, тръгва вътре в контекста (не при викащия)', async () => {
  const q = new LazyQuery();
  const value = await withTenant('t_b', () => q);
  assert.equal(value, 't_b');
  assert.deepEqual(q.seen, ['t_b']);
});

test('вложен контекст важи само вътре; паралелните не се смесват', async () => {
  const [a, b] = await Promise.all([
    withTenant('t_a', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return currentTenantId();
    }),
    withTenant('t_b', async () => {
      const inner = await withTenant('t_c', async () => currentTenantId());
      return [currentTenantId(), inner];
    }),
  ]);
  assert.equal(a, 't_a');
  assert.deepEqual(b, ['t_b', 't_c']);
});

test('невалиден id → грешка (никога тихо „без клиент“); непознат при откриване → без контекст', () => {
  for (const bad of ['', ' ', 'a b', 'x'.repeat(65), "t';--"]) {
    assert.throws(() => withTenant(bad, () => undefined), /Невалиден id/);
  }
  assert.equal(
    withTenantIfKnown(null, () => currentTenantId()),
    null,
  );
  assert.equal(
    withTenantIfKnown('t_d', () => currentTenantId()),
    't_d',
  );
});
