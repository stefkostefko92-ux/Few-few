// Every linked datum, every pair of its places (owner, 3 November 2026: "tutti i dati possibili vengono
// compilati automaticamente … in tutti i campi che hanno voci identiche"): for each sheet that opens both
// places, what is written in one place alone is what the server puts in the other when the form first
// opens, and a different value in the two is listed. A place that is never filled or never fills — in
// any of these sheets — fails the coverage check at the end.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import {
  COLLEGAMENTI,
  confrontato,
  moduloFields,
  type Collegamento,
  type MembroNumero,
  type MembroScelta,
} from '../src/ordini/collegamenti.js';
import { discrepanzeDi, prefillCollegati } from '../src/ordini/collegati.js';
import { opzioneDi } from '../src/ordini/opzioni.js';
import { slotAperto, SLOTS, type Prefisso } from '../src/ordini/registry.js';
import type { FormValues } from '../src/schede/field-parsers.js';
import { activeFields } from '../src/schede/fields.js';

const t = translatorFor('it');
type Values = Record<string, string | string[]>;
type Membro = MembroNumero | MembroScelta;

const PANNELLI: ReadonlyArray<Values> = [
  { quadroMarca: 'PELAZZA' },
  { quadroMarca: 'MOVILIFT' },
  { quadroMarca: 'DMG' },
  { quadroMarca: 'MASTECH', quadroModello: 'NG120' },
  { quadroMarca: 'MASTECH', quadroModello: 'QI_TOUCH' },
  { quadroMarca: 'ELETTROQUADRI' },
];

/** The rest of the sheet: the argano sheet, 2SG, AMI 100, the DMG fixtures, the power unit. */
const IMPIANTI: ReadonlyArray<Values> = [
  {
    tipoImpianto: ['ELETTRICO'],
    tipoPorte: ['AUTOMATICHE'],
    arganoPreventivo: 'si',
    sospensioni: 'si',
    fossaRidotta: 'si',
    fossaInterventi: ['AMI100_RTBS'],
  },
  {
    tipoImpianto: ['ELETTRICO'],
    tipoPorte: ['SEMIAUTOMATICHE'],
    pattinoRetrattile: 'si',
    arganoPreventivo: 'no',
    // The operator's 2SG sheet: "Sì", an order form, "2SG" (10 November 2026).
    operatore: 'si',
    operatoreOrdine: 'si',
    operatoreModulo: 'MODULO_2SG',
    testataRidotta: 'si',
    testataInterventi: ['AMI100_RTBS'],
  },
  {
    tipoImpianto: ['GEARLESS'],
    tipoPorte: ['MANUALI'],
    arganoPreventivo: 'si',
    fossaRidotta: 'si',
    fossaInterventi: ['AMI100_RTBS'],
  },
  {
    tipoImpianto: ['IDRAULICO'],
    tipoPorte: ['AUTOMATICHE'],
    centralinaDaFare: 'si',
    sospensioni: 'si',
  },
  { tipoImpianto: ['IDRAULICO'], tipoPorte: ['AUTOMATICHE'], centralinaDaFare: 'no' },
];

/**
 * Links between panel orders only (or a panel order and the sheet's choice that opens it): the server
 * never has two of their places open together — they work in the browser.
 */
const SOLO_BROWSER = new Set([
  'operatoreMarca',
  'servizi',
  'tensionePattino',
  'motoreMarca',
  'vvvfMarca',
  'cavoSchermato',
  'fotocellulaVolt',
  'pattiniNumero',
  'valvoleNumero',
  'forzaMotrice',
  'correnteFreno',
  'ventilazioneVolt',
  'precablato',
  'manovra',
  'funzionamento',
  'normaEn81',
  'norma8121',
  'norma8128',
  'norma8170',
  'norma8172',
  'norma8173',
  'legge13',
  'norma9516',
  'dm2005',
  'sintesiVocale',
  'manovraOspedaliera',
  'fondoMobile',
  'sovraccarico',
  'pienoCarico',
]);

const SCENARI: Values[] = PANNELLI.flatMap((pannello) =>
  IMPIANTI.map((impianto) => ({
    data: '2026-11-03',
    matricola: '33871',
    ...pannello,
    quadroOrdine: 'si',
    bottoniereSostituire: 'si',
    bottoniereOrdine: 'si',
    ...impianto,
  })),
);

const valueOf = (values: Values) => (key: string) => values[key];
const shown = (values: Values) => activeFields(valueOf(values));
const aperti = (values: Values): Set<Prefisso> => {
  const scheda = shown(values);
  return new Set(SLOTS.filter((s) => slotAperto(s, scheda, valueOf(values))).map((s) => s.prefix));
};
const idraulico = (values: Values) =>
  shown(values).has('tipoImpianto') && (values.tipoImpianto ?? []).includes('IDRAULICO');

