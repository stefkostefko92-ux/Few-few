// Carbon Stealth VPS Dashboard — клиент (vanilla ES modules, нула зависимости).
import {
  el, fmtBytes, fmtBps, fmtUptime, fmtWhen, pill, toast, escapeHtml, pctHtml, memPctOf, plural,
  registerCommand, clearCommands, openPalette, liveStream, confirmDanger,
} from './ui.js';
import { t, setLang, getLang, languages, translateDom } from './i18n.js';

// ── Състояние + API слой (с federation рутинг към избрания възел) ──────────────
const state = { node: 'local', me: null, section: 'overview', metricsEs: null, sectionEs: null, hist: [] };

// Затваря потока на текущата секция (логове/следене) при навигация.
function closeSectionStream() {
  if (state.sectionEs) {
    state.sectionEs.close();
    state.sectionEs = null;
  }
}

function apiBase() {
  return state.node && state.node !== 'local' ? `/api/nodes/${state.node}` : '/api';
}

async function api(pathname, { method = 'GET', body, _retry = false } = {}) {
  const opts = { method, headers: {} };
  if (method !== 'GET') {
    opts.headers['x-csd'] = '1';
    if (body !== undefined) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(apiBase() + pathname, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error('Не си вписан');
  }
  // 428 = действието иска повторно потвърждаване. Питаме тук веднъж и повтаряме
  // заявката — иначе всяко извикващо място трябва да помни да го обработи.
  if (res.status === 428 && !_retry) {
    const ok = await askSudo();
    if (!ok) throw new Error('Действието е отказано.');
    return api(pathname, { method, body, _retry: true });
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

// Повторна автентикация точно преди необратимото. Разликата, която прави: с
// открадната сесия „изтрий/възстанови/изключи" вече иска и паролата.
let sudoPending = null;
function askSudo() {
  // Няколко заявки наведнъж → един диалог, не пет наслагани.
  if (sudoPending) return sudoPending;
  sudoPending = new Promise((resolve) => {
    const pass = el('input', { type: 'password', placeholder: 'парола', autocomplete: 'current-password' });
    const code = el('input', { type: 'text', placeholder: 'код от приложението (ако имаш 2FA)', autocomplete: 'one-time-code', inputmode: 'numeric' });
    const err = el('div', { class: 'metric-sub', style: 'color:var(--danger)' });
    const btn = el('button', { class: 'btn btn-primary', text: 'Потвърди' });
    const dlg = el('dialog', { class: 'confirm-dlg' }, [
      el('h3', { text: '🔐 Потвърди самоличността си' }),
      el('div', { class: 'confirm-what' }, [
        el('div', { text: '• Това действие е необратимо или дава контрол над машината.' }),
        el('div', { text: '• Разрешението важи 5 минути и само за този браузър.' }),
      ]),
      pass, code, err,
      el('div', { class: 'toolbar' }, [
        btn,
        el('button', { class: 'btn btn-sm', text: 'Откажи', onclick: () => finish(false) }),
      ]),
    ]);
    const finish = (ok) => {
      dlg.close();
      dlg.remove();
      sudoPending = null;
      resolve(ok);
    };
    btn.onclick = async () => {
      btn.disabled = true;
      err.textContent = '';
      try {
        const res = await fetch(apiBase() + '/sudo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csd': '1' },
          body: JSON.stringify({ password: pass.value, code: code.value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.usedRecovery) toast(`Използва се резервен код — остават ${data.recoveryLeft}`, 'warn');
        startSudoCountdown(data.until || Date.now() + (data.remainingMs || 0));
        finish(true);
      } catch (e) {
        err.textContent = e.message;
        pass.value = '';
        btn.disabled = false;
        pass.focus();
      }
    };
    pass.onkeydown = code.onkeydown = (e) => {
      if (e.key === 'Enter') btn.click();
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    pass.focus();
  });
  return sudoPending;
}

// ── Живо състояние на повишените права ───────────────────────────────────────
// Даваш парола за ЕДНО действие и оставаш с отключен панел още пет минути. Дотук
// това беше невидимо: нищо на екрана не казваше, че браузърът ти в момента може
// да изключи сървъра без да пита. А маршрутът за отказване съществуваше от
// самото начало — просто нямаше как да се стигне до него.
let sudoTimer = null;
function startSudoCountdown(until) {
  const badge = document.getElementById('sudo-badge');
  const left = document.getElementById('sudo-left');
  if (!badge || !left) return;
  clearInterval(sudoTimer);
  const tick = () => {
    const ms = until - Date.now();
    if (ms <= 0) {
      badge.classList.add('hidden');
      clearInterval(sudoTimer);
      sudoTimer = null;
      return;
    }
    const s = Math.ceil(ms / 1000);
    left.textContent = `${t('отключено')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    badge.classList.remove('hidden');
  };
  tick();
  sudoTimer = setInterval(tick, 1000);
}

function wireSudoLock() {
  const btn = document.getElementById('sudo-lock');
  if (!btn) return;
  btn.onclick = async () => {
    try {
      await api('/sudo/revoke', { method: 'POST' });
      clearInterval(sudoTimer);
      sudoTimer = null;
      document.getElementById('sudo-badge')?.classList.add('hidden');
      toast('Заключено — следващото необратимо действие ще поиска парола отново.', 'ok');
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
}

function sseUrl(pathname) {
  return apiBase() + pathname;
}

// ── Вход ───────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login').classList.remove('hidden');
  // Ако входът иска втори фактор, показваме полето предварително.
  fetch('/api/auth/info')
    .then((r) => r.json())
    .then((i) => {
      if (i.totp) document.getElementById('login-code-wrap').classList.remove('hidden');
    })
    .catch(() => {});
}
function showApp() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-err');
  err.textContent = '';
  try {
    await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csd': '1' },
      body: JSON.stringify({
        user: document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value,
        code: document.getElementById('login-code').value || undefined,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error || 'Грешка');
    });
    await boot();
  } catch (e2) {
    err.textContent = e2.message;
    // Сървърът поиска втори фактор → показваме полето и фокусираме там.
    if (/2FA|код/i.test(e2.message)) {
      document.getElementById('login-code-wrap').classList.remove('hidden');
      document.getElementById('login-code').focus();
    }
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', headers: { 'x-csd': '1' } });
  location.reload();
});

// ── Навигация ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'overview', img: 'nav-overview', ico: '▤', label: 'Обзор', render: renderOverview },
  { id: 'products', img: 'nav-products', ico: '❤', label: 'Продукти', render: renderProducts },
  { id: 'slo', img: 'nav-slo', ico: '◑', label: 'Надеждност', render: renderSlo },
  { id: 'alerts', img: 'nav-alerts', ico: '🔔', label: 'Аларми', render: renderAlerts },
  { id: 'diagnostics', img: 'nav-diagnostics', ico: '⚕', label: 'Диагностика', render: renderDiagnostics },
  { id: 'investigate', img: 'act-search', ico: '🔍', label: 'Разследване', render: renderInvestigate },
  { id: 'services', img: 'nav-services', ico: '⚙', label: 'Услуги', render: renderServices },
  { id: 'docker', img: 'nav-docker', ico: '⬢', label: 'Docker', render: renderDocker },
  { id: 'compose', img: 'nav-compose', ico: '⧉', label: 'Compose', render: renderCompose },
  { id: 'databases', img: 'nav-databases', ico: '⛁', label: 'Бази', render: renderDatabases },
  { id: 'redis', img: 'nav-redis', ico: '⚡', label: 'Redis', render: renderRedis },
  { id: 'processes', img: 'nav-processes', ico: '≡', label: 'Процеси', render: renderProcesses },
  { id: 'logs', img: 'act-file', ico: '☰', label: 'Логове', render: renderLogs },
  { id: 'traffic', img: 'nav-traffic', ico: '📶', label: 'Трафик', render: renderTraffic },
  { id: 'deploy', img: 'act-upload', ico: '⇧', label: 'Деплой', render: renderDeploy },
  { id: 'updates', img: 'act-restart', ico: '⟳', label: 'Ъпдейти', render: renderUpdates },
  { id: 'security', img: 'nav-security', ico: '⛨', label: 'Сигурност', render: renderSecurity },
  { id: 'ports', img: 'nav-ports', ico: '🔌', label: 'Портове', render: renderPorts },
  { id: 'firewall', img: 'nav-firewall', ico: '🛡', label: 'Firewall', render: renderFirewall },
  { id: 'integrity', img: 'nav-integrity', ico: '⛨', label: 'Целост на /etc', render: renderIntegrity },
  { id: 'fail2ban', img: 'nav-fail2ban', ico: '⛔', label: 'fail2ban', render: renderFail2ban },
  { id: 'access', img: 'act-key', ico: '🔑', label: 'Достъп по IP', render: renderAccess },
  { id: 'webserver', img: 'nav-webserver', ico: '🌐', label: 'Уеб сървър', render: renderWebserver },
  { id: 'backups', img: 'act-download', ico: '⇩', label: 'Бекъпи', render: renderBackups },
  { id: 'disk', img: 'act-save', ico: '▤', label: 'Диск', render: renderDisk },
  { id: 'env', img: 'act-key-lock', ico: '🗝', label: 'Променливи (.env)', render: renderEnv },
  { id: 'domains', img: 'nav-domains', ico: '🔒', label: 'Домейни и TLS', render: renderDomains },
  { id: 'cron', img: 'nav-cron', ico: '◷', label: 'Крон/таймери', render: renderCron },
  { id: 'files', img: 'act-folder', ico: '🗀', label: 'Файлове', render: renderFiles },
  { id: 'desktop', img: 'nav-desktop', ico: '🖥', label: 'Десктоп', render: renderDesktop },
  { id: 'terminal', img: 'nav-terminal', ico: '⌘', label: 'Терминал', render: renderPty },
  { id: 'runonce', img: 'act-play', ico: '▷', label: 'Еднократна команда', render: renderTerminal },
  { id: 'agents', img: 'act-robot', ico: '✦', label: 'Агенти', render: renderAgents },
  { id: 'jobs', img: 'nav-jobs', ico: '⏻', label: 'Задачи', render: renderJobs },
  { id: 'audit', img: 'nav-audit', ico: '✎', label: 'Одит', render: renderAudit },
  { id: 'settings', img: 'act-tools', ico: '⚿', label: 'Настройки', render: renderSettings },
  { id: 'power', img: 'nav-power', ico: '⏼', label: 'Захранване', render: renderPower },
];

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  clearCommands('nav');
  const gotoFor = Object.fromEntries(Object.entries(GOTO_KEYS).map(([k, v]) => [v, k]));
  for (const s of SECTIONS) {
    // Секция с img ползва иконата от комплекта; останалите пазят глифа,
    // докато дойде пълният nav-* лист.
    const b = el('button', { onclick: () => go(s.id) }, [
      s.img
        ? el('span', { class: 'ico' }, [el('img', { class: 'ico-img', src: `/icons/${s.img}.png`, alt: '' })])
        : el('span', { class: 'ico', text: s.ico }),
      el('span', { text: s.label }),
    ]);
    b.dataset.id = s.id;
    nav.appendChild(b);
    registerCommand({
      id: `go:${s.id}`,
      scope: 'nav',
      label: `Отиди: ${s.label}`,
      section: 'Навигация',
      // Търси се и на латиница, и на кирилица — интерфейсът е български, но
      // имената на технологиите се пишат и по двата начина.
      keywords: `${s.id} ${SECTION_ALIASES[s.id] || ''}`,
      hint: gotoFor[s.id] ? `g ${gotoFor[s.id]}` : undefined,
      run: () => go(s.id),
    });
  }
}

// Търсачка над вече нарисувана таблица — филтрира DOM редовете, без нова заявка.
function attachFilter(input, container, { count } = {}) {
  const apply = () => {
    const q = input.value.toLowerCase().trim();
    let shown = 0;
    for (const row of container.querySelectorAll('tbody tr')) {
      const hit = !q || row.textContent.toLowerCase().includes(q);
      row.hidden = !hit;
      if (hit) shown++;
    }
    if (count) count.textContent = q ? t(`${shown} от ${container.querySelectorAll('tbody tr').length}`) : '';
  };
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(apply, 80);
  });
  return apply;
}

function searchBox(placeholder = 'Филтрирай…') {
  return el('input', { type: 'search', placeholder, class: 'grow', 'aria-label': placeholder });
}

// Поколение на навигацията. Бавна секция (напр. „Ъпдейти", която чака apt) си
// дорисува ЗАКЪСНЯЛО и презаписва секцията, към която вече си отишъл — видяно на
// живо: отваряш „Задачи", а вътре стои списъкът с пакети.
//
// ВНИМАНИЕ какво прави и какво НЕ прави този брояч: той служи САМО за отсяване
// на закъсняла ГРЕШКА от изоставена секция (единственият му читател е catch-ът
// в `go()`). Живото рисуване е защитено от нещо друго — `go()` подменя `#view`
// със СВЕЖ възел и всеки render взема `view` в първите си два реда, значи
// закъснелият отговор пише в откачен от документа възел.
// Затова: ако пишеш нов render, вземи `view` ПРЕДИ първото `await`. Няма гейт,
// който да те спаси, ако го вземеш след това.
let navGen = 0;
function isCurrentRender(gen) {
  return gen === navGen;
}

function go(id) {
  const gen = ++navGen;
  state.section = id;
  stopMetrics();
  closeSectionStream();
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('active', b.dataset.id === id);
  const s = SECTIONS.find((x) => x.id === id);
  document.getElementById('section-title').textContent = t(s.label);
  // Всяка навигация получава СВЕЖ #view възел. Закъснялата секция държи стария
  // (вече откачен) възел и пише в нищото — вместо да замаже новата. Работи за
  // ВСИЧКИ секции наведнъж, защото всяка взема `view` ПРЕДИ първото await.
  const old = document.getElementById('view');
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  showSkeleton();
  document.querySelector('.sidebar').classList.remove('open');
  clearCommands('section'); // командите на предишната секция си отиват с нея
  s.render().catch((e) => {
    if (!isCurrentRender(gen)) return; // закъсняла грешка от изоставена секция
    document.getElementById('view').innerHTML = `<div class="empty">Грешка: ${escapeHtml(e.message)}</div>`;
  });
}

// Скелет с формата на очакваното съдържание — по-малко усещане за чакане от спинър.
function showSkeleton(rows = 5) {
  const view = document.getElementById('view');
  view.innerHTML = '';
  const sk = el('div', { class: 'skeleton', 'aria-busy': 'true', 'aria-label': 'Зареждам' });
  sk.appendChild(el('div', { class: 'sk-row tall' }));
  for (let i = 0; i < rows; i++) sk.appendChild(el('div', { class: 'sk-row' }));
  view.appendChild(sk);
}

// ── Клавиатура: палет + бърза навигация (патърнът на Gmail/Linear) ────────────
// Кирилски/латински синоними за палета — „докер", „логове", „файлове" и т.н.
const SECTION_ALIASES = {
  overview: 'обзор начало dashboard',
  products: 'продукти сайтове health',
  slo: 'надеждност slo бюджет за грешки error budget burn rate наличност sre',
  investigate: 'разследване инцидент какво се случи промяна времева линия incident',
  alerts: 'аларми известия notifications telegram ntfy',
  services: 'услуги сервизи systemd unit',
  docker: 'докер контейнери containers',
  compose: 'композе стек stack',
  databases: 'бази данни sqlite postgres дъмп dump',
  redis: 'редис redis кеш памет ключове eviction изхвърлени сесии опашки',
  processes: 'процеси ps top kill',
  logs: 'логове дневник journal journalctl',
  traffic: 'трафик access log nginx бавни адреси endpoint заявки ботове грешки',
  deploy: 'деплой разгръщане release rollback архив zip',
  updates: 'ъпдейти обновявания apt upgrade',
  security: 'сигурност портове ssh tls сертификати',
  ports: 'портове изложеност ufw смяна на порт listening ss',
  disk: 'диск място du journal vacuum docker кеш най-големи файлове папки',
  firewall: 'файъруол защитна стена ufw правила',
  integrity: 'целост отпечатък baseline промени etc конфигурация',
  fail2ban: 'фейлтубан банове блокирани ip jail забрана',
  access: 'достъп ip allowlist разрешени адреси sudo режим',
  desktop: 'десктоп графичен интерфейс gui xfce ubuntu браузър vnc',
  webserver: 'уеб сървър нгинкс nginx caddy vhost certbot',
  backups: 'бекъпи архиви restic снимки',
  env: 'променливи env среда secrets тайни конфигурация ключове',
  domains: 'домейни dns tls сертификати certbot lets encrypt ssl',
  cron: 'крон таймери timers разписание пусни сега история',
  files: 'файлове файлов браузър',
  terminal: 'терминал конзола shell bash ssh',
  runonce: 'команда еднократна run',
  agents: 'агенти флот fleet',
  jobs: 'задачи работи tasks',
  audit: 'одит дневник история',
  settings: 'настройки 2fa totp двуфакторна',
  power: 'захранване рестарт reboot изключване poweroff',
};

const GOTO_KEYS = {
  o: 'overview', p: 'products', a: 'alerts', s: 'services', d: 'docker', c: 'compose',
  b: 'databases', l: 'logs', u: 'updates', f: 'files', t: 'terminal', j: 'jobs', w: 'webserver',
};
let gPending = false;

document.addEventListener('keydown', (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  // Палетът работи навсякъде, включително в поле.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
    return;
  }
  if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.getElementById('app').classList.contains('hidden')) return;

  if (gPending) {
    gPending = false;
    const target = GOTO_KEYS[e.key.toLowerCase()];
    if (target) {
      e.preventDefault();
      go(target);
    }
    return;
  }
  if (e.key === 'g') {
    gPending = true;
    setTimeout(() => (gPending = false), 1200);
  } else if (e.key === '/') {
    // Фокусира търсачката на текущата секция.
    const box = document.querySelector('#view input[type="search"]');
    if (box) {
      e.preventDefault();
      box.focus();
      box.select();
    }
  } else if (e.key === 'r') {
    go(state.section);
  } else if (e.key === '?') {
    openPalette();
  }
});

// Индикатор за връзка: живо / свързва се / прекъснато.
function setConnStatus(status) {
  const dot = document.getElementById('conn-dot');
  dot.classList.toggle('live', status === 'live');
  dot.classList.toggle('connecting', status === 'connecting');
  dot.classList.toggle('down', status === 'down');
  dot.title =
    t(status === 'live' ? 'Връзка на живо' : status === 'connecting' ? 'Свързвам се…' : status === 'down' ? 'Връзката прекъсна — пробвам пак' : 'Няма поток');
  const sr = document.getElementById('conn-sr');
  if (sr) sr.textContent = dot.title;
}

// ── Език (БГ/EN/IT) ──────────────────────────────────────────────────────────
// Преводът на статичния HTML става веднъж тук; всичко, рисувано от кода, минава
// през el()/toast() в ui.js. Смяната презарежда — виж i18n.js защо.
document.documentElement.lang = getLang();
translateDom(document.body);

// Банер „поддръжка" — вижда се от ВСЯКА секция, не само от „Аларми". Опреснява
// се на минута: банер, който остава след края, подвежда точно колкото липсващ.
{
  const banner = el('div', { id: 'maint-banner', class: 'maint-banner hidden' });
  document.querySelector('.topbar')?.after(banner);
  const refresh = async () => {
    try {
      const r = await api('/alerts/maintenance');
      const m = r.maintenance;
      banner.classList.toggle('hidden', !m);
      if (m) {
        banner.innerHTML = '';
        banner.appendChild(el('span', { text:
          `🔧 ${t('Режим „поддръжка" до')} ${new Date(m.until).toLocaleTimeString(langTagSafe())}` +
          `${m.reason ? ` · ${m.reason}` : ''} — ${t('известията са на пауза, алармите се смятат')}` }));
      }
    } catch { /* невписан/мрежа — банерът не е критичен */ }
  };
  setInterval(refresh, 60000);
  window.__refreshMaintBanner = refresh;
  setTimeout(refresh, 1500);
}
function langTagSafe() {
  return { bg: 'bg-BG', en: 'en-GB', it: 'it-IT' }[getLang()] || 'bg-BG';
}
{
  const wrap = el('div', { class: 'lang-switch', role: 'group', 'aria-label': 'Език / Language / Lingua' },
    languages().map((l) =>
      el('button', {
        class: 'lang-btn' + (l.id === getLang() ? ' active' : ''),
        text: l.label,
        title: { bg: 'Български', en: 'English', it: 'Italiano' }[l.id],
        onclick: () => setLang(l.id),
      })
    ));
  document.querySelector('.topbar-right')?.insertBefore(wrap, document.getElementById('btn-palette'));
}

document.getElementById('menu-toggle').addEventListener('click', () =>
  document.querySelector('.sidebar').classList.toggle('open')
);
document.getElementById('btn-refresh').addEventListener('click', () => go(state.section));

// ── Node switcher ────────────────────────────────────────────────────────────
async function loadNodes() {
  const sel = document.getElementById('node-select');
  const status = document.getElementById('node-status');
  let data;
  try {
    data = await (await fetch('/api/nodes', { headers: {} })).json();
  } catch {
    return;
  }
  sel.innerHTML = '';
  sel.appendChild(el('option', { value: 'local', text: `● ${data.local.name}` + t(' (локален)') }));
  for (const p of data.peers || []) {
    sel.appendChild(el('option', { value: p.id, text: `${p.up ? '●' : '○'} ${p.name}` }));
  }
  sel.value = state.node;
  const peers = data.peers || [];
  status.textContent = t(peers.length
    ? `${peers.filter((p) => p.up).length}/${peers.length} peer(s) на линия`
    : 'Няма конфигурирани peer-и');
  sel.onchange = () => {
    state.node = sel.value;
    go(state.section);
  };
}

// ── Обзор + живи графики ───────────────────────────────────────────────────────
async function renderOverview() {
  const view = document.getElementById('view');
  const range = state.range || '24h';
  const [ov, hist] = await Promise.all([api('/overview'), api('/metrics/history?range=' + range)]);
  state.hist = hist.points || [];
  const m = ov.metrics;
  const info = ov.info;

  view.innerHTML = '';
  const rangeSel = el('select', { 'aria-label': 'Период на историята' }, (hist.ranges || ['24h']).map((k) => el('option', { value: k, text: 'история: ' + k })));
  rangeSel.value = hist.range || range;
  rangeSel.onchange = () => {
    state.range = rangeSel.value;
    go('overview');
  };
  view.appendChild(el('div', { class: 'toolbar' }, [rangeSel, el('span', { class: 'muted', text: `${plural(state.hist.length, 'точка', 'точки')} (пазят се 7 дни на диска)` })]));
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, [
      metricCard('CPU', 'cpu', pctHtml(m.cpuPct), `${plural(info.cpus, 'ядро', 'ядра')} · load ${m.load.map((x) => x.toFixed(2)).join(' ')}`),
      metricCard('Памет', 'mem', pctHtml(memPctOf(m.mem)), `${fmtBytes(m.mem.used)} / ${fmtBytes(m.mem.total)}`),
      metricCard('Мрежа ▼', 'rx', fmtBps(m.net.rxBps), `качване ▲ ${fmtBps(m.net.txBps)}`),
      metricCard('Диск', 'disk', `${Math.max(0, ...m.disks.map((d) => d.usePercent))}<small>%</small>`, m.disks.map((d) => `${d.mount} ${d.usePercent}%`).join(' · ')),
    ])
  );

  const sys = el('div', { class: 'grid grid-2' }, [
    el('div', { class: 'card' }, [
      el('h3', { text: 'Система' }),
      kv({
        Хост: info.hostname,
        ОС: info.os,
        Ядро: info.kernel,
        Архитектура: info.arch,
        CPU: info.cpuModel,
        Uptime: fmtUptime(info.uptimeSec),
        Node: info.nodeVersion,
        'Рестарт нужен': info.rebootRequired ? 'ДА ⚠' : 'не',
      }),
    ]),
    el('div', { class: 'card' }, [
      el('h3', { text: 'Дискове' }),
      el('div', { class: 'table-wrap' }, [
        tableEl(
          ['Файлова система', 'Точка', 'Ползвано', 'Общо', '%'],
          m.disks.map((d) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: d.fs }),
              el('td', { text: d.mount }),
              el('td', { text: fmtBytes(d.usedBytes) }),
              el('td', { text: fmtBytes(d.totalBytes) }),
              el('td', {}, [barEl(d.usePercent)]),
            ])
          )
        ),
      ]),
    ]),
  ]);
  view.appendChild(sys);

  drawSpark('spark-cpu', state.hist.map((p) => p.cpu), 100);
  drawSpark('spark-mem', state.hist.map((p) => (p.memUsed / p.memTotal) * 100), 100);
  drawSpark('spark-rx', state.hist.map((p) => p.rxBps), null, true);
  drawSpark('spark-disk', state.hist.map((p) => p.diskMax), 100);

  startMetrics((snap) => {
    setHtml('mc-cpu', pctHtml(snap.cpuPct));
    setHtml('mc-mem', pctHtml(memPctOf(snap.mem)));
    setHtml('mc-rx', fmtBps(snap.net.rxBps));
    setHtml('mc-disk', `${Math.max(0, ...snap.disks.map((d) => d.usePercent))}<small>%</small>`);
    pushHist(snap);
    drawSpark('spark-cpu', state.hist.map((p) => p.cpu), 100);
    drawSpark('spark-mem', state.hist.map((p) => (p.memUsed / p.memTotal) * 100), 100);
    drawSpark('spark-rx', state.hist.map((p) => p.rxBps), null, true);
    drawSpark('spark-disk', state.hist.map((p) => p.diskMax), 100);
  });
}

function pushHist(snap) {
  state.hist.push({
    ts: snap.ts,
    cpu: snap.cpuPct,
    memUsed: snap.mem.used,
    memTotal: snap.mem.total,
    rxBps: snap.net.rxBps,
    txBps: snap.net.txBps,
    diskMax: Math.max(0, ...snap.disks.map((d) => d.usePercent)),
  });
  if (state.hist.length > 240) state.hist.shift();
}

function metricCard(title, key, valHtml, sub) {
  // Собствен клас: живите плочки се държат различно от обикновените карти
  // (издигат се при посочване, числото носи сияние). Без него ефектът щеше да
  // важи за ВСЯКА карта, включително дългите текстови — там е шум.
  return el('div', { class: 'card metric-card' }, [
    el('div', { class: 'card-head' }, [el('h3', { text: title })]),
    el('div', { class: 'metric-val', id: `mc-${key}`, html: valHtml }),
    el('canvas', { class: 'spark', id: `spark-${key}` }),
    el('div', { class: 'metric-sub', text: sub }),
  ]);
}

// Canvas sparkline — чисто 2D, без библиотеки.
function drawSpark(id, data, max, isRate = false) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 220;
  const h = cv.clientHeight || 46;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!data || data.length < 2) return;
  const peak = max || Math.max(1, ...data);
  const n = data.length;
  const step = w / (n - 1);
  const y = (v) => h - 3 - (Math.min(v, peak) / peak) * (h - 6);
  ctx.beginPath();
  ctx.moveTo(0, y(data[0]));
  for (let i = 1; i < n; i++) ctx.lineTo(i * step, y(data[i]));
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#33e6a0');
  grad.addColorStop(1, '#2bb3ff');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(51,230,160,0.08)';
  ctx.fill();
}

function startMetrics(onSnap) {
  stopMetrics();
  // Обединен поток с преизграждане на връзката (експоненциален backoff) —
  // при прекъсване интерфейсът го КАЗВА, вместо да замръзне тихо с живо на вид табло.
  state.metricsEs = liveStream(sseUrl('/stream/metrics'), {
    events: {
      metrics: (e) => {
        try {
          const snap = JSON.parse(e.data);
          state.lastSnapAt = Date.now();
          markFresh();
          onSnap(snap);
        } catch {
          /* игнор */
        }
      },
    },
    onStatus: (s) => {
      setConnStatus(s);
      if (s === 'down' || s === 'connecting') markStale();
    },
  });
}
function stopMetrics() {
  if (state.metricsEs) {
    state.metricsEs.close();
    state.metricsEs = null;
  }
  setConnStatus('off');
  markFresh();
}

// Печат „остаряло от HH:MM" — в контролен панел мълчаливо замръзнало табло е
// по-опасно от липсващо: може да скрие истински инцидент зад стари „зелени" данни.
function markStale() {
  const b = document.getElementById('stale-banner');
  if (!state.lastSnapAt) return;
  const when = new Date(state.lastSnapAt).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  b.textContent = t(`⚠ данните са от ${when} — връзката прекъсна`);
  b.classList.remove('hidden');
}
function markFresh() {
  document.getElementById('stale-banner').classList.add('hidden');
}

// ── Продукти (health) ───────────────────────────────────────────────────────────
async function renderProducts() {
  const view = document.getElementById('view');
  const [data, targets] = await Promise.all([api('/health/products'), api('/probe/targets').catch(() => ({ peers: [] }))]);
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Живо здраве на всеки продукт (локални health URL-и). Локалната проба тръгва ОТВЪТРЕ — не хваща паднал Nginx, счупен DNS или мрежата на доставчика. За това служат кръстосаните проби долу.' }));
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, data.map((p) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: p.name }),
          pill(p.up ? 'ok' : 'bad', p.up ? `${p.status || 'UP'}` : 'DOWN'),
        ]),
        el('div', { class: 'metric-sub mono', text: p.url }),
        el('div', { class: 'metric-sub', text: p.up ? `отговор за ${p.ms} ms` : p.error || `статус ${p.status || '—'}` }),
      ])
    ))
  );

  // ── Кръстосани проби: другият VPS гледа НАШИТЕ публични адреси ─────────────
  view.appendChild(el('h3', { class: 'muted', text: 'Външна гледна точка (кръстосани проби)', style: 'margin:24px 0 10px' }));
  const peers = targets.peers || [];
  if (!peers.length) {
    view.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'metric-sub', text: 'Няма конфигурирани peer-и. Добавиш ли втория VPS с "probeTargets" в неговия запис, всеки сървър ще сондира публичните адреси на другия — истинска външна проверка без облачна услуга.' }),
      ])
    );
  }
  for (const peer of peers) {
    const box = el('div', { class: 'card', style: 'margin-bottom:12px' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: `Сондирам ${peer.name} (${peer.targets.length} адреса)` }),
        el('button', {
          class: 'btn btn-sm', text: '▶ Провери сега',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await api(`/nodes/${peer.id}/crossprobe`);
              renderProbeResults(box, r.targets, r.note);
            } catch (err) { toast(err.message, 'bad'); }
            e.target.disabled = false;
          },
        }),
      ]),
      el('div', { class: 'metric-sub', text: peer.targets.map((tg) => tg.url).join(' · ') || 'няма зададени probeTargets' }),
    ]);
    view.appendChild(box);
  }
}

