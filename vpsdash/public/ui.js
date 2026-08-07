// Малки DOM/формат помощници (без библиотеки).
//
// Преводът живее ТУК, не в 5000-те реда на app.js: всичко текстово минава през
// el()/toast(), значи едно място превежда целия интерфейс. Виж i18n.js за защо
// ключът е самият български низ.
import { t, tf, langTag } from './i18n.js';
const tHelper = t;

// Иконите на действията: познат глиф В НАЧАЛОТО на текста на БУТОН се подменя с
// картинка от /icons/. Подмяната е тук (не по call-sites) по същата причина, по
// която преводът е тук: едно място покрива целия интерфейс. Ключовете в
// i18n-dict.js остават С глифа — преводът върви първи, после рендерът подменя.
// Навигацията НЕ минава оттук (иконата ѝ е отделен span.ico) — тя чака своя
// комплект nav-*.
const GLYPH_ICONS = {
  '👁': 'act-view', '✉': 'act-send', '▶': 'act-play', '⏵': 'act-play', '▷': 'act-play',
  '■': 'act-stop', '↻': 'act-restart', '↺': 'act-restart', '⟲': 'act-restart', '⟳': 'act-restart',
  '⬇': 'act-download', '⇩': 'act-download', '⬆': 'act-upload', '⇪': 'act-upload', '⇧': 'act-upload',
  '💾': 'act-save', '⌕': 'act-search', '🔎': 'act-search', '🔍': 'act-search',
  '🔕': 'act-mute', '🧹': 'act-clean', '📁': 'act-folder', '🗀': 'act-folder', '📄': 'act-file',
  '🔗': 'act-link', '↗': 'act-open', '←': 'act-back', '↩': 'act-back', '⛶': 'act-fullscreen',
  '🔧': 'act-tools', '🔑': 'act-key', '🗝': 'act-key', '🔐': 'act-key-lock', '🔒': 'act-key-lock',
  '🤖': 'act-robot', '⛑': 'act-helmet', '⚖': 'act-scales', 'ⓘ': 'act-info',
};

function iconize(node) {
  const first = node.firstChild;
  if (!first || first.nodeType !== Node.TEXT_NODE) return;
  const s = first.nodeValue || '';
  for (const [glyph, name] of Object.entries(GLYPH_ICONS)) {
    if (!s.startsWith(glyph)) continue;
    let rest = s.slice(glyph.length);
    if (rest.startsWith('️')) rest = rest.slice(1); // variation selector след емоджи
    rest = rest.replace(/^\s+/, '');
    const img = document.createElement('img');
    img.src = `/icons/${name}.png`;
    img.alt = '';
    img.className = 'ico-img' + (rest ? ' ico-gap' : '');
    first.nodeValue = rest;
    node.insertBefore(img, first);
    return;
  }
}

// Създава елемент. props: {class, text, html, style, onclick, ... останалите → атрибути}
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = t(v);
    // `raw` = текст, който НЕ е наш низ: име на агент, път до скрипт, изход на
    // чужда команда. Прекарването му през речника е безсмислено (никога няма да
    // има превод) и вредно — трупа се в списъка с „непреведени" и заглушава
    // истинските пропуски. Собствено име не се превежда на никой език.
    else if (k === 'raw') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'disabled') node.disabled = Boolean(v);
    else if (k === 'value') node.value = v;
    else if (k === 'title' || k === 'placeholder' || k === 'aria-label') node.setAttribute(k, t(v));
    else node.setAttribute(k, v);
  }
  appendChildren(node, children);
  if (tag === 'button') iconize(node);
  return node;
}

// Приема Node, низ/число (стават текст) и вложени масиви. По-рано подаден масив
// (напр. редове от <td> вместо <tr>) хвърляше „parameter 1 is not of type 'Node'"
// и оставяше ЦЯЛАТА секция празна — грешка, която се вижда само в браузър.
function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) appendChildren(node, c);
    else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(t(String(c))));
    else if (c.nodeType) node.appendChild(c);
    // Всичко останало се пропуска мълчаливо — по-добре липсващ ред, отколкото
    // счупена секция.
  }
}

