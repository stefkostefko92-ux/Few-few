// reddit.test.mjs — CLI-ят отказва без одобрен OAuth app, преди да стигне до мрежата (02.11.2026).
// Правният Разбирач: публичният .json и смяната на IP са scraping и заобикаляне → само Data API с одобрение.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./reddit.mjs", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("REDDIT_")));
// Мрежата е отрязана: ако някой път стигне до fetch, тестът пада с грешка на проксито, не минава тихо.
env.HTTPS_PROXY = env.https_proxy = "http://127.0.0.1:9";
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: "utf8", env, timeout: 20_000 });

test("без REDDIT_CLIENT_ID/SECRET: отказ с обяснение, без мрежа", () => {
  for (const args of [["top", "r/FiveM"], ["search", "r/FiveM", "mlo"], ["thread", "https://www.reddit.com/r/FiveM/comments/abc123/x/"]]) {
    const r = run(...args);
    assert.equal(r.status, 1, args.join(" "));
    assert.match(r.stderr, /Reddit е изключен/, args.join(" "));
    assert.match(r.stderr, /публичният \.json и смяна на IP не се ползват/);
    assert.equal(r.stdout, "", "нищо не се печата като данни");
  }
});

test("неподфорум → грешка; несъвместима команда → употреба (exit 2)", () => {
  const bad = run("top", "https://example.com/x");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /не е подфорум или нишка/);
  const mismatch = run("thread", "r/FiveM");
  assert.equal(mismatch.status, 2);
  assert.match(mismatch.stderr, /употреба/);
});

test("search без заявка не стига до мрежата", () => {
  const r = spawnSync(process.execPath, [CLI, "search", "r/FiveM"], {
    encoding: "utf8", timeout: 20_000,
    env: { ...env, REDDIT_CLIENT_ID: "x", REDDIT_CLIENT_SECRET: "y", REDDIT_USER_AGENT: "server:test:1.0 (by /u/test)" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /search иска заявка/);
});
