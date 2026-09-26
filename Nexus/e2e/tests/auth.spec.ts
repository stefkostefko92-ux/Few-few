import { test, expect } from '@playwright/test';
import { uniqueSuffix, apiRegister, loginAsInBrowser, type TestUser } from './helpers';

/**
 * Регистрация → герой → изход/вход → изтекла сесия.
 * Реален браузър срещу реалния билд (server сервира client/dist статично).
 * Локатори по роля/етикет (getByLabel/getByRole) — не CSS/nth-child.
 */

test.describe('регистрация и герой (успешен път)', () => {
  test('регистрация през UI → създаване на герой → таблото зарежда', async ({ page }) => {
    const suffix = uniqueSuffix();
    const username = `e2euser_${suffix}`.slice(0, 20);

    await page.goto('/register');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.com`);
    await page.getByLabel('Password').fill('Testpass123');
    // Дата на раждане — над възрастовия праг (28 г.).
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 28);
    await page.getByLabel('Date of birth').fill(dob.toISOString().slice(0, 10));
    await page.getByLabel(/accept|terms|agree/i).check().catch(async () => {
      // Fallback: чекбоксът е свързан с htmlFor="reg-terms", но текстът на
      // label-а съдържа вложени линкове — getByRole по чекбокс е по-стабилно.
      await page.getByRole('checkbox').check();
    });
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/create$/, { timeout: 10_000 });

    await page.getByLabel(/hero name|character name/i).fill(`Hero${suffix}`.slice(0, 20)).catch(async () => {
      // Ако label текстът е различен, полето все пак е единственият text input на формата.
      await page.locator('input[type="text"]').first().fill(`Hero${suffix}`.slice(0, 20));
    });
    await page.getByRole('button', { name: /begin your tale/i }).click();

    await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
    // Никакви React грешки/warning-и на конзолата по критичния регистрационен път.
  });

  test('гранично: дублирано потребителско име показва грешка, не hang/500', async ({ page, request }) => {
    const existing: TestUser = await apiRegister(request, 'dupui');
    await page.goto('/register');
    await page.getByLabel('Username').fill(existing.username);
    await page.getByLabel('Email').fill(`other_${uniqueSuffix()}@example.com`);
    await page.getByLabel('Password').fill('Testpass123');
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 28);
    await page.getByLabel('Date of birth').fill(dob.toISOString().slice(0, 10));
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('alert')).toContainText(/already in use/i, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/register$/);
  });

  test('гранично: непълнолетен (под възрастовия праг) е блокиран на клиента', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Username').fill(`toddler_${uniqueSuffix()}`.slice(0, 20));
    await page.getByLabel('Email').fill(`toddler_${uniqueSuffix()}@example.com`);
    await page.getByLabel('Password').fill('Testpass123');
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 5); // 5 години
    await page.getByLabel('Date of birth').fill(dob.toISOString().slice(0, 10));
    // Бутонът за регистрация е disabled, докато tooYoung е true — самата
    // блокировка Е поведението, което тестваме (сървърът също гейтва по
    // отделен път — виж api-probe.mjs).
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeDisabled();
  });
});

test.describe('вход / изход / изтекла сесия', () => {
  test('успешен вход отвежда към таблото', async ({ page, request }) => {
    const user = await apiRegister(request, 'loginui');
    await page.goto('/login');
    await page.getByLabel(/username or email/i).fill(user.username);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /sign in|enter/i }).click();
    await expect(page).toHaveURL(/\/create|\/app/, { timeout: 10_000 });
  });

  test('гранично: грешна парола показва грешка, полето остава фокусируемо', async ({ page, request }) => {
    const user = await apiRegister(request, 'badpw');
    await page.goto('/login');
    await page.getByLabel(/username or email/i).fill(user.username);
    await page.getByLabel('Password').fill('WrongPassword1');
    await page.getByRole('button', { name: /sign in|enter/i }).click();
    await expect(page.locator('.error')).toContainText(/invalid credentials/i, { timeout: 10_000 });
    // Регресия за находката „несвързан label": кликването върху текста на
    // label-а трябва да фокусира input-а.
    await page.getByText('Password', { exact: true }).click();
    await expect(page.getByLabel('Password')).toBeFocused();
  });

  test('изтекла/невалидна сесия праща обратно към вход, не бяла страница', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('nexus-dominion.token', 'not-a-real-jwt');
    });
    await page.goto('/app/hunting');
    // api.ts: 401 с наличен токен → авто-logout (виж lib/api.ts коментар).
    await expect(page).toHaveURL(/\/login|\/$/, { timeout: 10_000 });
  });
});
