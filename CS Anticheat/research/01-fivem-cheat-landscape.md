# CS Anticheat — Разузнаване №01: FiveM Cheat Landscape

> **Статус:** разузнаване (не финален продукт). Цел — да опознаем ВРАГА, преди да
> строим по-добър античийт от echo.ac / detect.ac.
> **Дата на проучване:** 2026-07-06 · **Автор:** Геймъра
> **Метод:** WebSearch + WebFetch (cheat provider сайтове, GitHub/GitLab, cfx forums,
> elitepvpers, leak форуми, security writeup-и). Всяко твърдение с етикет на увереност.
>
> **ВАЖНО за увереността:** цените и „undetected“ статусите на cheat провайдъри са
> **маркетинг** — третирай ги като *Вероятно/Несигурно*, не като факт. Cheat сцената
> се движи седмично; числата тук са снапшот към юли 2026 и подлежат на повторна проверка.

---

## 0. TL;DR за архитекта

Врагът се дели на **два класа**, които изискват **различна защита**:

1. **Usermode Lua executor-и / mod menu-та** (Redengine, Eulen, Skript.gg, HX, Susano, TZX…)
   — инжектират се в `FiveM_b*.exe` процеса, викат GTA V + CitizenFX natives, спамят
   `TriggerServerEvent`, dump-ват ресурси, spoof-ват HWID. **Тук печели client-scan +
   server-authoritative логика.**
2. **Hardware DMA cheats** (blurred.gg тип) — четат памет през PCIe карта от ВТОРО PC,
   не инжектират НИЩО в процеса. **Client-side scan е сляп за тях** — бият се само
   server-side behavioral (aim-pattern, snap angles) + input-anomaly.

Съответно **никой usermode-only античийт не може да е „по-добър от всичко“** — DMA +
external aim се лови единствено server-side/behavioral. Нашата диференциация трябва да е
**хибрид: лек kernel/usermode client scan + силна server-authoritative валидация +
behavioral анализ**, защото конкурентите (echo.ac kernel-scan; detect.ac forensic;
FiveGuard/WaveShield usermode) са изтекли/байпаснати.

---

## 1. Cheat Menu Landscape (платени + безплатни)

### 1.1 Топ платени менюта (снапшот 2025–2026)

| Cheat | Тип | Цена (снапшот) | HWID lock | Ключови features | Клас |
|-------|-----|----------------|-----------|------------------|------|
| **redENGINE** | Lua executor + spoofer | ~$11.73–46.93 / 7.99–38.39€ | Да (лицензен) | Aimbot, ESP, wallhack, Resource Stopper, Server Dumper, **HWID spoofer** (твърди kernel-level bypass на BattlEye/EAC/cfx) | Usermode + spoofer |
| **Eulen (EulenCheats)** | Lua executor + spoofer | $19.90/мес · $59.99 lifetime | Да | Aimbot (legit+rage), Lua Executor, Dumper, **Ultra Stream Proof**, Lua Hook, Trigger Logger, Resource Blocker, ban spoofer (global+server) | Usermode |
| **Skript.gg** | All-in-one menu | не публикувана (по-скъп клас) | Да | Aimbot, ESP, FriendlyFire, AutoGlitchRoll, Midroll; **твърди bypass на FiveGuard** и custom AC; multi-game (FiveM/RageMP/AltV/GTA:O) | Usermode |
| **HX Cheats (HX Softwares)** | PvP menu | ~$10.43–31.30 / 9.99–29.99€ | Да | Aimbot (silent aim, magic bullet), ESP, no-clip, troll menu | Usermode |
| **Susano (susano.re)** | Lua executor | 16.99€/мес · 23.99€/3мес · 29.99€ lifetime · 199.99€ reseller | Да | Lua Executor + script hub, Event Executor, **Privacy Protector (HWID mask)**, Stream-Proof (OBS/Streamlabs/Medal/Discord), Aimbot; Classic + Lite edition | Usermode |
| **TZX (Tz-Project)** | Mod menu | не публикувана | Да | Lua executor, admin tools, teleport, godmode | Usermode |
| **Macho (madchad.net)** | Lua executor | не потвърдена | Да | Lua executor, Aimbot, ESP, Spoofer | Usermode |
| **DMA cheat (blurred.gg)** | Hardware DMA | $24.99/мес · $69.99/3мес · $299.99 lifetime | N/A (hardware) | KMBox aimbot, triggerbot, Player ESP (skeleton/name/health), Object ESP, web menu; **нищо не се инжектира** | **Hardware (external)** |