// ── Надеждност: SLO, бюджет за грешки, скорост на изгаряне ────────────────────────
// Показва отговора на въпроса „колко право на грешка ми остава", а не „има ли
// грешка сега". Бюджетът е разрешението да рискуваш: пълен бюджет → пускай;
// изчерпан → замразявай промените и гаси.
async function renderSlo() {
  const view = document.getElementById('view');
  const data = await api('/slo');
  view.innerHTML = '';
  if (data.enabled === false) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: 'SLO е изключен в конфига („slo.enabled": false).' })]));
    return;
  }
  const targetPct = (data.target * 100).toFixed(data.target >= 0.999 ? 2 : 1);
  view.appendChild(
    el('p', { class: 'section-desc', text:
      `Цел ${targetPct}% наличност за 30 дни. Бюджетът за грешки е допустимият престой — ` +
      `изразходваш ли го, спираш промените, докато не се възстанови. „Скорост на изгаряне" 1× значи, ` +
      `че точно ще стигне за 30 дни; 14.4× значи, че за час гориш 2% от бюджета. Алармата иска ` +
      `И ДВАТА прозореца (дълъг + къс) над прага — късият я гаси бързо след като спре проблемът.` }));

  if (!data.products?.length) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: 'Още няма събрани проби. Панелът пише по един агрегат на минута на продукт — данните се появяват след първите проверки.' })]));
    return;
  }

  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, data.products.map((p) => {
      const b = p.budget || {};
      const left = Number(b.remainingPct ?? 100);
      const kind = left <= 0 ? 'bad' : left < 25 ? 'warn' : 'ok';
      return el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: p.name }),
          pill(kind, `бюджет ${left}%`),
        ]),
        el('div', { class: 'metric-val', text: b.availabilityPct != null ? `${b.availabilityPct.toFixed(3)}%` : '—' }),
        barEl(Number(b.spentPct) || 0),
        el('div', { class: 'metric-sub', text:
          b.total ? `${b.bad} лоши от ${b.total} проби · допустими ${b.allowedBad} · p95 ${b.p95Ms ?? '—'} ms` : 'няма проби за 30 дни' }),
        p.burn
          ? el('div', { class: 'metric-sub' }, [pill(p.burn.severity === 'critical' ? 'bad' : 'warn', `${p.burn.longBurn}× изгаряне`), document.createTextNode(' ' + p.burn.label)])
          : el('div', { class: 'metric-sub', text: 'скоростта на изгаряне е под праговете' }),
      ]);
    }))
  );

  view.appendChild(el('h3', { class: 'muted', text: 'Прозорци', style: 'margin:24px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(
        ['Продукт', 'Проби 1ч', 'Грешки 1ч', 'Бавни 1ч', 'p95 1ч', 'Проби 24ч', 'Грешки 24ч', 'Бавни 24ч', 'p95 24ч'],
        data.products.map((p) => {
          const h = p.last1h || {};
          const d = p.last24h || {};
          return el('tr', {}, [
            el('td', { text: p.name }),
            el('td', { text: String(h.total ?? 0) }),
            el('td', { text: pctText(h.errorRate, h.total) }),
            el('td', { text: pctText(h.slowRate, h.total) }),
            el('td', { class: 'mono', text: h.p95Ms != null ? `${h.p95Ms} ms` : '—' }),
            el('td', { text: String(d.total ?? 0) }),
            el('td', { text: pctText(d.errorRate, d.total) }),
            el('td', { text: pctText(d.slowRate, d.total) }),
            el('td', { class: 'mono', text: d.p95Ms != null ? `${d.p95Ms} ms` : '—' }),
          ]);
        })
      ),
    ])
  );
  view.appendChild(el('p', { class: 'section-desc', text:
    `„Бавно" (над ${data.latencyTargetMs} ms) е ОТДЕЛЕН показател от „недостъпно" — сайт, който отговаря за 9 секунди, ` +
    'формално е наличен, но на практика е паднал. Затова двете колони не се сливат в един процент.' }));
}

function pctText(rate, total) {
  if (!total) return '—';
  const p = (Number(rate) || 0) * 100;
  return p === 0 ? '0%' : p < 0.1 ? '<0.1%' : `${p.toFixed(p < 10 ? 2 : 1)}%`;
}

// Показва пробата по ФАЗИ — „бавно" може да е DNS, TCP, TLS или приложението.
function renderProbeResults(container, results, note) {
  container.querySelectorAll('.probe-results').forEach((n) => n.remove());
  const wrap = el('div', { class: 'probe-results', style: 'margin-top:10px' });
  if (note) wrap.appendChild(el('div', { class: 'metric-sub', text: note }));
  if (results?.length) {
    wrap.appendChild(
      el('div', { class: 'table-wrap' }, [
        tableEl(['Адрес', 'Статус', 'DNS', 'TCP', 'TLS', 'Първи байт', 'Общо', 'Сертификат'], results.map((r) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: r.name || r.url }),
            el('td', {}, [pill(r.up ? 'ok' : 'bad', r.up ? r.status || 'OK' : r.error || r.contentError || 'DOWN')]),
            el('td', { class: 'mono', text: ms(r.phases?.dnsMs) }),
            el('td', { class: 'mono', text: ms(r.phases?.connectMs) }),
            el('td', { class: 'mono', text: ms(r.phases?.tlsMs) }),
            el('td', { class: 'mono', text: ms(r.phases?.ttfbMs) }),
            el('td', { class: 'mono', text: ms(r.totalMs) }),
            el('td', {}, [
              r.tls
                ? pill(r.tls.authorized === false ? 'bad' : r.tls.minDaysLeft <= 14 ? 'warn' : 'ok',
                    r.tls.authorized === false ? 'невалиден' : `${plural(r.tls.minDaysLeft, 'ден', 'дни')}`)
                : el('span', { class: 'muted', text: '—' }),
            ]),
          ])
        )),
      ])
    );
  }
  container.appendChild(wrap);
}
function ms(v) {
  return v == null ? '—' : `${Math.round(v)} ms`;
}

// ── Диагностика: сигналите от ядрото + прогнозите ─────────────────────────────
// Тук стои разликата между „таблото показва" и „таблото обяснява": натиск (PSI)
// казва дали БОЛИ, steal — чия е вината, диск I/O и опашките — къде е тясното.
async function renderDiagnostics() {
  const view = document.getElementById('view');
  const [k, f] = await Promise.all([api('/kernel'), api('/forecast')]);
  view.innerHTML = '';

  // ── Натиск (PSI) ───────────────────────────────────────────────────────────
  if (k.pressure?.available) {
    const psiCard = (name, label, data) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: label }), pill(psiClass(data?.some?.avg60), 'натиск')]),
        el('div', { class: 'metric-val', html: `${(data?.some?.avg60 ?? 0).toFixed(1)}<small>%</small>` }),
        el('div', { class: 'metric-sub', text: `10s: ${(data?.some?.avg10 ?? 0).toFixed(1)}% · 5мин: ${(data?.some?.avg300 ?? 0).toFixed(1)}%` }),
        el('div', { class: 'metric-sub', text: name === 'cpu' ? 'колко % от времето задачи са чакали процесор' : name === 'io' ? 'колко % от времето задачи са чакали диска' : 'колко % от времето системата е чакала памет' }),
      ]);
    view.appendChild(el('h3', { class: 'muted', text: 'Натиск върху ресурсите (PSI) — това е болката', style: 'margin:4px 0 10px' }));
    view.appendChild(
      el('div', { class: 'grid grid-metrics' }, [
        psiCard('cpu', 'Процесор', k.pressure.cpu),
        psiCard('io', 'Диск', k.pressure.io),
        psiCard('memory', 'Памет', k.pressure.memory),
      ])
    );
  } else {
    view.appendChild(
      el('div', { class: 'toast warn', style: 'position:static;margin-bottom:14px' }, [
        'ⓘ Ядрото не подава PSI (/proc/pressure). Алармите падат обратно към праговете по CPU/памет, което е по-шумно. Включва се с psi=1 на kernel cmdline.',
      ])
    );
  }

  // ── CPU по режими (steal!) ─────────────────────────────────────────────────
  if (k.cpuModes) {
    const m = k.cpuModes;
    view.appendChild(
      el('div', { class: 'card', style: 'margin-top:16px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: 'Процесор по режими' }),
          m.steal >= 10 ? pill('bad', 'хостерът краде време') : m.steal >= 2 ? pill('warn', 'умерен steal') : pill('ok', 'нормално'),
        ]),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Режим', '%', 'Какво значи'], [
            ['потребителски', m.user, 'нашите приложения'],
            ['системен', m.system, 'ядрото по наша заявка'],
            ['iowait', m.iowait, 'чака диска'],
            ['steal', m.steal, 'ХОСТЕРЪТ дава времето на друга машина'],
            ['прекъсвания', m.irq, 'мрежа/устройства'],
            ['свободен', m.idle, '—'],
          ].map(([name, val, what]) =>
            el('tr', {}, [
              el('td', { text: name }),
              el('td', { class: 'mono', text: (val ?? 0).toFixed(1) }),
              el('td', { class: 'muted', text: what }),
            ])
          )),
        ]),
        m.steal >= 2
          ? el('div', { class: 'metric-sub', text: 'Steal над 10% устойчиво е основание за тикет към доставчика — не е проблем, който можеш да поправиш ти.' })
          : el('span'),
      ])
    );
  }

  // ── Прогнози ───────────────────────────────────────────────────────────────
  view.appendChild(el('h3', { class: 'muted', text: 'Прогнози', style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'metric-sub', text: `Върху ${plural(f.basedOnPoints, 'точка', 'точки')} история. Мълчи, ако трендът не е статистически значим — по-добре нищо, отколкото фалшива тревога.` }),
      el('div', { class: 'table-wrap' }, [
        tableEl(['Дял', 'Прогноза', 'Темп', 'Основа'], (f.disks || []).map((d) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: d.mount }),
            el('td', {}, [
              d.ok
                ? pill(d.etaMs < 2 * 86400000 ? 'bad' : d.etaMs < 7 * 86400000 ? 'warn' : 'dim', `пълен след ${d.human}`)
                : el('span', { class: 'muted', text: d.reason || '—' }),
            ]),
            el('td', { class: 'mono', text: d.ok && d.slopePerDay != null ? `${d.slopePerDay.toFixed(2)} %/ден` : '—' }),
            el('td', { class: 'muted', text: `${plural(d.points, 'точка', 'точки')}` }),
          ])
        )),
      ]),
    ])
  );

  // ── Аномалии и момент на промяната ────────────────────────────────────────
  const anomCard = (label, a) =>
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: label }), pill(a?.anomaly ? 'bad' : 'ok', a?.anomaly ? 'нетипично' : 'нормално')]),
      el('div', { class: 'metric-sub', text: a?.reason ? a.reason : `текущо ${a?.current?.toFixed?.(1) ?? '—'} · база ${a?.baseline ?? '—'} · z=${a?.z ?? '—'} · гласове ${a?.votes ?? 0}/2` }),
    ]);
  view.appendChild(el('h3', { class: 'muted', text: 'Аномалии', style: 'margin:22px 0 10px' }));
  view.appendChild(el('div', { class: 'grid grid-2' }, [anomCard('Процесор', f.anomalies?.cpu), anomCard('Памет', f.anomalies?.memory)]));
  if (f.changePoint) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-top:12px' }, [
        el('h3', { text: 'Поведението се е променило' }),
        el('div', { text: `Засечена промяна около ${fmtWhen(f.changePoint.at)} (${new Date(f.changePoint.at).toLocaleString('bg-BG')}).` }),
        el('div', { class: 'metric-sub', text: 'Сравни с одита и деплоите около този час — това обикновено е причината.' }),
      ])
    );
  }

  // ── Диск I/O ───────────────────────────────────────────────────────────────
  if ((k.diskIo || []).length) {
    view.appendChild(el('h3', { class: 'muted', text: 'Диск I/O', style: 'margin:22px 0 10px' }));
    view.appendChild(
      el('div', { class: 'table-wrap' }, [
        tableEl(['Устройство', 'Четене', 'Запис', 'Закъснение чет.', 'Закъснение зап.', 'Заетост', 'В опашка'], k.diskIo.map((d) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: d.name }),
            el('td', { text: `${d.readIops.toFixed(0)}/s · ${fmtBytes(d.readBps)}/s` }),
            el('td', { text: `${d.writeIops.toFixed(0)}/s · ${fmtBytes(d.writeBps)}/s` }),
            el('td', {}, [awaitPill(d.readAwaitMs)]),
            el('td', {}, [awaitPill(d.writeAwaitMs)]),
            el('td', {}, [barEl(d.utilPct)]),
            el('td', { class: 'mono', text: d.inFlight }),
          ])
        )),
      ])
    );
  }

  // ── Мрежа, TCP, дескриптори, inode-и ──────────────────────────────────────
  view.appendChild(el('h3', { class: 'muted', text: 'Мрежа и лимити', style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'grid grid-2' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'Интерфейси' }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Интерфейс', 'Вход', 'Изход', 'Изпуснати', 'Грешки'], (k.net || []).map((n) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: n.iface }),
              el('td', { text: fmtBps(n.rxBps) }),
              el('td', { text: fmtBps(n.txBps) }),
              el('td', {}, [n.rxDrop + n.txDrop > 0 ? pill('warn', n.rxDrop + n.txDrop) : el('span', { class: 'muted', text: '0' })]),
              el('td', {}, [n.rxErrs + n.txErrs > 0 ? pill('bad', n.rxErrs + n.txErrs) : el('span', { class: 'muted', text: '0' })]),
            ])
          )),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Връзки и лимити' }),
        kv({
          'TCP в употреба': k.tcp ? k.tcp.inuse : '—',
          TIME_WAIT: k.tcp ? k.tcp.timeWait : '—',
          'Сокети общо': k.tcp?.socketsUsed ?? '—',
          'Препълнена опашка': k.listen ? `${k.listen.listenOverflows} (drops ${k.listen.listenDrops})` : '—',
          'Файлови дескриптори': k.fds ? `${k.fds.allocated} / ${k.fds.max} (${k.fds.usePercent.toFixed(1)}%)` : '—',
          conntrack: k.conntrack ? `${k.conntrack.count} / ${k.conntrack.max}` : 'няма',
          'Процеси в изчакване (D)': k.sched?.blocked ?? '—',
          'Убити от OOM': k.oomKillTotal ?? '—',
        }),
      ]),
    ])
  );

  view.appendChild(el('h3', { class: 'muted', text: 'Inode-и', style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Дял', 'Ползвани', 'Свободни', '%'], (k.inodes || []).map((i) =>
        el('tr', {}, [
          el('td', { class: 'mono', text: i.mount }),
          el('td', { text: i.used.toLocaleString('bg-BG') }),
          el('td', { text: i.free.toLocaleString('bg-BG') }),
          el('td', {}, [barEl(i.usePercent)]),
        ])
      )),
    ])
  );
  if ((k.readOnlyAll || []).length) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-top:12px' }, [
        el('h3', { text: 'Само за четене' }),
        el('div', { class: 'metric-sub', text: 'Аларма се вдига само ако дял, който Е БИЛ записваем, стане ro (истинска авария). Изброените тук може да са нарочно ro.' }),
        el('div', { class: 'crumbs', text: k.readOnlyAll.map((r) => `${r.mount} (${r.type})`).join('  ·  ') }),
      ])
    );
  }
}

function psiClass(v) {
  if (v == null) return 'dim';
  return v >= 40 ? 'bad' : v >= 10 ? 'warn' : 'ok';
}
function awaitPill(ms) {
  const v = Number(ms) || 0;
  return pill(v >= 100 ? 'bad' : v >= 20 ? 'warn' : 'ok', `${v.toFixed(1)} ms`);
}

// ── Аларми ────────────────────────────────────────────────────────────────────
// Режим „поддръжка" — пауза на ИЗВЕСТИЯТА, докато работиш по сървъра. Алармите
// продължават да се смятат и виждат; спира само вълната към телефона.
function maintenanceCard(m) {
  const minutes = el('input', { type: 'number', min: '5', max: '480', value: '30', style: 'width:90px' });
  const reason = el('input', { type: 'text', placeholder: 'причина (напр. деплой)', style: 'max-width:240px' });
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Режим „поддръжка"' }),
      m ? pill('warn', `до ${new Date(m.until).toLocaleTimeString(langTagSafe())}`) : pill('dim', 'изключен'),
    ]),
    el('div', { class: 'metric-sub', text:
      'Пауза на ИЗВЕСТИЯТА за всичко (макс 8 часа) — алармите продължават да се смятат и да се виждат тук. ' +
      'За разлика от заглушаването (по ключ), това е „работя по сървъра, не ми пращай вълната". ' +
      'Мъртвецът-ключ продължава да пинга. След края идва обобщение какво е активно.' }),
    m
      ? el('div', { class: 'toolbar' }, [
          el('span', { class: 'metric-sub', text: m.reason ? `Причина: ${m.reason}` : '' }),
          el('span', { class: 'grow' }),
          el('button', {
            class: 'btn btn-primary btn-sm', text: '✓ Приключи сега (с обобщение)',
            onclick: async () => {
              try { await api('/alerts/maintenance/end', { method: 'POST' }); toast('Поддръжката приключи'); window.__refreshMaintBanner?.(); go('alerts'); }
              catch (e) { toast(e.message, 'bad'); }
            },
          }),
        ])
      : el('div', { class: 'toolbar' }, [
          el('label', { class: 'inline' }, [minutes, el('span', { text: ' минути' })]),
          reason,
          el('span', { class: 'grow' }),
          el('button', {
            class: 'btn btn-sm', text: '🔧 Започни поддръжка',
            onclick: async () => {
              try {
                await api('/alerts/maintenance', { method: 'POST', body: { minutes: Number(minutes.value), reason: reason.value } });
                toast('Известията са на пауза');
                window.__refreshMaintBanner?.();
                go('alerts');
              } catch (e) { toast(e.message, 'bad'); }
            },
          }),
        ]),
  ]);
}

// Седмичният дайджест — пулсът към човека. Тишината на алармите не доказва
// здраве; веднъж седмично едно съобщение казва „жив съм и ето какво видях".
function digestCard(d) {
  const out = el('div', {});
  const days = ['неделя', 'понеделник', 'вторник', 'сряда', 'четвъртък', 'петък', 'събота'];
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Седмичен отчет' }),
      pill(d.enabled ? 'ok' : 'dim', d.enabled ? `${days[d.weekday]} в ${d.hour}:00` : 'изключен'),
    ]),
    el('div', { class: 'metric-sub', text:
      'Панел, който се обажда само при проблем, е неразличим от панел, който е умрял тихо. Веднъж седмично по ' +
      'каналите тръгва „жив съм и ето какво видях" — 0 критични също е информация. Минава ПОКРАЙ прага по канал ' +
      '(отчетът е изрично поискан, не инцидент) и покрай notifyInfo.' }),
    d.lastSentAt
      // Сглобен от преведени части: „преди X мин" е кирилска интерполация и
      // целият низ не би съвпаднал с шаблон.
      ? el('div', { class: 'metric-sub', text: `${t('Последно пращане:')} ${t(fmtWhen(d.lastSentAt))}. ${t('Изпуснат слот се догонва.')}` })
      : el('div', { class: 'metric-sub', text: 'Още не е пращан — ще тръгне в първия слот.' }),
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-sm', text: '👁 Прегледай (без пращане)',
        onclick: () => {
          out.innerHTML = '';
          out.appendChild(el('pre', { class: 'term-out', style: 'max-height:280px', text: d.preview || '(празно)' }));
        },
      }),
      el('button', {
        class: 'btn btn-sm', text: '✉ Прати сега',
        onclick: async () => {
          try { await api('/alerts/digest/send', { method: 'POST' }); toast('Отчетът е пратен по каналите'); go('alerts'); }
          catch (e) { toast(e.message, 'bad'); }
        },
      }),
    ]),
    out,
  ]);
}

async function renderAlerts() {
  const view = document.getElementById('view');
  const [a, maint, digest] = await Promise.all([
    api('/alerts'),
    api('/alerts/maintenance').catch(() => ({ maintenance: null })),
    api('/alerts/digest').catch(() => null),
  ]);
  view.innerHTML = '';
  view.appendChild(maintenanceCard(maint.maintenance));
  if (digest) view.appendChild(digestCard(digest));

  const chNames = { telegram: 'Telegram', ntfy: 'ntfy', webhook: 'Webhook', email: 'Имейл' };
  const anyChannel = Object.values(a.channels).some(Boolean);

  view.appendChild(
    el('div', { class: 'toolbar' }, [
      pill(a.enabled ? 'ok' : 'dim', a.enabled ? 'алармите са включени' : 'изключени'),
      ...Object.entries(a.channels).map(([k, on]) => pill(on ? 'ok' : 'dim', chNames[k])),
      el('span', { class: 'grow' }),
      el('button', { class: 'btn btn-sm', text: '⟳ Провери сега', onclick: async (e) => {
        e.target.disabled = true;
        try { const r = await api('/alerts/check', { method: 'POST' }); toast(`Проверено — ${r.firing.length} активни`); go('alerts'); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      } }),
      el('button', { class: 'btn btn-sm', text: '✉ Тестово известие', disabled: !anyChannel, onclick: async (e) => {
        e.target.disabled = true;
        try { const r = await api('/alerts/test', { method: 'POST' }); toast(r.sent.length ? `Изпратено по: ${r.sent.join(', ')}` : `Провал: ${r.failed.join(', ')}`, r.sent.length ? 'ok' : 'bad'); }
        catch (err) { toast(err.message, 'bad'); }
        e.target.disabled = false;
      } }),
    ])
  );

  if (!anyChannel) {
    view.appendChild(el('div', { class: 'toast warn', style: 'position:static;margin-bottom:14px', text: '⚠ Няма настроен канал — алармите се пазят само в таблото. Настрой Telegram/ntfy по-долу, за да идват на телефона.' }));
  }

  view.appendChild(monitorHealthCard(a.health));

  // Активни в момента
  view.appendChild(el('h3', { class: 'muted', text: `Активни аларми (${a.active.length})`, style: 'margin:6px 0 10px' }));
  view.appendChild(
    a.active.length
      ? el('div', { class: 'table-wrap' }, [
          tableEl(['Тежест', 'Проблем', 'Детайли', 'Откога', ''], a.active.map((x) =>
            el('tr', {}, [
              el('td', {}, [pill(sevClass(x.severity), x.severity)]),
              el('td', {}, [
                x.title,
                x.silenced ? el('div', { class: 'metric-sub', style: 'color:var(--warn)', text: `🔕 заглушена до ${fmtWhen(new Date(x.silenced.until).toISOString())}` }) : '',
              ]),
              // Детайлите се режат по ширина: иначе дълъг текст изтласква
              // бутона „Заглуши" извън екрана и най-полезното действие става
              // невидимо (видяно на живо при 21 активни аларми).
              el('td', { class: 'muted', style: 'max-width:520px;overflow:hidden;text-overflow:ellipsis', title: x.body }, [
                el('div', { text: x.body }),
                // Суровият изход на чуждия инструмент — дословно (`raw`), защото
                // това е текстът, който човек ще потърси. Държи се ОТДЕЛНО от
                // изречението, за да остане то стабилно и преводимо.
                x.detail ? el('div', { class: 'mono', style: 'font-size:11px;opacity:.75;white-space:pre-wrap', raw: x.detail }) : null,
              ]),
              el('td', { class: 'muted', text: fmtWhen(new Date(x.since).toISOString()) }),
              el('td', {}, [
                x.silenced
                  ? el('button', { class: 'btn btn-sm', text: '🔔 Върни', onclick: () => silenceAlert(x.key, { remove: true }) })
                  : el('button', { class: 'btn btn-sm', text: '🔕 Заглуши', title: 'Спира ИЗВЕСТИЯТА за срок. Алармата остава видима тук.', onclick: () => silenceAlert(x.key) }),
              ]),
            ])
          )),
        ])
      : el('div', { class: 'card' }, [el('div', { class: 'empty', text: '✓ Няма активни аларми — всичко е наред.' })])
  );

  // Прагове
  const th = a.thresholds || {};
  const inputs = {};
  const thRow = (key, label, suffix) => {
    const i = el('input', { type: 'text', value: String(th[key] ?? ''), style: 'width:80px' });
    inputs[key] = i;
    return el('label', { class: 'muted' }, [document.createTextNode(label + ' '), i, document.createTextNode(' ' + suffix)]);
  };
  const alCfg = a.accesslog || {};
  const alInputs = {};
  const alRow = (key, label, suffix) => {
    const i = el('input', { type: 'text', value: String(alCfg[key] ?? ''), style: 'width:80px' });
    alInputs[key] = i;
    return el('label', { class: 'muted' }, [document.createTextNode(label + ' '), i, document.createTextNode(' ' + suffix)]);
  };
  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:18px' }, [
      el('h3', { text: 'Прагове' }),
      el('div', { class: 'metric-sub', text: 'Симптоми (натиск = колко % от времето задачите са ЧАКАЛИ ресурс). Това е болката — CPU 90% при доволни потребители не е проблем.' }),
      el('div', { class: 'toolbar' }, [
        thRow('psiCpu', 'Натиск CPU', '%'),
        thRow('psiIo', 'Натиск диск', '%'),
        thRow('psiMem', 'Натиск памет', '%'),
        thRow('stealPct', 'Steal (хостерът)', '%'),
      ]),
      el('div', { class: 'metric-sub', style: 'margin-top:8px', text: 'Капацитет и срокове:' }),
      el('div', { class: 'toolbar' }, [
        thRow('diskPct', 'Диск', '%'),
        thRow('diskEtaDays', 'Пълен до', 'дни'),
        thRow('inodePct', 'Inode-и', '%'),
        thRow('certDays', 'Сертификат', 'дни'),
        thRow('fdPct', 'Файлови дескриптори', '%'),
      ]),
      el('div', { class: 'metric-sub', style: 'margin-top:8px', text: 'Резерва, ако ядрото не подава PSI:' }),
      el('div', { class: 'toolbar' }, [thRow('cpuPct', 'CPU', '%'), thRow('memPct', 'Памет', '%')]),
      el('div', { class: 'metric-sub', style: 'margin-top:8px', text: 'Грешки от РЕАЛНИЯ трафик (access log). Пробата пита един адрес и вижда 200; потребителите в същия момент може да получават 500 на плащането.' }),
      el('div', { class: 'toolbar' }, [alRow('errorPct', 'Дял 5xx', '%'), alRow('minRequests', 'Минимум заявки', 'бр.')]),
      el('div', { class: 'metric-sub', text: `Праг трябва да се задържи ${plural(a.sustainSamples, 'проверка', 'проверки')} (на ${a.checkIntervalSec}s); повторно известие най-рано след ${a.cooldownMin} мин.` }),
      el('div', { class: 'toolbar' }, [el('button', { class: 'btn btn-primary btn-sm', text: 'Запази праговете', onclick: async (e) => {
        e.target.disabled = true;
        const thresholds = {};
        for (const [k, i] of Object.entries(inputs)) {
          const n = Number(i.value);
          if (Number.isFinite(n) && n >= 0) thresholds[k] = n;
        }
        const accesslog = {};
        for (const [k, i] of Object.entries(alInputs)) {
          const n = Number(i.value);
          if (Number.isFinite(n) && n >= 0) accesslog[k] = n;
        }
        try {
          await api('/alerts/settings', { method: 'POST', body: { alerts: { thresholds }, accesslog } });
          toast('Праговете са запазени');
          go('alerts');
        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      } })]),
    ])
  );

  // Канали
  view.appendChild(notifyChannelsCard(a));

  // Дневник
  view.appendChild(el('h3', { class: 'muted', text: 'Дневник на известията', style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Кога', 'Тип', 'Тежест', 'Съобщение', 'Изпратено'], (a.log || []).map((x) =>
        el('tr', {}, [
          el('td', { class: 'muted', text: fmtWhen(x.ts) }),
          el('td', { text: x.type }),
          el('td', {}, [pill(sevClass(x.severity), x.severity)]),
          el('td', { text: x.title }),
          el('td', { class: 'muted', text: (x.sent || []).join(', ') || (x.failed || []).join(', ') || '—' }),
        ])
      )),
    ])
  );
}

function sevClass(s) {
  return s === 'critical' ? 'bad' : s === 'warning' ? 'warn' : s === 'ok' ? 'ok' : 'dim';
}

// Заглушаването е СРОЧНО по конструкция: няма „завинаги". Забравено заглушаване
// е сляпо място, което изглежда като тишина.
async function silenceAlert(key, { remove = false } = {}) {
  let minutes = 0;
  if (!remove) {
    const ans = prompt(
      `Заглуши „${key}" за колко минути? (макс 10080 = 7 дни)\n\n` +
        'Алармата остава видима в панела — спират само известията.\n' +
        'Заглушава се ТОЧНО този ключ. За цяло семейство добави звездичка в конфига („disk:*").',
      '60'
    );
    if (ans === null) return;
    minutes = Number(ans);
    if (!Number.isFinite(minutes) || minutes < 1) return toast('Невалидна продължителност', 'bad');
  }
  try {
    await api('/alerts/silence', { method: 'POST', body: { key, minutes, remove } });
    toast(remove ? 'Известията са върнати' : `Заглушено за ${minutes} мин.`);
    go('alerts');
  } catch (err) {
    toast(err.message, 'bad');
  }
}

// „Кой пази пазача." Празен списък с аларми значи съвсем различно нещо според
// това дали проверката върви, или е спряла преди три часа — затова тази карта е
// НАД алармите, а не някъде в настройките.
function monitorHealthCard(h) {
  if (!h) return el('div', {});
  const ageMin = h.ageMs == null ? null : Math.round(h.ageMs / 60000);
  const freshPill =
    h.fresh === null
      ? pill('dim', 'още няма проверка')
      : h.fresh
        ? pill('ok', `проверено преди ${ageMin < 1 ? '<1' : ageMin} мин`)
        : pill('bad', `последна проверка преди ${ageMin} мин — мониторингът изостава`);
  const rows = [
    el('div', { class: 'toolbar' }, [
      el('strong', { text: 'Здраве на мониторинга' }),
      freshPill,
      // Зелено САМО при доказано успешен пинг. „Настроен" и „работи" са различни
      // неща, а за мъртвец-ключ второто е единственото, което значи нещо —
      // зелено хапче заради попълнено поле в конфига е точно фалшивото спокойствие,
      // срещу което съществува целият механизъм.
      h.heartbeat
        ? h.heartbeatOk === true
          ? pill('ok', 'мъртвецът-ключ работи')
          : h.heartbeatOk === null
            ? pill('dim', 'мъртвецът-ключ — още няма пинг')
            : pill('bad', 'мъртвецът-ключ НЕ стига')
        : pill('dim', 'без мъртвец-ключ'),
    ]),
  ];
  if (h.heartbeat && h.lastHeartbeat && !h.lastHeartbeat.ok) {
    rows.push(el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: `⚠ Пингът се проваля: ${h.lastHeartbeat.error || 'статус ' + h.lastHeartbeat.status}. Външният наблюдател ще вдигне тревога за нищо — или вече е спрял да ни чака.` }));
  }
  if (!h.heartbeat) {
    rows.push(el('div', { class: 'metric-sub', text: 'Никоя вътрешна проверка не открива собствената си смърт. Задай адрес за пинг (healthchecks.io, Uptime Kuma push, или крон-монитор на другия VPS) — спре ли пингът, външният наблюдател вдига тревога вместо панела.' }));
  }
  if (h.lastEvalError) {
    rows.push(el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: `⚠ Последната оценка се провали: ${h.lastEvalError.message}` }));
  }
  if (h.notify) {
    const n = h.notify;
    rows.push(
      el('div', {
        class: 'metric-sub',
        style: n.delivered ? '' : 'color:var(--danger)',
        text: n.delivered
          ? `Последно известие: доставено по ${n.delivered} от ${plural(n.attempted, 'канал', 'канала')}.`
          : `⚠ Последното известие НЕ стигна до никого (${(n.failures || []).join(', ') || 'без подробности'}).`,
      })
    );
  }
  if ((h.silences || []).length) {
    rows.push(el('div', { class: 'metric-sub', style: 'color:var(--warn)', text: `🔕 Заглушени: ${h.silences.map((s) => `${s.key} (до ${fmtWhen(new Date(s.until).toISOString())})`).join(' · ')}` }));
  }
  return el('div', { class: 'card', style: 'margin-bottom:14px' }, rows);
}

