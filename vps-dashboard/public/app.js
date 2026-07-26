// Carbon Stealth VPS Dashboard — клиент (vanilla ES modules, нула зависимости).
import {
  el, fmtBytes, fmtBps, fmtUptime, fmtWhen, pill, toast, escapeHtml,
  registerCommand, clearCommands, openPalette, liveStream, confirmDanger,
} from './ui.js';

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

async function api(pathname, { method = 'GET', body } = {}) {
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
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
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
  { id: 'overview', ico: '▤', label: 'Обзор', render: renderOverview },
  { id: 'products', ico: '❤', label: 'Продукти', render: renderProducts },
  { id: 'alerts', ico: '🔔', label: 'Аларми', render: renderAlerts },
  { id: 'services', ico: '⚙', label: 'Услуги', render: renderServices },
  { id: 'docker', ico: '⬢', label: 'Docker', render: renderDocker },
  { id: 'compose', ico: '⧉', label: 'Compose', render: renderCompose },
  { id: 'databases', ico: '⛁', label: 'Бази', render: renderDatabases },
  { id: 'processes', ico: '≡', label: 'Процеси', render: renderProcesses },
  { id: 'logs', ico: '☰', label: 'Логове', render: renderLogs },
  { id: 'deploy', ico: '⇧', label: 'Деплой', render: renderDeploy },
  { id: 'updates', ico: '⟳', label: 'Ъпдейти', render: renderUpdates },
  { id: 'security', ico: '⛨', label: 'Сигурност', render: renderSecurity },
  { id: 'firewall', ico: '🛡', label: 'Firewall', render: renderFirewall },
  { id: 'webserver', ico: '🌐', label: 'Уеб сървър', render: renderWebserver },
  { id: 'backups', ico: '⇩', label: 'Бекъпи', render: renderBackups },
  { id: 'cron', ico: '◷', label: 'Крон/таймери', render: renderCron },
  { id: 'files', ico: '🗀', label: 'Файлове', render: renderFiles },
  { id: 'terminal', ico: '⌘', label: 'Терминал', render: renderPty },
  { id: 'runonce', ico: '▷', label: 'Еднократна команда', render: renderTerminal },
  { id: 'agents', ico: '✦', label: 'Агенти', render: renderAgents },
  { id: 'jobs', ico: '⏻', label: 'Задачи', render: renderJobs },
  { id: 'audit', ico: '✎', label: 'Одит', render: renderAudit },
  { id: 'settings', ico: '⚿', label: 'Настройки', render: renderSettings },
  { id: 'power', ico: '⏼', label: 'Захранване', render: renderPower },
];

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  clearCommands('nav');
  const gotoFor = Object.fromEntries(Object.entries(GOTO_KEYS).map(([k, v]) => [v, k]));
  for (const s of SECTIONS) {
    const b = el('button', { onclick: () => go(s.id) }, [
      el('span', { class: 'ico', text: s.ico }),
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
    if (count) count.textContent = q ? `${shown} от ${container.querySelectorAll('tbody tr').length}` : '';
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

function go(id) {
  state.section = id;
  stopMetrics();
  closeSectionStream();
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('active', b.dataset.id === id);
  const s = SECTIONS.find((x) => x.id === id);
  document.getElementById('section-title').textContent = s.label;
  showSkeleton();
  document.querySelector('.sidebar').classList.remove('open');
  clearCommands('section'); // командите на предишната секция си отиват с нея
  s.render().catch((e) => {
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
  alerts: 'аларми известия notifications telegram ntfy',
  services: 'услуги сервизи systemd unit',
  docker: 'докер контейнери containers',
  compose: 'композе стек stack',
  databases: 'бази данни sqlite postgres дъмп dump',
  processes: 'процеси ps top kill',
  logs: 'логове дневник journal journalctl',
  deploy: 'деплой разгръщане release rollback архив zip',
  updates: 'ъпдейти обновявания apt upgrade',
  security: 'сигурност портове ssh tls сертификати',
  firewall: 'файъруол защитна стена ufw правила',
  webserver: 'уеб сървър нгинкс nginx caddy vhost certbot',
  backups: 'бекъпи архиви restic снимки',
  cron: 'крон таймери timers разписание',
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
    status === 'live' ? 'Връзка на живо' : status === 'connecting' ? 'Свързвам се…' : status === 'down' ? 'Връзката прекъсна — пробвам пак' : 'Няма поток';
  const sr = document.getElementById('conn-sr');
  if (sr) sr.textContent = dot.title;
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
  sel.appendChild(el('option', { value: 'local', text: `● ${data.local.name} (локален)` }));
  for (const p of data.peers || []) {
    sel.appendChild(el('option', { value: p.id, text: `${p.up ? '●' : '○'} ${p.name}` }));
  }
  sel.value = state.node;
  const peers = data.peers || [];
  status.textContent = peers.length
    ? `${peers.filter((p) => p.up).length}/${peers.length} peer(s) на линия`
    : 'Няма конфигурирани peer-и';
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
  const rangeSel = el('select', {}, (hist.ranges || ['24h']).map((k) => el('option', { value: k, text: 'история: ' + k })));
  rangeSel.value = hist.range || range;
  rangeSel.onchange = () => {
    state.range = rangeSel.value;
    go('overview');
  };
  view.appendChild(el('div', { class: 'toolbar' }, [rangeSel, el('span', { class: 'muted', text: `${state.hist.length} точки (пазят се 7 дни на диска)` })]));
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, [
      metricCard('CPU', 'cpu', `${m.cpuPct.toFixed(0)}<small>%</small>`, `${info.cpus} ядра · load ${m.load.map((x) => x.toFixed(2)).join(' ')}`),
      metricCard('Памет', 'mem', `${((m.mem.used / m.mem.total) * 100).toFixed(0)}<small>%</small>`, `${fmtBytes(m.mem.used)} / ${fmtBytes(m.mem.total)}`),
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
    setHtml('mc-cpu', `${snap.cpuPct.toFixed(0)}<small>%</small>`);
    setHtml('mc-mem', `${((snap.mem.used / snap.mem.total) * 100).toFixed(0)}<small>%</small>`);
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
  return el('div', { class: 'card' }, [
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
  b.textContent = `⚠ данните са от ${when} — връзката прекъсна`;
  b.classList.remove('hidden');
}
function markFresh() {
  document.getElementById('stale-banner').classList.add('hidden');
}

// ── Продукти (health) ───────────────────────────────────────────────────────────
async function renderProducts() {
  const view = document.getElementById('view');
  const data = await api('/health/products');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Живо здраве на всеки продукт от монорепото (локални health URL-и).' }));
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
}

// ── Аларми ────────────────────────────────────────────────────────────────────
async function renderAlerts() {
  const view = document.getElementById('view');
  const a = await api('/alerts');
  view.innerHTML = '';

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

  // Активни в момента
  view.appendChild(el('h3', { class: 'muted', text: `Активни аларми (${a.active.length})`, style: 'margin:6px 0 10px' }));
  view.appendChild(
    a.active.length
      ? el('div', { class: 'table-wrap' }, [
          tableEl(['Тежест', 'Проблем', 'Детайли', 'Откога'], a.active.map((x) =>
            el('tr', {}, [
              el('td', {}, [pill(sevClass(x.severity), x.severity)]),
              el('td', { text: x.title }),
              el('td', { class: 'muted', text: x.body }),
              el('td', { class: 'muted', text: fmtWhen(new Date(x.since).toISOString()) }),
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
      ]),
      el('div', { class: 'metric-sub', style: 'margin-top:8px', text: 'Резерва, ако ядрото не подава PSI:' }),
      el('div', { class: 'toolbar' }, [thRow('cpuPct', 'CPU', '%'), thRow('memPct', 'Памет', '%')]),
      el('div', { class: 'metric-sub', text: `Праг трябва да се задържи ${a.sustainSamples} проверки (на ${a.checkIntervalSec}s); повторно известие най-рано след ${a.cooldownMin} мин.` }),
      el('div', { class: 'toolbar' }, [el('button', { class: 'btn btn-primary btn-sm', text: 'Запази праговете', onclick: async (e) => {
        e.target.disabled = true;
        const thresholds = {};
        for (const [k, i] of Object.entries(inputs)) {
          const n = Number(i.value);
          if (Number.isFinite(n) && n >= 0) thresholds[k] = n;
        }
        try { await api('/alerts/settings', { method: 'POST', body: { alerts: { thresholds } } }); toast('Праговете са запазени'); go('alerts'); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
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

// Картата за каналите — тайните се ПРАЩАТ, но никога не се четат обратно.
function notifyChannelsCard(a) {
  const f = {};
  const inp = (key, ph) => {
    const i = el('input', { type: 'text', placeholder: ph, class: 'grow' });
    f[key] = i;
    return i;
  };
  return el('div', { class: 'card', style: 'margin-top:16px' }, [
    el('h3', { text: 'Канали за известия' }),
    el('div', { class: 'metric-sub', text: 'Попълни само това, което ползваш. Полетата са празни по подразбиране — тайните не се връщат обратно към браузъра. Празно поле = без промяна.' }),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Telegram' }), inp('tgToken', 'bot token'), inp('tgChat', 'chat id')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'ntfy' }), inp('ntfyServer', 'https://ntfy.sh'), inp('ntfyTopic', 'тема (topic)'), inp('ntfyToken', 'токен (по избор)')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Webhook' }), inp('hook', 'https://…')]),
    el('div', { class: 'toolbar' }, [el('span', { class: 'muted', style: 'width:90px', text: 'Имейл' }), inp('mailTo', 'до: адрес (иска sendmail на сървъра)')]),
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
        try { await api('/alerts/settings', { method: 'POST', body: { notify } }); toast('Каналите са запазени'); go('alerts'); }
        catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      },
    })]),
  ]);
}

// ── Настройки (2FA) ───────────────────────────────────────────────────────────
async function renderSettings() {
  const view = document.getElementById('view');
  const me = await api('/me');
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
                try { await api('/totp/enable', { method: 'POST', body: { code: code.value } }); toast('2FA е включена'); go('settings'); }
                catch (err) { toast(err.message, 'bad'); }
              },
            })]),
          ]));
        } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
      },
    }));
  }
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
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      filter,
      el('label', { class: 'muted' }, [onlyActive, document.createTextNode(' само активни')]),
    ])
  );
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
          el('td', { class: 'mono', text: s.unit }),
          el('td', {}, [pill(s.active === 'active' ? 'ok' : s.active === 'failed' ? 'bad' : 'dim', s.sub || s.active)]),
          el('td', { text: s.enabled || '—' }),
          el('td', { class: 'muted', text: (s.description || '').slice(0, 60) }),
          el('td', {}, [
            svcBtn('restart', s.unit, 'Рестарт'),
            s.active === 'active' ? svcBtn('stop', s.unit, 'Спри', 'btn-danger') : svcBtn('start', s.unit, 'Пусни'),
            el('button', { class: 'btn btn-sm', text: 'Статус', onclick: () => showServiceStatus(s.unit) }),
          ]),
        ])
      );
    body.innerHTML = '';
    body.appendChild(tableEl(['Услуга', 'Състояние', 'Автостарт', 'Описание', ''], rows));
  };
  filter.oninput = draw;
  onlyActive.onchange = draw;
  draw();
}

