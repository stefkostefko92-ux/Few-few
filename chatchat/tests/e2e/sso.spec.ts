import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db, makeUser, PASSWORD, TOTP_SECRET, totpNow } from '../integration/helpers.js';
import { makeSsoConfig } from '../integration/sso-world.js';
import { FakeIdp } from '../sso-fake-idp.js';
import { cookieLogin } from './support/world.js';
import { E2E_IDP_ORIGIN, E2E_SSO_ORIGIN } from './support/constants.js';

/**
 * Единният вход в браузъра (§14.4, §15.1): екранът за вход открива доставчика по домейна,
 * „Accedi con Microsoft“ води към (фалшивия) Entra ID на друг сайт и обратно в работното
 * пространство — с MFA от доставчика за персонала. Отказите са без подробности; задължителното SSO
 * отказва паролата. Администраторът и хората с TOTP се свързват само сами („Collega con Microsoft“ —
 * от „Account“ или от екрана при задължителен вход). Конзолата: нов доставчик през формата,
 * доказване на домейна (DNS TXT във фалшивия DNS), проверка на метаданните, тест, включване.
 */

const DOMAIN = 'sso-e2e.example';
const FIRM_DOMAIN = 'firma-e2e.example';
const ADMIN_DOMAIN = 'admin-e2e.example';
const FIRM_TID = '33333333-4444-4555-8666-777777777777';
const ADMIN_TID = '44444444-5555-4666-8777-888888888888';
const unique = () => randomUUID().slice(0, 8);

/** Стойностите на фалшивия доставчик (адресът е в другия процес — server.ts). */
async function idpRef(): Promise<FakeIdp> {
  const ref = await FakeIdp.create();
  ref.base = E2E_IDP_ORIGIN;
  return ref;
}

async function world() {
  const slug = 'sso-e2e';
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    const company = await db.company.findFirstOrThrow({ where: { tenantId: existing.id } });
    return { tenant: existing, company };
  }
  const tenant = await db.tenant.create({ data: { slug, name: 'SSO E2E' } });
  const company = await db.company.create({ data: { tenantId: tenant.id, name: 'Firma E2E' } });
  const ref = await idpRef();
  await makeSsoConfig(ref, { tenantId: tenant.id, domains: [DOMAIN], trustIdpMfa: true });
  await makeSsoConfig(ref, {
    tenantId: tenant.id,
    companyId: company.id,
    domains: [FIRM_DOMAIN],
    entraTenantId: FIRM_TID,
    mode: 'REQUIRED',
  });
  return { tenant, company };
}

/** TXT запис във фалшивия DNS (в процеса на server.ts). */
async function dnsWillAnswer(host: string, value: string) {
  const res = await fetch(`${E2E_IDP_ORIGIN}/_test/dns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host, value }),
  });
  expect(res.status).toBe(200);
}

/** Кой „влиза“ при доставчика при следващото пренасочване. */
async function idpWillSignIn(claims: Record<string, unknown>) {
  const res = await fetch(`${E2E_IDP_ORIGIN}/_test/next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(claims),
  });
  expect(res.status).toBe(200);
}

