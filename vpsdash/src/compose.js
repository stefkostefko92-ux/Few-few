// Docker Compose по СТЕК (проект), не по контейнер — така се вдига/сваля цял
// продукт (zabobovdol, supreme, nexus, eternaltouch) с едно действие.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';

const NAME_RX = /^[\w][\w.-]{0,60}$/;
const ACTIONS = new Set(['up', 'down', 'restart', 'pull', 'stop', 'start']);

function assertProject(name) {
  const n = String(name || '');
  if (!NAME_RX.test(n)) throw Object.assign(new Error('Невалиден compose проект'), { status: 400 });
  return n;
}

function assertConfigPath(p) {
  const full = path.resolve(String(p || ''));
  if (!fs.existsSync(full)) throw Object.assign(new Error('Няма такъв compose файл'), { status: 400 });
  if (!/(docker-)?compose(\.\w+)?\.ya?ml$/.test(path.basename(full))) {
    throw Object.assign(new Error('Не е compose файл'), { status: 400 });
  }
  return full;
}

export async function composeList() {
  const r = await run('docker', ['compose', 'ls', '--all', '--format', 'json'], { timeout: 20000 });
  if (!r.ok) {
    return { available: false, error: (r.stderr || r.error || 'docker compose недостъпен').trim().slice(0, 200) };
  }
  let items = [];
  try {
    items = JSON.parse(r.stdout);
  } catch {
    items = r.stdout
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
  const projects = items.map((p) => ({
    name: p.Name,
    status: p.Status,
    configFiles: p.ConfigFiles,
  }));
  return { available: true, projects };
}

export async function composePs(project) {
  const name = assertProject(project);
  const r = await run('docker', ['compose', '-p', name, 'ps', '--format', 'json'], { timeout: 20000 });
  if (!r.ok) return { project: name, services: [] };
  const lines = r.stdout.split('\n').filter(Boolean);
  const services = [];
  for (const l of lines) {
    try {
      const v = JSON.parse(l);
      // По-новите версии връщат масив на един ред.
      if (Array.isArray(v)) services.push(...v);
      else services.push(v);
    } catch {
      /* пропускаме реда */
    }
  }
  return {
    project: name,
    services: services.map((s) => ({
      name: s.Name || s.Service,
      service: s.Service,
      state: s.State,
      status: s.Status,
      health: s.Health,
      ports: s.Publishers ? (s.Publishers || []).map((p) => `${p.PublishedPort}:${p.TargetPort}`).join(', ') : '',
    })),
  };
}

// Действията са дълги (pull/build) → връщаме спецификация за фонова задача.
export function composeActionSpec({ project, configFile, action }) {
  const name = assertProject(project);
  if (!ACTIONS.has(action)) throw Object.assign(new Error('Невалидно действие'), { status: 400 });
  // Compose иска пътя до файла, за да работи извън неговата папка.
  const first = String(configFile || '').split(',')[0].trim();
  const conf = assertConfigPath(first);
  const args = ['compose', '-p', name, '-f', conf];
  if (action === 'up') args.push('up', '-d', '--remove-orphans');
  else if (action === 'down') args.push('down');
  else args.push(action);
  return {
    title: `compose ${action} · ${name}`,
    cmd: 'docker',
    args,
    cwd: path.dirname(conf),
    exclusive: `compose:${name}`,
    timeoutMs: 30 * 60 * 1000,
  };
}

export async function composeLogs(project, lines = 300) {
  const name = assertProject(project);
  const n = Math.min(Number(lines) || 300, 3000);
  const r = await run('docker', ['compose', '-p', name, 'logs', '--tail', String(n), '--no-color'], {
    timeout: 25000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { project: name, text: ((r.stdout || '') + (r.stderr || '')).slice(-200000) };
}
