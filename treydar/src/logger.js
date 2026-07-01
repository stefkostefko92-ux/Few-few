// logger.js — прост структуриран лог + одит следа на всяка поръчка/действие във файл.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
try { mkdirSync(dataDir, { recursive: true }); } catch { /* ok */ }
const auditFile = join(dataDir, 'audit.log');

function stamp() { return new Date().toISOString(); }

export const log = {
  info: (msg, extra) => console.log(`[${stamp()}] ${msg}`, extra ?? ''),
  warn: (msg, extra) => console.warn(`[${stamp()}] ⚠ ${msg}`, extra ?? ''),
  error: (msg, extra) => console.error(`[${stamp()}] ✖ ${msg}`, extra ?? ''),
};

// Одит: неизтриваем запис на всяко търговско действие (за разбор след това).
export function audit(event, payload) {
  const line = JSON.stringify({ ts: stamp(), event, ...payload }) + '\n';
  try { appendFileSync(auditFile, line); } catch (e) { log.error('audit write fail', e.message); }
}
