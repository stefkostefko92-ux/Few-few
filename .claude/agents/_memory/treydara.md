# Памет на агента „Трейдъра" (v6.0 — самообучение)

Трайно файлово знание между извикванията (Claude Code субагентите са stateless).
Цикълът е **наложен от hooks** (виж `_memory/PROTOCOL.md`): при старт `SubagentStart`
инжектира „Проверени поуки"; накрая `SubagentStop` добавя новия ```learn блок
(verified → тук; друго → Карантина); `tools/memory/curate.mjs` дедупира и пази от дрейф.
**Закон:** само проверено става факт; източник или нищо; противоречие → стоп (човек решава).
**Специално правило:** пазарно твърдение („тази стратегия печели/ще расте") **никога** не е verified —
то е недоказуемо и не влиза в паметта като факт.

## Проверени поуки (verified)
- **2026-07-01:** Основен закон на агента: „безгрешност" е ИНЖЕНЕРНА (кодът прави точно каквото трябва,
  риск-лимитите винаги държат), НЕ пазарна (никой не гарантира печалба); всяка доставка завършва с
  дисклеймър „не е инвестиционен съвет; риск от загуба на целия капитал" _(operating contract v1.0; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Идемпотентност на поръчки: всяка поръчка носи уникален clientOrderId; при timeout/
  NetworkError НЕ ретрай сляпо — първо fetchOrder/fetchOpenOrders по clientOrderId, защото мрежов провал
  ≠ „поръчката не мина" → дубъл = двойна позиция = реална загуба _(execution idempotency; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Precision: закръгляй количество/цена НАДОЛУ (floor) към stepSize/tickSize, спазвай
  minNotional; никога float за пари/количества (0.1+0.2!==0.3) — ползвай Decimal/цели единици _(precision floor; verified; https://docs.ccxt.com)_
- **2026-07-01:** Look-ahead bias в бектест: сигнал на бар N се изпълнява на ОТВАРЯНЕ на бар N+1, не на
  затваряне на N; не ползвай затварящата цена на текущата (незатворена) свещ; включвай такси+slippage+
  funding, иначе equity кривата лъже _(backtest look-ahead; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Риск преди всичко: всяка позиция има stop-loss на БОРСАТА (не 'ментален' в паметта на
  бота — ако падне, няма защита); дневен loss limit + глобален max-drawdown → kill-switch спира новите
  входове _(risk-first; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Сигурност на API ключове: само trade+read права, withdrawal ИЗКЛЮЧЕН, IP allowlist,
  тайните извън репото/git, отделни testnet/live ключове _(key security; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Регулация ЕС: автоматизиран съвет/управление на ЧУЖДИ активи е лицензирана дейност
  (MiFID II); алгоритмична търговия има изисквания (чл. 17: контроли, kill-switch, тестване); пазарна
  злоупотреба (MAR) забранява spoofing/wash/layering — при чужди пари/„съвет" ескалирай към юрист _(EU reg; verified; MiFID II чл. 17 / MAR)_
- **2026-07-01:** WebSocket устойчивост: auto-reconnect с backoff + resubscribe + heartbeat; при празнина
  пресверявай отворени поръчки/позиции през REST преди да продължиш; listenKey за user-data stream има
  срок → подновявай _(ws resilience; verified; .claude/agents/treydara.md)_
- **2026-07-01:** Binance (вкл. testnet.binance.vision) връща HTTP 451 „Service unavailable from a
  restricted location“ за IP на много дейта-центрове/облаци и ограничени юрисдикции — ботът трябва да се
  пуска от разрешен регион/IP; не е бъг в кода. Наблюдавано на живо при exchangeInfo от CI средата
  _(Binance 451 geo-block; verified; наблюдение GET https://testnet.binance.vision/api/v3/exchangeInfo → 451)_
- **2026-07-01:** Референтна имплементация: treydar/ (spot бот, CCXT, ESM) — config.js gate-ва live с
  тройна спирачка (BINANCE_TESTNET=false + TRADING_LIVE=true + I_UNDERSTAND_THE_RISK=РАЗБИРАМ-РИСКА);
  risk.js носи тестваната логика (positionSize от риск, max-drawdown kill-switch); execute.js прави
  идемпотентни поръчки (newClientOrderId + reconcile) + стоп на борсата; backtest.js е no-look-ahead с
  такси+slippage+OOS _(treydar reference impl; verified; treydar/)_

## Карантина (непроверени хипотези — НЕ факт)
- _(празно)_
