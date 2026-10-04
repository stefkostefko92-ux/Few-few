// Registry of the machine's support in the room above the shaft (support.ts) and of the check of its beams
// (src/lib/lift/support.ts). Same form as norme.ts; Italian texts, clause numbers and values only.
import type { VoceVano } from './norme';

export const VOCI_SUPPORTO: readonly VoceVano[] = [
  {
    id: 'locale.basamento', gruppo: 'locale', titolo: 'Basamento dell\'argano',
    valore: 'su spessori di livellamento sotto gli appoggi (l\'asse della puleggia dove lo mette il software), su telaio di due profilati sul pavimento '
      + '(tipico UPN 200, alto quanto il profilato come i telai bassi universali), su due putrelle da muro a muro che possono stare sollevate dal '
      + 'pavimento (tipiche IPE 200, appoggio nei muri 150 mm), su piastre d\'acciaio sotto gli appoggi (tipiche 20 mm) o su plinto in calcestruzzo '
      + '(tipico 250 mm), o — con un rinvio — sul telaio con rinvio (locale.rinvio); tamponi antivibranti di 30 mm sotto gli appoggi, salvo sugli '
      + 'spessori e sul telaio con rinvio (antivibranti sotto le gambe); telaio e plinto 100 mm oltre il telaio dell\'argano a ogni estremità; '
      + 'l\'altezza del basamento porta l\'asse della puleggia, che il calcolo (tratto di fune oltre la corsa) e il 3D seguono',
    riferimento: 'UNI EN 81-20:2020, 5.2.1.8 (carichi sull\'edificio); scelta del costruttore',
    fonte: 'telaio basso universale per argano alto 200 mm (lift-store.it); tamponi antivibranti 25–30 mm (catalogo Donati); piastre di 20 mm e plinto di '
      + '250–300 mm nella pratica di installazione (fonti estere, da confermare); estratti di ricerca del 1° ottobre 2026',
    stato: 'scelta',
  },
  {
    id: 'locale.telaio', gruppo: 'locale', titolo: 'Telaio sotto l\'argano di un costruttore',
    valore: 'l\'argano di catalogo poggia con i suoi piedi su un telaio di due travi sotto le file di fori, con antivibranti alle estremità e 40 mm '
      + 'oltre l\'argano a ogni estremità; il telaio è alto quanto serve per tenere l\'asse della puleggia dove lo tiene l\'argano generico del '
      + 'software, almeno 80 mm e con il bordo della puleggia 30 mm sopra il suo piano d\'appoggio (gli argani compatti hanno la puleggia a sbalzo, '
      + 'sotto il piano dei piedi); se l\'argano non lo permette l\'asse sale e il calcolo segue',
    riferimento: '—', fonte: 'quote dei piedi, dei fori e dell\'asse della puleggia dalle schede tecniche del costruttore; altezza del telaio scelta '
      + 'dal software, da adattare al telaio fornito', stato: 'scelta',
  },
  {
    id: 'locale.rinvio', gruppo: 'locale', titolo: 'Puleggia di rinvio nel locale del macchinario',
    valore: 'con l\'argano in alto il rinvio sta sempre nel locale del macchinario, mai nel vano: nel telaio dell\'argano (il basamento che il '
      + 'software prende quando c\'è un rinvio), con l\'asse del rinvio a 320 mm dal pavimento (il bordo almeno 60 mm sopra il pavimento: Dp/2 + 60 '
      + 'oltre Ø 520), il piano del telaio a 736 mm (almeno 176 mm sopra il rinvio), gambe di tubo quadro da 80 mm su antivibranti da 28 mm, travi '
      + 'UPN 160, 100 mm oltre l\'argano e il rinvio a ogni estremità, largo almeno 655 mm; con un argano SICOR che ha il suo telaio a catalogo '
      + '(SV110 e SH110B XTE0517/XTE0516, SH130 e SH130G XTE3022/XTE3023, SH140 XTE6026/XTE6027, SH160 XTE5708, SH190 XTE3988) le quote del '
      + 'costruttore: asse del rinvio, asse della puleggia (A), piano del telaio (A − B), calata del contrappeso entro L max dall\'asse della '
      + 'puleggia (verifica di avvertimento: oltre, telaio su misura); h del calcolo = asse della puleggia − asse del rinvio, dx dalla pianta; '
      + 'con un altro basamento scelto il rinvio sta su un supporto proprio sul pavimento, alla stessa altezza; una h inserita a mano che porta il '
      + 'rinvio sotto il pavimento è segnalata',
    riferimento: 'regola del committente (Panev): il rinvio sta nel telaio del locale macchine, mai nel vano; UNI EN 81-20:2020, 5.2.1.8 (carichi '
      + 'sull\'edificio)',
    fonte: 'brochure Geared SICOR, aprile 2026, pp. 16, 23, 41, 47, 58, 68 e 80 (telai «top machine with diverting pulley for CSW wrapping»), '
      + 'letta il 2 ottobre 2026; i telai «corti» MR21, MR26 e MR35 portano il rinvio sotto il pavimento (Hmin = Dt/2 + 75) e non sono usati; '
      + 'le quote del telaio del software sono quelle dei telai SICOR, da adattare al telaio fornito',
    stato: 'scelta', verifiche: ['m_rinvio'],
  },
  {
    id: 'locale.ingombro', gruppo: 'locale', titolo: 'L\'argano dentro il locale del macchinario',
    valore: 'l\'argano sul suo basamento — con il telaio del rinvio o con il supporto del rinvio — sta dentro il locale in pianta e sotto il '
      + 'soffitto: la distanza minima dai muri e dal soffitto non è negativa; ingombri dalle quote del costruttore per gli argani disegnati com\'è, '
      + 'dall\'argano generico del software (scalato alla puleggia) per gli altri; la puleggia di rinvio sul suo supporto sotto l\'argano '
      + 'libera il basamento dell\'argano sopra di essa (solo le putrelle sollevate la scavalcano)',
    riferimento: '—', fonte: 'geometria del progetto: la pianta e l\'altezza del locale inserite, gli ingombri dell\'argano e del basamento',
    stato: 'derivazione', verifiche: ['m_fit', 'm_stand'],
  },
  {
    id: 'locale.putrelle', gruppo: 'locale', titolo: 'Verifica delle putrelle sotto l\'argano',
    valore: 'ognuna delle due putrelle porta metà del carico dell\'argano (il suo peso più il carico statico sull\'asse per il coefficiente dinamico) '
      + 'come forza concentrata in mezzeria, più il proprio peso, sulla luce tra i centri degli appoggi nei muri (luce libera più 150 mm): '
      + 'σ = M/Wel,y ≤ fyk/γM0 con acciaio S275 (fyk 275 MPa) e γM0 = 1,05; freccia elastica f = F·L³/(48·E·I) + 5·q·L⁴/(384·E·I) ≤ 1/1500 '
      + 'della luce libera con E = 210000 MPa; proprietà dei profili EN 10365',
    riferimento: 'NTC 2018, §4.2.4.1.1 (γM0), Tab. 11.3.IX (S275), §11.3.4.1 (E), §3.1.4 (carichi del macchinario); DPR 1497/1963, art. 5.1–5.2 '
      + '(carichi fissi più 1,5 volte il carico statico delle funi, sicurezza ≥ 6, freccia ≤ 1/1500 della luce libera: regola storica degli impianti '
      + 'esistenti, letta su Normattiva)',
    fonte: 'NTC 2018 (DM 17/01/2018); catalogo dei profilati ArcelorMittal (EN 10365) confrontato con due tabelle indipendenti; DPR 1497/1963 letto '
      + 'per intero (research/argano-geared, cap. 15, §1.1)', stato: 'da_verificare',
    verifiche: ['m_beam', 'm_beamf'],
    nota: 'verifica semplice a carico concentrato in mezzeria su trave appoggiata; gli appoggi nei muri e la muratura vanno verificati dal progettista',
  },
  {
    id: 'locale.calate', gruppo: 'locale', titolo: 'Sostituzione dell\'argano: calate esistenti e calate della nuova macchina',
    valore: 'nella sola sostituzione dell\'argano la cabina e il contrappeso restano dove sono: le funi della nuova macchina devono scendere sulle '
      + 'calate esistenti, rilevate nel locale dall\'angolo interno del vano. La distanza tra le calate data dal calcolo (rinvio: D/2 + dx ± Dp/2, '
      + 'più Dp in taglia 2:1; tiro diretto: il diametro della puleggia esistente, se inserita, altrimenti della nuova, più Dp in taglia 2:1) e quella '
      + 'misurata differiscono al più di 10 mm; oltre, il calcolo va ripetuto con la geometria misurata (dx, puleggia esistente)',
    riferimento: '—', fonte: 'tolleranza scelta dal software per il rilievo in sito (le funi a qualche metro dal basamento): da confermare con l\'installatore',
    stato: 'scelta', verifiche: ['m_calata'],
  },
];
