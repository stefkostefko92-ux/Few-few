package eu.carbonstealth.snake

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Заглавен екран: показва рекорда, дава избор на начално ниво (1..9)
 * и стартира [GameActivity].
 */
class MainActivity : AppCompatActivity() {

    private lateinit var highScoreText: TextView
    private lateinit var levelText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        highScoreText = findViewById(R.id.highScoreText)
        levelText = findViewById(R.id.levelText)
        val seek = findViewById<SeekBar>(R.id.levelSeek)
        val play = findViewById<Button>(R.id.playButton)

        // Възстановяваме последно избраното ниво.
        val prefs = getSharedPreferences(Scores.PREFS, MODE_PRIVATE)
        seek.progress = (prefs.getInt(Scores.KEY_LEVEL, 1) - 1).coerceIn(0, 8)
        updateLevelLabel(seek.progress + 1)

        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                updateLevelLabel(progress + 1)
            }

            override fun onStartTrackingTouch(sb: SeekBar) = Unit
            override fun onStopTrackingTouch(sb: SeekBar) = Unit
        })

        play.setOnClickListener {
            val level = seek.progress + 1
            prefs.edit().putInt(Scores.KEY_LEVEL, level).apply()
            startActivity(
                Intent(this, GameActivity::class.java)
                    .putExtra(GameActivity.EXTRA_LEVEL, level),
            )
        }
    }

    override fun onResume() {
        super.onResume()
        val high = getSharedPreferences(Scores.PREFS, MODE_PRIVATE).getInt(Scores.KEY_HIGH, 0)
        highScoreText.text = getString(R.string.high_score_label, high)
    }

    private fun updateLevelLabel(level: Int) {
        levelText.text = getString(R.string.level_label, level)
    }
}
