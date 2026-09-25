#!/usr/bin/env node
// tools/trading/trader-lint.mjs — статичен линтер за автоматизирани трейдинг ботове.
//
// Хваща типичните грешки и рискове, БЕЗ да пуска бота и БЕЗ да изпраща поръчки: поръчка без
// clientOrderId, сляп ретрай след мрежова грешка (дубъл поръчка), float за пари/количества,
// липсващ stop-loss / kill-switch, WebSocket без reconnect/resubscribe, плътен polling цикъл без
// rate-limit backoff, твърдо вписан API ключ/секрет, количество без floor към stepSize, look-ahead
// в бектест (четене на затваряне на текущия бар), withdrawal права на ключа.
//
// Употреба:  node tools/trading/trader-lint.mjs <папка-или-файл>
// Изход: 0 = чисто/само INFO, 1 = има HIGH находки. Евристичен помощник, не заместител на ревю/тест.
// НАПОМНЯНЕ: този линтер не гарантира печалба и не е инвестиционен съвет — тествай на testnet/paper.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] || ".";
const findings = [];
const add = (sev, code, msg, where) => findings.push({ sev, code, msg, where });

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "build") continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

if (!existsSync(root)) { add("HIGH", "no-path", `Пътят не съществува: ${root}`, root); report(); process.exit(1); }

const files = (statSync(root).isDirectory() ? walk(root) : [root])
  .filter((f) => [".js", ".mjs", ".cjs", ".ts", ".py", ".json", ".env"].includes(extname(f)) || f.endsWith(".env"));

