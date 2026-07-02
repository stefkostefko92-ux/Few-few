package eu.carbonstealth.snake.engine

/** Състояния на играта. */
enum class GameState {
    /** Заредена, но още не стартирана (изчаква първи ход). */
    READY,
    RUNNING,
    PAUSED,
    GAME_OVER,
}
