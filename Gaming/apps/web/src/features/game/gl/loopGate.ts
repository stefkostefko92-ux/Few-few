/**
 * Дали цикълът на RenderCore да рисува този кадър (чиста функция — има тест).
 *
 *  - нещо се анимира или сцената е променена → винаги;
 *  - празен ход → на `idleIntervalMs` само заради движещото се зърно на
 *    филма; при намалено движение зърното стои, кадърът е същият → никога.
 *    (На слаб/софтуерен GPU празното прерисуване 15×/с задушаваше страницата —
 *    кликовете закъсняваха със секунди.)
 */
export function frameDue(o: {
  active: boolean;
  dirty: boolean;
  still: boolean;
  sinceLastMs: number;
  idleIntervalMs: number;
}): boolean {
  if (o.active || o.dirty) return true;
  return !o.still && o.sinceLastMs >= o.idleIntervalMs;
}
