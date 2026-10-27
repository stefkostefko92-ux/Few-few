// The printed page «Cabina» of the RT after the owner's model (Cabina!A35:K94): its texts verbatim where they state what
// holds — its typos fixed (D41 «il lamiera», D46 «Superfice», N101 «10411.4»: E-C11, E-C18) —, its values with its
// decimals (the tensions T without the model's unrounded digits). Where the model would print what does not hold, our
// own true sentence: a car that stays is no «nuova cabina» (E-C22); its verdict on the rope tension T becomes the
// verdict on T* = P + Q and the rated load (prospetto 1, the points 6.3–6.12 and 6.15 for either beyond: E-C1, E-C10),
// with a decrease of the loads and a changed ratio of the suspended loads (6.1); the building's declaration only with
// both within (E-C12), else the declaration of the structures' fitness is attached. Pure.
import type { FBlock, FRiga } from '../../report/rt2/model';
import { fmt } from '../campi';
import type { ContestoRt2, DatiRt2, EsitoRt2, PaginaCtx, VerificaRt2 } from '../types';
import { caricoModello, ingressoModello, statoCarico, type StatoCarico } from './cabina-carichi';
import { righeCorrezioni, valore } from './righe';

const T = (s: string): FRiga => ({ t: 'testo', s });
const W = (s: string): FBlock => ({ t: 'testo', s });
const pct = (x: number | null): string => fmt(x === null ? null : x * 100, 0);
const ESENTE = 'rispetto al valore preesistente. Pertanto non si rende necessario alcun intervento secondo';

/** The verdict on T* (the model's A76:A78). Under -1: within its tolerance with nothing else brought by 6.1 the model's
 *  conclusion, within with something else brought the fact alone, beyond the points 6.3–6.12 and 6.15; under -11 any
 *  increase brings point 6. */
function verdettoT(s: StatoCarico, uno: boolean, nulla: boolean): string[] {
  if (!uno) {
    return s.p1 ? ['Il nuovo valore del carico statico T* = P + Q (cabina completa vuota e portata, escluse funi e cavi) è maggiore del valore',
      'preesistente: si rendono necessarie le verifiche previste dal paragrafo 6 della norma UNI 10411-11 : 2024']
      : ['Il nuovo valore del carico statico T* = P + Q (cabina completa vuota e portata, escluse funi e cavi) non è maggiore del valore',
        ...(nulla ? [`preesistente. Pertanto non si rende necessario alcun intervento secondo quanto previsto dal paragrafo 6, punto 6.1, della norma UNI 10411-11 : 2024`] : ['preesistente.'])];
  }
  const t = pct(s.tolT);
  if (s.dT > (s.tolT ?? 0) + 1e-9) {
    return [`Non rientrando nella tolleranza del ${t}% del carico statico T* = P + Q preesistente (cabina completa vuota e portata,`,
      'escluse funi e cavi), si rendono necessarie le verifiche previste dal paragrafo 6, punti da 6.3 a 6.12 e 6.15', 'della norma UNI 10411.1 : 2024'];
  }
  const dentro = `Il nuovo valore del carico statico T* = P + Q (cabina completa vuota e portata, escluse funi e cavi), rientra nella tolleranza del ${t}%`;
  return nulla ? [dentro, ESENTE, 'quanto previsto dal paragrafo 6, punto 6.1, prospetto 1, della norma UNI 10411.1 : 2024'] : [dentro, 'rispetto al valore preesistente.'];
}

/** The verdict on the rated load (the model's A81:A83; under -1 only): its texts, the row by the stricter of the two
 *  rated loads (E-C13), an increase only (a decrease is the loads' decrease of 6.1). */
function verdettoQ(s: StatoCarico, nulla: boolean): string[] {
  const t = pct(s.tolQ);
  if (s.dQ > (s.tolQ ?? 0) + 1e-9) {
    return [`Non rientrando nella tolleranza del ${t}% della portata preesistente`, 'si rendono necessarie le verifiche previste dal paragrafo 6, punti da 6.3 a 6.12 e 6.15',
      'della norma UNI 10411.1 : 2024'];
  }
  const dentro = `Il nuovo valore della portata rientra nella tolleranza del ${t}%`;
  return nulla ? [dentro, ESENTE, 'quanto previsto dal paragrafo 6, punto 6.1, prospetto 1, della norma UNI 10411.1 : 2024'] : [dentro, 'rispetto al valore preesistente.'];
}

/** What 6.1 brings besides the prospetto: a load decreased, the ratio of the suspended loads changed. */
function altriCasi(s: StatoCarico, norma: string): string[] {
  return [
    ...(s.calo ? ['I carichi sospesi (carico statico T* o contrappeso) sono diminuiti: si rendono necessarie le verifiche degli',
      `ammortizzatori e, se a presa progressiva, del paracadute, previste dal paragrafo 6, punto 6.1, della norma ${norma}`] : []),
    ...(s.rapporto ? ['Il rapporto tra i carichi sospesi è variato: si rendono necessarie le verifiche di aderenza e di pressione',
      `specifica (appendice D, D.1 e D.2) e degli ammortizzatori, previste dal paragrafo 6, punto 6.1, della norma ${norma}`] : []),
  ];
}

