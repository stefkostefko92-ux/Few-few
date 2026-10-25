import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { expectGameOverCard, expectNoErrors, newPlayer, openGame, probe, stateVersion } from "./helpers";
import {
  clickAndAdvance,
  expectEvent,
  expectNoHorizontalScroll,
  expectNoRejections,
  expectNotTruncated,
  expectStageCannotScroll,
  playAgain,
  snap,
  waitFor,
  watchSocket,
  type SocketWatch,
} from "./helpers-draw";
import { decision, expectDecisionClearOf, expectDecisionOnScreen, expectMinimizeAndReopen } from "./prompt-checks";

/** What a betting decision is made by: my cards and every seat with its
 *  chips and bet (the pot and what I owe are in the popup's hint). */
const SVARA_TABLE = {
  myCards: ".aso-myhand",
  mySeat: '.aso-seat[data-pos="bottom"]',
  seats: ".svara-seat-slot",
};

// A click that cannot happen must fail fast with a clear cause, not idle
// until the test timeout (default action timeout is unlimited).
test.use({ actionTimeout: 20_000 });

type Need = "check" | "call" | "min" | "halfPot" | "pot" | "slider" | "fold" | "allin" | "continue";

/**
 * Свара (4 места: аз + 3 бота, виртуални чипове) — само истински кликове:
 *  - „Пас“, „Чек“ и „Плащам (N)“;
 *  - вдигане с бутоните „Мин.“, „½ пот“, „Пот“ и с плъзгача (клик по него),
 *    после „Вдигам до N“ — сървърът потвърждава точно избрания размер;
 *  - „Ол-ин“ (бутонът в панела → „Ол-ин (N)“);
 *  - „Продължи“ след шоудауна (откритите карти), без да чакаме сървъра;
 *  - свара (равенство) — „Влез в сварата“/„Оставам извън“, ако се падне;
 *  - мачът (до 1 платежоспособен или 20 ръце) — до края, карта „Край“,
 *    „Нова игра“ започва нов мач с пълен стек.
 * Всяко решение е прозорец, който излиза сам (залогът на моя ход, свара,
 * „Продължи“ след шоудауна) — не е лента под масата.
 */
