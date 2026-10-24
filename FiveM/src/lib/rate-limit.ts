/**
 * Анти-спам БЕЗ проследяване. Продуктовото обещание е, че не пазим IP адреси,
 * затова таванът няма измерение „подател“ — той е процесен и по действие.
 *
 * Съзнателният компромис: при вълна таванът удря и честен подател („опитай пак
 * след минута“). Цената на алтернативата е досие с IP адреси на всеки, който
 * попълни форма — по-скъпа. Затова таванът е нарочно висок: спира скрипт, не
 * човек, и е разделен по действие, за да не си блокират взаимно формите.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

const windows = new Map<string, { start: number; count: number }>();

export function withinGlobalRateLimit(action: string, now = Date.now()): boolean {
  const current = windows.get(action);
  if (!current || now - current.start > WINDOW_MS) {
    windows.set(action, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_PER_WINDOW;
}

/** Само за тестове — нулира състоянието между случаите. */
export function resetRateLimits(): void {
  windows.clear();
}
