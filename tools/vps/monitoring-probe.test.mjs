// monitoring-probe.test.mjs — външната проба tools/vps/monitoring/probe-health.sh (вика я
// .github/workflows/linketto-health.yml). Изпълним: локален HTTP сървър с различни отговори.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROBE = join(root, "tools", "vps", "monitoring", "probe-health.sh");
const MARKER = '"app":"linketto"';

const routes = {
  "/ok": [200, '{"status":"ok","db":"up","app":"linketto"}'],
  "/other": [200, '{"status":"ok","app":"rilievi"}'],
  "/degraded": [503, '{"status":"degraded","db":"down","app":"linketto"}'],
  "/proxy": [200, "<html>Welcome to nginx</html>"],
  "/redirect": [301, ""],
};
let server;
let base;
before(async () => {
  server = createServer((req, res) => {
    const [code, body] = routes[req.url] ?? [404, ""];
    if (code === 301) res.setHeader("location", "/ok");
    res.writeHead(code, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Асинхронно: сървърът е в същия процес — синхронно извикване би го блокирало.
function probe(...args) {
  return new Promise((resolve) => {
    const p = spawn("bash", [PROBE, ...args], {
      env: { ...process.env, PROBE_ATTEMPTS: "1", PROBE_PAUSE: "0", PROBE_TIMEOUT: "5", GITHUB_OUTPUT: "" },
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("здрав: 200 + status ok + маркерът", async () => {
  const r = await probe(`${base}/ok`, MARKER);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^state=up\ndetail=200$/m);
});

test("200 от чужд процес или прокси страница не е здрав", async () => {
  for (const path of ["/other", "/proxy"]) {
    const r = await probe(`${base}${path}`, MARKER);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /state=down\ndetail=200 unexpected/);
  }
});

test("503 (паднала база), пренасочване и мрежа → down с кода", async () => {
  assert.match((await probe(`${base}/degraded`, MARKER)).stdout, /state=down\ndetail=503/);
  assert.match((await probe(`${base}/redirect`, MARKER)).stdout, /state=down\ndetail=301/);
  assert.match((await probe("http://127.0.0.1:1/x", MARKER)).stdout, /state=down\ndetail=network/);
});

test("лоша настройка → код 2", async () => {
  assert.equal((await probe()).status, 2);
  assert.equal((await probe("http://example.com/api/health", MARKER)).status, 2);
  assert.equal((await probe(`${base}/ok`)).status, 2, "без маркер");
});

test("тялото не се печата", async () => {
  const r = await probe(`${base}/ok`, MARKER);
  assert.ok(!r.stdout.includes('"db"'));
});
