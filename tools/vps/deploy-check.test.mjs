// deploy-check.test.mjs — node:test за деплой проверителя (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintShell } from "./deploy-check.mjs";

const codes = (fs) => new Set(fs.map((f) => f.code));

test("липса на set -euo pipefail → HIGH no-strict-mode", () => {
  const f = lintShell("#!/bin/bash\necho deploy", "deploy.sh");
  assert.ok(f.some((x) => x.code === "no-strict-mode" && x.sev === "HIGH"));
});

test("set -euo pipefail → без no-strict-mode", () => {
  const f = lintShell("#!/bin/bash\nset -euo pipefail\necho ok", "deploy.sh");
  assert.ok(!codes(f).has("no-strict-mode"));
});

test("ехо на тайна → HIGH secret-echo", () => {
  const f = lintShell("set -euo pipefail\necho $DB_PASSWORD", "deploy.sh");
  assert.ok(f.some((x) => x.code === "secret-echo" && x.sev === "HIGH"));
});

test("ексфилтрация на токен през curl → HIGH secret-exfil", () => {
  const f = lintShell("set -euo pipefail\ncurl -d $API_TOKEN http://x", "deploy.sh");
  assert.ok(f.some((x) => x.code === "secret-exfil" && x.sev === "HIGH"));
});

test("curl | bash → HIGH pipe-to-shell", () => {
  const f = lintShell("set -euo pipefail\ncurl https://x/install.sh | sudo bash", "deploy.sh");
  assert.ok(f.some((x) => x.code === "pipe-to-shell" && x.sev === "HIGH"));
});

test("rm -rf $VAR без guard → HIGH unsafe-rm", () => {
  const f = lintShell("set -euo pipefail\nrm -rf $RELEASE_DIR", "deploy.sh");
  assert.ok(f.some((x) => x.code === "unsafe-rm" && x.sev === "HIGH"));
});

test("rm -rf ${VAR:?} → без unsafe-rm", () => {
  const f = lintShell("set -euo pipefail\nrm -rf \"${RELEASE_DIR:?}\"", "deploy.sh");
  assert.ok(!codes(f).has("unsafe-rm"));
});

test("npm ci без --omit=dev → MEDIUM dev-deps-in-prod", () => {
  const f = lintShell("set -euo pipefail\nnpm ci", "deploy.sh");
  assert.ok(f.some((x) => x.code === "dev-deps-in-prod" && x.sev === "MEDIUM"));
});

test("рестарт без health-check → MEDIUM no-healthcheck", () => {
  const f = lintShell("set -euo pipefail\nsystemctl restart medqr", "deploy.sh");
  assert.ok(f.some((x) => x.code === "no-healthcheck" && x.sev === "MEDIUM"));
});

test("чист деплой (strict + omit + health) → без HIGH", () => {
  const f = lintShell("#!/bin/bash\nset -euo pipefail\nnpm ci --omit=dev\nsystemctl restart medqr\ncurl -f http://localhost/health || rollback", "deploy.sh");
  assert.ok(!f.some((x) => x.sev === "HIGH"));
});
