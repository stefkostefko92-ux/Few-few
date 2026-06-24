// Превръща brochure-a5.html в готов за печат PDF (A5, 2 страници) и в PNG
// прегледи на двете страни. Изисква: npm i playwright (+ chromium).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: process.env.PW_PATH });
const ctx = await b.newContext({ deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto("file://" + join(HERE, "brochure-a5.html"), { waitUntil: "networkidle" });
await page.pdf({
  path: join(HERE, "brochure-a5.pdf"),
  width: "148mm",
  height: "210mm",
  printBackground: true,
  pageRanges: "1-2",
});
const faces = await page.$$(".page");
const names = ["front", "back"];
for (let i = 0; i < faces.length; i++) {
  await faces[i].screenshot({ path: join(HERE, `brochure-${names[i]}.png`) });
}
console.log("Wrote brochure-a5.pdf + PNG previews");
await b.close();
