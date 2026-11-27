// Ловец — страницата. Само textContent (без innerHTML); всичко минава през API-то с бисквитката.
const $ = (sel) => document.querySelector(sel);

const DECISION = {
  allowed: ['Може', 'ok'],
  needs_action: ['Може след действие', 'warn'],
  blocked: ['Не може', 'stop'],
};
const CHANNEL = {
  email: 'имейл',
  phone: 'телефон',
  form: 'форма за контакт',
  linkedin: 'LinkedIn',
};
const MARKET = { BG: 'България', IT: 'Италия' };

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
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

function showLogin() {
  $('#login').hidden = false;
  $('#app').hidden = true;
  $('#logout').hidden = true;
}

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#logout').hidden = false;
}

const isoFromLocal = (v) => new Date(v).toISOString();

function say(form, text) {
  form.querySelector('.msg').textContent = text;
}

async function errorText(res) {
  try {
    const j = await res.json();
    return j.error ?? 'Грешка.';
  } catch {
    return 'Грешка.';
  }
}

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
  } else say(e.target, await errorText(res));
});

$('#logout').addEventListener('click', async () => {
  await api('/api/auth/logout', {});
  showLogin();
});

// Последната проверка — черновата я пуска наново на сървъра (клиентът не носи присъда).
let lastCheck = null;

const DRAFT_ERRORS = {
  not_email: 'Черновата е само за имейл.',
  not_allowed: 'Проверката вече не е „Може“ — черновата е отказана.',
  source_mismatch: 'Източникът се различава от проверения.',
  source_stale:
    'Адресът е видян преди повече от месец (чл. 14(3)(а) ОРЗД) — провери източника наново.',
  seen_in_future: 'Датата „видян на“ е в бъдещето.',
  notice_url_missing:
    'Няма публично известие (LOVETS_NOTICE_URL) — без него писмото не може да тръгне.',
  unsub_key_missing: 'Няма ключ за отписване (LOVETS_UNSUB_KEY) на сървъра.',
  slots_invalid: 'Трябват точно 3 различни часа, поне час напред.',
  tracking_or_html: 'Без HTML и без връзки с параметри (?, #, utm) — те проследяват.',
  blocks_missing: 'Липсва задължителен блок в писмото.',
};

const toLocalInput = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function field(label, input) {
  const l = el('label', label);
  l.append(input);
  return l;
}

function input(name, attrs = {}) {
  const i = el(attrs.textarea ? 'textarea' : 'input');
  i.name = name;
  for (const [k, v] of Object.entries(attrs)) if (k !== 'textarea') i.setAttribute(k, v);
  return i;
}

/** Формата за черновата на първия имейл — само при „Може“ за имейл. */
async function draftForm(v, check) {
  const form = el('form', undefined, 'draft');
  const today = new Date().toISOString().slice(0, 10);
  form.append(
    el(
      'p',
      'Чернова на първия имейл — ти я прочиташ, копираш и пращаш от своята поща. Ловецът не праща нищо.',
      'req-title',
    ),
    field(
      'Тема (на какво е предложението)',
      input('topic', { required: '', minlength: '3', maxlength: '160' }),
    ),
    field(
      'Предложението (твоят текст, без HTML)',
      input('offer', {
        textarea: true,
        required: '',
        minlength: '20',
        maxlength: '1500',
        rows: '5',
      }),
    ),
    field('Име на получателя (по избор)', input('recipientName', { maxlength: '120' })),
    field(
      'Подпис',
      input('senderName', {
        required: '',
        minlength: '2',
        maxlength: '120',
        value: 'Екипът на Carbon Stealth',
      }),
    ),
    field(
      'Адресът е видян в източника на',
      input('seenAt', { type: 'date', required: '', value: today, max: today }),
    ),
  );
  const res = await api(`/api/drafts/slots?market=${v.market}`);
  const slots = res.ok ? (await res.json()).slots : [];
  for (let i = 0; i < 3; i++) {
    form.append(
      field(
        `Час за разговор ${i + 1}`,
        input(`slot${i}`, {
          type: 'datetime-local',
          required: '',
          value: slots[i] ? toLocalInput(slots[i]) : '',
        }),
      ),
    );
  }
  const submit = el('button', 'Направи черновата');
  submit.type = 'submit';
  const out = el('div');
  out.setAttribute('aria-live', 'polite');
  form.append(submit, el('p', '', 'msg'), out);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const body = {
      query: check.query,
      market: v.market,
      sourceUrl: check.sourceUrl,
      seenAt: new Date(`${f.get('seenAt')}T12:00:00`).toISOString(),
      topic: String(f.get('topic')),
      offer: String(f.get('offer')),
      senderName: String(f.get('senderName')),
      slots: [0, 1, 2].map((i) => isoFromLocal(f.get(`slot${i}`))),
    };
    if (f.get('recipientName')) body.recipientName = String(f.get('recipientName'));
    out.replaceChildren();
    const r = await api('/api/drafts/first-email', body);
    if (!r.ok) {
      let code = '';
      try {
        code = (await r.clone().json()).code ?? '';
      } catch {
        /* празно */
      }
      return say(form, DRAFT_ERRORS[code] ?? (await errorText(r)));
    }
    say(form, '');
    const d = await r.json();
    const subject = el('input');
    subject.readOnly = true;
    subject.value = d.subject;
    const text = el('textarea');
    text.readOnly = true;
    text.rows = 18;
    text.value = d.text;
    const copy = el('button', 'Копирай темата и текста');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`${d.subject}\n\n${d.text}`);
        copy.textContent = 'Копирано';
      } catch {
        text.select();
      }
    });
    out.append(field('Тема', subject), field('Текст', text), copy);
    out.append(
      el(
        'p',
        'Прати като обикновен текст (не HTML) от своята поща. Отказ по отговор → „Не ме търсете“ по-долу.',
        'req-title',
      ),
    );
    if (d.legalReview === 'it_pending') {
      out.append(
        el(
          'p',
          'Италианският текст е чернова — преди първото изпращане го преглеждат Преводача и италиански юрист.',
          'r-action',
        ),
      );
    }
  });
  return form;
}