test("свара: пас/чек/плащане, вдигане с бутоните и плъзгача, ол-ин, продължи, до края", async ({ browser, baseURL }, info) => {
  test.setTimeout(12 * 60_000);
  const t = await openGame(browser, baseURL!, "SVARA");
  const { page } = t;
  const ws = await watchSocket(t);
  const table = page.getByTestId("svara-table");
  await expect(table).toBeVisible();
  await snap(page, info, "svara-1366x768");
  await expectStageCannotScroll(table);
  const seat = Number(await probe(page).getAttribute("data-seat"));
  const done = new Set<Need>();
  const order: Need[] = ["check", "call", "min", "halfPot", "pot", "slider", "fold", "allin"];
  let svaraDecisions = 0;
  let sidePotsSeen = false;
  let showdownChecked = false;

  const cont = page.locator('[data-svara-action="CONTINUE"]');
  // Сървърът сам продължава 4 s след шоудауна: кликаме само „пресен“ шоудаун
  // (видян преди < 1.5 s), за да не изпревари клика неговото продължаване.
  let showdownSeen: { version: number; at: number } | null = null;
  const showdownWaiting = async () => {
    if (!((await cont.isVisible()) && (await cont.isEnabled()))) return false;
    const version = await stateVersion(page);
    let seen = showdownSeen;
    if (!seen || seen.version !== version) seen = showdownSeen = { version, at: Date.now() };
    return Date.now() - seen.at < 1_500;
  };

  for (;;) {
    // Всеки шоудаун се продължава с клик (покрива „Продължи“ и ускорява мача).
    const v = await waitFor(page, showdownWaiting, 90_000);
    if (v === "over") break;
    if (!sidePotsSeen && (await page.locator(".svara-pots li").count()) > 1) {
      sidePotsSeen = true;
      await snap(page, info, "svara-side-pots");
    }
    if (v === "extra") {
      // Шоудаун: откритите карти — „Продължи“ веднага пуска следващата ръка.
      // Може да изпревари сървърът (4 s) или друг човек на масата — тогава
      // бутонът изчезва и чакаме следващия шоудаун.
      const from = ws.events.length;
      const before = await stateVersion(page);
      if (!showdownChecked && (await decision(page).count()) > 0) {
        // the showdown popup: the revealed hands stay in view around it
        showdownChecked = true;
        await expectDecisionOnScreen(page, /^Открити карти$/);
        await expectDecisionClearOf(page, SVARA_TABLE);
        await snap(page, info, "svara-showdown-1366x768");
      }
      try {
        await cont.click({ timeout: 1_500 });
      } catch {
        continue;
      }
      await expect.poll(() => stateVersion(page), { timeout: 10_000 }).toBeGreaterThan(before);
      // Следва нова ръка — или решенията за свара под-играта.
      await expect
        .poll(
          async () =>
            ws.events.slice(from).some((e) => e.type === "HAND" || e.type === "MATCH") ||
            (await table.getAttribute("data-svara-phase")) === "SVARA",
          { timeout: 6_000, message: "„Продължи“ не пусна следващата ръка" },
        )
        .toBe(true);
      done.add("continue");
      continue;
    }
    // Свара: решение дали да вляза в под-играта — прозорец.
    const join = page.locator('[data-decision] [data-svara-action="JOIN"]');
    if (await join.isVisible()) {
      await expectDecisionOnScreen(page, /^СВАРА!$/);
      const skip = page.locator('[data-svara-action="SKIP"]');
      const btn = svaraDecisions % 2 === 0 && (await join.isEnabled()) ? join : skip;
      await clickAndAdvance(page, () => btn.click());
      svaraDecisions++;
      continue;
    }
    await betOnce(page, ws, seat, done, order, info);
  }

  await expectGameOverCard(page);
  await snap(page, info, "svara-game-over");
  for (const need of [...order, "continue"] as Need[]) {
    // „Чек“ и „Плащам“ зависят от реда на залозите — поне едното е задължително.
    if (need === "check" || need === "call") continue;
    expect(done.has(need), `не беше изпълнено: ${need}; изпълнени: ${[...done].join(",")}`).toBe(true);
  }
  expect(done.has("check") || done.has("call"), "нито „Чек“, нито „Плащам“").toBe(true);
  expect(showdownChecked, "прозорецът „Открити карти“ не беше проверен").toBe(true);

  // „Нова игра“ → нов мач: отново 500 в стека (минус антето 10).
  await playAgain(page);
  await expect(page.getByTestId("svara-table")).toBeVisible();
  await expect(page.getByTestId("svara-table")).toHaveAttribute("data-hand-no", "1");
  await expect(page.getByTestId("svara-table")).toHaveAttribute("data-my-chips", "490");

  expectNoRejections(ws);
  expectNoErrors(t);
  await t.ctx.close();
});

/** One betting decision by click: the next not-yet-exercised action that the
 *  table allows right now, else a cheap call/check (or fold) to move on. */
let betChecked = false;
let sizingShot = false;
/** Hand of the last raise step: one sizing step per hand — re-raising min →
 *  ½ pot → pot in ONE hand escalated to an all-in and busted the stack before
 *  the remaining steps (the deals are random). */
let lastRaiseHand = -1;

