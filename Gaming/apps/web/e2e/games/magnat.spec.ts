import { test, expect, type Locator, type Page } from "@playwright/test";
import { BOARD, GROUP_TILES, HOUSE_COST_BY_GROUP } from "@aso/shared";
import { expectNoErrors, expectServerAdvanced, isOver, openGame, probe, stateVersion, waitMyTurn } from "./helpers";
import { expectFullyVisible, snapBoth, PHONE } from "./helpers-grid";
import { expectDecisionOnScreen, expectMinimizeRestore, expectNotCovered } from "./decision-checks";

/**
 * Магнат срещу 3 бота (2D: WebGL е изключен → таблото вдясно и 2D дъската).
 * Само истински кликове: хвърляне, купуване/отказ, търг (наддаване и пас),
 * сделка с бот, за да събереш комплект, строеж, ипотека и откупуване, дълг
 * (продажба/ипотека и плащане), ако се стигне, край на хода — поне 15 хода.
 * Всяко решение (купуваш ли, търг, затвор, оферта за сделка, дълг) идва САМО
 * като прозорец (`[data-decision]`) и се взема в него; в таблото остават само
 * обикновените ходове (хвърляне, край на хода, строеж, сделка).
 */

const side = (page: Page) => page.locator("[data-mag-phase]");
const act = (page: Page, name: string): Locator => page.locator(`[data-action="${name}"]`);

async function seatOf(page: Page): Promise<number> {
  return Number(await probe(page).getAttribute("data-seat"));
}
async function cashOf(page: Page, seat: number): Promise<number> {
  return Number(await page.locator(`[data-mag-player="${seat}"]`).getAttribute("data-cash"));
}
async function myProps(page: Page): Promise<{ tile: number; houses: number; mortgaged: boolean }[]> {
  return page.locator("[data-mag-prop]").evaluateAll((els) =>
    els.map((el) => ({
      tile: Number(el.getAttribute("data-mag-prop")),
      houses: Number(el.getAttribute("data-houses") ?? "0"),
      mortgaged: el.getAttribute("data-mortgaged") === "true",
    })),
  );
}

/** Полето на 2D дъската, на което стои пулът на `seat`. */
async function tokenTile(page: Page, seat: number): Promise<number> {
  const tiles = await page.locator("[data-tile][data-tokens]").evaluateAll((els) =>
    els.map((el) => [Number(el.getAttribute("data-tile")), el.getAttribute("data-tokens") ?? ""] as const),
  );
  return tiles.find(([, who]) => who.split(",").includes(String(seat)))?.[0] ?? -1;
}
// Само полето на 2D дъската (бутонът „Купи“ в прозореца също носи data-tile).
const tile2d = (page: Page, tile: number) => page.locator(`.mag2d [data-tile="${tile}"]`);

/** Клик, който праща ход: сървърът трябва да отговори с ново състояние. */
async function send(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeEnabled();
  const v = await stateVersion(page);
  await target.click();
  await expectServerAdvanced(page, v);
}

interface Stats {
  rolls: number;
  bought: number;
  declined: number;
  bids: number;
  passes: number;
  trades: number;
  built: number;
  mortgaged: number;
  redeemed: number;
  debtActions: number;
  debtsPaid: number;
  ends: number;
  bail: number;
}

/** Партньорите и имотите, които всеки от тях може да продаде (от формата за сделка). */
async function tradableByPartner(page: Page, me: number): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  const partner = act(page, "trade-partner");
  const options = await partner.locator("option").evaluateAll((els) =>
    els.map((el) => (el as HTMLOptionElement).value).filter((v) => v !== ""),
  );
  for (const value of options) {
    const p = Number(value);
    if (p === me) continue;
    await partner.selectOption(value);
    out.set(
      p,
      await page.locator("[data-trade-want]").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-trade-want")))),
    );
  }
  return out;
}

/**
 * Опит за комплект чрез сделка: най-евтината група, в която всеки имот е мой
 * или продаваем от бот, и парите стигат за 110 % от цената (ботът приема само
 * изгодни оферти) плюс поне една къща. Връща true, ако е изпратена оферта.
 */
