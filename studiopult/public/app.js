// Студио пулт — страницата. Всичко от агента и от задачите е ДАННИ: рисува се само с textContent, никога
// innerHTML (XSS в пулта = кражба на сесията и самоодобрение на команди). POST-овете носят Origin сами
// (fetch от същия адрес). Сесията е API токен от фрагмента `#t=…` (никога не стига до сървър) → в паметта и
// в sessionStorage (той е по порт — бисквитка стигаше и до други портове на 127.0.0.1) → `Bearer` на всяко /api/*.
'use strict';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const TOKEN = (() => {
  const m = /^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (m) {
    try {
      sessionStorage.setItem('pult', m[1]);
    } catch {
      /* без хранилище — само в паметта */
    }
    history.replaceState(null, '', '/app'); // фрагментът не остава в адреса
    return m[1];
  }
  try {
    return sessionStorage.getItem('pult');
  } catch {
    return null;
  }
})();
const AUTH = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

let current = null; // текущото съобщение на агента
let currentSub = null; // от агента (true) или от диспечера (false)
let duration = 0;

async function api(path, body) {
  const res = await fetch(
    path,
    body === undefined
      ? { headers: AUTH }
      : {
          method: 'POST',
          headers: { ...AUTH, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (res.status === 401) noSession();
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* празно */
  }
  return { ok: res.ok, status: res.status, data };
}

function noSession() {
  $('send').disabled = true;
  if (!$('log').querySelector('.nosession'))
    say(
      'err nosession',
      '',
      'Няма сесия. Отвори наново адреса от терминала (пултът се рестартира или е отворен в друг раздел).',
    );
}

function say(cls, who, text) {
  const li = el('li', `msg ${cls}`);
  if (who) li.append(el('span', 'who', who));
  const body = el('span', 'body', text);
  li.append(body);
  $('log').append(li);
  li.scrollIntoView({ block: 'end' });
  return body;
}

function showBudget(b) {
  if (!b) return;
  const m = $('budget');
  m.textContent = `Днес: $${b.spent.toFixed(2)} от $${b.limit}`;
  m.classList.toggle('warn', b.warn || b.blocked);
  if (b.blocked) m.textContent += ' · спряно (75%)';
}

async function loadAgents() {
  const { data } = await api('/api/agents');
  const sel = $('agent');
  for (const a of data.agents || []) {
    const o = el('option', '', a);
    o.value = a;
    if (a === data.default) o.selected = true;
    sel.append(o);
  }
  const b = await api('/api/budget');
  showBudget(b.data);
}

function approvalCard(e) {
  const card = el('div', 'approval');
  card.append(el('strong', '', `${e.agent ? `${e.agent} · ` : ''}Иска разрешение: ${e.tool}`));
  card.append(el('pre', '', e.detail));
  const row = el('div', 'row');
  const no = el('button', 'ghost', 'Откажи');
  const yes = el('button', '', 'Разреши');
  const decide = async (allow) => {
    yes.disabled = no.disabled = true;
    const r = await api('/api/approve', { requestId: e.requestId, allow });
    card.replaceWith(
      el(
        'p',
        'hint',
        r.ok
          ? allow
            ? `Разрешено: ${e.tool}`
            : `Отказано: ${e.tool}`
          : 'Заявката вече е изтекла.',
      ),
    );
  };
  no.addEventListener('click', () => decide(false));
  yes.addEventListener('click', () => decide(true));
  row.append(no, yes);
  card.append(row);
  $('approvals').append(card);
  card.scrollIntoView({ block: 'nearest' });
}

const toSec = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

function onEvent(e) {
  switch (e.type) {
    case 'chat-start':
      current = null;
      currentSub = null;
      $('send').disabled = true;
      break;
    case 'text':
      // Диспечерът и нашият агент — отделни балони (диспечерът казва само „Готово.“).
      if (!current || currentSub !== e.sub) {
        current = say(e.sub ? 'agent' : 'sys', e.sub ? $('agent').value : '', '');
        currentSub = e.sub;
      }
      current.textContent += e.text;
      break;
    case 'tool':
      say('sys', '', `${e.sub ? 'агентът' : 'диспечерът'} ползва: ${e.name}`);
      current = null;
      break;
    case 'approval':
      approvalCard(e);
      break;
    case 'result':
      say(
        e.ok ? 'sys' : 'err',
        '',
        `${e.ok ? 'Готово' : `Спря: ${e.error}`} · $${e.cost.toFixed(2)}`,
      );
      break;
    case 'error':
      say('err', '', e.message);
      break;
    case 'chat-end':
      $('send').disabled = false;
      $('approvals').replaceChildren();
      current = null;
      showBudget(e.budget);
      break;
    case 'task-started':
      $('task-log').textContent = '';
      $('progress').hidden = false;
      $('bar').style.width = '0';
      $('progress-text').textContent = `Тече (pid ${e.pid ?? '?'})`;
      break;
    case 'task-progress':
      if (e.time) {
        const pct = duration ? Math.min(100, (toSec(e.time) / duration) * 100) : 0;
        $('bar').style.width = `${pct}%`;
        $('progress-text').textContent = `кадър ${e.frame ?? '—'} · ${e.time}`;
      }
      break;
    case 'task-line': {
      const m = /Duration:\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(e.text);
      if (m) duration = toSec(m[1]);
      $('task-log').textContent += `${e.text}\n`;
      $('task-log').scrollTop = $('task-log').scrollHeight;
      break;
    }
    case 'task-done':
      $('progress-text').textContent = e.code === 0 ? 'Готово' : `Спря (код ${e.code})`;
      if (e.code === 0) $('bar').style.width = '100%';
      break;
  }
}

// SSE през fetch (EventSource не праща заглавия). Събитията са редове `data: …`, разделени с празен ред.
async function connect() {
  try {
    const res = await fetch('/api/events', { headers: AUTH });
    if (res.status === 401) return noSession();
    if (!res.ok || !res.body) throw new Error(String(res.status));
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (!data) continue;
        try {
          onEvent(JSON.parse(data));
        } catch {
          /* повредено събитие — пропусни */
        }
      }
    }
  } catch {
    /* прекъсната връзка — опитай пак */
  }
  setTimeout(connect, 2000);
}