// Картата за каналите — тайните се ПРАЩАТ, но никога не се четат обратно.
function notifyChannelsCard(a) {
  const f = {};
  // Адресът на пинга НОСИ тайната си (hc-ping.com/<uuid> е ключът) → не се
  // връща обратно към браузъра, показва се само origin-ът. Празно поле значи
  // „без промяна", както при каналите; изчистването е ИЗРИЧНО, с отделен бутон.
  const hbInput = el('input', {
    type: 'text',
    class: 'grow',
    placeholder: a.health?.heartbeat ? 'зададен — остави празно, за да го запазиш' : 'https://hc-ping.com/… (празно = изключено)',
  });
  const inp = (key, ph) => {
    const i = el('input', { type: 'text', placeholder: ph, class: 'grow' });
    f[key] = i;
    return i;
  };
  // Праг по канал: телефонът да звъни само за критичното, имейлът да носи
  // всичко. Без него единственият избор е „всичко или нищо" — и човек изключва
  // канала съвсем, което е най-лошият възможен изход.
  const sev = {};
  const sevSel = (chan) => {
    const cur = (a.minSeverity || {})[chan] || '';
    const s = el('select', { style: 'width:130px', 'aria-label': 'Праг за известяване' }, [
      el('option', { value: '', text: 'всичко', selected: cur === '' }),
      el('option', { value: 'warning', text: '⚠ и по-тежко', selected: cur === 'warning' }),
      el('option', { value: 'critical', text: '🔴 само критично', selected: cur === 'critical' }),
    ]);
    s.value = cur;
    sev[chan] = s;
    return s;
  };
  return el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('h3', { text: 'Канали за известия' }),
    el('div', { class: 'metric-sub', text: 'Попълни само това, което ползваш. Полетата са празни по подразбиране — тайните не се връщат обратно към браузъра. Празно поле = без промяна. „Възстановено" винаги минава по канала, който е получил самата аларма.' }),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Telegram' }), inp('tgToken', 'bot token'), inp('tgChat', 'chat id'), sevSel('telegram')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'ntfy' }), inp('ntfyServer', 'https://ntfy.sh'), inp('ntfyTopic', 'тема (topic)'), inp('ntfyToken', 'токен (по избор)'), sevSel('ntfy')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Webhook' }), inp('hook', 'https://…'), sevSel('webhook')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Имейл' }), inp('mailTo', 'до: адрес (иска sendmail на сървъра)'), sevSel('email')]),
    el('h3', { text: 'Мъртвецът-ключ', style: 'margin-top:18px' }),
    el('div', { class: 'metric-sub', text: 'Адрес, който панелът пинга след ВСЯКА успешна проверка (healthchecks.io, Uptime Kuma push, крон-монитор на другия VPS). Спре ли пингът, външният наблюдател вдига тревога вместо него — вътрешна проверка не открива собствената си смърт. Не бива да сочи към самата машина.' }),
    el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted', style: 'width:90px', text: 'Пинг адрес' }),
      hbInput,
      a.health?.heartbeat
        ? el('button', { class: 'btn btn-sm', text: 'Изчисти', onclick: async () => {
            try { await api('/alerts/channels', { method: 'POST', body: { heartbeatUrl: '' } }); toast('Мъртвецът-ключ е изключен'); go('alerts'); }
            catch (err) { toast(err.message, 'bad'); }
          } })
        : '',
    ]),
    a.heartbeatOrigin
      ? el('div', { class: 'metric-sub', text: `Пинга към: ${a.heartbeatOrigin} (пътят носи токена и не се показва).` })
      : '',
    el('div', { class: 'toolbar' }, [el('button', {
      class: 'btn btn-primary btn-sm',
      text: 'Запази каналите',
      onclick: async (e) => {
        e.target.disabled = true;
        const notify = {};
        const set = (obj, key, val) => { if (String(val).trim()) { notify[obj] = notify[obj] || {}; notify[obj][key] = String(val).trim(); } };
        set('telegram', 'botToken', f.tgToken.value);
        set('telegram', 'chatId', f.tgChat.value);
        set('ntfy', 'server', f.ntfyServer.value);
        set('ntfy', 'topic', f.ntfyTopic.value);
        set('ntfy', 'token', f.ntfyToken.value);
        set('webhook', 'url', f.hook.value);
        set('email', 'to', f.mailTo.value);
        // Прагът се праща ВИНАГИ (и празният) — той не е тайна и „всичко"
        // трябва да може да се върне обратно.
        for (const [chan, s] of Object.entries(sev)) {
          notify[chan] = notify[chan] || {};
          notify[chan].minSeverity = s.value;
        }
        const payload = { notify };
        if (hbInput.value.trim()) payload.heartbeatUrl = hbInput.value.trim();
        try { await api('/alerts/channels', { method: 'POST', body: payload }); toast('Каналите са запазени'); go('alerts'); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      },
    })]),
  ]);
}

// ── Настройки (2FA) ───────────────────────────────────────────────────────────
// Активните сесии. Механизмът съществуваше ЦЯЛ (списък, поименна отмяна,
// отмяна на всички, преживяваща рестарт), но нямаше нито един бутон — тоест
// „кой е влязъл в панела ми и как да го изхвърля" беше въпрос без екран.
// Непозната сесия тук е сигнал за пробив; без списък такъв сигнал няма как да
// бъде забелязан.
function sessionsCard(d) {
  if (!d) return null;
  const rows = (d.sessions || []).map((s) =>
    el('tr', {}, [
      el('td', {}, [
        el('span', { class: 'mono', text: s.ip || '—' }),
        s.jti === d.currentJti ? el('span', { class: 'pill pill-ok', style: 'margin-left:8px', text: 'това устройство' }) : null,
      ]),
      el('td', { class: 'muted', style: 'font-size:12px', text: (s.ua || '').slice(0, 60) || '—' }),
      el('td', { class: 'muted', text: fmtWhen(new Date(s.lastSeen).toISOString()) }),
      el('td', { class: 'muted', text: fmtWhen(new Date(s.issuedAt).toISOString()) }),
      el('td', {}, [
        el('button', {
          class: 'btn btn-sm btn-warn', text: '⛔ Изхвърли',
          onclick: async () => {
            try {
              await api('/sessions/revoke', { method: 'POST', body: { jti: s.jti } });
              toast('Сесията е отменена');
              go('settings');
            } catch (e) { toast(e.message, 'bad'); }
          },
        }),
      ]),
    ])
  );
  return el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Активни сесии' }),
      pill(rows.length > 1 ? 'warn' : 'ok', `${rows.length}`),
    ]),
    // Сглобено от преведени части: числата иначе правят целия низ уникален и
    // никой речников ключ не съвпада (доктрината за динамичните низове).
    el('div', { class: 'metric-sub', text:
      t('Всяко устройство, което е влязло и още има валиден токен. НЕПОЗНАТА сесия тук е сигнал за пробив — отмяната ѝ преживява рестарт на панела.') +
      ` ${t('Бездействие')}: ${d.idleMinutes || 30} ${t('мин')} · ${t('таван на сесията')}: ${d.absoluteHours || 12} ${t('ч.')}` }),
    rows.length
      ? el('div', { class: 'table-wrap' }, [tableEl(['Адрес', 'Устройство', 'Последно', 'Влизане', ''], rows)])
      : el('div', { class: 'empty', text: 'Няма активни сесии.' }),
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-danger btn-sm', text: '⛔ Изхвърли ВСИЧКИ (и себе си)',
        onclick: async () => {
          const ok = await confirmDanger({
            title: 'Отмяна на всички сесии',
            what: [
              'Всяко влязло устройство пада, включително ТОВА.',
              'Ще трябва да влезеш наново с паролата.',
              'Ползва се при съмнение за пробив — отмяната преживява рестарт.',
            ],
            expect: 'изхвърли',
            confirmLabel: 'Изхвърли всички',
            delayMs: 800,
          });
          if (!ok) return;
          try {
            await api('/sessions/revoke-all', { method: 'POST' });
            toast('Всички сесии са отменени — влез наново');
            setTimeout(() => location.reload(), 900);
          } catch (e) { toast(e.message, 'bad'); }
        },
      }),
    ]),
  ]);
}

async function renderSettings() {
  const view = document.getElementById('view');
  const [me, sess] = await Promise.all([api('/me'), api('/sessions').catch(() => null)]);
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Панелът дава пълен контрол над сървъра — втори фактор е силно препоръчителен.' }));

  const box = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Двуфакторна автентикация (TOTP)' }),
      pill(me.totpEnabled ? 'ok' : 'warn', me.totpEnabled ? 'включена' : 'изключена'),
    ]),
  ]);
  view.appendChild(box);

  if (me.totpEnabled) {
    // Колко резервни кода остават — свършат ли, загубен телефон значи заключен сървър.
    box.appendChild(
      el('div', { class: 'metric-sub' }, [
        `Резервни кодове: ${me.recoveryLeft ?? 0}`,
        me.recoveryLeft === 0 ? ' — ⚠ НЯМА нито един. Загубиш ли телефона, губиш достъпа. Генерирай нови.' : '',
      ])
    );
    const pwRegen = el('input', { type: 'password', placeholder: 'парола' });
    box.appendChild(el('div', { class: 'toolbar' }, [
      pwRegen,
      el('button', {
        class: 'btn btn-sm', text: 'Нови резервни кодове',
        onclick: async () => {
          if (!confirm('Старите резервни кодове спират да работят. Продължавам?')) return;
          try {
            const r = await api('/totp/recovery/regenerate', { method: 'POST', body: { password: pwRegen.value } });
            showRecoveryCodes(box, r.recoveryCodes);
          } catch (err) { toast(err.message, 'bad'); }
        },
      }),
    ]));
    const pw = el('input', { type: 'password', placeholder: 'парола за потвърждение' });
    box.appendChild(el('div', { class: 'toolbar' }, [pw, el('button', {
      class: 'btn btn-danger btn-sm', text: 'Изключи 2FA',
      onclick: async () => {
        try { await api('/totp/disable', { method: 'POST', body: { password: pw.value } }); toast('2FA е изключена', 'warn'); go('settings'); }
        catch (err) { toast(err.message, 'bad'); }
      },
    })]));
  } else {
    box.appendChild(el('button', {
      class: 'btn btn-primary btn-sm', text: 'Включи 2FA',
      onclick: async (e) => {
        e.target.disabled = true;
        try {
          const s = await api('/totp/setup', { method: 'POST' });
          const code = el('input', { type: 'text', placeholder: '6-цифрен код', maxlength: '6', style: 'width:130px' });
          box.appendChild(el('div', { style: 'margin-top:12px' }, [
            el('div', { class: 'metric-sub', text: '1) Добави тайната в Google Authenticator / Aegis / 1Password (ръчно въвеждане или отвори връзката на телефона):' }),
            el('pre', { class: 'term-out', style: 'user-select:all', text: s.secret }),
            el('div', {}, [el('a', { href: s.uri, class: 'mono', text: s.uri, style: 'word-break:break-all;font-size:11px' })]),
            el('div', { class: 'metric-sub', style: 'margin-top:10px', text: '2) Въведи кода, който показва приложението:' }),
            el('div', { class: 'toolbar' }, [code, el('button', {
              class: 'btn btn-primary btn-sm', text: 'Потвърди и включи',
              onclick: async () => {
                try {
                  const r = await api('/totp/enable', { method: 'POST', body: { code: code.value } });
                  toast('2FA е включена');
                  // Резервните кодове се показват САМО ТУК и никога повече.
                  showRecoveryCodes(box, r.recoveryCodes);
                } catch (err) { toast(err.message, 'bad'); }
              },
            })]),
          ]));
        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      },
    }));
  }

  // Сесиите са ВТОРАТА половина на сигурността тук: 2FA пази входа, този
  // списък казва кой вече е вътре.
  const sc = sessionsCard(sess);
  if (sc) view.appendChild(sc);
}

// Показва резервните кодове ЕДИН ПЪТ. В конфига стоят само хешовете им, така че
// втори шанс няма — затова са едри, за копиране и с ясно предупреждение.
function showRecoveryCodes(container, codes) {
  if (!codes?.length) return;
  const text = codes.join('\n');
  container.appendChild(
    el('div', { class: 'card', style: 'margin-top:14px;border-color:var(--warn)' }, [
      el('h3', { text: '⚠ Резервни кодове — записва се СЕГА' }),
      el('div', { class: 'metric-sub', text: 'Показват се само този път (в конфига стоят само хешовете им). Всеки код работи веднъж. Пази ги там, където НЕ е телефонът с приложението.' }),
      el('pre', { class: 'term-out', style: 'user-select:all;font-size:15px;line-height:1.8', text }),
      el('div', { class: 'toolbar' }, [
        el('button', {
          class: 'btn btn-sm', text: '⧉ Копирай',
          onclick: async () => {
            try { await navigator.clipboard.writeText(text); toast('Копирани'); }
            catch { toast('Копирането не мина — маркирай ги на ръка', 'warn'); }
          },
        }),
        el('button', {
          class: 'btn btn-sm', text: '⬇ Изтегли',
          onclick: () => {
            const blob = new Blob([`Carbon Stealth VPS — резервни кодове за 2FA\n${new Date().toLocaleString('bg-BG')}\n\n${text}\n`], { type: 'text/plain' });
            const a = el('a', { href: URL.createObjectURL(blob), download: 'vps-резервни-кодове.txt' });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
        }),
      ]),
    ])
  );
}

// ── Услуги ───────────────────────────────────────────────────────────────────────
async function renderServices() {
  const view = document.getElementById('view');
  const data = await api('/services');
  view.innerHTML = '';
  if (!data.available) {
    view.innerHTML = `<div class="empty">systemd недостъпен: ${escapeHtml(data.error || '')}</div>`;
    return;
  }
  const filter = searchBox('Филтър по име… (натисни /)');
  const onlyActive = el('input', { type: 'checkbox' });
  const selected = new Set();
  const { bar, sync: syncBulk } = bulkBar('услуги', selected, (action, unit) =>
    api('/services/action', { method: 'POST', body: { unit, action } })
  );
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      filter,
      el('label', { class: 'muted' }, [onlyActive, document.createTextNode(' само активни')]),
      el('button', {
        class: 'btn btn-sm', text: 'Избери видимите',
        onclick: () => {
          // Само ВИДИМИТЕ — иначе филтърът лъже: избираш 5 реда, а действието
          // хваща 300.
          for (const cb of view.querySelectorAll('tbody tr:not([hidden]) .bulk-pick')) {
            cb.checked = true;
            selected.add(cb.value);
          }
          syncBulk();
        },
      }),
    ])
  );
  view.appendChild(bar);
  const body = el('div', { class: 'table-wrap' });
  view.appendChild(body);

  // Всяка услуга става команда в палета — Ctrl+K → „рестартирай medqr" е по-бързо
  // от скролване през стотици unit-и.
  for (const s of data.services.slice(0, 300)) {
    registerCommand({
      id: `svc:restart:${s.unit}`,
      scope: 'section',
      label: `Рестартирай ${s.unit}`,
      section: 'Услуги',
      run: async () => {
        try {
          const r = await api('/services/action', { method: 'POST', body: { unit: s.unit, action: 'restart' } });
          toast(`${s.unit}: ${r.state}`);
        } catch (e) {
          toast(e.message, 'bad');
        }
      },
    });
  }

  const draw = () => {
    const q = filter.value.toLowerCase();
    const rows = data.services
      .filter((s) => s.unit.toLowerCase().includes(q))
      .filter((s) => !onlyActive.checked || s.active === 'active')
      .slice(0, 400)
      .map((s) =>
        el('tr', {}, [
          el('td', {}, [el('input', {
            type: 'checkbox', class: 'bulk-pick', value: s.unit,
            checked: selected.has(s.unit),
            onchange: (e) => {
              if (e.target.checked) selected.add(s.unit);
              else selected.delete(s.unit);
              syncBulk();
            },
          })]),
          el('td', { class: 'mono', text: s.unit }),
          el('td', {}, [pill(s.active === 'active' ? 'ok' : s.active === 'failed' ? 'bad' : 'dim', s.sub || s.active)]),
          // Памет по cgroup — стабилна през рестартите на процеса, за разлика от ps.
          el('td', { class: 'mono', text: s.memoryBytes != null ? fmtBytes(s.memoryBytes) : '—', title: s.oomKills ? `убит от OOM ${plural(s.oomKills, 'път', 'пъти')}` : '' }),
          el('td', { text: s.enabled || '—' }),
          el('td', { class: 'muted', text: (s.description || '').slice(0, 60) }),
          el('td', {}, [
            svcBtn('restart', s.unit, 'Рестарт'),
            s.active === 'active' ? svcBtn('stop', s.unit, 'Спри', 'btn-danger') : svcBtn('start', s.unit, 'Пусни'),
            el('button', { class: 'btn btn-sm', text: 'Статус', onclick: () => showServiceStatus(s.unit) }),
            el('button', { class: 'btn btn-sm', text: '⚖ Лимити', onclick: () => showLimits(s.unit) }),
          ]),
        ])
      );
    body.innerHTML = '';
    body.appendChild(tableEl(['', 'Услуга', 'Състояние', 'Памет', 'Автостарт', 'Описание', ''], rows));
  };
  filter.oninput = draw;
  onlyActive.onchange = draw;
  draw();
}

// ── Групови действия ──────────────────────────────────────────────────────────────
// „Рестартирай тези пет" без пет клика и пет чакания. Групово СПИРАНЕ минава през
// потвърждаване с изписване: сгрешен филтър + един бутон сваля половин сървър.
function bulkBar(kind, selected, run) {
  const count = el('span', { class: 'muted' });
  const bar = el('div', { class: 'toolbar bulk-bar', style: 'display:none' });
  const btn = (action, label, cls = 'btn-sm', danger = false) =>
    el('button', {
      class: `btn btn-sm ${cls}`,
      text: label,
      onclick: async () => {
        const items = [...selected];
        if (!items.length) return;
        if (danger) {
          const ok = await confirmDanger({
            title: `${label} · ${items.length} ${kind}`,
            what: [items.slice(0, 8).join(', ') + (items.length > 8 ? ` … и още ${items.length - 8}` : ''),
              'Действието се прилага върху ВСИЧКИ избрани.'],
            expect: String(items.length),
            confirmLabel: label,
          });
          if (!ok) return;
        }
        // Последователно, не наведнъж: паралелен рестарт на пет услуги прави
        // причината за евентуален провал неразличима.
        let ok = 0;
        const failed = [];
        for (const item of items) {
          try {
            await run(action, item);
            ok++;
          } catch (e) {
            failed.push(`${item}: ${e.message}`);
          }
        }
        toast(failed.length ? `${ok} успешни, ${failed.length} провалени — ${failed[0]}` : `${ok} × ${label.toLowerCase()}`, failed.length ? 'warn' : 'ok');
        selected.clear();
        go(state.section);
      },
    });
  bar.append(count, btn('restart', 'Рестартирай'), btn('start', 'Пусни'), btn('stop', 'Спри', 'btn-danger', true),
    el('button', { class: 'btn btn-sm', text: 'Изчисти избора', onclick: () => { selected.clear(); go(state.section); } }));
  const sync = () => {
    // Изборът ОЦЕЛЯВА филтрирането (иначе „избери, филтрирай, действай" губи
    // половината). Но тогава броячът трябва да е честен: скритите пак влизат в
    // действието и мълчаливото „5 избрани", докато се вижда един ред, е капан.
    // Броим от ИЗБОРА, не от DOM-а: едни секции скриват редовете с `hidden`,
    // други изобщо не ги рисуват при филтър. Само разликата хваща и двете.
    const root = bar.parentElement;
    const onScreen = new Set(
      [...(root?.querySelectorAll('tbody tr:not([hidden]) .bulk-pick') || [])].map((cb) => cb.value)
    );
    const hidden = [...selected].filter((v) => !onScreen.has(v)).length;
    count.textContent = t(hidden ? `${selected.size} избрани (${hidden} скрити от филтъра)` : `${selected.size} избрани`);
    bar.style.display = selected.size ? '' : 'none';
  };
  return { bar, sync };
}

function svcBtn(action, unit, label, cls = 'btn-sm') {
  return el('button', {
    class: `btn btn-sm ${cls}`,
    text: label,
    onclick: async (e) => {
      if (!(await confirmStop(action, unit))) return;
      e.target.disabled = true;
      try {
        const r = await api('/services/action', { method: 'POST', body: { unit, action } });
        toast(`${unit}: ${action} → ${r.state}`);
        go('services');
      } catch (err) {
        toast(err.message, 'bad');
        e.target.disabled = false;
      }
    },
  });
}

// Ресурсни лимити на unit. Смисълът им е един: продукт, който изтече памет, да
// падне САМ, вместо ядрото да избере жертва на OOM и да събори целия сървър.
async function showLimits(unit) {
  openModal(`Ресурсни лимити · ${unit}`);
  const out = document.getElementById('modal-out');
  let cur;
  try {
    cur = await api('/limits?unit=' + encodeURIComponent(unit));
  } catch (e) {
    setModalOut('Грешка: ' + e.message);
    return;
  }
  const bytes = (v) => (v == null ? '' : typeof v === 'number' ? `${Math.round(v / 1048576)}M` : String(v));
  const memMax = el('input', { type: 'text', value: bytes(cur.memoryMax), placeholder: 'напр. 1G — празно маха лимита', class: 'mono' });
  const memHigh = el('input', { type: 'text', value: bytes(cur.memoryHigh), placeholder: 'мек праг, напр. 800M', class: 'mono' });
  const quota = el('input', { type: 'text', value: cur.cpuQuotaPct ? `${cur.cpuQuotaPct}%` : '', placeholder: '150% = 1.5 ядра', class: 'mono' });
  const tasks = el('input', { type: 'text', value: cur.tasksMax == null ? '' : String(cur.tasksMax), placeholder: 'максимум процеси/нишки', class: 'mono' });

  out.textContent = '';
  out.appendChild(
    el('div', {}, [
      el('div', { class: 'metric-sub', text:
        `Сега: памет ${cur.memoryCurrent != null ? fmtBytes(cur.memoryCurrent) : '—'} · процеси ${cur.tasksCurrent ?? '—'} · ` +
        (cur.managedByPanel ? 'лимитите се управляват от панела' : 'няма лимити от панела') }),
      kvInputs([
        ['MemoryMax (твърд таван — над него услугата пада)', memMax],
        ['MemoryHigh (мек — ядрото я забавя, но не я убива)', memHigh],
        ['CPUQuota (100% = ЕДНО ядро)', quota],
        ['TasksMax', tasks],
      ]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        el('button', {
          class: 'btn btn-primary', text: 'Приложи',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await api('/limits', {
                method: 'POST',
                body: { unit, memoryMax: memMax.value, memoryHigh: memHigh.value, cpuQuota: quota.value, tasksMax: tasks.value },
              });
              toast(r.note, 'ok');
              closeModal();
            } catch (err) { toast(err.message, 'bad'); }
            e.target.disabled = false;
          },
        }),
        el('button', {
          class: 'btn btn-sm', text: 'Махни лимитите',
          onclick: async () => {
            try {
              const r = await api('/limits', { method: 'POST', body: { unit, clear: true } });
              toast(r.note, 'ok');
              closeModal();
            } catch (err) { toast(err.message, 'bad'); }
          },
        }),
      ]),
      el('div', { class: 'metric-sub', text:
        'Записва се като drop-in (/etc/systemd/system/<unit>.d/) — деплоят подменя unit файла, лимитът оцелява. „systemctl revert <unit>" го маха ръчно. CPUQuota влиза в сила при следващия рестарт.' }),
    ])
  );
}

function kvInputs(pairs) {
  const dl = el('dl', { class: 'kv' });
  for (const [label, input] of pairs) {
    dl.appendChild(el('dt', { text: label }));
    dl.appendChild(el('dd', {}, [input]));
  }
  return dl;
}

async function showServiceStatus(unit) {
  openModal(`Статус · ${unit}`);
  try {
    const r = await api(`/services/status?unit=${encodeURIComponent(unit)}`);
    setModalOut(r.text);
  } catch (e) {
    setModalOut('Грешка: ' + e.message);
  }
}

// ── Docker ────────────────────────────────────────────────────────────────────────
async function renderDocker() {
  const view = document.getElementById('view');
  const [ov, stats] = await Promise.all([api('/docker'), api('/docker/stats').catch(() => ({ stats: [] }))]);
  view.innerHTML = '';
  if (!ov.available) {
    view.innerHTML = `<div class="empty">Docker недостъпен: ${escapeHtml(ov.error || '')}</div>`;
    return;
  }
  const statMap = new Map((stats.stats || []).map((s) => [s.name, s]));
  const selected = new Set();
  const { bar, sync: syncBulk } = bulkBar('контейнера', selected, (action, id) =>
    api('/docker/action', { method: 'POST', body: { id, action } })
  );
  view.appendChild(el('h3', { class: 'muted', text: `Контейнери (${ov.containers.length})`, style: 'margin:4px 0 10px' }));
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-sm', text: 'Избери всички',
        onclick: () => {
          for (const cb of view.querySelectorAll('tbody tr:not([hidden]) .bulk-pick')) {
            cb.checked = true;
            selected.add(cb.value);
          }
          syncBulk();
        },
      }),
    ])
  );
  view.appendChild(bar);
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(
        ['', 'Име', 'Образ', 'Състояние', 'CPU', 'Памет', 'Портове', ''],
        ov.containers.map((c) => {
          const st = statMap.get(c.name);
          const running = c.state === 'running';
          return el('tr', {}, [
            el('td', {}, [el('input', {
              type: 'checkbox', class: 'bulk-pick', value: c.id,
              onchange: (e) => {
                if (e.target.checked) selected.add(c.id);
                else selected.delete(c.id);
                syncBulk();
              },
            })]),
            el('td', { class: 'mono', text: c.name }),
            el('td', { class: 'muted', text: (c.image || '').slice(0, 40) }),
            el('td', {}, [pill(running ? 'ok' : c.state === 'exited' ? 'dim' : 'warn', c.status || c.state)]),
            el('td', { class: 'mono', text: st ? st.cpu : '—' }),
            el('td', { class: 'mono', text: st ? st.mem : '—' }),
            el('td', { class: 'muted mono', text: (c.ports || '').slice(0, 40) }),
            el('td', {}, [
              el('button', { class: 'btn btn-sm', text: 'Лог', onclick: () => showDockerLogs(c.id, c.name) }),
              dockerBtn('restart', c.id, 'Рестарт'),
              running ? dockerBtn('stop', c.id, 'Спри', 'btn-danger') : dockerBtn('start', c.id, 'Пусни'),
              el('button', { class: 'btn btn-sm', text: '⚖ Лимити', onclick: () => showDockerLimits(c.name) }),
            ]),
          ]);
        })
      ),
    ])
  );
  if (ov.images.length) {
    view.appendChild(el('h3', { class: 'muted', text: `Образи (${ov.images.length})`, style: 'margin:22px 0 10px' }));
    view.appendChild(
      el('div', { class: 'table-wrap' }, [
        tableEl(
          ['Хранилище', 'Таг', 'Размер', 'Създаден'],
          ov.images.slice(0, 100).map((i) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: i.repo }),
              el('td', { text: i.tag }),
              el('td', { text: i.size }),
              el('td', { class: 'muted', text: i.createdSince }),
            ])
          )
        ),
      ])
    );
  }
}

// Лимити на ЖИВ контейнер (без рестарт). Compose ги презаписва при следващия
// „up" — затова диалогът го казва изрично.
function showDockerLimits(name) {
  openModal(`Лимити · ${name}`);
  const mem = el('input', { type: 'text', placeholder: '512m или 2g', class: 'mono' });
  const cpus = el('input', { type: 'text', placeholder: '1.5', class: 'mono' });
  const out = document.getElementById('modal-out');
  out.textContent = '';
  out.appendChild(
    el('div', {}, [
      kvInputs([['Памет (--memory)', mem], ['Ядра (--cpus)', cpus]]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        el('button', {
          class: 'btn btn-primary', text: 'Приложи',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await api('/limits/docker', { method: 'POST', body: { container: name, memory: mem.value, cpus: cpus.value } });
              toast(r.note, 'ok');
              closeModal();
            } catch (err) { toast(err.message, 'bad'); }
            e.target.disabled = false;
          },
        }),
      ]),
      el('div', { class: 'metric-sub', text: 'Прилага се веднага, без рестарт. Сложи същото и в compose файла — иначе следващият „up" го връща.' }),
    ])
  );
}

// Потвърждение САМО за действията, които оставят нещо спряно. Рестартът се
// натиска, защото вече нещо не е наред, и е самолекуващ се — модал пред него
// учи човека да щрака, без да чете (и точно затова после щраква и пред „спри").
// „Спри" е другото: услугата остава долу, докато човек не се върне.
const STOPS_IT = new Set(['stop', 'kill', 'down', 'rm', 'disable']);
async function confirmStop(action, what) {
  if (!STOPS_IT.has(action)) return true;
  return confirmDanger({
    title: `${action} · ${what}`,
    what: [`„${what}" остава СПРЯН, докато някой не го пусне отново.`,
      'Рестартът се самовъзстановява; спирането — не.'],
    expect: 'спри',
    confirmLabel: action,
  });
}

function dockerBtn(action, id, label, cls = 'btn-sm') {
  return el('button', {
    class: `btn btn-sm ${cls}`,
    text: label,
    onclick: async (e) => {
      if (!(await confirmStop(action, id.slice(0, 12)))) return;
      e.target.disabled = true;
      try {
        await api('/docker/action', { method: 'POST', body: { id, action } });
        toast(`${action} → ${id.slice(0, 12)}`);
        go('docker');
      } catch (err) {
        toast(err.message, 'bad');
        e.target.disabled = false;
      }
    },
  });
}

async function showDockerLogs(id, name) {
  openModal(`Docker лог · ${name}`);
  try {
    const r = await api(`/docker/logs?id=${encodeURIComponent(id)}&lines=500`);
    setModalOut(r.text || '(празно)');
  } catch (e) {
    setModalOut('Грешка: ' + e.message);
  }
}

// ── Compose (по стек) ──────────────────────────────────────────────────────────
async function renderCompose() {
  const view = document.getElementById('view');
  const data = await api('/compose');
  view.innerHTML = '';
  if (!data.available) {
    view.innerHTML = `<div class="empty">Docker Compose недостъпен: ${escapeHtml(data.error || '')}</div>`;
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text: 'Управление на цели стекове (продукти), не отделни контейнери.' }));
  if (!data.projects.length) view.appendChild(el('div', { class: 'empty', text: 'Няма compose проекти на този сървър.' }));
  for (const p of data.projects) {
    const card = el('div', { class: 'card', style: 'margin-bottom:14px' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: p.name }),
        pill(/running/i.test(p.status || '') ? 'ok' : 'dim', p.status || '—'),
      ]),
      el('div', { class: 'metric-sub mono', text: p.configFiles || '' }),
      el('div', { class: 'toolbar' }, [
        composeBtn(p, 'up', '▲ Вдигни', 'btn-primary'),
        composeBtn(p, 'restart', '⟳ Рестарт'),
        composeBtn(p, 'pull', '⬇ Дръпни образи'),
        composeBtn(p, 'down', '▼ Свали', 'btn-danger'),
        el('button', { class: 'btn btn-sm', text: 'Лог', onclick: async () => {
          openModal(`Compose лог · ${p.name}`);
          try { const r = await api(`/compose/logs?project=${encodeURIComponent(p.name)}`); setModalOut(r.text || '(празно)'); }
          catch (e) { setModalOut('Грешка: ' + e.message); }
        } }),
      ]),
    ]);
    view.appendChild(card);
    // Услугите в стека (асинхронно, за да не бавят рисуването).
    api(`/compose/ps?project=${encodeURIComponent(p.name)}`)
      .then((ps) => {
        if (!ps.services.length) return;
        card.appendChild(el('div', { class: 'table-wrap' }, [
          tableEl(['Услуга', 'Състояние', 'Статус', 'Портове'], ps.services.map((s) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: s.name || s.service }),
              el('td', {}, [pill(s.state === 'running' ? 'ok' : 'dim', s.state || '—')]),
              el('td', { class: 'muted', text: s.status || '' }),
              el('td', { class: 'muted mono', text: s.ports || '' }),
            ])
          )),
        ]));
      })
      .catch(() => {});
  }
}

function composeBtn(p, action, label, cls = '') {
  return el('button', {
    class: `btn btn-sm ${cls}`,
    text: label,
    onclick: async () => {
      if (action === 'down') {
        const ok = await confirmDanger({
          title: `Сваляне на стек ${p.name}`,
          what: ['Всички контейнери в стека спират.', 'Продуктът става недостъпен, докато не го вдигнеш пак.'],
          expect: p.name,
          confirmLabel: 'Свали стека',
        });
        if (!ok) return;
      } else if (action === 'restart' && !confirm(`${label} за стек ${p.name}?`)) return;
      try {
        const job = await api('/compose/action', { method: 'POST', body: { project: p.name, configFile: p.configFiles, action } });
        streamJob(job.id, job.title);
      } catch (err) { toast(err.message, 'bad'); }
    },
  });
}

