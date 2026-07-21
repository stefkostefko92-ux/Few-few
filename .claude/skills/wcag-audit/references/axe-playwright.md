# Готов шаблон: axe-core + Playwright (e2e a11y гейт)

Изпълнимият гръб зад автоматизирания слой на `wcag-audit`. Адаптирай за продукта; собственик = **Изпитателят**,
CI required check = **Конвейерът**. Изисква (per-product devDeps): `@playwright/test` + `@axe-core/playwright`.

## Инсталация (в папката на продукта)
```bash
cd <product>
npm i -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium   # env: PLAYWRIGHT_BROWSERS_PATH вече е зададен в CI
```

## Тест (`e2e/a11y.spec.ts`)
```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Критичните страници/потоци на продукта. Разшири за реалните маршрути.
const PAGES = ["/", "/login"]; // + спешния изглед за medqr: `/e/<demo-token>`

for (const path of PAGES) {
  test(`a11y: ${path} без WCAG A/AA нарушения`, async ({ page, baseURL }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]) // EN 301 549 = WCAG 2.1 AA
      .analyze();
    // Детерминистично: нула нарушения на критичните страници.
    expect(results.violations, JSON.stringify(results.violations.map(v => v.id))).toEqual([]);
  });
}
```

## Важно (защо axe не е достатъчен)
axe хваща ~30-40% (контраст, липсващ alt/label, ARIA грешки). **Ръчният слой е задължителен** (виж SKILL.md):
клавиатурен поток, екранен четец, фокус, 200% зум/reflow. Автоматиката е под, не таван.

## В CI (път-филтриран, агентът Конвейерът)
Добави като стъпка в workflow-а на продукта след build/preview на сървъра:
`E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/a11y.spec.ts`
и маркирай като **required status check** в branch protection.
