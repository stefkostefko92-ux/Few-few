#!/usr/bin/env node
// stop-failure.mjs — StopFailure: ход, прекъснат от грешка на API (rate_limit, billing_error, max_output_tokens,
// server_error …), се записва, вместо да изчезне.
//
// Защо (19.11.2026, по https://code.claude.com/docs/en/hooks.md — StopFailure): тези провали не стигат до Stop
// куките, затова usage/session-dod не ги виждат, а прекъснат агент изглежда като „просто спря“. Харнесът
// игнорира изхода на тази кука — тя само записва.
//
// Запис: `.claude/hooks/_state/stop-failures.jsonl` — вид грешка, кратки подробности (санитирани, ≤ 300 знака),
// агент, сесия, време. Без съдържание на разговора и без лични данни. Чете се от `node tools/agents/usage-report.mjs`.
// Fail-open: всяка грешка → exit 0.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "../../tools/lib/is-main.mjs";
import { sanitize } from "./guard-secrets.mjs";
import { CREDENTIAL } from "../../tools/lib/secret-patterns.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// CLAUDE_PROJECT_DIR: в продукция е коренът на репото (= HERE/../..); в тестовете — пясъчникът, не истинският _state.
export const LOG = join(process.env.CLAUDE_PROJECT_DIR ? join(process.env.CLAUDE_PROJECT_DIR, ".claude", "hooks") : HERE, "_state", "stop-failures.jsonl");
const KINDS = new Set(["rate_limit", "authentication_failed", "oauth_org_not_allowed", "account_on_hold", "billing_error",
  "invalid_request", "model_not_found", "server_error", "max_output_tokens", "cloud_credential_error", "unknown"]);

/** Редът за дневника (чиста функция). */
export function failureEntry(p = {}, when = new Date().toISOString()) {
  let details = sanitize(String(p.error_details || "")).replace(/\s+/g, " ").slice(0, 300);
  for (const c of CREDENTIAL) details = details.replace(new RegExp(c.re.source, c.re.flags.includes("g") ? c.re.flags : c.re.flags + "g"), "[тайна]");
  return {
    at: when,
    error: KINDS.has(p.error) ? p.error : "unknown",
    details,
    agent: /^[a-z0-9-]{1,40}$/.test(String(p.agent_type || "")) ? p.agent_type : "",
    session: String(p.session_id || "").slice(0, 64),
  };
}

if (isMain(import.meta.url)) {
  try {
    const p = JSON.parse(readFileSync(0, "utf8") || "{}");
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(failureEntry(p)) + "\n");
  } catch { /* fail-open */ }
  process.exit(0);
}
