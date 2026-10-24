#!/usr/bin/env node
// health.mjs — здраве на CS2 сървъра през A2S_INFO (аналогът на `curl /health` за игра).
// Употреба: node health.mjs [хост=127.0.0.1] [порт=27015] [таймаут_ms=3000]
// Изход 0 + JSON на stdout = сървърът отговаря; изход 1 = не отговаря.
import { queryInfo } from "./a2s.mjs";

const [host = "127.0.0.1", port = "27015", timeout = "3000"] = process.argv.slice(2);

try {
  const info = await queryInfo(host, Number(port), Number(timeout));
  process.stdout.write(`${JSON.stringify(info)}\n`);
} catch (err) {
  process.stderr.write(`[cs2dm-health] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
