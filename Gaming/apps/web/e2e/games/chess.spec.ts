import { test, expect } from "@playwright/test";
import { expectNoErrors, expectServerAdvanced, openGame, stateVersion, waitMyTurn } from "./helpers";

/**
 * Шах срещу бот — истински кликове по дъската (2D вариантът, WebGL е изключен
 * в проекта games-2d): избираш фигура, която може да се мести, после маркирано
 * поле. Сървърът трябва да приеме всеки ход и ботът да отговори.
 */
test("шах: правилата се затварят и се играят ходове с клик", async ({ browser, baseURL }) => {
  const t = await openGame(browser, baseURL!, "CHESS");
  const { page } = t;

  for (let move = 0; move < 6; move++) {
    if (!(await waitMyTurn(page))) break; // мачът свърши
    const movable = page.locator('[data-square][data-movable="true"]');
    await expect(movable.first()).toBeVisible();
    const count = await movable.count();
    expect(count).toBeGreaterThan(0);

    // Някои фигури са „подвижни“, но вързани — пробвай, докато се появи цел.
    let moved = false;
    for (let i = 0; i < count && !moved; i++) {
      await movable.nth(i).click();
      const target = page.locator('[data-square][data-target="true"]');
      if ((await target.count()) === 0) continue;
      const before = await stateVersion(page);
      await target.first().click();
      // Повишаване на пешка → избор на фигура.
      const promo = page.getByRole("group", { name: /Повиши|Превър/ });
      if (await promo.isVisible().catch(() => false)) await promo.getByRole("button").first().click();
      await expectServerAdvanced(page, before);
      moved = true;
    }
    expect(moved, "нито една фигура не можа да се премести с клик").toBe(true);
  }

  expectNoErrors(t);
  await t.ctx.close();
});
