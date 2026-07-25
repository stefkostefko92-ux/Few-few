// Docker контейнери/образи/compose — през docker CLI с --format json (ред по ред).
import { run, runOk } from './exec.js';

const ID_RX = /^[\w.\/:-]+$/;
const ACTIONS = new Set(['start', 'stop', 'restart', 'pause', 'unpause']);

function assertId(id) {
  if (typeof id !== 'string' || id.length > 200 || !ID_RX.test(id)) {
    throw Object.assign(new Error('Невалиден контейнер'), { status: 400 });
  }
  return id;
}

function parseJsonLines(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function dockerOverview() {
  const ps = await run('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}']);
  if (!ps.ok) {
    return { available: false, error: (ps.stderr || ps.error || 'docker недостъпен').trim().slice(0, 300) };
  }
  const containers = parseJsonLines(ps.stdout).map((c) => ({
    id: c.ID,
    name: c.Names,
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: c.Ports,
    createdAt: c.CreatedAt,
  }));
  const im = await run('docker', ['images', '--format', '{{json .}}']);
  const images = im.ok
    ? parseJsonLines(im.stdout).map((i) => ({
        repo: i.Repository,
        tag: i.Tag,
        id: i.ID,
        size: i.Size,
        createdSince: i.CreatedSince,
      }))
    : [];
  const co = await run('docker', ['compose', 'ls', '--format', 'json']);
  let compose = [];
  if (co.ok) {
    try {
      compose = JSON.parse(co.stdout);
    } catch {
      compose = parseJsonLines(co.stdout);
    }
  }
  return { available: true, containers, images, compose };
}

export async function dockerStats() {
  const r = await run('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 20000 });
  if (!r.ok) return { available: false, stats: [] };
  return {
    available: true,
    stats: parseJsonLines(r.stdout).map((s) => ({
      name: s.Name,
      cpu: s.CPUPerc,
      mem: s.MemUsage,
      memPct: s.MemPerc,
      netIO: s.NetIO,
      blockIO: s.BlockIO,
    })),
  };
}

export async function dockerAction(id, action, audit, user) {
  assertId(id);
  if (!ACTIONS.has(action)) throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  audit.log({ action: `docker.${action}`, container: id, user });
  await runOk('docker', [action, id], { timeout: 60000 });
  return { id, action, ok: true };
}

export async function dockerLogs(id, lines = 300) {
  assertId(id);
  const r = await run('docker', ['logs', '--tail', String(Math.min(Number(lines) || 300, 5000)), '-t', id], {
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
  });
  // docker пише логовете и на stderr (в зависимост от стрийма на процеса) — събираме двата.
  return { id, text: ((r.stdout || '') + (r.stderr || '')).slice(-200000) };
}
