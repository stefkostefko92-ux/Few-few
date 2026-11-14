import { test, expect, request, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expectNoErrors, expectServerAdvanced, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import { snapBoth } from "./helpers-board";
import { expectDecisionOnScreen, expectMinimizeRestore } from "./decision-checks";

/**
 * Шах срещу бот — истински кликове по дъската (2D вариантът, WebGL е изключен
 * в проекта games-2d): избираш фигура, която може да се мести, после маркирано
 * поле. Сървърът трябва да приеме всеки ход и ботът да отговори.
 */

/** Един ход с клик: подвижна фигура → маркирано поле (при повишаване — дама от прозореца). */
async function clickMove(page: Page): Promise<void> {
  const movable = page.locator('[data-square][data-movable="true"]');
  await expect(movable.first()).toBeVisible();
  const count = await movable.count();
  expect(count).toBeGreaterThan(0);
  // Някои фигури са „подвижни“, но вързани — пробвай, докато се появи цел.
  for (let i = 0; i < count; i++) {
    await movable.nth(i).click();
    const target = page.locator('[data-square][data-target="true"]');
    if ((await target.count()) === 0) continue;
    const before = await stateVersion(page);
    await target.first().click();
    // Повишаване на пешка → изборът на фигура идва сам в прозореца за решение.
    const promo = page.getByTestId("chess-promotion");
    if (await promo.isVisible().catch(() => false)) {
      await expectDecisionOnScreen(page, "chess-promotion");
      await promo.locator('[data-action="promote"][data-piece="q"]').click();
    }
    await expectServerAdvanced(page, before);
    return;
  }
  throw new Error("нито една фигура не можа да се премести с клик");
}

test("шах: правилата се затварят и се играят ходове с клик", async ({ browser, baseURL }) => {
  const t = await openGame(browser, baseURL!, "CHESS");
  const { page } = t;

  for (let move = 0; move < 6; move++) {
    if (!(await waitMyTurn(page))) break; // мачът свърши
    // Обикновеният ход няма прозорец.
    await expect(page.locator("[data-decision]")).toHaveCount(0);
    await clickMove(page);
  }

  expectNoErrors(t);
  await t.ctx.close();
});

/**
 * „Предложи реми“ и „Предай се“ искат потвърждение в прозореца за решение:
 * „Не, продължи“ не праща нищо, ново питане го показва пак, „Виж масата“ го
 * свива в хапче, а потвърждението праща хода (предаването слага край).
 */
test("шах: реми и предаване се потвърждават в прозореца за решение", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const t = await openGame(browser, baseURL!, "CHESS");
  const { page } = t;
  expect(await waitMyTurn(page)).toBe(true);

  // 1) „Предложи реми“ → прозорец; отказ — нищо не се праща.
  await page.locator('[data-action="draw-offer"]').click();
  await expectMinimizeRestore(page, "chess-confirm");
  await expect(page.getByTestId("chess-confirm")).toContainText("Да предложиш ли реми?");
  const v0 = await stateVersion(page);
  await page.getByTestId("chess-confirm").locator("[data-decision-skip]").click();
  await expect(page.getByTestId("chess-confirm")).toBeHidden();
  await page.waitForTimeout(400);
  expect(await stateVersion(page), "отказът прати ход").toBe(v0);

  // 2) Пак „Предложи реми“ — ново питане, прозорецът е отново тук → потвърждение.
  await page.locator('[data-action="draw-offer"]').click();
  await expectDecisionOnScreen(page, "chess-confirm");
  await snapBoth(page, "chess-confirm-draw");
  await page.locator('[data-action="draw-offer-confirm"]').click();
  await expectServerAdvanced(page, v0);
  await expect(page.getByTestId("chess-confirm")).toBeHidden();
  // Предложението стои: второ не може.
  await expect(page.locator('[data-action="draw-offer"]')).toBeDisabled();
  // Ходът си е мой и след предложението.
  await clickMove(page);

  // 3) „Предай се“ → прозорец → потвърждение → край на партията.
  expect(await waitMyTurn(page)).toBe(true);
  await page.locator('[data-action="resign"]').click();
  await expectDecisionOnScreen(page, "chess-confirm");
  await expect(page.getByTestId("chess-confirm")).toContainText("Да се предадеш ли?");
  await snapBoth(page, "chess-confirm-resign");
  await page.locator('[data-action="resign-confirm"]').click();
  await expect(probe(page)).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  await expect(page.locator(".cine-over__card")).toBeVisible();
  expectNoErrors(t);
  await t.ctx.close();
});

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** Нов играч с известно име (за да го намери другият в списъка със стаи). */
async function register(baseURL: string, tag: string): Promise<{ state: Session; name: string }> {
  const ctx = await request.newContext({ baseURL });
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const name = `${tag}${stamp}`.slice(0, 20);
  const res = await ctx.post("/api/auth/register", {
    data: { email: `e2e-${tag}-${stamp}@e2e.test`, password: "Passw0rd!23", displayName: name, acceptedTerms: true },
  });
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  const state = await ctx.storageState();
  await ctx.dispose();
  return { state, name };
}

