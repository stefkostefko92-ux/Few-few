// Интерактивен терминал със ИСТИНСКИ PTY — без нативна зависимост (node-pty).
//
// Хватката: `script` (util-linux, има го на всяка Ubuntu) заделя псевдотерминал и
// пуска обвивката вътре. Така програмите виждат TTY (htop, nano, sudo prompt,
// цветове) — а ние оставаме на нула зависимости, както изисква продуктът.
//
// Изходът тече към браузъра по SSE, клавишите идват по POST. Сесията умира с
// таймаут при бездействие, за да не остане забравена root обвивка.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const IDLE_MS = 30 * 60 * 1000; // 30 мин без активност → затваряме
const OUT_CAP = 512 * 1024;
const MAX_SESSIONS = 8;

export class PtySessions {
  constructor(audit) {
    this.audit = audit;
    this.map = new Map();
  }

  create({ cwd = '/root', cols = 120, rows = 30 }, user) {
    if (this.map.size >= MAX_SESSIONS) {
      throw Object.assign(new Error('Твърде много отворени сесии'), { status: 429 });
    }
    const id = crypto.randomBytes(8).toString('hex');
    const c = clampDim(cols, 40, 400);
    const r = clampDim(rows, 10, 120);

    // -q тихо, -f flush след всеки запис (иначе изходът засяда в буфера),
    // -c командата, /dev/null = без typescript файл на диска.
    const child = spawn('script', ['-qfc', 'exec bash -l', '/dev/null'], {
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLUMNS: String(c),
        LINES: String(r),
        LANG: process.env.LANG || 'C.UTF-8',
      },
    });

    const session = {
      id,
      user,
      cwd,
      cols: c,
      rows: r,
      child,
      startedAt: new Date().toISOString(),
      lastActivity: Date.now(),
      buffer: '',
      listeners: new Set(),
      closed: false,
    };

    const push = (chunk) => {
      const text = chunk.toString('utf8');
      session.buffer = (session.buffer + text).slice(-OUT_CAP);
      session.lastActivity = Date.now();
      for (const l of session.listeners) l('data', text);
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (err) => push(`\r\n[грешка: ${err.message}]\r\n`));
    child.on('close', (code) => {
      session.closed = true;
      for (const l of session.listeners) l('end', { code });
      session.listeners.clear();
      this.map.delete(id);
      this.audit?.log({ action: 'pty.close', sessionId: id, code, user });
    });

    // Пазач за бездействие — забравена root обвивка е риск, не удобство.
    session.idleTimer = setInterval(() => {
      if (Date.now() - session.lastActivity > IDLE_MS) this.kill(id, user, 'бездействие');
    }, 60_000);
    session.idleTimer.unref?.();

    this.map.set(id, session);
    this.audit?.log({ action: 'pty.open', sessionId: id, cwd, user });
    return this.describe(session);
  }

  get(id) {
    return this.map.get(id) || null;
  }

  // Клавишите отиват направо в PTY — включително Ctrl+C и стрелките.
  write(id, data, user) {
    const s = this.map.get(id);
    if (!s || s.closed) throw Object.assign(new Error('Няма такава сесия'), { status: 404 });
    const text = String(data ?? '');
    if (text.length > 8192) throw Object.assign(new Error('Твърде дълъг вход'), { status: 400 });
    s.lastActivity = Date.now();
    s.child.stdin.write(text);
    // Одитираме РЕДОВЕТЕ (не всеки клавиш) — иначе дневникът става безполезен.
    if (text.includes('\r') || text.includes('\n')) {
      this.audit?.log({ action: 'pty.input', sessionId: id, data: text.replace(/[\r\n]+$/, '').slice(0, 300), user });
    }
    return { ok: true };
  }

  // Смяна на размера — `script` няма как да я предаде, затова пращаме
  // на обвивката новите стойности през `stty` (работи, защото stdin е PTY).
  resize(id, cols, rows) {
    const s = this.map.get(id);
    if (!s || s.closed) throw Object.assign(new Error('Няма такава сесия'), { status: 404 });
    s.cols = clampDim(cols, 40, 400);
    s.rows = clampDim(rows, 10, 120);
    s.child.stdin.write(`stty rows ${s.rows} cols ${s.cols} 2>/dev/null\n`);
    return { ok: true, cols: s.cols, rows: s.rows };
  }

  kill(id, user, reason = 'ръчно') {
    const s = this.map.get(id);
    if (!s) return { ok: true };
    clearInterval(s.idleTimer);
    this.audit?.log({ action: 'pty.kill', sessionId: id, reason, user });
    try {
      s.child.kill('SIGHUP');
      setTimeout(() => s.child.kill('SIGKILL'), 3000).unref?.();
    } catch {
      /* вече е мъртва */
    }
    this.map.delete(id);
    return { ok: true };
  }

  describe(s) {
    return { id: s.id, cwd: s.cwd, cols: s.cols, rows: s.rows, startedAt: s.startedAt, closed: s.closed };
  }

  list() {
    return [...this.map.values()].map((s) => this.describe(s));
  }
}

export function clampDim(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
