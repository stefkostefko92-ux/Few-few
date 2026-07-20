#!/usr/bin/env node
// guard-secrets.mjs — PostToolUse(Write|Edit) ранно предупреждение. Ако тъкмо записан файл съдържа
// ВИСОКО-УВЕРЕН секрет-шаблон (near-zero-FP), surface-ва предупреждение веднага (exit 2), за да го махнеш
// ПРЕДИ commit. Не отменя записа — реалният hard gate е `tools/security/secret-scan.mjs` при commit/CI.
// Пропуска fixture/eval/test/scratch пътища (там фалшиви ключове са легитимни). **Fail-open** навсякъде.
//
// Договор: stdin = JSON {tool_name, tool_input:{file_path, content|new_string}}. Регистриран като
// PostToolUse matcher "Write|Edit".

// Near-zero-FP шаблони (както в secret-scan): реален ключ, не споменаване.
export const SECRET_RE = [
  { re: /sk_live_[0-9a-zA-Z]{20,}/, name: "Stripe live secret" },
  { re: /rk_live_[0-9a-zA-Z]{20,}/, name: "Stripe restricted live key" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, name: "AWS access key id" },
  { re: /\bghp_[0-9A-Za-z]{36}\b/, name: "GitHub personal access token" },
  { re: /\bgithub_pat_[0-9A-Za-z_]{60,}\b/, name: "GitHub fine-grained PAT" },
  { re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, name: "private key (PEM)" },
  { re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/, name: "Slack token" },
  { re: /\bAIza[0-9A-Za-z\-_]{35}\b/, name: "Google API key" },
];

// Пътища, където фалшиви ключове са легитимни (фикстури/тестове/eval/scratch) → не вдигай шум.
export const SKIP_PATH = /(^|\/)(evals?|fixtures?|__tests__|test|tests|\.tmp|scratchpad|node_modules)(\/|$)|\.(test|spec)\.[a-z]+$/i;

export function findSecret(content) {
  const s = String(content || "");
  for (const p of SECRET_RE) if (p.re.test(s)) return p.name;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(buf || "{}");
      const ti = payload?.tool_input || {};
      const file = ti.file_path || "";
      if (file && SKIP_PATH.test(file)) process.exit(0);
      const content = ti.content ?? ti.new_string ?? "";
      const hit = findSecret(content);
      if (hit) {
        process.stderr.write(`⚠️  guard-secrets: възможен ${hit} в ${file || "записания файл"}. Махни го (тайните живеят само на сървъра, mode 600) ПРЕДИ commit. Пусни: node tools/security/secret-scan.mjs\n`);
        process.exit(2);
      }
      process.exit(0);
    } catch {
      process.exit(0); // fail-open
    }
  });
  process.stdin.on("error", () => process.exit(0));
}