/** Is the place there for the server: a shown field of the sheet, an open form. */
function attivo(m: Membro, values: Values): boolean {
  return m.luogo === 'scheda' ? shown(values).has(m.campo) : aperti(values).has(m.luogo);
}

/** The keys of the form a place writes in, for this sheet. */
function campiNomi(m: Membro, values: Values): string[] {
  if (m.luogo === 'scheda') return [m.campo];
  if ('campi' in m) return m.campi.map((k) => `${m.luogo}-${k}`);
  if ('idraulico' in m && m.idraulico && idraulico(values)) return [`${m.luogo}-${m.idraulico}`];
  if ('campo' in m && m.campo !== undefined) return [`${m.luogo}-${m.campo}`];
  return Object.keys((m as MembroScelta).voci).map((k) => `${m.luogo}-${k}`);
}

function svuota(m: Membro, values: Values): void {
  if (m.luogo === 'scheda') delete values[m.campo];
  else for (const name of campiNomi(m, values)) delete values[name];
  if (m.luogo !== 'scheda' && 'idraulico' in m && m.idraulico) {
    delete values[`${m.luogo}-${m.campo}`];
    delete values[`${m.luogo}-${m.idraulico}`];
  }
}

const fieldOf = (luogo: Prefisso, key: string) => moduloFields(luogo).find((f) => f.key === key)!;
const label = (m: Membro) =>
  m.luogo === 'scheda'
    ? `scheda.${m.campo}`
    : `${m.luogo}.${'campi' in m ? m.campi.join('+') : (m.campo ?? Object.keys((m as MembroScelta).voci).join('|'))}`;

/** A value every place of a number link can hold: a number, or an option of its non-numeric list. */
function valoreDi(link: Collegamento & { tipo: 'numero' }): string {
  for (const m of link.membri) {
    if (m.luogo === 'scheda' || 'campi' in m) continue;
    const field = fieldOf(m.luogo, m.campo);
    if (field.kind === 'select' && !opzioneDi(field.opzioni, '7')) return field.opzioni[0]!;
  }
  return '7';
}

/** What the server must write in the target for this value. */
function attesoNumero(
  target: MembroNumero,
  value: string,
  values: Values,
): Record<string, unknown> {
  if (target.luogo === 'scheda') return {};
  if ('campi' in target) return {};
  const key = target.idraulico && idraulico(values) ? target.idraulico : target.campo;
  const field = fieldOf(target.luogo, key);
  if (field.kind === 'select') {
    const opzione = opzioneDi(field.opzioni, value);
    return opzione ? { [key]: opzione } : {};
  }
  return { [key]: 'maxLength' in field ? value.slice(0, field.maxLength) : value };
}

function attesoScelta(target: MembroScelta, categoria: string): Record<string, unknown> {
  const keys = Object.keys(target.voci).filter((k) => target.voci[k] === categoria);
  if (target.campo !== undefined) return keys.length ? { [target.campo]: keys[0] } : {};
  return keys.length === 1 ? { [keys[0]!]: true } : {};
}

/** The fields of the target place in the server's answer. */
function soloTarget(target: Membro, out: Record<string, unknown>): Record<string, unknown> {
  const own = new Set(
    'campi' in target
      ? target.campi
      : 'voci' in target && target.campo === undefined
        ? Object.keys(target.voci)
        : [target.campo!, ...('idraulico' in target && target.idraulico ? [target.idraulico] : [])],
  );
  return Object.fromEntries(Object.entries(out).filter(([k]) => own.has(k)));
}

interface Caso {
  link: Collegamento;
  source: Membro;
  target: Membro & { luogo: Prefisso };
  values: Values;
  scrivi: (values: Values) => void;
  atteso: Record<string, unknown>;
  /** The category written (a choice link). */
  categoria?: string;
}

