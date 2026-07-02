package eu.carbonstealth.snake

import android.content.Context

/**
 * Достъп до рекорда и последно избраното ниво през SharedPreferences.
 * Играта няма чувствителни данни → обикновени SharedPreferences са достатъчни
 * (не тайни; вж. OWASP MASVS STORAGE — тук няма нищо за защита).
 */
object Scores {
    const val PREFS = "snake_prefs"
    const val KEY_HIGH = "high_score"
    const val KEY_LEVEL = "start_level"

    fun highScore(context: Context): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_HIGH, 0)

    /** Записва резултата, ако бие рекорда. Връща true при нов рекорд. */
    fun submit(context: Context, score: Int): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = prefs.getInt(KEY_HIGH, 0)
        if (score > current) {
            prefs.edit().putInt(KEY_HIGH, score).apply()
            return true
        }
        return false
    }
}
