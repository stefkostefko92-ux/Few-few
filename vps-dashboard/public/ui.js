// Малки DOM/формат помощници (без библиотеки).

// Създава елемент. props: {class, text, html, style, onclick, ... останалите → атрибути}
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'disabled') node.disabled = Boolean(v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

export function pill(kind, text) {
  const map = { ok: 'pill-ok', bad: 'pill-bad', warn: 'pill-warn', dim: 'pill-dim' };
  return el('span', { class: `pill ${map[kind] || 'pill-dim'}`, text: String(text) });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtBytes(n) {
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
  return fmtBytes(n) + '/s';
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

export function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff >= 0 && diff < 60) return 'преди малко';
  if (diff >= 0 && diff < 3600) return `преди ${Math.floor(diff / 60)} мин`;
  if (diff >= 0 && diff < 86400) return `преди ${Math.floor(diff / 3600)} ч`;
  return d.toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' });
}

let toastTimer = null;
export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  t.className = 'toast' + (kind === 'bad' ? ' bad' : kind === 'warn' ? ' warn' : '');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}
