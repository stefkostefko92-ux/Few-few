import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { openGame, probe, type Table } from "./helpers";

/**
 * Общи помощници за настолните игри (дама, табла, човече, зарове, шах):
 *  - 3D: тестовата кука `window.__asoE2E[<игра>]` (board/e2eHook.ts) дава
 *    `screenPoint(id)` и `view()`; кликът е ИСТИНСКИ клик с мишката върху
 *    платното, в точката, където сцената проектира полето — и преди него се
 *    проверява, че нищо не закрива платното там;
 *  - „платното рисува“: снимка на платното срещу снимка на същото място със
 *    скрито платно — трябва да се различават в голяма част от пикселите;
 *  - снимки за визуалния преглед при 1366×768 и 390×844.
 */

type Point = { x: number; y: number };
type HookWindow = Window & {
  __asoE2E?: Record<string, { screenPoint(id: string | number): Point | null; view(): unknown }>;
};

/*
 * 3D: всяка стъпка е ЕДНО обръщение към страницата (чакането е вътре в нея).
 * WebGL в CI е софтуерен (swiftshader) и всяко обръщение там е скъпо, а
 * часовникът на хода тече — затова не се поллва от Node.
 */

/** Чака куката на играта и връща моментната снимка от `view()`. */
export async function hookView<T>(page: Page, game: string): Promise<T> {
  const h = await page.waitForFunction(
    (g) => {
      const hook = (window as HookWindow).__asoE2E?.[g];
      return hook ? { v: hook.view() } : null;
    },
    game,
    { timeout: 30_000, polling: 100 },
  );
  return ((await h.jsonValue()) as { v: T }).v;
}

/** Чака `view()[key]` (по JSON) да е равно на `expected` — вътре в страницата. */
export async function waitViewIs(page: Page, game: string, key: string, expected: unknown, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    ({ g, k, want }) => {
      const v = (window as HookWindow).__asoE2E?.[g]?.view() as Record<string, unknown> | undefined;
      return !!v && JSON.stringify(v[k]) === want;
    },
    { g: game, k: key, want: JSON.stringify(expected) },
    { timeout, polling: 100 },
  );
}

/** Чака `view()[key]` (по JSON) да се промени спрямо `old`. */
export async function waitViewChanged(page: Page, game: string, key: string, old: unknown, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    ({ g, k, was }) => {
      const v = (window as HookWindow).__asoE2E?.[g]?.view() as Record<string, unknown> | undefined;
      return !!v && JSON.stringify(v[k]) !== was;
    },
    { g: game, k: key, was: JSON.stringify(old) },
    { timeout, polling: 100 },
  );
}

/** Мой ред с поне един позволен ход → true; краят на мача → false. */
export async function waitTurn(page: Page, timeout = 60_000): Promise<boolean> {
  const h = await page.waitForFunction(
    () => {
      const p = document.querySelector<HTMLElement>('[data-testid="match-probe"]');
      if (!p) return null;
      if (p.dataset.phase === "over") return "over";
      return p.dataset.myTurn === "true" && Number(p.dataset.legal ?? "0") > 0 ? "mine" : null;
    },
    undefined,
    { timeout, polling: 150 },
  );
  return (await h.jsonValue()) === "mine";
}

/** Версията на състоянието от сървъра (скрития probe). */
export async function version(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(document.querySelector<HTMLElement>('[data-testid="match-probe"]')?.dataset.version ?? "0"),
  );
}

/** Сървърът прие действието: версията на състоянието расте над `before`. */
export async function serverAdvanced(page: Page, before: number, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    (b) => Number(document.querySelector<HTMLElement>('[data-testid="match-probe"]')?.dataset.version ?? "0") > b,
    before,
    { timeout, polling: 100 },
  );
}

/**
 * openGame за 3D масите: играчът е с включено „намалено движение“ в системата
 * (prefers-reduced-motion) още от първия кадър. WebGL в CI е софтуерен
 * (swiftshader): с анимираната зала и непрекъснато рисуване страницата не
 * отговаряше с минути на натоварена машина — дори бутонът „Разбрах“ чакаше
 * 45 s. С намалено движение залата е неподвижна, а сцената рисува само при
 * промяна (gl/loopGate.ts). Кликовете, raycast-ът и рисуването са същите.
 */
export async function openGame3D(browser: Browser, baseURL: string, game: string): Promise<Table> {
  const calm = {
    newContext: (opts: Parameters<Browser["newContext"]>[0]) => browser.newContext({ ...opts, reducedMotion: "reduce" }),
  } as unknown as Browser;
  return openGame(calm, baseURL, game);
}

/**
 * „Намалено движение“ е включено: приложението е взело системната настройка
 * (бутонът в горната лента е натиснат), иначе го натиска както играч. Залата
 * зад масата стои, а 3D сцената рисува само при промяна (gl/loopGate.ts).
 */
export async function reduceMotion(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: "Намалено движение" });
  if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
}

/** Платното на 3D масата на играта (не фоновата зала зад сцената). */
export function boardCanvas(page: Page, game: string): Locator {
  return page.locator(`canvas[data-board-canvas="${game}"]`);
}

