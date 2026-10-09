/**
 * Multi-account controller - dashboard view model + HTML (pure, unit-tested).
 */

// Pure dashboard request handler (unit-tested). Enforces the token and an
// anti-CSRF Origin check on mutations; returns what to send and, for mutations,
// which action the caller should perform (so this stays side-effect free).
//   opts: { method, pathname, query:{token,id}, origin, token, views, render }
// Constant-time string compare (no early exit on the first mismatching char).
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function dashboardResponse(opts) {
  const { method, pathname, query = {}, origin, token, views = [], render } = opts;
  if (!token || !safeEqual(query.token, token)) {
    return { status: 401, contentType: 'text/plain', body: 'unauthorized' };
  }
  const localOrigin = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(origin);
  if (method === 'POST' && (pathname === '/api/start' || pathname === '/api/stop')) {
    if (!localOrigin) return { status: 403, contentType: 'text/plain', body: 'forbidden' };
    return { status: 200, contentType: 'text/plain', body: 'ok', action: pathname === '/api/start' ? 'start' : 'stop', id: query.id };
  }
  if (pathname === '/api/status') {
    return { status: 200, contentType: 'application/json', body: JSON.stringify(views) };
  }
  return { status: 200, contentType: 'text/html', body: render ? render() : '' };
}

