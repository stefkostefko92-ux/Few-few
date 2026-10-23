// Rilievi — the sheet form's rules in the browser that came with rilievi 988f3cf37 (app.js, moduli.js, form.ejs, _when.ejs,
// _modulo.ejs): the conditions of the sections and of `data-when-not` as the page syncs them (form-dom.ts offBy over the
// attributes of when.ts) give what activeParts gives the server, whatever the answers; the modules stand after their
// question's chain (moduliDopo) and the Mastech ones open by make and model; one tick per module for the print; a survey
// field the person emptied in a module (data-scritto) is never refilled, and the browser's own list of them — the form
// it brings back after a save with no answer — is the server's (withPrefill `scritti`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { offBy } from '@/components/rilievi/form-dom';
import { whenAttrs, type WhenAttrs } from '@/components/rilievi/when';
import type { Ctl } from '@/lib/rilievi/collegati-client';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { activeParts, SECTIONS, type FieldDef, type SectionDef } from '@/lib/rilievi/fields';
import { colonneDi } from '@/lib/rilievi/form-help';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { moduliDopo } from '@/lib/rilievi/ordini/dopo';
import { moduloSpecs, withPrefill } from '@/lib/rilievi/ordini/form';
import { COLONNE } from '@/lib/rilievi/ordini/registry';
import { prefillFill, scrittiInviati, type PrefillHost } from '@/lib/rilievi/prefill-client';

