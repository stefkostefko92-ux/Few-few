import { test, expect } from '@playwright/test';
import { apiRegister, apiCreateCharacter, loginAsInBrowser, uniqueSuffix } from './helpers';

/**
 * Лов — основният "филър" цикъл. Реален браузър, реален сървър (боят се
 * решава на сървъра — клиентът само рендерира резултата, виж CLAUDE.md).
 * Не пипаме client/src/combat/engine/** — само наблюдаваме резултата от
 * гледна точка на потребителя.
 */

test('лов: успешен път — резултатът от сървъра стига до екрана (боят се показва коректно)', async ({ page, request }) => {
  const user = await apiRegister(request, 'hunt');
  await apiCreateCharacter(request, user, `Hunter${uniqueSuffix()}`.slice(0, 20), 'warrior');
  await loginAsInBrowser(page, user, '/app/hunting');

  const huntBtn = page.getByRole('button', { name: /hunt here/i }).first();
  await expect(huntBtn).toBeVisible({ timeout: 10_000 });
  await huntBtn.click();

  // НАМЕРЕНО, НЕ ПОПРАВЕНО (извън обхвата ми — client/src/combat/engine/**):
  // под софтуерен GL рендерер (swiftshader, без GPU — точно средата тук)
  // CombatScene/boy анимацията увисва на "Tempering the shaders" и НЕ
  // завършва дори след 90s, дори през "Skip ahead" контролата (main.js:286
  // `skip()` само мести `clock.T`/`clock.jumped` — зависи animation loop-ът
  // (`renderer.setAnimationLoop`) вече изобщо да тиктака, а под swiftshader
  // той изглежда не напредва отвъд компилацията на шейдърите). Реален риск:
  // играч на машина без GPU (стар лаптоп, remote desktop, VM) може да засядя
  // на "Hunt Again" недостижимо. Докладвано на Кодаджията/собственика на
  // combat engine-а — виж доклада; НЕ пипнато тук.
  //
  // Затова тестът проверява самото ПРЕХВЪРЛЯНЕ на резултата от сървъра към
  // екрана (имената/HP от реалния бой ги показва React, преди самата 3D
  // анимация въобще да тръгне) — истинско поведение, детерминистично,
  // без да чака кадрите на движока.
  await expect(page.getByText(/size each other up|combatants/i).or(page.getByRole('img', { name: /animated 3d scene/i })))
    .toBeVisible({ timeout: 15_000 });

  // Cooldown-ът вече е ангажиран server-side (claimCooldown, виж fix(cooldowns))
  // — потвърждаваме през API, че втори лов веднага след това е коректно
  // отказан, вместо да чакаме UI анимацията да засяда.
  const res = await request.post('/api/hunting/hunt', {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { region: 'whispering_woods' },
  });
  expect(res.status()).toBe(429);
});

test('лов: гранично — заключен регион показва изискваното ниво, не праща заявка', async ({ page, request }) => {
  const user = await apiRegister(request, 'huntlocked');
  await apiCreateCharacter(request, user, `Rookie${uniqueSuffix()}`.slice(0, 20), 'mage');
  await loginAsInBrowser(page, user, '/app/hunting');

  // Ниво 1 герой — регионите с по-висок гейт показват "Requires Lv N" и
  // бутонът е disabled (виж Hunting.tsx: disabled={!r.unlocked}).
  const lockedCard = page.getByRole('button', { name: /requires lv/i }).first();
  await expect(lockedCard).toBeVisible({ timeout: 10_000 });
  await expect(lockedCard).toBeDisabled();
});

test('лов: гранично — две паралелни /hunting/hunt заявки за същия герой не удвояват наградата (сървърът е авторитетен)', async ({ request }) => {
  // API ниво (детерминистично — не завúси от UI анимационен тайминг):
  // регресия за находката "cooldown race" (виж fix(cooldowns) комита и
  // server/src/game/__tests__/cooldowns.test.ts за unit покритието).
  // Тук доказваме поведението edge-to-edge: двете HTTP заявки заедно, не
  // само вътрешната функция.
  const user = await apiRegister(request, 'huntrace');
  await apiCreateCharacter(request, user, `Racer${uniqueSuffix()}`.slice(0, 20), 'rogue');

  const auth = { Authorization: `Bearer ${user.token}` };
  const [r1, r2] = await Promise.all([
    request.post('/api/hunting/hunt', { headers: auth, data: { region: 'whispering_woods' } }),
    request.post('/api/hunting/hunt', { headers: auth, data: { region: 'whispering_woods' } }),
  ]);
  const statuses = [r1.status(), r2.status()].sort();
  // Едната печели (200 — бой се провежда), другата отпада на cooldown-а
  // (429) ПРЕДИ да рискува награда — не 500, не hang, не 200+200.
  expect(statuses).toEqual([200, 429]);
});
