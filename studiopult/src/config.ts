/**
 * Настройките (fail closed). Решение на собственика 28.11.2026: ключът е във файл в %LOCALAPPDATA%\studiopult\
 * (за разработка $XDG_CONFIG_HOME/studiopult/), никога в репото, в средата на другите програми или в страницата.
 * Ключ, който липсва, има странен вид или (на POSIX) е четим за други → пултът не тръгва. Стойността никога
 * не се печата — съобщенията за грешка казват само кое не е наред.
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  dataDir: string;
  keyFile: string;
  spendFile: string;
  previewRoot: string;
  repoRoot: string;
  port: number;
  dailyUsd: number;
}

export const DEFAULT_PORT = 4390;

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Config {
  const home = env.USERPROFILE || env.HOME || homedir();
  const dataDir =
    platform === 'win32'
      ? join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'studiopult')
      : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'studiopult');
  const port = env.STUDIOPULT_PORT ? Number(env.STUDIOPULT_PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('STUDIOPULT_PORT: цяло число 1024–65535');
  return {
    dataDir,
    keyFile: join(dataDir, 'key.txt'),
    spendFile: join(dataDir, 'spend.json'),
    previewRoot: env.STUDIOPULT_STUDIO || join(home, 'Videos', 'studio'),
    repoRoot: join(import.meta.dirname, '..', '..'),
    port,
    dailyUsd: 20,
  };
}

const KEY = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

/** Чете ключа; хвърля с обяснение БЕЗ стойността. */
export function readKey(file: string, platform: NodeJS.Platform = process.platform): string {
  let st;
  try {
    st = statSync(file);
  } catch {
    throw new Error(`липсва файлът с ключа: ${file} — сложи там API ключа на Anthropic (един ред)`);
  }
  if (!st.isFile()) throw new Error(`${file} не е файл`);
  if (platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new Error(`ключът е четим за други потребители — изпълни: chmod 600 "${file}"`);
  }
  const key = readFileSync(file, 'utf8').trim();
  if (!KEY.test(key)) throw new Error(`${file} не съдържа ключ във вида sk-ant-…`);
  return key;
}