function svcBtn(action, unit, label, cls = 'btn-sm') {
  return el('button', {
    class: `btn btn-sm ${cls}`,
    text: label,
    onclick: async (e) => {
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
  view.appendChild(el('h3', { class: 'muted', text: `Контейнери (${ov.containers.length})`, style: 'margin:4px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(
        ['Име', 'Образ', 'Състояние', 'CPU', 'Памет', 'Портове', ''],
        ov.containers.map((c) => {
          const st = statMap.get(c.name);
          const running = c.state === 'running';
          return el('tr', {}, [
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

function dockerBtn(action, id, label, cls = 'btn-sm') {
  return el('button', {
    class: `btn btn-sm ${cls}`,
    text: label,
    onclick: async (e) => {
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

  view.appendChild(el('h3', { class: 'muted', text: `Снимки (${bk.dir})`, style: 'margin:22px 0 10px' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Файл', 'Размер', 'Кога'], (bk.dumps || []).map((d) =>
        el('tr', {}, [el('td', { class: 'mono', text: d.name }), el('td', { text: fmtBytes(d.sizeBytes) }), el('td', { class: 'muted', text: fmtWhen(d.mtime) })])
      )),
    ])
  );
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
  const actionSel = el('select', {}, ['allow', 'deny', 'reject', 'limit'].map((a) => el('option', { value: a, text: a })));
  const protoSel = el('select', {}, [el('option', { value: '', text: 'без протокол' }), el('option', { value: 'tcp', text: 'tcp' }), el('option', { value: 'udp', text: 'udp' })]);
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
            try { await api('/firewall/rule/delete', { method: 'POST', body: { num: r.num } }); toast('Изтрито'); go('firewall'); }
            catch (e) { toast(e.message, 'bad'); }
          } })]),
        ])
      )),
    ])
  );
}

