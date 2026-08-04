// Изпълнение на системни команди. По подразбиране execFile с масив аргументи
// (без shell — нула инжекции). Shell има САМО терминалният модул, изрично и одитирано.
import { execFile } from 'node:child_process';

export function run(cmd, args = [], { timeout = 15000, maxBuffer = 8 * 1024 * 1024, cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { timeout, maxBuffer, cwd, env: env ? { ...process.env, ...env } : process.env },
      (err, stdout, stderr) => {
        clearTimeout(hardKill);
        resolve({
          ok: !err,
          code: err ? (err.code ?? 1) : 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: err && typeof err.code !== 'number' ? err.message : null,
        });
      }
    );
    // Таймаутът на `execFile` праща само SIGTERM. Команда, която го ИГНОРИРА
    // (заклещена в непрекъсваем I/O към умрял NFS/диск), остава жива завинаги, а
    // панелът я пуска отново на всяка проба → процесите се трупат, докато
    // машината се задави. Затова: втори удар, който не се игнорира.
    const grace = Math.min(5000, Math.max(1000, Math.round(timeout / 3)));
    const hardKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, timeout + grace);
    hardKill.unref();
  });
}

// Помощник: върни stdout при успех, иначе хвърли с полезно съобщение.
export async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (!r.ok) {
    const msg = (r.stderr || r.stdout || r.error || 'неуспех').trim().slice(0, 500);
    throw Object.assign(new Error(`${cmd} ${args.join(' ')}: ${msg}`), { status: 502 });
  }
  return r.stdout;
}
