package eu.carbonstealth.snake.engine

/**
 * Конфигурация на едно раздаване. Държи се извън [GameEngine], за да могат
 * тестовете да подават детерминирани стойности (напр. малка решетка).
 *
 * @param gridWidth  брой клетки по хоризонтала
 * @param gridHeight брой клетки по вертикала
 * @param wrap       true = преминаване през стените (maze-less); false = класически (стена = смърт)
 * @param startLength начална дължина на змията
 * @param startLevel  начално ниво (1..[MAX_LEVEL]) — определя скоростта и точките
 */
data class GameConfig(
    val gridWidth: Int = 20,
    val gridHeight: Int = 24,
    val wrap: Boolean = false,
    val startLength: Int = 3,
    val startLevel: Int = 1,
) {
    init {
        require(gridWidth >= 4 && gridHeight >= 4) { "Решетката е твърде малка" }
        require(startLength in 1 until gridWidth) { "Невалидна начална дължина" }
        require(startLevel in 1..MAX_LEVEL) { "Нивото трябва да е 1..$MAX_LEVEL" }
    }

    companion object {
        /** Snake II има 9 нива на скорост. */
        const val MAX_LEVEL = 9
    }
}
