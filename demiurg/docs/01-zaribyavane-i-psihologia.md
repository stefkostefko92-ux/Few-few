# 01 · Какво прави играта „зарибяваща“ — core loops, психология, social, метрики

> Отговор на въпроса „защо Minecraft и Roblox не се пускат“ — с приложими за нас изводи.
> Всяко ключово твърдение носи източник. Етично vs манипулативно е ясно разделено —
> ние строим само етичната половина (виж §5).

---

## 1. Core gameplay loop-ове и emergent геймплей

### Minecraft — loop: **събери → крафтни → построй → оцелей**

- Minecraft е „3D sandbox без задължителни цели“, който дава свобода как да играеш —
  структурата е отворена по замисъл. В Survival играчът събира ресурси, за да крафтва
  блокове/инструменти → ядрото на цикъла. ([Wikipedia](https://en.wikipedia.org/wiki/Minecraft))
- Каноничният loop explore → mine → craft „работи през всички етапи“; всеки оборот дава
  ресурс → по-добър инструмент → достъп до нова зона. Прогресия-стълбица: **wood → stone →
  iron → diamond → netherite**. ([gamedesignskills](https://gamedesignskills.com/game-design/survival/))
- „Основният loop е толкова елегантен, че оцеля 15 години конкуренция“ — простите правила
  оставят въображението да върши тежката работа.

### Roblox — loop: **играй → създай → публикувай → монетизирай**

- Официално: „Core loop = централният геймплей, около който се гради цялото преживяване“;
  има прогресионен двигател, който „движи играчите напред“, за да не стане „повтарящо се и
  плитко“. ([Roblox docs](https://create.roblox.com/docs/production/game-design/core-loops))
- Принцип: **целият core loop трябва да е достъпен безплатно**; ако плащаш, за да достъпиш
  ядрото — „имаш демо с paywall, не стратегия за монетизация“.
  ([Roblox docs](https://create.roblox.com/docs/production/game-design/monetization-foundations))

### Emergent геймплей — прости правила → неограничена сложност

- „Сложни ситуации от взаимодействието на прости механики“, непланирани от дизайнерите.
  ([Wikipedia](https://en.wikipedia.org/wiki/Emergent_gameplay))
- Minecraft redstone = „електричество в играта“ (сигнал 1–15); от него играчите правят
  автоматични ферми, скрити врати, дори **16-битови компютри** — сложност от прости правила.
  ([minecraft.wiki](https://minecraft.wiki/w/Redstone_mechanics))
- Дизайнерската „сладка точка“: **elegant complexity** — малък набор правила с богата
  комбинаторика.

### Процедурна генерация = „безкраен“ свят

- Светът се генерира процедурно от seed (64-битов → 18.4 квинтилиона свята); „случаен, но
  детерминистичен“ → цял свят се споделя само с число. ([minecraft.wiki](https://minecraft.wiki/w/World_generation))

> **➡ За нас:** ядрото е **един стегнат, забавен-сам-по-себе-си loop** (gather→craft→build→
> survive) + **поне една дълбока emergent система** (нашият „redstone“ — виж `05`) + процедурен,
> но **ограничен по мащаб за MVP** свят. Прогресия-стълбица за усещане за растеж.

---

## 2. Психология на задържането (теоретични двигатели)

- **Self-Determination Theory (SDT)** — Ryan, Rigby & Przybylski (2006): възприеманите
  **автономия** и **компетентност** предсказват удоволствие, предпочитание и промяна в
  благополучието. Трите нужди: автономия (избор), компетентност (растящо умение),
  **свързаност** (значими връзки). ([Springer](https://link.springer.com/article/10.1007/s11031-006-9051-8))
- **PENS модел** (същите автори): нуждите се задоволяват от „лесни за овладяване контроли;
  ясна, последователна обратна връзка; избор на цели/стратегии; възможности за кооперативно
  взаимодействие“. ([SDT.org](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/))
- **Поток (Csikszentmihalyi):** максимална ангажираност при **баланс предизвикателство ↔
  умение**; твърде трудно → тревожност, твърде лесно → скука. Sandbox поддържа потока
  по-добре, защото играчът сам настройва трудността и целите.
  ([Game Developer](https://www.gamedeveloper.com/design/the-flow-applied-to-game-design))
- **Ефект на Зейгарник — „само още един ход“:** незавършените задачи създават напрежение,
  което тласка към продължаване. ([Psychology of Games](https://www.psychologyofgames.com/2013/03/the-zeigarnik-effect-and-quest-logs/))
- **Дофаминът е в очакването, не в наградата** — оттук ефектът „само още 5 минути“.
  ([Design Bootcamp](https://medium.com/design-bootcamp/product-design-and-psychology-the-mechanism-of-skinner-box-techniques-in-video-game-design-5b7315e2d7b4))
- **Липсата на фиксиран „печели/губиш“** = играта „просто продължава“; смисълът се
  генерира от играча и не се изчерпва. ([Untold Play](https://untoldplay.medium.com/how-victory-conditions-frame-play-f9b56d93a8a2))

---

## 3. Social & UGC хук — най-силният фактор за задържане

- **Играта с приятели е фактор №1.** Изследване с 51 000+ играчи: социалните връзки стават
  най-силният предиктор за дълголетие. ([arXiv](https://arxiv.org/abs/1702.08005))
- Индустриални бенчмаркове: socially-engaged играчи имат **+11% D1, +77% D7, +153% D30**;
  ~2.7× по-склонни да останат заради усещане за общност. ([Juego Studio](https://www.juegostudio.com/blog/how-to-increase-user-retention-and-increase-your-games-lifetime))
- Roblox работи като **социална мрежа**: ~2.3 ч./ден, ~17.3 млн. нови приятелства/ден,
  ~3 млрд. съобщения/ден; алгоритъмът активно приоритизира социалната активност.
  ([maxpowergaming](https://www.maxpowergaming.co/post/what-drives-roblox-s-incredible-2-3-hour-avg-daily-session-times))

### Мрежов ефект и „безкрайно съдържание при ~нулева цена“

- UGC маховик: повече създатели → повече съдържание → повече играчи → повече създатели.
  Fall Guys получи **230 000 нива за 48 часа** от играчи. ([Naavik](https://naavik.co/deep-dives/the-state-of-ugc-games-2026/))
- Minecraft модове: CurseForge **291k+ проекта, 100+ млрд. сваляния**. ([CurseForge](https://www.curseforge.com/minecraft))
- **Виралност като маркетинг:** Minecraft е най-гледаната игра в YouTube — **1+ трилион
  гледания** (първата игра дотам). Показването на строежи привлича нови И връща стари играчи.
  ([YouTube Trends](https://www.youtube.com/trends/articles/minecraft-trillion/))

> **➡ За нас:** **co-op мултиплейър от старта** (не соло-only) е най-високата възвръщаемост за
> retention. **Модове през Steam Workshop** дават UGC-маховика в достъпен за нас мащаб.
> **Дизайн за гледаемост** (стрийминг/TikTok) е най-евтиният маркетингов канал — вградено
> споделяне на скрийншоти/клипове/светове.

---

## 4. Метрики и бенчмаркове

| Метрика | Медиана (пазар) | Топ 25% | „Добра“ цел | Sandbox/Simulation |
|---|---|---|---|---|
| **D1 retention** | ~15–16% | 26.5–27.7% | 40–45%+ | **45–60%** |
| **D7 retention** | 3.4–3.9% | 7–8% | 20%+ | — |
| **D30 retention** | <3% (75% от игрите) | ~3–4% | 10%+ | **20–30%** |
| **Session length** | 5–6 мин | 8–9 мин | — | по-дълги (co-op) |
| **Stickiness (DAU/MAU)** | ~8% | ~19% | 18%+ = отличен | Roblox ~21%, MC ~15% |

Източници: [GameAnalytics 2025](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks),
[maf.ad](https://maf.ad/en/blog/mobile-game-retention-benchmarks/),
[udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/stickiness).
*(Бенчмарковете са предимно мобилни F2P; sandbox/premium игри играят по различни правила, но
показват, че жанрът е сред най-задържащите.)*

- **Roblox (Q3 2025, SEC):** 151.5 млн. DAU, 39.6 млрд. часа, ~2.8 ч./ден на потребител.
  ([SEC 8-K](https://www.sec.gov/Archives/edgar/data/0001315098/000131509825000326/ex991-q32025shareholderl.htm))
- **Minecraft:** 350 млн. копия (април 2025, официално); ~141 млн. MAU (последна официална,
  2021) — по-новите 200 млн.+ са оценки на трети страни.
  ([VGChartz](https://www.vgchartz.com/article/466157/minecraft-sales-top-350-million-units/))

> **➡ За нас (реалистични KPI за MVP/EA):** цели D1 40%+, D7 20%+ за sandbox; следи
> stickiness и median playtime (EA игрите имат ~38.9 ч. медиан) като сигнали за „лепкавост“.
> Инструментирай onboarding фунията от ден 1.

---

## 5. ЕТИЧНО vs DARK PATTERNS — разделителната линия (задължителна за EU продукт)

Механиката е **етична**, когато създава реална стойност и целите ни съвпадат с тези на
играча. Същата техника може да е добродетел или капан — важи употребата.

### ✅ Използваме (етично)

- **Автономия** — реален избор на цели/стратегии/стил (sandbox, creative).
- **Компетентност** — ясна обратна връзка, лесни контроли, mastery-криви, растящи с умението.
- **Свързаност** — co-op/социалност като истинска цел, не като лост за натиск.
- **Поток** — баланс предизвикателство/умение; играчът сам темпо-настройва.
- **Прогресия по УМЕНИЕ, не по време/пари.**
- **Стрийкове/навици с „клапи за бягство“** — freeze/пауза, тихи ресети, изключване с 1 клик.

### ❌ НЕ използваме (dark patterns — и морално, и правно рисково)

- **Loot box / gacha / рандомизирани платени награди** (огледало на хазарта).
- **Grinding** — повтарящи се отегчителни задачи, „крадящи“ времето на играча.
- **FOMO / изкуствени лимитирани оферти**, appointment dynamics с наказание при пропуск.
- **Nudge към по-ниска поверителност / повече данни** (забранено при деца — ICO).
- **Infinite scroll / autoplay / постоянни push нотификации.**

Академична таксономия: Zagal, Björk & Lewis (2013), *Dark Patterns in the Design of Games*.
([PDF](https://my.eng.utah.edu/~zagal/Papers/Zagal_et_al_DarkPatterns.pdf))

### Регулаторна рамка на ЕС (защо това не е по избор)

- **Резолюция на Европейския парламент за адиктивния дизайн** (12.12.2023, 545 „за“):
  призовава за законодателство срещу адиктивен дизайн и „право да не бъдеш обезпокояван“;
  адиктивните инструменти да са **изключени по подразбиране за непълнолетни**.
  ([EP](https://www.europarl.europa.eu/news/en/press-room/20231208IPR15767))
- **Loot boxes:** ЕП настоява за общ подход/забрана при непълнолетни; предстоящ **Digital
  Fairness Act**. ([EP](https://www.europarl.europa.eu/topics/en/article/20230112STO66402/five-ways-the-european-parliament-wants-to-protect-online-gamers))
- **GDPR чл. 8:** дигитално съгласие 16 г. (държавите свалят до min 13); **България = 14 г.**
  (ЗЗЛД чл. 25в). Recital 38: децата заслужават специална защита.
  ([GDPR](https://gdpr-info.eu/art-8-gdpr/))
- **ICO Children's Code:** privacy by default, data minimisation, без nudge; глоби до 4% от
  оборота. ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/))

Пълните правни задължения (DSA, PEGI, ДДС, безопасност на деца) — в [`04`](./04-biznes-pravo-goto-market.md).

---

## 6. Онбординг → силен D1 (приложими правила)

- **Time-to-fun под 60–90 сек.** „Новите играчи решават интереса си за минути“ — дай блокове/
  инструмент в ръцете от първата секунда, не менюта. ([Roblox](https://create.roblox.com/docs/production/game-design/onboarding))
- **Първи „quick win“ до 90 сек** + поглед към бъдещето (видими цели) + hook за ангажимент.
- **Учи core loop-а изрично и рано** (button prompts, водещи стрелки, ниски прагове за левъл).
- Всяка секунда non-gameplay в първите 5 мин коства ~2–3% от кохортата; краш в първата сесия
  убива втората визита. ([RoLearn](https://rolearn.dev/guidance/first-week-retention-optimization/))
- **Инструментирай фунията**, A/B тествай туториала, tuning без рестарт (feature flags).

---

## 7. IP предпазливост — какво може и не може да се копира

Авторското право пази **израза, не идеята**. Механики/правила/жанрови концепции са свободни;
конкретни асети, арт, имена, „look and feel“ — НЕ.

- **ПРАВИ:** копирай механиката (voxel строене, крафт, споделени светове, модове→публикуване);
  изгради **изцяло собствен визуален език** (палитра, форми, UI, звук, шрифт); иновирай поне
  в едно измерение; документирай **независим произход** (свои скици, git история).
- **НЕ ПРАВИ:** 1:1 reskin на чужди асети; копиране на разпознаваеми силуети (Creeper),
  скинове, текстури; имена/шрифт близки до Minecraft/Roblox; не гледай изтекли/NDA материали.

Прецеденти: *Atari v. Amusement World* (идеята е свободна) vs *Tetris v. Xio* и *Spry Fox v.
LOLApps* (изразът и „look and feel“ са защитени — завой от 2012 г., клонирането стана рисково).
([FKKS](https://fkks.com/news/how-courts-view-copyright-protection-for-video-games),
[Game Developer](https://www.gamedeveloper.com/business/clone-wars-the-five-most-important-cases-every-game-developer-should-know))
