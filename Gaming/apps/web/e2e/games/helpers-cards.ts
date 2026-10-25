import { expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  expectGameOverCard,
  expectServerAdvanced,
  newPlayer,
  probe,
  stateVersion,
  type Table,
} from "./helpers";

/**
 * Card-table helpers on top of helpers.ts (Сантасе, Белот, Бридж, Кент).
 *
 * The stack deals FIXED hands for these games (`E2E_SEEDS` in
 * infra/e2e-games.sh, honoured only outside production), so each spec walks a
 * known scenario that reaches every action a player has — the scenario of
 * each seed is described in its spec. Everything still goes through real
 * clicks on the table; the probe only tells whose turn it is.
 */

/** Console noise that is not an application error (same list as helpers.ts). */
const IGNORED = [
  /GL Driver Message/i,
  /favicon\.ico/i,
  /WebGL/i,
  /PCFSoftShadowMap/i,
  /Download the React DevTools/i,
];

export type Difficulty = "EASY" | "NORMAL" | "HARD";
const DIFFICULTY_LABEL: Record<Difficulty, RegExp> = {
  EASY: /^Лесно$/,
  NORMAL: /^Нормално$/,
  HARD: /^Трудно$/,
};

export const DESKTOP = { width: 1366, height: 768 } as const;
export const PHONE = { width: 390, height: 844 } as const;

export interface OpenOpts {
  /** Choose the bot strength in the lobby first — the picker a player uses. */
  difficulty?: Difficulty;
  /** Device size from the very first paint (a resize later is not the same). */
  viewport?: { width: number; height: number };
}

/** openGame() from helpers.ts plus two things a player can choose: the bot
 *  difficulty and the device. Same contract: rules closed via their button,
 *  live match with bots seated. */
export async function openTable(
  browser: Browser,
  baseURL: string,
  game: string,
  opts: OpenOpts = {},
): Promise<Table> {
  const storageState = await newPlayer(baseURL);
  const ctx = await browser.newContext({
    storageState,
    baseURL,
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text) || re.test(m.location().url ?? ""))) return;
    errors.push(`console: ${text}`);
  });

  if (opts.difficulty) {
    await page.goto("./");
    const picker = page.getByRole("group", { name: /Трудност/ });
    const option = picker.getByRole("button", { name: DIFFICULTY_LABEL[opts.difficulty] });
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }

  await page.goto(`play/${game.toLowerCase()}`);
  // the rules — not a decision popup (DecisionPrompt is a non-modal dialog too)
  const rules = page.locator('[role="dialog"]:not([data-decision])');
  await expect(rules).toBeVisible();
  const gotIt = rules.getByRole("button", { name: /Разбрах/ });
  await expect(gotIt).toBeInViewport();
  await gotIt.click();
  await expect(rules).toBeHidden();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  await expectRoomNotScrollable(page);
  return { page, ctx, errors };
}

/** The dark room around the table can't be scrolled: as an `overflow:
 *  hidden` box (its film grain overhangs by 50%) any scrollIntoView — focus,
 *  find-in-page, a click retry — shoved the whole table up-left, for good. */
export async function expectRoomNotScrollable(page: Page): Promise<void> {
  const moved = await page.locator(".cine").evaluate((el) => {
    el.scrollTop = 300;
    el.scrollLeft = 300;
    const at = { top: el.scrollTop, left: el.scrollLeft };
    el.scrollTop = 0;
    el.scrollLeft = 0;
    return at;
  });
  expect(moved, "the room scrolled — the table can be pushed out of view").toEqual({
    top: 0,
    left: 0,
  });
}

export interface CardView {
  card: string;
  playable: boolean;
}

/** Cards of a zone (`hand`, `dummy`, `center`, `trick`, `talon`) in screen order. */
export async function cardsIn(page: Page, zone: string): Promise<CardView[]> {
  return page
    .locator(`[data-zone="${zone}"] [data-card]`)
    .evaluateAll((els) =>
      els.map((e) => ({
        card: e.getAttribute("data-card") ?? "",
        playable: e.getAttribute("data-playable") === "true",
      })),
    );
}

export function cardIn(page: Page, zone: string, card: string): Locator {
  return page.locator(`[data-zone="${zone}"] [data-card="${card}"]`);
}

/** Hand cards overlap: the visible part of a card is its left strip, so
 *  click there (a person does the same) instead of the covered centre. */
export const CARD_GRIP = { position: { x: 8, y: 34 } } as const;

/** Click something that must send exactly one move and wait until the server
 *  answered with a new state (it is my turn, so nothing else moves first). */
export async function act(
  page: Page,
  target: Locator,
  options?: Parameters<Locator["click"]>[0],
): Promise<void> {
  await expect(target).toBeVisible();
  const before = await stateVersion(page);
  await target.click(options);
  await expectServerAdvanced(page, before);
}

async function dealNo(page: Page): Promise<string> {
  return (await page.locator('[data-zone="score"]').first().getAttribute("data-deal")) ?? "";
}

/** Play a card of a zone by clicking its visible strip; the server must accept
 *  and the card must leave that hand — unless it closed the deal and a new
 *  hand was dealt (which may hold the same card again). */
export async function playCard(page: Page, zone: string, card: string): Promise<void> {
  const el = cardIn(page, zone, card);
  await expect(el).toHaveAttribute("data-playable", "true");
  const deal = await dealNo(page);
  await act(page, el, CARD_GRIP);
  await expect
    .poll(
      async () => (await dealNo(page)) !== deal || (await cardIn(page, zone, card).count()) === 0,
      {
        message: `${card} stayed in ${zone}`,
      },
    )
    .toBe(true);
}

