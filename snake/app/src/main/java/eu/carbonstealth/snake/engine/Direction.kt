package eu.carbonstealth.snake.engine

/**
 * Посока на движение. dx/dy са изместването в клетки за една стъпка.
 */
enum class Direction(val dx: Int, val dy: Int) {
    UP(0, -1),
    DOWN(0, 1),
    LEFT(-1, 0),
    RIGHT(1, 0);

    /** Обратната посока — забранен завой на 180° в рамките на един tick. */
    fun opposite(): Direction = when (this) {
        UP -> DOWN
        DOWN -> UP
        LEFT -> RIGHT
        RIGHT -> LEFT
    }
}
