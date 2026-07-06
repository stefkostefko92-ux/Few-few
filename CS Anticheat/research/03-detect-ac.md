# Security Teardown: detect.ac

> Изследване за проекта **CS Anticheat** (Carbon Stealth). Цел: детекция, слабости и bypass-и на конкурента.
> Дата на проверката: 2026-07-06. Метод: fetch на detect.ac (homepage, `/changelogs`, `/tools`), DDG/DDG-lite, Trustpilot/Malwarebytes снипети.
> Легенда: **[П]** потвърдено · **[С]** спекулация/извод · **[?]** за доуточняване.

---

## 0. TL;DR
detect.ac също **не е real-time античийт** — то е **deep forensic scanner** („PC-check в под 60s"), който сам се описва като *допълнение*, не замяна, на жив AC. Собствената им таблица го казва директно: Live AC = *„Prevent the cheat from running"*, detect.ac = *„Prove the cheat was ever there"* **[П]**. По-зряло и по-широко от echo.ac (v3.3.0, weekly updates, 710+ „detection methods", 11 игри, 18 free forensic tools), но споделя **същата фундаментална слабост**: post-hoc снапшот на Windows artefacts, който потребителят пуска сам → вечна anti-forensic котка-и-мишка. Че bypass-ите работят се доказва от самите им changelog-ове: **всяка седмица добавят нови „bypass detections"** — т.е. старите bypass-и са работели до пача. **[П]**

---

## 1. Архитектура на детекцията

