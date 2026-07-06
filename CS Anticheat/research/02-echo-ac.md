# Security Teardown: echo.ac

> Изследване за проекта **CS Anticheat** (Carbon Stealth). Цел: да разберем детекцията, слабостите и bypass-ите на конкурента, за да го надминем.
> Дата на проверката: 2026-07-06. Метод: директно fetch-ване на echo.ac + под-страници, DuckDuckGo/DDG-lite, публичен bypass-репозиторий в GitHub, Reddit/UnknownCheats снипети.
> Легенда: **[П]** = потвърдено от източник · **[С]** = спекулация/извод · **[?]** = за доуточняване.

---

## 0. TL;DR
echo.ac **не е real-time античийт**. Това е **forensic „screenshare" (SS) инструмент** — прави еднократна снимка на Windows artefacts на заподозрения PC и търси *следи*, че чийт някога е бил пускан. Позиционира се дословно като *„Screenshare tools and client-side anticheats"* и *„SS tools are one of the best ways you can keep cheaters away"* **[П]** (echo.ac homepage, Trustpilot описание). Това е коренно различен клас от това, което ние строим (жив AC, интегриран в FiveM сървъра). Слабостите му следват директно от архитектурата: **потребителят сам пуска скенера, еднократно, след факта** → тривиално се заобикаля с cleaner, renaming или просто затваряне на прозореца.

---

## 1. Архитектура на детекцията

