import type { APIRequestContext, Page } from '@playwright/test';

/** Уникален суфикс за всеки тест run — нула споделен стейт между тестове. */
export function uniqueSuffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Уникален суфикс за ГЕРОЙ/ГИЛДИЯ имена — минава през checkText модерацията
 * (lib/textFilter.ts), която декодира leetspeak (0→o, 1→i/l, 3→e, 4→a, 5→s,
 * 7→t) преди да свери с речника — анти-заобикаляне на профанити с цифри.
 * Одит: `uniqueSuffix()` е ПРЕДИМНО десетични цифри (Date.now() + random) —
 * дълга чисто цифрова опашка от време на време ДЕКОДИРА до дума от речника
 * по чист late (засечено на живо: `T1790417808587_30642` веднъж отпадна с
 * "That name isn't allowed"). base36 разрежда цифрите с букви и е по-кратък,
 * драстично намалява шанса за случайно leetspeak съвпадение.
 */
export function uniqueNameSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Уникално username ≤20 символа (сървърна граница — auth.ts registerSchema
 * `max(20)`). Одит: `\`${tag}_${suffix}\`.slice(0, 20)` режеше ОПАШКАТА на
 * низа — за tag-ове от ≥6 символа това отрязва точно random/милисекундната
 * част на suffix-а (най-бързо променящата се), оставяйки само ВОДЕЩИТЕ,
 * бавно-променящи се цифри на Date.now(). Резултат: два run-а в рамките на
 * една и съща ~10-секундна секунда с еднакъв tag колизираха на 409
 * "already in use" — засечено на живо в admin-probe.mjs при две
 * последователни изпълнения. Сега режем TAG-а, не суфикса — суфиксът
 * (компактен base36 timestamp + random) оцелява цял.
 */
export function uniqueUsername(tag: string): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const maxTagLen = Math.max(1, 19 - suffix.length);
  return `${tag.slice(0, maxTagLen)}_${suffix}`.slice(0, 20);
}

export interface TestUser {
  username: string;
  email: string;
  password: string;
  token: string;
  userId: number;
}

/** Регистрира нов потребител директно през API (бързо, не през UI формата — UI регистрацията си има собствен спек). */
export async function apiRegister(request: APIRequestContext, tag: string): Promise<TestUser> {
  const username = uniqueUsername(tag);
  const email = `${username}_${uniqueSuffix()}@example.com`;
  const password = 'Testpass123';
  const res = await request.post('/api/auth/register', {
    data: {
      username,
      email,
      password,
      dateOfBirth: '2000-01-01',
      country: 'BG',
    },
  });
  if (!res.ok()) throw new Error(`apiRegister(${username}) failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { username, email, password, token: body.token, userId: body.user.id };
}

/** Създава герой за вече регистриран потребител. */
export async function apiCreateCharacter(request: APIRequestContext, user: TestUser, name: string, cls: 'warrior' | 'ranger' | 'mage' | 'rogue' = 'warrior') {
  const res = await request.post('/api/character/create', {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { name, class: cls },
  });
  if (!res.ok()) throw new Error(`apiCreateCharacter(${name}) failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Токенът на промотиран админ за тестове, които се нуждаят от ниво/злато bump (dungeon/mythic-plus/guild). */
export function adminToken(): string | null {
  return process.env.NEXUS_E2E_ADMIN_TOKEN || null;
}

/** Вдига ниво/злато на герой през admin API (виж Nexus/e2e/README.md "Admin probe setup"). */
export async function adminBumpCharacter(request: APIRequestContext, charId: number, patch: { level?: number; gold?: number; gems?: number }): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error('NEXUS_E2E_ADMIN_TOKEN not set — see Nexus/e2e/README.md');
  const res = await request.put(`/api/admin/characters/${charId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: patch,
  });
  if (!res.ok()) throw new Error(`adminBumpCharacter(${charId}) failed: ${res.status()} ${await res.text()}`);
}

/** Дава предмет на герой през admin API (за тестове, които не искат да гриндват дропа). */
export async function adminGiveItem(request: APIRequestContext, charId: number, slug: string, quantity = 1): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error('NEXUS_E2E_ADMIN_TOKEN not set — see Nexus/e2e/README.md');
  const res = await request.post(`/api/admin/characters/${charId}/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { slug, quantity },
  });
  if (!res.ok()) throw new Error(`adminGiveItem(${charId}, ${slug}) failed: ${res.status()} ${await res.text()}`);
}

/** inv_id на първия несвързан bag-слот с дадения slug (след adminGiveItem). */
export async function findInventoryId(request: APIRequestContext, user: TestUser, slug: string): Promise<number> {
  const res = await request.get('/api/inventory', { headers: { Authorization: `Bearer ${user.token}` } });
  const { items } = await res.json();
  const row = items.find((i: any) => i.slug === slug && !i.equipped && !i.listed && !i.vaulted_guild_id);
  if (!row) throw new Error(`findInventoryId: no unequipped "${slug}" in ${user.username}'s bag`);
  return row.inv_id;
}

/**
 * Инжектира токена в localStorage така, както го чете client/src/lib/api.ts,
 * и навигира. Слага и cookie-consent + onboarding-tour ключовете предварително
 * (components/CookieBanner.tsx `nd_cookie_consent_v2`, components/OnboardingTour.tsx
 * `nd_onboarding_done`) — иначе двата overlay-я се стекват върху действието,
 * което тестваме, и прихващат кликовете (`intercepts pointer events`). Тези
 * два потока имат собствени фокусирани спекове (onboarding.spec.ts,
 * cookie-consent.spec.ts) — тук ги пропускаме нарочно, за да е детерминистичен
 * тестът на действителния поток.
 */
export async function loginAsInBrowser(page: Page, user: TestUser, path = '/app'): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('nexus-dominion.token', token);
    window.localStorage.setItem('nd_onboarding_done', '1');
    window.localStorage.setItem('nd_cookie_consent_v2', JSON.stringify({
      necessary: true, preferences: true, analytics: false, marketing: false, ts: Date.now(), version: 2,
    }));
  }, user.token);
  await page.goto(path);
}
