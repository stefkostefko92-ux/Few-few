// compare_blockers.mjs — the same public ad-blocking tests, run the same way, for
// Supreme AdBlock and other blockers (unpacked). Numbers for the landing page must
// come from here, with the date and the method next to them.
//
//   PW_ROOT=$(npm root -g) node tools/compare_blockers.mjs --ext "uBlock Origin Lite=/path/to/ubol" --ext …
//
// Each blocker gets a fresh browser profile, its default settings, and time to set
// itself up; onboarding pages that must be confirmed (Ghostery) are confirmed.
// Tests: adblock.turtlecute.org (how many of its ad/tracker domains are blocked)
// and adblock-tester.com (its 0–100 score). Both are third-party public pages —
// if their content changes, the numbers change: always report the date.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");
const exts = [["No blocker", null], ["Supreme AdBlock", ROOT]];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--ext") { const [n, p] = process.argv[i + 1].split("="); exts.push([n, p]); }
}
const ROUNDS = Number((process.argv.find((a) => a.startsWith("--rounds=")) || "--rounds=1").split("=")[1]);
// Seconds each blocker gets to set itself up (download/compile its lists) before testing.
const SETTLE = Number((process.argv.find((a) => a.startsWith("--settle=")) || "--settle=60").split("=")[1]);

async function confirmOnboarding(ctx) {
  for (const p of ctx.pages()) {
    if (!p.url().startsWith("chrome-extension://")) continue;
    for (const re of [/enable ghostery/i, /^(accept|agree|continue|get started|enable|start)$/i]) {
      try { await p.getByRole("button", { name: re }).first().click({ timeout: 2000 }); await p.waitForTimeout(1500); } catch {}
    }
  }
}

async function run(name, ext) {
  const dir = mkdtempSync(join(tmpdir(), "cmp-"));
  const args = ["--no-sandbox"];
  if (ext) args.push(`--disable-extensions-except=${ext}`, `--load-extension=${ext}`);
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args, viewport: { width: 1280, height: 900 } });
  const out = { name };
  try {
    if (ext) { await new Promise((r) => setTimeout(r, 9000)); await confirmOnboarding(ctx); await new Promise((r) => setTimeout(r, Math.max(0, SETTLE - 9) * 1000)); }
    const p = await ctx.newPage();
    await p.goto("https://adblock.turtlecute.org/", { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(30000);
    const t = await p.evaluate(() => document.body.innerText);
    const total = /Total\s*:\s*(\d+)/i.exec(t), blocked = /(\d+)\s+blocked/i.exec(t);
    out.turtle = total && blocked ? `${blocked[1]}/${total[1]}` : "?";
    await p.goto("https://adblock-tester.com/", { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(35000);
    const s = /(\d+)\s+points out of 100/i.exec(await p.evaluate(() => document.body.innerText));
    out.tester = s ? Number(s[1]) : "?";
  } catch (e) {
    out.error = String(e.message || e).slice(0, 80);
  } finally {
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

console.log(`date ${new Date().toISOString().slice(0, 10)} · headless Chromium · default settings · ${SETTLE} s setup · rounds ${ROUNDS}`);
for (const [name, ext] of exts) {
  for (let r = 0; r < ROUNDS; r++) {
    const o = await run(name, ext);
    console.log(`${name.padEnd(20)} turtlecute ${String(o.turtle).padStart(7)} blocked · adblock-tester ${String(o.tester).padStart(3)}/100${o.error ? " · " + o.error : ""}`);
  }
}
