// Every linked datum in a real browser (owner, 3 November 2026: "tutti i dati possibili vengono
// compilati automaticamente una volta inseriti in tutti i campi che hanno voci identiche … dobbiamo
// essere perfetti"). For each kind of sheet — six panel makes × electric, MRL, hydraulic, with the argano
// sheet, 2SG, AMI 100 and the DMG fixtures open as the sheet allows — every place of every linked datum
// is written alone and every other place shown must follow at once (public/js/collegati.js). Then the
// panel make is changed: what the old order says is in the new one.
import { fail, tick } from './helpers.mjs';

const PANELS = [
  ['PELAZZA'],
  ['MOVILIFT'],
  ['DMG'],
  ['MASTECH', 'NG120'],
  ['MASTECH', 'QI_TOUCH'],
  ['ELETTROQUADRI'],
];

/** The rest of the sheet, in the order a person ticks it. */
const PLANTS = [
  [
    ['tipoImpianto', 'ELETTRICO'],
    ['tipoPorte', 'AUTOMATICHE'],
    ['arganoPreventivo', 'si'],
    ['sospensioni', 'si'],
    ['fossaRidotta', 'si'],
    ['fossaInterventi', 'AMI100_RTBS'],
  ],
  [
    ['tipoImpianto', 'ELETTRICO'],
    ['tipoPorte', 'SEMIAUTOMATICHE'],
    ['pattinoRetrattile', 'si'],
    ['arganoPreventivo', 'no'],
    ['operatore', 'si'],
    ['operatoreOrdine', 'si'],
    ['operatoreModulo', 'MODULO_2SG'],
    ['testataRidotta', 'si'],
    ['testataInterventi', 'AMI100_RTBS'],
  ],
  [
    ['tipoImpianto', 'GEARLESS'],
    ['tipoPorte', 'MANUALI'],
    ['arganoPreventivo', 'si'],
  ],
  [
    ['tipoImpianto', 'IDRAULICO'],
    ['tipoPorte', 'AUTOMATICHE'],
    ['centralinaDaFare', 'si'],
    ['sospensioni', 'si'],
  ],
  [
    ['tipoImpianto', 'IDRAULICO'],
    ['tipoPorte', 'AUTOMATICHE'],
    ['centralinaDaFare', 'no'],
  ],
];

/** The sheet's choices that open the forms: never written by the check (the forms would close). */
const FIXED = ['tipoImpianto', 'tipoPorte', 'fossaRidotta', 'testataRidotta'];

async function openSheet(page, base, aziendaName, ticks) {
  await page.goto(`${base}/schede/nuova`);
  await page.selectOption('#f-azienda', { label: aziendaName });
  for (const [name, value] of ticks) await tick(page, name, value);
}

/**
 * In the page: every group, every shown place written alone, every other shown place read. Same rules as
 * public/js/collegati.js — a number is the same number (or the option that says it), a choice ticks the
 * one box of its category (a radio group the first), nothing when the category is not there or is
 * ambiguous.
 */
