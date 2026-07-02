package eu.carbonstealth.snake.engine

/**
 * Клетка от решетката. Координатите са в клетки (не пиксели).
 * Чист data клас без Android зависимости, за да е unit-тестваем.
 */
data class Point(val x: Int, val y: Int)
