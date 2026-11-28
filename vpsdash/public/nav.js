// Навигацията на „Топокарта" (v1.19): 40 секции в 7 хъба.
//
// Чист модул — нула DOM, за да се тества с `node --test` (test/nav.test.js).
// Хъбът отговаря на ВЪПРОС, не на технология („какво върви?", „кой влиза?").
// Всяка секция е в ТОЧНО един хъб; тестът сверява списъка със SECTIONS в app.js,
// защото затворен списък изостава от реалността и мълчи (доктрината на продукта).

export const HUBS = [
  { id: 'pulse', label: 'Пулс', q: 'Какво става и какво иска мен?', icon: 'nav-overview',
    sections: ['overview', 'products', 'slo', 'traffic', 'alerts', 'approvals'] },
  { id: 'work', label: 'Работа', q: 'Какво върви на машината?', icon: 'nav-services',
    sections: ['services', 'docker', 'compose', 'processes', 'logs', 'cron'] },
  { id: 'release', label: 'Издаване', q: 'Как променям това, което работи?', icon: 'act-upload',
    sections: ['deploy', 'updates', 'webserver', 'domains', 'env'] },
  { id: 'data', label: 'Данни', q: 'Какво пазя и колко място има?', icon: 'nav-databases',
    sections: ['backups', 'databases', 'redis', 'disk', 'files'] },
  { id: 'defense', label: 'Защита', q: 'Кой може да влезе?', icon: 'nav-security',
    sections: ['security', 'ports', 'firewall', 'fail2ban', 'integrity', 'access'] },
  { id: 'analysis', label: 'Анализ', q: 'Какво се случи и защо?', icon: 'nav-diagnostics',
    sections: ['investigate', 'diagnostics', 'selfcheck', 'audit', 'jobs'] },
  { id: 'control', label: 'Управление', q: 'Как пипам самата машина и панела?', icon: 'nav-terminal',
    sections: ['terminal', 'runonce', 'desktop', 'agents', 'machine', 'settings', 'power'] },
];

const BY_SECTION = new Map(HUBS.flatMap((h) => h.sections.map((s) => [s, h.id])));

// Секция, забравена тук, не изчезва: отива в „Управление" — по-добре на грешно
// място, отколкото невидима (същото правило като в старите NAV_GROUPS).
export function hubOf(section) {
  return BY_SECTION.get(section) || 'control';
}

export function hubById(id) {
  return HUBS.find((h) => h.id === id) || HUBS[HUBS.length - 1];
}

// Ключът на алармата → хъбът, където живее причината. Префиксите са събрани от
// `key:` в src/*.js; непознатият отива в „Пулс" (там е „Аларми") — значката
// никога не изчезва заради липсващ ред в тази таблица.
const ALERT_PREFIX = [
  ['work', ['service', 'flap', 'oom', 'cpu', 'mem', 'psi', 'steal', 'fds', 'listen-overflow', 'logmine', 'reboot']],
  ['release', ['apt', 'github', 'cert', 'domain', 'domain-hold']],
  ['data', ['backup', 'disk', 'disk-eta', 'inode', 'ro', 'redis-bgsave', 'redis-evict', 'redis-mem', 'redis-persist', 'redis-rejected']],
  ['defense', ['ports', 'etc', 'ssh', 'brute-force', 'posture', 'revoke-not-persisted']],
  ['analysis', ['audit-ship-never', 'audit-ship-stale']],
  ['control', ['peer']],
];
const BY_PREFIX = new Map(ALERT_PREFIX.flatMap(([hub, ps]) => ps.map((p) => [p, hub])));

export function hubOfAlert(key) {
  const k = String(key || '');
  // Префиксът е частта до първото „:" (`disk:/`, `service:nginx`) или целият ключ (`cpu`).
  const head = k.split(':')[0];
  return BY_PREFIX.get(head) || 'pulse';
}

// Най-лошото по хъб от активните аларми: critical → danger, warning → warn.
// Аномалиите (info) не будят човек — и не светят хъб (доктрината на алармите).
export function hubStates(active) {
  const out = Object.fromEntries(HUBS.map((h) => [h.id, { sev: null, n: 0 }]));
  for (const a of active || []) {
    const sev = a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warn' : null;
    if (!sev) continue;
    const s = out[hubOfAlert(a.key)];
    if (s.sev === sev) s.n++;
    else if (!s.sev || (sev === 'danger' && s.sev === 'warn')) {
      s.sev = sev;
      s.n = 1;
    }
  }
  return out;
}