- **Клас:** post-hoc forensic scanner / screenshare-replacement, **usermode**, **не** kernel-driver. **[П]** (позициониране + няма и следа от driver/real-time в маркетинга; „client-side anticheats" в маркетинга е усукано — реалната работа е forensic scan).
- **Интеграция с FiveM:** НЯМА server resource, НЯМА жива връзка към сървъра. Staff-ът кара заподозрения да свали и пусне **client scanner**; след ~60s се генерира **PIN** и се публикува „scan" на `scan.echo.ac/<uuid>`. **[П]** (homepage: *„Scanning processes... Scan complete (in ~60.5s)! Your PIN was 9 1 5 0 4 6."*; DDG резултат `scan.echo.ac/0fdbcea1-8cea-429a-b5d2-f7e6b648d35b — GTA-V RP Scan - Detected`).
- **Клиентски агент:** временен скенер, който потребителят изпълнява сам; резултатите се качват към сървърите на echo. **[П]** (bypass README: *„Echo uses an external program to collect this data and send it to their servers"*).
- **Anti-tamper / obfuscation:** практически няма сериозен. Ключов collector-компонент е **непроменен публичен GitHub инструмент** (`ntfsDump.exe`), пуснат под чуждо име, без промени и без кредит. **[П]** (github.com/Leaker0000/Echo.ac-bypass).
- **Поддържани игри:** Minecraft, Rust, FiveM, Roblox. **[П]** (homepage).

## 2. Detection методи (какво реално прави)

echo парсва **Windows forensic artefacts** локално и търси хеш-съвпадения/следи:

- **Prefetch анализ** — чете `C:\Windows\Prefetch`, за да види кои `.exe` са били изпълнявани; сравнява по **хешове на известни чийт-executable-и**. Collector-ът е `ntfsDump.exe`. **[П]** (bypass README: *„check if certain .exe files (based on their hashes) have ever run… by reading your Prefetch folder"*).
- **File Logs / timeline** — Deleted / Renamed / Executed / Downloaded файлове с timestamp-и (парсва USN Journal / MFT). Пример от самия сайт: `Executed AnyDesk.exe`, `Renamed AnyDesk.exe → Teamviewer.exe`. **[П]** (homepage „File Logs"). Целта е и remote-access tools (AnyDesk/TeamViewer = скрит „ghost" оператор).
- **Custom String Builder** — staff-ът добавя собствени сигнатури; може да **качи executable**, който echo автоматично хешва и добавя за детекция. **[П]** (homepage).
- **HWID marking** — маркира HWID при бан за откриване на **ban evasion**. **[П]** (homepage: *„marking players HWID, to catch any ban evasion"*).
- **Категории, които рекламира, че лови:** `Injected cheat DLLs`, `Used cheat scripts`, `Used FiveM cheats`, `Detected ghost client`, `Cleared recycle bin`. **[П]** (homepage sample results).
- **[С]** Няма доказателство за: memory scanning на жив процес, real-time behavioral анализ, screenshot capture по време на игра, kernel integrity. Всичко е **residual-trace forensic**.

## 3. Feature set

- **Scanner + PIN workflow**, ~60s. **[П]**
- **Publish Scan / share via link** (`scan.echo.ac/<uuid>`) — споделяне между staff. **[П]**
- **HWID ban / ban-evasion tracking.** **[П]**
- **Tool Designer** — rebrand на скенера (лого, цветове, теми) за всеки клиент. **[П]**
- **Custom String Builder** + upload на executable за авто-детекция. **[П]**
- **Discord + API** (нав. линкове „Discord", „API"). **[П]** (homepage nav).
- **[?]** Dashboard/ban management дълбочина — заключена зад Login, не потвърдена.

## 4. Известни BYPASS-и и слабости (най-важното)

1. **Rename-to-collector (`ntfsDump.exe`)** — понеже echo пуска собствения си `ntfsDump.exe` в background, преименуване на чийта на `ntfsDump.exe` го скрива от собствения му скан. **[П]** *„rename your cheat to ntfsDump.exe – yeah, it really works"* (Leaker0000/Echo.ac-bypass). Класически self-whitelisting провал.
2. **Затваряне на скенера по време на скан** — потребителят просто убива прозореца/процеса. **[П]** (същия README).
3. **Trace cleaners** — cleaner изтрива strings/Prefetch/USN следи и заобикаля echo за Eulen, Skript, Ghost, Susano. **[П]** (Reddit r/EulenCheats: *„clean absolutely all traces… it also bypass Echo.ac scans (Eulen, Skript, Gosth and Susano)"*).
4. **Непроменен публичен tool = предвидим** — понеже collector-ът е known open-source код, атакуващият знае точно какви artefacts се четат и как да ги замърси/изчисти. **[П]** (bypass README, „didn't even bother to modify it").
5. **Post-hoc + user-run = фундаментално слабо** — чийтът може да е затворен, паметта изчистена, artefacts wiped **преди** сканирането. Не лови **активен** aimbot/ESP, само остатъци. **[С, силен извод от архитектурата]**
6. **DMA / external hardware & kernel cheats** — оставят почти нулеви host artefacts; forensic Prefetch/USN подход е сляп за тях. **[С]**
7. **VM / spoofer / sandbox** — потребителят контролира машината, на която пуска скенера → може да подаде спуфнати данни. **[С]**

## 5. Атакова повърхност — къде НИЕ печелим

- **Real-time вместо post-hoc:** живият AC (server resource + подписан client) лови **активна** инжекция, memory tampering и aimbot-поведение **server-side** — цял клас, който echo структурно не покрива.
- **Не разчитай на „честно пуснат от заподозрения" скенер:** нашата детекция трябва да е винаги-активна и tamper-resistant, не еднократен self-run.
- **Не преизползвай непроменен публичен tool под чуждо име** (fingerprintable, self-whitelist bug). Собствен, обфускиран, подписан collector.
- **Anti-cleaner устойчивост:** щом cleaner-ите бият forensic подхода, залагай на **server-side behavioral + real-time integrity**, които cleaner-ът не може да изтрие след факта.
- **HWID + hardware attestation** (TPM/secure-boot), а не само маркиране на HWID при бан.
- echo покрива Prefetch/USN/HWID добре като *допълнение* — можем да предложим forensic снапшот **като модул** върху жив AC, не като целия продукт.

## Източници
- echo.ac (homepage, под-страници) — fetched 2026-07-06 (HTTP 200).
- github.com/Leaker0000/Echo.ac-bypass (README) — потвърждава Prefetch/`ntfsDump.exe`/rename bypass.
- reddit.com/r/EulenCheats/comments/14bvis8 — cleaner bypass на echo.ac.
- unknowncheats.me/forum/anti-cheat-bypass/695485 (снипет) — *„Echo.ac… detect cheating software, primarily used in RP servers (FiveM)… scans for cheat"*.
- Trustpilot echo.ac (мета-описание) — *„Screenshare tools and client-side anticheats… server-side anticheats often struggle"*.
- Конкурентен контекст: Ocean Anti-Cheat (anticheat.ac), fiveguard.net, detect.wtf — сходни forensic SS-инструменти.
