# Принципи на великите трейдъри — дестилат за „Трейдъра“

Проучено от нашите агенти (с източници). Това е **начин на мислене и подход**, не рецепта за печалба.
Общото между всички: **риск-мениджмънтът, не предсказанието, е едж-ът; оцеляването е първо.**
Честна нота — всеки от тези хора има **реални загуби и drawdown-и**; никой не е „безгрешен“.

---

## 1. Системен тренд-фолоуинг (реагирай, не предсказвай)

**Richard Dennis + Turtles (1983).** Търговията е **система от правила, която се учи**, не талант.
Donchian breakout вход (20/55 дни), ATR-риск: `N = ATR(20)`, 1 Unit оразмерен така, че **1N ≈ 1% от
капитала**; **стоп 2N**; пирамидиране +1 unit на 0.5N до 4 units/пазар, 12 в посока.
⚠ Survivorship: **не всички Turtles успяха** — правилата работят само с дисциплина през дълги drawdown-и.
_(turtle-rules PDF: https://oxfordstrat.com/coasdfASD32/uploads/2016/01/turtle-rules.pdf)_

**Ed Seykota.** „The elements of good trading are: (1) cutting losses, (2) cutting losses, and
(3) cutting losses.“ · „If you can't take a small loss, sooner or later you will take the mother of
all losses.“ Риск <1%/сделка; hit-rate само ~35–40% — печели от **асиметрия**. _(https://www.daytrading.com/ed-seykota)_

**Jerry Parker.** „Trend following plus nothing — forever.“ Малко параметри, без свръх-оптимизация;
диверсификация + лов на **outliers**. _(https://thehedgefundjournal.com/chesapeake-capitals-jerry-parker/)_

**Bill Dunn.** 100% механичен, нула discretionary override; **равен риск-bucket на всеки пазар**;
приема голям drawdown като цена за големите години. _(https://www.turtletrader.com/trader-dunn/)_

**David Harding (Winton).** Честно: дългосрочен Sharpe на тренда **~0.5** и **спада** с времето →
затова диверсифицира. Едж-ът намалява; не пренастройвай на шум. _(https://en.wikipedia.org/wiki/David_Harding_(financier))_

**William Eckhardt.** „The success rate of trades is the **least important** performance statistic and
may even be inversely related to performance.“ → **НЕ оптимизирай win-rate.** Риск ≤2%/сделка. _(https://macro-ops.com/william-eckhardts-market-wizard-trading-strategy-explained/)_

---

## 2. Макро / дискреционни майстори на риска

**Paul Tudor Jones.** Защита преди атака. Цели **~5:1** риск/печалба („risking one dollar to make
five“) → може да греши 80% и пак да не губи. „I am always thinking about **losing** money.“ ·
„Don't be a hero. Don't have an ego.“ Базов филтър: **200-дневна пълзяща средна** (под нея → защита,
изход). Реже губещи веднага, **не** осреднява надолу. Честно: **фалирал на памук ~1979**; фонд надолу
2016–17. _(https://mebfaber.com/2014/11/06/paul-tudor-jones-on-the-200-day-moving-average/ · https://tradersmastermind.com/paul-tudor-jones-nearly-went-bust/)_

**Stanley Druckenmiller.** „It's not whether you're right or wrong… but **how much you make when
right and how much you lose when wrong**.“ Концентрация при висока увереност + капитал-презервация.
Честно: през 2000 наруши правилата си (FOMO), купи ~$6B tech на върха, **загуби ~$3B за 6 седмици** —
„emotional basket case; couldn't help myself.“ Провалът беше **емоционален, не аналитичен**. _(https://novelinvestor.com/stan-druckenmillers-worst-mistake-ever/)_

**George Soros.** Reflexivity: пазарите не клонят към равновесие; вярванията менят фундамента (boom-bust).
„**I'm only rich because I know when I'm wrong.**“ · „recognising my mistakes is a source of pride.“
Бърза, беземоционална реверсия. Честно: загуби 1987 (~$800M), 1998 Русия (~$2B), 2000 tech (~−22% Q1). _(https://www.georgesoros.com/2014/01/13/fallibility-reflexivity-and-the-human-uncertainty-principle-2/ · https://en.wikipedia.org/wiki/Soros_Fund_Management)_

**Bruce Kovner.** „I know where I'm getting out **before** I get in.“ Стоп на ниво, което **доказва,
че сделката греши** (не произволна сума); **размерът се извежда от стопа**. „**Undertrade, undertrade,
undertrade** — cut it at least in half.“ „Novices trade 3–5× too big… should take 1–2% risk.“
„If you personalize losses, you can't trade.“ _(https://www.newtraderu.com/2020/08/04/market-wizard-bruce-kovner-trading-quotes/)_

**Ray Dalio.** „**Holy Grail**“: 15–20 **некорелирани** доходни потока → ~80% по-малко риск при същата
доходност. **Корелацията е ключът**, не броят. „He who lives by the crystal ball will eat shattered
glass.“ Формула: **Pain + Reflection = Progress.** Честно: 1982 почти фалира (свръх-увереност); Pure
Alpha на загуба 2020. _(https://macro-ops.com/ray-dalio-portfolio-allocation-strategy-holy-grail/ · https://ritholtz.com/2017/12/dalio-fine-art-failure/)_

---

## 3. Кванти / статистически едж

**Jim Simons / Renaissance.** „We don't override the models.“ Едж ~**50.75%** правота, но през
**милиони** сделки. През авг. 2007 губи $1B за дни — **не пипат** модела, годината +85.9%.
⚠ Medallion е **изключение**, не норма — практически неповторим. _(http://wavefunction.fieldofscience.com/2021/06/jim-simons-we-never-override-computer.html)_

**Ed Thorp — Kelly criterion.** Оразмеряване по едж:
- Бинарно: `f* = p − q/b = (bp − q)/b`
- Непрекъснато: `f* = (μ − r) / σ²` (= Sharpe/σ)
- Kelly максимизира `E[log(богатство)]` = **геометричния** растеж.
- **Дробен Kelly (½ или ¼):** half-Kelly дава ~75% от растежа при ~¼ от дисперсията; над Kelly →
  по-нисък растеж И по-висок риск; при 2× Kelly растежът → 0. **Variance drag:** `g ≈ μ − σ²/2`
  (волатилността влиза с квадрат и минус). `p, μ, σ` са оценки с грешка → дробен Kelly е буфер срещу
  модел-грешка и risk of ruin. „If you bet too much, you'll almost certainly be ruined.“ _(https://en.wikipedia.org/wiki/Kelly_criterion · https://gwern.net/doc/statistics/decision/2006-thorp.pdf)_

**Cliff Asness / AQR.** Очаквай да реализираш ~**половината** от ин-сампъл бектеста (overfitting е
презумпция). Разходите са част от едж-а (моментум ~0.7%/год large-cap). Некорелирани фактори заедно
(value+momentum) са по-издръжливи. _(https://www.aqr.com/-/media/AQR/Documents/Insights/White-Papers/The-Case-for-Momentum-Investing.pdf)_

---

## 4. Психология и position sizing (правила > воля)

**Mark Douglas („Trading in the Zone“).** Мисли във **вероятности**: всяка сделка е една от много,
изходът ѝ е случаен; едж = само по-висока вероятност. 5 истини: всичко може да се случи; не ти трябва
да знаеш следващото; печалби/загуби са случайно разпределени; едж = индикация, не сигурност; всеки
момент е уникален. _(https://tradethatswing.com/key-takeaways-from-trading-in-the-zone-by-mark-douglas/)_

**Van K. Tharp — expectancy + R.** `R` = първоначален риск (entry→stop). Загуба = −1R, цели много-R.
- `E[R] = p × AvgWinR + (1−p) × AvgLossR` — печелиш при **E[R] > 0** върху достатъчна извадка.
- Size: `Position = (Account × Risk%) / |Entry − Stop|`. Sizing-ът, не входът, е ключът. _(https://vantharpinstitute.com/tharp-think-trading-concepts/)_

**Jesse Livermore (фалирал 4 пъти).** Знанието без наложена дисциплина не стига: over-leverage/all-in,
осредняване надолу, отклонение от правилата. „Never average down. Don't over-trade.“ _(https://macro-ops.com/jesse-livermores-strategy-flaw-position-sizing/)_

**Механична неутрализация на грешки (машина > крехка воля):**
| Грешка | Неутрализация в код |
|---|---|
| Disposition (държиш губещи) | стоп+таргет зададени **преди** входа; изход само на предефинирани нива |
| Revenge trading | cooldown след загуба + **дневен loss limit** → kill-switch |
| Over-trading | лимит сделки/ден; вход само при пълен сигнал |
| Местене на стоп надолу | **забранено**; стоп само нагоре (trailing) |
| All-in / over-leverage | фиксиран риск%/сделка + таван на експозиция |
| Averaging down | забранено правило |
_(https://enlightenedstocktrading.com/disposition-effect-in-trading/ · https://www.newtraderu.com/2024/01/24/position-sizing-lessons-for-risk-management/)_

---

## Синтез — 10-те закона на „Трейдъра“ (кодируеми)

1. **Оцеляването е първо.** Едж без оцеляване = 0 (Thorp, Buffett). Kill-switch, лимити, стоп винаги.
2. **Риск-фиксиран размер, не капитал-фиксиран.** `qty = (risk% × equity) / |entry−stop|` (Tharp, Kovner, Turtles).
3. **ATR/N стоп и sizing.** Нормализирай риска между активи; стоп ~2N (Turtles).
4. **Стопът се задава ПРЕДИ входа, на ниво, което доказва грешка** (Kovner). Няма вход без стоп.
5. **Никога не мести стоп надолу; никога не осреднявай надолу** (Livermore, psychology).
6. **Асиметрия > hit-rate.** Реж загуби, язди печалби; НЕ оптимизирай win-rate (Seykota, Eckhardt).
7. **Дробен Kelly (¼–½), никога над Kelly** — variance drag те убива (Thorp).
8. **Диверсификация по НЕкорелирани потоци** + таван на корелирана експозиция (Dalio, Turtles).
9. **Признавай грешката бързо = изход.** „Rich because I know when I'm wrong“ (Soros, PTJ, Druckenmiller).
10. **Без ego / discretion override.** Следвай системата; дисконтирай бектеста наполовина; разходите в бектеста; учи от журнала (Simons, AQR, Dalio „Pain+Reflection=Progress“).

⚠ **Не е инвестиционен съвет.** Всички горе имат реални загуби; едж-ите отслабват; минало ≠ бъдеще.
Тествай walk-forward + testnet преди реален капитал.