async function tradeForGroup(page: Page, me: number, stats: Stats): Promise<boolean> {
  const mine = new Set((await myProps(page)).filter((p) => !p.mortgaged).map((p) => p.tile));
  await act(page, "trade").click();
  const tradable = await tradableByPartner(page, me);
  const cash = await cashOf(page, me);
  let best: { group: number; buys: Map<number, number[]>; cost: number } | null = null;
  for (let g = 0; g < GROUP_TILES.length; g++) {
    const buys = new Map<number, number[]>();
    let cost = 0;
    let ok = true;
    for (const tile of GROUP_TILES[g]!) {
      if (mine.has(tile)) continue;
      const seller = [...tradable].find(([, tiles]) => tiles.includes(tile))?.[0];
      if (seller === undefined) {
        ok = false;
        break;
      }
      buys.set(seller, [...(buys.get(seller) ?? []), tile]);
    }
    if (!ok || buys.size === 0) continue;
    for (const tiles of buys.values()) cost += Math.ceil(tiles.reduce((n, i) => n + BOARD[i]!.price, 0) * 1.1) + 10;
    if (cost + HOUSE_COST_BY_GROUP[g]! + 60 > cash) continue;
    if (!best || cost < best.cost) best = { group: g, buys, cost };
  }
  if (!best) {
    await act(page, "trade").click(); // затвори формата
    return false;
  }
  let first = true;
  for (const [partner, tiles] of best.buys) {
    if (!first) {
      expect(await waitMyTurn(page, 30_000)).toBe(true);
      await act(page, "trade").click();
    }
    first = false;
    await act(page, "trade-partner").selectOption(String(partner));
    for (const tile of tiles) await page.locator(`[data-trade-want="${tile}"]`).check();
    const pay = Math.ceil(tiles.reduce((n, i) => n + BOARD[i]!.price, 0) * 1.1) + 10;
    await act(page, "trade-give-cash").fill(String(pay));
    await send(page, act(page, "trade-propose"));
    stats.trades++;
  }
  return true;
}

/** Фаза „MANAGE“: строеж, сделка за комплект, ипотека/откупуване — и край на хода. */
async function manage(page: Page, me: number, stats: Stats, plan: { offers: number }): Promise<void> {
  // Строеж, докато парите позволяват (резерв за наеми).
  for (let i = 0; i < 6; i++) {
    const build = page.locator('[data-mag-prop] [data-action="build"]').first();
    if ((await build.count()) === 0) break;
    const tile = Number(await build.locator("xpath=ancestor::*[@data-mag-prop][1]").getAttribute("data-mag-prop"));
    const cost = HOUSE_COST_BY_GROUP[BOARD[tile]!.group]!;
    if ((await cashOf(page, me)) - cost < 60 && stats.built > 0) break;
    const before = (await myProps(page)).find((p) => p.tile === tile)!.houses;
    await send(page, build);
    await expect(page.locator(`[data-mag-prop="${tile}"]`)).toHaveAttribute("data-houses", String(before + 1));
    await expect(tile2d(page, tile)).toHaveAttribute("data-houses", String(before + 1)); // и на 2D дъската
    stats.built++;
  }
  // Няма комплект за строеж → сделка с бот; проверява се всеки ход, защото в
  // началото комплектите още не са разпродадени.
  if (stats.built === 0 && plan.offers < 6 && (await act(page, "trade").count()) > 0) {
    const before = stats.trades;
    if (await tradeForGroup(page, me, stats)) {
      plan.offers += stats.trades - before;
      expect(await waitMyTurn(page, 30_000)).toBe(true);
      if ((await side(page).getAttribute("data-mag-phase")) !== "MANAGE") return; // напр. дълг от лихвата
      return manage(page, me, stats, plan); // вече може да има строеж
    }
  }
  // Ипотека веднъж: гара/ВиК, а след първия строеж — и имот от комплект без
  // сгради, който не е изцяло мой (не пречи на строежа).
  if (stats.mortgaged === 0) {
    const props = await myProps(page);
    const mine = new Set(props.map((p) => p.tile));
    const fullGroup = (g: number) => GROUP_TILES[g]!.every((t) => mine.has(t));
    const canPick = (p: { tile: number; mortgaged: boolean }) => {
      const tl = BOARD[p.tile]!;
      if (p.mortgaged) return false;
      return tl.type !== "prop" || (stats.built > 0 && !fullGroup(tl.group));
    };
    for (const p of props.filter(canPick)) {
      const btn = page.locator(`[data-mag-prop="${p.tile}"] [data-action="mortgage"]`);
      if ((await btn.count()) === 0) continue;
      await send(page, btn);
      await expect(page.locator(`[data-mag-prop="${p.tile}"]`)).toHaveAttribute("data-mortgaged", "true");
      await expect(tile2d(page, p.tile)).toHaveAttribute("data-mortgaged", "true");
      stats.mortgaged++;
      break;
    }
  }
  // Откупуване: ипотекиран имот (мой или получен със сделка), щом парите стигат с резерв.
  if (stats.redeemed === 0) {
    const redeem = page.locator('[data-mag-prop] [data-action="unmortgage"]').first();
    if ((await redeem.count()) > 0) {
      const tile = Number(await redeem.locator("xpath=ancestor::*[@data-mag-prop][1]").getAttribute("data-mag-prop"));
      const cost = Math.floor(BOARD[tile]!.price / 2) + Math.ceil(Math.floor(BOARD[tile]!.price / 2) / 10);
      if ((await cashOf(page, me)) - cost > 250) {
        await send(page, redeem);
        await expect(page.locator(`[data-mag-prop="${tile}"]`)).not.toHaveAttribute("data-mortgaged", "true");
        await expect(tile2d(page, tile)).not.toHaveAttribute("data-mortgaged", "true");
        stats.redeemed++;
      }
    }
  }
  await send(page, act(page, "end"));
  stats.ends++;
}

