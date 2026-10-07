// Графиките на landing страницата — генерирани, не рисувани на ръка:
//   server/shield-380.webp, server/shield-96.webp  ← бранд щитът (server/icon-512.png)
//   server/popup-shot.webp                         ← РЕАЛНИЯТ popup (popup.html + popup.css)
//                                                     с демо числа, 2× за ретина
// WebP кодира самият Chromium (canvas.toDataURL) — нула зависимости извън
// Playwright, който репото вече ползва за браузърните тестове.
//
//   PW_ROOT=$(npm root -g) node tools/landing_assets.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();

async function toWebp(pngBuf, width, quality) {
  const dataUrl = "data:image/png;base64," + pngBuf.toString("base64");
  const out = await page.evaluate(async ({ dataUrl, width, quality }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = width || img.naturalWidth;
    const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/webp", quality);
  }, { dataUrl, width, quality });
  return Buffer.from(out.split(",")[1], "base64");
}

// 1) бранд щитът
const master = readFileSync(join(ROOT, "server", "icon-512.png"));
for (const [w, name] of [[380, "shield-380.webp"], [96, "shield-96.webp"]]) {
  const buf = await toWebp(master, w, 0.9);
  writeFileSync(join(ROOT, "server", name), buf);
  console.log(name, buf.length, "bytes");
}

// 2) реалният popup с демо числа (същият подход като store/screenshots/build.py)
const tmp = mkdtempSync(join(tmpdir(), "sa-landing-"));
try {
  copyFileSync(join(ROOT, "popup", "popup.css"), join(tmp, "popup.css"));
  const demo = {
    blocked: "1,204", data: "68 MB", time: "14 min", host: "news.example.com",
    log: [["EasyPrivacy", 14], ["EasyList", 9], ["Supreme core rules", 4], ["Tracking parameters", 2]],
  };
  let html = readFileSync(join(ROOT, "popup", "popup.html"), "utf8")
    .replaceAll('src="../', `src="file://${ROOT}/`)
    .replace('<script src="popup.js"></script>', `<script>
      (function () {
        var $ = function (i) { return document.getElementById(i); };
        var d = ${JSON.stringify(demo)};
        $("blockedTotal").textContent = d.blocked; $("savedData").textContent = d.data;
        $("savedTime").textContent = d.time; $("siteHost").textContent = d.host;
        $("listDot").textContent = "40,000+ filters";
        var total = 0;
        d.log.forEach(function (it) {
          var li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span");
          a.className = "host"; a.textContent = it[0]; b.className = "type"; b.textContent = "×" + it[1];
          li.append(a, b); $("logList").appendChild(li); total += it[1];
        });
        $("logCount").textContent = String(total); $("logEmpty").hidden = true; $("logBox").open = true;
      })();
    </script>`);
  writeFileSync(join(tmp, "popup.html"), html);
  const p2 = await browser.newPage({ viewport: { width: 320, height: 1200 }, deviceScaleFactor: 2 });
  await p2.goto("file://" + join(tmp, "popup.html"));
  await p2.waitForTimeout(300);
  const png = await (await p2.$("body")).screenshot({ type: "png", omitBackground: false });
  const buf = await toWebp(png, 640, 0.86);
  writeFileSync(join(ROOT, "server", "popup-shot.webp"), buf);
  const dims = await p2.evaluate(() => [document.body.offsetWidth, document.body.offsetHeight]);
  console.log("popup-shot.webp", buf.length, "bytes, css size", dims.join("x"));
} finally {
  rmSync(tmp, { recursive: true, force: true });
  await browser.close();
}
