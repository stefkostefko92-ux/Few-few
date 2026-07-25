// Carbon Stealth VPS Dashboard — клиент (vanilla ES modules, нула зависимости).
import { el, fmtBytes, fmtBps, fmtUptime, fmtWhen, pill, toast, escapeHtml } from './ui.js';

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
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error || 'Грешка');
    });
    await boot();
  } catch (e2) {
    err.textContent = e2.message;
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
  { id: 'services', ico: '⚙', label: 'Услуги', render: renderServices },
  { id: 'docker', ico: '⬢', label: 'Docker', render: renderDocker },
  { id: 'processes', ico: '≡', label: 'Процеси', render: renderProcesses },
  { id: 'logs', ico: '☰', label: 'Логове', render: renderLogs },
  { id: 'deploy', ico: '⇧', label: 'Деплой', render: renderDeploy },
  { id: 'updates', ico: '⟳', label: 'Ъпдейти', render: renderUpdates },
  { id: 'security', ico: '⛨', label: 'Сигурност', render: renderSecurity },
  { id: 'backups', ico: '⇩', label: 'Бекъпи', render: renderBackups },
  { id: 'cron', ico: '◷', label: 'Крон/таймери', render: renderCron },
  { id: 'files', ico: '🗀', label: 'Файлове', render: renderFiles },
  { id: 'terminal', ico: '⌘', label: 'Терминал', render: renderTerminal },
  { id: 'agents', ico: '✦', label: 'Агенти', render: renderAgents },
  { id: 'jobs', ico: '⏻', label: 'Задачи', render: renderJobs },
  { id: 'audit', ico: '✎', label: 'Одит', render: renderAudit },
  { id: 'power', ico: '⏼', label: 'Захранване', render: renderPower },
];

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  for (const s of SECTIONS) {
    const b = el('button', { onclick: () => go(s.id) }, [
      el('span', { class: 'ico', text: s.ico }),
      el('span', { text: s.label }),
    ]);
    b.dataset.id = s.id;
    nav.appendChild(b);
  }
}

function go(id) {
  state.section = id;
  stopMetrics();
  closeSectionStream();
  for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('active', b.dataset.id === id);
  const s = SECTIONS.find((x) => x.id === id);
  document.getElementById('section-title').textContent = s.label;
  document.getElementById('view').innerHTML = '<div class="loading">Зареждам…</div>';
  document.querySelector('.sidebar').classList.remove('open');
  s.render().catch((e) => {
    document.getElementById('view').innerHTML = `<div class="empty">Грешка: ${escapeHtml(e.message)}</div>`;
  });
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
  const [ov, hist] = await Promise.all([api('/overview'), api('/metrics/history')]);
  state.hist = hist.points || [];
  const m = ov.metrics;
  const info = ov.info;

  view.innerHTML = '';
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
          m.disks.map((d) => [
            el('td', { class: 'mono', text: d.fs }),
            el('td', { text: d.mount }),
            el('td', { text: fmtBytes(d.usedBytes) }),
            el('td', { text: fmtBytes(d.totalBytes) }),
            el('td', {}, [barEl(d.usePercent)]),
          ])
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
  const es = new EventSource(sseUrl('/stream/metrics'));
  state.metricsEs = es;
  document.getElementById('conn-dot').classList.add('live');
  es.addEventListener('metrics', (e) => {
    try {
      onSnap(JSON.parse(e.data));
    } catch {
      /* игнор */
    }
  });
  es.onerror = () => document.getElementById('conn-dot').classList.remove('live');
}
function stopMetrics() {
  if (state.metricsEs) {
    state.metricsEs.close();
    state.metricsEs = null;
  }
  document.getElementById('conn-dot').classList.remove('live');
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

// ── Услуги ───────────────────────────────────────────────────────────────────────
async function renderServices() {
  const view = document.getElementById('view');
  const data = await api('/services');
  view.innerHTML = '';
  if (!data.available) {
    view.innerHTML = `<div class="empty">systemd недостъпен: ${escapeHtml(data.error || '')}</div>`;
    return;
  }
  const filter = el('input', { type: 'search', placeholder: 'Филтър по име…', class: 'grow' });
  const onlyActive = el('input', { type: 'checkbox' });
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      filter,
      el('label', { class: 'muted' }, [onlyActive, document.createTextNode(' само активни')]),
    ])
  );
  const body = el('div', { class: 'table-wrap' });
  view.appendChild(body);

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

// ── Процеси ────────────────────────────────────────────────────────────────────────
async function renderProcesses() {
  const view = document.getElementById('view');
  const sortSel = el('select', {}, [
    el('option', { value: 'cpu', text: 'Подреди по CPU' }),
    el('option', { value: 'mem', text: 'Подреди по памет' }),
  ]);
  view.innerHTML = '';
  view.appendChild(el('div', { class: 'toolbar' }, [sortSel]));
  const body = el('div', { class: 'table-wrap' });
  view.appendChild(body);
  const load = async () => {
    const data = await api(`/processes?sort=${sortSel.value}`);
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
  };
  sortSel.onchange = load;
  await load();
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
        out.textContent += e.data;
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

  view.appendChild(
    el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      el('div', { class: 'card' }, [
        el('h3', { text: 'Releases' }),
        el('div', { class: 'crumbs', text: 'current → ' + (st.current || '—') }),
        el('div', { class: 'table-wrap' }, [
          tableEl(['Release', 'Дата'], (st.releases || []).slice(0, 20).map((r) =>
            el('tr', {}, [el('td', { class: 'mono', text: r.name }), el('td', { class: 'muted', text: fmtWhen(r.mtime) })])
          )),
        ]),
      ]),
      el('div', { class: 'card' }, [
        el('h3', { text: 'Качени архиви (/root)' }),
        st.archives.length
          ? el('div', { class: 'table-wrap' }, [
              tableEl(['Архив', 'Размер', 'Качен'], st.archives.map((a) =>
                el('tr', {}, [el('td', { class: 'mono', text: a.name }), el('td', { text: fmtBytes(a.sizeBytes) }), el('td', { class: 'muted', text: fmtWhen(a.mtime) })])
              )),
            ])
          : el('div', { class: 'empty', text: 'Няма качени архиви — качи GitHub ZIP в /root.' }),
      ]),
    ])
  );
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
    setModalOut(r.binary ? `(бинарен файл, ${fmtBytes(r.sizeBytes)})` : r.content + (r.truncated ? '\n\n… (отрязан)' : ''));
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
        out.textContent += ev.data;
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
  view.appendChild(
    el('div', { class: 'toolbar' }, [
      el('button', {
        class: 'btn btn-warn',
        text: '⟳ Рестарт (reboot)',
        onclick: () => confirm('Наистина рестартирам сървъра? Панелът ще прекъсне.') && power('reboot'),
      }),
      el('button', {
        class: 'btn btn-danger',
        text: '⏻ Изключване (poweroff)',
        onclick: () => confirm('ИЗКЛЮЧВАМ сървъра? Ще трябва ръчно да го пуснеш от хостинга!') && power('poweroff'),
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
    out.textContent += e.data;
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
async function boot() {
  try {
    const me = await api('/me');
    state.me = me;
    showApp();
    document.getElementById('host-badge').textContent = me.nodeName;
    document.getElementById('ver').textContent = 'v' + me.version;
    buildNav();
    await loadNodes();
    go('overview');
  } catch {
    showLogin();
  }
}
boot();
