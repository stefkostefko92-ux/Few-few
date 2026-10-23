/**
 * Структуриран лог на ред (JSON → journald). НИКОГА съдържание на разговор, ключ или IP —
 * само идентификатор на ключа, агент, статус и броячи.
 */
type Level = 'info' | 'warn' | 'error';

let silent = false;
export function silenceLogs(value = true): void {
  silent = value;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (silent) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'info') process.stdout.write(`${line}\n`);
  else process.stderr.write(`${line}\n`);
}
