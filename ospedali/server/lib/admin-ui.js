// HTML за админ панела (login + табло). Self-contained, inline CSS/JS.
// Данните се дърпат от /admin/api/* с fetch.

const CSS = `
*{margin:0;box-sizing:border-box}
:root{--brand:#0b5cad;--brand-ink:#08447f;--ink:#131c26;--muted:#586878;--line:#dbe4ee;
  --bg:#f3f5f8;--surface:#fff;--tint:#eef4fb;--pos:#177245;--neg:#b3261e;
  --font:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{--ink:#e8eef4;--muted:#9fb0c0;--line:#26313d;
  --bg:#0d131a;--surface:#151e29;--tint:#17293c}}
body{font-family:var(--font);background:var(--bg);color:var(--ink);margin:0;line-height:1.5}
a{color:var(--brand);text-decoration:none}
.wrap{max-width:960px;margin:0 auto;padding:24px 18px 60px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;
  border-bottom:1px solid var(--line);padding:14px 0;margin-bottom:22px}
header .b{font-weight:800;font-size:17px;letter-spacing:-.01em}
header .b span{color:var(--brand)}
.btn{font:inherit;font-weight:650;padding:9px 16px;border-radius:8px;border:1px solid var(--brand);
  background:var(--brand);color:#fff;cursor:pointer}
.btn.ghost{background:transparent;color:var(--brand)}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px}
@media(max-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
.kpi .n{font-size:26px;font-weight:800;color:var(--brand);line-height:1.1}
.kpi .l{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:6px}
h2{font-size:16px;margin:26px 0 10px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
th.num,td.num{text-align:right}
.muted{color:var(--muted)}.small{font-size:12.5px}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 4px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .t{font-weight:600}.row .f{font-size:12px;color:var(--muted)}
.sw{position:relative;width:46px;height:26px;flex:0 0 auto}
.sw input{opacity:0;width:0;height:0}
.sw .track{position:absolute;inset:0;background:#c4d0dc;border-radius:20px;transition:.15s;cursor:pointer}
.sw .track:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
.sw input:checked+.track{background:var(--pos)}
.sw input:checked+.track:before{transform:translateX(20px)}
.sw input:disabled+.track{opacity:.45;cursor:not-allowed}
.pill{font-size:11px;padding:2px 8px;border-radius:20px;background:var(--tint);color:var(--brand-ink)}
.pill.off{background:#fbe3e0;color:var(--neg)}
@media(prefers-color-scheme:dark){.pill.off{background:#3a1f1c}}
svg .bar{fill:var(--brand)}
.login{max-width:360px;margin:12vh auto 0;background:var(--surface);border:1px solid var(--line);
  border-radius:14px;padding:28px}
.login h1{font-size:20px;margin-bottom:6px}
.login input{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:9px;
  background:var(--bg);color:var(--ink);margin:14px 0}
.err{color:var(--neg);font-size:13px;min-height:18px;margin-top:6px}
.saved{color:var(--pos);font-size:13px}
`;

const shell = (title, body) =>
  `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Ospedali Trasparenti</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<style>${CSS}</style></head><body>${body}</body></html>`;

export function loginPage() {
  return shell(
    'Accesso amministratore',
    `<div class="login">
      <h1>Area riservata</h1>
      <p class="muted small">Ospedali Trasparenti — pannello di amministrazione.</p>
      <form id="f" autocomplete="off">
        <input type="password" id="pw" placeholder="Password" autofocus aria-label="Password">
        <button class="btn" style="width:100%" type="submit">Accedi</button>
        <div class="err" id="e"></div>
      </form>
    </div>
    <script>
      var f=document.getElementById('f'),e=document.getElementById('e');
      f.addEventListener('submit',async function(ev){ev.preventDefault();e.textContent='';
        var r=await fetch('/admin/api/login',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({password:document.getElementById('pw').value})});
        if(r.ok){location.href='/admin';}else{e.textContent='Password errata.';}});
    </script>`
  );
}

