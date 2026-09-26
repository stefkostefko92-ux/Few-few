import type { APIRequestContext, Page } from '@playwright/test';

/** Уникален суфикс за всеки тест run — нула споделен стейт между тестове. */
export function uniqueSuffix(): string {
  return `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  const suffix = uniqueSuffix();
  const username = `${tag}_${suffix}`.slice(0, 20);
  const email = `${tag}_${suffix}@example.com`;
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
