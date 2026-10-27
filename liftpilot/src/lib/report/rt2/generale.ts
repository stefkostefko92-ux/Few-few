// The cover and the first page («Dati Generali», page 1) of the RT after the owner's model: the installation's data, the
// modification's, the technical data after and before («era:» only when the value changes, «preesist.» otherwise —
// E-DG-2, E-DG-17), the inverter's note, the number of pages. The model's texts. Pure.
import { fmt } from '../../rt2/campi';
import { notaInverter } from '../../rt2/componenti/macchina';
import type { Rt2Derivato } from '../../rt2/derive';
import type { Rt2Inputs } from '../../rt2/input';
import type { Azionamento, DatiTecnici, PaginaCtx, Taglia } from '../../rt2/types';
import { regime } from '../../rt/regimi';
import type { FBlock } from './model';

/** What the cover and the first page print about the installation and the record. */
export interface IdentRt2 {
  matricola: string;
  indirizzo: string;
  capCitta: string;
  proprietario: string;
  azienda: string;
  logo: 'logo' | null;
  /** «RT 26-004 R0» */
  numero: string;
}

const SOSP: Readonly<Record<Taglia, string>> = { 1: 'Diretto', 2: 'Indiretto 1:2', 4: 'Indiretto 1:4' };
const AZ: Readonly<Record<Azionamento, string>> = { '1v': '1 velocità', '2v': '2 velocità', vvvf: 'VVVF' };
const vuoto = (s: string | null | undefined): string => (s && s.trim() ? s : '—');

export function copertina(x: Rt2Inputs, id: IdentRt2): FBlock {
  return {
    t: 'copertina', logo: id.logo, azienda: id.azienda, titolo: `Relazione tecnica di modifica\n${id.numero}`,
    righe: [['Matricola', vuoto(id.matricola)], ['Proprietario', vuoto(id.proprietario)],
      ['Indirizzo installazione :', [id.indirizzo, id.capCitta].filter((s) => s.trim()).join('\n') || '—']],
    testo: x.doc?.testoCopertina ?? '', commessa: x.doc?.commessa ?? '',
  };
}

type Cella = { v: string; u: string };
/** A row of the technical data: after, and before only when it differs. */
function riga(label: string, dopo: Cella | null, prima: Cella | null): string[] {
  const a = dopo ? `${dopo.v}${dopo.u ? ` ${dopo.u}` : ''}` : '—';
  const diverso = prima !== null && (dopo === null || prima.v !== dopo.v);
  return [label, a, diverso ? 'era:' : 'preesist.', diverso && prima ? `${prima.v}${prima.u ? ` ${prima.u}` : ''}` : ''];
}
const n = (x: number | null, dec: number, u: string): Cella | null => (x === null ? null : { v: fmt(x, dec), u });
const t = (s: string | null): Cella | null => (s === null ? null : { v: s, u: '' });

function datiTecnici(d: DatiTecnici, p: DatiTecnici): string[][] {
  return [
    ['Tipologia:', 'Elettrico', '', ''],
    riga('Sospensione:', t(d.r ? SOSP[d.r] : null), t(p.r ? SOSP[p.r] : null)),
    riga('Locale macchinario:', t(d.locale === 'basso' ? 'Basso' : d.locale ? 'Alto' : null), t(p.locale === 'basso' ? 'Basso' : p.locale ? 'Alto' : null)),
    riga('Portata:', n(d.Q, 0, 'kg'), n(p.Q, 0, 'kg')),
    riga('Capienza:', n(d.capienza, 0, 'persone'), n(p.capienza, 0, 'persone')),
    riga('Fermate:', n(d.fermate, 0, ''), n(p.fermate, 0, '')),
    riga('Velocità nominale:', n(d.v, 2, 'm/s'), n(p.v, 2, 'm/s')),
    riga('Corsa:', n(d.H, 2, 'm'), n(p.H, 2, 'm (libretto)')),
    riga('Superficie della cabina:', n(d.superficie, 2, 'mq'), n(p.superficie, 2, 'mq')),
    riga('Massa totale cabina:', n(d.P, 0, 'kg'), n(p.P, 0, 'kg (libretto)')),
    riga('Massa totale contrappeso:', n(d.Mcw, 0, 'kg'), n(p.Mcw, 0, 'kg (libretto)')),
    riga('Azionamento:', t(d.azionamento ? AZ[d.azionamento] : null), t(p.azionamento ? AZ[p.azionamento] : null)),
  ];
}

export function paginaGenerale(d: Rt2Derivato, x: Rt2Inputs, id: IdentRt2, p: PaginaCtx): FBlock[] {
  const ctx = d.ctx, doc = x.doc ?? {};
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'testo', s: 'La presente documentazione tecnica si riferisce ai soli materiali sostituiti o modificati durante l\'intervento qui sotto indicato.' },
    { t: 'testo', s: 'Si dichiara che i componenti dell\'impianto rimasti in opera sono stati verificati e controllati e garantiscono il funzionamento dell\'impianto in sicurezza.' },
    { t: 'spazio', mm: 3 },
    { t: 'sez', l: 'Dati Impianto', righe: [
      { t: 'val', l: 'Ascensore di costruzione:', v: vuoto(doc.costruttore) },
      { t: 'val', l: 'Matricola Impianto:', v: vuoto(id.matricola) },
      { t: 'val', l: 'Collaudato secondo:', v: ctx.regime ? regime(ctx.regime).sigla : '—' },
      { t: 'val', l: 'Utenti autorizzati ed esperti:', v: doc.utentiEsperti ?? '—' },
      { t: 'val', l: 'Ascensorista :', v: vuoto(doc.ascensorista) },
      { t: 'val', l: 'Indirizzo installazione:', v: vuoto(id.indirizzo) }, ...(id.capCitta ? [{ t: 'val' as const, l: '', v: id.capCitta }] : []),
      { t: 'val', l: 'Proprietario:', v: vuoto(id.proprietario) },
    ] },
    { t: 'sez', l: 'Dati Modifica', righe: [
      { t: 'val', l: 'Anno di realizzazione:', v: vuoto(doc.annoRealizzazione) },
      { t: 'val', l: 'Norma di riferimento:', v: p.norma },
      { t: 'testo', s: 'Componenti modificati o tipologia modifica:', b: true },
      { t: 'testo', s: vuoto(doc.componentiModificati) },
    ] },
    { t: 'testo', s: 'Dati tecnici:', b: true },
    { t: 'tab', head: [], rows: datiTecnici(ctx.dopo, ctx.prima), w: [0.32, 0.26, 0.12, 0.3] },
    ...(notaInverter(ctx) ? [{ t: 'testo' as const, s: 'La velocità dell\'impianto viene riportata al valore originale attraverso la regolazione del dispositivo inverter VVVF a frequenza variabile.' }] : []),
    { t: 'spazio', mm: 4 },
    { t: 'testo', s: 'Il presente fascicolo si compone di: {PAGINE} pagine', c: true },
  ];
}