function everyLinkInPage(fixed) {
  const data = JSON.parse(document.getElementById('collegati-dati').textContent);
  const form = document.querySelector('[data-scheda-form]');
  const { same } = window.rilieviValori;
  const byName = (name) => Array.from(form.querySelectorAll(`[name="${CSS.escape(name)}"]`));
  const shown = (el) => !el.closest('[data-off]');
  const hydraulic = byName('tipoImpianto').some((el) => el.checked && el.value === 'IDRAULICO');
  const nameOf = (m, key) => (m.luogo === 'scheda' ? key : `${m.luogo}-${key}`);
  const isTick = (el) => el.type === 'checkbox' || el.type === 'radio';

  const placeOf = (group, m) => {
    const sheet = m.luogo === 'scheda';
    if (group.tipo === 'numero') {
      const key = !sheet && m.idraulico && hydraulic ? m.idraulico : m.campo;
      const els = byName(nameOf(m, key));
      if (!els.length) return null;
      return { m, sheet, els, kind: els[0].type === 'radio' ? 'map' : 'text' };
    }
    if (!sheet && m.campo !== undefined) {
      const els = byName(nameOf(m, m.campo)).filter((el) => el.value in m.voci);
      return els.length ? { m, sheet, els, kind: 'radio' } : null;
    }
    const els = Object.keys(m.voci)
      .map((key) =>
        sheet
          ? byName(m.campo).find((el) => el.value === key)
          : byName(`${m.luogo}-${key}`).find((el) => el instanceof HTMLInputElement),
      )
      .filter(Boolean);
    return els.length ? { m, sheet, els, kind: 'boxes' } : null;
  };
  const keyOf = (p, el) =>
    p.sheet || p.kind === 'radio' ? el.value : el.name.slice(p.m.luogo.length + 1);
  const reset = (p) =>
    p.els.forEach((el) => {
      if (isTick(el)) el.checked = false;
      else el.value = '';
      delete el.dataset.auto;
      delete el.dataset.touched;
    });
  const fire = (el) =>
    el.dispatchEvent(new Event(isTick(el) ? 'change' : 'input', { bubbles: true }));
  const label = (p) => `${p.m.luogo}.${p.m.campo || Object.keys(p.m.voci).join('|')}`;

  /** A value every shown number place of the group can hold. */
  const numberFor = (places) => {
    const map = places.find((p) => p.kind === 'map');
    if (map) return Object.values(map.m.valori)[0];
    let value = '7';
    for (const p of places) {
      const el = p.els[0];
      if (el instanceof HTMLSelectElement) {
        const options = Array.from(el.options).filter((o) => o.value);
        if (!options.some((o) => same(o.value, value))) value = options[0].value;
      }
      if (p.sheet && p.m.min !== undefined && Number(value) < p.m.min) value = String(p.m.min);
    }
    return value;
  };

  const failures = [];
  let pairs = 0;
  for (const group of data.gruppi) {
    const places = group.membri.map((m) => placeOf(group, m)).filter((p) => p && shown(p.els[0]));
    if (places.length < 2) continue;
    const speaking = places.find(
      (p) => p.sheet && fixed.includes(p.m.campo) && p.els.some((el) => el.checked),
    );
    const free = places.filter((p) => !(p.sheet && fixed.includes(p.m.campo)));
    // A fixed choice of the sheet speaks in its group: only it is the source there.
    const sources = speaking ? [speaking] : free;
    const value = group.tipo === 'numero' ? numberFor(places) : null;
    for (const source of sources) {
      const writes =
        group.tipo === 'numero'
          ? [null]
          : speaking
            ? [
                keyOf(
                  source,
                  source.els.find((el) => el.checked),
                ),
              ]
            : Object.keys(source.m.voci).filter((key) =>
                source.els.some((el) => keyOf(source, el) === key),
              );
      for (const voce of writes) {
        free.forEach(reset);
        if (source === speaking) fire(source.els.find((el) => el.checked));
        else if (group.tipo === 'numero' && source.kind === 'map') {
          const el = source.els.find((e) => same(source.m.valori[e.value] ?? '', value));
          el.checked = true;
          fire(el);
        } else if (group.tipo === 'numero') {
          const el = source.els[0];
          el.value = el instanceof HTMLSelectElement ? numberOption(el, value) : value;
          fire(el);
        } else {
          const el = source.els.find((e) => keyOf(source, e) === voce);
          el.checked = true;
          fire(el);
        }
        const category = group.tipo === 'scelta' ? source.m.voci[voce] : null;
        for (const target of free) {
          if (target === source || !shown(target.els[0])) continue;
          pairs += 1;
          const where = `${group.key}: ${label(source)} → ${label(target)}`;
          if (group.tipo === 'numero') {
            const got =
              target.kind === 'map'
                ? (target.m.valori[target.els.find((el) => el.checked)?.value] ?? '')
                : target.els[0].value;
            if (!got || !same(got, value)) failures.push(`${where}: "${got}", not "${value}"`);
            continue;
          }
          const keys = Object.keys(target.m.voci).filter((k) => target.m.voci[k] === category);
          const wanted = target.kind === 'radio' ? keys.slice(0, 1) : keys.length === 1 ? keys : [];
          const got = target.els.filter((el) => el.checked).map((el) => keyOf(target, el));
          if (got.join() !== wanted.join())
            failures.push(`${where} (${category}): [${got}], not [${wanted}]`);
        }
      }
    }
    free.forEach(reset);
    // Leave the page as the person would: nothing of this group follows anything.
    if (free.length) fire(free[0].els[0]);
  }
  return { failures, pairs };

  function numberOption(select, wanted) {
    const option = Array.from(select.options).find((o) => o.value && same(o.value, wanted));
    return option ? option.value : '';
  }
}

/**
 * The make changes: what the old panel order says is in the new one, for every linked datum the two
 * share (the sheet says nothing of these).
 */