function superficie(ctx: ContestoRt2, vs: readonly VerificaRt2[], p: PaginaCtx): FRiga[] {
  const es = (id: string) => vs.find((v) => v.id === id)?.esito, nuova = ctx.parti.includes('car');
  const S = ctx.dopo.superficie, n = ctx.dopo.capienza, Q = ctx.dopo.Q;
  const ids = ['cabina.superficie', 'cabina.capienza', 'cabina.superficieEsistente'], conVerifiche = vs.some((v) => ids.includes(v.id));
  const valori = conVerifiche ? [
    valore('Superficie utile:', 'S:', fmt(S, 2), 'm2', es('cabina.superficie') ?? es('cabina.superficieEsistente')),
    valore('Portata:', 'Q:', fmt(Q, 0), 'kg'),
    ...(nuova ? [valore('Capienza:', '', fmt(n, 0), 'persone', es('cabina.capienza'))] : []),
  ] : [];
  if (!nuova) return [T('Superficie, portata e capienza della cabina preesistente:'), ...(conVerifiche ? valori : [T('invariate rispetto a quelle documentate.')])];
  const ok = vs.filter((v) => ids.includes(v.id)).every((v) => v.esito === 'ok');
  return ok ? [T('Superficie, portata e capienza della nuova cabina, sono conformi con quanto'), T(`previsto dalla norma ${p.norma} e  UNI EN 81-20 : 2020`), ...valori]
    : [T('Superficie, portata e capienza della nuova cabina, confrontate con quanto'), T(`previsto dalla norma ${p.norma} e  UNI EN 81-20 : 2020:`), ...valori];
}

export function pagineCabina(ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx): FBlock[] {
  const ing = ingressoModello(ctx, x), m = ing ? caricoModello(ing) : null, s = statoCarico(ctx), nuova = ctx.parti.includes('car');
  const uno = ctx.norma === '10411-1', norma = uno ? 'UNI 10411.1 : 2024' : 'UNI 10411-11 : 2024';
  const nulla = !!s && !s.p1 && !s.calo && !s.rapporto && s.dT <= (s.tolT ?? 0) + 1e-9;
  const verdetto: string[] = s ? [...verdettoT(s, uno, nulla), ...(uno ? ['', ...verdettoQ(s, nulla)] : []), ...altriCasi(s, norma)] : [];
  const dichiarazione = !s ? [] : !s.p1
    ? ['Si dichiara che la variazione delle forze statiche e/o dinamiche agenti sulle strutture portanti dell\'edificio',
      'sono ritenute non significative a sfavore della loro sicurezza e integrità nei loro punti di applicazione.']
    : [`Le modifiche apportate aumentano i carichi ${uno ? 'oltre il prospetto 1 della norma' : 'rispetto a quelli documentati'}: si allega la`,
      'dichiarazione di idoneità statica delle strutture portanti dell\'edificio.'];
  return [
    { t: 'pagina' }, { t: 'titolo', s: p.titolo },
    { t: 'sez', l: 'Cabina:', righe: nuova
      ? [T('La nuova cabina è realizzata in lamiera d\'acciaio. Il materiale di rivestimento'), T('della cabina è ininfiammabile, non facilmente combustibile o almeno'), T('autoestinguente.')]
      : [T('La cabina preesistente resta in opera.')] },
    { t: 'sez', l: 'Superficie e capienza:', righe: superficie(ctx, e.verifiche, p) },
    { t: 'sez', l: 'Verifica carico statico T:', righe: [
      T(nuova ? 'La massa totale della nuova cabina [Pcab](comprensiva dell\'intelaiatura' : 'La massa totale della cabina dopo la modifica [Pcab](comprensiva dell\'intelaiatura'),
      T(' portante e di tutti i dispositivi montati sulla cabina stessa) , della portata [Q]  '), T('e delle funi [Pfuni],con cabina al piano estremo inferiore, risulta:'),
      valore('', 'Pcab=', fmt(ing?.pNew, 1), 'kg'), valore('', 'Q=', fmt(ing?.qNew, 1), 'kg'), valore('', 'Pfuni=', fmt(m?.pfNew, 1), 'kg'),
      T('Il valore del nuovo carico statico T risulta essere:'), valore('', 'T=', fmt(m?.Tnew, 0), 'N'),
      T('Nella situazione preesistente, la massa totale della cabina [Pcab]'), T('(comprensiva dell\'intelaiatura portante e di tutti i dispositivi montati '),
      T('sulla cabina stessa),  della portata [Q] e delle funi [Pfuni], con cabina al piano'), T(' estremo inferiore, risultava essere:'),
      valore('', 'Pcab=', fmt(ing?.pOld, 1), 'kg'), valore('', 'Q=', fmt(ing?.qOld, 1), 'kg'), valore('', 'Pfuni=', fmt(m?.pfOld, 1), 'kg'),
      T('Il carico statico nella situazione preesistente risultava essere:'), valore('', 'T=', fmt(m?.Told, 0), 'N'),
    ] },
    { t: 'sez', l: 'Carico statico T* = P + Q:', righe: [
      valore('Dopo la modifica:', 'T*=', fmt(s?.TsNew, 0), 'kg'), valore('Documentato:', 'T*=', fmt(s?.TsOld, 0), 'kg'),
      valore('Variazione di T*:', 'ΔT*=', fmt(s ? s.dT * 100 : null, 1), '%'), ...(uno ? [valore('Variazione della portata:', 'ΔQ=', fmt(s ? s.dQ * 100 : null, 1), '%')] : []),
    ] },
    ...verdetto.map((r) => (r ? W(r) : ({ t: 'spazio', mm: 3 } as FBlock))),
    { t: 'spazio', mm: 4 }, ...dichiarazione.map(W),
    ...righeCorrezioni(e.verifiche.filter((v) => v.id === 'cabina.paracadute')),
  ];
}
