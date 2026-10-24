import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { probe } from "./helpers";

/**
 * Общи помощници за мрежовите игри (Морски бой, Бинго, Думи) и за Магнат:
 * истинско влачене с мишката, проверка, че контрол е изцяло видим (не е
 * изрязан от сукното или извън екрана), снимки при двата размера и чакане на
 * „Край на играта“ с бутона „Играй пак“.
 */

export const DESKTOP = { width: 1366, height: 768 } as const;
export const PHONE = { width: 390, height: 844 } as const;

/** Влачи с истинска мишка от центъра на `from` до центъра на `to`. */
export async function dragTo(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("dragTo: елементът няма кутия (скрит?)");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/**
 * Контролът е изцяло видим: в прозореца по хоризонтала и не е изрязан от
 * предшественик с `overflow: hidden` (сукното на масата) — „Играй“ в Думи
 * беше наполовина отрязан на телефон.
 */
export async function expectFullyVisible(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const clip = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (r.left < -0.5 || r.right > vw + 0.5) out.push(`извън прозореца: ${Math.round(r.left)}..${Math.round(r.right)} от ${vw}`);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === "visible" && cs.overflow === "visible") continue;
      const pr = p.getBoundingClientRect();
      if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) {
        out.push(`изрязан от .${[...p.classList].join(".") || p.tagName}: ${Math.round(r.left)}..${Math.round(r.right)} в ${Math.round(pr.left)}..${Math.round(pr.right)}`);
        break;
      }
    }
    return out;
  });
  expect(clip, clip.join("; ")).toEqual([]);
}

/** Страницата не се скролва хоризонтално (нищо не излиза вдясно). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, `хоризонтален скрол: ${sw} > ${cw}`).toBeLessThanOrEqual(cw);
}

/** Снимка на масата при 1366×768 и 390×844 (прикачена към отчета на теста). */
export async function snapBoth(page: Page, info: TestInfo, name: string): Promise<void> {
  const size = page.viewportSize() ?? DESKTOP;
  for (const [label, vp] of [["1366x768", DESKTOP], ["390x844", PHONE]] as const) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(300);
    await expectNoHorizontalScroll(page);
    const path = info.outputPath(`${name}-${label}.png`);
    await page.screenshot({ path });
    await info.attach(`${name}-${label}`, { path, contentType: "image/png" });
  }
  await page.setViewportSize(size);
}

/** „Край на играта“: картата е видима, а „Играй пак“ („Нова игра“) — в прозореца. */
export async function expectPlayAgain(page: Page, timeout = 180_000): Promise<Locator> {
  await expect(probe(page)).toHaveAttribute("data-phase", "over", { timeout });
  const card = page.locator(".cine-over__card");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(/Победа|Загуба|Равенство/);
  const again = card.getByRole("button", { name: /Нова игра/ });
  await expect(again).toBeInViewport();
  await expect(card.getByRole("button", { name: /Към лобито/ })).toBeInViewport();
  return again;
}

/** Присъдата на картата „Край на играта“ (заглавието). */
export async function verdict(page: Page): Promise<string> {
  return (await page.locator(".cine-over__card").getByRole("heading", { level: 2 }).textContent()) ?? "";
}

/** Цъкни „Играй пак“ и изчакай новия мач (ботовете сядат след няколко секунди). */
export async function playAgain(page: Page): Promise<void> {
  const again = await expectPlayAgain(page);
  await again.click();
  await expect(page.locator(".cine-over__card")).toBeHidden();
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
}

/* ── Морски бой: избор на изстрел (лов/довършване) по видимата мрежа ───── */

const SIZE = 10;
const rc = (c: number): [number, number] => [Math.floor(c / SIZE), c % SIZE];
const inBoard = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function around(cell: number, diag: boolean): number[] {
  const [r, c] = rc(cell);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dr === 0 && dc === 0) || (!diag && dr !== 0 && dc !== 0)) continue;
      if (inBoard(r + dr, c + dc)) out.push((r + dr) * SIZE + c + dc);
    }
  }
  return out;
}

/**
 * Следващ изстрел по мрежата на противника: довършва ранен кораб (по линията
 * на попаденията), иначе „шахматен“ лов; никога клетка до потопен кораб
 * (корабите не се допират — там няма нищо).
 */
export function nextShot(shots: Map<number, "hit" | "miss">, sunk: Set<number>): number {
  const halo = new Set<number>();
  for (const s of sunk) for (const n of around(s, true)) halo.add(n);
  const free = (c: number) => !shots.has(c) && !halo.has(c);
  const wounded = [...shots].filter(([c, v]) => v === "hit" && !sunk.has(c)).map(([c]) => c);
  if (wounded.length > 0) {
    // Две съседни попадения дават посоката — продължи по нея.
    const set = new Set(wounded);
    for (const h of wounded) {
      const [r, c] = rc(h);
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        if (!inBoard(r + dr, c + dc) || !set.has((r + dr) * SIZE + c + dc)) continue;
        // Тръгни в двете посоки до първата свободна клетка.
        for (const sign of [1, -1]) {
          let k = sign === 1 ? 2 : -1;
          for (;;) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (!inBoard(rr, cc)) break;
            const cell = rr * SIZE + cc;
            if (set.has(cell)) {
              k += sign;
              continue;
            }
            if (free(cell)) return cell;
            break;
          }
        }
      }
    }
    for (const h of wounded) for (const n of around(h, false)) if (free(n)) return n;
  }
  const hunt: number[] = [];
  const rest: number[] = [];
  for (let c = 0; c < SIZE * SIZE; c++) {
    if (!free(c)) continue;
    const [r, cc] = rc(c);
    ((r + cc) % 2 === 0 ? hunt : rest).push(c);
  }
  const pool = hunt.length > 0 ? hunt : rest;
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)]!;
  for (let c = 0; c < SIZE * SIZE; c++) if (!shots.has(c)) return c;
  throw new Error("nextShot: няма свободна клетка");
}

/* ── Морски бой: подреждане (същите правила като сървъра) ─────────────── */

/** Клетки на кораб с горна/лява клетка `top` и дължина `len`. */
export function shipCells(top: number, len: number, horiz: boolean): number[] | null {
  const [r, c] = rc(top);
  const out: number[] = [];
  for (let k = 0; k < len; k++) {
    const rr = horiz ? r : r + k;
    const cc = horiz ? c + k : c;
    if (!inBoard(rr, cc)) return null;
    out.push(rr * SIZE + cc);
  }
  return out;
}

/** Корабът (клетки) не застъпва и не докосва нито една от `others`. */
export function fits(cells: number[], others: Set<number>): boolean {
  return cells.every((c) => !others.has(c) && around(c, true).every((n) => !others.has(n)));
}

/** Хоризонтален ли е корабът (едноклетъчният се води хоризонтален). */
export function isHoriz(cells: number[]): boolean {
  const s = cells.slice().sort((a, b) => a - b);
  return s.length === 1 || s[1]! - s[0]! === 1;
}
