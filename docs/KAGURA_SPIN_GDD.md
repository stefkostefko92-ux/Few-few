# KAGURA SPIN

**神楽スピン — Realm of Spirits**

Game Design Document & Пазарно проучване
Anime social-casino / build-raid игра за iOS и Android

> **Версия 1.0** (working draft) · Юни 2026
> **Codename:** KAGURA · **Поверително**
> Created and Designed by Carbon Stealth VCC

---

## Съдържание

0. [Критични констатации преди инвестиция](#0-критични-констатации-преди-инвестиция)
1. [Executive Summary](#1-executive-summary)
2. [Пазарно проучване](#2-пазарно-проучване)
3. [Концепция и свят](#3-концепция-и-свят)
4. [Core gameplay loop](#4-core-gameplay-loop)
5. [Детайлна логика и механики](#5-детайлна-логика-и-механики)
6. [Икономика на играта](#6-икономика-на-играта)
7. [Retention и LiveOps](#7-retention-и-liveops)
8. [Монетизация](#8-монетизация-коректна-архитектура)
9. [Арт направление](#9-арт-направление-anime)
10. [Аудио](#10-аудио)
11. [Техническа архитектура](#11-техническа-архитектура)
12. [Юридическо и съответствие](#12-юридическо-и-съответствие)
13. [Продукция, екип и бюджет](#13-продукция-екип-и-бюджет)
14. [KPI и аналитика](#14-kpi-и-аналитика)

---

## 0. Критични констатации преди инвестиция

Тази секция е най-важната в документа. Три неща в първоначалното задание са технически или юридически неточни и трябва да бъдат решени, преди да се похарчи и един лев за разработка.

### 0.1 Плащанията не могат да минават през Stripe/Apple Pay/Google Pay както е заложено

За продажба на дигитална валута в апа (spins, монети, gems, gacha призовавания) Apple и Google задължават използването на native билинг — **StoreKit 2** (iOS) и **Google Play Billing** (Android). Apple Pay и Google Pay **НЕ** са билинг системи за дигитални стоки — те са card-on-file процесори за физически стоки и услуги (такси, доставки, билети). Насочване на потребител към Stripe checkout за дигитална стока е директно нарушение на App Store Review Guidelines и води до отхвърляне/премахване на апа.

Единственото изключение след делото *Epic v. Apple* (май 2025) и DMA в ЕС: в САЩ и ЕС е разрешен external web-checkout link, при определени условия (в ЕС — често не можеш да предлагаш едновременно native IAP и external в същия регион). Извън US/EU/Korea/Japan native IAP остава задължителен глобално.

**Правилната монетизационна архитектура** (детайли в Раздел 8):

- **Baseline глобално:** native IAP — StoreKit 2 + Google Play Billing.
- **US/EU bonus:** опционален Stripe web-shop (по-добър margin), интегриран през RevenueCat като cross-platform entitlement слой.
- **Apple Pay / Google Pay** се ползват само като network tokens ВЪТРЕ в Stripe web-checkout-а, не като самостоятелен in-app билинг.

### 0.2 Coin Master не е "casual" — регулаторно е social casino (18+)

Жанрът, който искаш да копираш (spin → build → raid с paid random items), попада под най-строгата категория. PEGI класифицира social casino като 18+, а игри с loot boxes — минимум 16+. ЕС подготвя **Digital Fairness Act**, който се очаква да забрани gambling-like механики в игри, достъпни за непълнолетни (предложение Q3/Q4 2026). Полша внесе законопроект (дек. 2025) за вкарване на "игри за виртуални предмети" в Закона за хазарта.

**Практически изисквания, които вграждаме от ден едно** (Раздел 12):

- Age-gate 18+ при първо стартиране, без dark patterns към малолетни.
- Публикувани drop rates + pity timer за всеки gacha banner (изискване в редица юрисдикции).
- "Includes Paid Random Items" disclosure на store страницата.
- Self-exclusion, spending limits и cooling-off механизми (също маркетингов плюс срещу регулатора).
- GDPR от старта — Carbon Stealth е ЕС субект; данните на играчите са лични данни.

### 0.3 Това не е "един VPS" проект

Server-authoritative икономика + receipt validation + matchmaking за raids + leaderboards за стотици хиляди потребители не се хоства на единичния VPS `178.104.77.242`. За soft-launch е достатъчен managed Postgres + Redis + контейнери с autoscale; за глобален launch е нужна реална облачна инфраструктура. Single-VPS-ът остава добър за вътрешни tools и dashboard, не за game backend на скала.

> Останалата част от документа приема горните три корекции като взети. Геймплеят, цветовете, логиката и арт направлението не зависят от тях и са разписани в пълен детайл по-долу.

---

## 1. Executive Summary

KAGURA SPIN е free-to-play мобилна игра за iOS и Android, която пренася доказания loop на Coin Master (spin → build → attack → raid → collect) в anime fantasy свят на летящи небесни острови. Към него добавяме слой, който Coin Master няма и който anime аудиторията обича: колекциониране на anime spirit-companions (леко gacha), clan co-op и сюжетни глави с anime cutscenes. Това дава по-силна емоционална привързаност и по-висок retention от чистата slot механика.

### 1.1 Защо този жанр

- Coin Master надхвърли $6 млрд. lifetime приходи (към авг. 2024) и прави ~$1.2 млрд. годишно; жанрът "coin looter" вече е поле за повече играчи.
- Revenue-per-download (RPD) на жанра е ~$27 (2025) — изключително висок за casual.
- Anime естетиката е недостатъчно експлоатирана в този конкретен loop — повечето coin-looter-и са cartoon (Coin Master) или board-game (Monopoly GO). Това е нашата диференциация.

### 1.2 Целеви метрики (soft-launch цели)

| KPI | Цел soft-launch | Бенчмарк жанр |
|---|---|---|
| D1 retention | 38–42% | ~40% (топ casual) |
| D7 retention | 16–20% | ~18% |
| D30 retention | 7–10% | ~8% |
| Conversion (payer %) | 2.5–4% | 3–5% social casino |
| ARPDAU | $0.12–0.20 | $0.15+ |
| RPD (eventual) | $15–25 | $27 жанр |

> Метриките са цели, не обещания. LTV в този жанр се гради от LiveOps и UA, не от първоначалния build. Бюджетът за user acquisition е по-голямата инвестиция от самата разработка (Раздел 13).

---

## 2. Пазарно проучване

### 2.1 Coin Master — деконструкция

Coin Master (Moon Active, 2016) е social casino игра: spin на слот машина дава ресурси, с които строиш и ъпгрейдваш село, а raid и attack ти позволяват да крадеш ресурси от други играчи. Loop-ът смесва idle механики, gacha (картови колекции) и PvP саботаж в изключително "лепкав" и монетизируем цикъл.

| Показател | Стойност |
|---|---|
| Lifetime приходи | $6 млрд.+ (авг. 2024), ~$4.9 млрд. lifetime player spend (Statista) |
| Годишни приходи | ~$1.2 млрд. |
| 1H 2025 приходи | ~$385 млн. |
| MAU | ~8.9 млн. |
| Изтегляния | ~356 млн. lifetime |
| IAP диапазон | $1.99 – $99.99 |
| Топ пазар | САЩ (особено в App Store) |
| Демография | възрастни (adult-oriented casual) |

**Какво прави loop-а лепкав**

- 50 безплатни spins в началото — точно колкото да "залепят" играча, преди да усети стената.
- Spins като енергия с регенерация — естествен daily return + точка за монетизация (купи още spins).
- Социален саботаж (raid/attack) — чуждите загуби са твоите печалби; създава отмъщение и FOMO.
- Картови колекции с trade между приятели — мрежов ефект и органичен растеж.
- Безкраен прогрес (400+ села) — няма "край", винаги има следваща цел.

### 2.2 Конкурентен пейзаж 2025–2026

Жанрът се фрагментира — от дуопол (Coin Master + Monopoly GO) към множество претенденти (Carnival Tycoon, Animals & Coins и др.), докато RPD леко спада ($29 → $27). Това е сигнал: пазарът поема нови теми, influencer launches и country-specific версии. Anime темата е точно такъв незает ъгъл.

| Игра | Тема | Loop | Урок за нас |
|---|---|---|---|
| Coin Master | Cartoon пиратско/village | spin-build-raid-cards | Еталон; ние сменяме арт + добавяме companions |
| Monopoly GO | Board game / Monopoly IP | dice-board-build | Силата е в IP бранда; ние нямаме IP → залагаме на арт + story |
| Carnival Tycoon | Carnival/tycoon | spin-build | По-плитко; показва, че пазарът поема клонинги |
| Animals & Coins | Animal cartoon | spin-raid | Доказва, че смяна на тема работи |

### 2.3 Защо anime + spirit-companions

- Anime аудиторията плаща за колекциониране и "привързаност към персонаж" (виж gacha пазара) — добавяме мета-слой върху coin-looter loop-а.
- Визуална диференциация в App Store thumbnail/видео — anime арт изпъква сред cartoon конкурентите.
- Cross-промоция към anime общности, influencer launches (TikTok/YouTube), country spins (JP, BG, IT).
- Story chapters дават не-RNG прогрес → намалява усещането за чист хазарт, помага и регулаторно.

---

## 3. Концепция и свят

### 3.1 Pitch (едно изречение)

> "Въртиш Духовното колело, събираш ками-енергия, изграждаш своя небесен остров, нападаш и обираш островите на други играчи и призоваваш anime духове-спътници, които ти дават сили и история."

### 3.2 Сетинг

Светът **Takama** (高天 — "високо небе") е архипелаг от летящи острови над безкрайно облачно море. След "Разломът" островите се откъсват и духовете (ками) се разпръскват. Играчът е млад "каннуши" (пазител на светилище), който възстановява родовия си остров, призовава обратно духовете и се изправя срещу съседни кланове за ресурси.

### 3.3 Стълбове на дизайна

1. **Лесно за научаване, дълбоко за майсторене** — едно завъртане, но дълъг мета-слой.
2. **Всяко завъртане е "juicy"** — визуален и звуков feedback при всеки spin (виж Раздел 9–10).
3. **Социалното е горивото** — приятели, кланове, raid/attack, leaderboard.
4. **Привързаност чрез персонажи** — companions с личност, реплики и история.
5. **Честна монетизация** — без насочване към малолетни, прозрачни шансове (Раздел 12).

### 3.4 Working title и бранд

- **Codename:** KAGURA (神楽 — свещен ритуален танц за духовете)
- **Финално име:** подлежи на EUIPO trademark clearance (Carbon Stealth pattern) преди публичен анонс — да не се харчи за лого/ASO преди clearance
- **Домейн за web-shop/landing:** `kagura.carbonstealth.eu` (или собствен .game домейн за бранд)

---

## 4. Core gameplay loop

Минутният loop, който играчът повтаря десетки пъти на сесия:

1. Играчът има spins (енергия). Натиска **SPIN** → Духовното колело се завърта (3 reels).
2. Резултатът дава: монети, щитове, атака, raid или духовна енергия (детайли 5.1).
3. С монети играчът строи/ъпгрейдва сграда на острова си (5.4).
4. При **Attack** символ — напада случаен/таргетиран остров, чупи сграда, печели монети.
5. При **Raid** символ — мини-игра: копае на чужд остров за скрити монети.
6. Завършен остров → отключва следващ остров (безкраен прогрес).
7. Натрупаната духовна енергия → призоваване на companion (gacha слой, 5.6).

**Макро-loop (дневен/седмичен):** daily login streak → spin tournaments → clan wars → seasonal story event → limited banner. Цел: винаги да има "следващо нещо" и причина да се върнеш утре.

> **Дизайн принцип:** 80% от завъртанията дават малка положителна емоция (монети/щит), ~15% средна (raid/attack), ~5% голяма (jackpot/spirit). Това е класическата variable-ratio schedule, която прави loop-а лепкав — и точно затова е регулирана (Раздел 12).

---

## 5. Детайлна логика и механики

### 5.1 Духовното колело (слот машина)

3 reels, всеки спира на 1 от 5 символа. RNG е **СЪРВЪРНО-АВТОРИТЕТЕН** — клиентът праща "spin", сървърът връща резултата; клиентът само анимира. Никога не се вярва на клиента за изхода (анти-чийт, Раздел 11).

**Символи и тегла на барабана**

| Символ | Иконка | Тегло на reel | Шанс/reel | Ефект при 3× |
|---|---|---|---|---|
| Coin (монета) | 🪙 | 38 | 38% | Jackpot монети |
| Ward (щит) | 🛡️ | 24 | 24% | +3 щита (cap 5) |
| Strike (атака) | ⚔️ | 18 | 18% | Атака на чужд остров |
| Raid (обир) | 🦊 | 14 | 14% | Raid мини-игра |
| Spirit (дух) | ✨ | 6 | 6% | Spirit summon tokens |

> Сборът на теглата = 100 (за яснота). Реалните тегла се държат в LiveOps конфиг и се тунинговат без нов app release.

**Payout таблица (3 reels, независими)**

| Резултат | Вероятност (прибл.) | Награда (на bet=1 spin) |
|---|---|---|
| 3× Coin | 0.38³ ≈ 5.5% | Голям coin jackpot (×базова стойност × множител на острова) |
| 3× Ward | 0.24³ ≈ 1.4% | +3 щита (до cap) |
| 3× Strike | 0.18³ ≈ 0.58% | Атака (силна) + бонус монети |
| 3× Raid | 0.14³ ≈ 0.27% | Raid мини-игра (3 от 4 копки) |
| 3× Spirit | 0.06³ ≈ 0.02% | 10× spirit tokens (rare) |
| 2× който и да е | ~varies | Частична награда (½ от 3×, scaled) |
| Mix (без двойка) | остатък | Малки монети = брой Coin символи × базова стойност |

**Bet multiplier (×1 … ×50):** играчът качва залога → харчи повече spins наведнъж, печалбите се множат. Това е ключов sink за spins и ускорител на монетизацията — но и рисков фактор за регулатора; държим cap и spending limits.

**Pseudocode на spin (server-authoritative)**

```typescript
// POST /spin  { betMultiplier }   — Express 5 + TS, server-authoritative
async function spin(userId: string, bet: number) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.player.findUniqueOrThrow({ where: { id: userId } });
    bet = clamp(bet, 1, user.maxBet);                 // anti-tamper
    if (user.spins < bet) throw new InsufficientSpins();

    const reels = [drawReel(), drawReel(), drawReel()]; // CSPRNG, weighted
    const outcome = resolve(reels, bet, user.villageMultiplier);

    await tx.player.update({ where: { id: userId }, data: {
      spins: { decrement: bet },
      coins: { increment: outcome.coins },
      shields: clampInc(user.shields, outcome.shields, 5),
      spiritTokens: { increment: outcome.spiritTokens },
    }});
    await tx.ledger.create({ data: ledgerEntry(userId, 'SPIN', outcome) }); // audit
    if (outcome.type === 'ATTACK') await queueAttack(tx, userId, bet);
    if (outcome.type === 'RAID')   await openRaid(tx, userId);
    return { reels, outcome };       // client only animates this
  });
}

function drawReel(): Symbol {        // weighted CSPRNG, weights from LiveOps
  const w = liveops.reelWeights;     // {coin:38, ward:24, strike:18, raid:14, spirit:6}
  const roll = secureRandomInt(0, sum(w));   // crypto.randomInt, NOT Math.random
  return pickByWeight(w, roll);
}
```

### 5.2 Spins като енергия

| Параметър | Стойност | Бележка |
|---|---|---|
| Регенерация | 5 spins / час | 1 spin / 12 мин |
| Cap (натрупване) | 50 spins | над cap не регенерира (push да играеш) |
| Стартов бонус | 75 spins | малко повече от Coin Master за hook |
| Daily login | 10–40 spins (streak) | виж 7.1 |
| От приятели | до 100/ден | социален източник |
| IAP | пакети | виж Раздел 8 |

### 5.3 Attack логика

При 3× Strike играчът избира една сграда на чужд остров (от подадени от matchmaking кандидати). Ако защитникът има щит — щитът поглъща атаката (−1 shield), няма щета. Иначе сградата пада с 1 ниво и атакуващият печели монети ∝ нивото на сградата.

```javascript
attackReward = baseAttack * targetBuildingLevel * villageMultiplier;
if (defender.shields > 0) { defender.shields -= 1; reward = 0; logEvent('BLOCKED'); }
else { defender.building[idx].level -= 1; attacker.coins += attackReward; }
// revenge: defenderъ получава 'revenge' опция за 24h (retention hook)
```

### 5.4 Raid мини-игра

При 3× Raid атакуващият получава екран с 4 "копки" на чужд остров; избира 3. Под тях има скрити монети (предварително детерминирани сървърно, за да не може клиентът да "пробва"). Награда ∝ натрупаните монети на жертвата (cap-нато, за да не "опразва"), множено по village multiplier.

> Raid взема % от незащитените монети на жертвата → силен стимул жертвата да харчи монети веднага (sink) и да държи щитове (друг sink/монетизация).

### 5.5 Прогрес на острови (build loop)

Всеки остров има 5 сгради × 5 нива. Завършването на всичките отключва следващия остров с по-висок village multiplier (печалбите и цените скалират). Безкраен прогрес → няма таван на retention.

| Остров # | Village multiplier | Цена за завършване (≈ монети) | Тема |
|---|---|---|---|
| 1 — Родово светилище | ×1 | ~6 000 | Tutorial, sakura |
| 2 — Пазарът на фенери | ×1.6 | ~14 000 | Festival нощ |
| 5 — Драконов хребет | ×6 | ~120 000 | Планина/гръм |
| 10 — Лунен дворец | ×40 | ~1.2 млн. | Lunar/звезди |
| N … | геометрично | геометрично | сезонни теми |

```javascript
buildingCost(island, building, level) =
  baseCost * costGrowth^(globalLevel);   // globalLevel = (island*5)+building*…
// costGrowth ≈ 1.18–1.25 (тунинг). Spin yield расте по-бавно от cost →
// контролиран gap, който монетизацията запълва. Балансира се в xlsx модел.
```

### 5.6 Companions (spirit collection — gacha слой)

Spirit tokens → призоваване на anime духове-спътници. Companions дават пасивни бонуси (напр. +% coin yield, +1 raid копка, по-бавно харчене на щитове) и носят сюжет. Това е мета-прогресът, който задържа играча отвъд слота.

**Rarity и шансове (ПУБЛИКУВАНИ — регулаторно изискване)**

| Rarity | Drop rate | Pity | Ефект |
|---|---|---|---|
| ★3 Common | 78% | — | малък бонус (+1–2% yield) |
| ★4 Rare | 18% | — | среден бонус + реплики |
| ★5 Epic | 3.5% | гарант на 50-о теглене | силен бонус + mini-story |
| ★6 Mythic (banner) | 0.5% | гарант на 90-о теглене | уникален + сюжетна глава |

> Pity timer (гарантиран ★6 на 90-о теглене) и публикувани шансове са **ЗАДЪЛЖИТЕЛНИ** в редица юрисдикции (Япония, Китай и др.) и силно намаляват регулаторния и PR риск. Не са опция.

```javascript
// gacha pull — server-authoritative, seeded + audit log
function pull(player): Spirit {
  player.pityCounter++;
  if (player.pityCounter >= 90) { player.pityCounter = 0; return rollMythic(); }
  const r = secureRandom();                      // [0,1)
  if (r < 0.005) { player.pityCounter = 0; return rollMythic(); }
  if (r < 0.040) return rollEpic();
  if (r < 0.220) return rollRare();
  return rollCommon();
}
```

---

## 6. Икономика на играта

### 6.1 Валути

| Валута | Тип | Източници | Sinks |
|---|---|---|---|
| Spins | енергия (soft) | regen, login, приятели, IAP | завъртания, bet multiplier |
| Coins | soft | spins, raid, attack | строеж/ъпгрейд сгради |
| Spirit tokens | gacha валута | 3× Spirit, събития, IAP | призоваване companions |
| Gems | hard (premium) | САМО IAP + малко безплатно | купуване spins/tokens/щитове, skip |
| Event tokens | сезонни | event действия | event магазин (timeboxed) |

> Двойно-записна (double-entry) ledger таблица за ВСЯКА валутна транзакция — задължително за анти-чийт, refund handling и финансов одит. Никога не се коригира баланс директно без ledger ред.

### 6.2 Принципи на балансиране

- Source/sink диаграма да е нетно леко дефицитна за coins (контролиран gap → монетизация), но никога frustrating рано (D0–D3 щедри).
- Gems никога не падат щедро безплатно — иначе се срива целият premium слой.
- Spin yield расте по-бавно от building cost (geometric) → естествена крива на трудност.
- Всичко (тегла, цени, payouts, drop rates) е в LiveOps конфиг, не hard-coded → тунинг без release.

### 6.3 Икономически модел (deliverable)

Преди първа линия код се прави `.xlsx` икономически модел: source/sink на coin/spin/gem по ден, симулация на 1000 виртуални играчи (whales/dolphins/minnows/free), и крива на progression vs paywall. Това е отделен deliverable.

---

## 7. Retention и LiveOps

### 7.1 Daily / навикови системи

| Система | Механика | Цел |
|---|---|---|
| Login streak | ден 1→7 нарастваща награда (10→40 spins), reset при пропуск | daily return |
| Free spins timer | напомняне при пълен cap | анти-overflow, return |
| Daily quests | напр. "направи 3 raid-а" → spins/tokens | session length |
| Push notifications | "нападнаха те!", "спиновете ти са пълни" | re-engagement |

> Login streak и daily rewards вече тригерват минимум PEGI 7 descriptor под новите PEGI "interactive risk" критерии — комбинирани с paid random items ни държат на 18+. Дизайнът на нотификациите да НЕ симулира спешност спрямо малолетни.

### 7.2 Социални и компетитивни

- **Кланове** (до 50 души): clan chat, clan war (кооп цел срещу друг клан), споделяне на spins.
- **Leaderboards:** Redis sorted sets — глобален, клан, приятели; седмичен reset с награди.
- **Friends:** покани (deep link), изпращане на spins, raid между приятели (с лимит).

### 7.3 Сезонни събития (LiveOps календар)

| Тип събитие | Период | Hook |
|---|---|---|
| Spin tournament | 24–48ч | класиране по spins/печалби → награди |
| Raid madness | weekend | ×2 raid reward → spin sink |
| Story chapter | месечно | anime сюжет + ★6 banner |
| Limited banner | 2 седмици | rate-up на сезонен companion + pity |
| Sakura/Obon/Lunar | сезонно | тематичен остров + скин магазин |

> LiveOps конфигът е сървърен (JSON schema, validated със zod), управляван от admin dashboard — събитията се пускат без app release.

---

## 8. Монетизация (коректна архитектура)

### 8.1 Payment архитектура

| Слой | Технология | Регион | Бележка |
|---|---|---|---|
| iOS native | StoreKit 2 IAP | глобално | задължителен baseline |
| Android native | Google Play Billing | глобално | задължителен baseline |
| Web-shop (margin) | Stripe checkout | US + EU | external link, само където е позволено |
| Entitlement слой | RevenueCat | всички | обединява IAP+web, server receipt validation |
| Apple Pay / Google Pay | вътре в Stripe | US/EU web | като network token, НЕ in-app билинг за дигитално |

> RevenueCat дава cross-platform entitlements, A/B тест на paywall и server-side receipt validation. Никога не отключвай платено съдържание само от client callback — винаги верифицирай receipt-а сървърно (Apple/Google server API + RevenueCat webhook → твоя ledger).

### 8.2 IAP каталог (диапазон $1.99–$99.99)

| Продукт | Цена (€) | Тип | Бележка |
|---|---|---|---|
| Spin pack S/M/L/XL | 1.99 / 4.99 / 19.99 / 99.99 | consumable | ядрото на приходите |
| Coin pack | 2.99 – 49.99 | consumable | за бързо завършване на остров |
| Gem pack | 0.99 – 99.99 | consumable | premium валута |
| Starter bundle | 4.99 (еднократно) | one-time | висок conversion, само ден 1–3 |
| VIP pass (subscription) | 7.99 / месец | auto-renew | +spin cap, дневни gems, ad-free |
| Season pass (battle pass) | 9.99 / сезон | non-consumable/seasonal | free+premium track |
| Spirit banner bundle | 19.99 – 49.99 | consumable | tokens + гарантиран ★5 |

> Battle pass и time-limited offers са PEGI 12 без активиране; в комбинация с paid random items оставаме 18+. Под PEGI може да паднеш до 7, ако харченето е заключено до родителско активиране — неприложимо при нашата 18+ аудитория, но показва логиката.

### 8.3 LiveOps оферти

- Сегментирани оферти по поведение (RFM): minnow → малки $; whale → high-tier bundles.
- Триггерни оферти: "почти завърши острова" → coin pack; "изгуби raid" → shield pack.
- Лимитирани по време (timeboxed), с честни таймери — не fake countdown.

### 8.4 Реклами (вторичен поток)

- Rewarded video (AdMob/AppLovin MAX): "гледай за +5 spins" — opt-in, не interstitial spam.
- Без реклами за VIP абонати; никога forced ads, които убиват retention в social casino.

---

## 9. Арт направление (anime)

### 9.1 Стил

Чист cel-shaded 2D anime: изразителни големи очи, мека градиентна светлина, festival/fantasy палитра, плавни Spine скелетни анимации. Тон между "уютно" (Coin Master приятелска енергия) и "празнично fantasy" (фенери, sakura, духове). Не realism, не chibi-only — stylized anime с характер.

### 9.2 Цветова палитра (game brand, не корпоративна)

| Роля | Цвят | HEX | Употреба |
|---|---|---|---|
| Primary — Sakura | розово | `#FF6FA5` | лого, CTA, акценти |
| Primary — Gold | злато | `#FFC94D` | монети, награди, jackpot |
| Secondary — Sky | циан | `#4ECDC4` | небе, UI hover, вода |
| Secondary — Night | индиго | `#2A1A4A` | фон, нощни острови |
| Accent — Spirit | лилаво | `#9B5DE5` | духове, gacha, magic FX |
| Accent — Ember | оранж | `#FF7A45` | атака, energy, alert |
| Neutral — Cream | крем | `#FFF6E9` | карти, панели, текст фон |
| Neutral — Charcoal | графит | `#2D2A32` | основен текст |
| Semantic — Success | зелено | `#4ADE80` | build success, печалба |
| Semantic — Attack | червено | `#FF5470` | щета, загуба, raid |
| Semantic — Shield | синьо | `#5BC0EB` | щитове, защита |

> Контрастите да минават WCAG AA за текст (charcoal върху cream = OK). Цветовете на наградите (gold) и щетата (red/blue) са консистентни в целия UI за моментално четене.

### 9.3 Типографика

- **Display (заглавия/числа):** заоблен "anime" дисплей шрифт — напр. Mochiy Pop / Baloo 2 (Google Fonts, безплатен търговски лиценз) + латиница/кирилица поддръжка.
- **Body/UI:** чист хуманистичен sans (Inter / Noto Sans) с кирилица за BG локал.
- **JP акценти:** Noto Sans JP за японски декоративни елементи.

> Лицензите се проверяват преди интеграция — само шрифтове с разрешен embedding в игра. Никога paid font без app-license.

### 9.4 UI/UX принципи (Coin Master школа)

- Голями tap targets (≥48dp), минимален текст, иконки-водачи (pointing finger onboarding).
- Един главен екран (островът), spin бутон долу-център, магазин достъпен от home icon + меню.
- "Juice": screen shake при jackpot, particle burst, coin rain, haptic feedback.
- Прогрес винаги видим (остров %, следваща цел) — никога играчът да не се чуди "какво сега".

### 9.5 Анимационен pipeline

- **Skeletal 2D:** Spine (Esoteric) или DragonBones (безплатен) за companions и mascot. Runtime в Unity.
- **Slot reels:** spine/sprite-sheet + tween (DOTween) за spin/stop ease с anticipation на последния reel.
- **VFX:** Unity particle system / shader graph за spirit glow, ember, sakura падане.
- **Asset pipeline:** Aseprite/Photoshop → Spine → Unity Addressables (за download-on-demand, малък initial APK).

---

## 10. Аудио

- **BGM:** upbeat J-pop/festival луп за home; по-епичен за clan war/event; lo-fi за магазин.
- **SFX:** "juicy" spin click, reel stop tick, coin cascade, shield clang, raid dig, summon chime.
- **Variable reward audio:** jackpot и ★6 summon имат уникален, по-богат звук (засилва dopamine loop).
- **Voice barks (опц.):** кратки JP реплики на companions при summon/победа — autenticност, не скъпо.
- **Тех:** FMOD или Unity Audio + addressable аудио банки; ducking на BGM при ключови SFX.

> Цялата музика/SFX да е лицензирана за търговска игра (custom композитор или royalty-free с game license). Никога ripped аниме саундтрак — copyright + DMCA риск.

---

## 11. Техническа архитектура

### 11.1 Клиент

- **Engine:** Unity 6 (C#) — default за cross-platform mobile на скала, зрели IAP/ads SDK. Алтернатива: Godot 4.6 (MIT, нула роялти, StoreKit 2 + Google Play Billing), ако бюджетът е критичен.
- **Анимации:** Spine/DragonBones runtime.
- **Asset delivery:** Addressables (download-on-demand, малък initial install).
- **Networking:** HTTPS REST за повечето действия + WebSocket за clan chat/realtime.

### 11.2 Backend (Carbon Stealth stack)

Server-authoritative за ВСИЧКО, което носи стойност. Стекът съвпада с твоя стандарт: Node 22 + TypeScript + Express 5, Prisma, PostgreSQL, Redis, BullMQ.

| Сервис | Отговорност | Тех |
|---|---|---|
| Auth | регистрация, JWT (httpOnly), device binding | Express + jose, bcrypt/argon2 |
| Spin/RNG | weighted CSPRNG, server-authoritative outcome | crypto.randomInt, LiveOps weights |
| Economy ledger | double-entry транзакции на всяка валута | Postgres + Prisma tx |
| Matchmaking | кандидати за attack/raid (close MMR/level) | Redis + queue |
| Gacha | seeded pull + pity + audit log | Postgres, append-only log |
| IAP validation | Apple/Google server verify + RevenueCat webhook | RevenueCat + Stripe webhook (signature verify) |
| Leaderboards | глобален/клан/friends, седмичен reset | Redis sorted sets |
| Clans | членство, war state, chat | Postgres + WebSocket |
| LiveOps config | тегла, цени, събития (zod-validated) | Postgres + admin dashboard |
| Analytics | събитиен поток към warehouse | BullMQ → ClickHouse/BigQuery |

### 11.3 Анти-чийт (задължително за social casino)

- Клиентът НИКОГА не решава изход на spin/raid/gacha — само анимира сървърния резултат.
- Всяка мутация на баланс минава през ledger + Prisma транзакция; никога UPDATE без WHERE/idempotency key.
- IAP: server-side receipt validation; отключване само след верифициран receipt; idempotent grant по transactionId.
- Stripe webhook: винаги signature verify; rate limit + anomaly detection на spin честота.
- Rate limiting на auth и публични endpoints; CORS whitelist, никога `*` на prod.

### 11.4 Скалиране и инфраструктура

- **Soft-launch (1 гео):** managed Postgres + Redis + 2–3 контейнера зад nginx/Let's Encrypt, Docker compose.
- **Глобален launch:** managed Postgres (read replicas), Redis cluster, autoscaling за stateless API, CDN за assets.
- **Push:** FCM (Android) + APNs (iOS) през собствен notification service (BullMQ scheduled).
- **Observability:** pino structured logs (никога PII), метрики (Prometheus/Grafana), Sentry.

> Единичният VPS `178.104.77.242` е подходящ за вътрешен admin dashboard и LiveOps конзола — НЕ за game backend на скала. Не планирай продукционен трафик там.

---

## 12. Юридическо и съответствие

### 12.1 Възрастов рейтинг и gambling-like механики

- Social casino → PEGI 18 / ESRB Adults; "Interactive: Includes Paid Random Items" label на store.
- Age-gate 18+ при старт; без UA таргетиране на малолетни; без "креативи" към деца.
- Подготовка за EU Digital Fairness Act (предложение Q3/Q4 2026): дизайн без забранени dark patterns; гъвкав LiveOps да изключи рискови механики по регион.
- Мониторинг на национални закони (Полша, Белгия, Нидерландия) — geo-feature flags за изключване на loot-box продажба там, където е забранена.

### 12.2 Прозрачност на шансовете (gacha)

- Публикувани drop rates за всеки banner (виж 5.6) — in-game и в store описание.
- Pity timer с видим брояч; история на призоваванията достъпна за играча.

### 12.3 Защита на потребителя

- Spending limits (дневен/месечен), cooling-off, self-exclusion опция в настройки.
- Ясни таймери (без fake urgency); refund policy съгласно store правила.
- Native parental controls на iOS/Android се респектират; не се заобикалят.

### 12.4 Данни (GDPR)

- Carbon Stealth е ЕС субект → GDPR изцяло: правно основание, consent за маркетинг/ads ID, DPA с под-обработващи (RevenueCat, ad networks, analytics).
- Право на изтриване/износ; data retention политика; никога PII в логове.
- App Privacy nutrition labels (Apple) + Data Safety form (Google) — точни и пълни.

> Този раздел изисква преглед от юрист, специализиран в gaming/gambling преди launch. Документът дава инженерната рамка, не правен съвет.

---

## 13. Продукция, екип и бюджет

### 13.1 Фази (roadmap)

| Фаза | Срок | Цел / gate |
|---|---|---|
| Pre-production | 1–1.5 мес. | икономически .xlsx модел, art bible, тех prototype на spin |
| Prototype | 1.5–2 мес. | core loop играем (spin-build-raid), grey-box арт, server RNG |
| Vertical slice | 2–3 мес. | 1 остров + 1 companion banner, реален арт, IAP sandbox |
| Production (MVP) | 4–6 мес. | 10 острова, clans, LiveOps конзола, анти-чийт, store compliance |
| Soft-launch | 2–3 мес. | 1–2 гео (напр. PH/CA), тунинг по метрики, UA тест |
| Global launch | — | само ако soft-launch метриките минат gate (Раздел 1.2) |

### 13.2 Минимален екип

1 Game/economy designer · 1–2 Unity client devs · 1–2 backend devs (твоят стек) · 1 anime 2D артист + 1 аниматор (Spine) · 1 UI/UX · part-time: композитор, QA, gaming-юрист, UA маркетинг.

### 13.3 Индикативен бюджет (порядък)

| Перо | MVP до soft-launch | Бележка |
|---|---|---|
| Разработка (екип ~6–8 души) | €150k–€450k | зависи от in-house vs аутсорс, BG/IT ставки |
| Арт (companions, острови, UI, VFX) | €40k–€120k | anime арт е скъп; може поетапно |
| Аудио | €5k–€20k | custom + royalty-free микс |
| Инфра (soft-launch) | €0.5k–€2k / мес. | managed PG/Redis + контейнери |
| Tooling (RevenueCat, ads SDK) | % от приходи | RevenueCat free до праг, после % |
| User Acquisition (критично) | €100k–€1M+ | ТУК е истинският ров на жанра; без UA няма скала |

> **Реалност:** в този жанр печелившият не е този с най-добрия build, а този с най-ефективния UA + LiveOps. Coin Master доминира чрез масивен маркетинг бюджет. Планирай UA като основната, не второстепенната инвестиция.

---

## 14. KPI и аналитика

### 14.1 Ключови метрики

| Категория | Метрики |
|---|---|
| Retention | D1 / D7 / D14 / D30, rolling retention, return frequency |
| Engagement | сесии/ден, дължина на сесия, spins/сесия, DAU/MAU (stickiness) |
| Монетизация | conversion %, ARPDAU, ARPPU, LTV (D30/D90), payer distribution |
| Икономика | coin/spin/gem source-sink баланс, inflation, sink coverage |
| Виралност | K-factor, invites sent/accepted, spins shared |
| UA | CPI, ROAS D7/D30, blended CAC vs LTV |

### 14.2 Аналитичен pipeline

- Събитиен трекинг (spin, build, raid, purchase, summon) → BullMQ → warehouse (ClickHouse/BigQuery).
- Funnels (onboarding, first purchase), cohort retention, A/B тестове на paywall/оферти през RevenueCat.
- Anti-fraud метрики: spin честота, refund rate, chargeback (Stripe), аномалии в баланса.

### 14.3 Definition of Done за soft-launch

- Core loop стабилен (build OK, smoke test, `/health` 200).
- Server-authoritative икономика + receipt validation в prod.
- Store compliance: 18+ rating, paid random items label, публикувани drop rates, privacy forms.
- LiveOps конзола работи (тунинг без release).
- Аналитика тече и метриките са измерими спрямо gate-овете в 1.2.

---

### Следваща стъпка (по избор)

1. `.xlsx` икономически модел с 1000-играч симулация.
2. Детайлен tech spec на backend сервисите с Prisma schema.
3. Art bible с moodboard и companion дизайни.
4. EUIPO trademark проучване за финалното име.

---

*Created and Designed by Carbon Stealth VCC · KAGURA SPIN — GDD v1.0 · Поверително*
