package eu.carbonstealth.snake.render

import eu.carbonstealth.snake.engine.Direction

/**
 * Спрайтове като битови матрици [Array]<[IntArray]> — данно-управляван рендер.
 * 1 = тъмен под-пиксел, 0 = фон. Всяка клетка от решетката се рисува с матрица
 * [LcdTheme.SPRITE_RES]×[LcdTheme.SPRITE_RES].
 *
 * По дизайнерския спек: тялото на Snake II е на шахматни точки (не плътно),
 * главата е плътна с „око“-дупка, опашката изтънява. Ориентираните спрайтове
 * (глава/опашка) са дефинирани за посока НАДЯСНО и се въртят с [rotated].
 */
object Sprites {

    /** Сегмент от тялото — шахматен растер (както в Snake II). Симетричен, не се върти. */
    val BODY: Array<IntArray> = arrayOf(
        intArrayOf(1, 0, 1, 0),
        intArrayOf(0, 1, 0, 1),
        intArrayOf(1, 0, 1, 0),
        intArrayOf(0, 1, 0, 1),
    )

    /** Глава (гледа НАДЯСНО) — плътна, с „око“ = изключен dot отпред-горе. */
    val HEAD: Array<IntArray> = arrayOf(
        intArrayOf(1, 1, 1, 1),
        intArrayOf(1, 1, 0, 1),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(1, 1, 1, 1),
    )

    /** Опашка (тялото е НАДЯСНО от нея) — изтъняващ клин, острието сочи назад. */
    val TAIL: Array<IntArray> = arrayOf(
        intArrayOf(0, 0, 1, 1),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(0, 0, 1, 1),
    )

    /** Храна — пикселна „хапка“ (мига мек цикъл: пълна ↔ ядро). */
    val FOOD: Array<IntArray> = arrayOf(
        intArrayOf(0, 1, 1, 0),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(0, 1, 1, 0),
    )

    /** Свита фаза на храната — 2×2 ядро (мекото „мигане“ без пълно гаснене). */
    val FOOD_CORE: Array<IntArray> = arrayOf(
        intArrayOf(0, 0, 0, 0),
        intArrayOf(0, 1, 1, 0),
        intArrayOf(0, 1, 1, 0),
        intArrayOf(0, 0, 0, 0),
    )

    /** Бонус „буболечка“ — характерна форма с „крачета“. */
    val BONUS: Array<IntArray> = arrayOf(
        intArrayOf(1, 0, 1, 0),
        intArrayOf(0, 1, 1, 0),
        intArrayOf(1, 1, 1, 1),
        intArrayOf(0, 1, 0, 1),
    )

    /** Глава за дадена посока (кеширани ротации — без алокации в onDraw). */
    fun head(dir: Direction): Array<IntArray> = headByDir.getValue(dir)

    /** Опашка за дадена посока „към тялото“ (кеширани ротации). */
    fun tail(dirToBody: Direction): Array<IntArray> = tailByDir.getValue(dirToBody)

    private val headByDir = Direction.entries.associateWith { rotated(HEAD, it) }
    private val tailByDir = Direction.entries.associateWith { rotated(TAIL, it) }

    /**
     * Връща спрайта, завъртян за дадена посока. Базовите матрици гледат
     * НАДЯСНО; RIGHT = без промяна, DOWN = 90° по часовника, LEFT = 180°, UP = 270°.
     * Ротациите се смятат програмно — не съхраняваме 4 копия.
     */
    fun rotated(mask: Array<IntArray>, dir: Direction): Array<IntArray> = when (dir) {
        Direction.RIGHT -> mask
        Direction.DOWN -> rotateCw(mask)
        Direction.LEFT -> rotateCw(rotateCw(mask))
        Direction.UP -> rotateCw(rotateCw(rotateCw(mask)))
    }

    /** Завърта квадратна матрица на 90° по часовниковата стрелка. */
    private fun rotateCw(m: Array<IntArray>): Array<IntArray> {
        val n = m.size
        return Array(n) { row -> IntArray(n) { col -> m[n - 1 - col][row] } }
    }
}