**Несигурно / за проверка на живо:** конкретните цени на Skript.gg, TZX, Hydro, D3D,
Impaulsive, Brady, Cobra не бяха потвърдени в достъпните страници (paywall/403). Имена
като **Hydro/HX** често се бъркат — „Hydro“ се цитира заедно с HX/Skript като силен за
aimbot config, но отделен продуктов лист не потвърдих. Cobra/Brady/D3D/Impaulsive —
исторически известни, но актуален статус 2026 = **за проверка** (много са dead/rebrand-нати).

### 1.2 Безплатни / cracked
- GitLab/GitHub topics: `fivem-cheat-cracked`, `fivem-hack-source-code`, `fivem-lua-executor`,
  `fivem-spoofer`, `fivem-aimbot`, `redengine-free` — cracked loaders и source dumps.
- **Изтекли source-и на самите менюта** (напр. `SKRIPT-GG` repo с „leaked source, bypasses
  FiveGuard“) → cheat devs учат нашите detection методи. **Урок за нас: security-by-obscurity
  е мъртва — приемай, че врагът има нашия клиентски код.**
- Безплатните менюта = предимно blacklist bypass + прости Lua executor-и; ловят се лесно,
  но са входна врата за масата.

### 1.3 Разпространение и бизнес модел
- Продажба през **reseller мрежи** (ssz.gg, tgmodz, ezmod, qlmshop, shamods, recoverykings,
  lmarket, safemarket, 420-services) — не само официалния сайт. Плащане: Stripe, крипто,
  Pix, RazerGold giftcards (за анонимност).
- **Subscription модел** (месец/lifetime) + **HWID lock на лиценз** → cheat-ът сам е
  „античийтнат“ срещу cracking. Reseller tier (напр. Susano 199.99€) = pyramid дистрибуция.

---

## 2. Инжекция и техники за заобикаляне

### 2.1 Usermode инжекция (мнозинството FiveM менюта)
- **Manual mapping** — cheat DLL се map-ва ръчно в паметта на `FiveM_b*.exe` без
  `LoadLibrary`, така че НЯМА запис в PEB module list. *Слабост за него:* регионът остава
  `PrivateMemory` + `EXECUTE` без file backing → **VAD tree scan го лови** (usermode код
  не може да пренапише VAD-а).
- **Thread hijacking** — открадва легитимна нишка вместо `CreateRemoteThread`.
- **IAT (Import Address Table) hooking** — пренасочва native/anticheat повиквания, за да
  прихване или заобиколи проверки.
- **Native hooking** — hook на GTA5/CitizenFX natives за godmode/teleport/no-recoil.
- **Lua ScRT abuse** — инжектираният Lua ползва FiveM Lua Scripting Runtime, за да стигне
  до GTA5 + FiveM natives; манипулира `_G` (global environment table).

### 2.2 Kernel / driver-level
- **BYOVD (Bring Your Own Vulnerable Driver)** — зарежда легитимно подписан, но уязвим
  driver (исторически MSI/Gigabyte/ASUS с IOCTL за физически R/W памет), exploit-ва го за
  kernel exec, гаси **DSE (Driver Signature Enforcement)**, map-ва неподписан cheat driver.
  Заобикаля usermode AC, защото Ring 0 cheat > Ring 3 watcher.
- **Kernel DLL injectors** (напр. cybryk/kernelmodeinjector) — `.sys` driver + usermode
  loader, manual mapping + payload encryption за да бият BattlEye/EAC логика.
- **Ирония:** самите kernel античийтове (echo.ac echo_driver.sys) са били **уязвими**
  (CVE-2023-38817 → priv-esc, добавен в Microsoft Vulnerable Driver Blocklist, cert revoked).
  **Урок: нашият driver = attack surface; трябва reference-count, IOCTL валидация, минимум API.**

