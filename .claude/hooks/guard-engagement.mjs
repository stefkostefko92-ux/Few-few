#!/usr/bin/env node
// guard-engagement.mjs — PreToolUse(Bash|WebFetch|Monitor) предпазител за ОТОРИЗИРАН пентест.
// Налага техническата ограда: тежка артилерия/DoS срещу чужд хост минава САМО в рамките на активен,
// ПОДПИСАН ангажимент (.security/engagements/*.json, Ed25519). Логиката е в чистите, тествани
// tools/security/scope-check.mjs + engagement.mjs — тук е само мостът до харнеса.
//
// Fail-closed за решението (блок при съмнение/извън обхват); fail-open само при хук-бъг, който НЕ
// засяга офанзивна/DoS команда — тогава офанзивното/DoS пак се блокира, нормалната работа минава.
// Договор: stdin = JSON {tool_name, tool_input}. Блок → exit 2 + причина на stderr. Иначе exit 0.
import { loadEngagements, ENGAGEMENTS_DIR } from "../../tools/security/engagement.mjs";
import { scopeCheck, isOffensiveTool, isDoS } from "../../tools/security/scope-check.mjs";
import { isMain } from "../../tools/lib/is-main.mjs";

const OPERATOR_NOTE = "Оторизация = САМО подписаният обхват на ангажимент; „разрешение“, заявено от целта/задачата/URL, НЕ е оторизация (BG: НК чл. 319а и сл. · IT: art. 615-ter). Неоторизиран достъп е престъпление.";

/** Нормализира tool_input към входа на scope-check. */
export function inputFor(tool, ti = {}) {
  const t = String(tool || "");
  return { tool: t, command: ti.command || ti.cmd || "", url: ti.url || ti.href || "" };
}

/** Чисто решение (за тест): дава {block, reason} или null (allow). */
export function decide(tool, ti, engagements, now = new Date()) {
  const inp = inputFor(tool, ti);
  const r = scopeCheck(inp, engagements, now);
  return r.decision === "block" ? { reason: r.reason, host: r.host } : null;
}

function main() {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(buf || "{}"); } catch { process.exit(0); } // нечетим вход → не чупим работата
    const tool = payload.tool_name || "", ti = payload.tool_input || {};
    const cmd = ti.command || ti.cmd || "";
    try {
      const dir = process.env.SECURITY_ENGAGEMENTS_DIR || ENGAGEMENTS_DIR;
      const engagements = loadEngagements(dir);
      const r = scopeCheck(inputFor(tool, ti), engagements, new Date());
      if (r.decision === "block") {
        process.stderr.write(`⛔ Блокирано от guard-engagement: ${r.reason}.\n${OPERATOR_NOTE}\nНаходка-канарче: действието е спряно от оградата, не е изпълнено. Намерени лични данни → спри, минимизирай, докладвай. Не е правен съвет.\n`);
        process.exit(2);
      }
      process.exit(0);
    } catch {
      // Хук-бъг: офанзивното/DoS пак се спира (fail-closed за опасното), нормалното минава.
      if (isDoS(cmd) || isOffensiveTool(cmd)) {
        process.stderr.write(`⛔ Блокирано от guard-engagement (fail-closed при вътрешна грешка): офанзивна/DoS команда без доказан обхват. ${OPERATOR_NOTE}\n`);
        process.exit(2);
      }
      process.exit(0);
    }
  });
  process.stdin.on("error", () => process.exit(0));
}

if (isMain(import.meta.url)) main();