// API ключове/секрети (Binance/Bybit/Kraken/generic): дълъг base64/hex стринг, присвоен на ключ.
const APIKEY_RE = /\b(api[_-]?key|api[_-]?secret|secret[_-]?key)\b\s*[:=]\s*["'][A-Za-z0-9\/+_-]{32,}["']/i;

for (const f of files) {
  let src = "";
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const rel = f.replace(root, "").replace(/^\//, "") || f;
  const isEnvOrSample = /\.env(\.example|\.sample)?$/.test(f) || /example|sample|test|spec|mock|fixture/i.test(f);
  const hasCreateOrder = /(createOrder|create_order|place_order|placeOrder|new_order|newOrder|create_limit_order|create_market_order)/.test(src);

  // 1) Твърдо вписан API ключ/секрет
  if (APIKEY_RE.test(src) && !isEnvOrSample)
    add("HIGH", "hardcoded-key", "Изглежда твърдо вписан API ключ/секрет — дръж го в env/secret manager, НИКОГА в код/git; ако е реален → ротирай веднага и провери за withdrawal права.", rel);

  // 2) Поръчка без clientOrderId (не може да се дедупира при ретрай)
  if (hasCreateOrder && !/(clientOrderId|client_order_id|newClientOrderId|clOrdID|clientOid|client_oid)/i.test(src))
    add("HIGH", "no-client-order-id", "createOrder без clientOrderId — не можеш да дедупираш при timeout/ретрай → риск от дублирана поръчка (двойна позиция = реална загуба). Генерирай уникален clientOrderId и проверявай по него.", rel);

  // 3) Сляп ретрай след мрежова грешка около поръчка
  if (hasCreateOrder && /(catch|except)[\s\S]{0,220}?(retry|createOrder|create_order|placeOrder|place_order)/.test(src) && !/(fetchOrder|fetch_order|fetchOpenOrders|fetch_open_orders|get_order|queryOrder|reconcil)/i.test(src))
    add("HIGH", "blind-retry", "Изглежда сляп ретрай на поръчка в catch без проверка дали вече е минала — мрежов провал ≠ 'поръчката не мина'. Първо fetchOrder/fetchOpenOrders по clientOrderId, чак после препрати.", rel);

  // 4) Float за количество/цена (парична неточност)
  if (hasCreateOrder && /(parseFloat|Number\()\s*[^)]*(amount|qty|quantity|price|size|balance)/i.test(src) && !/(Decimal|BigNumber|bignumber|toFixed|truncate|floorTo|stepSize|precisionMode|new BN\()/i.test(src))
    add("MEDIUM", "float-money", "parseFloat/Number за количество/цена — float трупа грешка (0.1+0.2!==0.3) и чупи precision. Ползвай Decimal/BigNumber или цели единици; закръгляй с floor към tickSize/stepSize.", rel);

  // 5) Количество без floor към stepSize / minNotional
  if (hasCreateOrder && /(amount|qty|quantity|size)\s*[:=]/i.test(src) && !/(stepSize|step_size|lotSize|lot_size|amountToPrecision|amount_to_precision|floor|truncate|minNotional|min_notional)/i.test(src))
    add("MEDIUM", "no-precision-floor", "Количество на поръчка без видимо закръгляне надолу към stepSize/minNotional — борсата отхвърля поръчката или оставя dust. Приложи floor към stepSize и проверявай minNotional.", rel);

  // 6) Липсващ stop-loss в изпълняващ поръчки код
  if (hasCreateOrder && !/(stop[_-]?loss|stopLoss|stopPrice|stop_price|STOP_MARKET|STOP_LIMIT|reduceOnly|reduce_only|trailing)/i.test(src) && !isEnvOrSample)
    add("HIGH", "no-stop-loss", "Код, който отваря позиции, без видим stop-loss/reduce-only на борсата — позиция без защита. Постави стоп на БОРСАТА веднага след fill (не 'ментален' стоп в паметта на бота).", rel);

  // 7) Липсващ kill-switch / max-drawdown контрол в целия таргет (проверява се на ниво файлова колекция долу)

  // 8) WebSocket без reconnect/resubscribe
  if (/(new WebSocket|websocket|ws\.on\(|\.watchTicker|\.watchOHLCV|watch_ticker|ws_connect|websockets\.connect)/i.test(src) && !/(reconnect|re-?subscribe|resubscribe|on.?close.*connect|backoff|ping|heartbeat|keepAlive|keep_alive)/i.test(src))
    add("MEDIUM", "ws-no-reconnect", "WebSocket без видим reconnect/resubscribe/heartbeat — при disconnect губиш fills/цени и търгуваш на остаряло състояние. Добави auto-reconnect с backoff + resubscribe и reconcile през REST след празнина.", rel);

  // 9) Плътен polling цикъл без rate-limit backoff
  if (/(while\s*\(\s*(true|1)\s*\)|for\s*\(;;\))[\s\S]{0,220}?(fetch|request|get|createOrder|fetchTicker|fetch_ticker|fetchBalance)/i.test(src) && !/(sleep|setTimeout|await\s+wait|rateLimit|rate_limit|Retry-After|retry_after|backoff|enableRateLimit|throttle|asyncio\.sleep|time\.sleep)/i.test(src))
    add("MEDIUM", "tight-poll-loop", "Плътен цикъл от REST заявки без rate-limit пауза/backoff — рискуваш 429 и IP ban. Ползвай WebSocket за live данни, enableRateLimit на CCXT, или явен sleep/backoff + уважавай Retry-After.", rel);

  // 10) Look-ahead в бектест: използване на затваряне на ТЕКУЩИЯ бар за сигнал+изпълнение
  const looksBacktest = /(backtest|back_test|for\s+.*in\s+.*(candles|bars|ohlcv)|for\s*\(.*(candle|bar|ohlcv))/i.test(src);
  if (looksBacktest && /(close\[i\]|closes\[i\]|bar\.close|candle\[4\]|row\[.close.\])/i.test(src) && /(signal|entry|enter|buy|sell)/i.test(src) && !/(i\s*\+\s*1|next|shift|open\[i\s*\+\s*1\]|lookahead|look_ahead|no-lookahead)/i.test(src))
    add("MEDIUM", "backtest-lookahead", "Възможен look-ahead: сигнал ползва close на ТЕКУЩИЯ бар, а трябва да се изпълнява на отваряне на следващия (open[i+1]). Иначе бектестът лъже. Отмести изпълнението с 1 бар.", rel);

  // 11) Withdrawal в код на бота (почти никога нужно)
  if (/(withdraw|withdrawal|createWithdrawal|create_withdrawal|transfer.*external|sapi.*withdraw)/i.test(src) && !isEnvOrSample)
    add("MEDIUM", "withdrawal-in-bot", "Код за теглене (withdraw) в трейдинг бот — почти никога не е нужно и умножава риска при компрометиран ключ. Ползвай ключове САМО с trade+read права, withdrawal изключен.", rel);
}

// Проверка на ниво колекция: има ли изобщо kill-switch / max-drawdown контрол някъде в таргета?
const allSrc = files.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
const opensOrders = /(createOrder|create_order|placeOrder|place_order|newOrder|new_order)/.test(allSrc);
if (opensOrders && !/(killSwitch|kill[_-]?switch|maxDrawdown|max[_-]?drawdown|dailyLoss|daily[_-]?loss|circuitBreaker|circuit[_-]?breaker|halt.?trading|stopTrading|maxLoss|max[_-]?loss)/i.test(allSrc))
  add("HIGH", "no-kill-switch", "Ботът отваря поръчки, но никъде няма kill-switch / max-drawdown / дневен loss limit — една бъгова серия може да източи сметката. Добави глобален риск-предпазител, който спира нови входове и известява човек.", "(глобално)");

report();
process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);

function report() {
  const order = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev]);
  if (!findings.length) { console.log("✓ trader-lint: чисто (няма находки). Помни: чист линт ≠ печеливша стратегия — тествай на testnet/paper."); return; }
  console.log(`trader-lint — ${findings.length} находки за ${root}:\n`);
  for (const f of findings)
    console.log(`  [${f.sev}] ${f.code} · ${f.where}\n        ${f.msg}`);
  const h = findings.filter((f) => f.sev === "HIGH").length;
  console.log(`\n${h} HIGH · ${findings.filter((f) => f.sev === "MEDIUM").length} MEDIUM · ${findings.filter((f) => f.sev === "INFO").length} INFO`);
  console.log("\n⚠ Не е инвестиционен съвет. Автоматизираната търговия носи риск от загуба на целия капитал.");
}
