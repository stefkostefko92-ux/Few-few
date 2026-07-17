import type Database from 'better-sqlite3';

/**
 * „Momentum" куки върху основния цикъл (лова) — задържане чрез геймплей,
 * не чрез UI трикове. Всичко е сървър-авторитетно и формулно:
 *
 *  🔥 COMBO (сесийна кука): поредни победи в 10-мин прозорец трупат
 *     +4%/стак XP и злато, кап 10 стака (+40%). Загуба или изтекъл
 *     прозорец нулират. Държи сесията „още един лов…".
 *
 *  ⭐ ПЪРВА ПОБЕДА ЗА ДЕНЯ (дневна кука): първото убийство всеки UTC ден
 *     дава ×2 XP/злато. Евтин, честен повод да се логнеш днес.
 *
 * Множителите се прилагат СЛЕД guild множителите и XP клампа — те са
 * умишлени награди, не seed аномалии. Ефектът е ограничен: макс
 * (1+0.40)×2 = ×2.8 на първото убийство със засилено комбо, после ≤×1.4.
 */

export const COMBO_WINDOW_MS = 10 * 60_000; // 10 минути между победите
export const COMBO_STEP = 0.04;             // +4% на стак
export const COMBO_CAP = 10;                // макс 10 стака (+40%)
export const FIRST_WIN_MULT = 2;            // ×2 за първата победа на деня

export interface Momentum {
  combo: number;          // текущ брой поредни победи (1 = първата)
  comboBonusPct: number;  // 0..40 (за показване в клиента)
  firstWin: boolean;      // това беше ли първата победа за деня
  mult: number;           // общият множител, приложен върху XP/злато
}

/**
 * Прилага momentum за един лов. Извиква се СЛЕД боя: при победа връща
 * множителя и обновява състоянието; при загуба нулира комбото (mult 1).
 */
export function applyHuntMomentum(
  db: Database.Database,
  characterId: number,
  victory: boolean,
  now = Date.now(),
): Momentum {
  const row = db.prepare(
    'SELECT hunt_streak, hunt_streak_at, first_win_day FROM characters WHERE id = ?',
  ).get(characterId) as { hunt_streak: number; hunt_streak_at: number; first_win_day: number } | undefined;
  if (!row) return { combo: 0, comboBonusPct: 0, firstWin: false, mult: 1 };

  if (!victory) {
    // Загубата чупи комбото — рискът прави стаковете ценни.
    db.prepare('UPDATE characters SET hunt_streak = 0 WHERE id = ?').run(characterId);
    return { combo: 0, comboBonusPct: 0, firstWin: false, mult: 1 };
  }

  const withinWindow = now - (row.hunt_streak_at || 0) <= COMBO_WINDOW_MS;
  const combo = withinWindow ? (row.hunt_streak || 0) + 1 : 1;
  const stacks = Math.min(combo - 1, COMBO_CAP);
  const comboBonus = stacks * COMBO_STEP;

  const day = Math.floor(now / 86_400_000);
  const firstWin = (row.first_win_day || 0) < day;

  db.prepare(
    'UPDATE characters SET hunt_streak = ?, hunt_streak_at = ?, first_win_day = ? WHERE id = ?',
  ).run(combo, now, firstWin ? day : row.first_win_day || 0, characterId);

  const mult = (1 + comboBonus) * (firstWin ? FIRST_WIN_MULT : 1);
  return { combo, comboBonusPct: Math.round(comboBonus * 100), firstWin, mult };
}
