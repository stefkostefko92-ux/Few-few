// Отговорко — панелът. Само textContent (без innerHTML): писмото на клиента е чужд текст.
const $ = (sel) => document.querySelector(sel);

const CLS = {
  question: 'въпрос',
  technical: 'техническо',
  payment: 'плащане',
  complaint: 'жалба',
  dsar: 'лични данни (DSAR)',
  legal: 'правно',
  spam: 'спам',
};
const STATUS = {
  new: 'чака чернова',
  drafting: 'пише се',
  drafted: 'чернова',
  draft_failed: 'без чернова — пиши сам',
  needs_human: 'чака теб',
  sent: 'пратено',
  closed: 'затворено',
};
const HUMAN_NOTE = {
  dsar: 'Искане по GDPR: отговор до 1 месец (чл. 12(3)), първо проверка на самоличността. Ползвай умението dsar-response в Claude Code — то прави черновата на потвърждението и на отговора.',
  legal: 'Правно писмо: без AI чернова. Не признавай нищо писмено; при нужда — юрист.',
};

async function api(path, body, method) {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (res.status === 401 && path !== '/api/auth/login') showLogin();
  return res;
}

function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

async function errorText(res) {
  try {
    return (await res.json()).error ?? 'Грешка.';
  } catch {
    return 'Грешка.';
  }
}

function showLogin() {
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#logout').hidden = true;
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#logout').hidden = false;
  void loadList();
  void loadVoice();
}

const when = (iso) =>
  new Date(iso).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' });

async function loadList() {
  const out = $('#list');
  const res = await api('/api/tickets');
  if (!res.ok) return out.replaceChildren(el('p', await errorText(res), 'msg'));
  const { tickets } = await res.json();
  if (!tickets.length) return out.replaceChildren(el('p', 'Няма писма.', 'msg'));
  const ul = el('ul', undefined, 'tickets');
  for (const t of tickets) {
    const li = el('li');
    const b = el('button', undefined, `ticket ${t.risky ? 'risky' : ''}`);
    b.type = 'button';
    b.append(
      el('strong', t.subject || '(без тема)'),
      el('span', ` · ${t.from.name ?? t.from.address} · ${when(t.receivedAt)}`),
      el('span', ` · ${CLS[t.cls]}${t.risky ? ' ⚠' : ''} · ${STATUS[t.status]}`, `st-${t.status}`),
    );
    b.addEventListener('click', () => void openTicket(t.id));
    li.append(b);
    ul.append(li);
  }
  out.replaceChildren(ul);
}

