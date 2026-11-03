// tools/lib/browser.mjs — ЕДИН launcher за всички Playwright-инструменти (prelaunch-audit,
// consent-scan, a11y). Преди всеки имаше свой: prelaunch ползваше playwright-core + /opt/pw-browsers
// и РАБОТЕШЕ; consent-scan и a11y искаха пълния playwright, не го намираха и излизаха с извинение.
// Инструмент, който има работещ път до браузъра на един ред разстояние, но се извинява — е дупка.
//
// Ред на опитите: пълен playwright (ако е инсталиран) → playwright-core + локалния Chromium.
// НИКОГА не сваля браузър (виж средата: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function findChromium(base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers") {
  if (!existsSync(base)) return null;
  // и плоският層 (chromium → бинар), и подредбата chromium-XXXX/chrome-linux/chrome
  for (const cand of [join(base, "chromium")]) if (existsSync(cand) && !isDir(cand)) return cand;
  for (const d of safeList(base)) {
    for (const p of [join(base, d, "chrome-linux", "chrome"), join(base, d, "chrome-linux", "headless_shell")])
      if (existsSync(p)) return p;
  }
  return null;
}
const safeList = (d) => { try { return readdirSync(d); } catch { return []; } };
const isDir = (p) => { try { return readdirSync(p) && true; } catch { return false; } };

/**
 * Пуска headless Chromium или казва ЗАЩО не може — връща { browser } ИЛИ { error }.
 * Никога не хвърля и никога не мълчи: викащият е длъжен да третира error като
 * „неизмерено" (изход 2), НЕ като „чисто". Зеленото без измерване е лъжа.
 */
export async function launchChromium(extra = {}) {
  let chromium = null, how = null;
  try { ({ chromium } = await import("playwright")); how = "playwright"; } catch { /* пробваме core */ }
  if (!chromium) { try { ({ chromium } = await import("playwright-core")); how = "playwright-core"; } catch { /* няма */ } }
  if (!chromium) return { error: "няма нито playwright, нито playwright-core (npm i -D playwright-core)" };

  const opts = { headless: true, args: ["--no-sandbox"], ...extra };
  if (how === "playwright-core") {
    const exe = findChromium();
    if (!exe) return { error: "playwright-core е наличен, но няма Chromium в /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH)" };
    opts.executablePath = exe;
  }
  try { return { browser: await chromium.launch(opts), how }; }
  catch (e) {
    // пълният playwright без свален браузър → втори опит с локалния бинар
    const exe = findChromium();
    if (exe && !opts.executablePath) {
      try { return { browser: await chromium.launch({ ...opts, executablePath: exe }), how: `${how}+локален бинар` }; }
      catch (e2) { return { error: `chromium не тръгва: ${e2.message}` }; }
    }
    return { error: `chromium не тръгва: ${e.message}` };
  }
}