// ── Бази ───────────────────────────────────────────────────────────────────────
async function renderDatabases() {
  const view = document.getElementById('view');
  const [db, bk] = await Promise.all([api('/databases'), api('/backups/dumps')]);
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Само четене + снимки (dump). Никакви промени по данните от панела — за заявки ползвай терминала.' }));

  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn-primary btn-sm', text: '⬇ Снимка на ВСИЧКИ бази', onclick: () => runJob('/backups/run', { kind: 'databases' }, 'Снимка на всички бази') }),
      bk.restic
        ? el('span', {}, [
            el('button', { class: 'btn btn-sm', text: 'restic бекъп', onclick: () => runJob('/backups/run', { kind: 'restic', mode: 'backup' }, 'restic бекъп') }),
            el('button', { class: 'btn btn-sm', text: 'restic проверка', onclick: () => runJob('/backups/run', { kind: 'restic', mode: 'verify' }, 'restic проверка') }),
          ])
        : el('span', { class: 'muted', text: 'restic не е настроен (/etc/vps-dashboard/restic.env)' }),
    ])
  );

  view.appendChild(el('h3', { class: 'muted', text: 'SQLite', style: 'margin:18px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Продукт', 'Файл', 'Размер', 'WAL', 'Променен', ''], (db.sqlite || []).map((s) =>
        el('tr', {}, [
          el('td', { text: s.product }),
          el('td', { class: 'mono muted', text: s.file }),
          el('td', { text: fmtBytes(s.sizeBytes) }),
          el('td', { class: 'muted', text: s.walBytes ? fmtBytes(s.walBytes) : '—' }),
          el('td', { class: 'muted', text: fmtWhen(s.mtime) }),
          el('td', {}, [
            el('button', { class: 'btn btn-sm', text: 'Провери', onclick: async () => {
              openModal('Проверка · ' + s.file);
              try {
                const r = await api('/databases/sqlite/check?file=' + encodeURIComponent(s.file));
                setModalOut(`integrity_check: ${r.integrity}\n\nТаблици (${r.tables.length}):\n${r.tables.join('\n')}`);
              } catch (e) { setModalOut('Грешка: ' + e.message); }
            } }),
            el('button', { class: 'btn btn-sm', text: 'Снимка', onclick: () => runJob('/databases/dump', { kind: 'sqlite', file: s.file }, 'SQLite снимка') }),
          ]),
        ])
      )),
    ])
  );

  const pg = db.postgres || {};
  view.appendChild(el('h3', { class: 'muted', text: 'PostgreSQL (в Docker)', style: 'margin:22px 0 10px' }));
  if (!pg.available || !(pg.instances || []).length) {
    view.appendChild(el('div', { class: 'empty', text: 'Няма открити Postgres контейнери.' }));
  }
  for (const inst of pg.instances || []) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: inst.container }), pill(inst.reachable ? 'ok' : 'bad', inst.reachable ? 'достъпен' : 'недостъпен')]),
        el('div', { class: 'metric-sub mono', text: `${inst.image} · ${inst.status}` }),
        inst.reachable
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['База', 'Размер', 'Връзки', ''], inst.databases.map((d) =>
                el('tr', {}, [
                  el('td', { class: 'mono', text: d.name }),
                  el('td', { text: fmtBytes(d.sizeBytes) }),
                  el('td', { text: d.connections }),
                  el('td', {}, [el('button', { class: 'btn btn-sm', text: 'pg_dump', onclick: () => runJob('/databases/dump', { kind: 'postgres', container: inst.container, database: d.name }, 'pg_dump ' + d.name) })]),
                ])
              )),
            ])
          : el('div', { class: 'muted', text: inst.error || '' }),
      ])
    );
  }

  view.appendChild(el('h3', { class: 'muted', text: `Снимки и възстановяване (${bk.dir})`, style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'metric-sub', text: 'Възстановяването е на ДВЕ стъпки: първо „Преглед" (разопакова в /tmp и показва какво има вътре — нищо живо не се пипа), после „Възстанови" (прави снимка на текущото състояние и чак тогава презаписва).' })
  );
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Файл', 'Размер', 'Кога', ''], (bk.dumps || []).map((d) =>
        el('tr', {}, [
          el('td', { class: 'mono', text: d.name }),
          el('td', { text: fmtBytes(d.sizeBytes) }),
          el('td', { class: 'muted', text: fmtWhen(d.mtime) }),
          el('td', {}, [
            el('button', {
              class: 'btn btn-sm', text: '👁 Преглед',
              onclick: () => runJob('/backups/restore/preview', { name: d.name }, 'Преглед на ' + d.name),
            }),
            el('button', {
              class: 'btn btn-sm btn-danger', text: '↺ Възстанови',
              onclick: () => restoreDialog(d, db),
            }),
          ]),
        ])
      )),
    ])
  );
}

// Възстановяването е най-опасното действие в панела: иска изрично изписване на
// целта и обяснява какво точно ще стане.
async function restoreDialog(dump, db) {
  const isSqlite = dump.name.endsWith('.sqlite.gz');
  let target;
  let sqlitePath = null;
  if (isSqlite) {
    const files = (db.sqlite || []).map((s) => s.file);
    sqlitePath = prompt(`Върху КОЙ файл да възстановя ${dump.name}?\n\nНамерени бази:\n${files.join('\n') || '(няма)'}`, files[0] || '');
    if (!sqlitePath) return;
    // Услугата, която държи базата. Презапис под жив процес е повреда, не
    // възстановяване: старите WAL/SHM файлове се смесват с новата база, а
    // отвореният дескриптор на приложението сочи вече несъществуващи данни.
    const unit = prompt(
      `Коя услуга ползва ${sqlitePath}?\n\n` +
        'Панелът ще я СПРЕ преди презаписа и ще я пусне след това. Празно = не спирай ' +
        '(прави го само ако си сигурен, че нищо не държи базата отворена).',
      ''
    );
    if (unit === null) return;
    target = { path: sqlitePath, unit: unit.trim() || undefined };
  } else {
    const inst = (db.postgres?.instances || [])[0];
    if (!inst) { toast('Няма Postgres контейнер за възстановяване', 'bad'); return; }
    const dbName = prompt(`В коя база в контейнера ${inst.container} да възстановя ${dump.name}?`, inst.databases[0]?.name || '');
    if (!dbName) return;
    target = { container: inst.container, database: dbName };
  }
  const label = isSqlite ? sqlitePath : `${target.container}/${target.database}`;
  const ok = await confirmDanger({
    title: 'Възстановяване на база',
    what: [
      `Снимка: ${dump.name} (${fmtWhen(dump.mtime)})`,
      `Цел: ${label}`,
      'Текущото състояние ще бъде записано като снимка ПРЕДИ презаписа.',
      'Данните, въведени след тази снимка, ще изчезнат.',
      isSqlite
        ? target.unit
          ? `Услугата ${target.unit} ще бъде спряна за времето на презаписа и пусната след това.`
          : 'НЯМА да спирам услуга — увери се, че нищо не държи базата отворена.'
        : 'Възстановяването е в ЕДНА транзакция: при грешка нищо не се променя.',
    ],
    expect: isSqlite ? String(sqlitePath).split('/').pop() : target.database,
    confirmLabel: 'Възстанови',
    delayMs: 2000,
  });
  if (!ok) return;
  try {
    const job = await api('/backups/restore/apply', { method: 'POST', body: { name: dump.name, target } });
    streamJob(job.id, job.title);
  } catch (e) { toast(e.message, 'bad'); }
}

// ── Десктоп (незадължителен) ──────────────────────────────────────────────────
// Пълен Ubuntu + XFCE в контейнер, показан ВЪТРЕ в панела. Изключен по
// подразбиране: жива графична сесия е втора среда за изпълнение на машината, а
// не подробност от интерфейса.
async function renderDesktop() {
  const view = document.getElementById('view');
  const d = await api('/desktop');
  view.innerHTML = '';

  view.appendChild(
    el('p', { class: 'section-desc', text:
      'Графичен работен плот на самия сървър — браузър (виждаш сайта както го вижда светът от този IP), ' +
      'графичен клиент за база, преглед на снимки и PDF. Върви в контейнер, слуша само на 127.0.0.1 и се ' +
      'вижда единствено през този панел, тоест зад същия вход и 2FA.' })
  );

  if (!d.available) {
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'empty', text: d.error || 'Няма compose файл за десктопа в текущия release.' }),
    ]));
    return;
  }

  const busy = (btn, fn) => async () => {
    btn.disabled = true;
    try { const job = await fn(); streamJob(job.id, job.title); }
    catch (e) { toast(e.message, 'bad'); btn.disabled = false; }
  };
  const upBtn = el('button', { class: 'btn btn-primary btn-sm', text: '▶ Пусни десктопа' });
  upBtn.onclick = busy(upBtn, () => api('/desktop/up', { method: 'POST' }));
  const downBtn = el('button', { class: 'btn btn-sm btn-danger', text: '■ Спри' });
  downBtn.onclick = busy(downBtn, () => api('/desktop/down', { method: 'POST' }));
  const pullBtn = el('button', { class: 'btn btn-sm', text: '⟳ Обнови образа' });
  pullBtn.onclick = busy(pullBtn, () => api('/desktop/pull', { method: 'POST' }));

  view.appendChild(
    el('div', { class: 'toolbar' }, [
      pill(d.running ? 'ok' : 'dim', d.running ? 'върви' : d.state || 'спрян'),
      d.health ? pill(d.health === 'healthy' ? 'ok' : 'warn', d.health) : '',
      pill(d.envConfigured ? 'ok' : 'bad', d.envConfigured ? 'паролата е зададена' : 'липсва desktop.env'),
      el('span', { class: 'grow' }),
      d.running ? downBtn : upBtn,
      pullBtn,
    ])
  );

  if (!d.envConfigured) {
    view.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Първо задай парола за десктопа' }),
      el('div', { class: 'metric-sub', text:
        'Тя е ВТОРИ слой — контейнерът и без това не се вижда отвън. Живее до compose файла, mode 600, ' +
        'никога в репото (същото правило като restic.env):' }),
      el('pre', { class: 'term-out', style: 'max-height:140px', text:
        `printf 'DESKTOP_USER=csd\nDESKTOP_PASSWORD=%s\n' "$(openssl rand -base64 18)" \\
` +
        `  > ${d.composeFile.replace(/docker-compose\.yml$/, 'desktop.env')}
` +
        `chmod 600 ${d.composeFile.replace(/docker-compose\.yml$/, 'desktop.env')}` }),
    ]));
    return;
  }

  if (!d.running) {
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'empty', text:
        'Десктопът е спрян. Първото пускане дърпа около 2 GB образ — виж живия изход на задачата.' }),
      el('div', { class: 'metric-sub', text:
        'Не стартира заедно с машината по подразбиране. Спри го, като свършиш: ~1 GB RAM и една ' +
        'допълнителна среда за изпълнение по-малко.' }),
    ]));
    return;
  }

  // Рамката е от СЪЩИЯ произход (`/desktop/` минава през панела), затова CSP-то
  // остава стегнато — нищо чуждо не се отваря.
  // Диалогът за парола е на КОНТЕЙНЕРА, но браузърът показва домейна на ПАНЕЛА
  // — тоест изглежда точно като фишинг върху собствения ти адрес, а човек няма
  // откъде да знае какво име да въведе. Мълчанието тук струваше една вечер.
  view.appendChild(
    el('div', { class: 'muted', style: 'margin:8px 0;font-size:13px' }, [
      el('span', { text: 'Десктопът иска СОБСТВЕНА парола — диалогът е негов, не на панела (това е вторият слой). Потребител:' }),
      ' ',
      el('b', { class: 'mono', raw: d.user || 'csd' }),
      el('span', { text: ' · паролата е в desktop.env на сървъра.' }),
    ])
  );
  const frame = el('iframe', {
    src: '/desktop/',
    style: 'width:100%;height:76vh;border:1px solid var(--line);border-radius:var(--radius);background:#000',
    allow: 'clipboard-read; clipboard-write; fullscreen',
    title: 'Десктоп на сървъра',
  });
  view.appendChild(frame);
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn-sm', text: '⛶ На цял екран', onclick: () => frame.requestFullscreen?.() }),
      el('button', { class: 'btn btn-sm', text: '↗ В нов раздел', onclick: () => window.open('/desktop/', '_blank', 'noopener') }),
      el('span', { class: 'muted', text: `порт 127.0.0.1:${d.port} · контейнер csd-desktop` }),
    ])
  );
}

// ── Кой яде диска ────────────────────────────────────────────────────────────
// Прогнозата казва „дискът ще се напълни след 3.2 дни" и оставя човека на SSH
// промпт да налучква с `du`. Тази секция е втората половина на отговора.
// „Какво може да се освободи" — другата половина на „кой яде диска". Първата
// казва КЪДЕ отиват байтовете; тази казва кои от тях са боклук. Човек на пълен
// диск иска второто.
function reclaimCard(rec) {
  if (!rec) return null;
  const rows = (rec.items || []).map((it) => {
    const size = it.human || fmtBytes(it.bytes || 0);
    return el('tr', {}, [
      el('td', {}, [
        el('div', {}, [el('b', { text: it.title })]),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px', text: it.why }),
        it.note ? el('div', { style: 'font-size:12px;margin-top:2px;color:var(--warn)', text: `⚠ ${t(it.note)}` }) : null,
      ]),
      el('td', { class: 'mono', text: size }),
      el('td', {}, [it.count ? el('span', { class: 'muted', text: `${it.count} бр.` }) : '']),
      el('td', {}, [pill(it.safety === 'safe' ? 'ok' : 'warn', it.safety === 'safe' ? 'нищо не се губи' : 'прочети преди да триеш')]),
      el('td', {}, [
        el('button', {
          class: 'btn btn-sm ' + (it.safety === 'safe' ? '' : 'btn-warn'),
          text: '🧹 Освободи',
          onclick: async () => {
            const ok = await confirmDanger({
              title: t(it.title),
              what: [it.why, it.note || '', `${t('Освобождава')}: ${size}`].filter(Boolean),
              expect: 'изтрий',
              confirmLabel: 'Изтрий',
              delayMs: 800,
            });
            if (ok) runJob('/reclaim/run', { id: it.id }, t(it.title));
          },
        }),
      ]),
    ]);
  });
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Може да се освободи' }),
      pill(rec.items?.length ? 'warn' : 'ok', rec.items?.length ? fmtBytes(rec.totalBytes) : 'няма боклук'),
    ]),
    el('div', { class: 'metric-sub', text:
      'Тук влиза САМО това, което по конструкция не може да е данни: кеш, който се пресваля, вече ротирани логове, ' +
      'копия от деплоя. Docker томове, спрени контейнери и /tmp ги НЯМА нарочно — том е данни, а спрян контейнер ' +
      'може да е спрян съзнателно.' }),
    rows.length
      ? el('div', { class: 'table-wrap' }, [tableEl(['Какво', 'Размер', 'Брой', 'Риск', ''], rows)])
      : el('div', { class: 'empty', text: 'Нищо за чистене — машината е спретната.' }),
  ]);
}

async function renderDisk() {
  const view = document.getElementById('view');
  const [d, rec] = await Promise.all([api('/disk'), api('/reclaim').catch(() => null)]);
  view.innerHTML = '';

  view.appendChild(
    el('p', { class: 'section-desc', text:
      'Сканирането е ЗАДАЧА, не заявка: `--max-depth` ограничава само какво се ОТПЕЧАТВА — `du` пак обхожда цялото ' +
      'дърво, което на пълен диск е минути. Затова резултатът се кешира с дата, а прекъснато сканиране се показва ' +
      'като прекъснато, не като отговор.' })
  );

  const rc = reclaimCard(rec);
  if (rc) view.appendChild(rc);

  // Бързите числа — без задача.
  view.appendChild(
    el('div', { class: 'grid grid-2' }, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: 'Журнал (journald)' }),
          d.journal.available ? pill(d.journal.bytes > 2 * 1024 ** 3 ? 'warn' : 'ok', fmtBytes(d.journal.bytes)) : pill('warn', 'няма'),
        ]),
        el('div', { class: 'metric-sub', text: d.journal.available ? d.journal.text : `journalctl не отговори: ${d.journal.error}` }),
        d.journal.available ? journalVacuum() : '',
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Docker' }),
        d.docker.available
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['Вид', 'Общо', 'Активни', 'Размер', 'Освободимо'], d.docker.rows.map((r) =>
                el('tr', {}, [
                  el('td', { text: r.type }),
                  el('td', { text: String(r.total ?? '—') }),
                  el('td', { text: String(r.active ?? '—') }),
                  el('td', { class: 'mono', text: r.size || '—' }),
                  el('td', { class: 'mono muted', text: r.reclaimable || '—' }),
                ])
              )),
            ])
          : el('div', { class: 'empty', text: `docker не отговори: ${d.docker.error}` }),
        el('div', { class: 'metric-sub', text:
          'Тук НЯМА „system prune": `docker system prune -a --volumes` умее да изтрие томове с живи данни (качени ' +
          'файлове, бази) и е най-честият начин човек да си направи инцидент, докато чисти място. Изтриването е ' +
          'поименно, от секция „Docker".' }),
        d.docker.available
          ? el('div', { class: 'toolbar' }, [
              el('button', {
                class: 'btn btn-sm', text: '🧹 Изчисти build кеша',
                onclick: async () => {
                  // Кешът се възстановява сам, но следващият билд става минути
                  // по-бавен — а понякога точно тогава бързаш.
                  const ok = await confirmDanger({
                    title: 'Чистене на build кеша',
                    what: ['Кешът се възстановява сам при следващия билд — нищо не се губи безвъзвратно.',
                      'Но първият билд след това е чувствително по-бавен.'],
                    expect: 'изчисти',
                    confirmLabel: 'Изчисти',
                  });
                  if (ok) runJob('/disk/builder-prune', {}, 'Чистене на Docker build кеша');
                },
              }),
            ])
          : '',
      ]),
    ])
  );

  view.appendChild(scanCard(d));
}

function journalVacuum() {
  const keep = el('input', { type: 'number', min: '16', max: '51200', value: '512', style: 'width:110px' });
  return el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
    el('label', { class: 'inline' }, [el('span', { text: 'остави ' }), keep, el('span', { text: ' MB' })]),
    el('button', {
      class: 'btn btn-danger btn-sm', text: 'Свий журнала',
      onclick: async () => {
        const ok = await confirmDanger({
          title: 'Свиване на журнала',
          what: [
            `Логовете над ${keep.value} MB се ИЗТРИВАТ безвъзвратно.`,
            'Загубваш история за диагноза и за „нова грешка в журнала".',
            'Действието е одитирано и иска повторно потвърждаване с парола.',
          ],
          expect: 'свий',
          confirmLabel: 'Свий',
        });
        if (!ok) return;
        runJob('/disk/vacuum', { keepMB: Number(keep.value) }, 'Свиване на журнала');
      },
    }),
  ]);
}

function scanCard(d) {
  const sel = el('select', { 'aria-label': 'Коренова папка за сканиране' }, d.roots.map((r) => el('option', { value: r, text: r })));
  const depth = el('input', { type: 'number', min: '1', max: '4', value: '2', style: 'width:70px' });
  const minMB = el('input', { type: 'number', min: '1', max: '102400', value: '50', style: 'width:90px' });
  const s = d.scan || {};
  const rows = (list, label) =>
    list?.length
      ? el('div', { class: 'table-wrap', style: 'margin-top:10px' }, [
          el('h3', { text: label }),
          tableEl(['Размер', 'Път'], list.map((x) =>
            el('tr', {}, [el('td', { class: 'mono', text: fmtBytes(x.bytes) }), el('td', { class: 'mono', text: x.path })])
          )),
        ])
      : '';

  return el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Разбивка по папки и файлове' }),
      s.at ? pill(s.complete ? 'ok' : 'warn', s.complete ? `сканирано ${fmtWhen(s.at)}` : 'ПРЕКЪСНАТО сканиране') : pill('dim', 'няма сканиране'),
    ]),
    el('div', { class: 'toolbar' }, [
      sel,
      el('label', { class: 'inline' }, [el('span', { text: 'дълбочина ' }), depth]),
      el('label', { class: 'inline' }, [el('span', { text: 'файлове над ' }), minMB, el('span', { text: ' MB' })]),
      el('span', { class: 'grow' }),
      el('button', {
        class: 'btn btn-primary btn-sm', text: '⌕ Сканирай',
        onclick: () => runJob('/disk/scan', { root: sel.value, depth: Number(depth.value), minMB: Number(minMB.value) }, `Разбивка: ${sel.value}`),
      }),
    ]),
    s.at
      ? el('div', { class: 'metric-sub', text:
          `${t('Корен')} ${s.root} · ${t(`дълбочина ${s.depth}`)} · ${t(`файлове над ${s.minMB} MB`)} · ${t(`изход ${s.code}`)}` })
      : el('div', { class: 'empty', text: 'Още няма сканиране. Изборът на корен е от ЗАТВОРЕН списък — произволен път би направил панела „изброй ми имената на всички файлове като root".' }),
    !s.complete && s.at
      ? el('div', { class: 'metric-sub', style: 'color:var(--warn)', text:
          '⚠ Сканирането не е стигнало до край (таймаут или грешка). Долното е ЧАСТИЧНО — не го чети като пълна картина.' })
      : '',
    rows(s.dirs, 'Най-големи папки'),
    rows(s.files, 'Най-големи файлове'),
  ]);
}

// ── Портове: карта на ИЗЛОЖЕНОСТТА ────────────────────────────────────────────
// Старият изглед („Сигурност → Отворени портове") показваше адрес + процес. Вярно
// и почти безполезно: не отговаряше на единствения въпрос, който има значение —
// достъпен ли е този порт от интернет. Отговорът е сечение на две неща (на какво
// слуша сокетът × какво пуска ufw) и има ТРИ състояния, не две. Третото е „не
// знам" и то е задължително.
async function renderPorts() {
  const view = document.getElementById('view');
  const d = await api('/ports');
  view.innerHTML = '';

  view.appendChild(
    el('p', { class: 'section-desc', text:
      'Изложен = слуша на всички интерфейси И защитната стена го пуска. Защитен = слуша навън, но ufw го спира. ' +
      'Локален = слуша само на 127.0.0.1, недостъпен отвън по конструкция. „Не знам" е отделно състояние — ' +
      'панел, който твърди „защитен", когато не е разпознал правило, е по-лош от панел, който мълчи.' })
  );

  if (!d.available) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'empty', text: `Не мога да прочета портовете: ${d.error}` })]));
    return;
  }

  const c = d.counts;
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, [
      ['изложени', c.изложени, 'bad'], ['неизвестни', c.неизвестни, 'warn'],
      ['защитени', c.защитени, 'ok'], ['локални', c.локални, 'dim'],
    ].map(([label, n, kind]) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: label }), pill(kind, String(n))]),
      ])
    ))
  );

  const acceptBtn = el('button', { class: 'btn btn-primary btn-sm', text: '✓ Приеми текущото за нормално' });
  acceptBtn.onclick = async () => {
    if (!confirm(`Приемам ${c.изложени} изложени порта за нормални.\n\nСлед това всеки НОВО изложен порт вдига аларма.`)) return;
    acceptBtn.disabled = true;
    try { const r = await api('/ports/accept', { method: 'POST' }); toast(`Приети ${plural(r.accepted.length, 'порт', 'порта')} като база`); go('ports'); }
    catch (e) { toast(e.message, 'bad'); acceptBtn.disabled = false; }
  };
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      pill(d.firewall.available ? (d.firewall.active ? 'ok' : 'bad') : 'warn',
        d.firewall.available ? (d.firewall.active ? 'ufw е включен' : 'ufw е ИЗКЛЮЧЕН') : 'ufw не отговори'),
      d.firewall.unresolved.length
        ? pill('warn', `${d.firewall.unresolved.length} неразпознати правила`)
        : '',
      el('span', { class: 'grow' }),
      acceptBtn,
    ])
  );
  if (d.firewall.unresolved.length) {
    view.appendChild(el('div', { class: 'metric-sub', text:
      `Правила, които не мога да преведа до порт: ${d.firewall.unresolved.join(', ')}. Затова портовете без ` +
      'разпознато правило са „не знам", а не „защитен".' }));
  }

  const kindOf = (e) => (e === 'изложен' ? 'bad' : e === 'неизвестно' ? 'warn' : e === 'защитен' ? 'ok' : 'dim');
  view.appendChild(
    el('div', { class: 'table-wrap', style: 'margin-top:16px' }, [
      tableEl(['Изложеност', 'Порт', 'Слуша на', 'Процес', 'Unit', 'Наш продукт', 'Защо'], d.rows.map((r) =>
        el('tr', {}, [
          el('td', {}, [pill(kindOf(r.exposure), r.exposure)]),
          el('td', { class: 'mono', text: `${r.port}/${r.proto}` }),
          el('td', { class: 'mono', text: r.addr }),
          el('td', { text: r.process || '—' }),
          el('td', { class: 'muted', text: r.unit || '—' }),
          el('td', { text: r.owner || '—' }),
          el('td', { class: 'muted', style: 'max-width:420px;overflow:hidden;text-overflow:ellipsis', title: r.why, text: r.why }),
        ])
      )),
    ])
  );
  view.appendChild(el('div', { class: 'metric-sub', text:
    'Затварянето става от секция „Firewall" — оттам минава предпазителят за SSH и одитът. Тази секция нарочно ' +
    'само ПОКАЗВА: две места, които мутират стената, са едно място повече от нужното.' }));

  view.appendChild(portChangeCard(d));
}

// Смяна на порта на продукт — план, после прилагане.
function portChangeCard(d) {
  const products = [...new Set(d.rows.map((r) => r.owner).filter((o) => o && o !== 'самият панел' && o !== 'десктоп'))];
  const sel = el('select', { style: 'max-width:200px', 'aria-label': 'Избор' }, [
    el('option', { value: '', text: products.length ? '— избери продукт —' : '(няма познати продукти)' }),
    ...products.map((p) => el('option', { value: p, text: p })),
  ]);
  const portInput = el('input', { type: 'text', placeholder: 'нов порт', style: 'width:110px' });
  const out = el('div', { style: 'margin-top:12px' });

  const showPlan = async () => {
    out.innerHTML = '';
    if (!sel.value) return toast('Избери продукт', 'bad');
    let p;
    try { p = await api('/ports/change/plan', { method: 'POST', body: { product: sel.value, newPort: Number(portInput.value) } }); }
    catch (e) { return toast(e.message, 'bad'); }

    out.appendChild(el('h3', { text: `План: ${p.product} ${p.currentPort} → ${p.newPort}` }));
    out.appendChild(el('div', { class: 'metric-sub', text: 'Нищо още не е пипнато. Ето какво ще се промени:' }));
    out.appendChild(el('ul', {}, p.steps.map((s) => el('li', { class: 'mono', text: s.what }))));
    for (const w of p.warnings) {
      out.appendChild(el('div', { class: 'metric-sub', style: 'color:var(--warn)', text: `⚠ ${w}` }));
    }
    if (!p.applicable) {
      out.appendChild(el('div', { class: 'metric-sub', style: 'color:var(--danger)', text:
        'Няма нито едно място за смяна — няма какво да приложа.' }));
      return;
    }
    const apply = el('button', { class: 'btn btn-danger btn-sm', text: `Приложи (${p.currentPort} → ${p.newPort})` });
    apply.onclick = async () => {
      const ok = await confirmDanger({
        title: `Смяна на порта на ${p.product}`,
        what: [
          ...p.steps.map((s) => s.what),
          'Всеки пипнат файл получава копие със суфикс „.преди-смяна-на-порт".',
          'Ако новият порт не отговори до 30 секунди, веригата се ВРЪЩА НАЗАД сама.',
          'Проверката на панела се обновява САМО при успех.',
        ],
        expect: p.product,
        confirmLabel: 'Смени порта',
        delayMs: 2000,
      });
      if (!ok) return;
      try { const job = await api('/ports/change/apply', { method: 'POST', body: { product: p.product, newPort: p.newPort } }); streamJob(job.id, job.title); }
      catch (e) { toast(e.message, 'bad'); }
    };
    out.appendChild(el('div', { class: 'toolbar' }, [apply]));
  };

  return el('div', { class: 'card', style: 'margin-top:20px' }, [
    el('h3', { text: 'Смяна на порта на продукт' }),
    el('div', { class: 'metric-sub', text:
      'Четири промени на четири места: .env на продукта → рестарт → vhost на уеб сървъра → проверката на панела. ' +
      'Чупи се, защото хората правят три от тях — най-често забравят vhost-а (сайтът дава 502 при жив продукт) ' +
      'или проверката (панелът вика стар порт и вдига критична аларма за работещ продукт).' }),
    el('div', { class: 'toolbar' }, [sel, portInput, el('button', { class: 'btn btn-sm', text: 'Покажи плана', onclick: showPlan })]),
    out,
  ]);
}

// ── Firewall ───────────────────────────────────────────────────────────────────
async function renderFirewall() {
  const view = document.getElementById('view');
  const fw = await api('/firewall');
  view.innerHTML = '';
  if (!fw.available) {
    view.innerHTML = `<div class="empty">ufw недостъпен: ${escapeHtml(fw.error || '')}</div>`;
    return;
  }
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      pill(fw.active ? 'ok' : 'bad', fw.active ? 'активен' : 'изключен'),
      el('button', {
        class: `btn btn-sm ${fw.active ? 'btn-danger' : 'btn-primary'}`,
        text: fw.active ? 'Изключи firewall' : 'Включи firewall',
        onclick: async () => {
          if (!confirm(fw.active ? 'ИЗКЛЮЧВАМ защитната стена — сървърът остава отворен. Сигурен ли си?' : 'Включвам ufw.')) return;
          try {
            await api('/firewall/enabled', { method: 'POST', body: { enabled: !fw.active } });
            toast('Готово'); go('firewall');
          } catch (e) {
            // Сървърът отказва включване без allow за SSH (предпазител срещу
            // самозаключване). Питаме изрично, преди да го прескочим.
            if (/заключи/.test(e.message) && confirm(e.message + '\n\nВСЕ ПАК да включа ufw?')) {
              try { await api('/firewall/enabled', { method: 'POST', body: { enabled: true, force: true } }); toast('Включен (принудително)', 'warn'); go('firewall'); }
              catch (e2) { toast(e2.message, 'bad'); }
            } else { toast(e.message, 'bad'); }
          }
        },
      }),
    ])
  );

  // Добавяне на правило
  const f = {};
  const mk = (k, ph, w) => { const i = el('input', { type: 'text', placeholder: ph, style: `width:${w}` }); f[k] = i; return i; };
  const actionSel = el('select', { 'aria-label': 'Действие на правилото' }, ['allow', 'deny', 'reject', 'limit'].map((a) => el('option', { value: a, text: a })));
  const protoSel = el('select', { 'aria-label': 'Протокол' }, [el('option', { value: '', text: 'без протокол' }), el('option', { value: 'tcp', text: 'tcp' }), el('option', { value: 'udp', text: 'udp' })]);
  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:14px' }, [
      el('h3', { text: 'Ново правило' }),
      el('div', { class: 'toolbar' }, [
        actionSel,
        mk('port', 'порт / услуга (22, 80, ssh, 1000:2000)', '260px'),
        protoSel,
        mk('from', 'от (any или IP/CIDR)', '170px'),
        mk('comment', 'коментар', '150px'),
        el('button', { class: 'btn btn-primary btn-sm', text: '+ Добави', onclick: async () => {
          try {
            await api('/firewall/rule', { method: 'POST', body: { action: actionSel.value, port: f.port.value, proto: protoSel.value, from: f.from.value, comment: f.comment.value } });
            toast('Правилото е добавено'); go('firewall');
          } catch (e) { toast(e.message, 'bad'); }
        } }),
      ]),
    ])
  );

  view.appendChild(el('h3', { class: 'muted', text: `Правила (${fw.rules.length})`, style: 'margin:20px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['#', 'Към', 'Действие', 'Посока', 'От', ''], fw.rules.map((r) =>
        el('tr', {}, [
          el('td', { class: 'mono', text: r.num }),
          el('td', { class: 'mono', text: r.to }),
          el('td', {}, [pill(r.action === 'ALLOW' ? 'ok' : 'bad', r.action)]),
          el('td', { class: 'muted', text: r.dir }),
          el('td', { class: 'muted', text: r.from }),
          el('td', {}, [el('button', { class: 'btn btn-sm btn-danger', text: 'Изтрий', onclick: async () => {
            if (!confirm(`Изтривам правило #${r.num} (${r.to} ${r.action})?`)) return;
            // `expect` носи ТЕКСТА, който човекът е видял. Номерата се
            // преместват след всяко изтриване — без сверяване „изтрий #3" от
            // остарял списък маха друго правило, често точно SSH-а.
            const expect = `${r.to} ${r.action} ${r.dir} ${r.from}`;
            try { await api('/firewall/rule/delete', { method: 'POST', body: { num: r.num, expect } }); toast('Изтрито'); go('firewall'); }
            catch (e) {
              // 409 е предпазителят (SSH или разместени номера) — питаме изрично.
              if (/SSH/i.test(e.message) && confirm(`${e.message}\n\nНАИСТИНА ли да го изтрия?`)) {
                try { await api('/firewall/rule/delete', { method: 'POST', body: { num: r.num, expect, force: true } }); toast('Изтрито'); go('firewall'); return; }
                catch (e2) { toast(e2.message, 'bad'); return; }
              }
              toast(e.message, 'bad');
            }
          } })]),
        ])
      )),
    ])
  );
}

