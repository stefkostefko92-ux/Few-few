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
  // each beam's end on a bearing plate over the wall, as long as the bearing, this wide and thick, on a bed of non-shrink
  // mortar this thick: the beam's underside as high over the slab, clear of it between the bearings [mm]
  hebPlateW: 250,
  hebPlateT: 15,
  hebMortar: 15,
} as const;

export const VOCI_HEB: readonly VoceVano[] = [
  {
    id: 'locale.putrelle.vano', gruppo: 'locale', titolo: 'Putrelle HEB sui muri del vano sotto l’argano',
    valore: 'quando la soletta tra il locale e il vano non ha una verifica strutturale, il basamento dell’argano (i suoi piedi, le estremità '
      + 'del telaio, le gambe del telaio con il rinvio, il supporto del rinvio) poggia su due putrelle HEB 120, HEB 140 o HEB 160 che '
      + 'scavalcano il vano da muro a muro, lungo la sua larghezza o la sua profondità, con un appoggio di 200 mm in ognuno dei due muri del '
      + 'vano: ogni estremità poggia su una piastra di ripartizione sopra il muro, lunga quanto l’appoggio, larga 250 mm e spessa 15 mm, su un '
      + 'letto di malta antiritiro di 15 mm, così l’intradosso della putrella sta 30 mm sopra la soletta e non la tocca fra gli appoggi (il '
      + 'distacco supera la freccia ammessa più 10 mm: la verifica della freccia lo garantisce); le due putrelle stanno sotto i piedi più esterni del basamento (le gambe del telaio con il rinvio del costruttore), e sotto il '
      + 'nostro telaio basso o il nostro telaio con il rinvio, che le attraversano, il più lontane possibile tra loro entro i muri del vano e a '
      + 'non meno di 50 mm dalle funi che attraversano la soletta (anche quella del limitatore) e fuori dai bordi dei loro fori (locale.fori: la '
      + 'putrella sta 30 mm sopra la soletta, sotto la sommità del bordo di 50 mm): il telaio può sporgere oltre di esse, le gambe '
      + 'del nostro telaio con il rinvio stanno dove i suoi lati incrociano le putrelle, sulle loro ali, anche con la linea delle calate '
      + 'obliqua. Ognuna è una trave appoggiata tra i centri degli appoggi '
      + '(luce libera più 200 mm) che porta la sua parte del carico dell’argano (il suo peso più il carico statico sull’asse per il coefficiente '
      + 'dinamico, nella risultante del peso dell’argano e delle due calate) per la regola della leva, più il proprio peso: σ = M/Wel,y ≤ fyk/γM0 '
      + 'e freccia ≤ 1/1500 della luce libera come per le putrelle sotto l’argano; la risultante tra le due putrelle, i piedi sulle ali delle '
      + 'putrelle (un telaio che le attraversa solo entro la loro lunghezza), le funi che attraversano la soletta (anche quella del limitatore) ad almeno 50 mm dalle putrelle, '
      + 'le putrelle fuori dai bordi dei fori in pianta (anche a filo), i muri del vano spessi '
      + 'almeno quanto l’appoggio e le due putrelle sopra i muri che le portano, entro le loro facce esterne (sotto piedi oltre il vano una '
      + 'putrella non poggia su nulla e la verifica non passa). Delle sei scelte (due direzioni, tre profili) il software prende le putrelle più corte che passano le '
      + 'verifiche, poi le più leggere — le più facili da portare nel locale, anche con l’argano girato; profilo e direzione si scelgono a mano',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8.1 e appendice E.1 (carichi sull’edificio); NTC 2018, §4.2.4.1.1 (γM0), Tab. 11.3.IX (S275), '
      + '§11.3.4.1 (E); DPR 1497/1963, art. 5.1–5.2 (freccia ≤ 1/1500 della luce libera); proprietà dei profili EN 10365',
    fonte: `scelta del committente (putrelle HEB 120/140/160 sui muri del vano quando manca la verifica della soletta); scelta del software `
      + `(appoggio di 200 mm, piastre di ripartizione e malta antiritiro secondo la pratica di cantiere, 50 mm dalle funi, le più corte e poi le più leggere); ${letto('UNI EN 81-20:2020', 'pp. 26, 148')}`,
    stato: 'scelta', verifiche: ['m_heb', 'm_hebf', 'm_hebfeet', 'm_hebrope', 'm_hebkerb', 'm_hebwall'],
    nota: 'verifica semplice di trave appoggiata con il carico nella risultante; i disegni mostrano le piastre sopra i muri, il distacco dalla '
      + 'soletta e l’appoggio quotato, e le gambe del basamento fissate alle ali con piastre e bulloni (o morsetti) — dettaglio da confermare; in '
      + 'alternativa le putrelle in tasche nei muri sotto la soletta, che il tecnico disegna a parte; fino a LIFT 1.28.0 e ROOM 1.12.0 le putrelle '
      + 'erano disegnate appoggiate sulla soletta per tutta la lunghezza e potevano passare sopra i bordi dei fori (nessuna verifica m_hebkerb); '
      + 'il bordo è quello in lamiera del disegno (locale.fori): un bordo in calcestruzzo, più spesso, il tecnico lo tiene fuori dalle putrelle; '
      + 'gli appoggi nei muri del vano, la muratura sotto di essi, '
      + 'il fissaggio dell’argano alle putrelle, il collegamento tra le due putrelle e lo sbalzo del telaio oltre di esse vanno verificati dal '
      + 'progettista; fino a LIFT 1.27.0 e ROOM 1.11.0 il nostro telaio con il rinvio stava sulle gambe ai suoi angoli, le putrelle sotto di '
      + 'esse (oltre il muro di fondo nell’esempio: nessuna scelta passava), e le putrelle sotto un telaio che le attraversa non evitavano le funi; '
      + 'con un basamento sui piedi e la linea delle calate obliqua (spessori, piastre, il telaio del costruttore) i piedi non stanno tutti sulle '
      + 'ali: il telaio basso che le attraversa è la scelta che passa',
  },
];

/** Constants of this registry, for the test that every one has its entry. */
export const COSTANTI_HEB = { 'locale.putrelle.vano': ['hebBearing', 'hebRopeGap', 'hebPlateW', 'hebPlateT', 'hebMortar'] } as const;