/**
 * Клик с мишката ВЪРХУ ПЛАТНОТО там, където е `id`. В страницата: точката се
 * превърта във видимото и се чака да спре да се мести (анимация на пула), а
 * `elementFromPoint` трябва да е самото платно — иначе нещо го закрива (точно
 * бъгът „нищо не може да се кликне“). `through` — селектор на собствен
 * прозрачен слой над платното (зарове: бутоните за задържане) в същата обвивка.
 */
export async function clickOnCanvas(
  page: Page,
  canvas: Locator,
  game: string,
  id: string | number,
  through?: string,
): Promise<void> {
  const res = await canvas.evaluate(
    async (c, { g, i, sel }) => {
      const hook = (window as HookWindow).__asoE2E?.[g];
      if (!hook) return { error: `няма кука за ${g}` };
      const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));
      let p = hook.screenPoint(i);
      if (p && (p.y < 8 || p.y > innerHeight - 8 || p.x < 8 || p.x > innerWidth - 8)) {
        scrollBy(0, p.y - innerHeight / 2);
        await frame();
      }
      // Стабилна точка: две поредни четения на едно място (пулът не се движи).
      let prev: Point | null = null;
      for (let k = 0; k < 120; k++) {
        p = hook.screenPoint(i);
        if (p && prev && Math.abs(p.x - prev.x) < 0.5 && Math.abs(p.y - prev.y) < 0.5) break;
        prev = p;
        await frame();
      }
      if (!p) return { error: `няма точка за ${String(i)}` };
      if (p.x <= 0 || p.y <= 0 || p.x >= innerWidth || p.y >= innerHeight) {
        return { error: `точката на ${String(i)} е извън екрана: ${Math.round(p.x)},${Math.round(p.y)}` };
      }
      const el = document.elementFromPoint(p.x, p.y);
      const ok = el === c || (!!el && !!sel && !!el.closest(sel) && !!c.parentElement?.contains(el));
      if (!ok) {
        const what = el ? `${el.tagName.toLowerCase()}.${String(el.className)}` : "нищо";
        return { error: `платното е закрито в (${Math.round(p.x)}, ${Math.round(p.y)}) от ${what}` };
      }
      return { x: p.x, y: p.y };
    },
    { g: game, i: id, sel: through ?? null },
  );
  if ("error" in res) throw new Error(res.error);
  await page.mouse.click(res.x!, res.y!);
}

/** Всеки нарисуван зар в WebGL тавата е под СВОЯ прозрачен бутон (иначе
 *  кликът задържа съседния) и е във видимата част на тавата. Връща грешките. */
export async function diceMisalignment(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hook = (window as HookWindow).__asoE2E?.dice;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-board-canvas="dice"]');
    const wrap = canvas?.parentElement;
    const btns = [...document.querySelectorAll<HTMLElement>(".dice-gl__btn")];
    if (!hook || !canvas || !wrap) return ["няма WebGL тава"];
    const box = wrap.getBoundingClientRect();
    const out: string[] = [];
    btns.forEach((b, i) => {
      const p = hook.screenPoint(i);
      const r = b.getBoundingClientRect();
      if (!p) return out.push(`зар ${i}: няма точка`);
      if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) {
        out.push(`зар ${i} (${Math.round(p.x)},${Math.round(p.y)}) не е под бутона си [${Math.round(r.left)}–${Math.round(r.right)}]`);
      }
      if (p.x < box.left || p.x > box.right) out.push(`зар ${i} е извън тавата`);
      // Надписът „Държа“ стои под СВОЯ зар.
      const tag = b.querySelector<HTMLElement>(".dice-held-tag");
      if (tag) {
        const tr = tag.getBoundingClientRect();
        const cx = (tr.left + tr.right) / 2;
        if (cx < r.left || cx > r.right) out.push(`„Държа“ на зар ${i} не е под него (${Math.round(cx)})`);
      }
    });
    return out;
  });
}

/** Дял на пикселите, които платното променя спрямо фона зад него. */
async function paintedShare(page: Page, canvas: Locator): Promise<number> {
  const box = await canvas.boundingBox();
  if (!box || box.width < 50 || box.height < 50) return 0;
  const vp = page.viewportSize()!;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const clip = {
    x,
    y,
    width: Math.min(vp.width, Math.ceil(box.x + box.width)) - x,
    height: Math.min(vp.height, Math.ceil(box.y + box.height)) - y,
  };
  if (clip.width < 50 || clip.height < 50) return 0;
  const shown = await page.screenshot({ clip, animations: "disabled" });
  await canvas.evaluate((c) => ((c as HTMLElement).style.visibility = "hidden"));
  const hidden = await page.screenshot({ clip, animations: "disabled" });
  await canvas.evaluate((c) => ((c as HTMLElement).style.visibility = ""));
  const a = await sharp(shown).removeAlpha().raw().toBuffer();
  const b = await sharp(hidden).removeAlpha().raw().toBuffer();
  if (a.length !== b.length || a.length === 0) return 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    if (d > 60) changed++;
  }
  return changed / (a.length / 3);
}

