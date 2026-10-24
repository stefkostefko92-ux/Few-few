// tools/lib/browser.mjs — ЕДИН launcher за всички Playwright-инструменти (prelaunch-audit,
// consent-scan, a11y). Преди всеки имаше свой: prelaunch ползваше playwright-core + /opt/pw-browsers
// и РАБОТЕШЕ; consent-scan и a11y искаха пълния playwright, не го намираха и излизаха с извинение.
// Инструмент, който има работещ път до браузъра на един ред разстояние, но се извинява — е дупка.
//
// Ред на опитите: пълен playwright (ако е инсталиран) → playwright-core + локалния Chromium.
// НИКОГА не сваля браузър (виж средата: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD).

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Внася голо име, като пробва ДВЕ места: първо оттук, после от `process.cwd()`.
 *
 * ЗАЩО двете. Резолвът на голо име в ESM тръгва от папката на ФАЙЛА, който
 * внася — тоест от `tools/lib/`, и обхожда `tools/lib/node_modules` →
 * `tools/node_modules` → `<корен>/node_modules`. `FiveM/node_modules` НЕ се
 * поглежда НИКОГА. За инструментите в `tools/` това е без значение (те живеят
 * тук), но `FiveM/scripts/authz-probe.mjs` посяга през папки — и там съветът в
 * съобщението за грешка („npm i -D playwright-core") беше НЕИЗПЪЛНИМ: инстали-
 * раш в продукта, а търсенето е от `tools/`. Измерено на цял деплой пробег —
 * инструментът излизаше с „НЕИЗМЕРЕНО" при налична зависимост.
 */
async function importFrom(name) {
  try {
    return await import(name);
  } catch {
    /* пробваме от папката на викащия процес */
  }
  try {
    const req = createRequire(join(process.cwd(), "package.json"));
    return await import(pathToFileURL(req.resolve(name)).href);
  } catch {
    return null;
  }
}

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
 * Вади `chromium` от внесен модул, независимо по кой път е дошъл.
 *
 * `?? mod?.default?.chromium` НЕ е предпазливост от учтивост: резервният път в
 * `importFrom` внася по ФАЙЛОВ адрес, а това заобикаля картата `exports` на
 * пакета — тогава Node вижда САМО `default` (измерено: `Object.keys` върху
 * внесения по път `playwright` дава точно `default`, а `mod.chromium` е
 * `undefined`). Без този ред резервният път резолвва пакета успешно и пак
 * докладва „няма playwright" — най-лошият вид провал: поправка, която изглежда
 * приложена, но не работи.
 */
export function pickChromium(mod) {
  return mod?.chromium ?? mod?.default?.chromium ?? null;
}

/**
 * Пуска headless Chromium или казва ЗАЩО не може — връща { browser } ИЛИ { error }.
 * Никога не хвърля и никога не мълчи: викащият е длъжен да третира error като
 * „неизмерено" (изход 2), НЕ като „чисто". Зеленото без измерване е лъжа.
 */
export async function launchChromium(extra = {}) {
  let chromium = null, how = null;
  let mod = await importFrom("playwright");
  if (mod) how = "playwright";
  if (!mod) { mod = await importFrom("playwright-core"); if (mod) how = "playwright-core"; }
  chromium = pickChromium(mod);
  if (!chromium) return { error: "няма нито playwright, нито playwright-core (npm i -D playwright-core в папката, от която пускаш инструмента)" };

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
