package eu.carbonstealth.snake

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import eu.carbonstealth.snake.engine.Direction
import eu.carbonstealth.snake.engine.GameConfig
import eu.carbonstealth.snake.engine.GameState

/**
 * Игралният екран. Свързва [SnakeView] с HUD-а, D-pad бутоните, вибрацията
 * и оверлея „Край на играта“. Управлява паузата през жизнения цикъл.
 */
class GameActivity : AppCompatActivity() {

    private lateinit var snakeView: SnakeView
    private lateinit var scoreText: TextView
    private lateinit var levelHud: TextView
    private lateinit var overlay: View
    private lateinit var stateHint: TextView

    private var startLevel = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_game)

        // targetSdk 35 налага edge-to-edge — вкарваме системните ленти като padding,
        // за да не остане D-pad-ът под навигационната лента.
        applySystemBarInsets(findViewById(R.id.gameRoot))

        startLevel = intent.getIntExtra(EXTRA_LEVEL, 1).coerceIn(1, GameConfig.MAX_LEVEL)

        snakeView = findViewById(R.id.snakeView)
        scoreText = findViewById(R.id.scoreText)
        levelHud = findViewById(R.id.levelHud)
        overlay = findViewById(R.id.gameOverOverlay)
        stateHint = findViewById(R.id.stateHint)

        wireCallbacks()
        wireControls()

        snakeView.newGame(GameConfig(startLevel = startLevel))
        stateHint.setText(R.string.tap_to_start)
        stateHint.visibility = View.VISIBLE
    }

    private fun wireCallbacks() {
        snakeView.onScoreChanged = { score, level ->
            scoreText.text = getString(R.string.score_label, score)
            levelHud.text = getString(R.string.hud_level, level)
        }
        snakeView.onEat = { Haptics.tick(this) }
        snakeView.onGameOver = { score -> showGameOver(score) }
        snakeView.onStarted = { stateHint.visibility = View.GONE }
    }

    private fun wireControls() {
        findViewById<Button>(R.id.btnUp).setOnClickListener { snakeView.onDirection(Direction.UP) }
        findViewById<Button>(R.id.btnDown).setOnClickListener { snakeView.onDirection(Direction.DOWN) }
        findViewById<Button>(R.id.btnLeft).setOnClickListener { snakeView.onDirection(Direction.LEFT) }
        findViewById<Button>(R.id.btnRight).setOnClickListener { snakeView.onDirection(Direction.RIGHT) }

        findViewById<Button>(R.id.btnPlayAgain).setOnClickListener {
            overlay.visibility = View.GONE
            snakeView.newGame(GameConfig(startLevel = startLevel))
            stateHint.setText(R.string.tap_to_start)
            stateHint.visibility = View.VISIBLE
            snakeView.resumeLoop()
        }
        findViewById<Button>(R.id.btnMenu).setOnClickListener { finish() }
    }

    /** Вкарва systemBars insets като padding на root-а (edge-to-edge при API 35). */
    private fun applySystemBarInsets(root: View) {
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun showGameOver(score: Int) {
        // Обратна връзка при смърт: визуален оверлей + хаптик (никога само звук).
        Haptics.death(this)
        stateHint.visibility = View.GONE
        val record = Scores.submit(this, score)
        findViewById<TextView>(R.id.gameOverScore).text = getString(R.string.final_score, score)
        findViewById<View>(R.id.newRecord).visibility = if (record) View.VISIBLE else View.GONE
        overlay.visibility = View.VISIBLE
    }

    override fun onResume() {
        super.onResume()
        // Не автостартираме loop-а ако сме на екрана „Край на играта“.
        if (overlay.visibility != View.VISIBLE) {
            snakeView.resumeLoop()
            // След пауза играта чака вход — показваме „Пауза“, за да е ясно.
            if (snakeView.engine.state == GameState.PAUSED) {
                stateHint.setText(R.string.paused)
                stateHint.visibility = View.VISIBLE
            }
        }
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
