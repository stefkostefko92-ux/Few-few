/*!
 * Агентски шлюз на Carbon Stealth — чат уиджет.
 * <script src="https://ШЛЮЗ/widget.js" data-key="cs_pk_…" data-agent="seo" defer></script>
 * По избор: data-lang="bg|en|it", data-title="…", data-privacy-url="https://…/privacy".
 * Без бисквитки, без localStorage, без трети страни; историята живее само в паметта на страницата.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute('data-key') || '';
  var agent = script.getAttribute('data-agent') || '';
  if (!/^cs_pk_/.test(key) || !agent) {
    console.warn('[agentgw] Нужни са data-key="cs_pk_…" и data-agent.');
    return;
  }
  var base = new URL(script.src).origin;

  var T = {
    bg: {
      open: 'Попитай AI асистента',
      close: 'Затвори',
      ai: 'Разговаряш с AI асистент, не с човек.',
      privacy:
        'Не въвеждай лични данни. Съобщенията се обработват от AI модел (Claude) в Google Cloud в ЕС и не се пазят от нас.',
      more: 'Поверителност',
      placeholder: 'Напиши въпрос…',
      send: 'Изпрати',
      thinking: 'Мисли…',
      error: 'Нещо се обърка. Опитай пак.',
      refusal: 'Асистентът не може да помогне с тази заявка.',
      truncated: '(отговорът е съкратен)',
    },
    en: {
      open: 'Ask the AI assistant',
      close: 'Close',
      ai: 'You are chatting with an AI assistant, not a human.',
      privacy:
        'Do not enter personal data. Messages are processed by an AI model (Claude) on Google Cloud in the EU and are not stored by us.',
      more: 'Privacy',
      placeholder: 'Type a question…',
      send: 'Send',
      thinking: 'Thinking…',
      error: 'Something went wrong. Please try again.',
      refusal: 'The assistant cannot help with this request.',
      truncated: '(answer was shortened)',
    },
    it: {
      open: "Chiedi all'assistente IA",
      close: 'Chiudi',
      ai: 'Stai parlando con un assistente IA, non con una persona.',
      privacy:
        "Non inserire dati personali. I messaggi sono elaborati da un modello IA (Claude) su Google Cloud nell'UE e non vengono conservati da noi.",
      more: 'Privacy',
      placeholder: 'Scrivi una domanda…',
      send: 'Invia',
      thinking: 'Sto pensando…',
      error: 'Qualcosa è andato storto. Riprova.',
      refusal: "L'assistente non può aiutare con questa richiesta.",
      truncated: '(risposta abbreviata)',
    },
  };
  var want = (script.getAttribute('data-lang') || document.documentElement.lang || 'bg')
    .slice(0, 2)
    .toLowerCase();
  var t = T[want] || T.bg;
  var title = script.getAttribute('data-title') || t.open;
  var privacyUrl = script.getAttribute('data-privacy-url') || '';

  var host = document.createElement('div');
  host.setAttribute('data-agentgw', '');
  var root = host.attachShadow({ mode: 'closed' });
  var css =
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:12px 18px;background:#111;color:#fff;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}' +
    '.fab:focus-visible,.btn:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #4c8dff;outline-offset:2px}' +
    '.panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 40px));display:flex;flex-direction:column;background:#fff;color:#111;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden}' +
    '.panel[hidden]{display:none}' +
    '.head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#111;color:#fff;font-size:15px;font-weight:600}' +
    '.x{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer}' +
    '.note{padding:8px 14px;font-size:12.5px;line-height:1.4;background:#fff7d6;color:#3d3200;border-bottom:1px solid #eee}' +
    '.note a{color:inherit}' +
    '.log{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:14.5px;line-height:1.45}' +
    '.m{max-width:88%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}' +
    '.u{align-self:flex-end;background:#111;color:#fff}.a{align-self:flex-start;background:#f1f1f3}.e{align-self:center;color:#a00;font-size:13px}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}' +
    'textarea{flex:1;resize:none;height:44px;padding:10px;border:1px solid #ccc;border-radius:10px;font-size:14.5px;color:#111;background:#fff}' +
    '.btn{border:0;border-radius:10px;padding:0 14px;background:#111;color:#fff;font-size:14px;cursor:pointer}.btn[disabled]{opacity:.5;cursor:default}' +
    '@media (prefers-reduced-motion:no-preference){.panel{animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}';

  root.innerHTML =
    '<style>' +
    css +
    '</style>' +
    '<button class="fab" type="button" aria-haspopup="dialog"></button>' +
    '<section class="panel" role="dialog" aria-modal="false" hidden>' +
    '<div class="head"><span class="ttl"></span><button class="x" type="button">×</button></div>' +
    '<p class="note"><strong class="ai"></strong> <span class="pv"></span></p>' +
    '<div class="log" role="log" aria-live="polite"></div>' +
    '<form><textarea maxlength="4000" rows="2"></textarea><button class="btn" type="submit"></button></form>' +
    '</section>';

  var fab = root.querySelector('.fab');
  var panel = root.querySelector('.panel');
  var logEl = root.querySelector('.log');
  var form = root.querySelector('form');
  var input = root.querySelector('textarea');
  var sendBtn = root.querySelector('.btn');
  var closeBtn = root.querySelector('.x');
  fab.textContent = title;
  root.querySelector('.ttl').textContent = title;
  panel.setAttribute('aria-label', title);
  closeBtn.setAttribute('aria-label', t.close);
  root.querySelector('.ai').textContent = t.ai;
  root.querySelector('.pv').textContent = t.privacy + ' ';
  if (/^https:\/\//.test(privacyUrl)) {
    var a = document.createElement('a');
    a.href = privacyUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = t.more;
    root.querySelector('.note').appendChild(a);
  }
  input.placeholder = t.placeholder;
  input.setAttribute('aria-label', t.placeholder);
  sendBtn.textContent = t.send;

  var history = [];
  var busy = false;

  function bubble(cls, text) {
    var el = document.createElement('div');
    el.className = 'm ' + cls;
    el.textContent = text; // само текст — никога HTML от модела
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }

  function setOpen(open) {
    panel.hidden = !open;
    fab.hidden = open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else fab.focus();
  }
  fab.addEventListener('click', function () {
    setOpen(true);
  });
  closeBtn.addEventListener('click', function () {
    setOpen(false);
  });
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  function errorText(status, body) {
    if (body && body.error && body.error.message) return body.error.message;
    return t.error + (status ? ' (' + status + ')' : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    bubble('u', text);
    history.push({ role: 'user', content: text });
    var out = bubble('a', t.thinking);
    var answer = '';

    fetch(base + '/v1/chat', {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'strict-origin',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': key },
      // Нечетен брой редуващи се съобщения → прозорецът започва с потребителя.
      body: JSON.stringify({ agent: agent, messages: history.slice(-19) }),
    })
      .then(function (res) {
        if (!res.ok || !res.body) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (b) {
              throw new Error(errorText(res.status, b));
            });
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var buf = '';
        function handle(block) {
          var ev = 'message';
          var data = '';
          block.split('\n').forEach(function (line) {
            if (line.indexOf('event: ') === 0) ev = line.slice(7);
            else if (line.indexOf('data: ') === 0) data += line.slice(6);
          });
          if (!data) return;
          var d = JSON.parse(data);
          if (ev === 'delta') {
            answer += d.text;
            out.textContent = answer;
            logEl.scrollTop = logEl.scrollHeight;
          } else if (ev === 'refusal') {
            out.textContent = answer ? answer + '\n\n' + t.refusal : t.refusal;
          } else if (ev === 'error') {
            throw new Error(d.message || t.error);
          } else if (ev === 'done' && d.truncated) {
            out.textContent = answer + '\n' + t.truncated;
          }
        }
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              handle(buf.slice(0, i));
              buf = buf.slice(i + 2);
            }
            return pump();
          });
        }
        return pump();
      })
      .then(function () {
        if (answer) history.push({ role: 'assistant', content: answer });
        else history.pop();
      })
      .catch(function (err) {
        history.pop();
        if (!answer) out.remove();
        bubble('e', (err && err.message) || t.error);
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  });

  function mount() {
    document.body.appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
