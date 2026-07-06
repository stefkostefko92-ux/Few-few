// Рендер на HTML за преглед на доклад и списък (минимален панел за MVP).

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );

const SEV_COLOR = {
  critical: '#e23c3c',
  high: '#f0662a',
  medium: '#f0a020',
  low: '#c8b020',
  info: '#8a8a8a',
};
const VERDICT = {
  detected: ['🔴 ОТКРИТ ЧИЙТ', '#e23c3c'],
  suspicious: ['🟠 ПОДОЗРИТЕЛНО', '#f0a020'],
  clean: ['🟢 ЧИСТО', '#3ba55d'],
};

const shell = (title, body) => `<!doctype html><html lang="bg"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0d0f13;color:#e6e8eb;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:24px}
a{color:#7aa2f7}
h1{font-size:20px;margin:0 0 4px}
.muted{color:#8a919b;font-size:13px}
.card{background:#151922;border:1px solid #232a36;border-radius:12px;padding:16px;margin:16px 0}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #232a36;vertical-align:top}
th{color:#8a919b;font-weight:600}
.sev{font-weight:700;font-size:12px;letter-spacing:.03em}
code{background:#1c2230;padding:1px 6px;border-radius:6px;font-size:13px}
.kpi{display:flex;gap:24px;flex-wrap:wrap;margin:8px 0}
.kpi div{min-width:90px}
.kpi b{display:block;font-size:22px}
.scroll{overflow-x:auto}
</style></head><body><div class="wrap">${body}
<p class="muted" style="margin-top:32px">CS Anticheat · Carbon Stealth VCC · доклад по чл. 6(1)(f) GDPR — обжалване на автоматични присъди: човешки преглед в панела.</p>
</div></body></html>`;

export function renderReport(r) {
  const [vlabel, vcolor] = VERDICT[r.verdict] ?? [r.verdict, '#808080'];
  const sys = r.system ?? {};
  const rows = (r.detections ?? [])
    .slice()
    .sort((a, b) => rankSev(b.severity) - rankSev(a.severity))
    .map(
      (d) => `<tr>
      <td><span class="sev" style="color:${SEV_COLOR[d.severity] ?? '#aaa'}">${esc(d.severity.toUpperCase())}</span></td>
      <td>${esc(d.title)}</td>
      <td><code>${esc(d.detail)}</code></td>
      <td class="muted">${esc(d.scanner)}</td>
      <td class="muted">${esc(d.evidence ?? '')}</td>
    </tr>`,
    )
    .join('');

  const flags = [];
  if (sys.testSigning) flags.push('⚠ Test Signing ВКЛ');
  if (sys.kernelDebug) flags.push('⚠ Kernel debugger');
  if (sys.virtualMachine) flags.push('🖥 Виртуална машина');
  if (sys.elevated) flags.push('администратор');

  const body = `
  <h1>Доклад <code>${esc(r.reportId)}</code></h1>
  <p class="muted">${esc(r.createdAt)} · схема ${esc(r.schemaVersion)}${r.serverRef ? ' · сървър ' + esc(r.serverRef) : ''}</p>
  <div class="card">
    <span class="badge" style="background:${vcolor}22;color:${vcolor};border:1px solid ${vcolor}">${esc(vlabel)}</span>
    <div class="kpi">
      <div><b>${esc(r.score)}</b><span class="muted">риск /100</span></div>
      <div><b>${esc((r.detections ?? []).length)}</b><span class="muted">находки</span></div>
      <div><b>${esc((r.runs ?? []).length)}</b><span class="muted">модула</span></div>
    </div>
    ${flags.length ? `<p class="muted">${flags.map(esc).join(' · ')}</p>` : ''}
  </div>
  <div class="card">
    <h1 style="font-size:16px">Система</h1>
    <p class="muted">${esc(sys.os ?? '')} ${esc(sys.osVersion ?? '')} · ${esc(sys.arch ?? '')}<br>
    ${esc(sys.cpu ?? '')}<br>
    хост <code>${esc(sys.hostname ?? '')}</code> · HWID <code>${esc(r.hwid?.composite ?? '')}</code></p>
  </div>
  <div class="card scroll">
    <h1 style="font-size:16px">Находки</h1>
    ${rows ? `<table><thead><tr><th>Тежест</th><th>Заглавие</th><th>Детайл</th><th>Модул</th><th>Доказателство</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Няма открити следи от известни чийтове.</p>'}
  </div>`;
  return shell(`Доклад ${r.reportId}`, body);
}

export function renderList(items) {
  const rows = items
    .map(
      (r) => `<tr>
    <td><a href="/r/${esc(r.reportId)}"><code>${esc(r.reportId)}</code></a></td>
    <td class="muted">${esc(r.createdAt)}</td>
    <td>${esc(r.verdict)}</td>
    <td>${esc(r.score)}</td>
    <td>${esc(r.detections)}</td>
    <td class="muted">${esc(r.hostname)}</td>
  </tr>`,
    )
    .join('');
  const body = `
  <h1>CS Anticheat · доклади</h1>
  <p class="muted">Последни ${items.length} screenshare сканирания</p>
  <div class="card scroll">
    ${rows ? `<table><thead><tr><th>ID</th><th>Време</th><th>Присъда</th><th>Риск</th><th>Находки</th><th>Хост</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Още няма доклади.</p>'}
  </div>`;
  return shell('CS Anticheat · доклади', body);
}

function rankSev(s) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s] ?? 0;
}
