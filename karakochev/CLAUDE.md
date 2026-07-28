# karakochev/ — „Каракочев“, лични записки с напомняне (iOS)

Нативно iOS приложение за **лична употреба**: записваш какво да не забравиш, избираш
ден и час, телефонът те подсеща. Известията са **локални** (`UNUserNotificationCenter`) —
няма акаунт, няма сървър, няма APNs, нищо не излиза от устройството.

_Стек: Swift 6 toolchain · SwiftUI · SwiftData · UserNotifications · iOS 17+.
Приложният таргет върви в **Swift 5 language mode** със `SWIFT_STRICT_CONCURRENCY =
complete` (пълната проверка е налична, но като предупреждения — билдът не се чупи от
нея); ядрото през SwiftPM е в Swift 6 режим. Кореновите правила са в кореновия
[`CLAUDE.md`](../CLAUDE.md)._

## Ключово решение: ядрото е Foundation-only

Цялата логика, която може да сбърка (кога се задейства повторение, кои известия да
стоят насрочени, как се групира списъкът), живее в `Karakochev/Core/` **без** SwiftUI и
SwiftData. Същите файлове се компилират два пъти:

- в приложението (Xcode таргет `Karakochev`, файлова синхронизация на цялата папка);
- като SwiftPM пакет `KarakochevCore` (`Package.swift`, `path: Karakochev/Core`) →
  `swift test` работи **на Linux, в CI, без Mac**.

Затова: **нов код с дати/известия влиза в `Core/` с тест**, а не във `View`-то.
Никога не викай `Date()` или `Calendar.isDateInToday(_:)` вътре в `Core/` — „сега“ се
подава като параметър (иначе логиката не се тества и „днес“ зависи от часа на пускане).

## Команди (от `karakochev/`)

```bash
swift build                                              # ядрото
swift test                                               # 70 теста (Swift Testing)
swift format lint --strict --recursive Karakochev Tests  # формат (гейт)
swift format --in-place --recursive Karakochev Tests     # авто-поправка
python3 scripts/generate-icon.py                         # иконата (детерминистична)

# Целият проект — само на Mac с Xcode 16+:
open Karakochev.xcodeproj
xcodebuild build -project Karakochev.xcodeproj -scheme Karakochev \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

**Гейт преди „готово“:** `swift format lint` + `swift build` + `swift test`. CI
(`.github/workflows/karakochev.yml`) пуска точно това на всяка промяна в `karakochev/`;
`xcodebuild` върви само ръчно (workflow_dispatch — macOS runner-ите са 10× по-скъпи).

## Подредба

```
Package.swift            SwiftPM манифест за ядрото (Linux/CI)
project.yml              XcodeGen манифест — резервен път за регенериране на проекта
Config/Info.plist        нарочно ИЗВЪН Karakochev/ (иначе синхронизираната папка го копира
                         в бъндъла и билдът се чупи с „multiple commands produce“)
Karakochev.xcodeproj/    objectVersion 77 → иска Xcode 16+; папката Karakochev/ е
                         PBXFileSystemSynchronizedRootGroup → нов файл НЕ се добавя ръчно