async function betOnce(
  page: Page,
  ws: SocketWatch,
  seat: number,
  done: Set<Need>,
  order: Need[],
  info: TestInfo,
): Promise<void> {
  const table = page.getByTestId("svara-table");
  // Докато шоудаунът е „замразен“ на екрана, бутоните чакат.
  await expect(table).toHaveAttribute("data-frozen", "false", { timeout: 10_000 });
  // the bet comes up by itself as a popup, whole on screen, clear of the
  // cards, chips and bets it is decided by
  const actions = page.locator('[data-decision] [data-testid="svara-actions"]');
  await expect(actions).toBeInViewport();
  await expectDecisionOnScreen(page, /^Твоят залог$/);
  await expectDecisionClearOf(page, SVARA_TABLE);
  if (!betChecked) {
    betChecked = true;
    await snap(page, info, "svara-bet-1366x768");
    await expectMinimizeAndReopen(page);
  }
  const fold = page.locator('[data-svara-action="FOLD"]');
  const call = page.locator('[data-svara-action="CALL"]');
  const group = page.getByRole("group", { name: /Размер на вдигането/ });
  const raiseBtn = group.locator("[data-svara-action]");
  // „Вдигам ▾“ разгъва размера (пресети + плъзгач) в прозореца
  const sizing = actions.locator("[data-svara-raise-toggle]");
  const toCall = Number(await table.getAttribute("data-to-call"));
  const canRaise = await sizing.isVisible();
  const callable = (await call.isVisible()) && (await call.isEnabled());
  // Къс стек: панелът за вдигане го няма, ол-ин е самостоятелен бутон
  // (вместо „Плащам“ или до него).
  const shortAllIn = actions.locator('[data-svara-action="ALLIN"]:not([data-raise-to])');
  const openSizing = async () => {
    if ((await sizing.getAttribute("aria-expanded")) !== "true") await sizing.click();
    await expect(sizing).toHaveAttribute("aria-expanded", "true");
    await expect(group).toBeVisible();
    // разгънат, прозорецът пак не покрива картите и залозите
    await expectDecisionOnScreen(page);
    await expectDecisionClearOf(page, { myCards: ".aso-myhand", bets: ".svara-bet", pot: ".pot" });
    if (!sizingShot) {
      sizingShot = true;
      await snap(page, info, "svara-sizing-1366x768");
    }
  };
  const canShortAllIn = (await shortAllIn.count()) > 0 && (await shortAllIn.first().isEnabled());

  // Къс стек: ол-инът може да е последният шанс, преди чиповете да свършат.
  const handNo = Number(await table.getAttribute("data-hand-no"));
  const raiseStep = (n: Need) => n === "min" || n === "halfPot" || n === "pot" || n === "slider";
  const want =
    !done.has("allin") && canShortAllIn
      ? "allin"
      : order.find((n) => !done.has(n) && available(n) && !(raiseStep(n) && lastRaiseHand === handNo));
  function available(n: Need): boolean {
    if (n === "check") return callable && toCall === 0;
    if (n === "call") return callable && toCall > 0;
    if (n === "fold") return done.has("min") || done.has("halfPot"); // не още в първия ход
    if (n === "allin")
      return (
        order.filter((x) => x !== "allin" && x !== "check" && x !== "call").every((x) => done.has(x)) &&
        (canRaise || canShortAllIn)
      );
    return canRaise;
  }

  const from = ws.events.length;
  const mine = (type: string) => (e: Record<string, unknown>) => e.type === type && e.seat === seat;

  if (want === "check" || want === "call") {
    await expect(call).toHaveText(want === "check" ? /^Чек$/ : new RegExp(`^Плащам \\(${toCall}\\)$`));
    await clickAndAdvance(page, () => call.click());
    await expectEvent(ws, from, mine("CALL"), "сървърът не потвърди плащането");
    done.add(want);
    return;
  }
  if (want === "fold") {
    await clickAndAdvance(page, () => fold.click());
    await expectEvent(ws, from, mine("FOLD"), "сървърът не потвърди паса");
    done.add("fold");
    return;
  }
  if (want === "allin" && !canRaise) {
    await clickAndAdvance(page, () => shortAllIn.first().click());
    await expectEvent(ws, from, mine("ALLIN"), "сървърът не потвърди ол-ин");
    done.add("allin");
    return;
  }
  if (want === "min" || want === "halfPot" || want === "pot" || want === "allin") {
    await openSizing();
    const preset = group.locator(`[data-preset="${want === "allin" ? "allIn" : want === "min" ? "raiseMin" : want === "halfPot" ? "raiseHalfPot" : "raisePot"}"]`);
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    const value = Number(await preset.getAttribute("data-value"));
    await expect(raiseBtn).toHaveAttribute("data-raise-to", String(value));
    if ((await raiseAndConfirm(page, ws, seat, raiseBtn, value, from)) === "ALLIN") done.add("allin");
    if (raiseStep(want)) lastRaiseHand = handNo;
    done.add(want);
    return;
  }
  if (want === "slider") {
    await openSizing();
    const slider = group.locator('input[type="range"]');
    const min = Number(await slider.getAttribute("min"));
    const max = Number(await slider.getAttribute("max"));
    // Клик по средата на плъзгача — стойността скача към средата.
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height / 2);
    const value = Number(await raiseBtn.getAttribute("data-raise-to"));
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
    if (max - min >= 4) expect(value, "плъзгачът не мръдна").toBeGreaterThan(min);
    await expect(raiseBtn).toHaveText(value >= max ? /^Ол-ин/ : new RegExp(`^Вдигам до ${value}$`));
    if ((await raiseAndConfirm(page, ws, seat, raiseBtn, value, from)) === "ALLIN") done.add("allin");
    lastRaiseHand = handNo;
    done.add("slider");
    return;
  }
  // Всичко е покрито — най-евтиният ход: чек/плащане, иначе пас. Докато
  // ол-инът не е изпълнен, плащане с целия стек не се прави (фалит = край).
  const myChips = Number(await table.getAttribute("data-my-chips"));
  if (callable && (done.has("allin") || toCall < myChips)) await clickAndAdvance(page, () => call.click());
  else await clickAndAdvance(page, () => fold.click());
}