/** Every way to write one place alone, with what each other open place must get. */
function* casi(): Generator<Caso> {
  for (const base of SCENARI) {
    for (const link of COLLEGAMENTI) {
      for (const source of link.membri) {
        for (const target of link.membri) {
          if (target === source || target.luogo === 'scheda') continue;
          const values: Values = { ...base };
          for (const m of link.membri) if (m !== source) svuota(m, values);
          if (link.tipo === 'numero') {
            const s = source as MembroNumero;
            const scrivi = (v: Values) => {
              if (s.luogo === 'scheda') {
                v[s.campo] = s.valori ? Object.keys(s.valori)[0]! : valoreDi(link);
              } else if ('campi' in s) {
                v[`${s.luogo}-${s.campi[0]}`] = '800';
                v[`${s.luogo}-${s.campi[1]}`] = '2000';
              } else for (const name of campiNomi(s, v)) v[name] = valoreDi(link);
            };
            const written = { ...values };
            scrivi(written);
            const value =
              s.luogo === 'scheda' && s.valori
                ? s.valori[Object.keys(s.valori)[0]!]!
                : 'campi' in s
                  ? '800 x 2000'
                  : valoreDi(link);
            yield {
              link,
              source,
              target: target as Caso['target'],
              values,
              scrivi,
              atteso: attesoNumero(target as MembroNumero, value, written),
            };
            continue;
          }
          const s = source as MembroScelta;
          for (const voce of Object.keys(s.voci)) {
            const scrivi = (v: Values) => {
              if (s.luogo === 'scheda') {
                const current = v[s.campo];
                v[s.campo] = Array.isArray(base[s.campo]) || Array.isArray(current) ? [voce] : voce;
              } else if (s.campo !== undefined) v[`${s.luogo}-${s.campo}`] = voce;
              else v[`${s.luogo}-${voce}`] = 'si';
            };
            yield {
              link,
              source,
              target: target as Caso['target'],
              values,
              scrivi,
              atteso: attesoScelta(target as MembroScelta, s.voci[voce]!),
              categoria: s.voci[voce]!,
            };
          }
        }
      }
    }
  }
}

describe('every linked datum, every pair of places', () => {
  const comeSorgente = new Set<string>();
  const comeTarget = new Set<string>();
  const possibili = new Set<string>();
  const errori: string[] = [];
  let provati = 0;

  it('fills the other place from the one that says something, and lists two different values', () => {
    for (const caso of casi()) {
      const { link, source, target } = caso;
      const values = { ...caso.values };
      caso.scrivi(values);
      // The pair is only a pair when both places are there on this sheet (writing the sheet's choice
      // may close a form: "MRL" closes the geared order).
      if (!attivo(source, values) || !attivo(target, values)) continue;
      possibili.add(`${link.key}|${label(source)}`).add(`${link.key}|${label(target)}`);
      provati += 1;
      const out = soloTarget(target, prefillCollegati(target.luogo, values as FormValues));
      try {
        assert.deepEqual(out, caso.atteso);
      } catch {
        errori.push(
          `${link.key}: ${label(source)} → ${label(target)} [${JSON.stringify(values.tipoImpianto)} ${values.quadroMarca}] got ${JSON.stringify(out)}, want ${JSON.stringify(caso.atteso)}`,
        );
        continue;
      }
      if (Object.keys(caso.atteso).length === 0) continue;
      comeSorgente.add(`${link.key}|${label(source)}`);
      comeTarget.add(`${link.key}|${label(target)}`);
      // The same pair, the target written otherwise: listed (when the link is compared).
      if (!confrontato(link)) continue;
      const diverso = { ...values };
      if (link.tipo === 'numero') {
        const [name] = campiNomi(target, values);
        diverso[name!] = '8';
      } else {
        const tv = target as MembroScelta;
        const altra = Object.keys(tv.voci).find((k) => tv.voci[k] !== caso.categoria);
        if (!altra) continue;
        if (tv.campo !== undefined) diverso[`${target.luogo}-${tv.campo}`] = altra;
        else diverso[`${target.luogo}-${altra}`] = 'si';
      }
      if (!discrepanzeDi(diverso as FormValues, t).some((d) => d.key === link.key))
        errori.push(`${link.key}: ${label(source)} ≠ ${label(target)} not listed`);
    }
    assert.ok(provati > 1000, `only ${provati} pairs`);
    assert.deepEqual(errori, []);
  });

  it('leaves to the browser only what the server never has open together', () => {
    // The server fills a form that opens from the sheet and from the forms open with it. Two panel
    // orders are never open together (one make): what one says reaches the other in the browser when
    // the make changes. A form fills the sheet only in the browser. Anything else must have been
    // filled above, in one of the sheets.
    const colonna = new Map(SLOTS.map((s) => [s.prefix, s.column]));
    const mai: string[] = [];
    for (const link of COLLEGAMENTI) {
      assert.ok(link.membri.length > 1, `${link.key}: one place`);
      for (const m of link.membri) {
        if (m.luogo === 'scheda') continue;
        const key = `${link.key}|${label(m)}`;
        if (comeTarget.has(key)) continue;
        const nelBrowser = link.membri.some(
          (o) => o !== m && (o.luogo === 'scheda' || colonna.get(o.luogo) === colonna.get(m.luogo)),
        );
        if (!nelBrowser) mai.push(key);
      }
    }
    assert.deepEqual(mai, []);
    // And what the server does fill: every link with two places open together, both ways.
    const vuoti = COLLEGAMENTI.filter((link) =>
      link.membri.every((m) => !comeSorgente.has(`${link.key}|${label(m)}`)),
    ).map((link) => link.key);
    assert.deepEqual(
      vuoti.filter((key) => !SOLO_BROWSER.has(key)),
      [],
      'a link the server never fills',
    );
  });
});
