package eu.carbonstealth.snake

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import eu.carbonstealth.snake.engine.Direction
import eu.carbonstealth.snake.engine.GameConfig

/**
 * Игралният екран. Свързва [SnakeView] с HUD-а, D-pad бутоните, вибрацията
 * и оверлея „Край на играта“. Управлява паузата през жизнения цикъл.
 */
class GameActivity : AppCompatActivity() {

    private lateinit var snakeView: SnakeView
    private lateinit var scoreText: TextView
    private lateinit var levelHud: TextView
    private lateinit var overlay: View

    private var startLevel = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_game)

        startLevel = intent.getIntExtra(EXTRA_LEVEL, 1).coerceIn(1, GameConfig.MAX_LEVEL)

        snakeView = findViewById(R.id.snakeView)
        scoreText = findViewById(R.id.scoreText)
        levelHud = findViewById(R.id.levelHud)
        overlay = findViewById(R.id.gameOverOverlay)

        wireCallbacks()
        wireControls()

        snakeView.newGame(GameConfig(startLevel = startLevel))
    }

    private fun wireCallbacks() {
        snakeView.onScoreChanged = { score, level ->
            scoreText.text = getString(R.string.score_label, score)
            levelHud.text = getString(R.string.hud_level, level)
        }
        snakeView.onEat = { Haptics.tick(this) }
        snakeView.onGameOver = { score -> showGameOver(score) }
    }

    private fun wireControls() {
        findViewById<Button>(R.id.btnUp).setOnClickListener { snakeView.onDirection(Direction.UP) }
        findViewById<Button>(R.id.btnDown).setOnClickListener { snakeView.onDirection(Direction.DOWN) }
        findViewById<Button>(R.id.btnLeft).setOnClickListener { snakeView.onDirection(Direction.LEFT) }
        findViewById<Button>(R.id.btnRight).setOnClickListener { snakeView.onDirection(Direction.RIGHT) }

        findViewById<Button>(R.id.btnPlayAgain).setOnClickListener {
            overlay.visibility = View.GONE
            snakeView.newGame(GameConfig(startLevel = startLevel))
            snakeView.resumeLoop()
        }
        findViewById<Button>(R.id.btnMenu).setOnClickListener { finish() }
    }

    private fun showGameOver(score: Int) {
        // Обратна връзка при смърт: визуален оверлей + хаптик (никога само звук).
        Haptics.death(this)
        val record = Scores.submit(this, score)
        findViewById<TextView>(R.id.gameOverScore).text = getString(R.string.final_score, score)
        findViewById<View>(R.id.newRecord).visibility = if (record) View.VISIBLE else View.GONE
        overlay.visibility = View.VISIBLE
    }

    override fun onResume() {
        super.onResume()
        // Не автостартираме loop-а ако сме на екрана „Край на играта“.
        if (overlay.visibility != View.VISIBLE) snakeView.resumeLoop()
    }

    override fun onPause() {
        super.onPause()
        // Автоматична пауза при home/onPause (изискване на задачата).
        snakeView.pauseLoop()
    }

    companion object {
        const val EXTRA_LEVEL = "eu.carbonstealth.snake.LEVEL"
    }
}
