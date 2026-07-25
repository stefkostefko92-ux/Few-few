// Мениджър на фонови задачи (деплой, ъпдейти, терминал, агентски инструменти).
// Изходът се пази в ring-буфер и се излъчва на живо през SSE. Ексклузивен ключ
// ("system") гарантира, че два деплоя/ъпдейта не вървят едновременно.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const OUTPUT_CAP = 2 * 1024 * 1024; // 2MB на задача
const KEEP_JOBS = 50;

export class Jobs {
  constructor(audit) {
    this.audit = audit;
    this.map = new Map(); // id → job
    this.locks = new Set(); // ексклузивни ключове в движение
  }

  // spec: { title, cmd, args, cwd?, env?, shell? (string команда през bash), exclusive?, timeoutMs? }
  start(spec, meta = {}) {
    if (spec.exclusive && this.locks.has(spec.exclusive)) {
      throw Object.assign(new Error(`Вече върви задача от тип „${spec.exclusive}“ — изчакай я.`), {
        status: 409,
      });
    }
    const id = crypto.randomBytes(6).toString('hex');
    const job = {
      id,
      title: spec.title,
      display: spec.shell ? spec.shell : [spec.cmd, ...(spec.args || [])].join(' '),
      startedAt: new Date().toISOString(),
      endedAt: null,
      code: null,
      killed: false,
      output: '',
      listeners: new Set(),
      exclusive: spec.exclusive || null,
    };
    if (spec.exclusive) this.locks.add(spec.exclusive);

    const child = spec.shell
      ? spawn('bash', ['-lc', spec.shell], { cwd: spec.cwd, env: { ...process.env, ...spec.env } })
      : spawn(spec.cmd, spec.args || [], { cwd: spec.cwd, env: { ...process.env, ...spec.env } });
    job.pid = child.pid;
    job.child = child;

    const timeout = spec.timeoutMs
      ? setTimeout(() => {
          job.killed = true;
          child.kill('SIGKILL');
        }, spec.timeoutMs)
      : null;

    const push = (chunk) => {
      const text = chunk.toString('utf8');
      job.output = (job.output + text).slice(-OUTPUT_CAP);
      for (const l of job.listeners) l('data', text);
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (err) => push(`\n[грешка при стартиране: ${err.message}]\n`));
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      job.code = code ?? (job.killed ? 137 : 1);
      job.endedAt = new Date().toISOString();
      job.child = null;
      if (job.exclusive) this.locks.delete(job.exclusive);
      for (const l of job.listeners) l('end', { code: job.code });
      job.listeners.clear();
      this.audit?.log({ action: 'job.end', jobId: id, title: job.title, code: job.code, ...meta });
      this.prune();
    });

    this.map.set(id, job);
    this.audit?.log({ action: 'job.start', jobId: id, title: job.title, cmd: job.display, ...meta });
    return this.describe(job);
  }

  prune() {
    const done = [...this.map.values()].filter((j) => j.endedAt);
    if (done.length > KEEP_JOBS) {
      done
        .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
        .slice(0, done.length - KEEP_JOBS)
        .forEach((j) => this.map.delete(j.id));
    }
  }

  get(id) {
    return this.map.get(id) || null;
  }

  kill(id, user) {
    const job = this.map.get(id);
    if (!job) throw Object.assign(new Error('Няма такава задача'), { status: 404 });
    if (!job.child) return this.describe(job);
    job.killed = true;
    job.child.kill('SIGTERM');
    setTimeout(() => job.child && job.child.kill('SIGKILL'), 5000);
    this.audit?.log({ action: 'job.kill', jobId: id, user });
    return this.describe(job);
  }

  describe(job) {
    const { id, title, display, startedAt, endedAt, code, killed, pid } = job;
    return { id, title, cmd: display, startedAt, endedAt, code, killed, pid, running: !endedAt };
  }

  list() {
    return [...this.map.values()]
      .map((j) => this.describe(j))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}
