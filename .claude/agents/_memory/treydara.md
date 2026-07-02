# Памет на агента „Трейдъра" (v6.0 — самообучение)

Трайно файлово знание между извикванията (Claude Code субагентите са stateless).
Цикълът е **наложен от hooks** (виж `_memory/PROTOCOL.md`): при старт `SubagentStart`
инжектира „Проверени поуки"; накрая `SubagentStop` добавя новия ```learn блок
(verified → тук; друго → Карантина); `tools/memory/curate.mjs` дедупира и пази от дрейф.
**Закон:** само проверено става факт; източник или нищо; противоречие → стоп (човек решава).
**Специално правило:** пазарно твърдение („тази стратегия печели/ще расте") **никога** не е verified —
то е недоказуемо и не влиза в паметта като факт.

## Проверени поуки (verified)
- **2026-07-02:** Binance signed endpoints: recvWindow default 5000ms, max 60000, препоръка <=5000. Заявка се приема само ако timestamp < serverTime+1000ms И serverTime-timestamp <= recvWindow; иначе -1021 INVALID_TIMESTAMP. Часовников desync чупи ВСЯКА подписана заявка — синхронизирай спрямо GET /api/v3/time. _("Binance spot подписани заявки / timestamp sync в treydar/"; verified; "https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/rest-api.md")_
- **2026-07-02:** Binance spot listenKey живее 60 минути; keepalive PUT /api/v3/userDataStream ~на 30 мин подновява за още 60 (POST създава, DELETE затваря). Изпълнения/fills идват със събитие executionReport (X status, z cum filled, Z cum quote, avg=Z/z). ВАЖНО: REST listenKey е маркиран Deprecated — новото е user-data stream през WebSocket API. _("Binance spot user-data stream / live fills в treydar/"; verified; "https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream + WebSearch developers.binance.com (listenKey 60 min / 30 min keepalive)")_
- **2026-07-02:** Binance SPOT STOP_LOSS_LIMIT изисква задължително: timeInForce, quantity, price (лимитна цена след тригер) и stopPrice (тригер) — или trailingDelta вместо stopPrice. При gap лимитният price може да не се напълни. _("Binance spot stop-loss поръчки в treydar/"; verified; "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints")_
- **2026-07-02:** Binance rate limits: HTTP 429 = превишен лимит (back off); упорито игнориране на 429 → автоматичен 418 IP ban, скалиращ от 2 мин до 3 дни. И 429, и 418 носят header Retry-After (секунди). Следи X-MBX-USED-WEIGHT-* и X-MBX-ORDER-COUNT-*. Канонично: чети rateLimits от exchangeInfo при старт, не hardcode. _("Binance spot REST rate limiting/backoff в treydar/"; verified; "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits")_
- **2026-07-02:** Binance SPOT: всички нарушения на филтри (PRICE_FILTER, LOT_SIZE, NOTIONAL, MIN_NOTIONAL) връщат HTTP код -1013 с message 'Filter failure: <ФИЛТЪР>'. Правила: price % tickSize == 0; qty в [minQty,maxQty] и qty % stepSize == 0; minNotional <= price*qty <= maxNotional. Floor към стъпката И проверка на notional ПРЕДИ изпращане. _("Binance spot REST, изпращане на поръчки в treydar/"; verified; "https://developers.binance.com/docs/binance-spot-api-docs/filters + https://developers.binance.com/docs/binance-spot-api-docs/errors")_
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

- **2026-07-01:** Резултати за 2025 (клас активи): СРЕБРО топ ~+132%; ЗЛАТО ~+65% (най-добра година от
  1979, връх ~$4500); международни/EM акции силни; S&P 500 трета поредна двуцифрена година; Bitcoin
  ОТРИЦАТЕЛЕН −7.6% (въпреки връх ~$125k); петрол най-лош ~−20% — урок: „сигурните" фаворити загубиха,
  скучните метали спечелиха _(2025 asset classes; verified; https://www.cnbc.com/2025/12/30/best-and-worst-asset-classes-of-2025-gold-wins-the-year.html + https://www.thenationalnews.com/business/money/2026/01/01/gold-stocks-bitcoin-what-investing-in-main-asset-classes-will-look-like-in-2026/)_
- **2026-07-01:** Топ крипто 2025: MYX Finance +3358% (микрокап дериватив на BNB Chain, пуснат май 2025 ~
  $0.097) е №1; Zcash +~573% (privacy коини водещи, Monero ~+125%); НО Bitcoin −7.96% и Ethereum −15.25%
  за годината → най-голямата печалба е непредвидим микрокап, а мажорите губят; гоненето му ex-post =
  купуване на върха _(2025 crypto gainers; verified; https://www.fool.com/investing/2026/01/11/best-performing-cryptocurrencies-of-2025/ + https://www.coingecko.com/research/publications/top-crypto-gainers)_
- **2026-07-01:** Топ S&P 500 акции 2025: Sandisk (SNDK) +~596% №1 (спин-оф от WDC, добавена ноем.);
  Micron +~250%; Western Digital +~226%; Seagate; Robinhood +~215% — тема AI/памет/сторидж. Пак
  survivorship: списъкът показва оцелелите победители, не загубилите _(2025 top stocks; verified; https://finance.yahoo.com/news/top-performing-p-500-stocks-145700080.html + https://stocktwits.com/news-articles/markets/equity/top-five-s-and-p-500-gainers-in-2025/cL7462UREUV)_
- **2026-07-01:** Мисловен принцип (изведен от данните горе): победителят всяка година е различен и
  непредвидим ex-ante; recency/hindsight bias кара хората да гонят миналогодишния лидер и да купуват
  върха; правилният отговор е процес > пророчество — диверсификация, малък фиксиран риск/сделка,
  walk-forward валидация, оцеляване пред максимизиране _(mental models; verified; .claude/agents/treydara.md „Начин на мислене")_

- **2026-07-01:** Turtle Traders (Dennis) риск-система: N=ATR(20); 1 Unit оразмерен така, че 1N движение
  ≈ 1% от капитала; стоп 2N; пирамидиране +1 unit на 0.5N до 4 units/пазар, 12 в посока. Survivorship:
  НЕ всички Turtles успяха — правилата искат дисциплина през дълги drawdown-и _(Turtle rules; verified; https://oxfordstrat.com/coasdfASD32/uploads/2016/01/turtle-rules.pdf)_
- **2026-07-01:** Kelly criterion (Thorp): f*=(bp−q)/b (бинарно) или f*=(μ−r)/σ² (непрекъснато); максимизира
  E[log(богатство)] = геометричен растеж; ПРАКТИЦИТЕ ползват ДРОБЕН Kelly (½ дава ~75% растеж при ~¼
  дисперсия; над Kelly → по-нисък растеж И по-висок риск; 2×Kelly → растеж 0); variance drag g≈μ−σ²/2
  (волатилността влиза с квадрат) → недооценката ѝ е фатална; p,μ,σ са оценки с грешка → дробен Kelly е буфер _(Kelly fractional; verified; https://en.wikipedia.org/wiki/Kelly_criterion + https://gwern.net/doc/statistics/decision/2006-thorp.pdf)_
- **2026-07-01:** Expectancy (Tharp): E[R]=p·avgWinR+(1−p)·avgLossR; R=първоначален риск (entry→stop);
  печелиш при E[R]>0 върху достатъчна извадка; position size=(Account×Risk%)/|Entry−Stop|; sizing-ът, не
  входът, е ключът _(expectancy R-multiple; verified; https://vantharpinstitute.com/tharp-think-trading-concepts/)_
- **2026-07-01:** Kovner (Market Wizards): стоп се решава ПРЕДИ входа, на ниво което доказва че сделката
  греши (не произволна сума); размерът се извежда от стопа; „undertrade, undertrade, undertrade — cut it
  at least in half"; новаци търгуват 3–5× твърде голямо (5–10% риск вместо 1–2%) _(Kovner risk; verified; https://www.newtraderu.com/2020/08/04/market-wizard-bruce-kovner-trading-quotes/)_
- **2026-07-01:** Признаване на грешка = едж: Soros „I'm only rich because I know when I'm wrong";
  Druckenmiller наруши правилата си 2000 (FOMO), купи $6B tech на върха, загуби ~$3B за 6 седмици —
  провалът беше ЕМОЦИОНАЛЕН, не аналитичен; PTJ „always thinking about losing money", цели 5:1 асиметрия,
  200-дневна MA като защита-филтър _(macro mistake-admission; verified; https://novelinvestor.com/stan-druckenmillers-worst-mistake-ever/ + https://mebfaber.com/2014/11/06/paul-tudor-jones-on-the-200-day-moving-average/)_
- **2026-07-01:** Eckhardt: „success rate of trades is the LEAST important performance statistic and may
  be inversely related to performance" → НЕ оптимизирай win-rate; Seykota: „if you can't take a small
  loss, sooner or later you take the mother of all losses"; тренд-фолоуинг hit-rate ~35–40%, печели от
  асиметрия; Harding честно: Sharpe на тренда ~0.5 и спада _(trend-following; verified; https://macro-ops.com/william-eckhardts-market-wizard-trading-strategy-explained/ + https://www.daytrading.com/ed-seykota)_
- **2026-07-01:** Dalio „Holy Grail": 15–20 НЕкорелирани доходни потока → ~80% по-малко риск при същата
  доходност; корелацията е ключът, не броят; „Pain + Reflection = Progress"; честно: Pure Alpha на
  загуба 2020, 1982 почти фалит от свръх-увереност _(Dalio uncorrelated; verified; https://macro-ops.com/ray-dalio-portfolio-allocation-strategy-holy-grail/)_
- **2026-07-01:** Психологически грешки → механична неутрализация (правила > воля, защото волята се чупи
  под стрес): disposition effect (стоп+таргет преди входа), revenge trading (cooldown + дневен loss
  limit), over-trading (лимит сделки/ден), местене на стоп надолу (забранено, само trailing нагоре),
  all-in (фиксиран риск% + таван), averaging down (забранено); Livermore фалира 4 пъти точно на тези _(trading psychology; verified; https://enlightenedstocktrading.com/disposition-effect-in-trading/ + https://macro-ops.com/jesse-livermores-strategy-flaw-position-sizing/)_
- **2026-07-01:** Внедрено в treydar: fractionalKelly() в risk.js (¼-Kelly от реализираната статистика,
  капнат, 0 при <30 сделки/без едж); journal.js записва сделки в R; coach.js/review.js смята expectancy
  и маркира повтарящи се грешки — реален цикъл „учи от грешките си" _(treydar learning loop; verified; treydar/src/coach.js + treydar/src/journal.js)_

- **2026-07-01:** Внедрени проф. предпазители в treydar: (1) ADX режим-филтър (indicators.adx + strategy)
  — вход само в силен тренд; (2) честотни спирачки risk.tradingAllowedByFrequency — дневен лимит сделки
  + cooldown след загуба (психология → правила срещу over/revenge trading); (3) Monte Carlo risk-of-ruin
  metrics.monteCarloRuin — bootstrap на R-multiples показва P(просадка≥X) спрямо риск/сделка; (4) портфейл
  portfolio.js (correlation/groupByCorrelation/canOpenPosition) + portfolio-backtest.js за Dalio Holy Grail
  (некорелирани потоци сваля риска); (5) engine.js споделен симулационен двигател; (6) CI workflow treydar.
  37/37 теста, линт чист _(treydar pro guards; verified; treydar/src/{portfolio,engine,metrics,indicators,risk}.js + .github/workflows/treydar.yml)_

- **2026-07-02:** Мулти-символен режим в treydar (multibot.js): портфейлните лимити се проверяват на
  ВСЕКИ вход (canOpenPosition: макс едновременни, общ риск, риск в корелирана група — корелация на живо
  от затворени свещи); всички символи споделят една quote валута (валидирано в config). Поука от
  прегледа: dry-run журналираше фалшиви стоп-изходи (борсовият баланс е 0 без реални поръчки) → paper
  позициите трябва да живеят в state със симулиран стоп, иначе тровят статистиката на тренера
  _(multibot + dry-run journal fix; verified; treydar/src/multibot.js + treydar/src/bot.js)_

## Карантина (непроверени хипотези — НЕ факт)
- **2026-07-02:** Binance newClientOrderId: потвърдено само 'unique id among open orders', авто-генериран при пропуск; дедуп чрез GET /api/v3/order по origClientOrderId преди повторно изпращане. Точният regex/max дължина (историческо: ^[\\.A-Z\\:/a-z0-9_-]{1,36}$, макс 36) НЕ потвърден жив този сеанс. _("Binance spot idempotent clientOrderId в treydar/ — потвърди преди hardcode"; unverified; "частично https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints; точен charset/лимит непотвърден")_
- **2026-07-02:** Binance default rate limits (менят се, четат се от exchangeInfo): REQUEST_WEIGHT ~6000/мин, ORDERS ~50/10s и ~160000/ден. Числата са current default, НЕ константи за hardcode. _("Binance spot rate-limit tuning"; probable; "WebSearch на developers.binance.com/docs/binance-spot-api-docs (limits) — не ренднати като точна страница; сверявай с exchangeInfo")_
- _(празно)_