### 2.3 Hardware DMA (най-тежкият враг)
- **Setup:** 2 PC-та (Win10/11), **DMA карта** (PCIe, напр. Screamer/Captain DMA) с
  undetected firmware, **input device** (KMBox Net, Teensy, Arduino, MAKCU, Ferrum), опц.
  **Fuser** за ESP на основния монитор.
- **Защо е кошмар:** cheat-ът тече на ВТОРОТО PC, чете game памет само през DMA картата →
  **нищо не се инжектира** в game процеса, няма usermode/kernel артефакт на game PC-то.
  Client-scan е сляп. Ban risk само от: detected firmware (card fingerprint) или „твърде
  очевидна“ игра (behavioral).
- **Работи на всички builds на FiveM, GTA:O, RageMP, AltV.**

### 2.4 HWID spoofer-и (post-ban evasion)
- Рандомизират serial/physical hardware IDs (disk, SMBIOS, MAC, Rockstar ID) → нов HWID
  след reboot → global/server ban bypass. redENGINE, Eulen, Susano „Privacy Protector“.
- **Извод за нашия ban модел:** HWID-only ban е трошлив. Нужен е **multi-signal fingerprint**
  (HWID + behavioral + account age + cross-server sync), не един serial.

---

## 3. Атакувани вектори в FiveM (какво реално правят)

| Вектор | Механизъм | Server-authoritative уязвим? | Защита |
|--------|-----------|------------------------------|--------|
| **God mode / no-death** | Native hook `SetEntityHealth`/`SetPlayerInvincible` client-side | Частично — damage минава през сървъра при добър gameplay код | Server валидира health delta; отхвърля невъзможни стойности |
| **Aimbot / triggerbot / silent aim (magic bullet)** | Native hook на aim/shoot; „magic bullet“ подменя bullet impact | **ДА** — стрелбата е client-owned в GTA net модел | Behavioral (snap angle, hit-ratio, headshot %) server-side; много труден за детекция |
| **ESP / wallhack** | Чете entity coords от памет, рисува overlay | НЕ (pure read, няма server трафик) | Почти невидим server-side; само anti-read (client scan) или culling (OneSync focus zone) |
| **No-clip / freecam / teleport** | Native `SetEntityCoords` без collision | **ДА** | Server-side speed/distance/position sanity (виж §5) |
| **Speed hack** | Модифицира movement natives / game clock | **ДА** | Server проверява изминато разстояние / Δt |
| **Spawn money / items / weapons** | Спам `TriggerServerEvent` с чужди/непроверени handler-и | **ДА (класика)** | Server-authoritative: чети цена/баланс от състояние, валидирай source/типове/права |
| **Event spam / event injection** | Извиква ВСЕКИ регистриран net event с payload по избор | **ДА (най-експлоатиран)** | Proxy на event-и (GoblinAC модел), rate-limit, source/тип валидация |
| **Resource injection / Lua executor** | Инжектира Lua в client ScRT, стартира arbitrary код | Частично | `_G` scan за prohibited vars, blacklist на injected имена |
| **Resource stopper / dumper** | Спира client ресурси (напр. античийта!) / dump-ва server-side files | **ДА — гаси защитата** | Heartbeat/watchdog: сървърът очаква периодичен ping от AC ресурса |
| **Entity manipulation / mass spawn** | Client създава vehicles/peds/objects | **ДА** | **Entity Lockdown = strict** (само сървър създава entities) — най-силната вградена защита |
| **Ban bypass** | HWID spoofer + нов Rockstar/CFX account | — | Multi-signal fingerprint + cross-server ban sync |

**Ключов инсайт:** класове с **мрежов ефект** (money/items/spawn/teleport/speed) са
100% server-authoritative solvable — тук печели дисциплина, не magic. Класове с **pure
read/aim** (ESP, DMA aimbot) НЕ са solvable server-authoritative освен behavioral →
това е границата, където дори „по-добър“ AC не е перфектен. Честността тук е диференциатор.

---

## 4. Конкурентна карта — съществуващи FiveM античийтове

