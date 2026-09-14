# `tools/betting/` — прецизният слой на Голаджията

Изпълнима, **тествана** математика за футболна прогноза. Zero-dep Node ESM. **НЕ е бетинг съвет** —
смятащ инструмент; входните данни (λ от xG, коефициенти) ги вадиш и цитираш ти. 18+, риск от загуба.

| Модул | Какво |
|---|---|
| **`golad-fit.mjs`** | **Напаснат Диксън-Коулс от история на резултати** (MLE + time-decay) → атака/защита рейтинги + домакинско предимство + ρ → предсказва λ. CLI: `golad-fit.mjs results.json "Дом" "Гост"`. Скок от ръчна λ. |
| `golad-model.mjs` | Поасон pmf · Диксън-Коулс τ(ρ) · матрица · пазари: 1X2/О-У/BTTS/точен · **азиатски хендикап (вкл. четвърт)** · двоен шанс · draw-no-bet · λ от рейтинги · time-decay |
| `devig.mjs` | Обезмаржване: **power** (база — favorite-longshot корекция) · proportional · Shin · overround |
| **`golad-portfolio.mjs`** | **Bankroll над единичен Kelly:** симултанен дробен Kelly + тавани (залог/мач/общо) + **drawdown kill-switch** |
| **`golad-backtest.mjs`** | **walk-forward** калибрация (напасни на миналото → предскажи бъдещето, нула look-ahead) → Brier/log-loss/RPS vs база |
| `calibration.mjs` | market-anchor смес · EV · **дробен Kelly** с таван · Brier · log-loss · **RPS** · **CLV** |
| `golad.mjs` | CLI — цялата верига λ → матрица → пазари → обезмаржване → смес → EV → Kelly |
| `*.test.mjs` | **20 теста** доказват математиката + fit-възстановяване + walk-forward бие база — в CI |

## Употреба
```bash
echo '{"lambdaHome":1.6,"lambdaAway":1.05,"odds1x2":[2.10,3.40,3.60]}' | node tools/betting/golad.mjs
# или от рейтинги:
echo '{"ratings":{"attHome":1.25,"defHome":0.85,"attAway":0.95,"defAway":1.15},"odds1x2":[1.80,3.60,4.50]}' | node tools/betting/golad.mjs
node tools/betting/golad.mjs --json input.json     # машинен изход
```

Прецизност: λ **от xG** (не голове); съперник-коригирани рейтинги + time-decay; **power** обезмаржване;
пазарът е котва (смес w≈0.3–0.5); мери **out-of-sample, walk-forward** с Brier/log-loss/RPS; **CLV** = знакът за едж.
Timing: най-прецизна вероятност T−60…−75 мин (потвърдени състави); стойност T−1…−3 дни (меки линии).
