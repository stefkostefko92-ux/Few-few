# treydar/ — Трейдъра (spot трейдинг бот за Binance)

Automated **spot** trading bot with **risk management as the first rule**. Built
and maintained by the **treydara** agent (`.claude/agents/treydara.md`). Root
rules live in the repo-root `CLAUDE.md`.

> ⚠️ **Software engineering, NOT investment/financial advice.** Automated trading
> can lose the entire capital; no bot guarantees profit. The bundled SMA-crossover
> strategy is a **demo placeholder**, not a winning system. Backtest + run on
> **testnet/paper** before risking real money. Trading others' funds or giving
> "advice" triggers licensing (EU: MiFID II) — consult a lawyer.

_Stack: Node.js · CCXT · **plain JS (ESM)**. Single package._

## Commands (run inside `treydar/`)

```bash
npm start                # live (respects TRADING_LIVE / .env)
npm run dry              # TRADING_LIVE=false — honest paper trader
npm run backtest         # single-symbol backtest
npm run portfolio        # multi-symbol portfolio backtest
npm run review           # coach: expectancy / R-multiples / repeated-mistake markers
npm test                 # node --test test/*.test.js
npm run lint             # tools/trading/trader-lint.mjs + backtest-check.mjs
```

## Conventions (important — non-negotiable)

- **Idempotent orders:** every order carries a `clientOrderId`; on retry, check
  (`fetchOrder`) first — never blind-retry (zero duplicate orders).
- **Precision:** respect `tickSize`/`stepSize`/`minNotional`, floor down; **never
  use float for money** (Decimal).
- **Risk controls always on:** position sizing by % risk (fractional Kelly), a
  **stop-loss placed on the exchange**, daily loss limit, global max-drawdown
  **kill-switch**; ADX regime filter + trade-frequency brakes (cooldown after loss).
- **Honest backtest only:** no look-ahead / survivorship bias; include fees +
  slippage + funding; walk-forward / out-of-sample; Monte Carlo risk-of-ruin.
  `dry` is a real paper trader (simulated stop, paper PnL — no fake journal rows).
- **Reconnection:** auto-reconnect + backoff + resubscribe + heartbeat + reconcile
  after a gap; respect rate-limit weights (429/Retry-After backoff).
- **Security:** API keys **without withdrawal permission**, IP allowlist, separate
  testnet/live; secrets stay in `.env` (see `.env.example`), never in the repo.
- **Regulation (EU):** MiFID II Art. 17 (controls/kill-switch/testing), MAR (no
  spoofing/wash/layering). Every deliverable ends with the honest risk disclaimer.

Deeper rationale + the great-traders distillation: `docs/principles.md`.
