package eu.carbonstealth.snake.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * JVM unit тестове за [GameEngine] — чиста логика, без Android.
 * Покриват: движение, забрана за 180°, растеж/точки, ниво, сблъсък със стена,
 * wrap, сблъсък със себе си и скоростта по нива.
 */
class GameEngineTest {

    private fun engine(
        w: Int = 20,
        h: Int = 24,
        wrap: Boolean = false,
        startLen: Int = 3,
        level: Int = 1,
        seed: Long = 42,
    ) = GameEngine(
        GameConfig(gridWidth = w, gridHeight = h, wrap = wrap, startLength = startLen, startLevel = level),
        Random(seed),
    )

    @Test
    fun `движение придвижва главата надясно`() {
        // Проверяваме позицията на главата (инвариант), независимо дали точно
        // отпред е паднала храна — стартовата посока винаги е надясно.
        val e = engine()
        e.start()
        val before = e.head
        e.tick()
        assertEquals(before.x + 1, e.head.x)
        assertEquals(before.y, e.head.y)
    }

    @Test
    fun `забранен е завой на 180 градуса`() {
        val e = engine()
        e.start()
        e.setDirection(Direction.LEFT) // обратна на надясно → игнорира се
        val before = e.head
        e.tick()
        assertEquals(before.x + 1, e.head.x) // продължава надясно
        assertEquals(before.y, e.head.y)
    }

    @Test
    fun `удар в стена е смърт в класически режим`() {
        val e = engine(w = 6, h = 6, wrap = false)
        e.start()
        var result = TickResult.NONE
        for (i in 0 until 10) {
            e.setDirection(Direction.RIGHT)
            result = e.tick()
            if (result == TickResult.DIED) break
        }
        assertEquals(TickResult.DIED, result)
        assertTrue(e.isGameOver)
    }

    @Test
    fun `wrap режим прехвърля през стената`() {
        val e = engine(w = 6, h = 6, wrap = true)
        e.start()
        // Глава стартира на (3,3) и гледа надясно; след 3 стъпки минава от x=5 към x=0.
        e.tick() // 4
        e.tick() // 5
        e.tick() // wrap → 0
        assertEquals(0, e.head.x)
        assertFalse(e.isGameOver)
    }

    @Test
    fun `изяждане на храна расте и дава точки`() {
        val e = engine()
        e.start()
        val lenBefore = e.snake.size
        driveTo(e, e.food)
        assertTrue("змията трябва да порасне", e.snake.size > lenBefore)
        assertTrue("точките трябва да са положителни", e.score > 0)
    }

    @Test
    fun `нивото се качва след пет храни`() {
        val e = engine(level = 1)
        e.start()
        feedUntilFoods(e, 5)
        assertEquals(2, e.level)
    }

    @Test
    fun `сблъсък със собственото тяло е смърт`() {
        val e = engine()
        e.start()
        // Пораства до дължина ≥6, за да има гарантирано сегмент зад врата.
        feedUntilLength(e, 6)
        // Придвижваме се към центъра, далеч от стените.
        if (!e.isGameOver) driveTo(e, Point(e.config.gridWidth / 2, e.config.gridHeight / 2))
        // Три завоя по часовниковата стрелка образуват единичен квадрат →
        // главата се връща в клетка, заета от тялото.
        var dir = e.direction
        repeat(3) {
            if (e.isGameOver) return@repeat
            dir = clockwise(dir)
            e.setDirection(dir)
            e.tick()
        }
        assertTrue("маневрата трябва да е фатална", e.isGameOver)
    }

    @Test
    fun `скоростта е по-висока на по-високо ниво`() {
        val slow = engine(level = 1).tickIntervalMs()
        val fast = engine(level = 9).tickIntervalMs()
        assertTrue("ниво 9 трябва да е по-бързо от ниво 1", fast < slow)
        assertNotEquals(slow, fast)
    }

    // --- помощни навигационни функции за тестовете --------------------------

    private fun clockwise(dir: Direction): Direction = when (dir) {
        Direction.RIGHT -> Direction.DOWN
        Direction.DOWN -> Direction.LEFT
        Direction.LEFT -> Direction.UP
        Direction.UP -> Direction.RIGHT
    }

    /** Една стъпка към целта, избягвайки забранения завой на 180°. */
    private fun stepToward(e: GameEngine, target: Point): TickResult {
        val h = e.head
        val cur = e.direction
        val wantX = when {
            h.x < target.x -> Direction.RIGHT
            h.x > target.x -> Direction.LEFT
            else -> null
        }
        val wantY = when {
            h.y < target.y -> Direction.DOWN
            h.y > target.y -> Direction.UP
            else -> null
        }
        val prefs = listOfNotNull(wantX, wantY)
        val dir = prefs.firstOrNull { it != cur.opposite() }
            ?: Direction.entries.first { it != cur && it != cur.opposite() }
        e.setDirection(dir)
        return e.tick()
    }

    /** Кара змията до дадена клетка (или докато нещо се случи). */
    private fun driveTo(e: GameEngine, target: Point): TickResult {
        repeat(2000) {
            if (e.head == target) return TickResult.MOVED
            val r = stepToward(e, target)
            if (r == TickResult.ATE_FOOD || r == TickResult.ATE_BONUS || r == TickResult.DIED) return r
        }
        throw AssertionError("навигацията не стигна целта $target")
    }

    /** Храни змията, докато достигне дадена дължина. */
    private fun feedUntilLength(e: GameEngine, len: Int) {
        var guard = 0
        while (e.snake.size < len) {
            driveTo(e, e.food)
            if (e.isGameOver) throw AssertionError("умря по време на хранене")
            if (++guard > 200) throw AssertionError("твърде много опити за хранене")
        }
    }

    /**
     * Храни змията, докато изяде точно N ХРАНИ (брои реалните [TickResult.ATE_FOOD]
     * събития — бонусът също расте, но НЕ се брои за храна и не качва ниво).
     */
    private fun feedUntilFoods(e: GameEngine, foods: Int) {
        var eaten = 0
        var guard = 0
        while (eaten < foods) {
            if (driveTo(e, e.food) == TickResult.ATE_FOOD) eaten++
            if (e.isGameOver) throw AssertionError("умря по време на хранене")
            if (++guard > 500) throw AssertionError("твърде много опити за хранене")
        }
    }
}