// ── Уеб сървър ─────────────────────────────────────────────────────────────────
async function renderWebserver() {
  const view = document.getElementById('view');
  const ws = await api('/webserver');
  view.innerHTML = '';
  if (!ws.nginx && !ws.caddy) {
    view.innerHTML = '<div class="empty">Няма нито Nginx, нито Caddy на този сървър.</div>';
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text: 'Редакцията валидира конфига ПРЕДИ презареждане — счупен конфиг не стига до живия сървър (автоматичен откат).' }));

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

  const cwd = el('input', { type: 'text', value: '/root', style: 'max-width:220px' });
  const screen = el('pre', { class: 'log-out term-screen', tabindex: '0', style: 'height:64vh;outline:none' });
  const status = el('span', { class: 'muted', text: 'няма сесия' });
  // Броят колони се МЕРИ, а не се гадае: сгрешена ширина значи, че всяка TUI
  // програма рисува в грешни колони и изгледът се разпада.
  view.appendChild(screen);
  const cols = measureCols(screen);
  const rows = 30;
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
  view.appendChild(el('div', { class: 'metric-sub', text: 'Щракни в терминала и пиши. Ctrl+C прекъсва, Ctrl+D излиза. Сесия без активност 30 мин се затваря сама.' }));
  paint();
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
  const sortSel = el('select', {}, [
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
  const prio = el('select', {}, [
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
    ])
  );
  const out = el('pre', { class: 'log-out', text: 'Зареди логове…' });
  view.appendChild(out);

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
  const archSel = el('select', {}, [
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
  const fileInput = el('input', { type: 'file', accept: '.zip,.tar.gz,application/zip,application/gzip' });
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
async function renderUpdates() {
  const view = document.getElementById('view');
  const data = await api('/updates');
  view.innerHTML = '';
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn', text: '⟳ apt update', onclick: () => runJob('/updates/refresh', {}, 'apt update') }),
      el('button', { class: 'btn btn-warn', text: '⬆ Security ъпдейти', onclick: () => confirm('Инсталирам security ъпдейтите?') && runJob('/updates/upgrade', { security: true }, 'Security upgrade') }),
      el('button', { class: 'btn btn-warn', text: '⬆ Всички ъпдейти', onclick: () => confirm('Пълен apt upgrade?') && runJob('/updates/upgrade', {}, 'apt upgrade') }),
    ])
  );
  if (data.rebootRequired) view.appendChild(el('div', { class: 'toast warn', style: 'position:static;margin-bottom:14px', text: '⚠ Нужен е рестарт след последните ъпдейти.' }));
  if (!data.available) {
    view.appendChild(el('div', { class: 'empty', text: 'apt недостъпен на този сървър.' }));
    return;
  }
  view.appendChild(el('p', { class: 'section-desc', text: `${data.packages.length} пакета за ъпдейт` }));
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
  const s = await api('/security');
  view.innerHTML = '';
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
                  el('td', {}, [pill(c.daysLeft > 20 ? 'ok' : c.daysLeft > 7 ? 'warn' : 'bad', `${c.daysLeft ?? '?'} дни`)]),
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
      el('div', { class: 'card' }, [
        el('h3', { text: 'Отворени портове' }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Адрес', 'Процес'], (s.listening || []).map((l) =>
            el('tr', {}, [el('td', { class: 'mono', text: l.local }), el('td', { class: 'muted', text: l.process })])
          )),
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
async function renderBackups() {
  const view = document.getElementById('view');
  const b = await api('/backups');
  view.innerHTML = '';
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
  const c = await api('/cron');
  view.innerHTML = '';
  view.appendChild(
    el('div', { class: 'card', style: 'margin-bottom:16px' }, [
      el('h3', { text: 'systemd таймери' }),
      el('div', { class: 'table-wrap' }, [
        tableEl(['Таймер', 'Активира', 'Следващо', 'Последно'], (c.timers || []).map((t) =>
          el('tr', {}, [
            el('td', { class: 'mono', text: t.unit }),
            el('td', { class: 'muted', text: t.activates }),
            el('td', { text: t.next || '—' }),
            el('td', { class: 'muted', text: t.last || '—' }),
          ])
        )),
      ]),
    ])
  );
  view.appendChild(
    el('div', { class: 'grid grid-2' }, [
      el('div', { class: 'card' }, [el('h3', { text: 'root crontab' }), el('pre', { class: 'term-out', text: c.rootCrontab || '(празен)' })]),
      el('div', { class: 'card' }, [el('h3', { text: '/etc/crontab' }), el('pre', { class: 'term-out', text: (c.etcCrontab || []).join('\n') || '(празен)' })]),
    ])
  );
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
  const cwd = el('input', { type: 'text', value: '/root', style: 'max-width:220px' });
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
  const [fleet, tools] = await Promise.all([api('/agents/fleet'), api('/agents/tools')]);
  view.innerHTML = '';
  if (!fleet.available) {
    view.appendChild(el('div', { class: 'empty', text: fleet.error || 'Флотът е недостъпен.' }));
  }

  view.appendChild(el('h3', { class: 'muted', text: 'Инструменти на агентите („ръцете“)', style: 'margin:4px 0 10px' }));
  view.appendChild(
    el('div', { class: 'grid grid-metrics' }, tools.tools.map((t) =>
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: t.title }), pill(t.present ? 'ok' : 'dim', t.present ? 'наличен' : 'липсва')]),
        el('div', { class: 'metric-sub', text: `${t.owner} · ${t.script}` }),
        el('button', {
          class: 'btn btn-sm btn-primary',
          text: '▶ Пусни',
          disabled: !t.present,
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const job = await api('/agents/tools/run', { method: 'POST', body: { tool: t.id } });
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
  const data = await api('/audit?limit=300');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'section-desc', text: 'Одиторски дневник — всяко мутиращо действие (append-only, без тайни).' }));
  view.appendChild(
    el('div', { class: 'table-wrap' }, [
      tableEl(['Кога', 'Действие', 'Детайли', 'Потребител'], data.entries.slice().reverse().map((e) =>
        el('tr', {}, [
          el('td', { class: 'muted', text: fmtWhen(e.ts) }),
          el('td', {}, [pill(actionClass(e.action), e.action || '—')]),
          el('td', { class: 'mono muted', text: auditDetail(e) }),
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
    buildNav();
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