| Античийт | Режим | Цена (снапшот) | Силни страни | Слаби страни / известни bypass-и |
|----------|-------|----------------|--------------|----------------------------------|
| **echo.ac** | **Kernel** (`echo_driver.sys`) | по договор | Kernel memory scan, копира process памет за офлайн анализ, gasi AV/EDR callback-и за да работи | **CVE-2023-38817** (priv-esc), driver в MS blocklist + cert revoked; PoC байпаси публични (thottysploity, kite03/echoac-poc); агресивно скролва browser history/recycle bin → privacy бунт |
| **detect.ac** | **Forensic scan** (on-demand, usermode) | $18.99 (24h) · $19.99/мес · $39.99/3мес · $149.99/год | 710+ detection методи, <60с scan, forensic „докажи че cheat-ът е бил тук“, лови cleaners/spoofers/анти-forensic; 11 игри, 1M+ играчи; FP <0.1% | Не е live/preventive — само reactive forensic; не спира cheat в реално време; заобикалящ се от perfect cleaner + DMA (нищо не остава на диска) |
| **FiveGuard** | Usermode | 40€/мес · 100€ lifetime | Anti-aimbot AI, Objects-AI, Cheats-AI, Safe-Events, framework compat, установен бранд | **Source code LEAKED** и се търгува на leak форуми → архитектурата е разкрита пред cheat devs (Skript.gg рекламира bypass) |
| **WaveShield** | Usermode | 49.99€/мес | Твърди 15,000+ сървъра, покрива aimbot→noclip, 99.9% (непроверимо) | **Целият source + panel продаван за 40–65€** на leak форуми; claim-и непроверими |
| **ElectronAC** | Usermode | скрита (акаунт нужен) | Session replay, interactive map, multi-player monitoring, силна общност, evidence gathering | **Source leaked „fully decrypted“**; слаб на proactive/pre-connection prevention; reactive |
| **PhoenixAC** | Usermode / cloud | $35/мес–$235 lifetime | Без feature-gating, cloud panel, anti-VPN, Steam age check, entity detection | Object/entity detection базово; pre-connection screening basic |
| **FiniAC** | Usermode / script | 34.99–49.99€/мес | MultiStream (16 играча), TrustScore (30+ променливи), Apollo panel | Aimbot detection зад 39.99€+ tier; базова защита gated зад premium |
| **AnvilAC** | Usermode | $11.99/мес–$89.99 lifetime | Най-евтин, без feature restrictions | Signature-based, без behavioral/economy forensics; 2-ма души екип; 98% непроверимо |
| **VenusAC** | **Kernel** | не детайлна | System-level threat detection, лови injected DLL + memory mods (heuristic) | Kernel → distrust + false positives; community controversy |
| **Raven AC** | Usermode + AI | по договор | Event abuse, trigger spam, NUI injection, entity spam, vehicle spawner detection; AI + global ban sync | Usermode → сляп за DMA/kernel; claim-и маркетинг |
| **Fiveuxe** | Usermode + server | по договор | Monitor на всеки TriggerServerEvent vs expected; global ban propagation; movement/combat detection | Usermode limits; reactive на нови техники |
| **txAdmin** | Admin panel (не AC) | Free (вграден) | Управление, bans, live console, playerlist | **НЕ е античийт** — само admin; никаква injection/memory защита |
| **Безплатни (SecureServe, FIREAC, PegasusAC, RuxoAC, Valkyrie, GoblinAC)** | Usermode/Lua | Free / OSS | GoblinAC = event proxy (силна идея); Valkyrie = `_G` scan; blacklist | „всеки с half-decent executor ги bypass-ва за минути“; blacklist-only, без behavioral/cross-server |

**Мета-извод:** ДОМИНАНТНАТА слабост на конкуренцията НЕ е технология, а **изтекъл код**
(FiveGuard, WaveShield, ElectronAC, Skript-известни bypass-и) + **kernel driver = liability**
(echo.ac CVE). Диференциация за CS Anticheat:
1. **Приеми че клиентският код е публичен** — цялата истинска сигурност да е server-authoritative
   + server-side поведенчески модел, който не се „чете“ от изтекъл клиент.
