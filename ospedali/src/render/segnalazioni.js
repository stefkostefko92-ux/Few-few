// @ts-check
// Страница „Segnalazioni" — всички сигнали с филтри (vanilla JS).
// Изнесена дословно от build-site.js — само местене.

import { esc, numeroIt } from '../lib/format.js';
import { page, kpi, badge } from '../lib/site-ui.js';
import { REGOLE_LABEL } from '../lib/site-shared.js';

/** @typedef {import('../lib/models.js').SegnData} SegnData */

// ---------- SEGNALAZIONI ----------
/**
 * @param {{ segn: SegnData, href: (cod: string) => string }} p
 * @returns {string}
 */
export function renderSegnalazioni({ segn, href }) {
  const regoleOpts = Object.entries(segn.perRegola)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<option value="${k}">${esc(REGOLE_LABEL[k] || k)} (${n})</option>`)
    .join('');
  const regioni = [...new Set(segn.enti.map((e) => e.regione))].sort();
  const regioniOpts = regioni.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');

  const cards = segn.enti
    .flatMap((e) =>
      e.segnalazioni.map(
        (s) => `<div class="seg ${s.gravita}" data-grav="${s.gravita}" data-reg="${esc(e.regione)}" data-regola="${s.regola}" data-nome="${esc(e.denominazione.toLowerCase())}">
        <div class="t">${badge(s.gravita)} <span>${esc(s.titolo)}</span></div>
        <div class="d">${esc(s.dettaglio)}</div>
        <div class="small" style="margin-top:6px"><a href="${href(e.codice)}">${esc(e.denominazione)}</a> · <span class="muted">${esc(e.regione)}</span></div>
      </div>`
      )
    )
    .join('');

  const body = `
<h1>Segnalazioni</h1>
<p class="lead">${numeroIt(segn.totaleSegnalazioni)} indicatori automatici su ${numeroIt(segn.entiConSegnalazioni)} strutture.
Ogni segnalazione cita i numeri di bilancio da cui deriva. <strong>Sono spie, non verdetti</strong>: un’anomalia
può avere spiegazioni legittime (fusioni, finanziamenti straordinari, cambi di perimetro).</p>
<div class="grid kpis">
  ${kpi('Gravità alta', numeroIt(segn.perGravita.alta), 'neg')}
  ${kpi('Gravità media', numeroIt(segn.perGravita.media))}
  ${kpi('Gravità bassa', numeroIt(segn.perGravita.bassa))}
</div>
<div class="controls">
  <input type="search" id="q" placeholder="Cerca struttura…" aria-label="Cerca">
  <select id="reg" aria-label="Regione"><option value="">Tutte le regioni</option>${regioniOpts}</select>
  <select id="grav" aria-label="Gravità"><option value="">Tutte le gravità</option>
    <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option></select>
  <select id="regola" aria-label="Tipo"><option value="">Tutti i tipi</option>${regoleOpts}</select>
</div>
<p class="small muted" id="count"></p>
<div id="list">${cards}</div>
<script>
(function(){
  var q=document.getElementById('q'),reg=document.getElementById('reg'),grav=document.getElementById('grav'),
      regola=document.getElementById('regola'),count=document.getElementById('count'),
      cards=[].slice.call(document.querySelectorAll('#list .seg'));
  function apply(){
    var t=q.value.trim().toLowerCase(),r=reg.value,g=grav.value,rg=regola.value,n=0;
    cards.forEach(function(c){
      var ok=true;
      if(t&&c.dataset.nome.indexOf(t)<0)ok=false;
      if(r&&c.dataset.reg!==r)ok=false;
      if(g&&c.dataset.grav!==g)ok=false;
      if(rg&&c.dataset.regola!==rg)ok=false;
      c.classList.toggle('hidden',!ok);if(ok)n++;
    });
    count.textContent=n+' segnalazioni';
  }
  [q,reg,grav,regola].forEach(function(el){el.addEventListener('input',apply);el.addEventListener('change',apply);});
  apply();
})();
</script>
`;
  return page({
    title: 'Segnalazioni — Ospedali Trasparenti',
    description: 'Anomalie contabili automatiche negli ospedali pubblici italiani: disavanzi, patrimonio netto negativo, salti anomali di costi e ricavi.',
    active: 'segnalazioni.html',
    body,
  });
}
