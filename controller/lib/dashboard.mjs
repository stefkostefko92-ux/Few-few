/**
 * Multi-account controller - dashboard view model + HTML (pure, unit-tested).
 */

// Pure dashboard request handler (unit-tested). Enforces the token and an
// anti-CSRF Origin check on mutations; returns what to send and, for mutations,
// which action the caller should perform (so this stays side-effect free).
//   opts: { method, pathname, query:{token,id}, origin, token, views, render }
export function dashboardResponse(opts) {
  const { method, pathname, query = {}, origin, token, views = [], render } = opts;
  if (!token || query.token !== token) {
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
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function renderDashboardHtml(views, opts = {}) {
  const rows = views.map((v) => `
    <tr class="st-${esc(v.status)}">
      <td>${esc(v.label)}</td>
      <td><span class="dot"></span>${esc(v.status)}</td>
      <td>${v.uptimeMin}m</td>
      <td>${fmt(v.adventures)}</td>
      <td>${fmt(v.encounters)}</td>
      <td>${fmt(v.gold)}</td>
      <td>${v.errors}</td>
      <td>${v.proxy ? '🛡️' : ''}</td>
      <td>
        <button onclick="ctl('start','${esc(v.id)}')">Start</button>
        <button onclick="ctl('stop','${esc(v.id)}')">Stop</button>
      </td>
    </tr>`).join('');
  const token = opts.token ? `?token=${encodeURIComponent(opts.token)}` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tanoth Controller</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0b0d;color:#d9dbe0;padding:24px;max-width:920px;margin:0 auto}
h1{font-size:20px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;background:#121316;border:1px solid #2a2e35;border-radius:10px;overflow:hidden}
th,td{padding:10px 12px;text-align:left;font-size:13px;border-bottom:1px solid #1f2430}
th{color:#868c96;font-weight:600}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#cf524c;margin-right:7px}
tr.st-running .dot{background:#27e08a;box-shadow:0 0 6px #27e08a}
tr.st-dry-run .dot{background:#c79234}
button{cursor:pointer;border:1px solid #2a2e35;border-radius:6px;background:#1f2228;color:#d9dbe0;padding:5px 10px;font-size:12px;margin-right:4px}
button:hover{border-color:#868c96}
.muted{color:#868c96;font-size:12px;margin-top:10px}
</style></head><body>
<h1>⚔️ Tanoth Multi-Account Controller</h1>
<table><thead><tr><th>Account</th><th>Status</th><th>Uptime</th><th>Adv</th><th>Encounters</th><th>Gold</th><th>Err</th><th>Proxy</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="9">No accounts</td></tr>'}</tbody></table>
<p class="muted">Auto-refreshes every 5s · accounts run locally on this machine.</p>
<script>
const TOKEN=${JSON.stringify(opts.token || '')};
async function ctl(action,id){await fetch('/api/'+action+'?id='+encodeURIComponent(id)+(TOKEN?'&token='+encodeURIComponent(TOKEN):''),{method:'POST'});setTimeout(()=>location.reload(),600);}
setTimeout(()=>location.reload(),5000);
</script></body></html>`;
}
