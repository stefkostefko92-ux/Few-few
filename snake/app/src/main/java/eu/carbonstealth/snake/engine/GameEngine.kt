package eu.carbonstealth.snake.engine

import kotlin.random.Random

/**
 * Чистата логика на играта „Змия“ — БЕЗ никакви Android зависимости,
 * за да е напълно unit-тестваема на JVM.
 *
 * Рендерът ([eu.carbonstealth.snake.SnakeView]) чете състоянието през
 * публичните пропъртита и извиква [tick] на интервал, зависещ от [tickIntervalMs].
 *
 * @param config начална конфигурация
 * @param random източник на случайност (инжектира се за детерминирани тестове)
 */
class GameEngine(
    val config: GameConfig = GameConfig(),
    private val random: Random = Random.Default,
) {
    /** Тяло на змията: индекс 0 = глава, последен = опашка. */
    private val _snake = ArrayDeque<Point>()
    val snake: List<Point> get() = _snake.toList()

    /** Позиция на главата (удобен достъп). */
    val head: Point get() = _snake.first()

    var food: Point = Point(0, 0)
        private set

    /** Бонус „буболечка“ — двойни точки; null когато я няма. */
    var bonus: Point? = null
        private set

    /** Оставащи tick-ове до изчезване на бонуса. */
    private var bonusTicksLeft = 0

    /** Tick-ове от последно появяване на бонус (за периодично пускане). */
    private var ticksSinceBonus = 0

    var score = 0
        private set

    var level = 1
        private set

    var state = GameState.READY
        private set

    /** Текуща посока (за рендер/тестове). */
    val direction: Direction get() = currentDirection

    /** Удобен флаг за край на играта. */
    val isGameOver: Boolean get() = state == GameState.GAME_OVER

    /** Колко храни са изядени (за качване на ниво). */
    private var foodEaten = 0

    private var currentDirection = Direction.RIGHT

    /** Заявена посока за следващия tick (не позволява 180° завой). */
    private var pendingDirection = Direction.RIGHT

    init {
        reset()
    }

    /** Връща играта в начално състояние според [config]. */
    fun reset() {
        _snake.clear()
        // Змията стартира хоризонтално в средата, гледаща надясно.
        val cy = config.gridHeight / 2
        val startX = config.startLength
        for (i in 0 until config.startLength) {
            // Глава най-вдясно, опашка най-вляво.
            _snake.addLast(Point(startX - i, cy))
        }
        currentDirection = Direction.RIGHT
        pendingDirection = Direction.RIGHT
        score = 0
        foodEaten = 0
        level = config.startLevel
        bonus = null
        bonusTicksLeft = 0
        ticksSinceBonus = 0
        state = GameState.READY
        spawnFood()
    }

    /** Стартира играта от READY състояние. */
    fun start() {
        if (state == GameState.READY || state == GameState.PAUSED) {
            state = GameState.RUNNING
        }
    }

    fun pause() {
        if (state == GameState.RUNNING) state = GameState.PAUSED
    }

    fun resume() {
        if (state == GameState.PAUSED) state = GameState.RUNNING
    }

    /**
     * Заявява нова посока. Игнорира се обратната посока (забранен завой на 180°),
     * защото би причинил моментален сблъсък с врата.
     */
    fun setDirection(dir: Direction) {
        if (dir != currentDirection.opposite()) {
            pendingDirection = dir
        }
    }

    /**
     * Придвижва играта с една стъпка. Връща какво се е случило,
     * за да може рендерът да задейства обратна връзка (хаптик/визуал).
     */
    fun tick(): TickResult {
        if (state != GameState.RUNNING) return TickResult.NONE

        currentDirection = pendingDirection

        val newHead = nextHead()

        // Сблъсък със стена (само в класически режим).
        if (newHead == null) {
            state = GameState.GAME_OVER
            return TickResult.DIED
        }

        // Ще изядем ли храна на тази стъпка? (тогава опашката не се маха)
        val willEatFood = newHead == food
        val willEatBonus = bonus != null && newHead == bonus

        // Сблъсък със собственото тяло. Опашката се освобождава, освен ако растем.
        if (hitsSelf(newHead, growing = willEatFood || willEatBonus)) {
            state = GameState.GAME_OVER
            return TickResult.DIED
        }

        _snake.addFirst(newHead)

        var result = TickResult.MOVED

        when {
            willEatFood -> {
                score += pointsForFood()
                foodEaten++
                maybeLevelUp()
                spawnFood()
                maybeSpawnBonus()
                result = TickResult.ATE_FOOD
                // Опашката НЕ се маха → растеж.
            }
            willEatBonus -> {
                score += pointsForBonus()
                bonus = null
                bonusTicksLeft = 0
                result = TickResult.ATE_BONUS
                // Бонусът също дава растеж.
            }
            else -> {
                // Нормално движение — освобождаваме опашката.
                _snake.removeLast()
            }
        }

        tickBonusTimer()
        return result
    }

    /** Изчислява следващата глава; null = удар в стена (класически режим). */
    private fun nextHead(): Point? {
        var nx = head.x + currentDirection.dx
        var ny = head.y + currentDirection.dy

        if (config.wrap) {
            nx = (nx + config.gridWidth) % config.gridWidth
            ny = (ny + config.gridHeight) % config.gridHeight
        } else if (nx < 0 || ny < 0 || nx >= config.gridWidth || ny >= config.gridHeight) {
            return null
        }
        return Point(nx, ny)
    }

    /**
     * Проверява сблъсък с тялото. Когато НЕ растем, последната клетка (опашката)
     * ще се освободи в този tick, затова не се брои за сблъсък.
     */
    private fun hitsSelf(newHead: Point, growing: Boolean): Boolean {
        val ignoreTail = !growing
        val lastIndex = _snake.size - 1
        _snake.forEachIndexed { index, cell ->
            if (ignoreTail && index == lastIndex) return@forEachIndexed
            if (cell == newHead) return true
        }
        return false
    }

    /** Точки за храна = текущото ниво (Snake II: по-високо ниво → повече точки). */
    private fun pointsForFood(): Int = level

    /** Бонус буболечката дава двойни точки. */
    private fun pointsForBonus(): Int = level * 2

    /** Качва нивото на всеки 5 изядени храни, до [GameConfig.MAX_LEVEL]. */
    private fun maybeLevelUp() {
        val target = (config.startLevel + foodEaten / FOODS_PER_LEVEL)
            .coerceAtMost(GameConfig.MAX_LEVEL)
        if (target > level) level = target
    }

    /** Периодично пуска бонус: на всеки [FOODS_PER_BONUS] изядени храни. */
    private fun maybeSpawnBonus() {
        if (bonus != null) return
        if (foodEaten > 0 && foodEaten % FOODS_PER_BONUS == 0) {
            val spot = randomFreeCell() ?: return
            bonus = spot
            bonusTicksLeft = BONUS_LIFETIME_TICKS
            ticksSinceBonus = 0
        }
    }

    private fun tickBonusTimer() {
        if (bonus != null) {
            bonusTicksLeft--
            if (bonusTicksLeft <= 0) {
                bonus = null
                bonusTicksLeft = 0
            }
        }
    }

    private fun spawnFood() {
        food = randomFreeCell() ?: run {
            // Няма свободна клетка → полето е запълнено (победа); спираме играта.
            state = GameState.GAME_OVER
            food
        }
    }

    /** Връща произволна свободна клетка (не заета от змия/храна/бонус) или null. */
    private fun randomFreeCell(): Point? {
        val occupied = HashSet<Point>(_snake)
        bonus?.let { occupied.add(it) }
        occupied.add(food)
        val total = config.gridWidth * config.gridHeight
        if (occupied.size >= total) return null

        // Избираме случаен старт и обхождаме линейно до първата свободна клетка —
        // равномерно и без безкраен цикъл дори при почти пълно поле.
        val startIndex = random.nextInt(total)
        for (offset in 0 until total) {
            val idx = (startIndex + offset) % total
            val p = Point(idx % config.gridWidth, idx / config.gridWidth)
            if (p !in occupied) return p
        }
        return null
    }

    /**
     * Интервал между tick-овете в милисекунди според нивото —
     * таблица по дизайнерския спек (Snake II усещане: ниво 1 ≈ 2.8 клетки/сек,
     * ниво 9 ≈ 11 клетки/сек).
     */
    fun tickIntervalMs(): Long = SPEED_MS_BY_LEVEL[level - 1]

    companion object {
        const val FOODS_PER_LEVEL = 5
        const val FOODS_PER_BONUS = 4
        const val BONUS_LIFETIME_TICKS = 30

        /** ms/стъпка за нива 1..9. */
        val SPEED_MS_BY_LEVEL = longArrayOf(360, 300, 250, 210, 180, 150, 130, 110, 90)
    }
}

/** Крайният резултат от един [GameEngine.tick]. */
enum class TickResult { NONE, MOVED, ATE_FOOD, ATE_BONUS, DIED }