export function action(page: Page, name: string): Locator {
  return page.locator(`[data-action="${name}"]`);
}

/** Visible action buttons (data-action) in DOM order. */
export async function actions(page: Page): Promise<string[]> {
  return page
    .locator("[data-action]:visible")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-action") ?? ""));
}

/** A banner with this text shows over the table (they auto-dismiss ~2s). */
export async function expectBanner(page: Page, text: RegExp): Promise<void> {
  await expect(page.locator(".aso-announce", { hasText: text }).first()).toBeVisible({
    timeout: 5_000,
  });
}

/** „Край на играта“: both buttons on screen; „Нова игра“ (play again) must
 *  seat me in a brand-new match (the probe goes over → playing, the card closes). */
export async function expectGameOverThenPlayAgain(page: Page): Promise<void> {
  await expectGameOverCard(page);
  const card = page.locator(".cine-over__card");
  const again = card.getByRole("button", { name: /Нова игра/ });
  await expect(again).toBeInViewport();
  await expect(card.getByRole("button", { name: /Към лобито/ })).toBeInViewport();
  await again.click();
  await expect(card).toBeHidden();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
}

/** Two things every table offers mid-match: the rules again (the „?“ in the
 *  header, closed by its button) and leaving — a forfeit, so „Напусни“ arms
 *  first and the second click takes me to the lobby. */
export async function reopenRulesThenLeave(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Правила" }).click();
  // the rules — not a decision popup (DecisionPrompt is a non-modal dialog too)
  const rules = page.locator('[role="dialog"]:not([data-decision])');
  await expect(rules).toBeVisible();
  await rules.getByRole("button", { name: /Разбрах/ }).click();
  await expect(rules).toBeHidden();
  await page.getByRole("button", { name: /^Напусни$/ }).click();
  const sure = page.getByRole("button", { name: /Сигурен\? \(предаване\)/ });
  await expect(sure).toBeVisible();
  await sure.click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

/** The page was never reloaded behind the player's back (the service worker
 *  used to reload a first visit a second after load, mid-game). */
export async function expectNotReloaded(page: Page): Promise<void> {
  const type = await page.evaluate(
    () =>
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)
        ?.type ?? "",
  );
  expect(type, "the game page reloaded by itself").toBe("navigate");
}

/** Every element's text ink is dark enough to read on the ivory bid tiles
 *  (relative luminance well below the tile's ~0.9). */
export async function expectLegibleOnIvory(target: Locator): Promise<void> {
  const inks = await target.evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  expect(inks.length).toBeGreaterThan(0);
  for (const ink of inks) {
    const [r, g, b] = (ink.match(/[\d.]+/g) ?? []).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const lum = 0.2126 * (r ?? 1) + 0.7152 * (g ?? 1) + 0.0722 * (b ?? 1);
    expect(lum, `ink ${ink} is unreadable on an ivory tile`).toBeLessThan(0.4);
  }
}

export async function boxOf(
  target: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await target.boundingBox();
  if (!b) throw new Error("no box");
  return b;
}

export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1
  );
}

/** Two visible parts of the screen do not cover each other. */
export async function expectApart(page: Page, a: string, b: string): Promise<void> {
  const [ba, bb] = [await boxOf(page.locator(a).first()), await boxOf(page.locator(b).first())];
  expect(
    boxesOverlap(ba, bb),
    `${a} overlaps ${b}: ${JSON.stringify(ba)} ${JSON.stringify(bb)}`,
  ).toBe(false);
}

interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(page: Page, name: string, selector: string): Promise<Box> {
  const el = page.locator(selector).first();
  await expect(el, `${name} (${selector})`).toBeVisible();
  const b = await el.boundingBox();
  if (!b) throw new Error(`${name}: no box`);
  return { name, ...b };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 1 &&
  b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 &&
  b.y < a.y + a.height - 1;

/** Layout guard for the visual fixes: none of these parts of the table may
 *  overlap another, and each must sit inside the felt and the viewport. */
export async function expectTableLayout(page: Page, parts: Record<string, string>): Promise<void> {
  const felt = await box(page, "felt", ".aso-table__felt");
  const vw = page.viewportSize()?.width ?? 0;
  const boxes: Box[] = [];
  for (const [name, sel] of Object.entries(parts)) boxes.push(await box(page, name, sel));
  for (const b of boxes) {
    expect(b.x, `${b.name} leaves the felt on the left`).toBeGreaterThanOrEqual(felt.x - 1);
    expect(b.x + b.width, `${b.name} leaves the felt on the right`).toBeLessThanOrEqual(
      felt.x + felt.width + 1,
    );
    expect(b.x + b.width, `${b.name} is cut off by the screen edge`).toBeLessThanOrEqual(vw);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      expect(
        overlaps(a, b),
        `${a.name} overlaps ${b.name}: ${JSON.stringify(a)} ${JSON.stringify(b)}`,
      ).toBe(false);
    }
  }
}

/** Every announce banner showing right now fits the screen (no cut ends). */
export async function expectBannersOnScreen(page: Page): Promise<void> {
  const vw = page.viewportSize()?.width ?? 0;
  const boxes = await page.locator(".aso-fx-layer .aso-announce").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent ?? "", left: r.left, right: r.right };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left, `banner „${b.text}“ is cut off on the left`).toBeGreaterThanOrEqual(0);
    expect(b.right, `banner „${b.text}“ is cut off on the right`).toBeLessThanOrEqual(vw);
  }
}

/** Screenshot for the visual review, attached to the report. */
export async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  // let entrance/flight animations settle so the shot shows the resting table
  await page.waitForTimeout(700);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
