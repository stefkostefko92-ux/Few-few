// Деплой — интеграция с канона на репото: ръчно качен GitHub архив в /root →
// deploy/autodeploy.sh (идемпотентен, monorepo-aware). Панелът показва архиви/
// releases и пуска autodeploy като фонова задача с жив изход.
import fs from 'node:fs';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const PROJECT_RX = /^[\w-]+$/;
// Сверява се с `case "$p" in` в deploy/autodeploy.sh (test/deployfiles.test.js).
// Изостаналият списък криеше panev, piuma и korpora: от панела не можеше да се
// деплойне само един от тях — оставаше „всички" или SSH.
export const KNOWN_PROJECTS = [
  'zabobovdol',
  'medqr',
  'vizitka',
  'panev',
  'ospedali',
  'nexus',
  'mastilko',
  'SupremeDiscordBot',
  'eternaltouch',
  'piuma',
  'korpora',
  'rilievi',
  'fakturist',
  'semki',
  'gaming',
  'fivem',
  'adblock',
  'linketto',
  'liftcon',
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
  return { releases, current, archives, knownProjects: KNOWN_PROJECTS, fetchDeploy: Boolean(fetchDeployScript(cfg)) };
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
  // Казваме на autodeploy.sh, че деплоят идва ОТ панела: тогава той отлага
  // собствения си рестарт, за да не убие този скрипт заедно със себе си
  // (общ systemd cgroup). Виж deploy_vpsdashboard() в autodeploy.sh.
  env.CSD_SELF_DEPLOY = '1';
  return {
    title: `Деплой (${env.PROJECTS || 'всички проекти'})`,
    cmd: 'bash',
    args: [script],
    env,
    exclusive: 'system',
    timeoutMs: 60 * 60 * 1000,
  };
}

// ── Деплой от GitHub — каноничният път, без SSH ───────────────────────────────
// Панелът пуска СЪЩИЯ `deploy/fetch-deploy.sh` като човека по SSH: сървърът сам
// тегли архива за точен ref, проверява, че е нашето репо, пише sha256 и предава
// на autodeploy.sh. Досега от панела ставаше само деплой на качен архив — тоест
// всеки деплой по канона минаваше през SSH (и от телефон — никак).
//
// Ref-ът влиза в URL и в име на файл: правилото е буквално това на
// fetch-deploy.sh (validate_ref), за да откаже ТУК, преди задачата да тръгне.
// Отгоре: `pull/` и `refs/` — codeload сервира и PR от ЧУЖДИ форкове през
// нашето репо, тоест такъв ref е чужд код, пуснат като root.
export const REF_RX = /^[A-Za-z0-9._/-]{1,200}$/;
export function assertRef(ref) {
  const r = String(ref ?? '').trim() || 'main';
  if (!REF_RX.test(r) || r.includes('..') || r.startsWith('-') || r.startsWith('/')) {
    throw Object.assign(new Error('Невалиден ref — позволени са A-Z a-z 0-9 . _ / - (до 200), без „..“ и без водещо „-“.'), { status: 400 });
  }
  if (/^(refs|pull)\//i.test(r)) {
    throw Object.assign(new Error('Ref от PR (pull/…, refs/…) може да е код от чужд форк — не се деплойва оттук. Слей го в main.'), { status: 400 });
  }
  return r;
}

export function fetchDeployScript(cfg) {
  if (cfg.paths.fetchDeploy) return cfg.paths.fetchDeploy;
  const fromCurrent = path.join(cfg.paths.currentLink, 'deploy', 'fetch-deploy.sh');
  return fs.existsSync(fromCurrent) ? fromCurrent : null;
}

export function fetchDeploySpec(cfg, { ref, projects, allowRefSwitch = false } = {}) {
  const script = fetchDeployScript(cfg);
  if (!script) {
    throw Object.assign(new Error('Няма deploy/fetch-deploy.sh в текущия release — пусни fetch-deploy.sh веднъж по SSH (виж deploy/README.md).'), { status: 400 });
  }
  const env = { REF: assertRef(ref), CSD_SELF_DEPLOY: '1' };
  if (Array.isArray(projects) && projects.length) {
    if (projects.length > KNOWN_PROJECTS.length) throw Object.assign(new Error('Твърде много проекти.'), { status: 400 });
    for (const p of projects) {
      if (!PROJECT_RX.test(p) || !KNOWN_PROJECTS.includes(p)) throw Object.assign(new Error(`Непознат проект: ${String(p).slice(0, 40)}`), { status: 400 });
    }
    env.PROJECTS = [...new Set(projects)].join(' ');
  }
  // Пазачът на ref-а в fetch-deploy.sh спира смяна на ref за продукт, разгърнат от
  // друг клон. Разрешението е изрично и само от човек (не и от предложение на агент).
  if (allowRefSwitch === true) env.ALLOW_REF_SWITCH = '1';
  return {
    title: `Деплой от GitHub: ${env.REF} (${env.PROJECTS || 'всички проекти'})`,
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
  // Същият флаг като при деплоя. Без него връщането назад, което включва самия
  // панел, минава по НЕ-самодеплой пътя → `systemctl restart` → SIGTERM на целия
  // cgroup → скриптът умира ПРЕДИ да пренасочи `current`. Панелът се вдига на
  // стария код, но `current` продължава да сочи счупения release, значи следващият
  // деплой чете autodeploy.sh от него. Тоест връщането назад се самоубива точно
  // когато най-много ти трябва.
  const env = { RELEASE_DIR: dir, CSD_SELF_DEPLOY: '1' };
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
          // `host` е нужен за статичните сайтове зад Caddy/Nginx: те се
          // разпознават по домейн, не по порт. Заявка към 127.0.0.1 без правилен
          // Host попада в сайта по подразбиране и „проверката" мери чужд сайт.
          const headers = c.host ? { host: String(c.host).slice(0, 253) } : undefined;
          const req = reqFn(u, { method: 'GET', timeout: 5000, headers }, (res) => {
            res.resume();
            // 3xx се брои за „жив" (иначе деплоят вдига критична аларма за
            // работещ сайт), но се ПОМНИ: пробата към `/` на продукт зад HTTPS
            // пренасочване мери само пренасочването — medqr отговаряше 308 и
            // SLO-то му беше вечно зелено дори при мъртва база (поука на
            // Наблюдателя). Самопроверката и „Продукти" го казват с поправка.
            const redirect = res.statusCode >= 300 && res.statusCode < 400;
            resolve({
              name: c.name,
              url: c.url,
              host: c.host || null,
              up: res.statusCode >= 200 && res.statusCode < 400,
              status: res.statusCode,
              ...(redirect ? { redirect: String(res.headers.location || '').slice(0, 200) || true } : {}),
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