export function pill(kind, text) {
  const map = { ok: 'pill-ok', bad: 'pill-bad', warn: 'pill-warn', dim: 'pill-dim' };
  return el('span', { class: `pill ${map[kind] || 'pill-dim'}`, text: String(text) });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// „—" за НЕИЗМЕРЕНО. `Number(null) || 0` даваше „0 B" — число, което изглежда
// като измерено. Разликата личи най-ясно при мрежата: „0 B/s" значи „нищо не
// минава", а „—" значи „още не знам" (първата проба след рестарт няма делта).
export function fmtBytes(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

export function fmtBps(n) {
  const b = fmtBytes(n);
  return b === '—' ? b : b + '/s';
}

// Процент за плочките: `null` е „—", не „0%". Табло, което твърди 0% CPU,
// докато не знае, е по-лошо от табло, което си признава.
export function pctHtml(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? `${v.toFixed(0)}<small>%</small>`
    : '<small>—</small>';
}

// Процент заета памет от ЖИВА снимка (историята има друга форма — виж
// `memPercent` в src/history.js). Връща null, когато липсва измерване.
export function memPctOf(mem) {
  return mem && typeof mem.used === 'number' && mem.total ? (mem.used / mem.total) * 100 : null;
}

// Съгласуване по число. В българския „1" иска ЕДИНСТВЕНО число, а шаблонът
// `${n} точки` дава „1 точки" — точно в най-честия случай: прясно пуснат панел,
// първи запис, единствен диск. Не чупи нищо, не пада тест, вижда се само от
// човека на екрана — и подкопава доверието точно когато панелът трябва да звучи
// авторитетно.
//
// Преводът работи както винаги: „⟦0⟧ точка" и „⟦0⟧ точки" са два РАЗЛИЧНИ
// шаблона в речника, което е вярно — английският и италианският имат свои
// правила и не бива да наследяват нашите.
export function plural(n, one, many) {
  const num = Number(n);
  return `${n} ${num === 1 ? one : many}`;
}

export function fmtUptime(sec) {
  sec = Math.floor(Number(sec) || 0);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}д`);
  if (h) parts.push(`${h}ч`);
  parts.push(`${m}м`);
  return parts.join(' ');
}

// Връща ПРЕВЕДЕН текст. Дотук връщаше български („преди малко") и разчиташе, че
// някой по-нагоре ще го преведе — което работи, само докато резултатът отива
// направо в `el({text})`. Слепен в изречение („Най-старият запис е от X."),
// сглобката става низ, който го няма в речника: половин английски, половин
// български, и цялото се брои за непреведено.
export function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff >= 0 && diff < 60) return tHelper('преди малко');
  if (diff >= 0 && diff < 3600) return tHelper(`преди ${Math.floor(diff / 60)} мин`);
  if (diff >= 0 && diff < 86400) return tHelper(`преди ${Math.floor(diff / 3600)} ч`);
  return d.toLocaleString(langTag(), { dateStyle: 'short', timeStyle: 'short' });
}

// ── Команден палет (Ctrl/Cmd+K) ───────────────────────────────────────────────
// Регистър от действия, който всяка секция допълва докато рисува. При толкова секции и
// десетки действия това е най-бързият път до каквото и да е — без кликане.
const commands = [];
const RECENT_KEY = 'csd.recent-commands';

export function clearCommands(scope) {
  for (let i = commands.length - 1; i >= 0; i--) {
    if (commands[i].scope === scope) commands.splice(i, 1);
  }
}

export function registerCommand(cmd) {
  commands.push(cmd);
}

// Прост subsequence scorer — без библиотека. Награждава съвпадения в началото на
// дума и последователни знаци, за да излиза очакваното най-отгоре.
export function fuzzyScore(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 1000 - t.indexOf(q);
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - Math.min(found - ti, 10);
    ti = found + 1;
  }
  return score;
}

function recentIds() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function rememberCommand(id) {
  try {
    const list = [id, ...recentIds().filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* без история — не е фатално */
  }
}

export function openPalette() {
  let dlg = document.getElementById('palette');
  if (!dlg) {
    // Нативният <dialog> носи фокус капан и ::backdrop даром — нула JS механика.
    dlg = el('dialog', { id: 'palette', class: 'palette' }, [
      el('input', { id: 'palette-input', type: 'text', placeholder: 'Търси действие или секция…', autocomplete: 'off' }),
      el('div', { id: 'palette-list', class: 'palette-list' }),
      el('div', { class: 'palette-hint', text: '↑↓ навигация · Enter изпълнява · Esc затваря' }),
    ]);
    document.body.appendChild(dlg);
  }
  const input = dlg.querySelector('#palette-input');
  const list = dlg.querySelector('#palette-list');
  let items = [];
  let active = 0;

  const draw = () => {
    const q = input.value;
    const recent = recentIds();
    items = commands
      .map((c) => {
        const hay = `${c.label} ${t(c.label)} ${c.section || ''} ${c.keywords || ''}`;
        const base = fuzzyScore(q, hay);
        if (!base) return null;
        const boost = !q && recent.includes(c.id) ? 5000 - recent.indexOf(c.id) : 0;
        return { cmd: c, score: base + boost };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.cmd);
    if (active >= items.length) active = Math.max(0, items.length - 1);
    list.innerHTML = '';
    items.forEach((c, i) => {
      const row = el('button', { class: 'palette-item' + (i === active ? ' active' : ''), type: 'button' }, [
        el('span', { class: 'pi-label', text: c.label }),
        c.section ? el('span', { class: 'pi-section', text: c.section }) : null,
        c.hint ? el('kbd', { text: c.hint }) : null,
      ]);
      row.addEventListener('click', () => run(c));
      list.appendChild(row);
    });
    if (!items.length) list.appendChild(el('div', { class: 'empty', text: 'Няма съвпадение' }));
  };

  const run = (c) => {
    rememberCommand(c.id);
    dlg.close();
    try {
      c.run();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  input.value = '';
  active = 0;
  draw();
  input.oninput = () => {
    active = 0;
    draw();
  };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      draw();
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      draw();
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) run(items[active]);
    }
  };
  if (!dlg.open) dlg.showModal();
  input.focus();
}

// ── Жив поток с преизграждане на връзката ─────────────────────────────────────
// EventSource сам пробва да се свърже пак, но без видимо състояние и без таван.
// Тук: 3 състояния за индикатора + експоненциален backoff с таван 30s.
export function liveStream(url, { events = {}, onStatus = () => {} } = {}) {
  let es = null;
  let attempt = 0;
  let stopped = false;
  let timer = null;

  const connect = () => {
    if (stopped) return;
    es = new EventSource(url);
    es.onopen = () => {
      attempt = 0;
      onStatus('live');
    };
    for (const [name, fn] of Object.entries(events)) es.addEventListener(name, fn);
    es.onerror = () => {
      if (stopped) return;
      es.close();
      onStatus(attempt === 0 ? 'connecting' : 'down');
      const delay = Math.min(30000, 1000 * 2 ** attempt++);
      timer = setTimeout(connect, delay);
    };
  };
  connect();

  return {
    close() {
      stopped = true;
      clearTimeout(timer);
      if (es) es.close();
      onStatus('off');
    },
  };
}

// ── Потвърждение за опасно действие ───────────────────────────────────────────
// Патърнът на GitHub: бутонът стои изключен, докато не изпишеш точното име. Пази
// от рефлекторно кликане при неща като poweroff, SIGKILL и `compose down`.
export function confirmDanger({ title, what, expect, confirmLabel = 'Потвърди', delayMs = 0 }) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', placeholder: expect, autocomplete: 'off' });
    const btn = el('button', { class: 'btn btn-danger', text: confirmLabel, disabled: true });
    const dlg = el('dialog', { class: 'confirm-dlg' }, [
      el('h3', { text: title }),
      el('div', { class: 'confirm-what' }, (Array.isArray(what) ? what : [what]).map((w) => el('div', {}, ['• ', t(w)]))),
      el('label', { class: 'muted' }, [
        document.createTextNode(tf('Изпиши „%s“, за да потвърдиш:', expect)),
        input,
      ]),
      el('div', { class: 'toolbar' }, [
        btn,
        el('button', { class: 'btn btn-sm', text: 'Откажи', onclick: () => { dlg.close(); cleanup(false); } }),
      ]),
    ]);
    document.body.appendChild(dlg);

    let timeLocked = delayMs > 0;
    if (timeLocked) {
      // Секунда „изстиване" срещу мускулна памет при необратимите действия.
      setTimeout(() => {
        timeLocked = false;
        check();
      }, delayMs);
    }
    const check = () => {
      btn.disabled = timeLocked || input.value.trim() !== expect;
    };
    input.oninput = check;
    btn.onclick = () => {
      dlg.close();
      cleanup(true);
    };
    dlg.addEventListener('cancel', () => cleanup(false));

    let done = false;
    function cleanup(ok) {
      if (done) return;
      done = true;
      setTimeout(() => dlg.remove(), 0);
      resolve(ok);
    }
    dlg.showModal();
    input.focus();
  });
}

let toastTimer = null;
export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.className = 'toast' + (kind === 'bad' ? ' bad' : kind === 'warn' ? ' warn' : '');
  t.textContent = tHelper(msg);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}