Karakochev/
  App/                   KarakochevApp (ModelContainer + scheduler), RootView (scenePhase)
  Core/                  чистата логика — Foundation-only, тествана:
                         RepeatRule · ReminderSnapshot · OccurrenceCalculator
                         NotificationPlanner · ReminderGrouping · ReminderDateText
                         SnoozeOption · ReminderDefaults
  Models/Reminder.swift  @Model (SwiftData) + `snapshot` мост към Core
  Services/              NotificationService (UNUserNotificationCenter, категории,
                         действия) · ReminderScheduler (единствената точка, която пипа
                         базата И известията заедно)
  Views/                 ReminderListView · ReminderRow · ReminderEditorView
  Resources/             Assets.xcassets — икона + палитрата на Carbon Stealth:
                         AccentColor (циан #00697A светло / #00E5FF тъмно — чистият
                         бранд циан е нечетим върху бяло, 1.4:1) · BrandBackground
                         (#F2F5F7 / въглерод #00020A) · BrandSurface · OverdueColor ·
                         WarningColor
Tests/KarakochevCoreTests/
scripts/generate-icon.py нулеви зависимости, възпроизводима икона (CI го проверява)
```

## Инварианти (не ги чупи)

1. **iOS пази най-много 64 чакащи локални известия** на приложение — над това се
   изхвърлят мълчаливо. `NotificationPlanner` държи бюджет (56) и реже **цели**
   напомняния (не половин „делници“). Непобралото се обаче **не мълчи**: получава
   една еднократна заявка за най-близкия си час (`|budget`), защото повтарящите се
   тригери не изтичат и мястото никога не се освобождава само. UI-ът показва и
   `reducedReminders`, и `skippedReminders`.
2. **Повторение = повтарящ се тригер**, не списък от дати — иначе напомнянията свършват,
   ако приложението не се отваря. Изключение: повторение с начало в бъдещето (не може да
   се изрази с повтарящ се тригер) → първите 4 задействания поединично + пресинхронизация.
3. **Отлагането се пази в записа** (`snoozedUntil`), не като „висящо“ известие — така
   преживява рестарт и пълната подмяна на плана. То е **добавъчна** заявка: планирането
   ползва `patternOccurrences` (чист шаблон), за да не изяде стъпало от поредицата.
   Отлагането мести само **напред** — иначе „След 10 минути“ би дръпнало записка за
   другата седмица за днес и би изтрило избрания час.
4. **Пълна подмяна при синхронизация** (`removeAllPendingNotificationRequests` + план) —
   изтрито/променено напомняне не може да остави призрачно известие. Затова всяка
   мутация минава през `saveAndResync()`, а `resync()` е **сериализиран** (веригата
   `resyncTask`): `@MainActor async` не е взаимно изключващ се и два преплетени
   пресинхрона биха разменили половин план. Провален `fetch`/`save` **не** синхронизира
   празен план — по-добре стар план, отколкото изтрити известия.
5. **Календарна аритметика само през `Calendar`** — никакво „+86400 секунди“ (лятно време,
   месеци с различна дължина, 29 февруари имат тестове).
6. **Точните заявки носят часова зона, повтарящите се — не.** Без зона iOS тълкува
   компонентите в зоната при задействането: насрочено 08:30 в София, отворено в Токио →
   тригерът иска 08:30 JST, което е минало, и известие няма. За „всеки ден в 7“ обратното
   е вярно — там стенният час е смисълът, затова тези тригери остават без зона.
7. **Временна база (в паметта) НЕ синхронизира известия.** Ако `ModelContainer` падне на
   резервния път, списъкът изглежда празен — а празен план би изтрил всички насрочени
   известия за записи, които си стоят на диска. `isTemporaryStore` спира синхронизацията
   и показва банер.
8. **Нула мрежа.** Няма `URLSession`, няма аналитика, няма акаунт. Ако някой ден потрябва
   синхрон между устройства — това е ново решение с GDPR преглед, не „дребна добавка“.

## Дребни неща, които хапят

- „Важно“ слага `interruptionLevel = .timeSensitive`. Способността **Time Sensitive
  Notifications** иска entitlement от портала на Apple (на практика платено членство);
  без нея iOS го третира като обикновено известие — приемливо, не е бъг.
- „Готово“ **от известието** приключва текущото задействание, не поредицата: повтарящо
  се напомняне не се архивира с едно натискане. Плъзгането в списъка архивира целия
  запис — затова там етикетът за повторение е **„Спри“**, не „Готово“.
- Известни ъгли, за които няма поправка (документирани нарочно): ежедневно напомняне,
  насрочено за час, който изчезва при смяната на лятното време (03:00–03:59), и
  незапочнало повторение, чиито 4 поединични заявки свършват, ако приложението не се
  отвори месеци наред. И двете лекуват при първото отваряне.
- Пускане на личен телефон: iOS 16+ иска включен **Режим за разработчици** на телефона;
  безплатен Apple ID подписва за **7 дни**, 3 устройства, 10 App ID. Виж `README.md`.
- `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone+iPad). Ако продуктът някога тръгне към App
  Store като iPhone-only, смени на `"1"` — иначе Apple иска и iPad скрийншоти.
- Цветовете идват от палитрата на Carbon Stealth (`agents-dashboard/index.html`):
  въглерод #00020A + циан #00E5FF. Списъкът и редакторът гасят системния фон
  (`.scrollContentBackground(.hidden)`) и стъпват на `BrandBackground`/`BrandSurface`.
  Иконата се рисува от скрипта — отворен пръстен със стрелка, без илюстрация.
- Езикът е български, твърдо: `developmentRegion = bg`, `CFBundleDisplayName = Каракочев`,
  `.environment(\.locale, Locale(identifier: "bg_BG"))`. Няма превод и не е нужен.
