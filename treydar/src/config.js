// config.js — чете и ВАЛИДИРА конфигурацията от env. Тук живее твърдото gating на "живо".
// Философия: реални пари се движат само при изричен, недвусмислен избор — не при пропуск/бъг.

function num(name, def, { min, max } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`Конфиг грешка: ${name} не е число: "${raw}"`);
  if (min !== undefined && v < min) throw new Error(`Конфиг грешка: ${name}=${v} < мин ${min}`);
  if (max !== undefined && v > max) throw new Error(`Конфиг грешка: ${name}=${v} > макс ${max}`);
  return v;
}

export function loadConfig(env = process.env) {
  const testnet = env.BINANCE_TESTNET !== 'false'; // по подразбиране testnet
  // "живо" = праща реални поръчки. Всичко освен точно "true" е dry-run.
  const live = env.TRADING_LIVE === 'true';

  const cfg = {
    apiKey: env.BINANCE_API_KEY || '',
    apiSecret: env.BINANCE_API_SECRET || '',
    testnet,
    live,
    // РЕАЛНИ ПАРИ = реален Binance (не testnet) И live поръчки.
    realMoney: !testnet && live,

    symbol: env.SYMBOL || 'BTC/USDT',
    timeframe: env.TIMEFRAME || '1h',
    smaFast: num('SMA_FAST', 20, { min: 2 }),
    smaSlow: num('SMA_SLOW', 50, { min: 3 }),

    riskPctPerTrade: num('RISK_PCT_PER_TRADE', 0.5, { min: 0.01, max: 5 }),
    stopLossPct: num('STOP_LOSS_PCT', 2, { min: 0.1, max: 50 }),
    takeProfitPct: num('TAKE_PROFIT_PCT', 4, { min: 0, max: 500 }),
    dailyLossLimitPct: num('DAILY_LOSS_LIMIT_PCT', 3, { min: 0.1, max: 100 }),
    maxDrawdownPct: num('MAX_DRAWDOWN_PCT', 15, { min: 0.5, max: 100 }),
    maxPositionPct: num('MAX_POSITION_PCT', 25, { min: 1, max: 100 }),
    loopSeconds: num('LOOP_SECONDS', 60, { min: 5, max: 3600 }),
    // Виртуален капитал за DRY-RUN, когато няма ключове/баланс за четене.
    paperEquity: num('PAPER_EQUITY', 10000, { min: 1 }),
  };

  // --- Валидации, които спасяват пари ---
  if (cfg.smaFast >= cfg.smaSlow)
    throw new Error(`Конфиг грешка: SMA_FAST (${cfg.smaFast}) трябва да е < SMA_SLOW (${cfg.smaSlow}).`);

  if (cfg.live && (!cfg.apiKey || !cfg.apiSecret))
    throw new Error('TRADING_LIVE=true, но липсват BINANCE_API_KEY/SECRET.');

  // Реални пари → изисквай изричното двойно потвърждение.
  if (cfg.realMoney && env.I_UNDERSTAND_THE_RISK !== 'РАЗБИРАМ-РИСКА')
    throw new Error(
      'ОТКАЗ: искаш РЕАЛНИ поръчки на РЕАЛЕН Binance, но I_UNDERSTAND_THE_RISK ≠ "РАЗБИРАМ-РИСКА". ' +
      'Това е нарочна спирачка. Тествай първо на testnet (BINANCE_TESTNET=true) и с бектест.'
    );

  return cfg;
}

// Кратко човешко описание на режима — печата се при старт, за да няма изненади.
export function describeMode(cfg) {
  if (cfg.realMoney) return '🔴 РЕАЛНИ ПАРИ на реален Binance (live поръчки)';
  if (cfg.live && cfg.testnet) return '🟡 Testnet live поръчки (фалшиви пари)';
  return '🟢 DRY-RUN (само логва намерения, НЕ праща поръчки)';
}
