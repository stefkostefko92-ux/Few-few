import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(here, ".auth/host.json");
const GUEST = path.join(here, ".auth/guest.json");

test.describe("lobby/room flow", () => {
  test("two players: create a public room, join, and start the game", async ({ browser }) => {
    const hostCtx = await browser.newContext({ storageState: HOST });
    const guestCtx = await browser.newContext({ storageState: GUEST });
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    // Host creates a public Chess room.
    await host.goto("/rooms");
    await host.getByRole("combobox").first().selectOption("CHESS");
    await host.getByRole("button", { name: "Създай" }).click();
    await expect(host.getByRole("heading", { name: /стая/ })).toBeVisible();

    // Guest browses the public list and joins.
    await guest.goto("/rooms");
    await guest.getByRole("button", { name: "Влез" }).first().click();
    await expect(guest.getByRole("heading", { name: /стая/ })).toBeVisible();

    // With both seats filled the host can start.
    const start = host.getByRole("button", { name: "Започни играта" });
    await expect(start).toBeEnabled();
    await start.click();

    // Both players land in the live game.
    await expect(host).toHaveURL(/\/play\/chess/);
    await expect(guest).toHaveURL(/\/play\/chess/);

    await hostCtx.close();
    await guestCtx.close();
  });

  test("solo host fills a variable-seat room with bots, then starts", async ({ browser }) => {
    const hostCtx = await browser.newContext({ storageState: HOST });
    const host = await hostCtx.newPage();

    // Магнат rooms allow 2–6 seats; the host adds a bot to reach the minimum.
    await host.goto("/rooms");
    await host.getByRole("combobox").first().selectOption("MAGNAT");
    await host.getByRole("button", { name: "Създай" }).click();
    await expect(host.getByRole("heading", { name: /стая/ })).toBeVisible();

    const start = host.getByRole("button", { name: "Започни играта" });
    await expect(start).toBeDisabled(); // only the host so far
    await host.getByRole("button", { name: "Добави бот" }).click();
    await expect(start).toBeEnabled(); // host + bot ≥ min (2)
    await start.click();

    await expect(host).toHaveURL(/\/play\/magnat/);
    await hostCtx.close();
  });
});
