import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { probe, stateVersion, type Table } from "./helpers";

/**
 * Extra harness for the draw/discard + betting specs (Война, Риба, Реми,
 * Домино, Свара). Everything here only OBSERVES the page — every move in the
 * specs is still a real click on the table.
 */

/** Server verdicts seen on the match socket (via CDP, so it also catches the
 *  socket that was opened before the watcher attached). */
export interface SocketWatch {
  /** `game:error` frames — the server rejected something this page sent. */
  rejections: string[];
  /** Every `game:action` this page sent (raw JSON), newest last. */
  sent: string[];
  /** Engine events the server broadcast (GAME_EVENTS), in arrival order. */
  events: Array<Record<string, unknown>>;
}

export async function watchSocket(t: Table): Promise<SocketWatch> {
  const w: SocketWatch = { rejections: [], sent: [], events: [] };
  const cdp = await t.ctx.newCDPSession(t.page);
  cdp.on("Network.webSocketFrameReceived", (e) => {
    const s = e.response.payloadData;
    if (s.startsWith('42["game:error"')) w.rejections.push(s.slice(2, 400));
    else if (s.startsWith('42["game:events"')) {
      try {
        const [, msg] = JSON.parse(s.slice(2)) as [string, { events?: Array<Record<string, unknown>> }];
        for (const ev of msg.events ?? []) w.events.push(ev);
      } catch {
        /* a frame we cannot read is not a verdict */
      }
    }
  });
  cdp.on("Network.webSocketFrameSent", (e) => {
    const s = e.response.payloadData;
    if (s.startsWith('42["game:action"')) w.sent.push(s.slice(2, 600));
  });
  await cdp.send("Network.enable");
  return w;
}

/** Wait for a broadcast engine event (after index `from`) matching `pred`;
 *  returns it. Proves what the SERVER applied, independent of animations. */
export async function expectEvent(
  w: SocketWatch,
  from: number,
  pred: (ev: Record<string, unknown>) => boolean,
  message: string,
  timeout = 10_000,
): Promise<Record<string, unknown>> {
  await expect.poll(() => w.events.slice(from).some(pred), { timeout, message }).toBe(true);
  return w.events.slice(from).find(pred)!;
}

/** No click on the table may have sent a move the server refused. */
export function expectNoRejections(w: SocketWatch): void {
  expect(w.rejections, `сървърът отхвърли ход(ове):\n${w.rejections.join("\n")}\nпоследно изпратени:\n${w.sent.slice(-5).join("\n")}`).toEqual([]);
}

/**
 * Click an element where a person can actually SEE it. Fanned hands overlap,
 * so the centre of a card usually belongs to its right-hand neighbour; this
 * finds a point inside the element's box that hit-tests to the element itself
 * (scanning left→right, top→bottom) and clicks exactly there. Fails if no part
 * of the element is reachable — that IS the "covered card" bug.
 */
export async function clickVisible(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const xs = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92];
    const ys = [0.5, 0.3, 0.7, 0.15, 0.85];
    for (const fy of ys) {
      for (const fx of xs) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) return { x: x - r.left, y: y - r.top };
      }
    }
    return null;
  });
  expect(point, "елементът е изцяло закрит — няма видима част за клик").not.toBeNull();
  await target.click({ position: point! });
}

/** Wait until it is my turn (with legal moves), the match is over, or `extra`
 *  says the table needs me (e.g. a Свара showdown that anyone may continue).
 *  Returns "mine" | "over" | "extra". */
export async function waitFor(
  page: Page,
  extra: () => Promise<boolean> = async () => false,
  timeout = 60_000,
): Promise<"mine" | "over" | "extra"> {
  const p = probe(page);
  let verdict: "mine" | "over" | "extra" | "wait" = "wait";
  await expect
    .poll(
      async () => {
        const phase = await p.getAttribute("data-phase");
        if (phase === "over") return (verdict = "over");
        if (await extra()) return (verdict = "extra");
        const mine = (await p.getAttribute("data-my-turn")) === "true";
        const legal = Number((await p.getAttribute("data-legal")) ?? "0");
        return (verdict = mine && legal > 0 ? "mine" : "wait");
      },
      { timeout, intervals: [100, 150, 250] },
    )
    .not.toBe("wait");
  return verdict as "mine" | "over" | "extra";
}