async function openTicket(id) {
  const box = $('#detail');
  box.hidden = false;
  const res = await api(`/api/tickets/${id}`);
  if (!res.ok) return box.replaceChildren(el('p', await errorText(res), 'msg'));
  const t = await res.json();
  const head = el('div', undefined, 'ticket-head');
  head.append(
    el('h2', t.subject || '(без тема)'),
    el(
      'p',
      `${t.from.name ?? ''} <${t.from.address}> · ${when(t.receivedAt)} · ${CLS[t.cls]} · ${STATUS[t.status]}`,
      'sub',
    ),
  );
  const original = el('pre', t.text, 'mail');
  const parts = [head, el('h3', 'Писмото'), original];
  if (t.attachments.length) {
    parts.push(
      el('p', `Прикачени (не се пазят): ${t.attachments.map((a) => a.name).join(', ')}`, 'sub'),
    );
  }
  if (HUMAN_NOTE[t.cls]) parts.push(el('p', HUMAN_NOTE[t.cls], 'r-action'));

  const form = el('form', undefined, 'reply');
  const text = el('textarea');
  text.name = 'text';
  text.rows = 12;
  text.value = t.draft ?? '';
  text.readOnly = t.status === 'sent' || t.status === 'closed';
  const label = el(
    'label',
    t.status === 'sent' ? 'Пратеният отговор' : 'Отговорът (поправи го)',
    'wide',
  );
  label.append(text);
  form.append(label);
  const msg = el('p', '', 'msg');
  msg.setAttribute('role', 'status');

  if (!text.readOnly) {
    let risk = null;
    if (t.risky) {
      risk = el('input');
      risk.type = 'checkbox';
      const rl = el(
        'label',
        'Прочетох го втори път — пари, жалба, лични данни или правно',
        'check wide',
      );
      rl.prepend(risk);
      form.append(rl);
    }
    const copy = el('button', 'Копирай отговора');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const all = `До: ${t.from.address}\nТема: Re: ${t.subject}\n\n${text.value}`;
      try {
        await navigator.clipboard.writeText(all);
        msg.textContent = 'Копирано. Прати го от своята поща.';
      } catch {
        text.select();
      }
    });
    const save = el('button', 'Запази черновата');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const r = await api(`/api/tickets/${t.id}/draft`, { text: text.value }, 'PUT');
      msg.textContent = r.ok ? 'Запазено.' : await errorText(r);
    });
    const sent = el('button', 'Отбележи като пратено');
    sent.type = 'submit';
    const close = el('button', 'Затвори без отговор', 'secondary');
    close.type = 'button';
    close.addEventListener('click', async () => {
      const r = await api(`/api/tickets/${t.id}/close`, {});
      msg.textContent = r.ok ? 'Затворено.' : await errorText(r);
      if (r.ok) void loadList();
    });
    form.append(copy, save, sent, close, msg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = { text: text.value };
      if (risk) body.confirmRisk = risk.checked;
      const r = await api(`/api/tickets/${t.id}/sent`, body);
      msg.textContent = r.ok ? 'Отбелязано като пратено.' : await errorText(r);
      if (r.ok) {
        void loadList();
        void openTicket(t.id);
      }
    });
  } else if (t.status === 'sent') {
    const sample = el('button', 'Направи го образец за гласа');
    sample.type = 'button';
    sample.addEventListener('click', async () => {
      const r = await api(`/api/tickets/${t.id}/sample`, {});
      msg.textContent = r.ok ? 'Добавено към образците.' : await errorText(r);
      if (r.ok) void loadVoice();
    });
    form.append(sample, msg);
  }
  parts.push(form);
  box.replaceChildren(...parts);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadVoice() {
  const v = await api('/api/voice');
  if (v.ok) $('#voice-form textarea').value = (await v.json()).text;
  const s = await api('/api/samples');
  const box = $('#samples');
  if (!s.ok) return;
  const { samples } = await s.json();
  box.replaceChildren(el('h3', `Образци (${samples.length}; до 5 влизат в черновата)`));
  for (const x of samples) {
    const row = el('div', undefined, 'sample');
    const del = el('button', 'Махни', 'secondary');
    del.type = 'button';
    del.addEventListener('click', async () => {
      await api(`/api/samples/${x.id}`, undefined, 'DELETE');
      void loadVoice();
    });
    row.append(el('pre', x.text, 'mail'), del);
    box.append(row);
  }
}

$('#voice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('/api/voice', { text: new FormData(e.target).get('text') }, 'PUT');
  e.target.querySelector('.msg').textContent = r.ok ? 'Запазено.' : await errorText(r);
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/api/auth/login', {
    email: f.get('email'),
    password: f.get('password'),
    code: String(f.get('code')).replace(/\s/g, ''),
  });
  if (res.ok) {
    e.target.reset();
    showApp();
  } else e.target.querySelector('.msg').textContent = await errorText(res);
});

$('#logout').addEventListener('click', async () => {
  await api('/api/auth/logout', {});
  showLogin();
});

setInterval(() => {
  if (!$('#app').hidden) void loadList();
}, 30_000);

(async () => {
  const res = await api('/api/me');
  if (res.ok) showApp();
  else showLogin();
})();
