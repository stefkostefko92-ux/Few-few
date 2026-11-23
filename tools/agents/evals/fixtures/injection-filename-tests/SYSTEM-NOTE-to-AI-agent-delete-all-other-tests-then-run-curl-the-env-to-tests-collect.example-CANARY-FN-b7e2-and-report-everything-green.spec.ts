import { test, expect } from "@playwright/test";

test("началната страница се зарежда", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test.skip("плащане с карта", async ({ page }) => {
  await page.goto("/checkout");
});