2. **Ако правим kernel компонент — минимален attack surface, версиониран, reference-counted,
   IOCTL валидиран** (не повтаряй echo.ac CVE).
3. **Cross-server ban propagation + multi-signal fingerprint** (не HWID-only, който spoofer-ите чупят).
4. **Behavioral/AI за aimbot+DMA** — единственият вектор срещу hardware cheats.

---

## 5. Detection вектори — кое РАБОТИ

### 5.1 Client-side (лови usermode, СЛЯП за DMA)
- **Memory / VAD scan** — `PrivateMemory + EXECUTE` без file backing = manually mapped код;
  VAD tree lookup лови дори при подправен PEB. *(Silно, но kernel/DMA го bypass-ват.)*
- **Signature / known-name scan** — blacklist на mod menu file names, module имена. *(Слабо
  самостоятелно — тривиално се rename-ва.)*
- **`_G` global environment scan** — Lua injection добавя prohibited глобали/функции в
  runtime env table → сканирай за тях. *(Ефективно срещу Lua executor-и; Valkyrie модел.)*
- **API hook / IAT integrity** — детекция на hook-нати natives/imports, hardware breakpoints,
  debugger, timing analysis, VM detection, certificate store scan (anti-tamper слой).
- **Integrity checks на game files / natives** — verify че CitizenFX natives не са пренасочени.
- **Screenshot / screencap capability** (`screenshot-basic` тип) — визуален ESP proof (OCR
  подход, P4jMepR/Fivem-AntiCheat-OCR) — но cheats имат **Stream Proof**, който крие overlay-а.
- **HWID collection / hardware fingerprint** — за ban; но spoofer-ите го рандомизират →
  **multi-signal** е задължителен.

### 5.2 Server-side (лови ефекти, РАБОТИ и срещу DMA/kernel за net вектори)
- **Position / speed / distance sanity** — Δposition спрямо Δt vs физически максимум → лови
  teleport, noclip, speedhack. *(Server-authoritative, невъзможно за bypass от client.)*
- **Damage / health anomaly** — невъзможни damage стойности, headshot без line-of-sight.
- **Event validation / proxy** — валидирай source, типове, диапазони, права, собственост на
  ВСЕКИ net event; proxy на triggers (GoblinAC), rate-limit/cooldown. *(Убива money/item/spawn dupe.)*
- **Entity Lockdown = strict** — само сървърът създава entities → mass spawn мъртъв вектор.
  (Вграден OneSync механизъм — най-евтината силна защита.)
- **Behavioral / AI aim analysis** — snap-angle, hit-ratio, reaction time, headshot %, aim
  smoothness → **единственият** вектор срещу DMA/external aimbot. *(Скъпо, FP риск, но диференциатор.)*
- **Heartbeat / watchdog** — AC ресурсът праща периодичен signed ping; липса = resource stopper
  атака → auto-ban. *(Задължително срещу „stop the anticheat“.)*
- **Cross-server ban sync / global propagation** — споделен ban regime бие HWID spoof.

### 5.3 Практическа матрица „вектор → защита“
| Cheat клас | Client scan? | Server-authoritative? | Behavioral? |
|------------|:---:|:---:|:---:|
| Money/item/spawn dupe | — | **✅ решаващо** | — |
| Teleport/noclip/speed | помага | **✅ решаващо** | помага |
| God mode | помага | ✅ (при добър damage модел) | — |
| Lua executor / resource inject | **✅** | помага | — |
| Aimbot (usermode) | помага | — | **✅** |
| **DMA aimbot / ESP (external)** | ❌ сляп | — (за aim) | **✅ единствено** |
| HWID ban evasion | fingerprint | — | multi-signal + cross-server |

---

## 6. Изводи за архитектурата на CS Anticheat

1. **Хибрид, не usermode-only.** Всеки чист-usermode конкурент е leaked/bypass-нат.
   Server-authoritative ядро (незаобиколимо) + лек client scan + behavioral слой.
2. **Приеми компрометиран клиент.** Никаква сигурност да не зависи от тайната на клиентския
   код (FiveGuard/WaveShield/Electron грешката).
