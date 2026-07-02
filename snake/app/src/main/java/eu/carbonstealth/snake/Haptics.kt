package eu.carbonstealth.snake

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Тънка обвивка над вибрацията. Играта дава обратна връзка при изяждане и смърт.
 *
 * Достъпност (EN 301 549 / WCAG 2.1): обратната връзка НИКОГА не е само звук.
 * Тук е хаптик; визуалната част (промяна на екрана / оверлей) е в рендера/UI-а.
 */
object Haptics {

    private fun vibrator(context: Context): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    /** Кратък тик при изяждане. */
    fun tick(context: Context) = vibrate(context, 20)

    /** По-дълга вибрация при смърт. */
    fun death(context: Context) = vibrate(context, 200)

    private fun vibrate(context: Context, ms: Long) {
        val v = vibrator(context) ?: return
        if (!v.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(ms)
        }
    }
}
