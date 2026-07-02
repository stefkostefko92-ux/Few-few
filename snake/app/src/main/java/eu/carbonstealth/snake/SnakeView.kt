package eu.carbonstealth.snake

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import eu.carbonstealth.snake.engine.Direction
import eu.carbonstealth.snake.engine.GameConfig
import eu.carbonstealth.snake.engine.GameEngine
import eu.carbonstealth.snake.engine.GameState
import eu.carbonstealth.snake.engine.TickResult
import eu.carbonstealth.snake.render.LcdTheme
import eu.carbonstealth.snake.render.Sprites
import kotlin.math.abs

/**
 * Изгледът, който рисува игралното поле върху [Canvas] и върти game loop-а
 * през [Choreographer]. Логиката живее изцяло в [GameEngine]; тук е само рендер
 * + вход (swipe жестове; екранните бутони извикват [onDirection]).
 *
 * Рендерът е с integer scaling + letterbox — LCD естетика без разтягане.
 */
class SnakeView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0,
) : View(context, attrs, defStyle), Choreographer.FrameCallback {

    /** Игровото ядро. Публично за да чете Activity-то резултат/състояние. */
    var engine: GameEngine = GameEngine(GameConfig())
        private set

    /** Известява за промяна на резултата (за да опресни Activity-то UI-а). */
    var onScoreChanged: ((score: Int, level: Int) -> Unit)? = null

    /** Известява за край на играта (Activity → вибрация + оверлей). */
    var onGameOver: ((score: Int) -> Unit)? = null

    /** Известява за изяждане (Activity → лек хаптик). */
    var onEat: ((bonus: Boolean) -> Unit)? = null

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isAntiAlias = false }
    private var running = false
    private var lastFrameNanos = 0L
    private var accumulatorMs = 0.0

    /** Време на текущия кадър (ms) — фаза за мигането; замръзва при пауза. */
    private var frameNowMs = 0L

    // Геометрия на текущия кадър (integer scaling на ниво LCD dot).
    private var dotPx = 0
    private var gapPx = 0
    private var cellPx = 0
    private var offsetX = 0
    private var offsetY = 0

    /** Кеширан статичен LCD фон (олив + решетъчна фуга) — прерисува се само при resize. */
    private var bgBitmap: android.graphics.Bitmap? = null

    private val gestureDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true

            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float,
            ): Boolean {
                val dx = e2.x - (e1?.x ?: return false)
                val dy = e2.y - e1.y
                if (abs(dx) > abs(dy)) {
                    onDirection(if (dx > 0) Direction.RIGHT else Direction.LEFT)
                } else {
                    onDirection(if (dy > 0) Direction.DOWN else Direction.UP)
                }
                return true
            }
        },
    )

    /** Създава ново раздаване с дадена конфигурация и рисува READY състоянието. */
    fun newGame(config: GameConfig) {
        engine = GameEngine(config)
        accumulatorMs = 0.0
        onScoreChanged?.invoke(engine.score, engine.level)
        invalidate()
    }

    /** Подава посока (от swipe или екранен бутон); стартира при първи вход. */
    fun onDirection(dir: Direction) {
        if (engine.state == GameState.READY) engine.start()
        engine.setDirection(dir)
    }

    /** Стартира/възобновява game loop-а (извиквай от Activity.onResume). */
    fun resumeLoop() {
        if (running) return
        if (engine.state == GameState.GAME_OVER) return
        running = true
        lastFrameNanos = 0L
        Choreographer.getInstance().postFrameCallback(this)
    }

    /** Спира game loop-а и поставя играта на пауза (Activity.onPause). */
    fun pauseLoop() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
        engine.pause()
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return

        if (lastFrameNanos != 0L) {
            val deltaMs = (frameTimeNanos - lastFrameNanos) / 1_000_000.0
            // Клампваме, за да не „препуска“ след дълга пауза.
            accumulatorMs += deltaMs.coerceAtMost(250.0)

            val interval = engine.tickIntervalMs().toDouble()
            while (accumulatorMs >= interval && engine.state == GameState.RUNNING) {
                accumulatorMs -= interval
                when (engine.tick()) {
                    TickResult.ATE_FOOD -> {
                        onEat?.invoke(false)
                        onScoreChanged?.invoke(engine.score, engine.level)
                    }
                    TickResult.ATE_BONUS -> {
                        onEat?.invoke(true)
                        onScoreChanged?.invoke(engine.score, engine.level)
                    }
                    TickResult.DIED -> {
                        running = false
                        onGameOver?.invoke(engine.score)
                    }
                    else -> Unit
                }
            }
        }
        lastFrameNanos = frameTimeNanos
        frameNowMs = frameTimeNanos / 1_000_000
        invalidate()

        if (running) Choreographer.getInstance().postFrameCallback(this)
    }

    // --- Рендер ---------------------------------------------------------------

    override fun onDraw(canvas: Canvas) {
        // Корпус на „телефона“ (letterbox).
        canvas.drawColor(LcdTheme.LETTERBOX)

        ensureGeometry()
        val bg = bgBitmap ?: return
        canvas.drawBitmap(bg, offsetX.toFloat(), offsetY.toFloat(), null)

        // Мигане ≤2 Hz (цикъл 600 ms: 400 видима / 200 „свита“) — безопасно по WCAG 2.3.1.
        val blinkOn = frameNowMs % BLINK_CYCLE_MS < BLINK_VISIBLE_MS

        // Спрайтове: ориентирана глава, шахматно тяло, ориентирана опашка.
        val body = engine.snake
        drawSprite(canvas, engine.head.x, engine.head.y, Sprites.head(engine.direction))
        for (i in 1 until body.size - 1) {
            drawSprite(canvas, body[i].x, body[i].y, Sprites.BODY)
        }
        if (body.size > 1) {
            val tail = body.last()
            drawSprite(canvas, tail.x, tail.y, Sprites.tail(dirBetween(tail, body[body.size - 2])))
        }
        // Храната мига „меко“ — пълна ↔ 2×2 ядро (никога не изчезва напълно).
        drawSprite(canvas, engine.food.x, engine.food.y, if (blinkOn) Sprites.FOOD else Sprites.FOOD_CORE)
        // Бонус буболечката мига осезаемо — включена/изключена (пак ≤2 Hz).
        engine.bonus?.let { if (blinkOn) drawSprite(canvas, it.x, it.y, Sprites.BONUS) }
    }

    /** Преизчислява геометрията и статичния LCD фон при промяна на размера. */
    private fun ensureGeometry() {
        val gw = engine.config.gridWidth
        val gh = engine.config.gridHeight
        val res = LcdTheme.SPRITE_RES

        // Integer scaling на ниво LCD dot — така фугата е равномерна навсякъде.
        val newDotPx = minOf(width / (gw * res), height / (gh * res)).coerceAtLeast(1)
        val newCellPx = newDotPx * res
        val boardW = newCellPx * gw
        val boardH = newCellPx * gh
        offsetX = (width - boardW) / 2
        offsetY = (height - boardH) / 2

        if (newDotPx == dotPx && bgBitmap?.width == boardW && bgBitmap?.height == boardH) return
        dotPx = newDotPx
        cellPx = newCellPx
        gapPx = if (dotPx < LcdTheme.MIN_DOT_PX_FOR_GAP) {
            0
        } else {
            Math.round(dotPx * LcdTheme.GRID_GAP_RATIO).coerceAtLeast(1)
        }

        // Статичният фон: решетъчна фуга + „изключени“ dots — рисува се веднъж.
        bgBitmap?.recycle()
        val bmp = android.graphics.Bitmap.createBitmap(
            boardW,
            boardH,
            android.graphics.Bitmap.Config.ARGB_8888,
        )
        val c = Canvas(bmp)
        if (gapPx == 0) {
            c.drawColor(LcdTheme.BACKGROUND)
        } else {
            c.drawColor(LcdTheme.GRID)
            paint.color = LcdTheme.BACKGROUND
            val size = (dotPx - gapPx).toFloat()
            for (dy in 0 until gh * res) {
                val top = (dy * dotPx).toFloat()
                for (dx in 0 until gw * res) {
                    val left = (dx * dotPx).toFloat()
                    c.drawRect(left, top, left + size, top + size, paint)
                }
            }
        }
        bgBitmap = bmp
    }

    /** Посока от клетка [from] към съседната [to] (отчита wrap през ръба). */
    private fun dirBetween(
        from: eu.carbonstealth.snake.engine.Point,
        to: eu.carbonstealth.snake.engine.Point,
    ): Direction {
        val gw = engine.config.gridWidth
        val gh = engine.config.gridHeight
        // Нормализираме делтата до -1/0/+1 дори когато сегментът е „прехвърлен“ през стената.
        val dx = ((to.x - from.x + gw + gw / 2) % gw) - gw / 2
        val dy = ((to.y - from.y + gh + gh / 2) % gh) - gh / 2
        return when {
            dx > 0 -> Direction.RIGHT
            dx < 0 -> Direction.LEFT
            dy > 0 -> Direction.DOWN
            else -> Direction.UP
        }
    }

    /** Рисува една клетка от решетката като битова матрица от LCD dots. */
    private fun drawSprite(canvas: Canvas, cx: Int, cy: Int, mask: Array<IntArray>) {
        val res = LcdTheme.SPRITE_RES
        val originX = offsetX + cx * cellPx
        val originY = offsetY + cy * cellPx
        val size = (dotPx - gapPx).toFloat()
        paint.color = LcdTheme.PIXEL
        for (row in 0 until res) {
            for (col in 0 until res) {
                if (mask[row][col] == 0) continue
                val left = (originX + col * dotPx).toFloat()
                val top = (originY + row * dotPx).toFloat()
                canvas.drawRect(left, top, left + size, top + size, paint)
            }
        }
    }

    private companion object {
        /** Цикъл на мигане 600 ms (1.67 Hz — под прага 3/сек на WCAG 2.3.1). */
        const val BLINK_CYCLE_MS = 600L
        const val BLINK_VISIBLE_MS = 400L
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val handled = gestureDetector.onTouchEvent(event)
        if (event.action == MotionEvent.ACTION_UP) performClick()
        return handled || super.onTouchEvent(event)
    }
}
