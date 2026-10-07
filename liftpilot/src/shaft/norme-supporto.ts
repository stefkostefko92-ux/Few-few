// Registry of the machine's support in the room above the shaft (support.ts) and of the check of its beams
// (src/lib/lift/support.ts). Same form as norme.ts; Italian texts, clause numbers and values only.
import type { VoceVano } from './norme';

export const VOCI_SUPPORTO: readonly VoceVano[] = [
  {
    id: 'locale.basamento', gruppo: 'locale', titolo: 'Basamento dell’argano',
    valore: 'su spessori di livellamento sotto gli appoggi (l’asse della puleggia dove lo mette il software), su telaio di tre profilati sul pavimento, '
      + 'uno sotto ogni ferro del telaio dell’argano (locale.telaio; tipico UPN 200, alto quanto il profilato come i telai bassi universali), su tre '
      + 'putrelle da muro a muro, una sotto ogni ferro, che possono stare sollevate dal pavimento (tipiche IPE 200, appoggio nei muri 150 mm), su '
      + 'piastre d’acciaio sotto gli appoggi (tipiche 20 mm) o su plinto in calcestruzzo (tipico 250 mm) in un blocco per parte delle funi, o — con '
      + 'un rinvio — sul telaio con rinvio (locale.rinvio); tamponi antivibranti di 30 mm sotto gli appoggi, salvo sugli '
      + 'spessori e sul telaio con rinvio (antivibranti sotto le gambe); telaio e plinto 100 mm oltre il telaio dell’argano a ogni estremità; '
      + 'l’altezza del basamento porta l’asse della puleggia, che il calcolo (tratto di fune oltre la corsa) e il 3D seguono',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8 (carichi sull’edificio); scelta del costruttore',
    fonte: 'telaio basso universale per argano alto 200 mm (lift-store.it); tamponi antivibranti 25–30 mm (catalogo Donati); piastre di 20 mm e plinto di '
      + '250–300 mm nella pratica di installazione (fonti estere, da confermare); estratti di ricerca del 1° ottobre 2026',
    stato: 'scelta',
  },
  {
    id: 'locale.telaio', gruppo: 'locale', titolo: 'Telaio sotto l’argano',
    valore: 'il telaio ha sempre tre ferri sopra e la puleggia sta fra i ferri, così il carico delle funi cade fra gli appoggi e il telaio non si '
      + 'ribalta: un ferro sotto ogni fila di fori dei piedi e, se nessuna fila (il supporto esterno) sta oltre la puleggia, un terzo ferro oltre di '
      + 'essa, distante dal suo piano quanto la fila più vicina sta prima (come i supporti esterni dei costruttori) e con l’ala almeno 20 mm oltre la '
      + 'faccia esterna della puleggia; le traverse alle estremità stanno almeno 20 mm oltre il bordo della puleggia, così le funi scendono dentro il '
      + 'telaio; antivibranti alle estremità di ogni ferro, il telaio 40 mm oltre l’argano a ogni estremità; l’argano generico del software ha lo '
      + 'stesso telaio (ferri a −160, +160 e +520 mm dal piano della vite, la puleggia a 340 mm, alla puleggia Ø 560); sotto l’argano di catalogo il '
      + 'telaio è alto quanto serve per tenere l’asse della puleggia dove lo tiene l’argano generico, almeno 80 mm e con il bordo della puleggia 30 mm '
      + 'sopra il suo piano d’appoggio (gli argani compatti hanno la puleggia a sbalzo, sotto il piano dei piedi); se l’argano non lo permette l’asse '
      + 'sale e il calcolo segue; con la macchina in basso accanto al vano la puleggia passa il muro: il telaio resta nel locale con i soli ferri '
      + 'sotto i piedi',
    riferimento: 'regola del committente (Panev): il telaio ha tre ferri sopra e la puleggia fra i ferri, altrimenti si ribalterebbe',
    fonte: 'quote dei piedi, dei fori e dell’asse della puleggia dalle schede tecniche del costruttore; i supporti esterni dei costruttori a catalogo '
      + '(SICOR MR35, Montanari M73S, M75S, M95, M98, Sassi MF94, MB94, MB95, GEM HW134L, HW135L-VF, HW140CL, FAER P58F, P60F, P68F, P70F, P80F) '
      + 'stanno oltre la puleggia da 0,84 a 1,26 volte la distanza della fila prima; altezza e terzo ferro scelti dal software, da adattare al '
      + 'telaio fornito', stato: 'scelta',
    nota: 'fino a LIFT 1.24.0, ROOM 1.8.0 e SHAFT 2.18.0 il telaio aveva due soli ferri, sotto le file di fori, con la puleggia a sbalzo oltre di essi',
  },
  {
    id: 'locale.rinvio', gruppo: 'locale', titolo: 'Puleggia di rinvio nel locale del macchinario',
    valore: 'con l’argano in alto il rinvio sta sempre nel locale del macchinario, mai nel vano: nel telaio dell’argano (il basamento che il '
      + 'software prende quando c’è un rinvio), con l’asse del rinvio a 320 mm dal pavimento (il bordo almeno 60 mm sopra il pavimento: Dp/2 + 60 '
      + 'oltre Ø 520), il piano del telaio a 736 mm (almeno 176 mm sopra il rinvio), gambe di tubo quadro da 80 mm su antivibranti da 28 mm, travi '
      + 'UPN 160, 100 mm oltre l’argano e il rinvio a ogni estremità, largo almeno 655 mm; con un argano SICOR che ha il suo telaio a catalogo '
      + '(SV110 e SH110B XTE0517/XTE0516, SH130 e SH130G XTE3022/XTE3023, SH140 XTE6026/XTE6027, SH160 XTE5708, SH190 XTE3988) le quote del '
      + 'costruttore: asse del rinvio, asse della puleggia (A), piano del telaio (A − B), calata del contrappeso entro L max dall’asse della '
      + 'puleggia (verifica di avvertimento: oltre, telaio su misura); h del calcolo = asse della puleggia − asse del rinvio, dx dalla pianta; '
      + 'con un altro basamento scelto il rinvio sta su un supporto proprio sul pavimento, alla stessa altezza; una h inserita a mano che porta il '
      + 'rinvio sotto il pavimento è segnalata',
    riferimento: 'regola del committente (Panev): il rinvio sta nel telaio del locale macchina, mai nel vano; UNI EN 81-20:2020, 5.2.1.8 (carichi '
      + 'sull’edificio)',
    fonte: 'brochure Geared SICOR, aprile 2026, pp. 16, 23, 41, 47, 58, 68 e 80 (telai «top machine with diverting pulley for CSW wrapping»), '
      + 'letta il 2 ottobre 2026; i telai «corti» MR21, MR26 e MR35 portano il rinvio sotto il pavimento (Hmin = Dt/2 + 75) e non sono usati; '
      + 'le quote del telaio del software sono quelle dei telai SICOR, da adattare al telaio fornito',
    stato: 'scelta', verifiche: ['m_rinvio'],
  },
  {
    id: 'locale.ingombro', gruppo: 'locale', titolo: 'L’argano dentro il locale del macchinario',
    valore: 'l’argano sul suo basamento — con il telaio del rinvio o con il supporto del rinvio — sta dentro il locale in pianta e sotto il '
      + 'soffitto: la distanza minima dai muri e dal soffitto non è negativa; nell’ingombro in pianta il telaio dell’argano e quanto il basamento '
      + 'sporge oltre di esso (i profilati di un telaio e i blocchi di un plinto per tutta la loro lunghezza; le putrelle appoggiano nei muri); '
      + 'ingombri dalle quote del costruttore per gli argani disegnati com’è, dall’argano generico del software (scalato alla puleggia) per gli '
      + 'altri. L’argano sta lungo la linea delle calate con la puleggia sopra le funi e il motore verso il contrappeso; quando solo così sta '
      + 'dentro il locale, o ne esce di meno, il software lo gira di 180° attorno all’asse verticale della puleggia (motore verso la calata della '
      + 'cabina, riduttore sull’altro lato della linea delle calate), non sul telaio con rinvio del costruttore, che la porta come la monta lui; '
      + 'il verso si può scegliere a mano (girato a mano sul telaio del costruttore, da confermare con il costruttore). La puleggia di rinvio sul suo supporto '
      + 'sotto l’argano libera il basamento dell’argano sopra di essa (solo le putrelle sollevate la scavalcano); con la macchina in basso '
      + 'l’argano — corpo e puleggia — sta dentro il suo locale, accanto al vano o sotto di esso, con le misure date sui disegni o quelle del '
      + 'software',
    riferimento: '—', fonte: 'geometria del progetto: la pianta e l’altezza del locale inserite, gli ingombri dell’argano e del basamento; il '
      + 'verso dell’argano: scelta del software',
    stato: 'derivazione', verifiche: ['m_fit', 'm_stand'],
    nota: 'fino a LIFT 1.25.0, ROOM 1.9.0 e SHAFT 2.19.0 l’argano stava sempre con il motore verso il contrappeso, anche quando così entrava '
      + 'nel muro, e l’ingombro non contava quanto il telaio o il plinto sporgono oltre il telaio dell’argano',
  },
  {
    id: 'locale.putrelle', gruppo: 'locale', titolo: 'Verifica delle putrelle sotto l’argano',
    valore: 'una putrella sotto ogni ferro del telaio dell’argano (tre, la puleggia fra il secondo e il terzo: locale.telaio), lungo la linea delle '
      + 'calate da muro a muro; il carico dell’argano (il suo peso al centro del suo ingombro più il carico statico sull’asse per il coefficiente '
      + 'dinamico, sulle calate delle funi nel piano della puleggia) cade fra le putrelle esterne e si ripartisce tra le tre linearmente (telaio '
      + 'rigido su putrelle di pari rigidezza); ognuna porta la sua parte come forza concentrata in mezzeria (a favore di sicurezza), più il proprio '
      + 'peso, sulla luce tra i centri degli appoggi nei muri (luce libera più 150 mm): σ = M/Wel,y ≤ fyk/γM0 con acciaio S275 (fyk 275 MPa) e '
      + 'γM0 = 1,05; freccia elastica f = F·L³/(48·E·I) + 5·q·L⁴/(384·E·I) ≤ 1/1500 della luce libera con E = 210000 MPa, sulla putrella più '
      + 'caricata; proprietà dei profili EN 10365',
    riferimento: 'NTC 2018, §4.2.4.1.1 (γM0), Tab. 11.3.IX (S275), §11.3.4.1 (E), §3.1.4 (carichi del macchinario); DPR 1497/1963, art. 5.1–5.2 '
      + '(carichi fissi più 1,5 volte il carico statico delle funi, sicurezza ≥ 6, freccia ≤ 1/1500 della luce libera: regola storica degli impianti '
      + 'esistenti, letta su Normattiva)',
    fonte: 'NTC 2018 (DM 17/01/2018); catalogo dei profilati ArcelorMittal (EN 10365) confrontato con due tabelle indipendenti; IPE 330, 360 e 400 '
      + 'dalle tabelle EN 10365 di eurocodeapplied.com e dalla scheda tecnica degli IPE di STAD, concordi, lette il 7 ottobre 2026; DPR 1497/1963 '
      + 'letto per intero (research/argano-geared, cap. 15, §1.1)', stato: 'da_verificare',
    verifiche: ['m_beam', 'm_beamf'],
    nota: 'verifica semplice a carico concentrato in mezzeria su trave appoggiata; gli appoggi nei muri e la muratura vanno verificati dal '
      + 'progettista; fino a LIFT 1.24.0 e ROOM 1.8.0 le putrelle erano due, sotto le file di fori con la puleggia a sbalzo oltre di esse',
  },
  {
    id: 'locale.calate', gruppo: 'locale', titolo: 'Sostituzione dell’argano: calate esistenti e calate della nuova macchina',
    valore: 'nella sola sostituzione dell’argano la cabina e il contrappeso restano dove sono: le funi della nuova macchina devono scendere sulle '
      + 'calate esistenti, rilevate nel locale dall’angolo interno del vano. La distanza tra le calate data dal calcolo (rinvio: D/2 + dx ± Dp/2, '
      + 'più Dp in taglia 2:1; tiro diretto: il diametro della puleggia esistente, se inserita, altrimenti della nuova, più Dp in taglia 2:1) e quella '
      + 'misurata differiscono al più di 10 mm; oltre, il calcolo va ripetuto con la geometria misurata (dx, puleggia esistente)',
    riferimento: '—', fonte: 'tolleranza scelta dal software per il rilievo in sito (le funi a qualche metro dal basamento): da confermare con l’installatore',
    stato: 'scelta', verifiche: ['m_calata'],
  },
];