function writePanelInPage(prefix) {
  const data = JSON.parse(document.getElementById('collegati-dati').textContent);
  const form = document.querySelector('[data-scheda-form]');
  const hydraulic = Array.from(form.querySelectorAll('[name="tipoImpianto"]')).some(
    (el) => el.checked && el.value === 'IDRAULICO',
  );
  const written = [];
  for (const group of data.gruppi) {
    if (group.membri.some((m) => m.luogo === 'scheda')) continue;
    const m = group.membri.find((x) => x.luogo === prefix);
    if (!m) continue;
    if (group.tipo === 'numero') {
      const key = m.idraulico && hydraulic ? m.idraulico : m.campo;
      const el = form.querySelector(`[name="${prefix}-${key}"]`);
      if (!el || el instanceof HTMLSelectElement) continue;
      el.value = '9';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      written.push({ key: group.key, value: '9' });
    } else {
      const [voce, category] = Object.entries(m.voci)[0];
      const el =
        m.campo !== undefined
          ? form.querySelector(`[name="${prefix}-${m.campo}"][value="${voce}"]`)
          : form.querySelector(`input[name="${prefix}-${voce}"]`);
      if (!el) continue;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      written.push({ key: group.key, category });
    }
  }
  return written;
}

function readPanelInPage({ prefix, written }) {
  const data = JSON.parse(document.getElementById('collegati-dati').textContent);
  const form = document.querySelector('[data-scheda-form]');
  const { same } = window.rilieviValori;
  const hydraulic = Array.from(form.querySelectorAll('[name="tipoImpianto"]')).some(
    (el) => el.checked && el.value === 'IDRAULICO',
  );
  const failures = [];
  let checked = 0;
  for (const { key, value, category } of written) {
    const group = data.gruppi.find((g) => g.key === key);
    const m = group.membri.find((x) => x.luogo === prefix);
    if (!m) continue;
    if (group.tipo === 'numero') {
      const field = m.idraulico && hydraulic ? m.idraulico : m.campo;
      const el = form.querySelector(`[name="${prefix}-${field}"]`);
      if (!el || el instanceof HTMLSelectElement) continue;
      checked += 1;
      if (!same(el.value, value))
        failures.push(`${key} → ${prefix}: "${el.value}", not "${value}"`);
      continue;
    }
    const keys = Object.keys(m.voci).filter((k) => m.voci[k] === category);
    // No box of the category, or more than one (the other order decides nothing then).
    if (!keys.length || (m.campo === undefined && keys.length > 1)) continue;
    const box =
      m.campo !== undefined
        ? form.querySelector(`[name="${prefix}-${m.campo}"][value="${keys[0]}"]`)
        : form.querySelector(`input[name="${prefix}-${keys[0]}"]`);
    if (!box) continue;
    checked += 1;
    if (!box.checked) failures.push(`${key} → ${prefix}: ${keys[0]} not ticked for ${category}`);
  }
  return { failures, checked };
}

/** Panel order switches: [from, to, plant]. */
const SWITCHES = [
  [['PELAZZA'], ['ELETTROQUADRI'], 'ELETTRICO', 'oq', 'eg'],
  [['ELETTROQUADRI'], ['MASTECH', 'NG120'], 'ELETTRICO', 'eg', 'mn'],
  [['MASTECH', 'NG120'], ['MASTECH', 'QI_TOUCH'], 'ELETTRICO', 'mn', 'mq'],
  [['MASTECH', 'QI_TOUCH'], ['DMG'], 'ELETTRICO', 'mq', 'dp'],
  [['DMG'], ['MOVILIFT'], 'ELETTRICO', 'dp', 'om'],
  [['MOVILIFT'], ['PELAZZA'], 'ELETTRICO', 'om', 'oq'],
  [['ELETTROQUADRI'], ['MASTECH', 'NG120'], 'GEARLESS', 'el', 'mn'],
  [['ELETTROQUADRI'], ['DMG'], 'IDRAULICO', 'eo', 'dp'],
  [['DMG'], ['PELAZZA'], 'IDRAULICO', 'dp', 'oq'],
];

const make = async (page, [marca, modello]) => {
  await tick(page, 'quadroMarca', marca);
  if (modello) await tick(page, 'quadroModello', modello);
};

