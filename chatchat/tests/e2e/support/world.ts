import type { BrowserContext, Page } from '@playwright/test';
import type { Role, User } from '@prisma/client';
import { SESSION_COOKIE, createSession } from '../../../src/auth/sessions.js';
import { withTenant } from '../../../src/db/tenant-context.js';
import {
  appDb,
  Client,
  PASSWORD,
  PEPPER,
  TOTP_SECRET,
  db,
  makeUser,
  totpNow,
  type Harness,
} from '../../integration/helpers.js';
import { E2E_ORIGIN } from './constants.js';

/**
 * Помощници на e2e тестовете. Сървърът (server.ts) засява клиент „alfa-spa“ с продукти, табла и
 * знание; всеки тест си прави СВОИ потребители (изолация) и влиза или през формата, или със
 * сесийна бисквитка (бързо и стабилно там, където входът не е предмет на теста).
 */

export { PASSWORD, TOTP_SECRET, totpNow };

let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq += 1)}`;

export async function tenantAlfa() {
  return db.tenant.findUniqueOrThrow({ where: { slug: 'alfa-spa' } });
}

export async function companyAlfa() {
  const t = await tenantAlfa();
  return db.company.findFirstOrThrow({ where: { tenantId: t.id, name: 'Alfa Srl' } });
}

export async function newPortalUser(name = 'Tecnico E2E'): Promise<User> {
  const t = await tenantAlfa();
  const c = await companyAlfa();
  return makeUser({
    tenantId: t.id,
    companyId: c.id,
    role: 'PORTAL_TECHNICIAN',
    kind: 'PORTAL',
    name,
    email: `portal-${unique()}@example.test`,
  });
}

export async function newStaff(role: Role, name = 'Staff E2E'): Promise<User> {
  const t = await tenantAlfa();
  return makeUser({ tenantId: t.id, role, name, email: `staff-${unique()}@example.test` });
}

function harnessLike(): Pick<Harness, 'sessions'> {
  return { sessions: { db: appDb, pepper: PEPPER, ttlHours: 12, secureCookies: false } };
}

async function openSession(user: User) {
  const s = await withTenant(user.tenantId, () => createSession(harnessLike().sessions, user.id));
  if (user.totpEnabledAt) {
    await db.session.update({ where: { id: s.id }, data: { mfaPassed: true } });
  }
  return s;
}

/** HTTP клиент със сесия (преминат MFA за персонала) — за подготовка на данни извън браузъра. */
export async function apiAs(user: User): Promise<Client> {
  const s = await openSession(user);
  return new Client(E2E_ORIGIN, s.token, s.csrfToken);
}

/** Влиза в браузъра без форма: бисквитката на сесията (httpOnly), като след успешен вход. */
export async function cookieLogin(context: BrowserContext, user: User): Promise<void> {
  const s = await openSession(user);
  await context.addCookies([
    { name: SESSION_COOKIE, value: s.token, url: E2E_ORIGIN, httpOnly: true, sameSite: 'Lax' },
  ]);
}

/** Вход през формата на екрана за вход (парола; по желание и TOTP). */
export async function formLogin(page: Page, email: string, opts: { totp?: string } = {}) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi' }).click();
  if (opts.totp) {
    await page.getByLabel('Codice a 6 cifre').fill(opts.totp);
    await page.getByRole('button', { name: 'Conferma' }).click();
  }
}