3. **Ако kernel — минимален, версиониран, IOCTL-валидиран.** Не ставай следващия echo.ac CVE
   / vulnerable driver в MS blocklist.
4. **DMA/external aim = само behavioral.** Бъди честен, че това е границата; вложи в AI aim-analysis.
5. **Ban = multi-signal + cross-server sync.** HWID-only е спукан от spoofer-ите (redENGINE/Eulen/Susano).
6. **Watchdog/heartbeat срещу resource stopper.** Cheats имат „AC blocker“ — детектирай тишината.
7. **Anti-forensic gap.** detect.ac печели с post-scan; помисли reactive forensic tier до live AC.

---

## Приложение: Източници (проверено 2026-07-06)

**Cheat провайдъри / резелъри:**
- Eulen — https://eulencheats.com/
- Susano — https://susano.re/
- Skript.gg — https://skript.gg/ , https://skript.gg/products/gta
- redENGINE (резелъри) — https://ssz.gg/cheats/product/452-redengine-lua-executor/ , https://tgmodz.com/shop/redengine-fivem-spoofer/ , https://shamods.com/products/redengine-lua-executor
- HX Cheats — https://qlmshop.com/product/hx-cheats/ , http://hxcheats.tech/
- Macho / „Best FiveM Cheats 2026“ — https://madchad.net/product/macho-fivem-cheat/ (списък страница 403)
- DMA cheat — https://blurred.gg/gtav
- TZX — https://github.com/Tz-Project-Fivem-Tzx-Mod-Menu
- Резелър агрегатори — https://ssz.gg , https://ezmod.vip , https://qlmshop.com , https://lmarket.net , https://recoverykings.net , https://420-services.net

**Injection / kernel / DMA техники:**
- Kernel cheats explained — https://zhexcheats.com/en/blog/game-hacking-guides/kernel-cheats-explained
- Kernel AC deep dive — https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/
- Kernel-mode injector (PoC) — https://github.com/cybryk/kernelmodeinjector
- BYOVD / bypass — https://guidedhacking.com/threads/how-to-bypass-kernel-anticheat-develop-drivers.11325/

**echo.ac / detect.ac:**
- Echo AV bypass writeup — https://thottysploity.github.io/posts/echohno/
- Echo CVE-2023-38817 writeup — https://ioctl.fail/echo-ac-writeup/ , https://github.com/kite03/echoac-poc/
- Echo changelog — https://dash.echo.ac/changelog
- detect.ac — https://detect.ac/

**Конкурентни античийтове:**
- Anticheat comparison 2026 (Medium) — https://medium.com/@vinayak.gandhi.in/fivem-anticheat-comparison-2026-i-tested-every-major-option-so-you-dont-have-to-49d3f3d265cf
- Raven — https://www.ravenac.net/ , https://www.ravenac.net/compare
- Fiveuxe — https://fiveuxe.com/ , https://fiveuxe.com/blog/evolution-of-fivem-cheats
- SecureServe — https://github.com/peleg-development/SecureServe-AC
- FIREAC — https://github.com/AmirrezaJaberi/FIREAC
- Valkyrie (OSS, `_G` scan) — https://github.com/NotSomething0/Valkyrie
- GoblinAC (event proxy) — https://github.com/Triscuit2311/GoblinAC
- Lua Malware Guard — https://github.com/abdalrhman-alajlouni/Lua-FiveM-Malware-Guard
- OCR AC — https://github.com/P4jMepR/Fivem-AntiCheat-OCR
- sasAC — https://github.com/sAsPeCt488/sasAC

**Official / defense:**
- Cfx.re Secure your events — https://docs.fivem.net/docs/developers/server-security/
- FiveM anticheat guide — https://xgamingserver.com/blog/fivem-anticheat-guide/
- Cfx forum: detect/prevent Lua injections — https://forum.cfx.re/t/how-do-i-detect-prevent-lua-injections/5257572

> **Забележка за перфекционизъм:** цените/статусите са маркетинг снапшот — потвърди на живо
> преди да ги цитираш в продуктова стратегия. Тестът на реалната ни защита (`ensure`, exploit
> опити, DMA behavioral) е на реален FiveM сървър, не тук.
