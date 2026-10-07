// Registry of the HEB beams on the shaft's walls under the machine's support (heb.ts): when the slab between the room
// and the shaft has no structural check, two HEB 120, 140 or 160 carry the support to the shaft's walls. The constants
// are spread into KV_VERT (norme-vert.ts), the entries into VOCI_VERT. Same form as norme.ts; Italian texts, clause
// numbers and values only (the numbers written as literals: the registry test compares them).
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

export const KV_HEB = {
  // each beam's bearing in each wall of the shaft, from its inner face [mm]; the ropes through the slab (the governor's
  // too) clear of the beams by this much at least [mm]
  hebBearing: 200,
  hebRopeGap: 50,
} as const;

export const VOCI_HEB: readonly VoceVano[] = [
  {
    id: 'locale.putrelle.vano', gruppo: 'locale', titolo: 'Putrelle HEB sui muri del vano sotto l’argano',
    valore: 'quando la soletta tra il locale e il vano non ha una verifica strutturale, il basamento dell’argano (i suoi piedi, le estremità '
      + 'del telaio, le gambe del telaio con il rinvio, il supporto del rinvio) poggia su due putrelle HEB 120, HEB 140 o HEB 160 che '
      + 'scavalcano il vano da muro a muro, lungo la sua larghezza o la sua profondità, con un appoggio di 200 mm in ognuno dei due muri del '
      + 'vano; le due putrelle stanno sotto i piedi più esterni del basamento (le gambe del telaio con il rinvio), e sotto il nostro telaio '
      + 'basso, che le attraversa, il più lontane possibile tra loro sotto il telaio entro i muri del vano: il telaio può sporgere oltre di '
      + 'esse. Ognuna è una trave appoggiata tra i centri degli appoggi '
      + '(luce libera più 200 mm) che porta la sua parte del carico dell’argano (il suo peso più il carico statico sull’asse per il coefficiente '
      + 'dinamico, nella risultante del peso dell’argano e delle due calate) per la regola della leva, più il proprio peso: σ = M/Wel,y ≤ fyk/γM0 '
      + 'e freccia ≤ 1/1500 della luce libera come per le putrelle sotto l’argano; la risultante tra le due putrelle, i piedi sulle ali delle '
      + 'putrelle (un telaio che le attraversa solo entro la loro lunghezza), le funi che attraversano la soletta (anche quella del limitatore) ad almeno 50 mm dalle putrelle, i muri del vano spessi '
      + 'almeno quanto l’appoggio e le due putrelle sopra i muri che le portano, entro le loro facce esterne (sotto piedi oltre il vano una '
      + 'putrella non poggia su nulla e la verifica non passa). Delle sei scelte (due direzioni, tre profili) il software prende le putrelle più corte che passano le '
      + 'verifiche, poi le più leggere — le più facili da portare nel locale, anche con l’argano girato; profilo e direzione si scelgono a mano',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 e appendice E.1 (carichi sull’edificio); NTC 2018, §4.2.4.1.1 (γM0), Tab. 11.3.IX (S275), '
      + '§11.3.4.1 (E); DPR 1497/1963, art. 5.1–5.2 (freccia ≤ 1/1500 della luce libera); proprietà dei profili EN 10365',
    fonte: `scelta del committente (putrelle HEB 120/140/160 sui muri del vano quando manca la verifica della soletta); scelta del software `
      + `(appoggio di 200 mm, 50 mm dalle funi, le più corte e poi le più leggere); ${letto('UNI EN 81-20:2020', 'pp. 26, 148')}`,
    stato: 'scelta', verifiche: ['m_heb', 'm_hebf', 'm_hebfeet', 'm_hebrope', 'm_hebwall'],
    nota: 'verifica semplice di trave appoggiata con il carico nella risultante; gli appoggi nei muri del vano, la muratura sotto di essi, '
      + 'il fissaggio dell’argano alle putrelle, il collegamento tra le due putrelle e lo sbalzo del telaio oltre di esse vanno verificati dal '
      + 'progettista',
  },
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_HEB = { 'locale.putrelle.vano': ['hebBearing', 'hebRopeGap'] } as const;