export async function checkEveryLink(context, { base, aziendaName, scheme }) {
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${scheme} every link: page error ${error.message}`));
  let pairs = 0;
  for (const panel of PANELS) {
    for (const plant of PLANTS) {
      const what = `${panel.join(' ')} · ${plant.map(([, v]) => v).join(' ')}`;
      await openSheet(page, base, aziendaName, [
        ...plant.slice(0, 2),
        ['quadroMarca', panel[0]],
        ...(panel[1] ? [['quadroModello', panel[1]]] : []),
        ['quadroOrdine', 'si'],
        ['bottoniereSostituire', 'si'],
        ['bottoniereOrdine', 'si'],
        ...plant.slice(2),
      ]);
      const result = await page.evaluate(everyLinkInPage, FIXED);
      pairs += result.pairs;
      for (const failure of result.failures.slice(0, 20))
        fail(`${scheme} every link [${what}] ${failure}`);
      if (result.failures.length > 20)
        fail(`${scheme} every link [${what}]: ${result.failures.length - 20} more`);
    }
  }
  if (pairs < 2000) fail(`${scheme} every link: only ${pairs} pairs checked`);

  for (const [from, to, tipo, a, b] of SWITCHES) {
    await openSheet(page, base, aziendaName, [['tipoImpianto', tipo]]);
    await make(page, from);
    await tick(page, 'quadroOrdine', 'si');
    const written = await page.evaluate(writePanelInPage, a);
    await make(page, to);
    const result = await page.evaluate(readPanelInPage, { prefix: b, written });
    if (result.checked < 3) fail(`${scheme} make ${a} → ${b}: only ${result.checked} carried`);
    for (const failure of result.failures) fail(`${scheme} make ${a} → ${b}: ${failure}`);
  }

  // Pitagora's "Portata (kg/pers.)" from the sheet, while it is typed.
  const expect = async (selector, wanted, what) => {
    const actual = await page.inputValue(selector);
    if (actual !== wanted) fail(`${scheme} every link: ${what} is "${actual}", not "${wanted}"`);
  };
  await openSheet(page, base, aziendaName, [
    ['tipoImpianto', 'IDRAULICO'],
    ['quadroMarca', 'DMG'],
    ['quadroOrdine', 'si'],
    ['centralinaDaFare', 'si'],
  ]);
  await page.fill('#f-portataKg', '630');
  await page.fill('#f-capienzaPersone', '8');
  await expect('#f-dp-portata', '630/8', 'the load and persons of Pitagora');
  // The motor of the new power unit goes to "HYDRO", never to "VVVF"; when the lift becomes electric
  // the power unit is not asked and what was put there for it goes.
  await page.fill('#f-centralinaMotoreV', '400');
  await expect('#f-dp-centralinaV', '400', 'the power unit voltage of Pitagora');
  await expect('#f-dp-motoreV', '', 'the VVVF voltage of Pitagora for a hydraulic lift');
  await tick(page, 'tipoImpianto', 'ELETTRICO');
  await expect('#f-dp-centralinaV', '', 'the power unit voltage of an electric lift');
  await expect('#f-dp-motoreV', '', 'the VVVF voltage from a hidden field');
  await page.close();
  return pairs;
}

/**
 * "Dati cliente" of the MoviLift order from the company settings (owner, 3 November 2026: "popola i dati
 * dell'azienda … dove c'è spazio per l'e-mail che si possa cambiare"): after the settings were saved
 * (cartelli.mjs), a new sheet of that company has them; a typed email stays.
 */
export async function checkCompanyData(context, { base, aziendaName, scheme }) {
  const page = await context.newPage();
  page.on('pageerror', (error) => fail(`${scheme} company data: page error ${error.message}`));
  await openSheet(page, base, aziendaName, [
    ['quadroMarca', 'MOVILIFT'],
    ['quadroOrdine', 'si'],
  ]);
  for (const [name, wanted] of [
    ['ragioneSociale', 'Ascensori E2E S.r.l.'],
    ['indirizzo', 'Via Roma 12'],
    ['cap', '20121'],
    ['citta', 'Milano'],
    ['prov', 'MI'],
    ['telefono', '02 1234567'],
    ['email', 'info@ascensori-e2e.example'],
  ]) {
    const actual = await page.inputValue(`#f-om-${name}`);
    if (actual !== wanted)
      fail(`${scheme} company data: MoviLift ${name} is "${actual}", not "${wanted}"`);
  }
  await page.fill('#f-om-email', 'ordini@ascensori-e2e.example');
  await page.fill('#f-fermate', '5');
  if ((await page.inputValue('#f-om-email')) !== 'ordini@ascensori-e2e.example')
    fail(`${scheme} company data: the typed email of the MoviLift order was replaced`);
  await page.close();
}