$('say').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  say('me', 'ти', text);
  $('text').value = '';
  const body = { agent: $('agent').value, text };
  if ($('keep').checked) body.keep = true; // сървърът добавя предишния ход като контекст
  const r = await api('/api/chat', body);
  if (!r.ok) say('err', '', r.data.error || `Грешка ${r.status}`);
});
$('text').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) $('say').requestSubmit();
});
$('stop').addEventListener('click', () => api('/api/chat/stop', {}));

const showFields = () => {
  const t = $('task-id').value;
  document.querySelector('.f-in').hidden = t === 'doctor' || t === 'frames';
  document.querySelector('.f-pattern').hidden = t !== 'frames';
  document.querySelector('.f-out').hidden = t === 'doctor';
};
$('task-id').addEventListener('change', showFields);
showFields();

$('task').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const task = $('task-id').value;
  const body = { task };
  if (task !== 'doctor') {
    if (task === 'frames') body.pattern = $('t-pattern').value.trim();
    else body.in = $('t-in').value.trim();
    body.out = $('t-out').value.trim();
    if ($('t-run').checked) body.run = true;
    if ($('t-force').checked) body.force = true;
  }
  const r = await api('/api/task', body);
  if (r.status === 409 && r.data.code === 'confirm') {
    // Истинско пускане или презапис: изрично второ потвърждение с видимия списък на стъпките.
    const box = el('div', 'approval');
    box.append(
      el(
        'strong',
        '',
        `Потвърди: ${task}${body.run ? ' · пуска ffmpeg' : ''}${body.force ? ' · презаписва изхода' : ''}`,
      ),
    );
    box.append(el('pre', '', JSON.stringify(body, null, 2)));
    const row = el('div', 'row');
    const no = el('button', 'ghost', 'Откажи');
    const yes = el('button', '', 'Потвърди и пусни');
    no.addEventListener('click', () => box.remove());
    yes.addEventListener('click', async () => {
      yes.disabled = no.disabled = true;
      const x = await api('/api/task', { ...body, confirm: true });
      box.remove();
      if (!x.ok) $('task-log').textContent = x.data.error || `Грешка ${x.status}`;
    });
    row.append(no, yes);
    box.append(row);
    $('task').after(box);
    return;
  }
  if (!r.ok) $('task-log').textContent = r.data.error || `Грешка ${r.status}`;
});
$('t-stop').addEventListener('click', () => api('/api/task/stop', {}));

$('preview-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const p = $('preview-path').value.trim();
  if (!p) return;
  const box = $('preview');
  box.replaceChildren();
  // `<video src>` не праща заглавия → сървърът дава подписан адрес за този път, валиден 10 минути.
  const link = await api(`/api/file-link?path=${encodeURIComponent(p)}`);
  if (!link.ok) {
    box.append(el('p', 'hint', link.data.error || `Грешка ${link.status}`));
    return;
  }
  const src = link.data.url;
  const isImg = /\.(png|jpe?g|webp)$/i.test(p);
  const isAudio = /\.wav$/i.test(p);
  const m = el(isImg ? 'img' : isAudio ? 'audio' : 'video');
  m.src = src;
  if (!isImg) m.controls = true;
  else m.alt = p;
  box.append(m);
});

$('selfcheck').addEventListener('click', async () => {
  const out = $('selfcheck-out');
  out.textContent = 'Проверявам…';
  const r = await api('/api/selfcheck', {});
  out.className = r.ok && r.data.ok ? 'ok' : 'bad';
  out.textContent = r.ok ? r.data.detail : r.data.error || `Грешка ${r.status}`;
});

loadAgents();
connect();
