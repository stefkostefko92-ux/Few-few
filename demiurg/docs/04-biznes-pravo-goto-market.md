# 04 · Бизнес модел, право на ЕС, live-ops и go-to-market

> Практично за малък EU екип (Carbon Stealth VCC, България). Всяко ключово твърдение носи
> източник. **Това е обобщение, не правен съвет** — за обвързващи решения: юрист/DPO (КЗЛД)
> и агентите **Правния Разбирач** + **Продавача** от репото.

---

## 1. Монетизация — premium + етична козметика

- **Основен модел: еднократна достъпна цена** (~$15–25) на Steam + **Early Access** като
  финансиране и съ-дизайн. 28% от най-печелившите нови Steam релийзи за 2024 са EA; EA дадоха
  23.67% от прихода (инди: $215.5M). EA заглавия имат по-висок медиан ревю (86% vs 81%) и
  playtime (38.9 ч. vs 27.1 ч.). ([OP Game Marketing](https://opgamemarketing.substack.com/p/aaa-aa-indie-what-2024s-game-data))
- **Ценова тактика (Necesse модел):** ниска входна цена, чести отстъпки, за да натрупаш
  ревюта и мрежов ефект.
- **По желание (не за MVP):** козметични DLC/сезони; лек абонамент за официални хостнати
  сървъри (Realms-модел, $3.99–7.99/мес); модел на creator revenue share (Modrinth: 90/10 в
  полза на създателя — привлича ранни модъри).
- **❌ Забранено:** loot box/gacha, pay-to-win. Terraria продаде 70M с нула P2W; Trove
  (агресивна F2P) падна −98%. **Само козметика, прозрачни цени, никаква случайност.**

## 2. Live-ops с малък екип (устойчиво, без crunch)

- **Каденция:** 1 голям **безплатен** ъпдейт на всеки **3–6 месеца** (Deep Rock Galactic /
  Valheim модел — Valheim: 5 души, ~18 мес. между ъпдейти, 17M+ копия). **НЕ** Fortnite-темпо
  (сезон/10 седмици иска голям екип). ([Iron Gate](https://abgames.io/developers/iron-gate-ab))
- **Модулни, преизползваеми event-системи + feature flags/remote config** → пускаш сезонни
  събития без нов билд. Инструменти: GameAnalytics/Firebase + PlayFab/Unity remote config +
  CI/CD за пачове.
- **Community challenges** (свят-бос, който общността бие заедно) превръщат co-op в споделено
  събитие.
- **Discord = център** на общността; volunteer модератори с **ограничена роля** (банове/трия,
  без backend достъп). **Мълчанието е убиец** — редовна комуникация + публичен roadmap.
  ([Game Developer](https://www.gamedeveloper.com/business/dissecting-discord-how-to-set-up-an-indie-game-discord))

### Steam Early Access — правила на Valve

- Задължителна **EA Q&A декларация** (цели, състояние, разлика с финала, цени).
- **„Не обещавай конкретни бъдещи събития“** — клиентите купуват заради текущото състояние.
- **„Не пускай без играема игра“** — не tech demo; не crowdfunding.
- **Цени:** можеш да вдигнеш на 1.0, **но не в последните 30 дни преди прехода** (иначе губиш
  launch discount). ([Steamworks](https://partner.steamgames.com/doc/store/earlyaccess))
- **EA срок:** медиана ~14 мес. (средно ~21). **Само 20% се справят по-добре на 1.0 отколкото
  в EA** → третирай EA launch като **истинския launch**. ([gamediscover](https://newsletter.gamediscover.co/p/the-state-of-steam-early-access-graduates))

## 3. Go-to-market (маркетинг от ден 1)

- **Wishlists = гориво.** Нов праг (2026): Valve вдигна летвата на видимост драстично (стар
  ~7000 вече е слаб; целѝ **10 000–20 000** за здрав старт). Steam праща имейл на всеки
  wishlister на launch → висока конверсия. ([howtomarketagame](https://howtomarketagame.com/2025/03/10/when-should-i-post-my-steam-coming-soon-page/))
- **Конверсия:** медиана ~0.15× wishlists → продажби първата седмица (игри >$10 конвертират
  ~0.10×); вариацията е 10–20×, не 10–20%. ([gamediscover](https://newsletter.gamediscover.co/p/the-state-of-steam-wishlist-conversions))
- **Steam „Coming Soon“ страница: 6–12 мес. преди launch** (щом имаш жанр + арт стил + 3 среди).
  **Общност (Discord): 12–18 мес. преди launch.**
- **TikTok/short-form = канал №1** (~35% от wishlists); алгоритъмът оценява всяко видео
  независимо (0 фоловъри → милиони). Добър клип ≈ 1000–2000 wishlists. Hook в първите 3 сек.
  ([acorngames](https://acorngames.gg/blog/2025/8/10/the-indie-devs-guide-to-mastering-tiktok-in-2025))
- **Steam Next Fest** = последен буст преди launch (пусни demo само веднъж, по време на феста).
- **Микро-инфлуенсъри > макро** по ROI; Keymailer (безплатен, 55k+ създатели) за key distribution.
- **Бюджет:** маркетинг = **15–30%** от dev бюджета. Безплатни канали (носещи за малък екип):
  органичен TikTok/Reels/Shorts, Next Fest demo, Discord, Reddit, dev-logs, Keymailer.

### ❄ Студен душ (реализъм)

- **~0.5% от инди игрите за 2024 са финансово жизнеспособни**; ~8% от топ инди правят 80% от
  парите. Издател дава ~5× по-висока медианна печалба. Планирай за долната част.
  ([VG Insights](https://gamedevreports.substack.com/p/video-game-insights-indie-games-on))
- Реалистична сметка: 10–20k wishlists × ~0.15× × $10–15 ≈ **~$10k–30k първа седмица** (без
  вирусен късмет). Sandbox с органичен TikTok/стрийм momentum има по-висока горница.

## 4. Право на ЕС — рейтинг, монетизация, потребител

- **PEGI/IARC рейтинг:** за дигитално разпространение (Steam/Epic) IARC въпросникът е
  **безплатен** и дава едновременно PEGI (ЕС) + ESRB (US) + др. Descriptor **„In-game
  purchases“** (и „Paid random items“ за loot box). За зряла игра — вероятно **PEGI 16/18**.
  ([PEGI](https://pegi.info/page/how-we-rate-games))
- **Loot boxes:** фрагментирана регулация. **Белгия = де-факто забрана** (криминален риск —
  затвор/глоба). Нидерландия ги легализира съдебно. ЕП настоява за забрана при непълнолетни
  (бъдещ Digital Fairness Act). **➡ Ние нямаме loot box изобщо — избягваме целия проблем.**
  ([Dentons](https://www.dentons.com/en/insights/guides-reports-and-whitepapers/2023/june/28/loot-box-regulation-in-the-eu-loading-status))
- **Право на отказ 14 дни (Directive 2011/83/EU):** за дигитално съдържание **отпада**, ако
  има **изрично съгласие + потвърждение, че губиш правото** (чл. 16(m)) → нужен е checkbox
  „Съгласявам се с незабавно предоставяне и приемам, че губя правото на отказ“.
  ([EUR-Lex](https://eur-lex.europa.eu/EN/legal-content/summary/consumer-information-right-of-withdrawal-and-other-consumer-rights.html))
- **Omnibus Directive (2019/2161):** забрана на фалшиви ревюта и dark patterns; глоби до 4%
  от оборота. Показвай **реални цени (€)**.
- **ДДС:** облага се по **държавата на купувача**; регистрирай **VAT OSS** (единна тримесечна
  декларация); праг €10,000. Цени **с включен ДДС** (B2C).
- **Steam:** $100/продукт (Steam Direct), 70/30 split (→75/80% при обем), refund при <2ч/14 дни.
  **Epic:** 88/12 (100% до $1M/год.).

## 5. Безопасност на деца и модерация на UGC/чат (ако играта е достъпна за деца)

Игра с чат/UGC, достъпна за деца, е **висок правен риск** — режимите се прилагат кумулативно.
**Затова 16+ таргетът е и правна стратегия, не само маркетинг.** Ако все пак деца я достъпват:

- **GDPR:** БГ дигитална възраст = **14 г.** (ЗЗЛД чл. 25в); под нея — родителско съгласие
  (чл. 8). **DPIA задължителна** при услуга към деца + чат/UGC (чл. 35). **Privacy by default**
  (чл. 25): high privacy, геолокация off, чат ограничен/изключен за най-малките.
  ([GDPR](https://gdpr-info.eu/art-8-gdpr/))
- **DSA (Регламент 2022/2065):** игра с чат/UGC е поне **hosting service**; ако разпространява
  UGC публично — **online platform**. Изисква **notice-and-action** (чл. 16), **statement of
  reasons** (чл. 17), обжалване (чл. 20), забрана на **profiling-реклами към непълнолетни**
  (чл. 28(2)), забрана на dark patterns (чл. 25). **Micro/small (<50 души И <€10M)** са
  освободени от част (чл. 19), но остават базовите hosting задължения. Санкции до **6% от
  световния оборот**. ([DSA](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_28.html))
- **Age assurance:** Комисията публикува Насоки по DSA (14.07.2025) — три нива (self-declaration
  < estimation < verification). Необвързващи, но бенчмарк.
- **UK Online Safety Act** (ако има UK потребители): „highly effective age assurance“ от
  25.07.2025; санкции до £18M или 10% от оборота.
- **COPPA** (ако таргетираш US деца <13): verifiable parental consent; FTC глоби — HoYoverse
  $20M, Epic/Fortnite $275M.
- **Модерация:** автоматичен контекстен филтър (тип CommunitySift) **+ човешка ескалация** +
  report/block; за деца — allowlist/safe chat, чат off по подразбиране. Независим одит (2026)
  показва, че **само авто-филтър НЕ е достатъчен** (пропуска grooming през leetspeak).
  ([helpnetsecurity](https://www.helpnetsecurity.com/2026/05/08/roblox-chat-moderation-issues/))

### Минимален правен checklist (приоритет)

**Blocker:** възрастова граница + age assurance · DPIA · privacy by default за деца · без
profiling-реклами към непълнолетни · notice-and-action + report/block · чат модерация (авто +
човек). **High:** политика за поверителност на разбираем език · точка за контакт · логове на
съгласие/модерация. **Medium:** trusted flaggers · родителски контроли · следене на EU
age-verification blueprint/EUDI Wallet.

> **➡ Стратегическо следствие:** зрял 16+ таргет + **без loot box** + **premium (без агресивна
> виртуална валута)** премахва по-голямата част от този правен товар още на ниво дизайн.
