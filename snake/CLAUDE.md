# CLAUDE.md — „Змия“ (нативно Android приложение)

Реплика на **Snake II** от Nokia 3310. Самостоятелен продукт в монорепото Few-few;
**не споделя код** с останалите. Работи се само в `snake/`.

## Стек
- **Kotlin 2.0.21**, нативен Android — **БЕЗ Jetpack Compose**, без тежки зависимости.
- Рендер: custom `View` + `Canvas`, game loop през `Choreographer`.
- Gradle **Kotlin DSL**, wrapper на **Gradle 8.14.3**, **AGP 8.7.3**.
- `applicationId = eu.carbonstealth.snake`, име „Змия“.
- `minSdk 24`, `compileSdk/targetSdk 35`.
- Единствено разрешение: `VIBRATE`. **Нула мрежа.**

## Архитектура (чисто разделение)
- `engine/` — **чиста логика без Android** (`GameEngine`, `Direction`, `Point`,
  `GameConfig`, `GameState`, `TickResult`). Напълно unit-тестваема на JVM.
- `render/` — **данно-управляван** рендер: `LcdTheme` (всички цветове на едно място)
  и `Sprites` (спрайтове като `Array<IntArray>` битови маски). Смяна на визията =
  само тук.
- `SnakeView` — рендер + game loop + swipe жестове.
- `MainActivity` (заглавен екран/избор на ниво) · `GameActivity` (игра + D-pad + оверлей).
- `Scores` (рекорд през `SharedPreferences`) · `Haptics` (вибрация).

## Билд и качество
```bash
cd snake
./gradlew assembleDebug     # .apk (debug)
./gradlew lint test         # quality gate: Android Lint + JVM unit тестове
./gradlew assembleRelease    # R8/minify + shrinkResources
```
> Изисква Android SDK (`local.properties` → `sdk.dir`, gitignore-нат).
> `local.properties`, `.gradle/`, `build/`, `*.keystore` НЕ се комитват.

## Конвенции
- Коментари и UI текст на **български** (`res/values/`), английски в `res/values-en/`.
- Следвай Kotlin official code style (`kotlin.code.style=official`).
- Логиката стои в `engine/` (тестваема); Android слоят е тънък адаптер.
- **Достъпност (EN 301 549 / WCAG 2.1 AA):** обратната връзка при смърт/изяждане е
  визуална **и** хаптична — никога само звук (играта няма звук). D-pad бутоните имат
  `contentDescription`.
- Всяка визуална константа минава през `LcdTheme`/`Sprites` — без разпръснати цветове.

## Тестове
`app/src/test/.../GameEngineTest.kt` — движение, забрана за 180°, растеж/точки,
качване на ниво, удар в стена, wrap, сблъсък със себе си, скорост по нива.
