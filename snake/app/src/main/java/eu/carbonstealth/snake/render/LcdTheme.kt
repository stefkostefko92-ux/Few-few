package eu.carbonstealth.snake.render

/**
 * Цветова палитра на Nokia LCD екрана — ВСИЧКИ цветове на едно място,
 * по дизайнерския спек (калибриран по снимки на реален 3310 STN панел).
 *
 * ARGB int-ове (0xAARRGGBB). Пипай само тук.
 */
object LcdTheme {
    /** Основен жълто-зеленикав олив фон на LCD-то („изключен“ пиксел). */
    const val BACKGROUND = 0xFF9EAD86.toInt()

    /** По-светъл вариант на панела (алтернатива за OLED екрани). */
    const val BACKGROUND_LIGHT = 0xFFA7B98C.toInt()

    /** „Включен“ пиксел — тъмно, почти черно-зелено (НЕ чисто черно). */
    const val PIXEL = 0xFF232B1B.toInt()

    /** Решетъчна „фуга“ между чипчетата на LCD матрицата (ghost). */
    const val GRID = 0xFF96A67D.toInt()

    /** Корпус на „телефона“ — letterbox зоната около LCD-то (charcoal). */
    const val LETTERBOX = 0xFF33373D.toInt()

    /** Размер на един „логически“ пиксел на спрайт в клетки на решетката е 1,
     *  но всеки такъв се рисува като матрица [SPRITE_RES]×[SPRITE_RES] под-пиксела. */
    const val SPRITE_RES = 4

    /** Дял от размера на dot-а, който остава фуга (≈12% по спек). */
    const val GRID_GAP_RATIO = 0.12f

    /** Под този размер на dot в px фугата става каша — рисуваме плътно. */
    const val MIN_DOT_PX_FOR_GAP = 5
}