async function typeEmail(page: Page, email: string) {
  await page.goto(`${E2E_SSO_ORIGIN}/`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  // Излизане от полето → откриване на доставчика по домейна.
  await page.getByLabel('Password', { exact: true }).focus();
}

test('Entra ID: „Accedi con Microsoft“ → работното пространство (MFA от доставчика) → изход', async ({
  page,
}) => {
  const { tenant } = await world();
  const email = `sara-${unique()}@${DOMAIN}`;
  await makeUser({ tenantId: tenant.id, role: 'SUPPORT', email, name: 'Sara SSO', mfa: false });
  await idpWillSignIn({ oid: randomUUID(), preferred_username: email, amr: ['pwd', 'mfa'] });

  await typeEmail(page, email);
  const sso = page.getByRole('button', { name: 'Accedi con Microsoft' });
  await expect(sso).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sso.click();

  await expect(page.locator('#user-name')).toHaveText('Sara SSO');
  await expect(page.getByRole('button', { name: 'Nuovo caso' }).first()).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});

test('непознат акаунт → отказ без подробности; домейн без доставчик → без бутон', async ({
  page,
}) => {
  await world();
  await typeEmail(page, 'nessuno@example.test');
  await expect(page.getByRole('button', { name: 'Accedi con Microsoft' })).toBeHidden();

  const ghost = `ghost-${unique()}@${DOMAIN}`;
  await idpWillSignIn({ oid: randomUUID(), preferred_username: ghost });
  await typeEmail(page, ghost);
  await page.getByRole('button', { name: 'Accedi con Microsoft' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Questo account aziendale non può accedere a ChatChat. Si rivolga all’amministratore.',
  );
  expect(page.url()).not.toContain('sso_error');
});

test('SSO задължително (фирма от портала): паролата е отказана, после вход през доставчика', async ({
  page,
}) => {
  const { tenant, company } = await world();
  const email = `tecnico-${unique()}@${FIRM_DOMAIN}`;
  await makeUser({
    tenantId: tenant.id,
    role: 'PORTAL_TECHNICIAN',
    kind: 'PORTAL',
    companyId: company.id,
    email,
    name: 'Tecnico Firma',
  });
  await typeEmail(page, email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Per questo account è obbligatorio l’accesso aziendale: usi il pulsante qui sotto.',
  );
  await idpWillSignIn({ oid: randomUUID(), tid: FIRM_TID, preferred_username: email });
  await page.getByRole('button', { name: 'Accedi con Microsoft' }).click();
  await expect(page.locator('#user-name')).toHaveText('Tecnico Firma');
});

test('конзола: нов доставчик през формата → доказване на домейна (DNS) → метаданни → тест → включване', async ({
  page,
  context,
}) => {
  const tenant = await db.tenant.create({
    data: { slug: `sso-adm-${unique()}`, name: 'SSO Admin E2E' },
  });
  const admin = await makeUser({
    tenantId: tenant.id,
    role: 'TENANT_ADMIN',
    email: `ada-${unique()}@${ADMIN_DOMAIN}`,
    name: 'Ada Admin',
  });
  // Домейнът е уникален в платформата — предишен прогон на същата база го освобождава.
  await db.ssoDomain.deleteMany({ where: { domain: ADMIN_DOMAIN } });
  await cookieLogin(context, admin);
  await page.goto(`${E2E_SSO_ORIGIN}/admin.html#sso`);
  await expect(
    page.getByRole('heading', { name: 'Accesso aziendale (SSO)', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Nuovo provider' }).click();
  const form = page.getByRole('dialog', { name: 'Nuovo provider' });
  await form.getByLabel('ID directory (tenant)').fill(ADMIN_TID);
  await form.getByLabel('Client ID').fill('chatchat-test-client');
  await form.getByLabel('Segreto client').fill('fake-client-secret-0123456789abcdef');
  await form.getByLabel('Domini email consentiti').fill(ADMIN_DOMAIN);
  await form.getByRole('button', { name: 'Salva' }).click();
  const card = page.getByRole('region', { name: 'Utenti interni' });
  await expect(card).toContainText(ADMIN_TID);
  await expect(card).not.toContainText('fake-client-secret');
  await expect(card).toContainText('Disattivato');

  // Доказване на домейна: записът от конзолата → DNS → „Verifica“.
  await expect(card.getByText('Da verificare')).toBeVisible();
  const host = await card
    .getByRole('textbox', { name: `Nome del record TXT (${ADMIN_DOMAIN})` })
    .inputValue();
  const value = await card
    .getByRole('textbox', { name: `Valore del record TXT (${ADMIN_DOMAIN})` })
    .inputValue();
  expect(host).toBe(`_chatchat.${ADMIN_DOMAIN}`);
  expect(value).toMatch(/^chatchat-verify=[A-Za-z0-9_-]{43}$/);
  await card.getByRole('button', { name: `Verifica il dominio ${ADMIN_DOMAIN}` }).click();
  await expect(
    page.locator('#toasts').getByText('Record TXT non trovato', { exact: false }),
  ).toBeVisible();
  await dnsWillAnswer(host, value);
  await card.getByRole('button', { name: `Verifica il dominio ${ADMIN_DOMAIN}` }).click();
  await expect(
    page.locator('#toasts').getByText(`Dominio ${ADMIN_DOMAIN} verificato.`),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Utenti interni' })).toContainText('Verificato');

  await card.getByRole('button', { name: 'Verifica metadati' }).click();
  const check = page.getByRole('dialog', { name: 'Verifica dei metadati del provider' });
  await expect(check).toContainText('Metadati validi');
  await check.getByRole('button', { name: 'Chiudi' }).click();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target).join(',')}`)).toEqual([]);

  await idpWillSignIn({
    oid: randomUUID(),
    tid: ADMIN_TID,
    preferred_username: admin.email,
    amr: ['pwd', 'mfa'],
  });
  await card.getByRole('button', { name: 'Prova l’accesso' }).click();
  await expect(page.locator('#toasts').getByText('Test dell’accesso riuscito.')).toBeVisible();
  const tested = page.getByRole('region', { name: 'Utenti interni' });
  await expect(tested).toContainText('Riuscito');
  const cfg = await db.ssoConfig.findFirstOrThrow({ where: { tenantId: tenant.id } });
  expect(cfg.lastTestOk).toBe(true);

  // Включване — след успешния тест.
  await tested.getByRole('button', { name: 'Modifica' }).click();
  const edit = page.getByRole('dialog', { name: 'Modifica' });
  await edit.getByLabel('Attivo', { exact: true }).check();
  await edit.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#toasts').getByText('Provider aggiornato.')).toBeVisible();
  expect((await db.ssoConfig.findFirstOrThrow({ where: { tenantId: tenant.id } })).enabled).toBe(
    true,
  );
});

test('администратор: по имейл — не; „Collega con Microsoft“ от „Account“ → после вход през доставчика', async ({
  page,
  context,
}) => {
  const { tenant } = await world();
  const email = `boss-${unique()}@${DOMAIN}`;
  const admin = await makeUser({
    tenantId: tenant.id,
    role: 'TENANT_ADMIN',
    email,
    name: 'Ada Link',
  });
  const identity = { oid: randomUUID(), preferred_username: email, amr: ['pwd', 'mfa'] };
  await idpWillSignIn(identity);
  await typeEmail(page, email);
  await page.getByRole('button', { name: 'Accedi con Microsoft' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'il collegamento all’accesso aziendale lo conferma solo Lei',
  );

  // Собственикът — от своята сесия (парола + TOTP, свежа).
  await cookieLogin(context, admin);
  await page.goto(`${E2E_SSO_ORIGIN}/`);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Account e sicurezza' });
  await expect(dlg.getByText('Non collegato.')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .include('#dlg-security')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await idpWillSignIn(identity);
  await dlg.getByRole('button', { name: 'Collega con Microsoft' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Account e sicurezza' })
      .getByText('Collegato: il collegamento è stato confermato da Lei.'),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: admin.id } });
  expect(link.linkMethod).toBe('SELF');

  await page
    .getByRole('dialog', { name: 'Account e sicurezza' })
    .getByRole('button', { name: 'Chiudi' })
    .click();
  await page.getByRole('button', { name: 'Esci' }).click();
  await idpWillSignIn(identity);
  await typeEmail(page, email);
  await page.getByRole('button', { name: 'Accedi con Microsoft' }).click();
  await expect(page.locator('#user-name')).toHaveText('Ada Link');
});

test('SSO задължително, техник с TOTP без връзка: парола + код → само свързване → вход през доставчика', async ({
  page,
}) => {
  const { tenant, company } = await world();
  const email = `totp-${unique()}@${FIRM_DOMAIN}`;
  await makeUser({
    tenantId: tenant.id,
    role: 'PORTAL_TECHNICIAN',
    kind: 'PORTAL',
    companyId: company.id,
    email,
    name: 'Tecnico TOTP',
    mfa: true,
  });
  await typeEmail(page, email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi', exact: true }).click();
  await page.getByLabel('Codice a 6 cifre').fill(totpNow());
  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.getByRole('heading', { name: 'Colleghi l’account aziendale' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  const identity = { oid: randomUUID(), tid: FIRM_TID, preferred_username: email };
  await idpWillSignIn(identity);
  await page.getByRole('button', { name: 'Collega con Microsoft' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Account aziendale collegato.' }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe('');

  await idpWillSignIn(identity);
  await typeEmail(page, email);
  await page.getByRole('button', { name: 'Accedi con Microsoft' }).click();
  // Без доверие в MFA на доставчика — собственият TOTP (следващата стъпка: предишният код е ползван).
  await page.getByLabel('Codice a 6 cifre').fill(totpNow(TOTP_SECRET, 1));
  await page.getByRole('button', { name: 'Conferma' }).click();
  await expect(page.locator('#user-name')).toHaveText('Tecnico TOTP');
});
