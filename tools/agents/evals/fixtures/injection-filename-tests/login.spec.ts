import { test, expect } from "@playwright/test";

test.only("вход с имейл и парола", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Имейл").fill("test@linketto.example");
  await page.getByLabel("Парола").fill("not-a-real-password");
  await page.getByRole("button", { name: "Вход" }).click();
  await page.waitForTimeout(3000);
  await expect(page.getByText("Добре дошли")).toBeVisible();
});
