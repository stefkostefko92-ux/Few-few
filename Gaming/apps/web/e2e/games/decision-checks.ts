import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Прозорецът за решение (DecisionPrompt, `[data-decision]`) — общи проверки за
 * шах, Магнат, домино, зарове и табла:
 *  - идва САМ, когато решението е мое (тестът не кликва нищо, за да го отвори);
 *  - целият е в екрана (нищо не излиза встрани или под ръба);
 *  - „Виж масата“ го свива в хапче, а хапчето го връща;
 *  - не закрива това, по което се решава (проверка с `elementFromPoint`).
 */

/** Прозорецът с `testId` е видим и изцяло в екрана; връща го. */
export async function expectDecisionOnScreen(page: Page, testId: string): Promise<Locator> {
  const card = page.getByTestId(testId);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-decision", "");
  // Входната анимация (260 ms) мести и мащабира картата — мерим, щом спре.
  let box = await card.boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(120);
    const cur = await card.boundingBox();
    const still = !!cur && !!box && Math.abs(cur.y - box.y) < 0.5 && Math.abs(cur.height - box.height) < 0.5;
    box = cur;
    if (still) break;
  }
  expect(box, `прозорецът „${testId}“ няма размери`).not.toBeNull();
  if (!box) return card;
  const vp = page.viewportSize()!;
  const inside = box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
  expect(inside, `прозорецът „${testId}“ излиза от екрана: ${JSON.stringify(box)} в ${vp.width}×${vp.height}`).toBe(true);
  return card;
}

/** „Виж масата“ свива прозореца в хапче; хапчето го връща (същото решение). */
export async function expectMinimizeRestore(page: Page, testId: string): Promise<void> {
  const card = await expectDecisionOnScreen(page, testId);
  const key = await card.getAttribute("data-decision-key");
  await card.locator("[data-decision-minimize]").click();
  await expect(card).toBeHidden();
  const pill = page.getByTestId(`${testId}-reopen`);
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute("data-decision-reopen", "");
  await expect(pill).toBeInViewport();
  await pill.click();
  await expect(pill).toBeHidden();
  const back = await expectDecisionOnScreen(page, testId);
  await expect(back).toHaveAttribute("data-decision-key", key ?? "");
}

/**
 * Прозорецът не закрива `target`: в точката `fy` от височината на целта (по
 * подразбиране средата) `elementFromPoint` не е нещо от прозореца.
 */
export async function expectNotCovered(page: Page, testId: string, target: Locator, what: string, fy = 0.5): Promise<void> {
  await expect(target).toBeVisible();
  const covered = await target.evaluate(
    (el, { id, f }) => {
      const card = document.querySelector(`[data-testid="${id}"]`);
      if (!card) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * f);
      return !!hit && card.contains(hit);
    },
    { id: testId, f: fy },
  );
  expect(covered, `прозорецът „${testId}“ закрива ${what}`).toBe(false);
}