/** Фаза „DEBT“: в прозореца — продай сграда или ипотекирай, докато стигнат парите, после плати. */
async function payDebt(page: Page, stats: Stats): Promise<void> {
  const card = await expectDecisionOnScreen(page, "magnat-debt");
  if (stats.debtActions + stats.debtsPaid === 0) await snapBoth(page, test.info(), "magnat-debt");
  // Действията по имотите са само в прозореца (едно място за решението).
  await expect(page.locator('[data-mag-prop] [data-action="sell"], [data-mag-prop] [data-action="mortgage"]')).toHaveCount(0);
  const pay = card.locator('[data-action="pay-debt"]');
  if (await pay.isEnabled()) {
    await send(page, pay);
    stats.debtsPaid++;
    return;
  }
  const sell = card.locator('[data-action="debt-sell"]').first();
  const mortgage = card.locator('[data-action="debt-mortgage"]').first();
  const pick = (await sell.count()) > 0 ? sell : mortgage;
  expect(await pick.count(), "в дълг, но нищо за продаване/ипотекиране").toBeGreaterThan(0);
  await send(page, pick);
  stats.debtActions++;
}

test("магнат (2D): ~15 хода с хвърляне, купуване, търг, сделка, строеж, ипотека и край на хода", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(720_000);
  const t = await openGame(browser, baseURL!, "MAGNAT");
  const { page } = t;
  const me = await seatOf(page);
  await expect(side(page)).toBeVisible();
  // Без WebGL: 2D дъската с всичките 40 полета, пулът ми е на Старт.
  await expect(page.locator(".mag2d [data-tile]")).toHaveCount(40);
  expect(await tokenTile(page, me)).toBe(0);
  await snapBoth(page, info, "magnat");

  const stats: Stats = {
    rolls: 0, bought: 0, declined: 0, bids: 0, passes: 0, trades: 0, built: 0,
    mortgaged: 0, redeemed: 0, debtActions: 0, debtsPaid: 0, ends: 0, bail: 0,
  };
  const plan = { offers: 0 };
  const seenPrompt = new Set<string>();
  /** Първия път за всяко решение: свиване/връщане и снимки при двата размера. */
  const firstLook = async (testId: string) => {
    if (seenPrompt.has(testId)) return;
    seenPrompt.add(testId);
    await expectMinimizeRestore(page, testId);
    await snapBoth(page, info, testId);
  };
  // Поне 15 хода; ако дотогава няма строеж (няма събран комплект), до 40.
  for (let guard = 0; guard < 900 && !(stats.ends >= 15 && (stats.built > 0 || stats.ends >= 40)); guard++) {
    if ((await page.locator(`[data-mag-player="${me}"]`).getAttribute("data-bankrupt")) === "true") break;
    if (!(await waitMyTurn(page, 120_000))) break; // мачът свърши
    const phase = await side(page).getAttribute("data-mag-phase");
    // Само решенията имат прозорец; обикновеният ход — не.
    if (phase === "MANAGE") await expect(page.locator("[data-decision]")).toHaveCount(0);
    if (phase === "ROLL") {
      if (await page.getByTestId("magnat-jail").isVisible()) {
        // Затвор: гаранция, карта или хвърляне за чифт — всичко в прозореца, не в таблото.
        await firstLook("magnat-jail");
        await expect(side(page).locator('[data-action="roll"]')).toHaveCount(0);
        if (stats.bail === 0 && (await act(page, "jail-pay").count()) > 0) {
          await send(page, act(page, "jail-pay"));
          stats.bail++;
          continue;
        }
      } else {
        await expect(page.locator("[data-decision]")).toHaveCount(0);
      }
      await send(page, act(page, "roll"));
      await expect(page.locator("[data-dice]")).toBeVisible();
      stats.rolls++;
      if ((await page.locator(`[data-mag-player="${me}"]`).getAttribute("data-bankrupt")) === "true") break;
      // Пулът на 2D дъската стои там, където е по сървъра.
      await expect
        .poll(async () => (await tokenTile(page, me)) === Number(await side(page).getAttribute("data-mag-pos")))
        .toBe(true);
    } else if (phase === "BUY") {
      // „Купуваш ли …?“ идва сам, без клик; полето на дъската остава видимо.
      const card = await expectDecisionOnScreen(page, "magnat-buy");
      const buy = card.locator('[data-action="buy"]');
      const tile = Number(await buy.getAttribute("data-tile"));
      await expect(card).toContainText(BOARD[tile]!.name);
      // Както я вижда играчът след „Хвърли“ (бутонът е горе в таблото): от началото на страницата.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectNotCovered(page, "magnat-buy", tile2d(page, tile), `полето „${BOARD[tile]!.name}“`);
      // На лаптоп прозорецът е над таблото вдясно — нито едно поле на дъската не е под него.
      const covered = await page.locator(".mag2d [data-tile]").evaluateAll((els) => {
        const card = document.querySelector('[data-testid="magnat-buy"]')!.getBoundingClientRect();
        return els.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > card.left && r.left < card.right && r.bottom > card.top && r.top < card.bottom;
        }).length;
      });
      expect(covered, "прозорецът „Купуваш ли …?“ закрива полета на дъската").toBe(0);
      await firstLook("magnat-buy");
      const price = (await buy.isEnabled()) ? BOARD[tile]!.price : Infinity;
      // Пестеливо (пари за сделка и къщи), но поне една покупка; след нея един
      // отказ — за да се стигне до търга (и неговия прозорец).
      const cash = await cashOf(page, me);
      const wantAuction = stats.bought > 0 && stats.declined === 0;
      if (!wantAuction && (cash - price >= 350 || (stats.bought === 0 && cash - price >= 0))) {
        await send(page, buy);
        await expect(page.locator(`[data-mag-prop="${tile}"]`)).toBeVisible();
        await expect(tile2d(page, tile)).toHaveAttribute("data-owner", String(me));
        stats.bought++;
      } else {
        await send(page, act(page, "decline"));
        stats.declined++;
      }
    } else if (phase === "AUCTION") {
      await expectDecisionOnScreen(page, "magnat-auction");
      await firstLook("magnat-auction");
      const bid = act(page, "bid");
      if (stats.bids === 0 && (await bid.count()) > 0 && (await bid.isEnabled())) {
        await send(page, bid);
        stats.bids++;
      } else {
        await send(page, act(page, "pass-bid"));
        stats.passes++;
      }
    } else if (phase === "MANAGE") {
      await manage(page, me, stats, plan);
    } else if (phase === "DEBT") {
      await payDebt(page, stats);
    } else if (phase === "TRADE") {
      await expectDecisionOnScreen(page, "magnat-trade");
      await firstLook("magnat-trade");
      await send(page, act(page, "trade-decline"));
    } else {
      throw new Error(`непозната фаза ${phase}`);
    }
  }
  console.log("магнат:", JSON.stringify(stats), "прозорци:", [...seenPrompt].join(","));
  expect(seenPrompt.has("magnat-buy"), "„Купуваш ли …?“ не се появи като прозорец").toBe(true);
  // Отказ при включени търгове → търгът стига и до мен като прозорец.
  if (stats.declined > 0) expect(seenPrompt.has("magnat-auction"), "търгът не се появи като прозорец").toBe(true);
  await snapBoth(page, info, "magnat-late");
  if (!(await isOver(page))) {
    expect(stats.ends, "поне 15 завършени хода").toBeGreaterThanOrEqual(15);
    expect(stats.rolls).toBeGreaterThanOrEqual(15);
  }
  expect(stats.bought + stats.declined).toBeGreaterThan(0);
  const out = (await page.locator(`[data-mag-player="${me}"]`).getAttribute("data-bankrupt")) === "true";
  if (!(await isOver(page)) && !out) expect(stats.built, "строеж с клик (комплект чрез покупка/сделка)").toBeGreaterThan(0);
  expectNoErrors(t);
  await t.ctx.close();
});

test("магнат на телефон: таблото и бутоните на хода са изцяло видими и работят", async ({ browser, baseURL }) => {
  const t = await openGame(browser, baseURL!, "MAGNAT");
  const { page } = t;
  await page.setViewportSize(PHONE);
  expect(await waitMyTurn(page)).toBe(true);
  await expectFullyVisible(page.locator(".mag2d"));
  await expectFullyVisible(tile2d(page, 39));
  await expectFullyVisible(act(page, "roll"));
  await send(page, act(page, "roll"));
  expect(await waitMyTurn(page)).toBe(true);
  const phase = await side(page).getAttribute("data-mag-phase");
  // На телефон решението също излиза само и е изцяло в екрана.
  if (phase === "BUY") await expectDecisionOnScreen(page, "magnat-buy");
  const next = phase === "BUY" ? act(page, "decline") : phase === "MANAGE" ? act(page, "end") : null;
  if (next) {
    await expectFullyVisible(next);
    await send(page, next);
  }
  expectNoErrors(t);
  await t.ctx.close();
});