// ── Уеб сървър ─────────────────────────────────────────────────────────────────
// Кои живи сайтове панелът НЕ следи. Списъкът с vhost файлове е верен и почти
// безполезен без този въпрос: панел с 14 сайта и 3 проверки изглежда точно като
// панел с 14 покрити — зелено навсякъде, защото за останалите няма кой да пита.
function coverageCard(cov) {
  if (!cov) return null;
  // Три различни причини за „нула сайта": няма такъв уеб сървър, папката не се
  // чете, или наистина няма сайтове. Само третата е „наред" — другите две са
  // „не знам" и трябва да се КАЖАТ. Мълчаливата карта е по-лоша от липсваща:
  // жив сайт извън наблюдение изглежда като липса на сайтове.
  if (cov.unknown) {
    return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: 'Кои сайтове се следят' }),
        pill('warn', 'не мога да проверя'),
      ]),
      el('div', { class: 'metric-sub', text:
        cov.denied?.length
          ? 'Конфигурацията на уеб сървъра не се чете (няма права). Това НЕ значи „нула сайта" — значи, че панелът не вижда.'
          : 'На тази машина няма нито /etc/nginx/sites-enabled, нито /etc/caddy/sites. Ако сайтовете се сервират другаде, панелът не може да ги изброи.' }),
    ]);
  }
  if (!cov.total) return null;
  const gap = cov.unwatched.length;
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Кои сайтове се следят' }),
      pill(gap ? 'warn' : 'ok', `${cov.watched} ${t('от')} ${cov.total}`),
    ]),
    cov.denied?.length
      ? el('div', { class: 'metric-sub', text: `Внимание: ${cov.denied.join(', ')} не се чете (няма права) — списъкът може да е НЕПЪЛЕН.` })
      : null,
    el('div', { class: 'metric-sub', text:
      'Липсващата проверка не гърми НИКОГА — тя мълчи, докато клиентът не се обади. Проверка към 127.0.0.1 не се брои ' +
      'за покритие на домейна: тя мери дали процесът е жив, не дали светът стига до него (изтекъл сертификат, счупен ' +
      'server_name, ufw правило).' }),
    gap
      ? el('div', { class: 'table-wrap' }, [
          tableEl(['Домейн', 'vhost', ''], cov.unwatched.map((s) =>
            el('tr', {}, [
              el('td', {}, [
                el('b', { text: s.domain }),
                s.aliases?.length ? el('div', { class: 'muted', style: 'font-size:12px', text: s.aliases.join(', ') }) : null,
              ]),
              el('td', { class: 'muted mono', text: `${s.server}/${s.file}` }),
              el('td', {}, [
                el('button', {
                  class: 'btn btn-sm', text: '👁 Започни да следиш',
                  onclick: async () => {
                    try {
                      await api('/webserver/coverage/watch', { method: 'POST', body: { domain: s.domain } });
                      toast('Добавена е проверка за ' + s.domain);
                      go('webserver');
                    } catch (e) { toast(e.message, 'bad'); }
                  },
                }),
              ]),
            ])
          )),
        ])
      : el('div', { class: 'empty', text: 'Всеки жив сайт има проверка.' }),
  ]);
}

async function renderWebserver() {
  const view = document.getElementById('view');
  const [ws, cov] = await Promise.all([api('/webserver'), api('/webserver/coverage').catch(() => null)]);
  view.innerHTML = '';
  if (!ws.nginx && !ws.caddy) {
    view.innerHTML = '<div class="empty">Няма нито Nginx, нито Caddy на този сървър.</div>';
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text: 'Редакцията валидира конфига ПРЕДИ презареждане — счупен конфиг не стига до живия сървър (автоматичен откат).' }));
  const cc = coverageCard(cov);
  if (cc) view.appendChild(cc);

  for (const server of ['nginx', 'caddy']) {
    const s = ws[server];
    if (!s) continue;
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:16px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: server }),
          el('div', {}, [
            pill(s.active === 'active' ? 'ok' : 'bad', s.active),
            s.configOk === undefined ? el('span') : pill(s.configOk ? 'ok' : 'bad', s.configOk ? 'конфигът е валиден' : 'конфигът е СЧУПЕН'),
          ]),
        ]),
        s.configOutput ? el('pre', { class: 'term-out', style: 'max-height:120px', text: s.configOutput }) : el('span'),
        el('div', { class: 'toolbar' }, [
          el('button', { class: 'btn btn-sm', text: '⟳ Презареди', onclick: async () => {
            try { const r = await api('/webserver/reload', { method: 'POST', body: { server } }); toast(r.ok ? 'Презаредено' : 'Провал: ' + r.output, r.ok ? 'ok' : 'bad'); }
            catch (e) { toast(e.message, 'bad'); }
          } }),
          server === 'nginx' ? el('button', { class: 'btn btn-sm', text: '🔒 certbot renew', onclick: () => runJob('/webserver/cert-renew', {}, 'certbot renew') }) : el('span'),
          server === 'nginx' ? el('button', { class: 'btn btn-sm', text: 'проба (dry-run)', onclick: () => runJob('/webserver/cert-renew', { dry: true }, 'certbot renew --dry-run') }) : el('span'),
        ]),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Сайт', 'Състояние', ''], (s.sites || []).map((site) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: site.name }),
              el('td', {}, [pill(site.enabled ? 'ok' : 'dim', site.enabled ? 'включен' : 'изключен')]),
              el('td', {}, [
                el('button', { class: 'btn btn-sm', text: 'Редактирай', onclick: () => editSite(server, site.name) }),
                server === 'nginx'
                  ? el('button', { class: 'btn btn-sm', text: site.enabled ? 'Изключи' : 'Включи', onclick: async () => {
                      // Изключването сваля сайта ЗА СВЕТА — посетителят получава 404
                      // от уеб сървъра, а нищо в машината не изглежда счупено.
                      if (site.enabled && !(await confirmDanger({
                        title: `Изключване на ${site.name}`,
                        what: [`Сайтът спира да се сервира — посетителите ще получават грешка.`,
                          'Нищо друго не се променя: файлът остава, само връзката в sites-enabled пада.'],
                        expect: 'изключи',
                        confirmLabel: 'Изключи',
                      }))) return;
                      try { await api('/webserver/enabled', { method: 'POST', body: { server, name: site.name, enabled: !site.enabled } }); toast('Готово'); go('webserver'); }
                      catch (e) { toast(e.message, 'bad'); }
                    } })
                  : el('span'),
              ]),
            ])
          )),
        ]),
      ])
    );
  }
}

async function editSite(server, name) {
  let data;
  try {
    data = await api(`/webserver/site?server=${server}&name=${encodeURIComponent(name)}`);
  } catch (e) { toast(e.message, 'bad'); return; }
  const ta = el('textarea', { class: 'term-out', style: 'width:100%;height:52vh;resize:vertical' });
  ta.value = data.content;
  openModal(`${server} · ${name}`);
  const out = document.getElementById('modal-out');
  out.textContent = '';
  out.appendChild(ta);
  out.appendChild(el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
    el('button', { class: 'btn btn-primary btn-sm', text: 'Запази + валидирай + презареди', onclick: async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('/webserver/site', { method: 'POST', body: { server, name, content: ta.value } });
        toast(r.reloaded ? 'Запазено и презаредено' : 'Запазено (презареждането се провали)', r.reloaded ? 'ok' : 'warn');
        closeModal(); go('webserver');
      } catch (err) {
        toast(err.message, 'bad');
        alert('Конфигът е невалиден — старият е върнат:\n\n' + err.message);
        e.target.disabled = false;
      }
    } }),
    el('span', { class: 'muted', text: 'Пази се копие (.bak) и се прави откат при невалиден конфиг.' }),
  ]));
}

// ── Интерактивен терминал (PTY) ───────────────────────────────────────────────
async function renderPty() {
  const view = document.getElementById('view');
  const { Terminal, keyToSequence } = await import('/ansi.js');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Истински интерактивен терминал (PTY): htop, nano, sudo, цветове, Ctrl+C. Всеки въведен ред влиза в одита.' }));

  const cwd = el('input', { type: 'text', value: '/root', style: 'max-width:220px', 'aria-label': 'Работна папка за сесията' });
  // Екранът е ФОКУСИРУЕМ (там отиват клавишите), значи екранният четец го обявява
  // — без име чете само „група". `role="log"` + `aria-live` дават и обновяванията.
  const screen = el('pre', {
    class: 'log-out term-screen', tabindex: '0', style: 'height:64vh;outline:none',
    role: 'log', 'aria-live': 'polite', 'aria-label': 'Екран на терминала',
  });
  const status = el('span', { class: 'muted', text: 'няма сесия' });
  // Броят колони се МЕРИ, а не се гадае: сгрешена ширина значи, че всяка TUI
  // програма рисува в грешни колони и изгледът се разпада.
  view.appendChild(screen);
  let cols = measureCols(screen);
  let rows = measureRows(screen);
  const term = new Terminal(cols, rows);
  let session = null;
  let es = null;

  const paint = () => {
    screen.innerHTML = term.toHtml();
    screen.scrollTop = screen.scrollHeight;
  };

  const open = async () => {
    await close();
    try {
      session = await api('/pty/open', { method: 'POST', body: { cwd: cwd.value || '/root', cols, rows } });
    } catch (e) { toast(e.message, 'bad'); return; }
    term.reset();
    paint();
    status.textContent = `сесия ${session.id.slice(0, 8)} · ${cols}×${rows}`;
    es = new EventSource(sseUrl(`/pty/${session.id}/stream`));
    state.sectionEs = es;
    es.addEventListener('data', (ev) => { term.write(JSON.parse(ev.data)); paint(); });
    es.addEventListener('end', () => { status.textContent = 'сесията приключи'; es.close(); session = null; });
    screen.focus();
  };

  const close = async () => {
    if (es) { es.close(); es = null; }
    if (session) {
      try { await api(`/pty/${session.id}/kill`, { method: 'POST' }); } catch { /* вече е мъртва */ }
      session = null;
    }
    status.textContent = 'няма сесия';
  };

  // Опашка за вход: по една заявка в движение, останалите клавиши се трупат и
  // тръгват накуп. Без това всеки клавиш е отделен POST и заявките се
  // надпреварват — „top" пристига като „tpo" (наблюдавано на живо).
  let pending = '';
  let sending = false;
  const flush = async () => {
    if (sending || !pending || !session) return;
    sending = true;
    const chunk = pending;
    pending = '';
    try {
      await api(`/pty/${session.id}/input`, { method: 'POST', body: { data: chunk } });
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      sending = false;
      if (pending) flush();
    }
  };
  const send = (data) => {
    pending += data;
    flush();
  };

  screen.addEventListener('keydown', (e) => {
    if (!session) return;
    // Пускаме браузърните комбинации за копиране/поставяне.
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase()) && window.getSelection().toString()) return;
    const seq = keyToSequence(e);
    if (seq === null) return;
    e.preventDefault();
    send(seq);
  });
  screen.addEventListener('paste', (e) => {
    if (!session) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text) send(text);
  });

  // Тулбарът се вмъква ПРЕДИ екрана (екранът вече е в изгледа заради меренето).
  view.insertBefore(
    el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted', text: 'папка:' }), cwd,
      el('button', { class: 'btn btn-primary btn-sm', text: '▶ Отвори сесия', onclick: open }),
      el('button', { class: 'btn btn-sm btn-danger', text: '✕ Затвори', onclick: async () => { await close(); paint(); } }),
      status,
    ]),
    screen
  );
  // Лента с модификатори — виртуалната клавиатура на телефона НЯМА Ctrl, Esc,
  // Tab и стрелки. Без тези бутони терминалът на телефон е неизползваем.
  const keyBtn = (label, seq, title) =>
    el('button', {
      class: 'btn btn-sm keycap',
      text: label,
      title: title || label,
      onclick: (e) => {
        e.preventDefault();
        if (session) send(seq);
        screen.focus();
      },
    });
  view.appendChild(
    el('div', { class: 'keybar' }, [
      keyBtn('Esc', '\x1b'),
      keyBtn('Tab', '\t'),
      keyBtn('Ctrl+C', '\x03', 'прекъсва текущата команда'),
      keyBtn('Ctrl+D', '\x04', 'изход от обвивката'),
      keyBtn('Ctrl+Z', '\x1a'),
      keyBtn('Ctrl+L', '\x0c', 'изчиства екрана'),
      keyBtn('↑', '\x1b[A'),
      keyBtn('↓', '\x1b[B'),
      keyBtn('←', '\x1b[D'),
      keyBtn('→', '\x1b[C'),
      keyBtn('Home', '\x1b[H'),
      keyBtn('End', '\x1b[F'),
      keyBtn('|', '|'),
      keyBtn('~', '~'),
      keyBtn('/', '/'),
      keyBtn('Enter', '\r'),
    ])
  );
  view.appendChild(el('div', { class: 'metric-sub', text: 'Щракни в терминала и пиши. Ctrl+C прекъсва, Ctrl+D излиза. Сесия без активност 30 мин се затваря сама.' }));

  // Смяна на размера на прозореца → ПРЕОРАЗМЕРЯВАМЕ и живия TTY.
  //
  // Дотук колоните се мереха ВЕДНЪЖ, при отваряне, а сървърният маршрут
  // `/api/pty/:id/resize` нямаше нито един извикващ. Резултатът беше видим и
  // досаден: завърташ телефона или дърпаш прозореца, а `htop`/`nano` продължават
  // да рисуват в старата ширина и изгледът се разпада. Маршрутът съществуваше —
  // липсваше страната на браузъра.
  let resizeTimer = null;
  const applySize = async () => {
    const next = measureCols(screen);
    const nextRows = measureRows(screen);
    if (next === cols && nextRows === rows) return;
    cols = next;
    rows = nextRows;
    term.resize?.(cols, rows);
    paint();
    if (!session) return;
    try {
      await api(`/pty/${session.id}/resize`, { method: 'POST', body: { cols, rows } });
      status.textContent = `сесия ${session.id.slice(0, 8)} · ${cols}×${rows}`;
    } catch {
      /* размерът е удобство — провалът му не бива да чупи сесията */
    }
  };
  // Дроселиране: влаченето на прозореца произвежда десетки събития в секунда,
  // а всяко от тях е `stty` в чуждия TTY.
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 250);
  };
  window.addEventListener('resize', onResize, { passive: true });

  // На телефон клавиатурата покрива екрана — свиваме терминала до видимата част.
  if (window.visualViewport) {
    const fit = () => {
      const vh = window.visualViewport.height;
      if (vh < window.innerHeight - 80) screen.style.height = `${Math.max(180, vh - 260)}px`;
      else screen.style.height = '64vh';
      onResize();
    };
    window.visualViewport.addEventListener('resize', fit);
    view.addEventListener('DOMNodeRemoved', () => {
      window.visualViewport.removeEventListener('resize', fit);
      window.removeEventListener('resize', onResize);
    }, { once: true });
  }
  paint();
}

// Редовете се мерят по същата логика като колоните: по РЕАЛНАТА височина на
// един ред в текущия шрифт, не по предположение.
function measureRows(container) {
  const probe = el('span', { text: '0', style: 'position:absolute;visibility:hidden;white-space:pre' });
  container.appendChild(probe);
  const lineHeight = probe.getBoundingClientRect().height;
  probe.remove();
  if (!lineHeight || !container.clientHeight) return 30;
  return Math.max(10, Math.min(80, Math.floor((container.clientHeight - 16) / lineHeight)));
}

// Мери реалната ширина на един знак в моноширинния шрифт и връща колко цели
// колони се побират. Ако мерим погрешно, редовете се пренасят и TUI се разпада.
function measureCols(container) {
  const probe = el('span', { text: '0'.repeat(100), style: 'position:absolute;visibility:hidden;white-space:pre' });
  container.appendChild(probe);
  const charWidth = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const usable = container.clientWidth - 26; // padding + място за скролбара
  if (!charWidth || !usable) return 100;
  return Math.max(60, Math.min(240, Math.floor(usable / charWidth)));
}

// ── Процеси ────────────────────────────────────────────────────────────────────────
async function renderProcesses() {
  const view = document.getElementById('view');
  const sortSel = el('select', { 'aria-label': 'Подредба' }, [
    el('option', { value: 'cpu', text: 'Подреди по CPU' }),
    el('option', { value: 'mem', text: 'Подреди по памет' }),
  ]);
  const filter = searchBox('Търси процес… (натисни /)');
  const count = el('span', { class: 'muted' });
  // Първата заявка ВЪРВИ, докато скелетонът още стои — изгледът се чисти чак
  // когато има какво да сложим на негово място.
  const first = await api(`/processes?sort=${sortSel.value}`);
  view.innerHTML = '';
  view.appendChild(el('div', { class: 'toolbar' }, [sortSel, filter, count]));
  const body = el('div', { class: 'table-wrap' });
  view.appendChild(body);
  const applyFilter = attachFilter(filter, body, { count });
  const load = async (preloaded) => {
    const data = preloaded || (await api(`/processes?sort=${sortSel.value}`));
    body.innerHTML = '';
    body.appendChild(
      tableEl(
        ['PID', 'Потребител', 'CPU%', 'MEM%', 'RSS', 'Команда', ''],
        data.map((p) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: p.pid }),
            el('td', { text: p.user }),
            el('td', { class: 'mono', text: p.cpu.toFixed(1) }),
            el('td', { class: 'mono', text: p.mem.toFixed(1) }),
            el('td', { text: fmtBytes(p.rssBytes) }),
            el('td', { class: 'mono muted', text: p.args || p.comm }),
            el('td', {}, [
              el('button', {
                class: 'btn btn-sm btn-danger',
                text: 'Kill',
                onclick: () => killProc(p.pid, 'SIGTERM', load),
              }),
            ]),
          ])
        )
      )
    );
    applyFilter(); // новите редове веднага спазват активния филтър
  };
  sortSel.onchange = () => load();
  await load(first);
}

async function killProc(pid, signal, reload) {
  if (!confirm(`Изпращам ${signal} към PID ${pid}?`)) return;
  try {
    await api('/processes/kill', { method: 'POST', body: { pid, signal } });
    toast(`${signal} → PID ${pid}`);
    reload();
  } catch (e) {
    toast(e.message, 'bad');
  }
}

// ── Логове ────────────────────────────────────────────────────────────────────────
async function renderLogs() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  const unit = el('input', { type: 'text', placeholder: 'unit (напр. medqr.service) — празно = всичко' });
  const prio = el('select', { 'aria-label': 'Ниво на журнала' }, [
    el('option', { value: '', text: 'всички нива' }),
    el('option', { value: '3', text: 'error+ (≤3)' }),
    el('option', { value: '4', text: 'warning+ (≤4)' }),
  ]);
  const follow = el('input', { type: 'checkbox' });
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      unit,
      prio,
      el('label', { class: 'muted' }, [follow, document.createTextNode(' на живо')]),
      el('button', { class: 'btn', text: 'Зареди', onclick: load }),
      el('button', { class: 'btn', text: '🔎 Анализ', onclick: analyze }),
    ])
  );
  const analysis = el('div', { id: 'log-analysis' });
  view.appendChild(analysis);
  const out = el('pre', { class: 'log-out', text: 'Зареди логове…' });
  view.appendChild(out);

  // Групиране по отпечатък: 4200 реда „connection refused" са ЕДНА грешка,
  // повторена 4200 пъти. Най-полезният сигнал е „това е НОВА грешка".
  async function analyze(e) {
    const btn = e?.target;
    if (btn) btn.disabled = true;
    analysis.innerHTML = '';
    analysis.appendChild(el('div', { class: 'metric-sub', text: 'Анализирам журнала…' }));
    try {
      const params = new URLSearchParams();
      if (prio.value) params.set('priority', prio.value);
      const r = await api('/logs/analyze' + (params.toString() ? '?' + params : ''));
      analysis.innerHTML = '';
      if (!r.available) {
        analysis.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: r.error || 'journalctl не е достъпен на този сървър.' })]));
        return;
      }
      analysis.appendChild(el('p', { class: 'section-desc', text:
        `${r.scannedLines} нови реда след последния анализ · ${r.groups.length} различни грешки · ${r.newCount} НОВИ. ` +
        'Съобщенията са маскирани (пътища, IP, имейли, токени) — така отпечатъкът е стабилен и нищо чувствително не изтича в известие.' }));
      if (r.byUnit?.length) {
        analysis.appendChild(
          el('div', { class: 'table-wrap' }, [
            tableEl(['Unit', 'Грешки', 'Различни', 'Грешки/мин'], r.byUnit.map((u) =>
              el('tr', {}, [
                el('td', { class: 'mono', text: u.unit }),
                el('td', { text: String(u.errors) }),
                el('td', { text: String(u.distinct) }),
                el('td', { text: u.perMinute != null ? u.perMinute.toFixed(2) : '—' }),
              ])
            )),
          ])
        );
      }
      analysis.appendChild(
        el('div', { class: 'table-wrap', style: 'margin-top:12px' }, [
          tableEl(['', 'Брой', 'Unit', 'Шаблон', 'Последно'], r.groups.slice(0, 60).map((g) =>
            el('tr', {}, [
              el('td', {}, [g.isNew ? pill('bad', 'НОВА') : pill(g.priority <= 3 ? 'warn' : 'ok', 'p' + g.priority)]),
              el('td', { text: String(g.count) }),
              el('td', { class: 'mono', text: g.unit }),
              el('td', { class: 'mono', text: g.pattern }),
              el('td', { text: g.lastTs ? fmtWhen(g.lastTs) : '—' }),
            ])
          )),
        ])
      );
    } catch (err) {
      analysis.innerHTML = '';
      toast(err.message, 'bad');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function load() {
    closeSectionStream(); // потокът се затваря и при навигация (go)
    const params = new URLSearchParams();
    if (unit.value.trim()) params.set('unit', unit.value.trim());
    if (prio.value) params.set('priority', prio.value);
    if (follow.checked) {
      out.textContent = '';
      const es = new EventSource(sseUrl('/stream/journal?' + params.toString()));
      state.sectionEs = es;
      es.addEventListener('line', (e) => {
        out.textContent += JSON.parse(e.data); // SSE носи JSON, за да оцелеят \r
        out.scrollTop = out.scrollHeight;
      });
      es.onerror = () => toast('Потокът прекъсна', 'warn');
    } else {
      params.set('lines', '400');
      const r = await api('/logs?' + params.toString());
      out.textContent = r.text || '(празно)';
      out.scrollTop = out.scrollHeight;
    }
  }
}

// ── Деплой ────────────────────────────────────────────────────────────────────────
async function renderDeploy() {
  const view = document.getElementById('view');
  const st = await api('/deploy/state');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Деплой по канона на репото: качваш GitHub ZIP в /root, после autodeploy.sh (идемпотентен). Изберете проекти или всички.' }));

  const projBox = el('div', { class: 'toolbar' });
  const checks = {};
  for (const p of st.knownProjects) {
    const c = el('input', { type: 'checkbox' });
    checks[p] = c;
    projBox.appendChild(el('label', { class: 'muted' }, [c, document.createTextNode(' ' + p)]));
  }
  const archSel = el('select', { 'aria-label': 'Архив' }, [
    el('option', { value: '', text: 'най-нов архив (авто)' }),
    ...st.archives.map((a) => el('option', { value: a.name, text: `${a.name} · ${fmtBytes(a.sizeBytes)}` })),
  ]);
  const seed = el('input', { type: 'checkbox' });

  view.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Пусни деплой' }),
      el('div', { class: 'toolbar' }, [el('span', { class: 'muted', text: 'Архив:' }), archSel, el('label', { class: 'muted' }, [seed, document.createTextNode(' FORCE_SEED (zabobovdol)')])]),
      el('div', { class: 'muted', text: 'Проекти (нищо избрано = всички):', style: 'margin-top:6px' }),
      projBox,
      el('button', {
        class: 'btn btn-primary',
        text: '▶ Деплой',
        onclick: async (e) => {
          const projects = Object.entries(checks).filter(([, c]) => c.checked).map(([p]) => p);
          if (!confirm(`Стартирам деплой на: ${projects.length ? projects.join(', ') : 'ВСИЧКИ проекти'}?`)) return;
          e.target.disabled = true;
          try {
            const job = await api('/deploy/run', { method: 'POST', body: { projects, archive: archSel.value || undefined, forceSeed: seed.checked } });
            streamJob(job.id, job.title);
          } catch (err) {
            toast(err.message, 'bad');
          }
          e.target.disabled = false;
        },
      }),
    ])
  );

  // Качване на архив направо от браузъра (без scp).
  const fileInput = el('input', { type: 'file', accept: '.zip,.tar.gz,application/zip,application/gzip', 'aria-label': 'Архив за качване (.zip или .tar.gz)' });
  const upBar = el('div', { class: 'bar', style: 'display:none' });
  const upFill = el('i', { style: 'width:0%' });
  upBar.appendChild(upFill);
  const upInfo = el('div', { class: 'metric-sub', text: 'Качи GitHub ZIP направо тук — пише се в /root заедно със sha256 за проверка на целостта.' });
  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: 'Качване на архив' }),
      upInfo,
      el('div', { class: 'toolbar' }, [
        fileInput,
        el('button', { class: 'btn btn-sm', text: '⬆ Качи', onclick: () => uploadArchive(fileInput, upBar, upFill, upInfo) }),
      ]),
      upBar,
    ])
  );

  view.appendChild(
    el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'Releases (връщане назад)' }),
        el('div', { class: 'crumbs', text: 'current → ' + (st.current || '—') }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Release', 'Дата', ''], (st.releases || []).slice(0, 20).map((r) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: r.name }),
              el('td', { class: 'muted', text: fmtWhen(r.mtime) }),
              el('td', {}, [
                el('button', {
                  class: 'btn btn-sm btn-warn',
                  text: '↩ Върни се тук',
                  onclick: async () => {
                    const projects = Object.entries(checks).filter(([, c]) => c.checked).map(([p]) => p);
                    if (!confirm(`Връщам ${projects.length ? projects.join(', ') : 'ВСИЧКИ проекти'} към release ${r.name}?`)) return;
                    try {
                      const job = await api('/deploy/rollback', { method: 'POST', body: { release: r.name, projects } });
                      streamJob(job.id, job.title);
                    } catch (err) { toast(err.message, 'bad'); }
                  },
                }),
              ]),
            ])
          )),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Качени архиви (/root)' }),
        st.archives.length
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['Архив', 'Размер', 'Качен', ''], st.archives.map((a) =>
                el('tr', {}, [
                  el('td', { class: 'mono', text: a.name }),
                  el('td', { text: fmtBytes(a.sizeBytes) }),
                  el('td', { class: 'muted', text: fmtWhen(a.mtime) }),
                  el('td', {}, [
                    el('button', {
                      class: 'btn btn-sm btn-danger', text: 'Изтрий',
                      onclick: async () => {
                        if (!confirm(`Изтривам ${a.name}?`)) return;
                        try { await api('/deploy/archive/delete', { method: 'POST', body: { name: a.name } }); toast('Изтрит'); go('deploy'); }
                        catch (err) { toast(err.message, 'bad'); }
                      },
                    }),
                  ]),
                ])
              )),
            ])
          : el('div', { class: 'empty', text: 'Няма качени архиви — качи ZIP отгоре.' }),
      ]),
    ])
  );
}

// Качване с прогрес (XHR — fetch още няма надежден upload progress).
function uploadArchive(fileInput, bar, fill, info) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) { toast('Избери файл', 'warn'); return; }
  if (!/\.(zip|tar\.gz)$/i.test(file.name)) { toast('Само .zip или .tar.gz', 'bad'); return; }
  bar.style.display = 'block';
  const xhr = new XMLHttpRequest();
  xhr.open('POST', apiBase() + '/deploy/upload?name=' + encodeURIComponent(file.name));
  xhr.setRequestHeader('x-csd', '1');
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = (e.loaded / e.total) * 100;
    fill.style.width = pct.toFixed(1) + '%';
    info.textContent = `Качвам… ${fmtBytes(e.loaded)} / ${fmtBytes(e.total)} (${pct.toFixed(0)}%)`;
  };
  xhr.onload = () => {
    if (xhr.status === 200) {
      const r = JSON.parse(xhr.responseText);
      toast(`Качен: ${r.name} (${fmtBytes(r.sizeBytes)})`);
      go('deploy');
    } else {
      let msg = `HTTP ${xhr.status}`;
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* без тяло */ }
      toast(msg, 'bad');
      info.textContent = 'Качването се провали.';
    }
  };
  xhr.onerror = () => toast('Мрежова грешка при качване', 'bad');
  xhr.send(file);
}

// ── Ъпдейти ───────────────────────────────────────────────────────────────────────
// Защо ъпдейтът не минава. Рисува се ВИНАГИ — и когато всичко е наред („нищо не
// блокира" също е отговор), и най-вече когато apt е недостъпен: точно тогава
// списъкът с пакети е празен, а причината е тук.
function aptHealthCard(h) {
  if (!h) return null;
  const rows = [];
  const boot = h.boot;
  if (boot) {
    const ok = boot.enoughForKernel;
    rows.push(el('div', { class: 'metric-sub' }, [
      el('b', { text: ok ? '✔ ' : '✘ ' }),
      `${t('Място за ново ядро')} (${boot.mount}${boot.separate ? '' : t(', няма отделен дял')}): `,
      el('b', { style: `color:var(--${ok ? 'ok' : 'danger'})`, text: fmtBytes(boot.availBytes) }),
      ` ${t('свободни')} · ${boot.usePercent}%`,
      ok ? '' : ` — ${t('ъпдейтите ще се провалят')}`,
    ]));
  }
  const k = h.kernels;
  if (k?.all?.length) {
    rows.push(el('div', { class: 'metric-sub', text:
      `${t('Ядра')}: ${k.all.length} (${t('текущо')} ${k.current || '—'}) · ${t('излишни')}: ${k.removable.length}` }));
  }
  // `null` значи НЕ ЗНАЕМ (командата се провали), а не „чисто". Панел, който
  // твърди „в ред", без да е питал, е по-лош от панел, който мълчи.
  // `broken` живее ИЗВЪН условието — по-надолу решава и кои бутони за поправка
  // да се покажат, и дали картата е „блокирано". Декларацията му вътре в `else`
  // счупи ЦЯЛАТА секция („broken is not defined"), а нито един тест не го хвана:
  // те не рендват интерфейс. Точно затова браузърната обиколка е задължителна.
  const broken = h.dpkg?.broken || [];
  if (h.dpkg === null) {
    rows.push(el('div', { class: 'metric-sub' }, [el('b', { text: '? ' }), t('Състоянието на dpkg е НЕИЗВЕСТНО — dpkg-query не отговори.')]));
  } else {
    rows.push(el('div', { class: 'metric-sub' }, [
      el('b', { text: broken.length ? '✘ ' : '✔ ' }),
      broken.length
        ? `${t('Прекъснат dpkg')}: ${broken.slice(0, 6).join(', ')} — ${t('блокира ВСЕКИ ъпдейт')}`
        : t('dpkg е в ред'),
    ]));
  }
  if (h.holds === null) {
    rows.push(el('div', { class: 'metric-sub', text: t('Задържаните пакети са НЕИЗВЕСТНИ — apt-mark не отговори.') }));
  } else if (h.holds?.length) {
    rows.push(el('div', { class: 'metric-sub', text: `${t('Задържани пакети')}: ${h.holds.join(', ')}` }));
  }
  if (k?.unknown) {
    rows.push(el('div', { class: 'metric-sub', text: t('Кое ядро върви в момента е НЕИЗВЕСТНО — нищо не се предлага за махане.') }));
  }
  if (h.lock) {
    rows.push(el('div', { class: 'metric-sub', text: `${t('apt е зает в момента')} — ${t('изчакай да свърши')}` }));
  }
  const fixes = [];
  if (broken.length) {
    fixes.push(el('button', { class: 'btn btn-warn btn-sm', text: '🔧 Довърши прекъснатия dpkg',
      onclick: () => confirm('Пускам dpkg --configure -a?') && runJob('/updates/dpkg-repair', {}, 'dpkg --configure -a') }));
  }
  if (k?.removable?.length) {
    fixes.push(el('button', { class: 'btn btn-warn btn-sm', text: `🧹 Изчисти ${k.removable.length} стари ядра`,
      onclick: () => confirm(`Махам ${k.removable.length} стари ядра? Текущото и най-новото се ПАЗЯТ.`)
        && runJob('/updates/kernel-clean', {}, 'Чистене на стари ядра') }));
  }
  const blocked = (boot && !boot.enoughForKernel) || broken.length;
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Може ли да се обновява' }),
      pill(blocked ? 'bad' : 'ok', blocked ? 'блокирано' : 'нищо не блокира'),
    ]),
    rows,
    fixes.length ? el('div', { class: 'toolbar' }, fixes) : null,
  ]);
}

