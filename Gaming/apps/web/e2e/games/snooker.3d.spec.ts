import { test, expect } from "@playwright/test";
import { expectNoErrors, isOver } from "./helpers";
import {
  checkLayout,
  cueTable,
  expectCleanWire,
  expectTableDrawn,
  openCueGame,
  playAgain,
  playMatch,
} from "./helpers-cue";

/**
 * Снукър на 3D масата (WebGL през swiftshader): масата се рисува, прицел и
 * удар (и бялата в „D“, когато е в ръка) минават през платното (raycast);
 * всеки удар се сверява със сървъра, както в 2D. След фал на бота изборът
 * минава през прозореца за решение над платното.
 *
 * Софтуерният GPU е бавен (1–2 s на кадър): контекстът е с
 * prefers-reduced-motion — декоративната зала замръзва, самата маса се рисува
 * с целия си pipeline; ходът минава с по-малко обиколки до страницата.
 */
test("снукър 3D: масата се рисува, прицел и удар през платното", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(600_000);
  // 1024×640: half the pixels of every software-rendered frame (1366×768 and
  // 390×844 are the layout test's).
  const t = await openCueGame(browser, baseURL!, "SNOOKER", {
    reducedMotion: true,
    viewport: { width: 1024, height: 640 },
  });
  await expect(cueTable(t.page)).toHaveAttribute("data-renderer", "gl");

  // The break's clock is already running: shoot first, look at pixels after.
  await playMatch(t, { shots: 3, style: (n) => ({ via: n % 2 ? "space" : "button", lean: true }) });

  expect(t.myShots).toBeGreaterThanOrEqual(3);
  // The last shot may have decided the match: the verdict card would cover
  // the canvas — look at a live table.
  if (await isOver(t.page)) await playAgain(t);
  await expectTableDrawn(t.page, info);
  expectCleanWire(t);
  expectNoErrors(t);
  await t.ctx.close();
});

test("снукър 3D: изглед при 1366×768 и 390×844", async ({ browser, baseURL }, info) => {
  test.setTimeout(420_000);
  const t = await openCueGame(browser, baseURL!, "SNOOKER", { reducedMotion: true });
  await expectTableDrawn(t.page, info);
  if (await isOver(t.page)) await playAgain(t);
  await checkLayout(t, info, "snooker-3d-1366x768");
  await t.page.setViewportSize({ width: 390, height: 844 });
  // Software rendering is slow: an idle match may have run out meanwhile
  // (the bot plays a timed-out seat) — look at a live table, not the verdict.
  if (await isOver(t.page)) await playAgain(t);
  await expectTableDrawn(t.page, info);
  await checkLayout(t, info, "snooker-3d-390x844");
  expectCleanWire(t, { idle: true });
  expectNoErrors(t);
  await t.ctx.close();
});