/** Платното реално рисува дъската (не е празно/прозрачно): поне `min` от
 *  пикселите му се различават от фона зад него. */
export async function expectCanvasPainted(page: Page, canvas: Locator, min = 0.25): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => paintedShare(page, canvas), { timeout: 45_000, intervals: [500, 1000] }).toBeGreaterThan(min);
}

/** Средна яркост (0..255) на средата на елемента, както се вижда на екрана —
 *  напр. белият пул трябва да е светъл, а черният тъмен (не прозрачни). */
export async function centerLuma(loc: Locator): Promise<number> {
  await loc.scrollIntoViewIfNeeded();
  const png = await loc.screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.floor(info.width * 0.35);
  const x1 = Math.ceil(info.width * 0.65);
  const y0 = Math.floor(info.height * 0.35);
  const y1 = Math.ceil(info.height * 0.65);
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * 3;
      sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Снимки на масата при 1366×768 и 390×844 (визуален преглед). Записват се в
 *  резултатите на теста, а при зададено E2E_SHOTS_DIR — и там. Връща размера. */
export async function snapBoth(page: Page, name: string): Promise<void> {
  const original = page.viewportSize();
  const dir = process.env.E2E_SHOTS_DIR;
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(700); // ResizeObserver → платното се преоразмерява
    // Нищо не излиза встрани: без хоризонтално превъртане на страницата.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name}: страницата е по-широка от екрана ${vp.width}px`).toBeLessThanOrEqual(1);
    // 2D дъската се събира: рамката е в екрана, а всеки пул — вътре в полето
    // (иначе долният ред на таблата се режеше на телефон и стековете не се виждаха).
    const clipped = await page.evaluate(() => {
      const out: string[] = [];
      const frame = document.querySelector(".aso-board")?.getBoundingClientRect();
      if (frame && (frame.left < -1 || frame.right > window.innerWidth + 1)) {
        out.push(`рамката на дъската излиза от екрана: ${Math.round(frame.left)}…${Math.round(frame.right)}`);
      }
      const inner = document.querySelector(".aso-board__inner")?.getBoundingClientRect();
      if (inner) {
        document.querySelectorAll<HTMLElement>(".bg-checker, .aso-piece, .ludo-pawn").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.top < inner.top - 1 || r.bottom > inner.bottom + 1 || r.left < inner.left - 1 || r.right > inner.right + 1) {
            out.push(`${el.className.split(" ")[0]} отрязан при ${Math.round(r.left)},${Math.round(r.top)}`);
          }
        });
      }
      return out;
    });
    expect(clipped, `${name} @${vp.width}px`).toEqual([]);
    const file = `${name}-${vp.width}x${vp.height}.png`;
    const shot = await page.screenshot({ fullPage: true });
    await test.info().attach(file, { body: shot, contentType: "image/png" });
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), shot);
    }
  }
  if (original) await page.setViewportSize(original);
  await page.waitForTimeout(400);
}

/**
 * Записва всеки банер (`.aso-announce`), който се появи на масата. Банерите
 * живеят под 2 s — проверка „видим ли е сега“ е зависима от скоростта на
 * машината; дневникът не е. Викай веднъж след openGame.
 */
export async function recordBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as Window & { __asoBanners?: string[] };
    if (w.__asoBanners) return;
    const seen: string[] = [];
    w.__asoBanners = seen;
    const scan = (n: Node) => {
      if (!(n instanceof HTMLElement)) return;
      const els = n.matches(".aso-announce") ? [n] : [...n.querySelectorAll<HTMLElement>(".aso-announce")];
      for (const el of els) seen.push((el.textContent ?? "").trim());
    };
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

/** Колко пъти се е появявал банер с точно този текст (дневникът на recordBanners). */
export async function bannerCount(page: Page, text: string): Promise<number> {
  return page.evaluate(
    (s) => ((window as Window & { __asoBanners?: string[] }).__asoBanners ?? []).filter((b) => b === s).length,
    text,
  );
}

/** Чака банерът `text` да се е появил поне `atLeast` пъти. */
export async function expectBanner(page: Page, text: string, atLeast = 1, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    ({ s, n }) => ((window as Window & { __asoBanners?: string[] }).__asoBanners ?? []).filter((b) => b === s).length >= n,
    { s: text, n: atLeast },
    { timeout, polling: 100 },
  );
}

/** Бележка за хода на теста: в отчета (annotations) и на конзолата на раннъра. */
export function note(msg: string): void {
  test.info().annotations.push({ type: "ход", description: msg });
  process.stdout.write(`${msg}\n`);
}

/** Чака сървърът да върне ред на мен след хода (или край), без да е мой ред сега. */
export async function myTurnNow(page: Page): Promise<boolean> {
  const p = probe(page);
  return (
    (await p.getAttribute("data-phase")) === "playing" &&
    (await p.getAttribute("data-my-turn")) === "true" &&
    Number((await p.getAttribute("data-legal")) ?? "0") > 0
  );
}
