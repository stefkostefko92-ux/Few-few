import { expect, request, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * Shared harness for the per-game e2e specs: a fresh player per test, the
 * game opened from its URL, the rules dialog dismissed the way a person would
 * (its visible button), and helpers that read the hidden match probe
 * (`data-testid="match-probe"`, rendered by MatchStatus) to know whose turn it
 * is and whether the server accepted a move — never translated text.
 */

export interface Table {
  page: Page;
  ctx: BrowserContext;
  /** Uncaught page errors and console errors seen so far. */
  errors: string[];
}

let seq = 0;

/** Register a brand-new player through the API and return its session. */
export async function newPlayer(baseURL: string): Promise<Awaited<ReturnType<BrowserContext["storageState"]>>> {
  const ctx = await request.newContext({ baseURL });
  const stamp = `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const res = await ctx.post("/api/auth/register", {
    data: {
      email: `e2e-${stamp}@e2e.test`,
      password: "Passw0rd!23",
      displayName: `E2E${stamp}`.slice(0, 20),
      acceptedTerms: true,
    },
  });
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  const state = await ctx.storageState();
  await ctx.dispose();
  return state;
}

/** Console noise that is not an application error (headless GPU, favicons). */
const IGNORED = [/GL Driver Message/i, /favicon\.ico/i, /WebGL/i, /PCFSoftShadowMap/i, /Download the React DevTools/i];

/** Open `game` (lobby key, e.g. "CHESS") for a fresh player and wait for the
 *  live match. The first visit auto-opens the rules; it must close through its
 *  own visible button — the regression where nothing on the table could be
 *  clicked started exactly there. */
export async function openGame(browser: Browser, baseURL: string, game: string): Promise<Table> {
  const storageState = await newPlayer(baseURL);
  const ctx = await browser.newContext({ storageState, baseURL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text) || re.test(m.location().url ?? ""))) return;
    errors.push(`console: ${text}`);
  });

  await page.goto(`play/${game.toLowerCase()}`);

  // the rules — not a decision popup (DecisionPrompt is a non-modal dialog too)
  const rules = page.locator('[role="dialog"]:not([data-decision])');
  await expect(rules).toBeVisible();
  const gotIt = rules.getByRole("button", { name: /Разбрах/ });
  await expect(gotIt).toBeInViewport();
  await gotIt.click();
  await expect(rules).toBeHidden();

  // Bots fill the seats after BOT_FALLBACK_SECONDS.
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  return { page, ctx, errors };
}

export function probe(page: Page): Locator {
  return page.getByTestId("match-probe");
}

export async function stateVersion(page: Page): Promise<number> {
  return Number((await probe(page).getAttribute("data-version")) ?? "0");
}

/** Wait until it is my turn with at least one legal action (or the match ends).
 *  Returns false when the match ended first. */
export async function waitMyTurn(page: Page, timeout = 60_000): Promise<boolean> {
  const p = probe(page);
  await expect
    .poll(
      async () => {
        const phase = await p.getAttribute("data-phase");
        if (phase === "over") return "over";
        const mine = (await p.getAttribute("data-my-turn")) === "true";
        const legal = Number((await p.getAttribute("data-legal")) ?? "0");
        return mine && legal > 0 ? "mine" : "wait";
      },
      { timeout, intervals: [150, 250, 500] },
    )
    .not.toBe("wait");
  return (await p.getAttribute("data-phase")) !== "over";
}

/** After a click that should send a move: the server must answer with a new
 *  state. `before` is stateVersion() read just before the click. */
export async function expectServerAdvanced(page: Page, before: number, timeout = 10_000): Promise<void> {
  await expect.poll(() => stateVersion(page), { timeout }).toBeGreaterThan(before);
}

/** True once the match is over (game-over card visible). */
export async function isOver(page: Page): Promise<boolean> {
  return (await probe(page).getAttribute("data-phase")) === "over";
}

/** Wait for the game-over card and check its buttons are reachable. */
export async function expectGameOverCard(page: Page, timeout = 120_000): Promise<void> {
  await expect(probe(page)).toHaveAttribute("data-phase", "over", { timeout });
  const card = page.locator(".cine-over__card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("button").first()).toBeInViewport();
}

/** Fail with every collected page/console error. */
export function expectNoErrors(t: Table): void {
  expect(t.errors, t.errors.join("\n")).toEqual([]);
}