async function renderUpdates() {
  const view = document.getElementById('view');
  const [data, health] = await Promise.all([api('/updates'), api('/updates/health').catch(() => null)]);
  view.innerHTML = '';
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn', text: '⟳ apt update', onclick: () => runJob('/updates/refresh', {}, 'apt update') }),
      el('button', { class: 'btn btn-warn', text: '⬆ Security ъпдейти', onclick: () => confirm('Инсталирам security ъпдейтите?') && runJob('/updates/upgrade', { security: true }, 'Security upgrade') }),
      el('button', { class: 'btn btn-warn', text: '⬆ Всички ъпдейти', onclick: () => confirm('Пълен apt upgrade?') && runJob('/updates/upgrade', {}, 'apt upgrade') }),
    ])
  );
  if (data.rebootRequired) view.appendChild(el('div', { class: 'toast warn', style: 'position:static;margin-bottom:14px', text: '⚠ Нужен е рестарт след последните ъпдейти.' }));
  const hc = aptHealthCard(health);
  if (hc) view.appendChild(hc);
  if (!data.available) {
    view.appendChild(el('div', { class: 'empty', text: 'apt недостъпен на този сървър.' }));
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text: `${plural(data.packages.length, 'пакет', 'пакета')} за ъпдейт` }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Пакет', 'Текуща', 'Нова', 'Канал'], data.packages.map((p) =>
        el('tr', {}, [
          el('td', { class: 'mono', text: p.name }),
          el('td', { class: 'muted mono', text: p.current || '—' }),
          el('td', { class: 'mono', text: p.candidate || '—' }),
          el('td', { class: 'muted', text: p.channel || '' }),
        ])
      )),
    ])
  );
}

// ── Сигурност ───────────────────────────────────────────────────────────────────────
async function renderSecurity() {
  const view = document.getElementById('view');
  const [s, post] = await Promise.all([api('/security'), api('/security/posture').catch(() => null)]);
  view.innerHTML = '';

  // ── Оценка ──
  // Целта е не число, а списък от конкретни поправки. Затова всяка находка носи
  // командата за оправяне — оценка без „ето как" е само чувство за вина.
  if (post) {
    const kind = post.score >= 90 ? 'ok' : post.score >= 60 ? 'warn' : 'bad';
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:16px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: 'Оценка за сигурност' }),
          pill(kind, `${post.score}/100 · ${post.grade}`),
        ]),
        barEl(post.score),
        el('div', { class: 'metric-sub', text: `${post.problems.length} находки от ${plural(post.checks, 'проверка', 'проверки')}. ${post.note}` }),
        ...post.problems.map((p) =>
          el('div', { class: 'finding', style: 'margin-top:10px;padding-left:10px;border-left:3px solid var(--' + (p.severity === 'critical' ? 'danger' : p.severity === 'high' ? 'warn' : 'txt-dim') + ')' }, [
            el('div', {}, [pill(p.severity === 'critical' ? 'bad' : p.severity === 'high' ? 'warn' : 'dim', p.severity), document.createTextNode(' '), el('strong', { text: p.title })]),
            el('div', { class: 'metric-sub', text: p.why }),
            p.fix ? el('div', { class: 'mono metric-sub', text: '→ ' + p.fix }) : '',
            p.note ? el('div', { class: 'metric-sub', style: 'color:var(--warn)', text: '⚠ ' + p.note }) : '',
          ])
        ),
        post.good.length
          ? el('div', { class: 'metric-sub', style: 'margin-top:12px', text: 'Наред: ' + post.good.map((g) => g.title).join(' · ') })
          : '',
      ])
    );
  }

  view.appendChild(
    el('div', { class: 'toolbar', style: 'margin-bottom:12px' }, [
      el('button', { class: 'btn btn-sm', text: '⛨ Целост на /etc', onclick: () => go('integrity') }),
      el('button', { class: 'btn btn-sm', text: '⛔ fail2ban', onclick: () => go('fail2ban') }),
      el('button', { class: 'btn btn-sm', text: '🔑 Достъп по IP', onclick: () => go('access') }),
    ])
  );

  view.appendChild(
    el('div', { class: 'grid grid-2' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'TLS сертификати' }),
        s.certs && s.certs.length
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['Домейн', 'Изтича', 'Дни'], s.certs.map((c) =>
                el('tr', {}, [
                  el('td', { class: 'mono', text: c.domain }),
                  el('td', { class: 'muted', text: fmtWhen(c.expiresAt) }),
                  el('td', {}, [pill(c.daysLeft > 20 ? 'ok' : c.daysLeft > 7 ? 'warn' : 'bad', `${plural(c.daysLeft ?? '?', 'ден', 'дни')}`)]),
                ])
              )),
            ])
          : el('div', { class: 'empty', text: 'Няма Let’s Encrypt сертификати.' }),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'SSH' }),
        s.ssh
          ? kv({ 'Root вход': s.ssh.permitRootLogin, 'Парола': s.ssh.passwordAuthentication, Порт: s.ssh.port })
          : el('div', { class: 'muted', text: 'sshd -T недостъпен' }),
      ]),
    ])
  );
  view.appendChild(
    el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      // Тук стоеше същата таблица „адрес + процес". Две места, които показват едно
      // и също нещо, значи едното ще остарее — а по-слабото се чете по-често.
      el('div', { class: 'card' }, [
        el('h3', { text: 'Отворени портове' }),
        // Без брояч: тук четенето е само през `ss` и на машина без iproute2 показва
        // „0 слушащи сокета" при отворени портове. Грешното число е по-лошо от никое.
        el('div', { class: 'metric-sub', text:
          '„Адрес + процес" не отговаря на въпроса, който има значение — достъпен ли е портът отвън. ' +
          'Това е сечение с правилата на стената и живее в секция „Портове".' }),
        el('div', { class: 'toolbar' }, [
          el('button', { class: 'btn btn-sm', text: '→ Карта на изложеността', onclick: () => go('ports') }),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Firewall (ufw)' }),
        el('pre', { class: 'term-out', style: 'max-height:180px', text: s.ufw || 'ufw недостъпен' }),
        el('h3', { text: 'fail2ban', style: 'margin-top:10px' }),
        el('pre', { class: 'term-out', style: 'max-height:120px', text: s.fail2ban || 'fail2ban недостъпен' }),
      ]),
    ])
  );
  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: 'Последни входове' }),
      el('pre', { class: 'term-out', style: 'max-height:220px', text: (s.lastLogins || []).join('\n') || '—' }),
    ])
  );
}

// ── Бекъпи ────────────────────────────────────────────────────────────────────────
// График на бекъпа + копие извън машината.
//
// Дотук панелът СЛЕДЕШЕ бекъпа, но не го ПРАВЕШЕ: вдигаше критична аларма за
// проблем, който сам може да реши, и чакаше човек да щракне. А всичко живееше на
// същия диск — мъртъв диск взема и бекъпите.
function scheduleCard(sch) {
  const enabled = el('input', { type: 'checkbox' });
  enabled.checked = Boolean(sch.enabled);
  const atHour = el('input', { type: 'number', min: '0', max: '23', value: String(sch.atHour), style: 'width:80px' });
  const everyHours = el('input', { type: 'number', min: '1', max: '720', value: String(sch.everyHours), style: 'width:90px' });
  const offsite = el('input', { type: 'checkbox' });
  offsite.checked = Boolean(sch.offsite?.enabled);

  const last = sch.lastResult;
  const kind = !sch.enabled ? 'warn' : last && !last.ok ? 'bad' : sch.lastOkAt ? 'ok' : 'warn';

  const save = el('button', { class: 'btn btn-primary btn-sm', text: 'Запиши' });
  save.onclick = async () => {
    save.disabled = true;
    try {
      await api('/backups/schedule', {
        method: 'POST',
        body: {
          enabled: enabled.checked,
          atHour: Number(atHour.value),
          everyHours: Number(everyHours.value),
          offsiteEnabled: offsite.checked,
        },
      });
      toast('Графикът е записан');
      go('backups');
    } catch (e) {
      toast(e.message, 'bad');
      save.disabled = false;
    }
  };

  const peers = sch.offsite?.peers || [];
  const received = sch.offsite?.received || [];

  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'График и копие извън машината' }),
      pill(kind, !sch.enabled ? 'само ръчно' : last && !last.ok ? 'последният се провали' : sch.lastOkAt ? 'работи' : 'още не е пускан'),
    ]),
    el('div', { class: 'metric-sub', text:
      'Часът е фиксиран (нощем), а не „на всеки 24 часа от последния път" — иначе бекъпът пълзи през деня и някой ден ' +
      'пада върху деплой. Първото пускане чака нощния час нарочно; изпуснат час (спрян панел) се ДОГОНВА.' }),
    el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
      el('label', { class: 'inline' }, [enabled, el('span', { text: ' включен' })]),
      el('label', { class: 'inline' }, [el('span', { text: 'в час ' }), atHour]),
      el('label', { class: 'inline' }, [el('span', { text: 'на всеки ' }), everyHours, el('span', { text: ' ч.' })]),
      el('span', { class: 'grow' }),
      el('button', {
        class: 'btn btn-sm', text: '▶ Пусни сега',
        onclick: async () => {
          try { await api('/backups/schedule/run', { method: 'POST' }); toast('Бекъпът тръгна — виж „Задачи"'); }
          catch (e) { toast(e.message, 'bad'); }
        },
      }),
      save,
    ]),
    last
      // Сглобен от ПРЕВЕДЕНИ части: цялото изречение никога не е ключ (носи и
      // причина от сървъра), но всяка частица е.
      ? el('div', { class: 'metric-sub', style: last.ok ? '' : 'color:var(--danger)', text:
          `${t('Последно:')} ${t(fmtWhen(last.ts))} · ${last.ok ? t('успех') : t(`ПРОВАЛ (изход ${last.code ?? '?'})`)}` +
          `${last.reason ? ` · ${t(last.reason)}` : ''}` })
      : el('div', { class: 'metric-sub', text: 'Още не е пускан през графика.' }),

    el('h3', { text: 'Копие на другия VPS (3-2-1)', style: 'margin-top:16px' }),
    el('div', { class: 'metric-sub', text:
      'Бекъп на същия диск не е бекъп: мъртъв диск взема и него, а компрометиран root го трие заедно с одита. ' +
      'Изнасянето иска https — дъмпът е ЦЯЛАТА база (за medqr медицински данни), по открит текст не пътува дори ' +
      'през частната мрежа на хостера.' }),
    el('div', { class: 'toolbar' }, [
      el('label', { class: 'inline' }, [offsite, el('span', { text: ' изнасяй навън' })]),
      el('span', { class: 'grow' }),
      el('button', {
        class: 'btn btn-sm', text: '⇪ Изнеси сега',
        onclick: async () => {
          try {
            const r = await api('/backups/offsite/now', { method: 'POST' });
            for (const x of r.results || []) {
              if (!x.ok) toast(`${x.peer}: ${x.error}`, 'bad');
              else toast(`${x.peer}: изнесени ${x.sent.length}${x.skipped?.length ? `, пропуснати ${x.skipped.length}` : ''}`);
            }
            go('backups');
          } catch (e) { toast(e.message, 'bad'); }
        },
      }),
    ]),
    peers.length
      ? el('div', { class: 'table-wrap' }, [
          tableEl(['Възел', 'Транспорт', 'Изнесени', 'Последно'], peers.map((p) =>
            el('tr', {}, [
              el('td', { text: p.id }),
              el('td', {}, [pill(p.tls ? 'ok' : 'bad', p.tls ? 'https' : 'открит текст — отказвам')]),
              el('td', { text: String(p.shipped) }),
              el('td', { class: 'muted', text: p.lastAt ? fmtWhen(p.lastAt) : '—' }),
            ])
          )),
        ])
      : el('div', { class: 'empty', text: 'Няма конфигурирани peer-и — няма къде да се изнесе.' }),
    received.length
      ? el('div', {}, [
          el('h3', { text: 'Получени копия от други възли', style: 'margin-top:14px' }),
          el('div', { class: 'metric-sub', text:
            'Пазят се ОТДЕЛНО от собствените снимки: смесени в една папка, чуждият дъмп става „най-новият бекъп" ' +
            'на тази машина и гаси алармата за остарял СОБСТВЕН бекъп.' }),
          el('div', { class: 'table-wrap' }, [
            tableEl(['Възел', 'Файлове', 'Общо', 'Най-нов'], received.map((n) =>
              el('tr', {}, [
                el('td', { text: n.node }),
                el('td', { text: String(n.count) }),
                el('td', { text: fmtBytes(n.totalBytes) }),
                el('td', { class: 'muted', text: n.newest ? `${n.newest.name} · ${fmtWhen(n.newest.mtime)}` : '—' }),
              ])
            )),
          ]),
        ])
      : '',
  ]);
}

// Възстановяване на том/папка от архив. Бекъп, който не можеш да върнеш от
// панела, е половин бекъп — досега това беше „SSH и се оправяй".
function volumeRestoreCard(archives, vols) {
  const out = el('div', {});
  const bindTargets = new Map();
  for (const i of vols?.items || []) {
    if (i.type === 'bind' && i.source) bindTargets.set(i.source, i.source);
  }

  const restore = async (a) => {
    let target = null;
    if (a.kind === 'dir') {
      // Целта се доказва по хеша в името — тук само я избираме/въвеждаме.
      target = prompt(
        'Път на папката, върху която се възстановява.\nХешът в името на архива трябва да съвпадне — грешна цел се отказва:',
        [...bindTargets.keys()][0] || '/opt/'
      );
      if (!target) return;
    }
    const ok = await confirmDanger({
      title: `Възстановяване от ${a.name}`,
      what: [
        a.kind === 'volume' ? `Том „${a.volume}" се ИЗПРАЗВА и върху него се излива архивът.` : `Папка „${target}" се ИЗПРАЗВА и върху нея се излива архивът.`,
        'Първо се прави защитна снимка на ТЕКУЩОТО състояние — при провал вериганата се връща сама.',
        'Контейнерите, които ползват целта, се спират и се пускат отново автоматично (trap).',
        'Файлове, създадени СЛЕД архива, ще изчезнат (те са в защитната снимка).',
      ],
      expect: a.kind === 'volume' ? a.volume : 'възстанови',
      confirmLabel: 'Възстанови',
      delayMs: 2000,
    });
    if (!ok) return;
    runJob('/volumes/restore/apply', { name: a.name, target }, `Възстановяване: ${a.name}`);
  };

  out.appendChild(
    el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: 'Възстановяване на томове и папки' }),
        pill('dim', `${plural(archives.length, 'архив', 'архива')}`),
      ]),
      el('div', { class: 'metric-sub', text:
        'Две стъпки, като при базите: „преглед" показва съдържанието, без да пипа нищо; „възстанови" прави защитна ' +
        'снимка на текущото, ИЗПРАЗВА целта (иначе файлове отпреди и след архива се смесват — урокът от WAL/SHM) и ' +
        'разархивира, с автоматичен откат при провал. За папки целта се ДОКАЗВА по хеша в името на архива.' }),
      el('div', { class: 'table-wrap' }, [
        tableEl(['Архив', 'Цел', 'Размер', 'От', ''], archives.map((a) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: a.name }),
            el('td', { class: 'muted', text: a.kind === 'volume' ? `том ${a.volume}` : 'папка (доказва се по хеш)' }),
            el('td', { text: fmtBytes(a.sizeBytes) }),
            el('td', { class: 'muted', text: fmtWhen(a.mtime) }),
            el('td', {}, [
              el('div', { class: 'toolbar', style: 'margin:0' }, [
                el('button', {
                  class: 'btn btn-sm', text: '⊙ Преглед',
                  onclick: () => runJob('/volumes/restore/preview', { name: a.name }, `Преглед: ${a.name}`),
                }),
                el('button', { class: 'btn btn-danger btn-sm', text: '↩ Възстанови', onclick: () => restore(a) }),
              ]),
            ]),
          ])
        )),
      ]),
    ])
  );
  return out;
}

// Бекъпът на САМИЯ панел: конфигът (тайните) + паметта (одит, базови линии,
// история). Иронията, която това затваря: панелът пазеше всичко освен себе си.
function panelBackupCard(panel) {
  const out = el('div', { style: 'margin-top:12px' });
  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Бекъп на самия панел' }),
      pill(panel.backups.length ? 'ok' : 'warn', panel.backups.length ? `${plural(panel.backups.length, 'архив', 'архива')}` : 'още няма'),
    ]),
    el('div', { class: 'metric-sub', text:
      'Конфигът (паролата, peer токенът, каналите — тайни, които не съществуват никъде другаде) и паметта на панела ' +
      '(одит, базови линии, история) влизат в нощния бекъп като ШИФРИРАН архив и пътуват към другия VPS. ' +
      'Ключът е в конфига — а конфигът е вътре в архива: при мъртъв диск ключът загива с него. ' +
      'ЗАТОВА го препиши извън тази машина (мениджър на пароли) — без него offsite копието е нечетимо.' }),
    panel.backups.length
      ? el('div', { class: 'metric-sub', text:
          `Най-нов: ${panel.backups[0].name} · ${fmtBytes(panel.backups[0].sizeBytes)} · ${fmtWhen(panel.backups[0].mtime)}` })
      : el('div', { class: 'metric-sub', text: 'Ще се появи при следващия нощен бекъп (или „Пусни сега" отгоре).' }),
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-sm', text: '🔑 Покажи ключа (запиши го)',
        onclick: async () => {
          try {
            const r = await api('/backups/panel/key', { method: 'POST' });
            out.innerHTML = '';
            out.appendChild(el('div', { class: 'metric-sub', style: 'color:var(--warn)', text:
              '⚠ Препиши този ключ в мениджър на пароли ИЗВЪН машината. Показването е одитирано.' }));
            out.appendChild(el('pre', { class: 'term-out', style: 'max-height:60px', text: r.key }));
          } catch (e) { toast(e.message, 'bad'); }
        },
      }),
      el('button', {
        class: 'btn btn-sm', text: '⛑ Как се възстановява',
        onclick: () => {
          out.innerHTML = '';
          out.appendChild(el('div', { class: 'metric-sub', text:
            'Възстановяването е СЪЗНАТЕЛНО ръчно — то презаписва тайните на живия панел. От терминала:' }));
          out.appendChild(el('pre', { class: 'term-out', style: 'max-height:200px', text: panel.restore }));
        },
      }),
    ]),
    out,
  ]);
}

async function renderBackups() {
  const view = document.getElementById('view');
  const [b, h, vols, sch, archives] = await Promise.all([
    api('/backups'),
    api('/backups/health').catch(() => null),
    api('/volumes').catch(() => null),
    api('/backups/schedule').catch(() => null),
    api('/volumes/archives').catch(() => []),
  ]);
  view.innerHTML = '';

  // Двата тихи провала на бекъпите: спрял е (никой не забелязва липсата на файл)
  // и е боклук (файлът е там, но не се възстановява). Затова здравето е най-горе.
  if (h) {
    const age = h.backup || {};
    const ageKind = !age.hasBackup ? 'bad' : age.suspiciouslySmall ? 'bad' : age.ageDays > h.maxAgeDays ? 'warn' : 'ok';
    const drillKind = !h.lastOkAt ? 'warn' : h.lastResult && !h.lastResult.ok ? 'bad' : 'ok';
    view.appendChild(
      el('div', { class: 'grid grid-2', style: 'margin-bottom:16px' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: 'Възраст на бекъпа' }),
            pill(ageKind, age.hasBackup ? `${plural(age.ageDays, 'ден', 'дни')}` : 'НЯМА'),
          ]),
          el('div', { class: 'metric-sub', text: age.hasBackup
            ? `Най-нов: ${age.newest} · ${fmtBytes(age.sizeBytes)} · ${fmtWhen(age.at)}`
            : 'В папката с дъмпове няма нищо. Спрял крон не вдига грешка сам — затова се следи възрастта.' }),
          el('div', { class: 'metric-sub', text: `Праг за аларма: ${plural(h.maxAgeDays, 'ден', 'дни')}.` }),
          age.suspiciouslySmall
            ? el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: '⚠ Файлът е практически празен — по-опасно от липсващ, защото изглежда като успех.' })
            : '',
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: 'Проба за възстановяване' }),
            pill(drillKind, h.lastOkAt ? `преди ${plural(h.lastOkAgeDays, 'ден', 'дни')}` : 'никога'),
          ]),
          el('div', { class: 'metric-sub', text:
            'Бекъп, който никога не си възстановявал, е обещание, не гаранция. Пробата разопакова най-новия дъмп в /tmp, ' +
            'проверява целостта и брои таблиците — живото остава недокоснато.' }),
          el('div', { class: 'metric-sub', text: `Каданс: на ${plural(h.drillIntervalDays, 'ден', 'дни')}${h.due ? ' · дължи се сега' : ''}.` }),
          h.lastResult && !h.lastResult.ok
            ? el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: `⚠ Последната проба се провали (${fmtWhen(h.lastResult.ts)}).` })
            : '',
          el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
            el('button', {
              class: 'btn btn-sm', text: '▶ Пробвай сега',
              onclick: () => runJob('/backups/drill', {}, 'Проба за възстановяване'),
            }),
          ]),
          h.history?.length
            ? el('div', { class: 'table-wrap', style: 'margin-top:10px' }, [
                tableEl(['Кога', 'Резултат', 'Дъмп'], h.history.map((e) =>
                  el('tr', {}, [
                    el('td', { class: 'muted', text: fmtWhen(e.ts) }),
                    el('td', {}, [pill(e.ok ? 'ok' : 'bad', e.ok ? 'мина' : `изход ${e.code ?? '?'}`)]),
                    el('td', { class: 'mono', text: e.dump || '—' }),
                  ])
                )),
              ])
            : '',
        ]),
      ])
    );
  }

  if (sch) view.appendChild(scheduleCard(sch));
  const panel = await api('/backups/panel').catch(() => null);
  if (panel) view.appendChild(panelBackupCard(panel));

  // Томовете са отделна секция, защото са отделна ДУПКА: pg_dump хваща базата,
  // но записът в нея сочи към файл в том „uploads", който не се архивира никъде.
  // При възстановяване получаваш цели данни и счупени препратки.
  if (vols?.available && vols.items.length) {
    const worth = vols.items.filter((i) => !i.skip);
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:16px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: 'Томове и качени файлове' }),
          pill(worth.length ? 'warn' : 'ok', `${worth.length} за архивиране`),
        ]),
        el('div', { class: 'metric-sub', text:
          'Дъмпът на базата НЕ покрива тези томове. Ако продукт пази качени файлове в том, при възстановяване ще имаш ' +
          'записи в базата, сочещи към несъществуващи файлове. Базите се пропускат нарочно — за тях логическият дъмп е ' +
          'последователен, а суров tar на жива база не е.' }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Том / папка', 'Вид', 'Размер', 'Ползва се от', ''], vols.items.map((i) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: i.name || i.source }),
              el('td', { class: 'muted', text: i.type === 'volume' ? 'том' : 'папка' }),
              el('td', { text: i.sizeBytes != null ? fmtBytes(i.sizeBytes) : '—' }),
              el('td', { class: 'muted', text: i.containers.join(', ') }),
              el('td', {}, [
                i.skip
                  ? el('span', { class: 'muted', text: i.skip })
                  : el('button', {
                      class: 'btn btn-sm', text: '⇩ Архивирай',
                      onclick: () => runJob('/volumes/backup', { id: i.id }, `Архив ${i.name || i.source}`),
                    }),
              ]),
            ])
          )),
        ]),
        worth.length
          ? el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
              el('button', {
                class: 'btn btn-primary', text: `⇩ Архивирай всички (${worth.length})`,
                onclick: () => runJob('/volumes/backup', { all: true }, 'Архив на томовете'),
              }),
            ])
          : '',
      ])
    );
  }

  if (archives.length) view.appendChild(volumeRestoreCard(archives, vols));

  view.appendChild(el('p', { class: 'section-desc', text: 'Открити бекъп папки + история на releases (за rollback).' }));
  if (!b.spots.length) view.appendChild(el('div', { class: 'empty', text: 'Няма известни бекъп папки на този VPS.' }));
  for (const spot of b.spots) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:14px' }, [
        el('h3', { text: spot.dir }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Име', 'Размер', 'Променен'], spot.files.map((f) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: (f.isDir ? '📁 ' : '') + f.name }),
              el('td', { text: f.isDir ? '—' : fmtBytes(f.sizeBytes) }),
              el('td', { class: 'muted', text: fmtWhen(f.mtime) }),
            ])
          )),
        ]),
      ])
    );
  }
  view.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Releases (за rollback)' }),
      el('div', { class: 'crumbs', text: (b.releases || []).slice(0, 15).join('  ·  ') || '—' }),
    ])
  );
}

// ── Крон ──────────────────────────────────────────────────────────────────────────
async function renderCron() {
  const view = document.getElementById('view');
  const [c, timers, jobs] = await Promise.all([
    api('/cron'),
    api('/cron/timers').catch((e) => ({ available: false, reason: e.message, timers: [] })),
    api('/cron/jobs').catch(() => ({ jobs: [] })),
  ]);
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text:
    '„Пусни сега" стартира услугата зад таймера — не чакаш до 3 сутринта, за да разбереш дали задачата работи. ' +
    'Колоната „Последно" показва РЕЗУЛТАТА от последното пускане, а историята — изхода точно от него (не последните редове наслуки).' }));

  const detail = el('div', { id: 'cron-detail', style: 'margin-top:16px' });

  view.appendChild(
    el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('h3', { text: 'systemd таймери' }),
      // Празна таблица при липсващ systemctl изглежда точно като „няма нито един
      // таймер" — а това са противоположни неща. Първото значи, че панелът е
      // СЛЯП за целия слой планирани задачи (бекъпи, сертификати, чистене).
      timers.available === false
        ? el('div', { class: 'empty', text: `Не мога да проверя: ${timers.reason || 'systemctl не отговори'}.` })
        : el('div', { class: 'table-wrap' }, [
        tableEl(['Таймер', 'Активира', 'Следващо', 'Последно', 'Резултат', ''], (timers.timers || []).map((tm) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: tm.unit }),
            el('td', { class: 'muted', text: tm.activates || '—' }),
            el('td', { text: tm.next || '—' }),
            el('td', { class: 'muted', text: tm.last || '—' }),
            el('td', {}, [
              tm.ok == null
                ? el('span', { class: 'muted', text: '—' })
                : pill(tm.ok ? 'ok' : 'bad', tm.ok ? 'успех' : `${tm.result}${tm.exitStatus ? ' (' + tm.exitStatus + ')' : ''}`),
            ]),
            el('td', {}, [
              el('button', {
                class: 'btn btn-sm', text: '▶ Пусни сега',
                onclick: async (e) => {
                  // Планираната задача може да е бекъп, миграция или чистене —
                  // пускането ѝ извън реда си не е репетиция, а истинско пускане.
                  if (!(await confirmDanger({
                    title: `Пускане на ${tm.unit}`,
                    what: ['Задачата се изпълнява СЕГА, наистина — не е проба.',
                      'Ако е бекъп или чистене, ще направи точно каквото прави в 3 сутринта.'],
                    expect: 'пусни',
                    confirmLabel: 'Пусни',
                  }))) return;
                  e.target.disabled = true;
                  try {
                    const r = await api('/cron/run', { method: 'POST', body: { unit: tm.unit } });
                    toast(r.note, 'ok');
                    setTimeout(() => showTimerHistory(tm.unit, detail), 3000);
                  } catch (err) { toast(err.message, 'bad'); }
                  e.target.disabled = false;
                },
              }),
              el('button', { class: 'btn btn-sm', text: '☰ История', onclick: () => showTimerHistory(tm.unit, detail) }),
            ]),
          ])
        )),
      ]),
    ])
  );
  view.appendChild(detail);

  // ── root crontab: редакция ──
  const sched = el('input', { type: 'text', placeholder: '0 3 * * *  или  @daily', class: 'mono', style: 'min-width:170px' });
  const cmd = el('input', { type: 'text', placeholder: '/usr/local/bin/backup.sh', class: 'mono', style: 'min-width:320px' });
  const note = el('input', { type: 'text', placeholder: 'коментар (по избор)' });

  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: 'root crontab' }),
      jobs.available === false
        ? el('div', { class: 'metric-sub', text: 'На тази машина няма инсталиран cron — работи се само със systemd таймери.' })
        : '',
      el('div', { class: 'table-wrap' }, [
        tableEl(['Разписание', 'Команда', ''], (jobs.jobs || []).map((j) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: j.schedule }),
            el('td', { class: 'mono', text: j.command }),
            el('td', {}, [
              el('button', {
                class: 'btn btn-sm btn-danger', text: 'Изтрий',
                onclick: async () => {
                  const ok = await confirmDanger({
                    title: 'Изтриване на планирана задача',
                    what: [`${j.schedule} ${j.command}`, 'Няма стъпка „сигурен ли си" в cron — задачата спира веднага.'],
                    expect: 'изтрий',
                    confirmLabel: 'Изтрий реда',
                  });
                  if (!ok) return;
                  try {
                    await api('/cron/remove', { method: 'POST', body: { index: j.index } });
                    toast('Редът е изтрит', 'ok');
                    renderCron();
                  } catch (e) { toast(e.message, 'bad'); }
                },
              }),
            ]),
          ])
        )),
      ]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        sched,
        cmd,
        note,
        el('button', {
          class: 'btn btn-primary', text: '+ Добави задача',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              await api('/cron/add', {
                method: 'POST',
                body: { schedule: sched.value, command: cmd.value, comment: note.value },
              });
              toast('Задачата е добавена', 'ok');
              renderCron();
            } catch (err) { toast(err.message, 'bad'); }
            e.target.disabled = false;
          },
        }),
      ]),
      el('div', { class: 'metric-sub', text:
        'В crontab „%" значи нов ред — за дати пиши date +\\%F, иначе задачата тихо не работи. Разписанието е 5 полета: минута час ден месец седмица.' }),
    ])
  );

  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: '/etc/crontab (само преглед)' }),
      el('pre', { class: 'term-out', text: (c.etcCrontab || []).join('\n') || '(празен)' }),
    ])
  );
}

async function showTimerHistory(unit, container) {
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'metric-sub', text: 'Чета историята…' }));
  try {
    const h = await api('/cron/history?unit=' + encodeURIComponent(unit));
    container.innerHTML = '';
    container.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: h.unit }),
          pill(h.ok ? 'ok' : h.result ? 'bad' : 'warn', h.result || 'без данни'),
        ]),
        kv({
          Резултат: h.result || '—',
          'Код на изход': h.exitStatus ?? '—',
          Състояние: h.activeState || '—',
          Стартирано: h.startedAt || '—',
          Приключило: h.finishedAt || '—',
          Рестарти: h.restarts,
        }),
        el('pre', { class: 'log-out', text: h.output || '(няма изход от последното пускане)' }),
      ])
    );
  } catch (e) {
    container.innerHTML = '';
    toast(e.message, 'bad');
  }
}