/** Click the raise button and check the server applied exactly that size. */
async function raiseAndConfirm(
  page: Page,
  ws: SocketWatch,
  seat: number,
  raiseBtn: Locator,
  value: number,
  from: number,
): Promise<string> {
  const allIn = (await raiseBtn.getAttribute("data-svara-action")) === "ALLIN";
  await clickAndAdvance(page, () => raiseBtn.click());
  const ev = await expectEvent(
    ws,
    from,
    (e) => (e.type === "RAISE" || e.type === "ALLIN") && e.seat === seat,
    "сървърът не потвърди вдигането",
  );
  if (allIn) expect(ev.type).toBe("ALLIN");
  expect(ev.to, "сървърът вдигна с друг размер").toBe(value);
  // a preset or the slider at the whole stack is the same all-in action
  return String(ev.type);
}

test("свара без достатъчно чипове: „Свършиха чиповете“ вместо масата", async ({ browser, baseURL }) => {
  // Новият играч има 1000; входът е 200. Без начин да се изгубят чипове бързо,
  // тук отговорът на /auth/me казва 50 — проверява се клиентската бариера.
  const storageState = await newPlayer(baseURL!);
  const ctx = await browser.newContext({ storageState, baseURL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const sent: string[] = [];
  page.on("websocket", (ws) => ws.on("framesent", (f) => sent.push(String(f.payload))));
  await page.route("**/api/auth/me", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { user?: Record<string, unknown> } & Record<string, unknown>;
    if (body.user) body.user.chips = "50";
    else body.chips = "50";
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("play/svara");
  const title = page.getByRole("heading", { name: "Свършиха чиповете" });
  await expect(title).toBeVisible();
  await expect(page.getByText(/Нужни са поне 200 чипа.*Имаш 50/)).toBeVisible();
  await expect(page.getByTestId("svara-table")).toHaveCount(0);
  expect(sent.some((s) => s.includes('"queue:join"')), "без чипове не се влиза в опашката").toBe(false);
  // „Купи чипове“ отваря магазина; „Към лобито“ води в лобито.
  await page.getByRole("button", { name: "Купи чипове" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Към лобито" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  expect(errors).toEqual([]);
  await ctx.close();
});

test.describe("мобилен изглед 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("свара на телефон: местата не излизат от масата, залог с клик", async ({ browser, baseURL }, info) => {
    const t = await openGame(browser, baseURL!, "SVARA");
    const { page } = t;
    const ws = await watchSocket(t);
    await expect(page.getByTestId("svara-table")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await snap(page, info, "svara-390x844");
    const felt = page.locator(".aso-table__felt");
    const feltBox = (await felt.boundingBox())!;
    for (const plate of await page.locator(".svara-seat-slot .aso-seat__plate").all()) {
      const b = (await plate.boundingBox())!;
      expect(b.x, "табела излиза вляво от сукното").toBeGreaterThanOrEqual(feltBox.x - 1);
      expect(b.x + b.width, "табела излиза вдясно от сукното").toBeLessThanOrEqual(feltBox.x + feltBox.width + 1);
      await expectNotTruncated(plate.locator(".aso-seat__name"), "съперник в Свара");
    }
    if ((await waitFor(page, undefined, 60_000)) === "mine") {
      await expect(page.getByTestId("svara-table")).toHaveAttribute("data-frozen", "false");
      await expectDecisionOnScreen(page, /^Твоят залог$/);
      await expectDecisionClearOf(page, { myCards: ".aso-myhand" });
      await snap(page, info, "svara-bet-390x844");
      const call = page.locator('[data-decision] [data-svara-action="CALL"]');
      await clickAndAdvance(page, () => call.click());
    }
    // the showdown popup on a phone (the hand ends within a few calls): on
    // screen, my cards in view
    const cont = page.locator('[data-decision] [data-svara-action="CONTINUE"]');
    for (let i = 0; i < 12; i++) {
      const v = await waitFor(page, () => cont.isVisible(), 60_000);
      if (v === "over") break;
      if (v === "extra") {
        await expectDecisionOnScreen(page, /^Открити карти$/);
        await expectDecisionClearOf(page, { myCards: ".aso-myhand" });
        await snap(page, info, "svara-showdown-390x844");
        break;
      }
      await expect(page.getByTestId("svara-table")).toHaveAttribute("data-frozen", "false");
      const callOrFold = page.locator('[data-decision] [data-svara-action="CALL"]:enabled, [data-decision] [data-svara-action="FOLD"]');
      await clickAndAdvance(page, () => callOrFold.first().click());
    }
    expectNoRejections(ws);
    expectNoErrors(t);
    await t.ctx.close();
  });
});
