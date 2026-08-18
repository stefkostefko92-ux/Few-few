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

// ─── secret-echo: ЛОГ ≠ ЗАПИС (07.08.2026) ──────────────────────────────────
// Проверката гони тайна, попаднала в CI/journalctl. Но тайна, ЗАПИСАНА във файл,
// е точно как една тайна легитимно се ражда на сървъра (autodeploy генерира
// REDIS_PASSWORD в .env, mode 600) — тя никога не минава през stdout. Първата
// версия не различаваше двете и обяви собствения ни запис за изтичане.
// Разхлабване на детектор иска доказателство, че още хваща истинското — оттук
// нататък четирите изтичания и двата записа са закотвени.

test("запис на тайна във ФАЙЛ не е изтичане", () => {
  const f = lintShell('set -euo pipefail\nprintf "PASSWORD=%s\\n" "$secret_value" >> "$env_file"', "deploy.sh");
  assert.ok(!codes(f).has("secret-echo"));
});

test("запис в път с променлива също не е изтичане", () => {
  const f = lintShell('set -euo pipefail\nprintf "TOKEN=%s\\n" "$tok" >> "$d/.env"', "deploy.sh");
  assert.ok(!codes(f).has("secret-echo"));
});

test("гол echo на тайна ОЩЕ е изтичане", () => {
  const f = lintShell('set -euo pipefail\necho "PASSWORD=$secret_value"', "deploy.sh");
  assert.ok(codes(f).has("secret-echo"));
});

test("пренасочване към /dev/stdout е ЛОГ, не запис", () => {
  const f = lintShell('set -euo pipefail\nprintf "SECRET=%s\\n" "$secret_value" > /dev/stdout', "deploy.sh");
  assert.ok(codes(f).has("secret-echo"));
});

test("пренасочване към stderr (>&2) е ЛОГ, не запис", () => {
  const f = lintShell('set -euo pipefail\nprintf "API_KEY=%s\\n" "$k" >&2', "deploy.sh");
  assert.ok(codes(f).has("secret-echo"));
});

test("cat на частен ключ ОЩЕ е изтичане", () => {
  const f = lintShell("set -euo pipefail\ncat /root/.private_key", "deploy.sh");
  assert.ok(codes(f).has("secret-echo"));
});

// ─── Незащитен subshell под `set -e` ────────────────────────────────────────
// Реален дефект (07.08.2026): `( cd "$d"; bash deploy.sh )` без `||` в
// autodeploy.sh. При `set -e` провалът на ЕДИН продукт прекратява целия пробег —
// следващите остават неразгърнати, symlink-ът и резюмето се прескачат, а базата
// вече е мигрирана. Три блока наведнъж.

test("subshell с bash deploy.sh без гард е нарушение", () => {
  const f = lintShell('set -euo pipefail\n( cd "$d"\n  bash deploy.sh\n)\n', "autodeploy.sh");
  assert.ok(codes(f).has("unguarded-subshell"));
});

test("същият subshell с `|| { … }` е чист", () => {
  const f = lintShell('set -euo pipefail\n( cd "$d"\n  bash deploy.sh\n) || { warn "паднa"; deploy_failed=1; return; }\n', "autodeploy.sh");
  assert.ok(!codes(f).has("unguarded-subshell"));
});

test("едноредов вариант също се лови", () => {
  const f = lintShell('set -euo pipefail\n( cd "$d" && bash deploy.sh )\n', "autodeploy.sh");
  assert.ok(codes(f).has("unguarded-subshell"));
});

test("тривиален subshell (без деплой команда) не е нарушение", () => {
  const f = lintShell('set -euo pipefail\n( cd "$d" && pwd )\n', "autodeploy.sh");
  assert.ok(!codes(f).has("unguarded-subshell"));
});

test("без `set -e` правилото не важи — там subshell не убива пробега", () => {
  const f = lintShell('#!/bin/bash\n( cd "$d" && bash deploy.sh )\n', "x.sh");
  assert.ok(!codes(f).has("unguarded-subshell"));
});

test("реалният autodeploy.sh минава правилото", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const src = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf-8");
  assert.ok(!codes(lintShell(src, "deploy/autodeploy.sh")).has("unguarded-subshell"));
});

test("чистене с `ls` без `|| true` при pipefail се хваща", () => {
  // Най-тихият провал в скрипта: празен шаблон → `ls` връща 2 → pipefail вдига
  // конвейера → set -e прекратява БЕЗ нито един ред изход. Деплоят изглежда
  // успешен, но `current` symlink-ът и чистенето на релийзи не се случват.
  const src = 'set -euo pipefail\nls -1dt "$D".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf\n';
  assert.ok(codes(lintShell(src, "x.sh")).has("cleanup-kills-script"));
});

test("същият ред с `|| true` е наред", () => {
  const src = 'set -euo pipefail\nls -1dt "$D".bak-* 2>/dev/null | tail -n +3 | xargs -r rm -rf || true\n';
  assert.ok(!codes(lintShell(src, "x.sh")).has("cleanup-kills-script"));
});

test("присвояване и заместване на процес НЕ са нарушение", () => {
  // `x="$(ls …)"` взима кода на присвояването, а `done < <(ls …)` не го
  // разпространява — правило, което ги маркира, би шумяло без причина.
  const a = 'set -euo pipefail\nprev="$(ls -1dt "$R"/*/ 2>/dev/null | sed -n 2p)"\n';
  const b = 'set -euo pipefail\nwhile read -r x; do :; done < <(ls -1dt "$R"/*/ 2>/dev/null | tail -n +3)\n';
  assert.ok(!codes(lintShell(a, "x.sh")).has("cleanup-kills-script"));
  assert.ok(!codes(lintShell(b, "x.sh")).has("cleanup-kills-script"));
});

test("без pipefail правилото не важи", () => {
  const src = '#!/bin/bash\nls -1dt "$D".bak-* | xargs -r rm -rf\n';
  assert.ok(!codes(lintShell(src, "x.sh")).has("cleanup-kills-script"));
});

test("реалният autodeploy.sh минава и това правило", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const src = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf-8");
  assert.ok(!codes(lintShell(src, "deploy/autodeploy.sh")).has("cleanup-kills-script"));
});