// ── Разследване ───────────────────────────────────────────────────────────────────
// Въпросът при инцидент не е „колко е процесорът", а „КАКВО СЕ ПРОМЕНИ". Тук
// метриките, одитът, деплоите и задачите стоят на една времева линия около
// момента. Съвпадение по време ≠ причина — това е написано и на екрана.
async function renderInvestigate(at = null, windowMin = 30) {
  const view = document.getElementById('view');
  const params = new URLSearchParams({ window: String(windowMin) });
  if (at) params.set('at', at);
  const d = await api('/investigate?' + params);
  view.innerHTML = '';

  const when = el('input', { type: 'datetime-local', value: toLocalInput(d.at), 'aria-label': 'Момент за разследване' });
  const win = el('select', { 'aria-label': 'Прозорец във времето' }, [15, 30, 60, 180, 720].map((m) =>
    el('option', { value: String(m), text: m < 60 ? `± ${m} мин` : `± ${m / 60} ч`, selected: m === d.windowMin })
  ));
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted', text: 'Момент:' }),
      when,
      win,
      el('button', { class: 'btn btn-sm', text: 'Покажи', onclick: () => renderInvestigate(fromLocalInput(when.value), Number(win.value)) }),
      el('button', { class: 'btn btn-sm', text: '⌕ Намери сам', onclick: () => renderInvestigate(null, Number(win.value)) }),
      el('button', { class: 'btn btn-sm', text: '⟲ Сега', onclick: () => renderInvestigate(new Date().toISOString(), Number(win.value)) }),
    ])
  );

  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:12px' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: d.autoDetected ? 'Автоматично намерен момент' : 'Избран момент' }),
        d.auto && d.auto.corroborated.length > 1
          ? pill('warn', `${d.auto.corroborated.length} серии заедно`)
          : d.autoDetected ? pill('warn', d.auto.label) : pill('dim', 'ръчно'),
      ]),
      el('div', { class: 'metric-sub', text: d.summary }),
    ])
  );

  // Графика с всички серии + маркери за събитията.
  const cv = el('canvas', { class: 'chart-big', id: 'inv-chart', style: 'width:100%;height:220px;display:block' });
  const tip = el('div', { class: 'chart-tip', id: 'inv-tip', style: 'display:none' });
  view.appendChild(el('div', { class: 'card', style: 'margin-top:12px;position:relative' }, [
    el('h3', { text: 'Метрики около момента' }),
    cv,
    tip,
    el('div', { class: 'metric-sub', text: 'Вертикалната линия е моментът. Точките отдолу са събития — мини с мишката по графиката за стойности.' }),
  ]));
  drawInvestigateChart(cv, tip, d);

  view.appendChild(
    el('div', { class: 'table-wrap', style: 'margin-top:12px' }, [
      tableEl(['Кога', 'Какво', 'Действие', 'Детайл'], d.events.map((e) =>
        el('tr', { class: e.before ? 'row-before' : '' }, [
          el('td', { class: e.before ? 'mono' : 'mono muted', text: e.when }),
          el('td', {}, [pill(
            e.kind === 'аларма' ? 'bad' : e.kind === 'деплой' ? 'warn' : e.failed ? 'bad' : e.kind === 'възстановено' ? 'ok' : 'dim',
            e.kind
          )]),
          el('td', { class: 'mono', text: e.title }),
          el('td', { class: 'muted', text: [e.detail, e.user && `от ${e.user}`].filter(Boolean).join(' · ') || '—' }),
        ])
      )),
    ])
  );
  if (d.events.length) {
    view.appendChild(el('p', { class: 'section-desc', text:
      'Редовете ПРЕДИ момента са уликите — те са могли да го причинят. Редовете след него обикновено са следствие (аларми, рестарти). ' +
      'Панелът не твърди причинност: показва съвпадения и оставя заключението на теб.' }));
  }
}

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Многосерийна графика с hover. Нула библиотеки — същият подход като sparkline,
// но с оси, легенда и маркер за момента.
function drawInvestigateChart(cv, tip, d) {
  const series = Object.entries(d.series).filter(([, s]) => s.points.length > 1);
  const colors = { cpu: '#3ddc97', memory: '#6ea8fe', disk: '#ffb454', load: '#ff6b81' };
  const center = new Date(d.at).getTime();
  const half = d.windowMin * 60000;
  const from = center - half;
  const to = center + half;

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 800;
    const h = cv.clientHeight || 220;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 38, r: 8, t: 10, b: 22 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const x = (t) => pad.l + ((t - from) / (to - from)) * iw;
    // Всички серии са в 0–100 без „натоварване" — него мащабираме по своя максимум,
    // иначе load 2.5 е невидима линия до дъното.
    const loadMax = Math.max(1, ...(d.series.load?.points || []).map((p) => p.y));
    const y = (v, key) => pad.t + ih - (Math.min(1, (key === 'load' ? v / loadMax : v / 100))) * ih;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (ih / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(w - pad.r, gy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(String(100 - i * 25), 6, gy + 3);
    }

    for (const [key, s] of series) {
      ctx.strokeStyle = colors[key] || '#888';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(x(p.x), y(p.y, key)) : ctx.moveTo(x(p.x), y(p.y, key))));
      ctx.stroke();
    }

    // Моментът.
    ctx.strokeStyle = '#ff6b81';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x(center), pad.t);
    ctx.lineTo(x(center), pad.t + ih);
    ctx.stroke();
    ctx.setLineDash([]);

    // Събитията като точки на дъното — така се вижда „деплой точно тук".
    for (const e of d.events) {
      const ex = x(new Date(e.ts).getTime());
      if (ex < pad.l || ex > w - pad.r) continue;
      ctx.fillStyle = e.kind === 'деплой' ? '#ffb454' : e.kind === 'аларма' || e.failed ? '#ff6b81' : '#6ea8fe';
      ctx.beginPath();
      ctx.arc(ex, pad.t + ih + 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Легенда.
    let lx = pad.l;
    ctx.font = '11px system-ui, sans-serif';
    for (const [key, s] of series) {
      ctx.fillStyle = colors[key] || '#888';
      ctx.fillRect(lx, 2, 8, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(s.label + (key === 'load' ? ` (макс ${loadMax.toFixed(1)})` : ''), lx + 12, 7);
      lx += ctx.measureText(s.label).width + 60;
    }
    return { x, pad, iw, ih, w, h };
  };

  let geom = draw();
  window.addEventListener('resize', () => { geom = draw(); }, { passive: true });

  // Hover: точна стойност на всяка серия в този момент — без него графиката е
  // само форма, а при разследване трябват числа.
  cv.onmousemove = (ev) => {
    const rect = cv.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    if (px < geom.pad.l || px > geom.w - geom.pad.r) return (tip.style.display = 'none');
    const t = from + ((px - geom.pad.l) / geom.iw) * (to - from);
    const rows = [];
    for (const [key, s] of series) {
      let best = null;
      for (const p of s.points) if (!best || Math.abs(p.x - t) < Math.abs(best.x - t)) best = p;
      if (best) rows.push(`${s.label}: ${best.y.toFixed(1)}${s.unit}`);
    }
    const near = d.events
      .filter((e) => Math.abs(new Date(e.ts).getTime() - t) < (to - from) / 40)
      .slice(0, 3)
      .map((e) => `• ${e.kind}: ${e.title}`);
    tip.textContent = [new Date(t).toLocaleTimeString('bg-BG'), ...rows, ...near].join('\n');
    tip.style.display = 'block';
    tip.style.left = Math.min(px + 12, geom.w - 190) + 'px';
    tip.style.top = '28px';
  };
  cv.onmouseleave = () => { tip.style.display = 'none'; };
  // Клик по графиката = „разследвай точно този момент" — най-бързият начин да
  // преместиш прозореца там, където линията се чупи.
  cv.onclick = (ev) => {
    const rect = cv.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    if (px < geom.pad.l || px > geom.w - geom.pad.r) return;
    const t = from + ((px - geom.pad.l) / geom.iw) * (to - from);
    renderInvestigate(new Date(t).toISOString(), d.windowMin);
  };
}

// ── Redis ─────────────────────────────────────────────────────────────────────────
// Числото, което не бива да пропуснеш, е „изхвърлени ключове". При политика
// allkeys-lru и опрян таван Redis прави място, като ТРИЕ — без грешка, без ред в
// лога, без падаща услуга. Ако там стоят сесии или опашки, това е реален отказ.
async function renderRedis() {
  const view = document.getElementById('view');
  const d = await api('/redis');
  view.innerHTML = '';
  if (!d.available) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: d.error || 'Docker не отговаря — Redis се открива през контейнерите.' })]));
    return;
  }
  if (!d.instances.length) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: 'Няма работещ Redis/Valkey контейнер на този сървър.' })]));
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text:
    'При политика „allkeys-lru" и опрян таван Redis освобождава памет, като ТРИЕ ключове — тихо, без грешка и без ред в лога. ' +
    'Затова „изхвърлени ключове" се следи по разлика между проверките: всяко ново изхвърляне е загуба на данни точно сега.' }));

  for (const i of d.instances) {
    if (!i.ok) {
      view.appendChild(el('div', { class: 'card', style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: i.name }), pill('bad', 'недостъпен')]),
        el('div', { class: 'metric-sub', text: i.error }),
      ]));
      continue;
    }
    const memKind = i.memoryPct == null ? 'dim' : i.memoryPct >= 90 ? 'bad' : i.memoryPct >= 70 ? 'warn' : 'ok';
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:14px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: `${i.name} · Redis ${i.version || '?'}` }),
          el('span', {}, [
            pill(memKind, i.memoryPct != null ? `${i.memoryPct}% памет` : i.usedMemoryHuman || '—'),
            document.createTextNode(' '),
            pill(i.persistence === 'НЯМА' ? 'bad' : 'ok', i.persistence),
          ]),
        ]),
        i.maxMemory ? barEl(i.memoryPct || 0) : '',
        kv({
          Памет: `${i.usedMemoryHuman || '—'}${i.maxMemory ? ` от ${Math.round(i.maxMemory / 1048576)} MB` : ' (без таван)'}`,
          Политика: i.policy || '—',
          Ключове: `${i.totalKeys} (${i.keyspace.map((k) => `${k.db}: ${k.keys}`).join(', ') || 'празно'})`,
          'Изхвърлени ключове': i.evictedKeys,
          'Изтекли ключове': i.expiredKeys,
          'Успеваемост на кеша': i.hitRate != null ? `${i.hitRate}%` : '—',
          Клиенти: `${i.connectedClients ?? '—'}${i.blockedClients ? ` (${i.blockedClients} блокирани)` : ''}`,
          'Отказани връзки': i.rejectedConnections,
          'Последна снимка': i.rdbLastSaveTime ? fmtWhen(new Date(i.rdbLastSaveTime * 1000).toISOString()) : '—',
          'Промени след снимка': i.rdbChangesSinceSave ?? '—',
          Том: i.volume ? `${i.volume.name || i.volume.source} (${i.volume.type})` : 'няма /data том',
        }),
        i.evictedKeys > 0
          ? el('div', { class: 'metric-sub', style: 'color:var(--warn)', text:
              `⚠ ${i.evictedKeys} ключа са били изхвърлени от старта. Ако това расте, губиш данни — вдигни maxmemory или намали какво пазиш там.` })
          : '',
        i.persistence === 'НЯМА' && i.totalKeys > 0
          ? el('div', { class: 'metric-sub', style: 'color:var(--danger)', text:
              `⚠ Няма нито AOF, нито RDB — ${i.totalKeys} ключа живеят само в паметта и рестартът ги изтрива.` })
          : '',
        el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
          el('button', {
            class: 'btn btn-sm', text: '💾 Снимка сега (BGSAVE)',
            onclick: () => runJob('/redis/save', { container: i.name }, `BGSAVE ${i.name}`),
          }),
          i.volume?.name
            ? el('button', {
                class: 'btn btn-sm', text: '⇩ Архивирай тома',
                onclick: () => runJob('/volumes/backup', { id: `volume:${i.volume.name}` }, `Архив ${i.volume.name}`),
              })
            : '',
        ]),
      ])
    );
  }
}

// ── Трафик (access log) ───────────────────────────────────────────────────────────
// Журналът казва какво се е оплакало приложението. Този екран казва какво е
// поискал СВЕТЪТ и колко е чакал — без него „сайтът е бавен" няма адрес.
// Месечен трафик срещу квотата на хостера. Дупката е ПАРИЧНА: панелът мереше
// моментните rx/tx и пазеше 7 дни, значи „минавам ли квотата този месец" се
// научаваше от фактурата.
function quotaCard(q) {
  const quota = el('input', { type: 'number', min: '0', max: '10000', step: '0.5', placeholder: 'без квота', style: 'width:120px' });
  if (q.quotaTB != null) quota.value = String(q.quotaTB);
  const dir = el('select', { 'aria-label': 'Посока' }, [
    ['tx', 'изходящ (както таксува Hetzner)'],
    ['rx', 'входящ'],
    ['both', 'двете посоки'],
  ].map(([v, t]) => el('option', { value: v, text: t, selected: q.direction === v ? 'selected' : undefined })));

  const kind = !q.quotaBytes ? 'dim' : q.usedPct >= 100 ? 'bad' : q.usedPct >= 80 || (q.warmedUp && q.projectedPct >= 100) ? 'warn' : 'ok';

  return el('div', { class: 'card', style: 'margin-bottom:16px' }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: `Мрежов трафик за ${q.month} (квота на хостера)` }),
      pill(kind, q.quotaBytes ? `${q.usedPct}% от ${q.quotaTB} TB` : 'без зададена квота'),
    ]),
    el('div', { class: 'grid grid-metrics' }, [
      ['изходящ', q.tx], ['входящ', q.rx], ['брои се', q.used],
    ].map(([label, v]) =>
      el('div', {}, [el('div', { class: 'metric-sub', text: label }), el('div', { class: 'metric-val mono', text: fmtBytes(v) })])
    )),
    q.quotaBytes
      ? el('div', { class: 'metric-sub', text:
          `Изминали ${q.monthFraction}% от месеца, остават ${plural(q.daysLeft, 'ден', 'дни')}. ` +
          (q.warmedUp
            ? `Прогноза за края: ${fmtBytes(q.projected)} (${q.projectedPct}%)` +
              (q.quotaAtDay ? ` · квотата пада на ${q.quotaAtDay}-о число.` : ' · квотата не се стига този месец.')
            : 'Прогнозата МЪЛЧИ през първите 10% от месеца — един ден с деплой и синхронизация на бекъпи не е месечно темпо.') })
      : el('div', { class: 'metric-sub', text: 'Задай квота, за да има с какво да се сравни. Без нея панелът само показва.' }),
    // Честността за обхвата е част от числото, не бележка под линия.
    el('div', { class: 'metric-sub', text:
      `Броят се само физическите интерфейси (${(q.ifaces || []).join(', ') || 'няма'}) — трафикът на контейнер минава ` +
      'и през docker0/veth, и през eth0, значи сборът от всички би броил всеки байт двойно. ' +
      'Месецът е по UTC, както таксува хостерът.' }),
    el('div', { class: 'metric-sub', style: 'color:var(--warn)', text:
      '⚠ Числото е ДОЛНА граница, не отчетът на хостера: спрян панел не брои, а трафикът между последната проба ' +
      `и рестарт се губи. Проби този месец: ${q.samples}${q.counterResets ? ` · открити нулирания на броячи: ${q.counterResets}` : ''}.` }),
    el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
      el('label', { class: 'inline' }, [el('span', { text: 'квота ' }), quota, el('span', { text: ' TB' })]),
      el('label', { class: 'inline' }, [el('span', { text: 'мери ' }), dir]),
      el('span', { class: 'grow' }),
      el('button', {
        class: 'btn btn-primary btn-sm', text: 'Запиши',
        onclick: async () => {
          try {
            await api('/traffic/quota', { method: 'POST', body: { quotaTB: quota.value === '' ? null : Number(quota.value), countDirection: dir.value } });
            toast('Квотата е записана');
            go('traffic');
          } catch (e) { toast(e.message, 'bad'); }
        },
      }),
    ]),
    q.history?.length > 1
      ? el('div', { class: 'table-wrap' }, [
          tableEl(['Месец', 'Изходящ', 'Входящ', 'Проби'], q.history.map((h) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: h.month }),
              el('td', { class: 'mono', text: fmtBytes(h.tx) }),
              el('td', { class: 'mono muted', text: fmtBytes(h.rx) }),
              el('td', { class: 'muted', text: String(h.samples) }),
            ])
          )),
        ])
      : '',
  ]);
}

async function renderTraffic() {
  const view = document.getElementById('view');
  const [d, files, q] = await Promise.all([
    api('/accesslog'),
    api('/accesslog/files').catch(() => ({ files: [] })),
    api('/traffic').catch(() => null),
  ]);
  view.innerHTML = '';
  // Квотата се рисува ПРЕДИ проверката за access log: тя не зависи от nginx, а
  // ранният return иначе я скрива на всяка машина без уеб сървър.
  if (q) view.appendChild(quotaCard(q));
  if (!d.available) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: d.note })]));
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text:
    `${d.total} нови заявки от последния анализ (${d.botPct}% ботове, ${fmtBytes(d.bytes)} трафик). ` +
    'Всяко зареждане чете само НОВОТО — ротацията се разпознава по inode, за да не се броят редове двойно. ' +
    'Адресите са групирани по форма (/order/8123 и /order/9044 са един адрес).' }));
  if (files.files?.length) {
    view.appendChild(el('div', { class: 'metric-sub', style: 'margin-bottom:10px', text:
      'Четени файлове: ' + files.files.map((f) => `${f.path} (${fmtBytes(f.sizeBytes)})`).join(' · ') }));
  }

  if (d.timingHint) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:12px;border-left:3px solid var(--warn)' }, [
        el('strong', { text: '⚠ Логът не съдържа време за заявка' }),
        el('div', { class: 'metric-sub', text: 'Без него „кой адрес е бавен" не може да се отговори. Добави в nginx конфига:' }),
        el('pre', { class: 'term-out', style: 'max-height:110px', text: d.timingHint.replace(/^.*?nginx: /, '') }),
      ])
    );
  }

  const st = d.byStatus || {};
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, [
      ['2xx', 'ok'], ['3xx', 'dim'], ['4xx', 'warn'], ['5xx', 'bad'],
    ].map(([cls, kind]) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: cls }), pill(kind, st[cls] ? String(st[cls]) : '0')]),
        el('div', { class: 'metric-sub', text: d.total ? `${(((st[cls] || 0) / d.total) * 100).toFixed(1)}% от заявките` : '—' }),
      ])
    ))
  );

  const table = (title, rows, extra) =>
    el('div', { style: 'margin-top:20px' }, [
      el('h3', { class: 'muted', text: title, style: 'margin:0 0 8px' }),
      extra ? el('div', { class: 'metric-sub', style: 'margin-bottom:8px', text: extra }) : '',
      el('div', { class: 'table-wrap' }, [
        tableEl(['Адрес', 'Брой', 'p50', 'p95', 'приложение', 'кой бави', 'макс', 'грешки', 'ботове'], rows.map((p) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: `${p.method} ${p.path}` }),
            el('td', { text: String(p.count) }),
            el('td', { class: 'mono', text: p.p50 != null ? `${p.p50}s` : '—' }),
            el('td', { class: 'mono', text: p.p95 != null ? `${p.p95}s` : '—' }),
            // `$upstream_response_time` е само приложението; разликата до
            // `$request_time` е nginx/мрежата/бавният клиент. Без това разделяне
            // всеки бавен адрес изглежда като бавен код и оптимизираш грешното.
            el('td', { class: 'mono', text: p.p95Upstream != null ? `${p.p95Upstream}s` : '—' }),
            el('td', {}, [p.blame ? pill(p.blame === 'приложение' ? 'warn' : p.blame === 'nginx/мрежа' ? 'dim' : 'dim', p.blame) : el('span', { class: 'muted', text: '—' })]),
            el('td', { class: 'mono', text: p.max != null ? `${p.max}s` : '—' }),
            el('td', {}, [p.errorPct ? pill(p.errorPct > 20 ? 'bad' : 'warn', `${p.errorPct}%`) : el('span', { class: 'muted', text: '—' })]),
            el('td', { class: 'muted', text: `${p.botPct}%` }),
          ])
        )),
      ]),
    ]);

  if (d.hasTiming) {
    view.appendChild(table('Най-бавни адреси', d.topBySlow,
      'Подредени по p95, не по средно: средното се удавя от бързите заявки, а потребителят усеща точно опашката. „Кой бави" сравнява времето на приложението (ut=) с общото (rt=) — останалото е nginx, TLS или бавен клиент.'));
  }
  view.appendChild(table('Най-искани адреси', d.topByCount));
  if (d.topByErrors.length) view.appendChild(table('Най-много грешки', d.topByErrors));

  view.appendChild(
    el('div', { class: 'grid grid-2', style: 'margin-top:20px' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'Най-активни адреси' }),
        el('div', { class: 'metric-sub', text: 'IP-тата се показват на живо за сигурност, но НЕ се записват на диска — състоянието пази само отмествания в лога.' }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['IP', 'Заявки', 'Грешки'], d.topIps.map((i) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: i.ip }),
              el('td', { text: String(i.count) }),
              el('td', { text: i.errors ? String(i.errors) : '—' }),
            ])
          )),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Последни 5xx' }),
        d.serverErrors.length
          ? el('pre', { class: 'log-out', style: 'max-height:280px', text: d.serverErrors.map((e) => `${e.ts ? new Date(e.ts).toLocaleTimeString('bg-BG') : '—'}  ${e.status}  ${e.method} ${e.path}`).join('\n') })
          : el('div', { class: 'metric-sub', text: 'няма сървърни грешки в този прозорец' }),
      ]),
    ])
  );
}

// ── Целост на /etc ────────────────────────────────────────────────────────────────
// Това НЕ е откриване на прониквания (root може да пренапише и отпечатъка). Целта
// е много по-честият случай: „вчера работеше, днес не" — кой файл е мръднал.
async function renderIntegrity() {
  const view = document.getElementById('view');
  const d = await api('/security/integrity');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text:
    'Отпечатък на важните файлове в /etc (SSH, sudoers, fstab, systemd units, Nginx sites, cron). ' +
    'Не е антивирус — root може да пренапише и самия отпечатък. Отговаря на въпроса „какво се е променило, откакто работеше".' }));

  const snapBtn = el('button', {
    class: 'btn btn-primary', text: d.hasBaseline ? '↻ Направи нов отпечатък' : '⛨ Направи отпечатък',
    onclick: async () => {
      const ok = !d.hasBaseline || await confirmDanger({
        title: 'Нов отпечатък',
        what: ['Текущото състояние става новата „истина".', 'Ако нещо е било променено без твое знание, промяната ще бъде приета за нормална.'],
        expect: 'отпечатък',
        confirmLabel: 'Направи нов',
      });
      if (!ok) return;
      try {
        const r = await api('/security/integrity/baseline', { method: 'POST' });
        toast(`Отпечатък от ${plural(r.count, 'файл', 'файла')}`, 'ok');
        go('integrity');
      } catch (e) { toast(e.message, 'bad'); }
    },
  });

  if (!d.hasBaseline) {
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'metric-sub', text: d.note }),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [snapBtn]),
    ]));
    return;
  }

  const total = d.added.length + d.removed.length + d.changed.length;
  view.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: `Отпечатък от ${fmtWhen(d.takenAt)} · ${plural(d.tracked, 'файл', 'файла')}` }),
        pill(d.clean ? 'ok' : 'warn', d.clean ? 'няма промени' : `${total} промени`),
      ]),
      d.clean
        ? el('div', { class: 'metric-sub', text: 'Нищо не се е променило от отпечатъка насам.' })
        : el('div', { class: 'table-wrap' }, [
            tableEl(['Какво', 'Файл', 'Детайл'], [
              ...d.changed.map((c) => el('tr', {}, [
                el('td', {}, [pill('warn', c.onlyMode ? 'права' : 'променен')]),
                el('td', { class: 'mono', text: c.path }),
                el('td', { class: 'muted', text: c.onlyMode ? `${c.modeBefore} → ${c.modeAfter}` : `${c.sizeBefore} → ${c.sizeAfter} байта` }),
              ])),
              ...d.added.map((a) => el('tr', {}, [
                el('td', {}, [pill('ok', 'добавен')]),
                el('td', { class: 'mono', text: a.path }),
                el('td', { class: 'muted', text: a.mode }),
              ])),
              ...d.removed.map((r) => el('tr', {}, [
                el('td', {}, [pill('bad', 'изтрит')]),
                el('td', { class: 'mono', text: r.path }),
                el('td', { class: 'muted', text: '—' }),
              ])),
            ]),
          ]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [snapBtn]),
    ])
  );
}

// ── fail2ban ──────────────────────────────────────────────────────────────────────
async function renderFail2ban() {
  const view = document.getElementById('view');
  const d = await api('/security/fail2ban');
  view.innerHTML = '';
  if (!d.available) {
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'metric-sub', text: 'fail2ban не е инсталиран или не отговаря. Инсталирай го с „apt install fail2ban && systemctl enable --now fail2ban".' }),
    ]));
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text:
    'Кой е блокиран и защо. При SSH само с ключове fail2ban не е задължителен — реже шума и спира упорити скенери. ' +
    'Ако сам се заключиш, разблокирането оттук е по-бързо от терминал през конзолата на хостера.' }));
  for (const j of d.jails) {
    view.appendChild(
      el('div', { class: 'card', style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: j.name }),
          pill(j.currentlyBanned ? 'warn' : 'ok', `${j.currentlyBanned} блокирани сега`),
        ]),
        el('div', { class: 'metric-sub', text: `общо блокирани ${j.totalBanned} · провалени опити сега ${j.currentlyFailed} / общо ${j.totalFailed}` }),
        j.banned.length
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['Адрес', ''], j.banned.map((ip) =>
                el('tr', {}, [
                  el('td', { class: 'mono', text: ip }),
                  el('td', {}, [
                    el('button', {
                      class: 'btn btn-sm', text: 'Разблокирай',
                      onclick: async (e) => {
                        e.target.disabled = true;
                        try {
                          await api('/security/fail2ban', { method: 'POST', body: { jail: j.name, ip, action: 'unbanip' } });
                          toast(`${ip} е разблокиран`, 'ok');
                          go('fail2ban');
                        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
                      },
                    }),
                  ]),
                ])
              )),
            ])
          : el('div', { class: 'metric-sub', text: 'няма блокирани адреси' }),
      ])
    );
  }
}

// ── Достъп по IP + режим „sudo" ───────────────────────────────────────────────────
async function renderAccess() {
  const view = document.getElementById('view');
  const d = await api('/settings/access');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text:
    'Втора врата ПРЕД паролата: адрес извън списъка не вижда дори формата за вход. Празен списък = изключено. ' +
    (d.trustProxy
      ? 'Зад прокси адресът се чете от X-Real-IP — увери се, че Nginx го ПРЕЗАПИСВА, иначе списъкът се заобикаля с един хедър.'
      : 'Панелът чете адреса директно от връзката. Ако сложиш reverse proxy, включи „trustProxy" — иначе всички заявки изглеждат от 127.0.0.1.') }));

  const list = el('textarea', {
    rows: 6, class: 'mono', style: 'width:100%',
    placeholder: 'по един на ред, напр.\n93.123.45.67\n10.0.0.0/8\n2001:db8::/32',
  });
  list.value = (d.allowIps || []).join('\n');
  const sudoOn = el('input', { type: 'checkbox' });
  sudoOn.checked = d.sudoMode;

  view.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Разрешени адреси' }),
      el('div', { class: 'metric-sub', text: `Твоят адрес сега: ${d.yourIp}` }),
      list,
      el('div', { class: 'metric-sub', text:
        'Панелът отказва да запише непразен списък, който НЕ включва текущия ти адрес — това е единствената защита срещу заключване извън собствения ти сървър. Ако адресът ти е динамичен, ползвай мрежата на доставчика (напр. 93.123.0.0/16) или остави списъка празен.' }),
      el('h3', { text: 'Режим „sudo"', style: 'margin-top:16px' }),
      el('label', { class: 'muted' }, [sudoOn, document.createTextNode(' искай парола отново преди необратимите действия (захранване, терминал, деплой, възстановяване, .env, firewall)')]),
      el('div', { class: 'metric-sub', text: 'Разрешението важи 5 минути и само за текущия браузър. Това е разликата между „някой има сесията ти" и „някой е ТИ".' }),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        el('button', {
          class: 'btn btn-primary', text: 'Запази',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const entries = list.value.split('\n').map((l) => l.trim()).filter(Boolean);
              const r = await api('/settings/access', { method: 'POST', body: { allowIps: entries, sudoMode: sudoOn.checked } });
              toast(r.allowIps.length ? `Записани ${r.allowIps.length} адреса` : 'Списъкът е празен (изключен)', 'ok');
            } catch (err) { toast(err.message, 'bad'); }
            e.target.disabled = false;
          },
        }),
      ]),
    ])
  );
}

// ── Променливи на средата (.env) ──────────────────────────────────────────────────
// Стойностите на тайните ключове стоят скрити, докато не ги поискаш изрично —
// открадната сесия иначе изнася всички ключове на продукцията с едно зареждане.
async function renderEnv() {
  const view = document.getElementById('view');
  const { files } = await api('/env');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text:
    'Редакторът пипа САМО дадения ключ — не презаписва целия файл, коментарите оцеляват и всяка промяна оставя копие (.bak). ' +
    'Тайните са скрити по подразбиране; разкриването се записва в одита.' }));
  if (!files.length) {
    view.appendChild(el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: 'Не са намерени .env файлове. Добави ги изрично в „envFiles" в конфига (с „unit", ако искаш и бутон за рестарт).' })]));
    return;
  }
  const list = el('div', { class: 'grid grid-metrics' });
  const detail = el('div', { id: 'env-detail', style: 'margin-top:16px' });
  for (const f of files) {
    list.appendChild(
      el('div', { class: 'card', style: 'cursor:pointer', onclick: () => openEnv(f, detail) }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: f.name }),
          f.worldReadable ? pill('bad', 'права 0644') : pill('ok', f.mode),
        ]),
        el('div', { class: 'metric-sub mono', text: f.path }),
        el('div', { class: 'metric-sub', text: `${fmtBytes(f.sizeBytes)} · променен ${fmtWhen(f.mtime)}${f.unit ? ' · ' + f.unit : ''}` }),
      ])
    );
  }
  view.appendChild(list);
  view.appendChild(detail);
  if (files.length === 1) openEnv(files[0], detail);
}

async function openEnv(file, detail, reveal = false) {
  detail.innerHTML = '';
  detail.appendChild(el('div', { class: 'metric-sub', text: 'Зареждам…' }));
  let data;
  try {
    data = await api(`/env/file?path=${encodeURIComponent(file.path)}${reveal ? '&reveal=1' : ''}`);
  } catch (e) {
    detail.innerHTML = '';
    toast(e.message, 'bad');
    return;
  }
  detail.innerHTML = '';
  const pending = new Map(); // ключ → нова стойност
  const removals = new Set();
  const saveBtn = el('button', { class: 'btn btn-primary', text: 'Запази промените', disabled: true });
  const status = el('span', { class: 'muted' });
  const refreshState = () => {
    saveBtn.disabled = pending.size === 0 && removals.size === 0;
    status.textContent = saveBtn.disabled ? '' : `${pending.size + removals.size} промени, незаписани`;
  };

  const rows = data.vars.map((v) => {
    const input = el('input', {
      type: 'text',
      value: v.value,
      class: 'mono',
      // Скритата стойност не се редактира — иначе „поправям само тук" изтрива тайната.
      disabled: v.secret && !data.revealed,
      oninput: (e) => {
        pending.set(v.key, e.target.value);
        refreshState();
      },
    });
    const row = el('tr', {}, [
      el('td', { class: 'mono' }, [document.createTextNode(v.key), v.secret ? pill('warn', 'тайна') : '']),
      el('td', { style: 'width:60%' }, [input]),
      el('td', {}, [
        el('button', {
          class: 'btn btn-sm btn-danger', text: 'Изтрий',
          onclick: () => {
            removals.add(v.key);
            pending.delete(v.key);
            row.style.opacity = '0.4';
            input.disabled = true;
            refreshState();
          },
        }),
      ]),
    ]);
    return row;
  });

  const newKey = el('input', { type: 'text', placeholder: 'НОВ_КЛЮЧ', class: 'mono' });
  const newVal = el('input', { type: 'text', placeholder: 'стойност', class: 'mono' });

  detail.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: file.name + ' — ' + data.path }),
        data.revealed
          ? pill('bad', 'тайните са видими')
          : el('button', {
              class: 'btn btn-sm', text: '👁 Покажи тайните',
              onclick: () => openEnv(file, detail, true),
            }),
      ]),
      el('div', { class: 'table-wrap' }, [tableEl(['Ключ', 'Стойност', ''], rows)]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        newKey,
        newVal,
        el('button', {
          class: 'btn btn-sm', text: '+ Добави',
          onclick: () => {
            const k = newKey.value.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return toast('Името може да е само букви, цифри и „_"', 'bad');
            pending.set(k, newVal.value);
            newKey.value = '';
            newVal.value = '';
            refreshState();
            toast(`${k} ще бъде добавен при запис`, 'ok');
          },
        }),
      ]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        saveBtn,
        status,
        file.unit
          ? el('button', {
              class: 'btn btn-sm', text: `⟳ Рестартирай ${file.unit}`,
              onclick: async () => {
                try {
                  await api('/services/action', { method: 'POST', body: { unit: file.unit, action: 'restart' } });
                  toast(`${file.unit} рестартиран`, 'ok');
                } catch (e) { toast(e.message, 'bad'); }
              },
            })
          : el('span', { class: 'muted', text: 'Промяната влиза в сила при рестарт на продукта.' }),
      ]),
    ])
  );

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const r = await api('/env/file', {
        method: 'POST',
        body: { path: data.path, changes: Object.fromEntries(pending), remove: [...removals] },
      });
      toast(`Записано: ${r.changed.join(', ')} · копие ${r.backup ? '✓' : '—'}`, 'ok');
      openEnv(file, detail, data.revealed);
    } catch (e) {
      toast(e.message, 'bad');
      saveBtn.disabled = false;
    }
  };
}