const t = rilieviTranslator();
const etichetta = (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`);
const contesto = { azienda: 'Ascensori Rossi Srl', utente: 'Mario Bianchi', ruolo: 'Tecnico', email: 'mario@example.it' };

/** An element's dataset as the browser makes it of the attributes (`data-when-values` → whenValues). */
function datasetOf(attrs: WhenAttrs): { when?: string; whenValues?: string; whenNot?: string } {
  const out: { when?: string; whenValues?: string; whenNot?: string } = {};
  if (attrs['data-when'] !== undefined) out.when = attrs['data-when'];
  if (attrs['data-when-values'] !== undefined) out.whenValues = attrs['data-when-values'];
  if (attrs['data-when-not'] !== undefined) out.whenNot = attrs['data-when-not'];
  return out;
}

/** Hidden on the page with these values: as syncConditions decides it. */
function hidden(when: SectionDef['when'], values: FormValues): boolean {
  return offBy(datasetOf(whenAttrs(when, false)), values, activeParts((k) => values[k]).fields);
}

/** A small seeded generator: the same answers on every run. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('the conditions on the page', () => {
  it('write rilievi’s attributes: the field, its answers, «not», hidden at the opening; nothing without a condition', () => {
    assert.deepEqual(whenAttrs({ field: 'tipoImpianto', values: ['IDRAULICO'], not: true }, true),
      { 'data-when': 'tipoImpianto', 'data-when-values': 'IDRAULICO', 'data-when-not': '', 'data-off': '' });
    assert.deepEqual(whenAttrs({ field: 'tipoPorte', values: ['MANUALI', 'SEMIAUTOMATICHE'] }, false),
      { 'data-when': 'tipoPorte', 'data-when-values': 'MANUALI SEMIAUTOMATICHE', 'data-when-not': undefined, 'data-off': undefined });
    assert.deepEqual(whenAttrs(undefined, true), {});
  });

  it('hide «Argano» and «Limitatore» with a hydraulic lift, show «Centralina» only then; nothing ticked — the machine', () => {
    const section = (key: string) => (SECTIONS as readonly SectionDef[]).find((s) => s.key === key)?.when;
    for (const [tipo, argano, centralina] of [[undefined, false, true], ['ELETTRICO', false, true], ['GEARLESS', false, true], ['IDRAULICO', true, false]] as const) {
      const values: FormValues = tipo ? { tipoImpianto: [tipo] } : {};
      assert.equal(hidden(section('argano'), values), argano, `argano, ${tipo}`);
      assert.equal(hidden(section('limitatore'), values), argano, `limitatore, ${tipo}`);
      assert.equal(hidden(section('centralina'), values), centralina, `centralina, ${tipo}`);
    }
    // a single tick comes from the browser as a string
    assert.equal(hidden(section('argano'), { tipoImpianto: 'IDRAULICO' }), true);
  });

  it('give what activeParts gives the server, for every section and every field of a shown section, whatever the answers', () => {
    const rand = prng(49);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
    const yn = ['', 'si', 'no'] as const;
    const asks = ['arganoPreventivo', 'kitControlloGanasce', 'controlloQuadro', 'centralinaDaFare', 'emendamentoA3', 'tuboFlessibile', 'serrature',
      'pattinoRetrattile', 'sospensioni', 'luceVanoSostituire', 'quadroOrdine', 'bottoniereMisure'];
    for (let round = 0; round < 600; round += 1) {
      const values: FormValues = {};
      const tipo = pick(['', 'ELETTRICO', 'IDRAULICO', 'GEARLESS']);
      const porte = pick(['', 'AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI']);
      // the browser's shape (a string) and the server's (a list of one)
      if (tipo) values.tipoImpianto = rand() < 0.5 ? tipo : [tipo];
      if (porte) values.tipoPorte = rand() < 0.5 ? porte : [porte];
      const marca = pick(['', 'PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO']);
      if (marca) values.quadroMarca = marca;
      const modello = pick(['', 'NG120', 'QI_TOUCH']);
      if (modello) values.quadroModello = modello;
      for (const key of asks) {
        const v = pick(yn);
        if (v) values[key] = v;
      }
      const parts = activeParts((k) => values[k]);
      for (const section of SECTIONS as readonly SectionDef[]) {
        if (section.when) assert.equal(hidden(section.when, values), !parts.sections.has(section.key), `${section.key} ${JSON.stringify(values)}`);
        if (!parts.sections.has(section.key)) continue;
        for (const field of section.fields as readonly FieldDef[]) {
          if (field.when) assert.equal(hidden(field.when, values), !parts.fields.has(field.key), `${field.key} ${JSON.stringify(values)}`);
        }
      }
    }
  });
});

describe('the modules in the form', () => {
  const specs = moduloSpecs();

  it('stand after their question and the fields that follow from it: the panel’s four, the argano sheet, 2SG', () => {
    const placed: Record<string, string[]> = {};
    for (const section of SECTIONS as readonly SectionDef[]) {
      const dopo = moduliDopo(section.fields);
      for (const field of section.fields) {
        const here = specs.filter((s) => dopo.get(field.key)?.includes(s.column)).map((s) => s.prefix);
        if (here.length) placed[field.key] = here;
      }
    }
    assert.deepEqual(placed, { quadroOrdine: ['oq', 'om', 'mn', 'mq'], controlloQuadroTipo: ['pa'], sospensioniNumero: ['sg'] });
  });

  it('open Mastech’s by make and then by model; a model left from Mastech opens nothing with another make', () => {
    const byPrefix = new Map<string, (typeof specs)[number]>(specs.map((s) => [s.prefix, s]));
    assert.deepEqual([byPrefix.get('mn')?.modello, byPrefix.get('mq')?.modello],
      [{ field: 'quadroModello', value: 'NG120' }, { field: 'quadroModello', value: 'QI_TOUCH' }]);
    assert.ok(['oq', 'om', 'pa', 'sg'].every((p) => byPrefix.get(p)?.modello === null));
    const wrapper = { field: 'quadroModello', values: ['NG120'] };
    assert.equal(hidden(wrapper, { quadroMarca: 'MASTECH', quadroModello: 'NG120' }), false);
    assert.equal(hidden(wrapper, { quadroMarca: 'MASTECH', quadroModello: 'QI_TOUCH' }), true);
    assert.equal(hidden(wrapper, { quadroMarca: 'PELAZZA', quadroModello: 'NG120' }), true);
    // the rows with the paper's heading (a group for screen readers)
    const titles = byPrefix.get('mn')?.gruppi.flatMap((g) => g.righe.map((r) => r.titolo)).filter((x) => x !== null) ?? [];
    assert.equal(titles[0], 'Norme di riferimento');
  });

  it('give one tick per module for the print, in the registry’s order', () => {
    assert.deepEqual(colonneDi(specs), [...COLONNE]);
    assert.deepEqual(colonneDi(specs), ['ordineQuadro', 'preventivoArgano', 'ordineSospensioni']);
  });
});

describe('a survey field the person emptied in a module', () => {
  type El = Ctl & { prefill: string };
  const el = (name: string, prefill: string, value = '', dataset: El['dataset'] = {}, type = 'text'): El =>
    ({ name, type, value, checked: false, maxLength: -1, dataset: { ...dataset }, prefill });
  const values: FormValues = { data: '2026-10-21', numeroImpianto: '880012', indirizzo: 'Via Roma 1', tipoPorte: ['MANUALI'], pattinoRetrattile: 'si' };

  it('stays empty (data-scritto), the others of its kind follow the sheet', () => {
    const emptied = el('om-ragioneSociale', 'azienda', '', { scritto: '' });
    const other = el('oq-cliente', 'azienda');
    const unticked = el('om-elettrPattino', 'pattinoRetrattile=si', '', { scritto: '' }, 'checkbox');
    const all = [emptied, other, unticked];
    const host: PrefillHost<El> = { controls: () => all, tokenOf: (c) => c.prefill, shown: () => true, optionsOf: () => null };
    const changed = prefillFill(host, values, { contesto, etichetta });
    assert.equal(emptied.value, '');
    assert.equal(unticked.checked, false);
    assert.equal(other.value, 'Ascensori Rossi Srl');
    assert.deepEqual(changed.map((c) => c.name), ['oq-cliente']);
  });

  it('is the same for the browser bringing the form back as for the server', () => {
    const shown = { 'oq-_': '1', 'om-_': '1', 'mn-_': '1', 'mq-_': '1', 'pa-_': '1', 'sg-_': '1' };
    const cases: FormValues[] = [
      // a new form: no module shown yet, nothing «emptied»
      { ...values, quadroMarca: 'MOVILIFT', quadroOrdine: 'si' },
      // every module shown, every survey field empty
      { ...values, ...shown, tipoImpianto: ['IDRAULICO'], ubicazioneMacchina: ['ALTO'] },
      // some written by hand, some emptied, the sheet's doors automatic (no cam to tick)
      { ...values, ...shown, tipoPorte: ['AUTOMATICHE'], 'om-riferimento': 'Commessa 77', 'oq-data': '01/10/2026', 'om-elettrPattino': 'si' },
      // the sheet says nothing: only the company, which the person writing always gives
      { ...shown },
    ];
    const lists = cases.map((sent) => {
      const server = [...withPrefill(sent, { ...contesto, etichetta }).scritti].sort();
      assert.deepEqual(scrittiInviati(moduloSpecs(), sent, { contesto, etichetta }).sort(), server, JSON.stringify(sent));
      return server;
    });
    assert.deepEqual(lists[0], []);
    assert.deepEqual(lists[3], ['mn-cliente', 'mq-cliente', 'om-ragioneSociale', 'oq-cliente', 'sg-mittente']);
    for (const name of ['oq-data', 'oq-cliente', 'om-ragioneSociale', 'om-elettrPattino', 'mn-cliente', 'mq-tipoImpianto', 'pa-macchina', 'sg-mittente']) {
      assert.ok(lists[1]?.includes(name), name);
    }
    assert.ok(!lists[2]?.includes('om-riferimento') && !lists[2]?.includes('oq-data') && !lists[2]?.includes('om-elettrPattino'), 'written, or nothing to tick');
    // the browser sends a single tick as a string; the server reads a list
    const browser = { ...values, ...shown, tipoImpianto: 'IDRAULICO', tipoPorte: 'MANUALI' };
    const server = { ...values, ...shown, tipoImpianto: ['IDRAULICO'], tipoPorte: ['MANUALI'] };
    assert.deepEqual(scrittiInviati(moduloSpecs(), browser, { contesto, etichetta }).sort(), [...withPrefill(server, { ...contesto, etichetta }).scritti].sort());
    assert.ok(scrittiInviati(moduloSpecs(), browser, { contesto, etichetta }).includes('mq-tipoImpianto'));
  });
});