export function accountView(entry, now = Date.now()) {
  const s = entry.lastStats || {};
  return {
    id: entry.account.id,
    label: entry.account.label,
    status: entry.status || 'stopped',
    proxy: entry.account.proxy ? 'yes' : '',
    uptimeMin: entry.startedAt ? Math.round((now - entry.startedAt) / 60000) : 0,
    adventures: s.adventures || 0,
    encounters: s.encounters || 0,
    gold: s.goldEarned || 0,
    errors: s.errors || 0
  };
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Decorative icons (aria-hidden): stroke 2 on a 24 grid, tinted with currentColor.
const SVG = (inner, fill) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${fill ? ' fill="currentColor"' : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
const IC = {
  play: SVG('<path d="M7 4.5v15l12.5-7.5z"/>', true),
  stop: SVG('<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>', true),
  coin: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>'),
  sword: SVG('<path d="M19 5L9 15M6 12l6 6M9 15l-4 4M15 5h4v4"/>'),
  target: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  warn: SVG('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
  shield: SVG('<path d="M12 3l8 3v6c0 4.8-3.3 8-8 9.5C7.3 20 4 16.8 4 12V6z"/>'),
  users: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14c2.6 0 4.5 1.9 4.5 5"/>')
};
const MARK = '<svg class="mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect class="m-tile" x=".75" y=".75" width="26.5" height="26.5" rx="7" stroke-width="1.5"/><path class="m-blade" d="M14 3.6l2.4 2.9v9.6h-4.8V6.5z"/><path class="m-guard" d="M8.8 16.9h10.4M14 16.9v4.6" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle class="m-blade" cx="14" cy="23.6" r="1.4"/></svg>';

const CSS = `
:root{color-scheme:dark light;--bg:#05090a;--card:rgba(13,23,22,.78);--card-2:rgba(2,8,8,.55);--line:rgba(255,255,255,.16);--line-strong:rgba(255,255,255,.46);
--text:#f1f4f8;--muted:#bac3ce;--faint:#8f99a6;--accent:#27e08a;--accent-text:#3aeb9a;--accent-ink:#03170c;--accent-wash:rgba(39,224,138,.14);--accent-line:rgba(80,240,165,.6);
--danger-text:#ff9f98;--danger-wash:rgba(255,95,86,.14);--danger-line:rgba(255,120,110,.6);--warn-text:#f5c95c;--warn-wash:rgba(241,194,78,.13);--warn-line:rgba(245,201,92,.55);
--focus:#7ff5bd;--shadow:0 26px 50px -24px rgba(0,0,0,.8),0 8px 18px -8px rgba(0,0,0,.5);--lit:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.35);
--aurora:radial-gradient(48% 36% at 84% 4%,rgba(18,196,122,.5),transparent 72%),radial-gradient(54% 42% at 2% 38%,rgba(10,140,165,.42),transparent 72%),radial-gradient(64% 44% at 74% 100%,rgba(20,170,110,.4),transparent 72%),radial-gradient(40% 28% at 6% 98%,rgba(230,179,74,.12),transparent 72%);
--hatch:repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 1px,transparent 1px 16px);--spring:cubic-bezier(.3,1.45,.5,1)}
@media (prefers-color-scheme:light){:root{--bg:#d9e8e4;--card:rgba(255,255,255,.72);--card-2:rgba(255,255,255,.7);--line:rgba(20,40,60,.18);--line-strong:rgba(20,40,60,.55);
--text:#0d1218;--muted:#364050;--faint:#566170;--accent-text:#05603a;--accent-wash:rgba(5,96,58,.1);--accent-line:rgba(5,96,58,.6);--danger-text:#a3190f;--danger-wash:rgba(163,25,15,.08);--danger-line:rgba(163,25,15,.55);
--warn-text:#6b4600;--warn-wash:rgba(140,90,0,.1);--warn-line:rgba(107,70,0,.55);--focus:#05603a;--shadow:0 24px 46px -24px rgba(18,36,56,.5),0 8px 18px -8px rgba(18,36,56,.22);--lit:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(20,40,60,.1);
--aurora:radial-gradient(48% 36% at 84% 4%,rgba(60,220,160,.55),transparent 72%),radial-gradient(54% 42% at 2% 38%,rgba(70,190,230,.45),transparent 72%),radial-gradient(64% 44% at 74% 100%,rgba(90,225,170,.45),transparent 72%),radial-gradient(40% 28% at 6% 98%,rgba(255,214,140,.4),transparent 72%);
--hatch:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 1px,transparent 1px 16px)}}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{position:relative;isolation:isolate;min-height:100vh;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.45;color:var(--text);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;overflow-wrap:break-word;padding:clamp(16px,4vw,40px)}
body::before{content:'';position:fixed;inset:0;z-index:-2;background:var(--aurora)}
body::after{content:'';position:fixed;inset:0;z-index:-1;background:var(--hatch);pointer-events:none}
.wrap{max-width:1120px;margin:0 auto}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:8px}
header{display:flex;align-items:center;gap:14px;margin-bottom:clamp(20px,4vw,34px)}
.mark{width:44px;height:44px;flex:0 0 auto;filter:drop-shadow(0 6px 14px rgba(39,224,138,.4))}
.m-tile{fill:var(--bg);stroke:var(--accent-line)}.m-blade{fill:var(--accent)}.m-guard{stroke:var(--accent)}
@media (prefers-color-scheme:light){.m-tile{fill:#0a0b0d;stroke:#0a0b0d}.mark{filter:drop-shadow(0 6px 10px rgba(5,96,58,.3))}}
h1{font-size:clamp(24px,4vw,34px);line-height:1.1;font-weight:800;letter-spacing:-.025em}
.sub{margin-top:4px;color:var(--text);font-size:13.5px}
.grid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:16px}
.acct{--rim:linear-gradient(142deg,rgba(255,255,255,.7),rgba(255,255,255,.14) 28%,rgba(255,255,255,.05) 55%,rgba(255,255,255,.4));--glow:0 0 0 0 transparent;
position:relative;isolation:isolate;display:flex;flex-direction:column;gap:16px;min-width:0;padding:18px;border-radius:24px;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 55%),var(--card);
-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:var(--lit),var(--shadow),var(--glow)}
.acct::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;padding:1.5px;background:var(--rim);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.st-running{--rim:linear-gradient(142deg,rgba(200,255,230,.95),rgba(70,240,165,.5) 28%,rgba(60,230,150,.14) 55%,rgba(120,255,200,.5));--glow:0 0 44px -14px rgba(39,224,138,.55)}
.st-error{--rim:linear-gradient(142deg,rgba(255,190,185,.9),var(--danger-line) 30%,rgba(255,120,110,.14) 55%,var(--danger-line));--glow:0 0 40px -16px rgba(255,95,86,.45)}
.st-dry-run,.st-launching{--rim:linear-gradient(142deg,rgba(255,238,190,.9),var(--warn-line) 30%,rgba(245,201,92,.14) 55%,var(--warn-line))}
@media (prefers-color-scheme:light){.st-running{--rim:linear-gradient(142deg,#fff,rgba(60,200,140,.8) 28%,rgba(40,190,130,.3) 55%,rgba(40,170,120,.6))}}
.head{display:flex;align-items:flex-start;gap:12px;min-width:0}
.name{flex:1 1 auto;min-width:0;font-size:18px;line-height:1.2;font-weight:800;letter-spacing:-.015em;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:28px;max-width:46%;padding:0 12px 0 10px;border-radius:999px;font-size:12.5px;font-weight:700;line-height:1.2;color:var(--muted);background:var(--card-2);border:1px dashed var(--line-strong);overflow-wrap:anywhere}
.beacon{position:relative;display:block;flex:0 0 auto;width:12px;height:12px;border-radius:50%;border:2px solid var(--muted)}
.st-running .pill{color:var(--accent-text);border:1px solid var(--accent-line);background:linear-gradient(0deg,var(--accent-wash),var(--accent-wash)),var(--card-2)}
.st-running .beacon{border-color:#b7ffe0;background:radial-gradient(circle at 35% 30%,#d6ffec,var(--accent) 55%,#0c8f55);box-shadow:0 0 0 3px var(--accent-wash),0 0 12px 2px var(--accent-line)}
.st-error .pill{color:var(--danger-text);border:1px solid var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.st-error .beacon{border-radius:3px;border-color:var(--danger-text);background:linear-gradient(45deg,transparent 42%,var(--danger-text) 42% 58%,transparent 58%),linear-gradient(-45deg,transparent 42%,var(--danger-text) 42% 58%,transparent 58%)}
.st-dry-run .pill,.st-launching .pill{color:var(--warn-text);border:1px dashed var(--warn-line);background:linear-gradient(0deg,var(--warn-wash),var(--warn-wash)),var(--card-2)}
.st-dry-run .beacon,.st-launching .beacon{border-style:dotted;border-color:var(--warn-text)}
@media (prefers-color-scheme:light){.st-running .beacon{border-color:#0a8a55;background:radial-gradient(circle at 35% 30%,#9af0c6,#12b868 60%,#067a45);box-shadow:0 0 0 3px rgba(10,138,85,.14)}}
.hero{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,0) 55%),var(--card-2);border:1px solid var(--line);box-shadow:var(--lit)}
.disc{display:grid;place-items:center;flex:0 0 auto;width:40px;height:40px;border-radius:50%;color:var(--accent-text);background:var(--accent-wash);border:1px solid var(--accent-line)}
.disc .ic{width:20px;height:20px}
.hero dl,.m{display:flex;flex-direction:column-reverse;min-width:0}
.hero dd{font-size:clamp(28px,4.4vw,36px);line-height:1.05;font-weight:800;letter-spacing:-.03em;overflow-wrap:anywhere}
.hero dt{font-size:12.5px;color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.m{justify-content:center;gap:2px;padding:9px 10px;border-radius:14px;background:var(--card-2);border:1px solid var(--line);box-shadow:var(--lit)}
.m dd{display:flex;align-items:center;gap:6px;font-size:20px;line-height:1.15;font-weight:750;letter-spacing:-.02em;overflow-wrap:anywhere}
.m dt{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.m .ic{width:14px;height:14px;flex:0 0 auto;color:var(--faint)}
.m.bad{border-color:var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.m.bad dd,.m.bad dt,.m.bad .ic{color:var(--danger-text)}
.foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:auto}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 11px 0 9px;border-radius:14px;font-size:12px;font-weight:600;color:var(--muted);background:var(--card-2);border:1px solid var(--line)}
.chip .ic{width:14px;height:14px;color:var(--accent-text)}
.acts{display:flex;gap:8px;margin-left:auto}
button{font:inherit;font-weight:700;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;min-width:92px;padding:0 18px 0 14px;border-radius:999px;cursor:pointer;color:var(--text);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 60%),var(--card-2);border:1px solid var(--line-strong);box-shadow:var(--lit),0 6px 14px -8px rgba(0,0,0,.6)}
button .ic{width:14px;height:14px}
button:hover{border-color:var(--text)}
button:active{transform:translateY(1px) scale(.96)}
.go{color:var(--accent-ink);border-color:rgba(190,255,225,.85);background:radial-gradient(120% 90% at 28% 0%,rgba(255,255,255,.6),rgba(255,255,255,0) 55%),linear-gradient(180deg,#46f5a8,#14b96b);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.85),inset 0 -3px 6px rgba(0,90,50,.38),0 8px 20px -6px rgba(39,224,138,.7),0 2px 4px rgba(0,0,0,.25)}
.go:hover{border-color:#fff;background:radial-gradient(120% 90% at 28% 0%,rgba(255,255,255,.75),rgba(255,255,255,0) 55%),linear-gradient(180deg,#6bffbd,#1ccb78)}
.st-running .go{color:var(--text);border-color:var(--line-strong);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 60%),var(--card-2);box-shadow:var(--lit)}
.st-running .go:hover{border-color:var(--accent-line);color:var(--accent-text)}
.st-stopped .halt,.st-error .halt,.st-dry-run .halt,.st-launching .halt{color:var(--muted);box-shadow:none}
.st-running .halt{color:var(--danger-text);border-color:var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.st-running .halt:hover{border-color:var(--danger-text)}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;max-width:520px;margin:clamp(20px,8vh,80px) auto;padding:36px 28px;border-radius:28px;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 55%),var(--card);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:var(--lit),var(--shadow);border:1px dashed var(--line-strong)}
.empty .disc{width:64px;height:64px}.empty .disc .ic{width:30px;height:30px}
.empty h2{font-size:22px;font-weight:800;letter-spacing:-.02em}
.empty p{color:var(--muted);max-width:42ch}
code{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:.92em;padding:1px 6px;border-radius:6px;background:var(--card-2);border:1px solid var(--line);color:var(--text)}
.muted{margin-top:22px;color:var(--text);font-size:12.5px;text-align:center}
@media (prefers-reduced-motion:no-preference){
button,.pill{transition:transform .35s var(--spring),background-color .18s,border-color .18s,color .18s,box-shadow .25s}
button:hover{transform:translateY(-2px)}button:active{transform:translateY(1px) scale(.96)}
.st-running .beacon::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--accent);animation:ping 2.6s ease-out infinite}
@keyframes ping{0%{opacity:.75;transform:scale(.7)}70%,100%{opacity:0;transform:scale(2.2)}}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){:root{--card:#0f1719;--card-2:#172123}@media (prefers-color-scheme:light){:root{--card:#f3f7f6;--card-2:#e6eeec}}}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){:root{--card:#0f1719;--card-2:#172123;--aurora:linear-gradient(var(--bg),var(--bg));--hatch:linear-gradient(transparent,transparent);--line:var(--line-strong);--muted:var(--text)}
@media (prefers-color-scheme:light){:root{--card:#f3f7f6;--card-2:#e6eeec}}
.acct,.empty{-webkit-backdrop-filter:none;backdrop-filter:none}}
@media (max-width:420px){.acts{width:100%}.acts button{flex:1}.pill{max-width:none}.head{flex-wrap:wrap}}
`;

export function renderDashboardHtml(views, opts = {}) {
  const cards = views.map((v) => {
    const bad = Number(v.errors) > 0 ? ' bad' : '';
    return `
    <li class="acct st-${esc(v.status)}">
      <div class="head">
        <h2 class="name">${esc(v.label)}</h2>
        <span class="pill"><span class="beacon" aria-hidden="true"></span>${esc(v.status)}</span>
      </div>
      <div class="hero"><span class="disc" aria-hidden="true">${IC.coin}</span><dl><dt>Gold</dt><dd>${esc(fmt(v.gold))}</dd></dl></div>
      <dl class="metrics">
        <div class="m"><dt>Adventures</dt><dd>${IC.sword}${esc(fmt(v.adventures))}</dd></div>
        <div class="m"><dt>Encounters</dt><dd>${IC.target}${esc(fmt(v.encounters))}</dd></div>
        <div class="m"><dt>Uptime</dt><dd>${IC.clock}${esc(v.uptimeMin)}m</dd></div>
        <div class="m${bad}"><dt>Errors</dt><dd>${IC.warn}${esc(v.errors)}</dd></div>
      </dl>
      <div class="foot">
        ${v.proxy ? `<span class="chip">${IC.shield}Proxy</span>` : ''}
        <div class="acts">
          <button class="go" aria-label="Start ${esc(v.label)}" onclick="ctl('start',${esc(JSON.stringify(String(v.id)))})">${IC.play}Start</button>
          <button class="halt" aria-label="Stop ${esc(v.label)}" onclick="ctl('stop',${esc(JSON.stringify(String(v.id)))})">${IC.stop}Stop</button>
        </div>
      </div>
    </li>`;
  }).join('');
  const body = cards
    ? `<ul class="grid" aria-label="Accounts">${cards}</ul>`
    : `<section class="empty"><span class="disc" aria-hidden="true">${IC.users}</span><h2>No accounts yet</h2><p>Add an account to <code>accounts.json</code> and restart the controller. It shows up here with its own Start and Stop.</p></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>Tanoth Controller</title>
<style>${CSS}</style></head><body><div class="wrap">
<header>${MARK}<div><h1>Tanoth Controller</h1><p class="sub">Multi-account control room. Every account runs locally on this machine.</p></div></header>
<main>${body}</main>
<p class="muted">Auto-refreshes every 5s.</p></div>
<script>
const TOKEN=${JSON.stringify(opts.token || '').replace(/</g, '\\u003c')};
async function ctl(action,id){await fetch('/api/'+action+'?id='+encodeURIComponent(id)+(TOKEN?'&token='+encodeURIComponent(TOKEN):''),{method:'POST'});setTimeout(()=>location.reload(),600);}
setTimeout(()=>location.reload(),5000);
</script></body></html>`;
}