// ── Домейни и TLS ─────────────────────────────────────────────────────────────────
// Проверката на DNS върви ПРЕДИ certbot по една причина: Let's Encrypt гори лимита
// от 5 провала на час и после отказва дори при вече верен DNS.
async function renderDomains() {
  const view = document.getElementById('view');
  const data = await api('/domains');
  view.innerHTML = '';
  const addr = [data.server.v4, data.server.v6].filter(Boolean).join(' / ');
  view.appendChild(el('p', { class: 'section-desc', text:
    (addr ? `Този сървър е ${addr}. ` : 'Адресът на сървъра не можа да се определи (липсва „ip" команда) — сравнението с DNS ще се пропусне. ') +
    (data.server.note || 'Преди издаване панелът проверява дали домейнът сочи насам, дали порт 80 отговаря отвън и дали CAA записът позволява Let\'s Encrypt.') }));

  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Сертификат', 'Домейни', 'Изтича', 'Остават'], (data.certs || []).map((c) =>
        el('tr', {}, [
          el('td', { class: 'mono', text: c.name }),
          el('td', { class: 'mono', text: c.domains.join(', ') || '—' }),
          el('td', { text: c.expiresAt ? fmtWhen(c.expiresAt) : '—' }),
          el('td', {}, [c.daysLeft == null ? '—' : pill(c.daysLeft <= 7 ? 'bad' : c.daysLeft <= 21 ? 'warn' : 'ok', `${plural(c.daysLeft, 'ден', 'дни')}`)]),
        ])
      )),
    ])
  );

  // Смениш ли домейна, проверката вече не важи за него — бутонът се заключва
  // отново. Иначе „провери A → напиши Б → издай" изглежда одобрено, а не е.
  // Изтичане на РЕГИСТРАЦИЯТА. Сертификатът е безполезен при паднал домейн, а
  // домейнът пада по-тихо и се връща много по-скъпо.
  const regBox = el('div', { style: 'margin-top:20px' });
  view.appendChild(regBox);
  loadPanel(regBox, '/domains/registration', 'Регистрация на домейните (RDAP)',
    'Следим и регистрацията, не само сертификата. „hold" значи, че домейнът вече НЕ резолвва — сайтът е недостъпен, макар сървърът да работи.',
    (r) => tableEl(['Домейн', 'Изтича', 'Остават', 'Статус'], (r.domains || []).map((d) =>
      el('tr', {}, [
        el('td', { class: 'mono', text: d.domain }),
        el('td', { class: 'muted', text: d.expiresAt ? fmtWhen(d.expiresAt) : d.error || '—' }),
        el('td', {}, [d.daysLeft == null ? el('span', { class: 'muted', text: '—' })
          : pill(d.daysLeft <= 7 ? 'bad' : d.daysLeft <= 30 ? 'warn' : 'ok', `${plural(d.daysLeft, 'ден', 'дни')}`)]),
        el('td', {}, [d.onHold ? pill('bad', 'HOLD') : el('span', { class: 'muted mono', text: (d.status || []).join(', ') || '—' })]),
      ])
    )));

  // Заглавки за сигурност — проверява се това, което браузърът РЕАЛНО получава.
  const hdrBox = el('div', { style: 'margin-top:20px' });
  view.appendChild(hdrBox);
  loadPanel(hdrBox, '/security/headers', 'Заглавки за сигурност',
    'Проверява се отговорът на живия сайт, не конфигът — двете се разминават при прокси, кеш или забравен add_header в друг блок.',
    (r) => el('div', {}, (r.sites || []).map((s) =>
      el('div', { style: 'margin-bottom:12px' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: s.url }),
          s.ok ? pill(s.score >= 90 ? 'ok' : s.score >= 60 ? 'warn' : 'bad', `${s.score}/100`) : pill('dim', s.error),
        ]),
        ...(s.findings || []).map((f) =>
          el('div', { class: 'metric-sub' }, [
            pill(f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'dim', f.severity),
            document.createTextNode(` ${f.title} — ${f.why}`),
            el('div', { class: 'mono metric-sub', text: '→ ' + f.fix }),
          ])
        ),
        s.ok && !(s.findings || []).length ? el('div', { class: 'metric-sub', text: 'всички очаквани заглавки са налице' }) : '',
      ])
    )));

  const domain = el('input', {
    type: 'text', placeholder: 'example.com или *.example.com', class: 'mono', style: 'min-width:260px',
    oninput: () => {
      issueBtn.disabled = true;
      out.innerHTML = '';
    },
  });
  const email = el('input', { type: 'text', placeholder: 'имейл за ACME (по избор)', value: data.acmeEmail || '' });
  const plugin = el('input', { type: 'text', placeholder: 'DNS плъгин (за wildcard), напр. dns-cloudflare', class: 'mono' });
  const out = el('div', { style: 'margin-top:12px' });
  let lastPreflight = null;

  const issueBtn = el('button', {
    class: 'btn btn-primary', text: '🔒 Издай сертификат', disabled: true,
    onclick: () => doIssue(false),
  });
  const stagingBtn = el('button', {
    class: 'btn btn-sm', text: 'Пробно издаване (staging)',
    onclick: () => doIssue(true),
  });

  async function doIssue(staging) {
    // Let's Encrypt брои: 5 еднакви сертификата на седмица, 50 на домейн.
    // Изчерпаш ли ги, чакаш ДНИ — точно затова има staging и точно затова
    // истинското издаване се потвърждава, а пробното не.
    if (!staging && !(await confirmDanger({
      title: 'Издаване на истински сертификат',
      what: ['Let\'s Encrypt има седмичен лимит (5 еднакви сертификата). Изчерпан лимит значи чакане с ДНИ.',
        'Ако още изпробваш настройката, ползвай „Пробно издаване (staging)" — то не се брои.'],
      expect: 'издай',
      confirmLabel: 'Издай',
    }))) return;
    runJob(
      '/domains/issue',
      { domain: domain.value.trim(), email: email.value.trim(), dnsPlugin: plugin.value.trim(), staging },
      staging ? 'certbot (проба)' : 'certbot'
    );
  }

  view.appendChild(
    el('div', { class: 'card', style: 'margin-top:20px' }, [
      el('h3', { text: 'Нов сертификат' }),
      el('div', { class: 'toolbar' }, [
        domain,
        email,
        el('button', {
          class: 'btn', text: '⌕ Провери DNS',
          onclick: async (e) => {
            e.target.disabled = true;
            out.innerHTML = '';
            out.appendChild(el('div', { class: 'metric-sub', text: 'Проверявам DNS, CAA и порт 80…' }));
            try {
              lastPreflight = await api('/domains/preflight?domain=' + encodeURIComponent(domain.value.trim()));
              renderPreflight(out, lastPreflight);
              issueBtn.disabled = !lastPreflight.ready;
            } catch (err) {
              out.innerHTML = '';
              out.appendChild(el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: '⚠ ' + err.message }));
              issueBtn.disabled = true;
            }
            e.target.disabled = false;
          },
        }),
      ]),
      el('div', { class: 'toolbar' }, [plugin]),
      out,
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [issueBtn, stagingBtn]),
      el('div', { class: 'metric-sub', text:
        'Пробното издаване минава през staging средата на Let\'s Encrypt — сертификатът не е валиден за браузър, но НЕ харчи бойния лимит. Ползвай го, когато проверката не минава, а си сигурен в настройката.' }),
    ])
  );
}

// Панел, който се дозарежда САМ и не бави секцията. RDAP и HEAD заявките към
// живите сайтове излизат в интернет — синхронното им чакане би направило цялата
// секция бавна заради нещо, което е само допълнение.
async function loadPanel(box, endpoint, title, desc, render) {
  box.innerHTML = '';
  box.appendChild(el('h3', { class: 'muted', text: title, style: 'margin:0 0 8px' }));
  const body = el('div', { class: 'card' }, [el('div', { class: 'metric-sub', text: 'Проверявам…' })]);
  box.appendChild(body);
  try {
    const r = await api(endpoint);
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'metric-sub', style: 'margin-bottom:8px', text: desc }));
    body.appendChild(render(r));
  } catch (e) {
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'metric-sub', text: 'Не можа да се провери: ' + e.message }));
  }
}

function renderPreflight(container, pf) {
  container.innerHTML = '';
  container.appendChild(
    el('div', { class: 'card-head' }, [
      el('h3', { text: pf.domain }),
      pill(pf.ready ? 'ok' : 'bad', pf.ready ? 'готов за издаване' : `${pf.problems.length} пречки`),
    ])
  );
  container.appendChild(kv({
    'A записи': pf.a.join(', ') || '—',
    'AAAA записи': pf.aaaa.join(', ') || '—',
    CAA: pf.caa.map((c) => `${c.issue || c.issuewild || JSON.stringify(c)}`).join(', ') || 'няма (всеки издател е позволен)',
    'Сочи ли насам': pf.matches == null ? 'неизвестно' : pf.matches ? 'да' : 'НЕ',
    'Порт 80 отвън': pf.wildcard ? 'не се проверява (DNS-01)' : pf.http?.status != null ? `отговаря (${pf.http.status})` : 'няма отговор',
  }));
  for (const p of pf.problems) {
    container.appendChild(el('div', { class: 'metric-sub', style: 'color:var(--danger)', text: '⚠ ' + p }));
  }
}

// ── Файлове ───────────────────────────────────────────────────────────────────────
async function renderFiles(path = '/root') {
  const view = document.getElementById('view');
  let data;
  try {
    data = await api('/files?path=' + encodeURIComponent(path));
  } catch (e) {
    view.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    return;
  }
  view.innerHTML = '';
  const crumbs = el('div', { class: 'crumbs' });
  crumbs.appendChild(el('a', { text: data.path, onclick: () => renderFiles(data.path) }));
  view.appendChild(el('div', { class: 'toolbar' }, [
    data.parent ? el('button', { class: 'btn btn-sm', text: '⬆ нагоре', onclick: () => renderFiles(data.parent) }) : el('span'),
    crumbs,
  ]));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Име', 'Размер', 'Права', 'Променен'], data.entries.map((e) =>
        el('tr', {}, [
          el('td', {}, [
            e.isDir
              ? el('a', { class: 'mono', text: '📁 ' + e.name, onclick: () => renderFiles(joinPath(data.path, e.name)) })
              : el('a', { class: 'mono', text: (e.isLink ? '🔗 ' : '📄 ') + e.name, onclick: () => viewFile(joinPath(data.path, e.name)) }),
          ]),
          el('td', { text: e.isDir ? '—' : fmtBytes(e.sizeBytes) }),
          el('td', { class: 'mono muted', text: e.mode }),
          el('td', { class: 'muted', text: fmtWhen(e.mtime) }),
        ])
      )),
    ])
  );
}

async function viewFile(path) {
  openModal('Файл · ' + path);
  try {
    const r = await api('/files/read?path=' + encodeURIComponent(path));
    if (r.binary) {
      setModalOut(`(бинарен файл, ${fmtBytes(r.sizeBytes)})`);
      return;
    }
    const out = document.getElementById('modal-out');
    out.textContent = '';
    const ta = el('textarea', { class: 'term-out', style: 'width:100%;height:56vh;resize:vertical', readonly: r.truncated ? 'readonly' : null });
    ta.value = r.content + (r.truncated ? '\n\n… (отрязан — редакцията е изключена)' : '');
    out.appendChild(ta);
    out.appendChild(el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
      r.truncated
        ? el('span', { class: 'muted', text: 'Файлът е твърде голям за редакция.' })
        : el('button', {
            class: 'btn btn-primary btn-sm', text: 'Запази',
            onclick: async (e) => {
              if (!confirm(`Записвам ${path}? Пази се копие (.bak).`)) return;
              e.target.disabled = true;
              try {
                const w = await api('/files/write', { method: 'POST', body: { path, content: ta.value } });
                toast(`Запазено (${fmtBytes(w.bytes)}); копие: ${w.backup ? w.backup.split('/').pop() : '—'}`);
                closeModal();
              } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
            },
          }),
      el('span', { class: 'muted', text: `${fmtBytes(r.sizeBytes)}` }),
    ]));
  } catch (e) {
    setModalOut('Грешка: ' + e.message);
  }
}

function joinPath(base, name) {
  return base.endsWith('/') ? base + name : base + '/' + name;
}

// ── Терминал ──────────────────────────────────────────────────────────────────────
async function renderTerminal() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Пълен shell достъп (bash -lc), одитиран. Всяка команда се записва в дневника.' }));
  const cwd = el('input', { type: 'text', value: '/root', style: 'max-width:220px', 'aria-label': 'Работна папка (cwd)' });
  const out = el('pre', { class: 'log-out', text: 'Готов.' });
  const input = el('input', { type: 'text', placeholder: 'команда…', autocomplete: 'off' });
  view.appendChild(el('div', { class: 'toolbar' }, [el('span', { class: 'muted', text: 'cwd:' }), cwd]));
  view.appendChild(out);
  view.appendChild(el('form', { class: 'term-in', onsubmit: submit }, [input, el('button', { class: 'btn btn-primary', text: 'Пусни', type: 'submit' })]));
  const hist = [];
  let hix = 0;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hix > 0) input.value = hist[--hix] || '';
    if (e.key === 'ArrowDown' && hix < hist.length) input.value = hist[++hix] || '';
  });
  input.focus();

  async function submit(e) {
    e.preventDefault();
    const cmd = input.value.trim();
    if (!cmd) return;
    hist.push(cmd);
    hix = hist.length;
    out.textContent += `\n$ ${cmd}\n`;
    input.value = '';
    try {
      const job = await api('/terminal/run', { method: 'POST', body: { cmd, cwd: cwd.value || '/root' } });
      const es = new EventSource(sseUrl(`/jobs/${job.id}/stream`));
      es.addEventListener('data', (ev) => {
        out.textContent += JSON.parse(ev.data);
        out.scrollTop = out.scrollHeight;
      });
      es.addEventListener('end', (ev) => {
        try {
          out.textContent += `\n[изход ${JSON.parse(ev.data).code}]\n`;
        } catch { /* игнор */ }
        out.scrollTop = out.scrollHeight;
        es.close();
      });
    } catch (err) {
      out.textContent += 'Грешка: ' + err.message + '\n';
    }
  }
}

// ── Агенти ────────────────────────────────────────────────────────────────────────
async function renderAgents() {
  const view = document.getElementById('view');
  const [fleet, tools, mem] = await Promise.all([api('/agents/fleet'), api('/agents/tools'), api('/agents/memories').catch(() => ({ memories: [] }))]);
  view.innerHTML = '';
  if (!fleet.available) {
    view.appendChild(el('div', { class: 'empty', text: fleet.error || 'Флотът е недостъпен.' }));
  }

  view.appendChild(el('h3', { class: 'muted', text: 'Инструменти на агентите („ръцете“)', style: 'margin:4px 0 10px' }));
  // ЕДИН symlink (`current`) държи целия слой. Когато сочи накриво, всеки
  // инструмент поотделно пише „липсва" и човек тръгва да търси изчезнали
  // скриптове — вместо да погледне връзката. Затова: щом ВСИЧКИ липсват, казваме
  // общата причина веднъж, с пътя, и не оставяме десет еднакви загадки.
  if (tools.tools.length && tools.tools.every((x) => !x.present)) {
    view.appendChild(
      el('div', { class: 'card', style: 'border-color:var(--warn);margin-bottom:12px' }, [
        el('div', { class: 'metric-sub', text: tools.rootExists
          ? 'Нито един инструмент не е намерен, а папката съществува — значи разгърнатият архив е непълен (липсва tools/).'
          : 'Нито един инструмент не е намерен, защото самата папка липсва — деплоят не е стигнал до маркирането на release.' }),
        el('div', { class: 'metric-sub', raw: `Панелът гледа в: ${tools.root}` }),
      ])
    );
  }
  view.appendChild(
    // Параметърът се казва `tool`, не `t`: „t" е преводачът и засенчването му
    // тук значи, че всяко бъдещо `t('низ')` в тялото вика ИНСТРУМЕНТА.
    el('div', { class: 'grid grid-metrics' }, tools.tools.map((tool) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: tool.title }), pill(tool.present ? 'ok' : 'dim', tool.present ? 'наличен' : 'липсва')]),
        // Име на агент + път до скрипт са СОБСТВЕНИ имена — `raw`, не `text`.
        el('div', { class: 'metric-sub', raw: `${tool.owner} · ${tool.script}` }),
        el('button', {
          class: 'btn btn-sm btn-primary',
          text: '▶ Пусни',
          disabled: !tool.present,
          // Изключеният бутон вече и ИЗГЛЕЖДА изключен (CSS `:disabled`), но
          // „защо" се вижда само при посочване — затова причината е и в title.
          title: tool.present ? 'Пусни инструмента' : 'Скриптът липсва в текущия release',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const job = await api('/agents/tools/run', { method: 'POST', body: { tool: tool.id } });
              streamJob(job.id, job.title);
            } catch (err) {
              toast(err.message, 'bad');
            }
            e.target.disabled = false;
          },
        }),
      ])
    ))
  );

  if (fleet.available) {
    view.appendChild(el('h3', { class: 'muted', text: `Флот (${fleet.agents.length} агента)`, style: 'margin:22px 0 10px' }));
    view.appendChild(
      el('div', { class: 'agents-grid' }, fleet.agents.map((a) => {
        const c = el('div', { class: 'agent-card' }, [
          el('div', { class: 'a-head' }, [
            el('span', { class: 'a-emoji', text: a.emoji || '🤖' }),
            el('div', {}, [el('div', { class: 'a-name', text: a.name }), el('div', { class: 'a-title', text: a.title || '' })]),
          ]),
          el('p', { class: 'a-tag', text: a.tagline || '' }),
          el('div', { class: 'a-meta' }, [
            pill(a.status === 'active' ? 'ok' : 'dim', a.status || '—'),
            pill('dim', `${a.model || '?'}/${a.effort || '?'}`),
            pill('dim', `v${a.versions}`),
          ]),
        ]);
        if (a.accent) c.style.borderLeftColor = a.accent;
        return c;
      }))
    );
  }

  // Паметта на агентите е самонаучаващият се слой — ако файлът за някой агент
  // спре да расте, неговият цикъл е спрял и това не се вижда никъде другаде.
  if (mem.memories?.length) {
    view.appendChild(el('h3', { class: 'muted', text: `Памет на агентите (${plural(mem.memories.length, 'файл', 'файла')})`, style: 'margin:22px 0 10px' }));
    view.appendChild(
      el('div', { class: 'table-wrap' }, [
        tableEl(['Файл', 'Размер', 'Последна промяна'], mem.memories
          .slice()
          .sort((a, b) => b.mtime.localeCompare(a.mtime))
          .map((m) =>
            el('tr', {}, [
              el('td', { class: 'mono', text: m.file }),
              el('td', { text: fmtBytes(m.sizeBytes) }),
              el('td', { class: 'muted', text: fmtWhen(m.mtime) }),
            ])
          )),
      ])
    );
  }
}

// ── Задачи ────────────────────────────────────────────────────────────────────────
async function renderJobs() {
  const view = document.getElementById('view');
  const jobs = await api('/jobs');
  view.innerHTML = '';
  if (!jobs.length) {
    view.appendChild(el('div', { class: 'empty', text: 'Няма задачи още.' }));
    return;
  }
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Задача', 'Команда', 'Старт', 'Статус', ''], jobs.map((j) =>
        el('tr', {}, [
          el('td', { text: j.title }),
          el('td', { class: 'mono muted', text: (j.cmd || '').slice(0, 50) }),
          el('td', { class: 'muted', text: fmtWhen(j.startedAt) }),
          el('td', {}, [j.running ? pill('warn', 'върви') : pill(j.code === 0 ? 'ok' : 'bad', `изход ${j.code}`)]),
          el('td', {}, [el('button', { class: 'btn btn-sm', text: 'Отвори', onclick: () => streamJob(j.id, j.title) })]),
        ])
      )),
    ])
  );
}

// ── Одит ──────────────────────────────────────────────────────────────────────────
async function renderAudit() {
  const view = document.getElementById('view');
  const [data, chain, ship] = await Promise.all([
    api('/audit?limit=300'),
    api('/audit/verify').catch(() => null),
    api('/audit/ship').catch(() => null),
  ]);
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Одиторски дневник — всяко мутиращо действие (append-only, без тайни).' }));

  // Веригата има смисъл само ако някой я ПРОВЕРЯВА. Досега тя се строеше вярно,
  // но нямаше как да я сверши човек от панела — тоест беше защита на хартия.
  if (chain) {
    const broken = chain.brokenAt != null;
    view.appendChild(
      el('div', { class: 'grid grid-2', style: 'margin-bottom:16px' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: 'Цялост на дневника' }),
            pill(broken ? 'bad' : 'ok', broken ? 'СКЪСАНА' : 'непрекъсната'),
          ]),
          el('div', { class: 'metric-sub', text:
            broken
              ? `Веригата се къса на ред ${chain.brokenAt}: ${chain.reason}. Оттам нататък записите са подменени или изтрити.`
              : chain.note
                ? chain.note
                : `${chain.checked} проверени записа — всеки носи хеша на предишния, затова изтрит или подменен ред щеше да се види.` }),
          // Хоризонтът е част от отговора, не украса: „веригата е цяла" без
          // „докъде" приспива — човек мисли, че има следи от началото, а има
          // последните няколко мегабайта. Ротацията е тиха по конструкция.
          chain.oldest
            ? el('div', { class: 'metric-sub', text:
                `${t('Най-старият запис е от')} ${fmtWhen(chain.oldest)}${chain.rotated ? ` · ${chain.rotated} ${t('завъртени файла')}` : ''}. ` +
                t('По-старото е изпаднало при ротацията — трайното копие е на другия VPS.') })
            : '',
          chain.writeFailures
            ? el('div', { class: 'metric-sub', style: 'color:var(--danger)', text:
                `⚠ ${chain.writeFailures} неуспешни записа в дневника — действия без следа.` })
            : '',
          el('div', { class: 'metric-sub', text:
            'Веригата ОТКРИВА подправяне, но не го спира: root може да пренапише целия файл. Истинската защита е копие извън машината.' }),
          el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
            el('button', {
              class: 'btn btn-sm', text: '⛨ Провери отново',
              onclick: async (e) => {
                e.target.disabled = true;
                try {
                  const r = await api('/audit/verify');
                  toast(r.brokenAt != null ? `Веригата е скъсана на ред ${r.brokenAt}` : 'Веригата е непрекъсната', r.brokenAt != null ? 'bad' : 'ok');
                  go('audit');
                } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
              },
            }),
          ]),
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: 'Копие извън машината' }),
            pill(ship?.enabled ? 'ok' : 'dim', ship?.enabled ? 'включено' : 'изключено'),
          ]),
          ship?.enabled
            ? kv({
                Каданс: `на ${ship.intervalSec} секунди`,
                'Докъде е стигнало': Object.keys(ship.cursors || {}).length
                  ? Object.entries(ship.cursors).map(([id, h]) => `${id}: …${String(h).slice(-8)}`).join(' · ')
                  : 'още нищо не е изнесено',
                'Огледала ТУК': (ship.mirrors || []).length
                  ? ship.mirrors.map((m) => `${m.node} (${fmtBytes(m.sizeBytes)}, ${fmtWhen(m.mtime)})`).join(' · ')
                  : 'няма — този възел не е получавал чужд одит',
              })
            : el('div', { class: 'metric-sub', text:
                'Изключено. Хеш-веригата открива подправяне, но root може да пренапише файла целия. Копие на другия VPS („auditShip" в конфига) е единственото, което прави следите неунищожими от тази машина.' }),
          ship?.enabled
            ? el('div', { class: 'toolbar', style: 'margin-top:10px' }, [
                el('button', {
                  class: 'btn btn-sm', text: '⇪ Изнеси сега',
                  onclick: async (e) => {
                    e.target.disabled = true;
                    try {
                      const r = await api('/audit/ship/now', { method: 'POST' });
                      const okN = (r.results || []).filter((x) => x.ok).length;
                      const bad = (r.results || []).filter((x) => !x.ok);
                      toast(bad.length ? `${okN} успешни, ${bad.length} провалени: ${bad[0].error || ''}` : `Изнесено към ${plural(okN, 'възел', 'възела')}`, bad.length ? 'warn' : 'ok');
                      go('audit');
                    } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
                  },
                }),
              ])
            : '',
        ]),
      ])
    );
  }
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Кога', 'Действие', 'Детайли', 'Потребител'], data.entries.slice().reverse().map((e) =>
        el('tr', {}, [
          el('td', { class: 'muted', text: fmtWhen(e.ts) }),
          el('td', {}, [pill(actionClass(e.action), e.action || '—')]),
          // Дневникът е ДОКАЗАТЕЛСТВО, не интерфейс: редът се показва дословно
          // (`raw`), както е записан. Превод би го фалшифицирал — и се трупаше
          // в списъка с „непреведени", заглушавайки истинските пропуски.
          el('td', { class: 'mono muted', raw: auditDetail(e) }),
          el('td', { text: e.user || '—' }),
        ])
      )),
    ])
  );
}
function actionClass(a = '') {
  if (a.includes('fail') || a.includes('kill') || a.includes('power')) return 'bad';
  if (a.includes('deploy') || a.includes('upgrade') || a.includes('terminal')) return 'warn';
  return 'dim';
}
function auditDetail(e) {
  const skip = new Set(['ts', 'action', 'user']);
  return Object.entries(e)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ')
    .slice(0, 120);
}

// ── Захранване ────────────────────────────────────────────────────────────────────
async function renderPower() {
  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Рестарт или изключване на сървъра. Отложено с 5s, за да стигне отговорът.' }));
  const host = state.me?.nodeName || 'сървъра';
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-warn',
        text: '⟳ Рестарт (reboot)',
        onclick: async () => {
          const ok = await confirmDanger({
            title: 'Рестарт на сървъра',
            what: [
              'Всички услуги спират и тръгват наново.',
              'Панелът прекъсва — ще се върне след ~1 минута.',
              'Вървящи задачи (деплой, бекъп) се прекъсват.',
            ],
            expect: host,
            confirmLabel: 'Рестартирай',
          });
          if (ok) power('reboot');
        },
      }),
      el('button', {
        class: 'btn btn-danger',
        text: '⏻ Изключване (poweroff)',
        onclick: async () => {
          const ok = await confirmDanger({
            title: 'ИЗКЛЮЧВАНЕ на сървъра',
            what: [
              'Сървърът спира напълно и НЯМА да се върне сам.',
              'Ще трябва да го пуснеш ръчно от конзолата на хостинга.',
              'Всички сайтове и услуги стават недостъпни.',
            ],
            expect: host,
            confirmLabel: 'Изключи',
            delayMs: 2000, // изстиване срещу рефлекторно кликане
          });
          if (ok) power('poweroff');
        },
      }),
    ])
  );
}
async function power(action) {
  try {
    const r = await api('/power', { method: 'POST', body: { action } });
    toast(r.note || 'ОК', 'warn');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

// ── Общи задачни помощници ───────────────────────────────────────────────────────
async function runJob(pathname, body, title) {
  try {
    const job = await api(pathname, { method: 'POST', body });
    streamJob(job.id, title || job.title);
  } catch (e) {
    toast(e.message, 'bad');
  }
}

function streamJob(id, title) {
  openModal(title || 'Задача', id);
  const out = document.getElementById('modal-out');
  out.textContent = '';
  const es = new EventSource(sseUrl(`/jobs/${id}/stream`));
  modalEs = es;
  es.addEventListener('data', (e) => {
    out.textContent += JSON.parse(e.data);
    out.scrollTop = out.scrollHeight;
  });
  es.addEventListener('end', (e) => {
    try {
      out.textContent += `\n[задачата приключи · изход ${JSON.parse(e.data).code}]\n`;
    } catch { /* игнор */ }
    document.getElementById('modal-kill').classList.add('hidden');
    es.close();
  });
  es.onerror = () => { /* приключила задача → потокът се затваря нормално */ };
}

// ── Модал ──────────────────────────────────────────────────────────────────────────
let modalEs = null;
let modalJobId = null;
function openModal(title, jobId = null) {
  modalJobId = jobId;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-out').textContent = 'Зареждам…';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-kill').classList.toggle('hidden', !jobId);
}
function setModalOut(text) {
  document.getElementById('modal-out').textContent = text;
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.getElementById('modal-kill').addEventListener('click', async () => {
  if (!modalJobId) return;
  try {
    await api(`/jobs/${modalJobId}/kill`, { method: 'POST' });
    toast('Задачата е спряна');
  } catch (e) {
    toast(e.message, 'bad');
  }
});
function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  if (modalEs) { modalEs.close(); modalEs = null; }
  modalJobId = null;
}

// ── Помощни DOM/формат ─────────────────────────────────────────────────────────────
function tableEl(headers, rows) {
  const thead = el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]);
  const tbody = el('tbody', {}, rows.length ? rows : [el('tr', {}, [el('td', { class: 'empty', text: 'Няма данни', colspan: headers.length })])]);
  return el('table', {}, [thead, tbody]);
}
function kv(obj) {
  const dl = el('dl', { class: 'kv' });
  for (const [k, v] of Object.entries(obj)) {
    dl.appendChild(el('dt', { text: k }));
    dl.appendChild(el('dd', { text: v == null ? '—' : String(v) }));
  }
  return dl;
}
function barEl(pct) {
  const wrap = el('div', { class: 'bar' + (pct > 85 ? ' warn' : '') });
  wrap.appendChild(el('i', { style: `width:${Math.min(100, pct)}%` }));
  return wrap;
}
function setHtml(id, h) { const e = document.getElementById(id); if (e) e.innerHTML = h; }

// ── Boot ────────────────────────────────────────────────────────────────────────
// Брой активни аларми върху иконата на приложението (Android + iOS 16.4+ PWA).
// clearAppBadge() е ИЗРИЧЕН — setAppBadge(0) не чисти надеждно в Safari.
async function refreshBadge() {
  if (!('setAppBadge' in navigator)) return;
  try {
    const a = await api('/alerts');
    const n = (a.active || []).length;
    if (n > 0) await navigator.setAppBadge(n);
    else await navigator.clearAppBadge();
  } catch {
    /* без баджа — не е фатално */
  }
}

async function boot() {
  try {
    const me = await api('/me');
    state.me = me;
    showApp();
    document.getElementById('host-badge').textContent = me.nodeName;
    document.getElementById('ver').textContent = 'v' + me.version;
    // Панелът върви от резервния конфиг: това трябва да се ВИЖДА, а не само да
    // стои в journald. Иначе човек настройва прагове върху конфиг, който не е
    // този на диска, и се чуди защо промените „не се хващат".
    if (me.recovered) {
      const bar = el('div', { class: 'banner banner-warn' }, [
        el('b', { text: '⚠ Конфигът е повреден — панелът върви от резервно копие.' }),
        el('div', { text: 'Настройките може да са по-стари от последните. Повреденият файл НЕ е пипан.' }),
        el('div', { class: 'mono', style: 'font-size:11px;opacity:.8', raw: `${me.recovered.from} · ${me.recovered.reason}` }),
      ]);
      document.querySelector('.main').prepend(bar);
    }
    buildNav();
    wireSudoLock();
    registerCommand({
      id: 'act:refresh', scope: 'nav', label: 'Опресни текущата секция', section: 'Действия', hint: 'r',
      run: () => go(state.section),
    });
    registerCommand({
      id: 'act:logout', scope: 'nav', label: 'Изход от панела', section: 'Действия',
      run: () => document.getElementById('btn-logout').click(),
    });
    await loadNodes();
    go('overview');
    refreshBadge();
    setInterval(refreshBadge, 60000);
  } catch {
    showLogin();
  }
}

document.getElementById('btn-palette').addEventListener('click', () => openPalette());
boot();

// PWA: регистрира се само по HTTPS (или localhost) — иначе браузърът го отказва.
// Кешира САМО обвивката, никога /api/ (виж sw.js).
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')
) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
