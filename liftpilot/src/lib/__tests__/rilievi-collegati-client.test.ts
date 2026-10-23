// Rilievi — the linked data and the modules' survey fields in the browser (collegati-client.ts, prefill-client.ts),
// ported from rilievi's e2e tests tempo-reale.mjs, collegati.mjs and movilift.mjs (commit 988f3cf37) over a form made of
// plain controls as the page draws them (the sheet's fields, the six modules, data-auto, data-predefinito, the hidden
// ones): a module fills the sheet, the sheet fills the modules while it is typed, one module the other, the sheet's
// «Accessi» carries the entrances to the other make's order; a field typed by hand keeps its value and the difference is
// listed; the Pelazza order carries over to MoviLift when the make changes; a radio goes back to the blank module's answer
// when the sheet says nothing; the fields still following travel with the save.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeFields, SECTIONS, type FieldDef } from '@/lib/rilievi/fields';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { emptyFormValues, rispostaLabel } from '@/lib/rilievi/format';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { collegatiEngine, type CollegatiHost, type Ctl } from '@/lib/rilievi/collegati-client';
import { collegatiPerBrowser } from '@/lib/rilievi/ordini/collegati-browser';
import { moduloSpecs, withPrefill } from '@/lib/rilievi/ordini/form';
import { slotAperto, SLOTS } from '@/lib/rilievi/ordini/registry';
import { prefillFill, type PrefillHost } from '@/lib/rilievi/prefill-client';

