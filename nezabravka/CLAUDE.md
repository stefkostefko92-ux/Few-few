# nezabravka/ — „Незабравка“, лични записки с напомняне (iOS)

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
стоят насрочени, как се групира списъкът), живее в `Nezabravka/Core/` **без** SwiftUI и
SwiftData. Същите файлове се компилират два пъти:

- в приложението (Xcode таргет `Nezabravka`, файлова синхронизация на цялата папка);
- като SwiftPM пакет `NezabravkaCore` (`Package.swift`, `path: Nezabravka/Core`) →
  `swift test` работи **на Linux, в CI, без Mac**.

Затова: **нов код с дати/известия влиза в `Core/` с тест**, а не във `View`-то.
Никога не викай `Date()` или `Calendar.isDateInToday(_:)` вътре в `Core/` — „сега“ се
подава като параметър (иначе логиката не се тества и „днес“ зависи от часа на пускане).

## Команди (от `nezabravka/`)

```bash
swift build                                              # ядрото
swift test                                               # 62 теста (Swift Testing)
swift format lint --strict --recursive Nezabravka Tests  # формат (гейт)
swift format --in-place --recursive Nezabravka Tests     # авто-поправка
python3 scripts/generate-icon.py                         # иконата (детерминистична)

# Целият проект — само на Mac с Xcode 16+:
open Nezabravka.xcodeproj
xcodebuild build -project Nezabravka.xcodeproj -scheme Nezabravka \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

**Гейт преди „готово“:** `swift format lint` + `swift build` + `swift test`. CI
(`.github/workflows/nezabravka.yml`) пуска точно това на всяка промяна в `nezabravka/`;
`xcodebuild` върви само ръчно (workflow_dispatch — macOS runner-ите са 10× по-скъпи).

## Подредба

```
Package.swift            SwiftPM манифест за ядрото (Linux/CI)
project.yml              XcodeGen манифест — резервен път за регенериране на проекта
Config/Info.plist        нарочно ИЗВЪН Nezabravka/ (иначе синхронизираната папка го копира
                         в бъндъла и билдът се чупи с „multiple commands produce“)
Nezabravka.xcodeproj/    objectVersion 77 → иска Xcode 16+; папката Nezabravka/ е
                         PBXFileSystemSynchronizedRootGroup → нов файл НЕ се добавя ръчно
Nezabravka/
  App/                   NezabravkaApp (ModelContainer + scheduler), RootView (scenePhase)
  Core/                  чистата логика — Foundation-only, тествана:
                         RepeatRule · ReminderSnapshot · OccurrenceCalculator
                         NotificationPlanner · ReminderGrouping · ReminderDateText
                         SnoozeOption · ReminderDefaults
  Models/Reminder.swift  @Model (SwiftData) + `snapshot` мост към Core
  Services/              NotificationService (UNUserNotificationCenter, категории,
                         действия) · ReminderScheduler (единствената точка, която пипа
                         базата И известията заедно)
  Views/                 ReminderListView · ReminderRow · ReminderEditorView
  Resources/             Assets.xcassets (икона + акцентен цвят)
Tests/NezabravkaCoreTests/
scripts/generate-icon.py нулеви зависимости, възпроизводима икона (CI го проверява)
```

## Инварианти (не ги чупи)

1. **iOS пази най-много 64 чакащи локални известия** на приложение — над това се
   изхвърлят мълчаливо. `NotificationPlanner` държи бюджет (56), реже **цели**
   напомняния (не половин „делници“) и връща `skippedReminders`, което UI-ът показва.
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
6. **Нула мрежа.** Няма `URLSession`, няма аналитика, няма акаунт. Ако някой ден потрябва
   синхрон между устройства — това е ново решение с GDPR преглед, не „дребна добавка“.

## Дребни неща, които хапят

- „Важно“ слага `interruptionLevel = .timeSensitive`. Способността **Time Sensitive
  Notifications** иска entitlement от портала на Apple (на практика платено членство);
  без нея iOS го третира като обикновено известие — приемливо, не е бъг.
- „Готово“ **от известието** приключва текущото задействание, не поредицата: повтарящо
  се напомняне не се архивира с едно натискане. От списъка (swipe) „Готово“ архивира
  целия запис — това е различно действие нарочно.
- Пускане на личен телефон: iOS 16+ иска включен **Режим за разработчици** на телефона;
  безплатен Apple ID подписва за **7 дни**, 3 устройства, 10 App ID. Виж `README.md`.
- `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone+iPad). Ако продуктът някога тръгне към App
  Store като iPhone-only, смени на `"1"` — иначе Apple иска и iPad скрийншоти.
- Езикът е български, твърдо: `developmentRegion = bg`, `CFBundleDisplayName = Незабравка`,
  `.environment(\.locale, Locale(identifier: "bg_BG"))`. Няма превод и не е нужен.
