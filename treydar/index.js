// index.js — входна точка. Зарежда .env, валидира конфига, печата режима и стартира бота.
import { readFileSync } from 'node:fs';
import { loadConfig, describeMode } from './src/config.js';
import { startBot } from './src/bot.js';
import { log } from './src/logger.js';

// Малък .env зареждач (без външна зависимост). Не пипа вече зададени env променливи.
function loadDotenv(path = '.env') {
  let txt = '';
  try { txt = readFileSync(path, 'utf8'); } catch { return; }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotenv();
let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  log.error(e.message);
  process.exit(1);
}

log.info(`Режим: ${describeMode(cfg)}`);
log.info(`Пазар: ${cfg.symbol} · ${cfg.timeframe} · SMA ${cfg.smaFast}/${cfg.smaSlow}`);
log.info(`Риск: ${cfg.riskPctPerTrade}%/сделка · стоп ${cfg.stopLossPct}% · дневен лимит ${cfg.dailyLossLimitPct}% · max DD ${cfg.maxDrawdownPct}%`);
if (cfg.realMoney) log.warn('РАБОТИШ С РЕАЛНИ ПАРИ. Загубите са реални. Не е инвестиционен съвет.');

startBot(cfg).catch((e) => { log.error(`Фатално: ${e.message}`); process.exit(1); });