- **Клас:** deep-dive forensic scanner, **usermode**, **не** kernel-driver за FiveM. **[П]** (homepage: *„deep-dive scan that most live systems simply are not built to perform"*, *„Zero impact on game performance"* — защото не е residentен по време на игра).
- **Позициониране:** изрично **не** real-time; *„not a replacement, but the best complement to your existing security"*. **[П]**
- **Интеграция с FiveM:** няма server resource; заподозреният сваля и пуска клиентски скенер, резултатът отива в dashboard/scan-page. **[П, С]** (същият SS-модел като echo; homepage говори за „scan page", „View Files In VirusTotal From The Scan Page").
- **Едно real-time изключение:** **MOSS 2.0** — техен re-write на MOSS за Rainbow Six Siege, *„real-time integrity monitoring during competitive matches"*. **[П]** (tools page). Т.е. живата детекция е само за R6 turnir-и, **не** за FiveM.
- **Anti-tamper:** [?] не потвърден; но техните tools се флагват като **PUP/false-positive от Malwarebytes** → probably packed/обфускирани. **[П]** (Malwarebytes „detect.ac False Positive - File Detections").
- **Поддържани игри:** CoD, DayZ, R6 Siege, Fortnite, FreeFire, RageMP, AltV, Roblox, Rust, FiveM, Minecraft. **[П]** (homepage + changelog).

## 2. Detection методи — пълен forensic artifact набор

От `/changelogs` (v3.3.0, 2026-07-01) и `/tools` — detect.ac парсва изключително широк набор Windows artefacts **[П]**:

- **Prefetch** (`WinPrefetchView++`) — с YARA rules, signature checks, highlight на modified файлове.
- **Amcache** — многократно „improved" (execution history).
- **SRUM** (System Resource Usage Monitor) — network/process usage per app (`SRUMExplorer++`).
- **USN Journal** — modified flags, „USN bypass detections" (следи от cleaner).
- **IFEO** (Image File Execution Options) — hijack/debugger keys.
- **Autoruns / startup** (`Autoruns++`) — USN-monitored startup entries, signature verification.
- **Registry** — deleted registry keys, embedded cheats in registry, `.reg` bypass detections.
- **Browser history & downloads.**
- **Dnscache** (резолвнати чийт-домейни).
- **Lsass.exe detections.**
- **PowerShell** — command history, „powershell bypass detections".
- **SavedFiles / disk** (`SavedFilesViewer++`) — всеки файл записан на диска, cross-ref timestamps, „built-in bypass detections".
- **USB / DMA** (`USBDeview++`) — всички device log-ове, cross-ref срещу DeviceHunt/live API за **DMA/USB bypass** и cleaned USB следи.
- **Control Flow Guard detection** (ново в 3.3.0).
- **Windows DB, packed files, entropy, VirusTotal integration, custom YARA import, custom strings** (`StringExplorer++`).
- **[С]** Всичко е **residual-trace**; активна памет/жив aimbot се лови само косвено (освен MOSS за R6).

## 3. Feature set

- **Dashboard** (Users/Scans counters), Sign up/Login, scan pages, VirusTotal от scan-page. **[П]**
- **710+ „detection methods"**, **11 игри**, claim **<0.1% false positive**, **1M+ players**, weekly changelogs. **[П]** (маркетинг — числата да се третират като маркетинг **[С]**).
- **18 безплатни forensic tools** + `ToolsDownloader++` all-in-one installer с file explorer/auto-extract. **[П]** (tools page). Стратегия: free tools → funnel към платения продукт.
- **Discord + „Ranked PC checking / bypasser" състезание с $$ награди.** **[П]** (homepage banner) — сами признават, че bypasser-и съществуват, дори ги геймифицират.
- **Custom UI themes** (цветове, corner radius, text overrides). **[П]** (changelog 3.2.2).
- **Changelogs, TOS, Privacy, Purchase.** **[П]**

## 4. Известни BYPASS-и и слабости (най-важното)

1. **Perpetual anti-forensic arms race — доказана от собствените им changelog-ове.** Всяка версия добавя „New USN Journal Bypass Detections", „PowerShell Bypass Detections", „USB Bypass Detections", „Puremode Bypass Detections", „RPF Cheat Detections" и т.н. **[П]** (changelogs 3.2.3–3.3.0). Извод: **bypass-ите работят до момента, в който конкретният artefact-cleaner бъде каталогизиран** → атакуващият винаги е с една стъпка напред между пачовете. **[С, силен]**
2. **Post-hoc + user-run** — заподозреният пуска скенера сам, след факта. Чийт затворен + памет изчистена + artefacts wiped преди скана = чисто. Не спира **активен** чийт. **[С от архитектурата + „Prove the cheat was ever there"]**
3. **Anti-forensic cleaners** — целият им клас „++ tools" съществува, защото cleaner-и трият Prefetch/USN/Amcache/SRUM/registry. Kernel-level cleaner, който изтрива journal-ите атомарно, ги ослепява. **[П, косвено — те сами таргетират „cleaners/anti-forensic"]**.
4. **DMA / external hardware cheats** — оставят минимални host artefacts; `USBDeview++` е точно опит да компенсира, но DMA през PCIe/спуфнат firmware е трудно уловим forensic-но. **[С]**
5. **Malware false-positive (PUP)** — техните binaries се засичат от Malwarebytes → доверие/deploy триене, потребители не искат да пускат „malware". **[П]** (Malwarebytes детекция).
6. **VM / spoof / sandbox** — понеже скенерът се пуска на машина, контролирана от заподозрения, входните artefacts могат да са спуфнати; скенерът може да е мрежово блокиран или подхранван с фалшиви данни. **[С]**
7. **„Ranked bypasser" програма** — публично признание, че bypass-ването е решен и активен проблем. **[П]**

## 5. Атакова повърхност — къде НИЕ печелим

- **Real-time за FiveM, не само forensic:** живата им детекция е ограничена до R6/MOSS. Интегриран FiveM server resource + подписан client, който следи **активна** инжекция/памет/поведение server-side, покрива класа, който detect.ac няма за FiveM.
- **Излизане от anti-forensic arms race:** щом bypass detections се добавят всяка седмица, значи моделът е реактивен. **Server-side behavioral/статистическа** детекция (aim-snap, wallhack angle-analysis, impossible movement) не може да бъде „почистена" post-hoc.
- **Устойчивост на cleaner-и:** данни, събирани **на живо и предадени към сървъра веднага**, не могат да бъдат wiped по-късно, за разлика от локален forensic snapshot.
- **Не се флагвай като PUP:** подписан (code-signing/EV), прозрачен, EAC-friendly client — избягва Malwarebytes/AV триенето, което мъчи detect.ac.
- **DMA/hardware defense:** TPM/secure-boot attestation + server-side behavior вместо само USB device-log cross-ref.
- **Взимай доброто:** широкият им artifact-parsing (Prefetch/USN/Amcache/SRUM/IFEO/registry) е добър **forensic модул за след-инцидент** — предлагаме го като допълнение върху живия AC, а не като целия продукт.

## Източници
- detect.ac (homepage, `/changelogs` v3.3.0 2026-07-01, `/tools`) — fetched 2026-07-06 (HTTP 200).
- Trustpilot detect.ac (мета) — *„deep forensic investigation… in under 1 minute… anti-forensic modifications that live AntiCheats simply cannot detect"*.
- Malwarebytes forums (снипет) — *„detect.ac False Positive - File Detections"* (PUP флаг).
- reddit.com/r/EulenCheats/comments/14bvis8 — cleaner-и bypass-ват forensic SS-скенери (echo/detect клас).
- unknowncheats.me/forum/anti-cheat-bypass/ — обща сцена за AC bypass (memory/kernel/spoof/DMA).
- Конкурентен контекст: Ocean Anti-Cheat (anticheat.ac), detect.wtf, fiveguard.net — сходни forensic SS-скенери.

## Отворени въпроси / за доуточняване [?]
- Точна цена/лицензен модел (заключено зад Login/Purchase).
- Има ли detect.ac реален FiveM server-side компонент, или чисто client-scan (изглежда чисто scan).
- Автентичност на „710+ methods / 1M+ players / <0.1% FP" — маркетингови числа без независим одит.