const t = rilieviTranslator();
const contesto = { azienda: 'Ascensori Rossi Srl', utente: 'Mario Bianchi', ruolo: 'Tecnico', email: 'mario@example.it' };
const etichetta = (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`);

interface El extends Ctl {
  name: string;
  type: string;
  value: string;
  checked: boolean;
  maxLength: number;
  dataset: { auto?: string; touched?: string; predefinito?: string };
  label: string;
  options: string[] | null;
  prefill: string | null;
  /** the sheet's field, or the module's prefix */
  field?: string;
  prefix?: string;
}

const control = (c: Partial<El> & { name: string; type: string }): El => ({ value: '', checked: false, maxLength: -1, dataset: {}, label: '', options: null, prefill: null, ...c });

/** The form as the page draws it: every field of the sheet and of the four modules. */
function drawForm(start: FormValues, auto: ReadonlySet<string>) {
  const els: El[] = [];
  for (const section of SECTIONS) {
    for (const f of section.fields as readonly FieldDef[]) {
      if (f.kind === 'checks') for (const o of f.options) els.push(control({ name: f.key, type: 'checkbox', value: o, label: etichetta(f.key, o), field: f.key }));
      else if (f.kind === 'choice') for (const o of f.options) els.push(control({ name: f.key, type: 'radio', value: o, label: etichetta(f.key, o), field: f.key }));
      else if (f.kind === 'yesno') for (const o of f.risposte ?? (['si', 'no'] as const)) els.push(control({ name: f.key, type: 'radio', value: o, label: rispostaLabel(f, o, t), field: f.key }));
      else els.push(control({ name: f.key, type: 'text', maxLength: 'maxLength' in f ? f.maxLength : -1, field: f.key }));
    }
  }
  for (const spec of moduloSpecs()) {
    for (const g of spec.gruppi) for (const r of g.righe) for (const f of r.campi) {
      const base = { name: f.name, prefix: spec.prefix, prefill: f.prefill, label: f.label };
      if (f.kind === 'check') els.push(control({ ...base, type: 'checkbox', value: 'si' }));
      else if (f.kind === 'radio') for (const o of f.opzioni ?? []) els.push(control({ ...base, type: 'radio', value: o.valore, label: o.label, dataset: f.predefinito === o.valore ? { predefinito: '' } : {} }));
      else if (f.kind === 'select') els.push(control({ ...base, type: 'select-one', options: ['', ...(f.opzioni ?? []).map((o) => o.valore)] }));
      else els.push(control({ ...base, type: 'text', maxLength: f.maxLength ?? -1 }));
    }
  }
  // the values the server put there, `auto` as data-auto
  for (const el of els) {
    const v = start[el.name];
    const isTick = el.type === 'checkbox' || el.type === 'radio';
    if (isTick) el.checked = Array.isArray(v) ? v.includes(el.value) : v === el.value;
    else el.value = typeof v === 'string' ? v : '';
    if (auto.has(el.name)) {
      if (!isTick) el.dataset.auto = el.value;
      else if (el.checked) el.dataset.auto = 'si';
    }
  }
  return els;
}

function valuesOf(els: readonly El[]): FormValues {
  const out: FormValues = {};
  for (const el of els) {
    const isTick = el.type === 'checkbox' || el.type === 'radio';
    if (isTick && !el.checked) continue;
    const before = out[el.name];
    out[el.name] = before === undefined ? el.value : Array.isArray(before) ? [...before, el.value] : [before, el.value];
  }
  return out;
}

/** A page: the controls, the engines, and the person typing (rilievi's order: touched, the survey fields, the links). */
function page(initial: FormValues = emptyFormValues('2026-10-12')) {
  const start = withPrefill(initial, { ...contesto, etichetta });
  const els = drawForm(start.values, start.auto);
  const state = () => {
    const values = valuesOf(els);
    return { values, active: activeFields((key) => values[key]) };
  };
  const moduloOn = (prefix: string, values: FormValues, active: Set<string>, withMake: boolean) => {
    const slot = SLOTS.find((s) => s.prefix === prefix);
    if (!slot) return false;
    if (withMake) return slotAperto(slot, active, (key) => values[key]);
    return active.has(slot.question) && values[slot.question] === 'si';
  };
  const host: CollegatiHost<El> & PrefillHost<El> = {
    byName: (name) => els.filter((el) => el.name === name),
    tickOf: (name, value) => els.find((el) => el.name === name && el.value === value && (el.type === 'checkbox' || el.type === 'radio')) ?? null,
    shown: (el) => {
      const { values, active } = state();
      return el.prefix ? moduloOn(el.prefix, values, active, true) : active.has(el.field ?? '');
    },
    moduloOpen: (el) => {
      if (!el.prefix) return null;
      const { values, active } = state();
      return moduloOn(el.prefix, values, active, false);
    },
    labelOf: (el) => el.label,
    optionsOf: (el) => el.options,
    autoControls: () => els.filter((el) => el.dataset.auto !== undefined),
    controls: () => els.filter((el) => el.prefill !== null),
    tokenOf: (el) => el.prefill ?? '',
  };
  const engine = collegatiEngine(collegatiPerBrowser(t, contesto), host);
  let found = engine.settle(() => undefined);
  const survey = () => prefillFill(host, state().values, { contesto, etichetta });
  survey();
  found = engine.settle(() => survey());
  const after = (el: El) => {
    engine.touch(el);
    survey();
    found = engine.settle(() => survey());
  };
  return {
    els,
    get found() { return found; },
    value: (name: string) => els.find((el) => el.name === name)?.value ?? '',
    chosen: (name: string) => els.filter((el) => el.name === name && el.checked).map((el) => el.value),
    fill(name: string, value: string) {
      const el = els.find((e) => e.name === name);
      assert.ok(el, name);
      el.value = value;
      after(el);
    },
    tick(name: string, value: string, on = true) {
      const el = els.find((e) => e.name === name && e.value === value);
      assert.ok(el, `${name}=${value}`);
      if (el.type === 'radio' && on) for (const other of els) if (other.name === name) other.checked = false;
      el.checked = on;
      after(el);
    },
    following: () => engine.followingNames(),
  };
}

describe('the same data in every place, filled in real time', () => {
  it('a module fills the sheet; the sheet fills the modules while it is typed; one module the other', () => {
    const p = page();
    p.tick('quadroMarca', 'PELAZZA');
    p.tick('quadroOrdine', 'si');
    p.tick('bottoniereMisure', 'si');
    p.fill('oq-nFermate', '7');
    assert.equal(p.value('fermate'), '7', 'the stops of the sheet, from the panel order');
    p.tick('arganoPreventivo', 'si');
    assert.equal(p.value('pa-piani'), '7', 'the stops of the argano sheet');
    p.fill('pa-funiN', '4');
    assert.equal(p.value('funiNumero'), '4', 'the ropes of the sheet, from the argano sheet');
    p.fill('pa-portata', '1.000');
    assert.equal(p.value('portataKg'), '1000', 'the load of the sheet, from «1.000»');
    p.fill('pa-indirizzo', 'Via Roma 1, Torino');
    assert.equal(p.value('indirizzo'), 'Via Roma 1, Torino');

    p.fill('numeroImpianto', '880011');
    assert.equal(p.value('oq-rifImpianto'), 'N° 880011 — Via Roma 1, Torino', 'the order reference');
    assert.equal(p.value('pa-nImpianto'), '880011');
    p.fill('data', '2026-10-14');
    assert.equal(p.value('oq-data'), '14/10/2026');
    p.tick('tipoPorte', 'AUTOMATICHE');
    assert.deepEqual(p.chosen('oq-porteAutomatiche'), ['si'], 'the doors of the panel order follow the sheet');

    // one form fills the other — the door operator of one panel order is a list option of the other make's (the sheet
    // no longer asks the operator, October 2026: rilievi's tests/e2e/tempo-reale.mjs, 988f3cf37)
    p.fill('oq-opModello', 'Selcom');
    assert.equal(p.value('om-marcaOpA'), 'SELCOM', 'the door operator of the MoviLift order, a list option');
    p.fill('oq-motIn', '12');
    assert.equal(p.value('pa-ampere'), '12', 'the motor current of the argano sheet');
    p.fill('oq-nAccessi', '2');
    assert.deepEqual(p.chosen('doppioAccesso'), ['si'], '«Accessi: 2» of the sheet follows the panel order');
    assert.deepEqual(p.chosen('om-ingressi'), ['doppio'], 'the MoviLift entrances follow through the sheet');

    // typed by hand on both sides: each keeps its value, the difference is listed
    p.fill('fermate', '8');
    assert.equal(p.value('oq-nFermate'), '7', 'the stops typed in the panel order');
    assert.equal(p.value('pa-piani'), '8', 'the stops of the argano sheet, still following');
    assert.deepEqual(p.found.find((d) => d.key === 'fermate')?.voci, [{ luogo: 'scheda', valore: '8' }, { luogo: 'oq', valore: '7' }, { luogo: 'pa', valore: '8' }]);
  });

  it('lists a different speed under both groups, never the same number written otherwise; a typed value is kept', () => {
    const p = page();
    p.tick('quadroMarca', 'PELAZZA');
    p.tick('quadroOrdine', 'si');
    p.tick('arganoPreventivo', 'si');
    p.fill('oq-velocita', '1,0');
    assert.equal(p.value('pa-velocita'), '1,0');
    p.fill('pa-velocita', '1.0');
    assert.equal(p.found.some((d) => d.key === 'velocita'), false, '1,0 and 1.0 are the same');
    p.fill('pa-velocita', '1,6');
    const speed = p.found.find((d) => d.key === 'velocita');
    assert.deepEqual(speed?.voci, [{ luogo: 'oq', valore: '1,0' }, { luogo: 'pa', valore: '1,6' }]);
    assert.equal(speed?.nome, 'Velocità (m/s)');
    p.fill('oq-velocita', '1,2');
    assert.equal(p.value('pa-velocita'), '1,6', 'a typed value is never overwritten');
  });

  it('carries the Pelazza order over to MoviLift when the make changes; a radio goes back to the blank form', () => {
    // the operator's make and voltage: a page from before still sends them, they fill nothing (off the sheet, October 2026)
    const p = page({ ...emptyFormValues('2026-10-12'), fermate: '6', portataKg: '630', tipoImpianto: ['ELETTRICO'], tipoPorte: ['AUTOMATICHE'], operatoreMarca: 'Selcom', operatoreTensione: '24 V DC', doppioAccesso: 'si', ubicazioneMacchina: ['ALTO'] });
    p.tick('quadroMarca', 'PELAZZA');
    p.tick('quadroOrdine', 'si');
    p.fill('oq-velocita', '1,6');
    p.fill('oq-opModello', 'Selcom');
    p.tick('quadroMarca', 'MOVILIFT');
    assert.equal(p.value('om-velocita'), '1,6', 'the speed of the Pelazza order carried over');
    for (const [name, value] of [['om-fermate', '6'], ['om-portata', '630'], ['om-tipologia', 'Elettrico'], ['om-tipoPorte', 'Automatiche'], ['om-marcaOpA', 'SELCOM']]) assert.equal(p.value(name ?? ''), value, name);
    assert.equal(p.value('om-voltA'), '', 'the operator voltage is no longer taken from the sheet');
    assert.deepEqual([p.chosen('om-ingressi'), p.chosen('om-locMacc'), p.chosen('om-controllo')], [['doppio'], ['alto'], ['scheda']]);
    // the machine room follows the sheet; with nothing there, the blank form's «in ALTO» again
    p.tick('ubicazioneMacchina', 'ALTO', false);
    p.tick('ubicazioneMacchina', 'BASSO');
    assert.deepEqual(p.chosen('om-locMacc'), ['basso']);
    p.tick('ubicazioneMacchina', 'BASSO', false);
    assert.deepEqual(p.chosen('om-locMacc'), ['alto']);
    // a selected double entrance is still a double entrance; a single one is a difference
    p.tick('om-ingressi', 'doppioSelezionato');
    assert.equal(p.found.some((d) => d.key === 'ingressi'), false);
    p.tick('om-ingressi', 'unico');
    assert.deepEqual(p.found.find((d) => d.key === 'ingressi')?.voci, [{ luogo: 'scheda', valore: '2' }, { luogo: 'om', valore: 'Operatore Unico' }]);
  });

  it('sends with the save the names still following, never what was typed', () => {
    const p = page();
    p.tick('quadroMarca', 'PELAZZA');
    p.tick('quadroOrdine', 'si');
    p.fill('oq-nFermate', '5');
    const following = p.following();
    assert.ok(following.includes('fermate'), 'the sheet filled from the order');
    assert.ok(following.includes('oq-data') && following.includes('oq-cliente'), 'the survey fields of the order');
    assert.ok(!following.includes('oq-nFermate'), 'typed by hand');
  });
});
