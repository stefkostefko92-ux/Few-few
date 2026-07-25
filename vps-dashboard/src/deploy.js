// Деплой — интеграция с канона на репото: ръчно качен GitHub архив в /root →
// deploy/autodeploy.sh (идемпотентен, monorepo-aware). Панелът показва архиви/
// releases и пуска autodeploy като фонова задача с жив изход.
import fs from 'node:fs';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const PROJECT_RX = /^[\w-]+$/;
export const KNOWN_PROJECTS = [
  'zabobovdol',
  'medqr',
  'vizitka',
  'ospedali',
  'nexus',
  'mastilko',
  'SupremeDiscordBot',
  'eternaltouch',
  'adblock',
  'vpsdashboard',
];

export function deployState(cfg) {
  const { releasesDir, currentLink, archiveDir } = cfg.paths;
  let releases = [];
  try {
    releases = fs
      .readdirSync(releasesDir)
      .filter((d) => /^\d{8}-\d{6}$/.test(d))
      .sort()
      .reverse()
      .map((name) => {
        let sizeNote = null;
        try {
          sizeNote = fs.statSync(path.join(releasesDir, name)).mtime.toISOString();
        } catch {
          /* ок */
        }
        return { name, mtime: sizeNote };
      });
  } catch {
    /* няма releases на този VPS още */
  }
  let current = null;
  try {
    current = fs.readlinkSync(currentLink);
  } catch {
    /* ок */
  }
  let archives = [];
  try {
    archives = fs
      .readdirSync(archiveDir)
      .filter((f) => f.endsWith('.zip') || f.endsWith('.tar.gz'))
      .map((name) => {
        const st = fs.statSync(path.join(archiveDir, name));
        return { name, sizeBytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    /* ок */
  }
  return { releases, current, archives, knownProjects: KNOWN_PROJECTS };
}

export function autodeployScript(cfg) {
  if (cfg.paths.autodeploy) return cfg.paths.autodeploy;
  // Скриптът от текущия release (той се самообновява с всеки архив).
  const fromCurrent = path.join(cfg.paths.currentLink, 'deploy', 'autodeploy.sh');
  if (fs.existsSync(fromCurrent)) return fromCurrent;
  return null;
}

export function deploySpec(cfg, { projects, archive, forceSeed }) {
  const script = autodeployScript(cfg);
  if (!script) {
    throw Object.assign(
      new Error('Няма autodeploy.sh — качи поне един архив и деплойни ръчно първия път.'),
      { status: 400 }
    );
  }
  const env = {};
  if (Array.isArray(projects) && projects.length) {
    for (const p of projects) {
      if (!PROJECT_RX.test(p)) throw Object.assign(new Error(`Невалиден проект: ${p}`), { status: 400 });
    }
    env.PROJECTS = projects.join(' ');
  }
  if (archive) {
    const base = path.basename(String(archive));
    const full = path.join(cfg.paths.archiveDir, base);
    if (!fs.existsSync(full)) throw Object.assign(new Error('Няма такъв архив'), { status: 400 });
    env.ARCHIVE = full;
  }
  if (forceSeed) env.FORCE_SEED = '1';
  return {
    title: `Деплой (${env.PROJECTS || 'всички проекти'})`,
    cmd: 'bash',
    args: [script],
    env,
    exclusive: 'system',
    timeoutMs: 60 * 60 * 1000,
  };
}

// Връщане назад: разгръща СЪЩЕСТВУВАЩ release без разопаковане (RELEASE_DIR).
export function rollbackSpec(cfg, { release, projects }) {
  const script = autodeployScript(cfg);
  if (!script) throw Object.assign(new Error('Няма autodeploy.sh'), { status: 400 });
  const name = path.basename(String(release || ''));
  if (!/^\d{8}-\d{6}$/.test(name)) {
    throw Object.assign(new Error('Невалиден release'), { status: 400 });
  }
  const dir = path.join(cfg.paths.releasesDir, name);
  if (!fs.existsSync(dir)) throw Object.assign(new Error('Няма такъв release'), { status: 400 });
  const env = { RELEASE_DIR: dir };
  if (Array.isArray(projects) && projects.length) {
    for (const p of projects) {
      if (!PROJECT_RX.test(p)) throw Object.assign(new Error(`Невалиден проект: ${p}`), { status: 400 });
    }
    env.PROJECTS = projects.join(' ');
  }
  return {
    title: `Връщане назад към ${name} (${env.PROJECTS || 'всички проекти'})`,
    cmd: 'bash',
    args: [script],
    env,
    exclusive: 'system',
    timeoutMs: 60 * 60 * 1000,
  };
}

// ── Продуктови health проверки ────────────────────────────────────────────────
export async function productHealth(cfg) {
  const checks = cfg.healthChecks || [];
  const results = await Promise.all(
    checks.map(
      (c) =>
        new Promise((resolve) => {
          const started = Date.now();
          let u;
          try {
            u = new URL(c.url);
          } catch {
            resolve({ name: c.name, url: c.url, up: false, error: 'невалиден URL' });
            return;
          }
          const reqFn = u.protocol === 'https:' ? httpsRequest : httpRequest;
          const req = reqFn(u, { method: 'GET', timeout: 5000 }, (res) => {
            res.resume();
            resolve({
              name: c.name,
              url: c.url,
              up: res.statusCode >= 200 && res.statusCode < 400,
              status: res.statusCode,
              ms: Date.now() - started,
            });
          });
          req.on('timeout', () => req.destroy(new Error('timeout')));
          req.on('error', (err) =>
            resolve({ name: c.name, url: c.url, up: false, error: err.message, ms: Date.now() - started })
          );
          req.end();
        })
    )
  );
  return results;
}
