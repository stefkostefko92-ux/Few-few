import { numeriDi } from '../ordini/collegati.js';
import type { Valori } from '../ordini/valori.js';
import { FUNI } from './tabelle.js';

/**
 * Първото отваряне на изчислението: формата идва попълнена от „Modulo rilievi dati argani“ на картата
 * (огледаното аргано — товар, маси, скорост, ход, окачване, ролка, канал, обхват, въжета, предавателно
 * число, мотор) и от товара на картата. Всичко остава за проверка — това е досегашното аргано, а
 * изчислението е за новото. Без база.
 */

export type ValoriForm = Record<string, string>;

const primo = (text: string | true | undefined): number | null => {
  if (typeof text !== 'string') return null;
  const [n] = numeriDi(text);
  return n === undefined ? null : n;
};

const testo = (n: number | null | undefined): string | undefined =>
  n === null || n === undefined ? undefined : String(n).replace('.', ',');

/** „1:50“, „1/50“, „2:53“, „50“ → [1 или 2, знаменателят]. */
function rapportoDi(text: string | true | undefined): [string, string] | null {
  if (typeof text !== 'string') return null;
  const numeri = numeriDi(text);
  if (numeri.length >= 2 && (numeri[0] === 1 || numeri[0] === 2))
    return [String(numeri[0]), testo(numeri[1]!)!];
  if (numeri.length === 1 && numeri[0]! > 2) return ['1', testo(numeri[0]!)!];
  return null;
}

export function prefillArgano(valori: Valori | null, portataScheda: number | null): ValoriForm {
  const v = valori ?? {};
  const form: ValoriForm = {};
  const metti = (campo: string, valore: string | undefined) => {
    if (valore !== undefined && valore !== '') form[campo] = valore;
  };
  metti('portata', testo(primo(v.portata) ?? portataScheda));
  metti('massaCabina', testo(primo(v.pesoCabina)));
  metti('massaContrappeso', testo(primo(v.pesoContrappeso)));
  metti('velocita', testo(primo(v.velocita)));
  metti('corsa', testo(primo(v.corsa)));
  if (v.taglia12 === true) form.sospensione = '1:2';
  else if (v.taglia11 === true) form.sospensione = '1:1';
  if (typeof v.macchina === 'string')
    metti(
      'macchina',
      /bass/i.test(v.macchina) ? 'basso' : /alt/i.test(v.macchina) ? 'alto' : undefined,
    );
  if (v.motoreInverter === true) form.azionamento = 'VVVF';
  else if (v.motoreAc2 === true) form.azionamento = '2V';
  else if (v.motoreAc1 === true) form.azionamento = '1V';
  metti('giriMotore', testo(primo(v.giri)));
  const poli = primo(v.poli);
  if (poli === 6) form.motoreVvvf = '1000';
  else if (poli === 4) form.motoreVvvf = '1500';
  const rapporto = rapportoDi(v.rapportoRiduzione);
  if (rapporto) [form.rapportoA, form.rapportoB] = rapporto;
  metti('diametroPuleggia', testo(primo(v.diametroPuleggia)));
  // „Cuneo - gradi“: попълнен ъгъл значи клиновиден канал.
  const cuneo = primo(v.cuneo);
  if (cuneo !== null) {
    form.gola = 'cuneo';
    metti('angoloGola', testo(cuneo));
  }
  metti('angoloAvvolgimento', testo(primo(v.avvolgimento)));
  metti('funiNumero', testo(primo(v.funiN)));
  const d = primo(v.funiDiametro);
  const trefoli = primo(v.trefoli);
  const fune = FUNI.find((f) => f.marca === 'TELCAL' && f.d === d && f.trefoli === (trefoli ?? 8));
  if (fune) form.fune = fune.id;
  if (v.catenaNo === true) form.compensazione = 'nessuna';
  else if (v.catenaSi === true) form.compensazione = 'catene';
  return form;
}

/** Записаното изчисление като стойности на формата (числата — с десетична запетая). */
export function formDaDati(dati: Record<string, unknown>): ValoriForm {
  const form: ValoriForm = {};
  for (const [campo, valore] of Object.entries(dati)) {
    if (typeof valore === 'number') form[campo] = testo(valore)!;
    else if (typeof valore === 'string') form[campo] = valore;
    else if (valore === true) form[campo] = 'si';
  }
  const altro = dati.funeAltro as Record<string, number> | null | undefined;
  if (altro) {
    form.altroD = testo(altro.d)!;
    form.altroSezione = testo(altro.sezione)!;
    form.altroRottura = testo(altro.rottura)!;
    form.altroMassa = testo(altro.massa)!;
  }
  return form;
}