function renderVerdict(v) {
  const [label, cls] = DECISION[v.decision];
  const card = el('article', undefined, `verdict ${cls}`);
  const head = el('header');
  head.append(el('strong', label), el('span', ` · ${CHANNEL[v.channel]} · ${MARKET[v.market]}`));
  if (v.normalizedValue) head.append(el('code', v.normalizedValue));
  card.append(head);
  const reasons = el('ul');
  for (const r of v.reasons) reasons.append(el('li', r.text, `r-${r.effect}`));
  if (v.reasons.length) card.append(reasons);
  if (v.decision !== 'blocked' && v.requirements.length) {
    card.append(el('p', 'Задължително в съобщението или разговора:', 'req-title'));
    const req = el('ul');
    for (const r of v.requirements) req.append(el('li', r.text));
    card.append(req);
  }
  if (v.decision === 'allowed' && v.channel === 'email' && lastCheck) {
    const check = lastCheck;
    const open = el('button', 'Чернова на първия имейл');
    open.type = 'button';
    open.addEventListener('click', async () => {
      open.disabled = true;
      card.append(await draftForm(v, check));
    });
    card.append(open);
  }
  return card;
}

$('#check-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = { query: String(f.get('query')) };
  if (f.get('sourceUrl')) body.sourceUrl = String(f.get('sourceUrl'));
  if (f.get('market')) body.market = String(f.get('market'));
  if (f.get('phoneSource')) body.phoneSource = String(f.get('phoneSource'));
  if (f.get('businessLineConfirmed')) body.businessLineConfirmed = true;
  const out = $('#results');
  out.replaceChildren();
  lastCheck = { query: body.query, sourceUrl: body.sourceUrl ?? null };
  const res = await api('/api/check', body);
  if (!res.ok) return out.append(el('p', await errorText(res), 'msg'));
  const { results } = await res.json();
  if (!results.length)
    return out.append(el('p', 'Не е разпознат имейл, телефон или адрес.', 'msg'));
  for (const v of results) out.append(renderVerdict(v));
});

async function importError(res) {
  try {
    const j = await res.json();
    const lines = (j.errors ?? []).map((x) => x.line).slice(0, 20);
    return lines.length ? `${j.error} Редове: ${lines.join(', ')}.` : (j.error ?? 'Грешка.');
  } catch {
    return 'Грешка.';
  }
}

async function fileText(form) {
  const file = form.querySelector('input[type=file]').files[0];
  return file ? file.text() : '';
}

$('#kzp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    takenAt: isoFromLocal(f.get('takenAt')),
    source: f.get('source'),
    text: await fileText(e.target),
  };
  let res = await api('/api/registry/kzp-snapshot', body);
  if (res.status === 409) {
    const why = await errorText(res);
    if (!window.confirm(why)) return say(e.target, 'Отказано — нищо не е внесено.');
    res = await api('/api/registry/kzp-snapshot', { ...body, confirmShrink: true });
  }
  if (!res.ok) return say(e.target, await importError(res));
  const j = await res.json();
  say(e.target, `Внесени вписани: ${j.listed}.`);
});

$('#results-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/api/registry/results', {
    registry: f.get('registry'),
    checkedAt: isoFromLocal(f.get('checkedAt')),
    source: f.get('source'),
    csv: await fileText(e.target),
  });
  if (!res.ok) return say(e.target, await importError(res));
  const j = await res.json();
  say(e.target, `Внесени резултати: ${j.imported}.`);
});

$('#export-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const numbers = String(f.get('numbers')).split(/\r?\n/).filter(Boolean);
  const res = await api('/api/registry/rpo-export', { numbers, format: f.get('format') });
  const blob = new Blob([await res.text()], { type: 'text/plain' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rpo-lista-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#suppress-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/api/suppressions', Object.fromEntries(f));
  say(e.target, res.ok ? 'Записано. Повече никакъв контакт.' : await errorText(res));
  if (res.ok) e.target.reset();
});

$('#consent-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = Object.fromEntries(f);
  body.givenAt = isoFromLocal(body.givenAt);
  const res = await api('/api/consents', body);
  say(e.target, res.ok ? 'Съгласието е записано.' : await errorText(res));
  if (res.ok) e.target.reset();
});

(async () => {
  const res = await api('/api/me');
  if (res.ok) showApp();
  else showLogin();
})();