export function dashboardPage() {
  return shell(
    'Amministrazione',
    `<div class="wrap">
      <header>
        <div class="b">Ospedali <span>Trasparenti</span> · admin</div>
        <button class="btn ghost" id="logout">Esci</button>
      </header>

      <div class="grid" id="kpis"></div>

      <h2>Visite negli ultimi 14 giorni</h2>
      <div class="card"><div id="chart">…</div></div>

      <h2>Pagine più viste</h2>
      <div class="card"><table id="top"><tbody></tbody></table></div>

      <h2>Visibilità di pagine e sezioni</h2>
      <p class="muted small">Disattiva una voce per <b>nasconderla dal sito</b> (link nascosti e pagina non
      raggiungibile). Effetto immediato, reversibile. Le pagine legali/di base non sono disattivabili.</p>
      <div class="card" id="pages"><div class="muted small">Caricamento…</div></div>
      <div class="saved" id="saved" style="margin-top:10px"></div>

      <p class="muted small" style="margin-top:28px">Conteggio anonimo e aggregato: nessun indirizzo IP,
      nessun cookie di tracciamento.</p>
    </div>
    <script>${DASH_JS}</script>`
  );
}

const DASH_JS = `
const euro=n=>n.toLocaleString('it-IT');
async function j(u,o){const r=await fetch(u,o);if(r.status===401){location.href='/admin';throw 0;}return r.json();}
function kpi(n,l){return '<div class="kpi"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';}
function chart(serie){
  if(!serie.length)return '<div class="muted small">Ancora nessun dato.</div>';
  const W=680,H=140,pad=22,max=Math.max(1,...serie.map(d=>d.views));
  const bw=(W-pad*2)/serie.length;
  let bars='',labs='';
  serie.forEach((d,i)=>{const h=(d.views/max)*(H-pad*2);const x=pad+i*bw;const y=H-pad-h;
    bars+='<rect class="bar" x="'+(x+bw*0.15)+'" y="'+y+'" width="'+(bw*0.7)+'" height="'+Math.max(0,h)+'" rx="2"><title>'+d.giorno+': '+d.views+' viste, '+d.visitors+' visitatori</title></rect>';
    if(i%2===0)labs+='<text x="'+(x+bw/2)+'" y="'+(H-6)+'" font-size="9" fill="#8595a4" text-anchor="middle">'+d.giorno.slice(5)+'</text>';});
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Visite per giorno">'+bars+labs+'</svg>';
}
async function load(){
  const s=await j('/admin/api/stats');
  document.getElementById('kpis').innerHTML=
    kpi(euro(s.totalViews),'Visite totali')+
    kpi(euro(s.oggi.visitors),'Visitatori oggi')+
    kpi(euro(s.oggi.views),'Visite oggi')+
    kpi(euro(s.viste7),'Visite (7 giorni)');
  document.getElementById('chart').innerHTML=chart(s.serie);
  document.getElementById('top').querySelector('tbody').innerHTML=
    '<tr><th>Pagina</th><th class="num">Visite</th></tr>'+
    (s.topPagine.length?s.topPagine.map(p=>'<tr><td>'+p.path.replace(/[<>&]/g,'')+'</td><td class="num">'+euro(p.views)+'</td></tr>').join(''):'<tr><td class="muted" colspan="2">—</td></tr>');
  const el=document.querySelectorAll('.wrap p.muted.small');
  el[el.length-1].innerHTML='Conteggio anonimo e aggregato: nessun indirizzo IP, nessun cookie di tracciamento. Dati dal '+s.since+'.';
}
async function loadPages(){
  const {pages,hidden}=await j('/admin/api/pages');
  const set=new Set(hidden);
  document.getElementById('pages').innerHTML=pages.map(p=>{
    const off=set.has(p.file);
    return '<div class="row"><div><div class="t">'+p.titolo.replace(/[<>&]/g,'')+'</div>'+
      '<div class="f">'+p.file+(p.protetta?' · <span class="pill">di base</span>':(off?' · <span class="pill off">nascosta</span>':''))+'</div></div>'+
      '<label class="sw"><input type="checkbox" data-f="'+p.file+'" '+(off?'':'checked')+' '+(p.protetta?'disabled':'')+'><span class="track"></span></label></div>';
  }).join('');
  document.querySelectorAll('#pages input[type=checkbox]').forEach(cb=>cb.addEventListener('change',save));
}
async function save(){
  const hidden=[...document.querySelectorAll('#pages input[type=checkbox]:not(:checked):not(:disabled)')].map(c=>c.dataset.f);
  await j('/admin/api/visibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hidden})});
  const s=document.getElementById('saved');s.textContent='Salvato ✓';setTimeout(()=>s.textContent='',1600);
  loadPages();
}
document.getElementById('logout').addEventListener('click',async()=>{await fetch('/admin/api/logout',{method:'POST'});location.href='/admin';});
load().catch(()=>{});loadPages().catch(()=>{});
`;
