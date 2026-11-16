import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Проверки за прозореца за решение (DecisionPrompt): излиза сам, когато
 * решението е на ред, побира се в екрана, не покрива това, по което се
 * решава, „Виж масата“ го свива в хапче, хапчето го връща, „Не сега“ скрива
 * обява по желание. Само наблюдение + истински кликове.
 */

export function decision(page: Page): Locator {
  return page.locator("[data-decision]");
}

/** A button / control inside the open decision popup. */
export function inDecision(page: Page, selector: string): Locator {
  return page.locator(`[data-decision] ${selector}`);
}

/** The popup is up by itself and lies fully inside the viewport. */
export async function expectDecisionOnScreen(page: Page, title?: RegExp): Promise<void> {
  const box = decision(page);
  await expect(box).toBeVisible();
  if (title) await expect(box.locator("h2")).toHaveText(title);
  const b = await box.boundingBox();
  const vp = page.viewportSize();
  expect(b, "прозорецът няма размери").not.toBeNull();
  expect(vp).not.toBeNull();
  expect(b!.x, "прозорецът излиза вляво").toBeGreaterThanOrEqual(0);
  expect(b!.y, "прозорецът излиза отгоре").toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width, "прозорецът излиза вдясно").toBeLessThanOrEqual(vp!.width + 1);
  expect(b!.y + b!.height, "прозорецът излиза отдолу").toBeLessThanOrEqual(vp!.height + 1);
}

/** None of these parts of the table (what the decision is made by) is
 *  covered by the popup. Elements that are not rendered are skipped. Polled:
 *  a scene may scroll the table clear of the popup just after it comes up. */
export async function expectDecisionClearOf(page: Page, parts: Record<string, string>): Promise<void> {
  await expect(async () => {
    const b = await decision(page).boundingBox();
    expect(b, "прозорецът не е отворен").not.toBeNull();
    for (const [name, sel] of Object.entries(parts)) {
      for (const el of await page.locator(sel).all()) {
        if (!(await el.isVisible())) continue;
        const o = await el.boundingBox();
        if (!o) continue;
        const overlap =
          b!.x < o.x + o.width - 1 && o.x < b!.x + b!.width - 1 && b!.y < o.y + o.height - 1 && o.y < b!.y + b!.height - 1;
        expect(overlap, `прозорецът покрива „${name}“: ${JSON.stringify(b)} ${JSON.stringify(o)}`).toBe(false);
      }
    }
  }).toPass({ timeout: 4_000 });
}

/** „Виж масата“ свива прозореца в хапче (решението остава); хапчето го връща. */
export async function expectMinimizeAndReopen(page: Page): Promise<void> {
  const box = decision(page);
  const key = await box.getAttribute("data-decision-key");
  await box.locator("[data-decision-minimize]").click();
  await expect(box).toHaveCount(0);
  const pill = page.locator("[data-decision-reopen]");
  await expect(pill).toBeVisible();
  await expect(pill).toBeInViewport();
  await pill.click();
  await expect(pill).toHaveCount(0);
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("data-decision-key", key ?? "");
}

/** „Не сега“ (обява по желание): прозорецът изчезва, без хапче. */
export async function skipDecision(page: Page): Promise<void> {
  const box = decision(page);
  await box.locator("[data-decision-skip]").click();
  await expect(box).toHaveCount(0);
  await expect(page.locator("[data-decision-reopen]")).toHaveCount(0);
}