async function seated(browser: Browser, baseURL: string, state: Session) {
  const ctx = await browser.newContext({ storageState: state, baseURL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page, errors };
}

/** Първото посещение на играта отваря правилата — затварят се с „Разбрах“. */
async function closeRules(page: Page): Promise<void> {
  const gotIt = page.getByRole("dialog").getByRole("button", { name: /Разбрах/ });
  await gotIt.click({ timeout: 20_000 }).catch(() => undefined);
}

/**
 * Двама души (стая, без ботове): белите предлагат реми и играят ход; на черните
 * предложението идва САМО като прозорец за решение — свива се и се връща, а
 * „Приеми реми“ слага край с реми и при двамата.
 */
test("шах: предложеното от съперника реми идва само като прозорец", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const hostP = await register(baseURL!, "H");
  const guestP = await register(baseURL!, "G");
  const host = await seated(browser, baseURL!, hostP.state);
  const guest = await seated(browser, baseURL!, guestP.state);

  await host.page.goto("rooms");
  await host.page.getByRole("combobox").first().selectOption("CHESS");
  await host.page.getByRole("button", { name: "Създай" }).click();
  await expect(host.page.getByRole("heading", { name: /стая/ })).toBeVisible();

  await guest.page.goto("rooms");
  const row = guest.page.locator("li").filter({ hasText: hostP.name });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Влез" }).click();
  await expect(guest.page.getByRole("heading", { name: /стая/ })).toBeVisible();

  const start = host.page.getByRole("button", { name: "Започни играта" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(host.page).toHaveURL(/\/play\/chess/);
  await expect(guest.page).toHaveURL(/\/play\/chess/);
  await Promise.all([closeRules(host.page), closeRules(guest.page)]);
  await expect(probe(host.page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  await expect(probe(guest.page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });

  const hostSeat = Number(await probe(host.page).getAttribute("data-seat"));
  const [white, black] = hostSeat === 0 ? [host.page, guest.page] : [guest.page, host.page];

  // Белите: реми (потвърдено в прозореца) и ход.
  expect(await waitMyTurn(white)).toBe(true);
  await white.locator('[data-action="draw-offer"]').click();
  const v = await stateVersion(white);
  await white.locator('[data-action="draw-offer-confirm"]').click();
  await expectServerAdvanced(white, v);
  // Докато не е мой ред, черните нямат прозорец (решението още не е тяхно).
  await expect(black.getByTestId("chess-draw-offer")).toHaveCount(0);
  await clickMove(white);

  // Черните: прозорецът идва сам — без клик.
  expect(await waitMyTurn(black)).toBe(true);
  await expectMinimizeRestore(black, "chess-draw-offer");
  await expect(black.getByTestId("chess-draw-offer")).toContainText("Съперникът предлага реми");
  await snapBoth(black, "chess-draw-offer");
  await black.locator('[data-action="draw-accept"]').click();
  await expect(probe(black)).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  await expect(probe(white)).toHaveAttribute("data-phase", "over", { timeout: 15_000 });
  await expect(black.locator(".cine-over__card").getByRole("heading", { level: 2 })).toHaveText(/Равенство/);

  expect(host.errors, host.errors.join("\n")).toEqual([]);
  expect(guest.errors, guest.errors.join("\n")).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});
