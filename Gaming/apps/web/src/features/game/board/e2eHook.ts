/**
 * Тестова кука за браузърните e2e тестове на 3D масите (apps/web/e2e/games/*.3d.spec.ts).
 *
 * В WebGL пътя дъската е едно платно — няма DOM елементи, по които тестът да
 * намери поле. Затова изгледът регистрира в `window.__asoE2E[<игра>]`:
 *   - `screenPoint(id)` — къде на екрана (client координати) е поле/пул `id`,
 *     проектирано от 3D сцената; тестът кликва ТОЧНО там, върху платното;
 *   - `view()` — какво вижда играчът (позволени ходове, избор) като чисти данни.
 *
 * Регистрира се САМО под автоматизация (`navigator.webdriver === true`, както
 * при Playwright) — за играчите нищо не се променя и нищо не се показва.
 * Модулът нарочно не внася three.js (изгледите го зареждат лениво).
 */
export interface E2EBoardHook {
  /** Client координати на центъра на поле/пул `id`, или null (няма го/извън кадър). */
  screenPoint(id: string | number): { x: number; y: number } | null;
  /** Моментна снимка на това, което играчът вижда — само данни (JSON). */
  view(): unknown;
}

type HookHost = { __asoE2E?: Record<string, E2EBoardHook> };

/** Регистрира куката за `game` (само под WebDriver); връща функция за махане. */
export function registerE2EHook(game: string, hook: E2EBoardHook): () => void {
  if (typeof window === "undefined" || typeof navigator === "undefined" || navigator.webdriver !== true) {
    return () => {};
  }
  const host = window as unknown as HookHost;
  const reg = (host.__asoE2E ??= {});
  reg[game] = hook;
  return () => {
    if (reg[game] === hook) delete reg[game];
  };
}
