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
  const res = await api('/api/check', body);
  if (!res.ok) return out.append(el('p', await errorText(res), 'msg'));
  const { results } = await res.json();
  if (!results.length)
    return out.append(el('p', 'Не е разпознат имейл, телефон или адрес.', 'msg'));
  for (const v of results) out.append(renderVerdict(v));
});

async function fileText(form) {
  const file = form.querySelector('input[type=file]').files[0];
  return file ? file.text() : '';
}

$('#kzp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/api/registry/kzp-snapshot', {
    takenAt: isoFromLocal(f.get('takenAt')),
    source: f.get('source'),
    text: await fileText(e.target),
  });
  if (!res.ok) return say(e.target, await errorText(res));
  const j = await res.json();
  say(e.target, `Внесени вписани: ${j.listed}; неразпознати редове: ${j.errors.length}.`);
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
  if (!res.ok) return say(e.target, await errorText(res));
  const j = await res.json();
  const bad = j.errors.length ? ` Редове с грешка: ${j.errors.map((x) => x.line).join(', ')}.` : '';
  say(e.target, `Внесени резултати: ${j.imported}.${bad}`);
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
