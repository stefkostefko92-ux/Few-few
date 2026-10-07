// Registry of the machine room's floor: its height, the free areas in front of the control panel and beside the machine,
// the ways to them from the door, the door; the panel clear of what stands on the floor and where the software puts it
// (room-floor.ts, room-panel.ts). Spread into VOCI_VERT (norme-vert.ts); same form as norme.ts, Italian texts, clause
// numbers and values only (the numbers as written here: the registry test compares them with KV_VERT).
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

const T20 = 'UNI EN 81-20:2020';

export const VOCI_LOCALE: readonly VoceVano[] = [
  {
    id: 'locale.macchina', gruppo: 'locale', titolo: 'Locale del macchinario',
    valore: 'altezza libera delle zone di lavoro ≥ 2100 mm (1800 mm sui percorsi); davanti al quadro una superficie libera profonda ≥ 700 mm e larga '
      + '≥ 500 mm o quanto il quadro; per la manutenzione delle parti in movimento e la manovra di emergenza una superficie libera di almeno '
      + '500 × 600 mm (il software la cerca accanto all’argano, sul lato più libero, fino a muri, quadro, limitatore e interruttore generale); '
      + 'percorsi dalla porta alle superfici libere larghi ≥ 500 mm (il software chiede 500 mm ovunque, anche dove la norma ammette 0,40 m) e alti '
      + '≥ 1800 mm; porta di accesso ≥ 600 × 2000 mm, che non si apre verso l’interno del locale',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 (2,10 m e superfici libere), 5.2.6.3.2.2 (percorsi: 0,50 m di larghezza, 1,80 m di altezza), '
      + '5.2.3.2 a) (porta) e 5.2.3.3 a) (verso di apertura)',
    fonte: `${letto(T20, 'pp. 29–30, 43')}; le superfici libere anche in UNI EN 81-1:1999, 6.3.2.1 (edizione 2008: 6.3.3.1)`,
    stato: 'confermato',
    nota: 'davanti al quadro il software verifica la profondità libera fino a ciò che sta sul pavimento (l’argano con il basamento e il rinvio, il '
      + 'limitatore, l’interruttore generale) e che la parete sia lunga almeno quanto il maggiore tra 500 mm e il quadro; la larghezza dei '
      + 'percorsi la misura dalla porta su una griglia di circa 20 mm, per difetto; l’altezza dei percorsi segue quella del locale; il verso di '
      + 'apertura della porta non è un dato del progetto (i disegni la danno apribile verso l’esterno); non verificato: lo spazio di 0,30 m '
      + 'sopra le parti rotanti (5.2.6.3.2.3)',
    verifiche: ['m_height', 'm_panel', 'm_free', 'm_route', 'm_door'],
  },
  {
    id: 'locale.quadro', gruppo: 'locale', titolo: 'Il quadro di manovra fuori dall’ingombro dell’argano',
    valore: 'il quadro, con la larghezza e la profondità inserite, sta dentro il locale e non entra nell’ingombro in pianta di ciò che sta sul '
      + 'pavimento: l’argano sul suo basamento con il telaio del rinvio o il supporto del rinvio, il limitatore di velocità, l’interruttore '
      + 'generale; la distanza minima tra i contorni non è negativa',
    riferimento: '—',
    fonte: 'geometria del progetto: la pianta del locale, il quadro inserito o posto dal software, gli ingombri dell’argano, del basamento, del '
      + 'rinvio e del limitatore come li disegna la pianta del locale',
    stato: 'derivazione', verifiche: ['m_quadro'],
  },
  {
    id: 'locale.quadro.posto', gruppo: 'locale', titolo: 'Dove il software mette il quadro di manovra',
    valore: 'con la posizione del quadro lasciata al software il quadro sta contro una parete: fuori dall’ingombro dell’argano, del limitatore e '
      + 'dell’interruttore generale, se si può ad almeno 100 mm da essi e dalla luce della porta (il suo telaio); né il quadro né la superficie '
      + 'libera davanti a esso davanti alla porta '
      + '(la luce della porta per 700 mm dentro il locale); la superficie libera davanti al quadro profonda ≥ 700 mm, quella accanto all’argano '
      + 'conservata, percorsi di almeno 500 mm dalla porta a entrambe. Tra i posti che lo permettono, provati ogni 50 mm lungo le pareti, quello '
      + 'più vicino alla porta a piedi, poi quello con la superficie libera più profonda; se nessuno va bene, quello con meno mancanze, e le '
      + 'verifiche dicono quali. L’interruttore generale sta accanto alla porta, 150 mm oltre lo stipite (prima della porta se la parete finisce)',
    riferimento: 'UNI EN 81-20:2020, 5.2.6.3.2.1 a) e 5.2.6.3.2.2 (superficie davanti al quadro e percorsi), 5.10.5.2 (interruttore generale '
      + 'raggiungibile dall’ingresso) e 5.12.1.6.1 e) (la macchina visibile dai comandi della manovra elettrica di emergenza: nel locale senza '
      + 'pareti divisorie del software lo è); il resto scelta del software',
    fonte: `${letto(T20, 'pp. 43, 117, 129')}; la vicinanza alla porta, la distanza laterale e il passo sono scelte del software`,
    stato: 'scelta',
  },
];