/** Click and require the server to answer with a new state (the move landed).
 *  Returns the version before the click. */
export async function clickAndAdvance(page: Page, click: () => Promise<void>, timeout = 10_000): Promise<number> {
  const before = await stateVersion(page);
  await click();
  await expect.poll(() => stateVersion(page), { timeout, message: "сървърът не отговори на хода" }).toBeGreaterThan(before);
  return before;
}

/** Screenshot kept under test-results/<test>/<name>.png and attached to the report. */
export async function snap(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

/** A name plate shows the whole name (no ellipsis). */
export async function expectNotTruncated(el: Locator, what: string): Promise<void> {
  const cut = await el.evaluate((n) => n.scrollWidth > n.clientWidth + 1);
  expect(cut, `${what}: името е отрязано`).toBe(false);
}

/** The page must never scroll sideways (a table wider than the phone). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "страницата се скролва хоризонтално").toBeLessThanOrEqual(cw);
}

/**
 * The game stage must not be scrollable: with `overflow: hidden` it was still a
 * scroll container, and an edge-aligned scrollIntoView (keyboard focus, find in
 * page, test tooling) shoved the whole table sideways and left it there.
 */
export async function expectStageCannotScroll(target: Locator): Promise<void> {
  const shift = await target.evaluate((el) => {
    const stage = el.closest<HTMLElement>(".cine");
    if (!stage) return null;
    const { scrollX, scrollY } = window;
    el.scrollIntoView({ block: "start", inline: "start" });
    const out = { left: stage.scrollLeft, top: stage.scrollTop };
    window.scrollTo(scrollX, scrollY); // leave the page exactly as the player had it
    return out;
  });
  expect(shift, "масата не е в сцената").not.toBeNull();
  expect(shift, "сцената се превъртя и избута масата встрани").toEqual({ left: 0, top: 0 });
}

/** `inner` lies fully inside `outer` (e.g. a seat inside the felt). */
export async function expectInside(inner: Locator, outer: Locator, what: string): Promise<void> {
  const a = await inner.boundingBox();
  const b = await outer.boundingBox();
  expect(a, `${what}: няма размери`).not.toBeNull();
  expect(b).not.toBeNull();
  const tol = 1;
  expect(a!.x, `${what} излиза вляво`).toBeGreaterThanOrEqual(b!.x - tol);
  expect(a!.y, `${what} излиза отгоре`).toBeGreaterThanOrEqual(b!.y - tol);
  expect(a!.x + a!.width, `${what} излиза вдясно`).toBeLessThanOrEqual(b!.x + b!.width + tol);
  expect(a!.y + a!.height, `${what} излиза отдолу`).toBeLessThanOrEqual(b!.y + b!.height + tol);
}

/** Two boxes must not overlap (e.g. a seat plate and the centre pile). */
export async function expectNoOverlap(a: Locator, b: Locator, what: string): Promise<void> {
  const x = await a.boundingBox();
  const y = await b.boundingBox();
  expect(x && y, `${what}: няма размери`).toBeTruthy();
  const overlap =
    x!.x < y!.x + y!.width && x!.x + x!.width > y!.x && x!.y < y!.y + y!.height && x!.y + x!.height > y!.y;
  expect(overlap, `${what} се застъпват`).toBe(false);
}

/** The game-over card's „Нова игра“ starts a fresh match (new seat, new state). */
export async function playAgain(page: Page): Promise<void> {
  const card = page.locator(".cine-over__card");
  await expect(card).toBeVisible();
  const again = card.getByRole("button", { name: /Нова игра/ });
  await expect(again).toBeInViewport();
  await again.click();
  await expect(card).toBeHidden();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
}
