# Змия 🐍

Нативна Android игра — реплика на класическата **Snake II** от Nokia 3310,
с автентична жълто-зелена LCD естетика и пикселни спрайтове.

Продукт на **Carbon Stealth VCC** · част от монорепото Few-few.

## Възможности
- Решетъчно поле с integer scaling и letterbox (LCD усещане, без разтягане).
- Змия, която расте при изяждане на храна; **9 нива** на скорост.
- **Точки според нивото** + периодична бонус „буболечка“ за двойни точки.
- Класически режим: **стена = смърт**.
- Управление със **swipe жестове** по цялото поле **или** екранни стрелки (D-pad).
- **Вибрация** при смърт и при изяждане (визуал + хаптик — достъпно за глухи).
- Заглавен екран → игра → авто-пауза (при излизане) → „Край на играта" с **рекорд**.
- Текст на **български** (и английски в `values-en/`).
- **Нула мрежа, нула тайни, нула тежки библиотеки.**

## Как да билднеш
Нужен е Android SDK (Android Studio или `sdkmanager`). Пътят до SDK се задава в
`local.properties` (`sdk.dir=...`; файлът НЕ се комитва).

```bash
cd snake
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
```

Инсталиране на свързано устройство:
```bash
./gradlew installDebug
```

## Качество
```bash
./gradlew lint test
```
- **Android Lint** — статичен анализ.
- **JVM unit тестове** за `GameEngine` (чиста логика без Android).

## Технологии
Kotlin · custom `View` + `Canvas` · `Choreographer` game loop ·
Gradle Kotlin DSL (8.14.3) · AGP 8.7.3 · minSdk 24 · targetSdk 35.
Без Compose, без външни игрови двигатели.

## Структура
```
app/src/main/java/eu/carbonstealth/snake/
├── engine/        логика без Android (тестваема)
├── render/        LcdTheme + Sprites (данно-управляван рендер)
├── SnakeView.kt   рендер + game loop + жестове
├── MainActivity   заглавен екран
├── GameActivity   игрален екран
├── Scores.kt      рекорд (SharedPreferences)
└── Haptics.kt     вибрация
```

## Лиценз
Собственически (proprietary), Carbon Stealth VCC.
