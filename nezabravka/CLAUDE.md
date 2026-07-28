# nezabravka/ — „Незабравка“, лични записки с напомняне (iOS)

Нативно iOS приложение за **лична употреба**: записваш какво да не забравиш, избираш
ден и час, телефонът те подсеща. Известията са **локални** (`UNUserNotificationCenter`) —
няма акаунт, няма сървър, няма APNs, нищо не излиза от устройството.

_Стек: Swift 6 · SwiftUI · SwiftData · UserNotifications · iOS 17+. Кореновите правила
са в кореновия [`CLAUDE.md`](../CLAUDE.md)._

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
swift test                                               # 44 теста (Swift Testing)
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
   преживява рестарт и пълната подмяна на плана.
4. **Пълна подмяна при синхронизация** (`removeAllPendingNotificationRequests` + план) —
   изтрито/променено напомняне не може да остави призрачно известие.
5. **Календарна аритметика само през `Calendar`** — никакво „+86400 секунди“ (лятно време,
   месеци с различна дължина, 29 февруари имат тестове).
6. **Нула мрежа.** Няма `URLSession`, няма аналитика, няма акаунт. Ако някой ден потрябва
   синхрон между устройства — това е ново решение с GDPR преглед, не „дребна добавка“.

## Дребни неща, които хапят

- „Важно“ слага `interruptionLevel = .timeSensitive`. Без способността **Time Sensitive
  Notifications** (Xcode → Signing & Capabilities) iOS го третира като обикновено известие —
  това е приемливо, не е бъг.
- Пускане на личен телефон: безплатен Apple ID подписва за **7 дни** (после се преподписва
  от Xcode); платен разработчик — за година. Виж `README.md`.
- Езикът е български, твърдо: `developmentRegion = bg`, `CFBundleDisplayName = Незабравка`,
  `.environment(\.locale, Locale(identifier: "bg_BG"))`. Няма превод и не е нужен.
