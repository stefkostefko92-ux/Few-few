// Registry of the spaces in the headroom and the pit (UNI EN 81-20:2020, 5.2.5): refuges, the car's highest position, the
// clearances over the car roof, the buffers' place in the pit, the balustrade, the counterweight's screen. Spread at the
// head of VOCI_VERT (norme-vert.ts); same form as norme.ts, Italian texts, clause numbers and values only.
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

const T20 = 'UNI EN 81-20:2020';

export const VOCI_SPAZI: readonly VoceVano[] = [
  {
    id: 'spazi.rifugio', gruppo: 'sezione', titolo: 'Spazi di rifugio sul tetto di cabina e in fossa',
    valore: 'tipo 1 (in piedi) 400 × 500 mm in pianta, alto 2000 mm; tipo 2 (accucciato) 500 × 700 mm, alto 1000 mm; tipo 3 (disteso, solo in fossa) '
      + '700 × 1000 mm, alto 500 mm; in testata con la cabina nella posizione più alta, in fossa con la cabina sugli ammortizzatori compressi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 (Prospetto 3) e 5.2.5.8.1 (Prospetto 4)', fonte: letto(T20, 'pp. 37–40'), stato: 'confermato',
    verifiche: ['h_refuge', 'p_refuge'], rifVerifica: { h_refuge: `${T20}, 5.2.5.7.1 (Prospetto 3)`, p_refuge: `${T20}, 5.2.5.8.1 (Prospetto 4)` },
  },
  {
    id: 'spazi.salto', gruppo: 'sezione', titolo: 'Posizione più alta della cabina',
    valore: 'contrappeso sugli ammortizzatori completamente compressi, più il salto 0,035·v² m (v velocità nominale)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.6.1.1 (Prospetto 2)', fonte: letto(T20, 'p. 36'), stato: 'confermato',
    verifiche: ['h_refuge', 'h_clear'],
    nota: 'vale per gli ascensori a frizione; le riduzioni di 5.2.5.6.1.2 (rallentamento controllato) e 5.2.5.6.1.3 (puleggia tenditrice '
      + 'con antirimbalzo) non sono usate: la verifica è più severa',
  },
  {
    id: 'spazi.testata.parti', gruppo: 'sezione', titolo: 'Distanze libere dal soffitto con la cabina nella posizione più alta',
    valore: '≥ 500 mm sopra le apparecchiature sul tetto di cabina (operatore); ≥ 100 mm sopra pattini, attacchi delle funi e traversa dell’arcata; '
      + '≥ 300 mm sopra il corrimano della balaustra',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2 a)–c)', fonte: letto(T20, 'p. 38'), stato: 'da_verificare',
    verifiche: ['h_clear'],
    nota: 'I valori 500, 100 e 300 mm sono confermati. Il software dà alla traversa dell’arcata i 100 mm di b) e avvisa sotto i 500 mm di a) '
      + '(voce spazi.testata.traversa). Con il soffitto piano, 300 mm sopra il corrimano danno anche i 500 mm in obliquo oltre i 400 mm '
      + '(c) 2)); sotto pulegge o travi appese no.',
  },
  {
    id: 'spazi.testata.traversa', gruppo: 'sezione', titolo: 'Traversa dell’arcata sotto il soffitto',
    valore: '≥ 100 mm come parte di b); sotto 500 mm «Attenzione»: se l’organismo la considera un’apparecchiatura vale a) (500 mm)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2 a)–b); UNI EN 81-1:2008, 5.7.1.1 c)', fonte: `${letto(T20, 'p. 38')}; ${letto('UNI EN 81-1:2008', 'p. 26')}`,
    stato: 'da_verificare',
    verifiche: ['h_cross'],
    nota: 'La b) nomina la traversa delle porte e le parti delle porte a scorrimento verticale; quella dell’arcata non è nominata. Da '
      + 'concordare con l’organismo.',
  },
  {
    id: 'spazi.testata.pulegge', gruppo: 'sezione', titolo: 'Parte più alta della cabina sotto ciò che pende sopra',
    valore: 'con la cabina nella posizione più alta: a 2:1 la puleggia di cabina (Dp + 30 mm sopra la traversa) è un’apparecchiatura sul tetto, '
      + 'distanza libera ≥ 500 mm dal soffitto o dalle pulegge appese; a 1:1 con la macchina in basso la traversa sotto le pulegge appese alla soletta '
      + '(asse a Dp/2 + 120 mm sotto il soffitto), distanza libera ≥ 100 mm, quella della traversa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2 a) e b)', fonte: letto(T20, 'p. 38'), stato: 'confermato',
    nota: 'fino alla versione 1.17.0 del motore del progetto la puleggia di cabina era verificata a 100 mm; i 100 mm della traversa sono la '
      + 'stessa lettura di spazi.testata.parti',
    verifiche: ['h_top', 'h_hung'],
  },
  {
    id: 'spazi.tetto.appese', gruppo: 'sezione', titolo: 'Spazio di rifugio sul tetto sotto le parti appese alla soletta',
    valore: 'con la cabina nella posizione più alta, ciò che pende sotto la soletta (le pulegge di rinvio appese della macchina in basso con il loro '
      + 'telaio, il tratto orizzontale delle funi fra due rinvii a 90°, gli attacchi delle funi della taglia 2:1) più in basso dell’altezza del '
      + 'rifugio sopra il tetto toglie la sua pianta dalle parti libere del tetto, come gli operatori: il rifugio deve stare tutto fuori; '
      + 'l’altezza libera del rifugio si misura fino alla parte più bassa sopra ogni parte libera del tetto, dove si sta in piedi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 (prospetto 3), 5.2.5.7.2 e 5.2.5.7.3', fonte: letto(T20, 'pp. 37–39'), stato: 'confermato',
    verifiche: ['h_refuge_rig', 'h_stand_rig'],
    nota: 'pianta delle pulegge appese: Dp lungo il loro piano per la larghezza delle guance del telaio (come il 3D); con un riparo fisso sul '
      + 'tetto sotto le pulegge l’area non è più un posto in piedi: è una scelta del progettista. Fino alla versione 1.28.0 del motore del '
      + 'progetto il rifugio e la sua altezza non vedevano le pulegge appese',
  },
  {
    id: 'ammortizzatori.posizione', gruppo: 'sezione', titolo: 'Ammortizzatori e spazio di rifugio in fossa, in pianta',
    valore: 'lo spazio di rifugio in fossa resta libero dagli ammortizzatori di cabina: il software lo mette sotto il centro della cabina o, se un '
      + 'piatto vi entra, nel posto libero più vicino sotto l’interno della cabina; due o più ammortizzatori di cabina a 160 mm dai fianchi della '
      + 'piattaforma, più in fuori finché i piatti escono dalla pianta del rifugio, sempre sotto la piattaforma; la verifica vale anche per quelli '
      + 'messi dal software (margine ≥ 0)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.1', fonte: 'scelta del software sul modello della fossa (posizioni tipiche, da confermare con i dati '
      + 'del fornitore degli ammortizzatori)', stato: 'scelta',
    verifiche: ['v_buffer'],
  },
  {
    id: 'spazi.fossa', gruppo: 'sezione', titolo: 'Distanze in fossa con la cabina sugli ammortizzatori compressi',
    valore: '≥ 500 mm dal pavimento della fossa alle parti più basse della cabina; grembiule sotto la soglia di cabina: tratto verticale ≥ 750 mm, poi '
      + 'uno smusso a ≥ 60° sull’orizzontale con proiezione orizzontale ≥ 20 mm (circa 35 mm più in basso), con ≥ 100 mm liberi dal pavimento della fossa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.2 a) e 5.4.5.1–5.4.5.2', fonte: letto(T20, 'pp. 40–41, 69'), stato: 'confermato',
    verifiche: ['p_refuge', 'p_apron'], rifVerifica: { p_refuge: `${T20}, 5.2.5.8.2 a)` },
  },
  {
    id: 'spazi.balaustra', gruppo: 'sezione', titolo: 'Balaustra sul tetto di cabina',
    valore: 'richiesta se dal bordo esterno del tetto alla parete ci sono più di 300 mm; alta 700 mm se dal bordo interno del corrimano alla parete '
      + 'ci sono fino a 500 mm, 1100 mm oltre; il corrimano (30 mm) con la faccia esterna a 100 mm dal bordo del tetto, come nel 3D',
    riferimento: 'UNI EN 81-20:2020, 5.4.7.2 b) e 5.4.7.4 b)–c)', fonte: letto(T20, 'pp. 70–72'), stato: 'confermato',
    nota: 'fino alla versione 2.12.0 del motore del vano il software misurava i 500 mm dal bordo del tetto; la norma vuole la balaustra entro '
      + '150 mm dal bordo: se è più interna, la distanza cresce e può servire l’altezza maggiore',
    verifiche: ['h_parapet'],
  },
  {
    id: 'spazi.tetto.superficie', gruppo: 'sezione', titolo: 'Spazio di rifugio e posti in piedi sul tetto di cabina',
    valore: 'sul tetto c’è posto per la pianta del rifugio scelto (tipo 1: 400 × 500 mm; tipo 2: 500 × 700 mm), in un verso o nell’altro; '
      + 'ogni area continua ≥ 0,12 m² con il lato minore oltre 250 mm (anche su un apparecchio) è un posto in piedi e sopra di essa serve '
      + 'l’altezza del rifugio (h_refuge per il tetto); l’area disegnata (400 × 300 mm) indica dove stare',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 (prospetto 3) e 5.2.5.7.3; UNI EN 81-1:2008, 8.13.2', fonte: `${letto(T20, 'pp. 38–39')}; ${letto('UNI EN 81-1:2008', 'p. 52')}`,
    stato: 'confermato',
    // the old standard's clause is in the note: the values are those of 5.2.5.7.3
    verifiche: ['h_stand', 'h_refuge'], rifVerifica: { h_stand: `${T20}, 5.2.5.7.1 (prospetto 3) e 5.2.5.7.3`, h_refuge: `${T20}, 5.2.5.7.3` },
    nota: 'L’operatore delle porte sul tetto è profondo meno di 250 mm (cataloghi): non è un posto in piedi e conta come apparecchiatura '
      + '(500 mm, h_clear). La UNI EN 81-1:2008 (8.13.2) chiedeva un’area ≥ 0,12 m² con il lato minore ≥ 0,25 m.',
  },
  {
    id: 'spazi.tetto.arcata', gruppo: 'sezione', titolo: 'Spazio di rifugio sul tetto: traversa dell’arcata e operatori delle porte',
    valore: 'la traversa dell’arcata centrale attraversa il tetto sull’asse delle guide, profonda 210 mm (105 mm per parte) e alta 170 mm sotto la '
      + 'sommità dell’arcata: dove il suo lato inferiore sta sopra il tetto meno dell’altezza del rifugio, la pianta del rifugio sta tutta davanti o '
      + 'tutta dietro la traversa; l’operatore di ogni porta di cabina occupa 150 mm del tetto dal lato del suo accesso; la verifica dà il margine '
      + 'nel posto migliore e il disegno vi mette il rifugio',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 (prospetto 3)', fonte: 'misure dell’arcata e dell’operatore del disegno del software (tipiche, da '
      + 'confermare con il fornitore dell’arcata e delle porte)', stato: 'stima',
    nota: 'fino alla versione 2.17.0 del motore del vano la verifica misurava il rifugio sull’intero tetto e il disegno lo metteva sopra la traversa; '
      + 'non contati: la puleggia di cabina della taglia 2:1 (verifica della testata del progetto) e il corrimano della balaustra',
    verifiche: ['h_stand'],
  },
  {
    id: 'spazi.altezze', gruppo: 'sezione', titolo: 'Altezza libera degli accessi e della cabina',
    valore: 'luce netta in altezza delle porte di piano e di cabina ≥ 2000 mm; altezza libera interna della cabina ≥ 2000 mm',
    riferimento: 'UNI EN 81-20:2020, 5.3.2.1 e 5.4.1',
    fonte: `${letto(T20, 'pp. 49, 63')}; 2 m anche in DM 587/1987 (UNI EN 81-1), 7.3.1, 8.1.1 e 8.1.2`, stato: 'confermato',
    verifiche: ['h_door', 'h_car'],
    nota: 'negli impianti esistenti (DPR 1497/1963, artt. 24, 27 e 29, non riletto) le porte possono essere alte 1,90 m e la cabina 2,00 m; con '
      + 'la sola sostituzione della macchina le altezze restano (parti esistenti); la UNI 10411-1:2024 ammette porte di piano nuove non più basse '
      + 'delle esistenti (19.1), una cabina nuova sotto 2 m se non più bassa dell’esistente e mai sotto 1,90 m (22 m)) e accessi di cabina mai '
      + 'sotto 1,80 m (22 n)), con avvertimenti: il software non conosce le esistenti e segnala ogni porta sotto 2000 mm',
  },
  {
    id: 'contrappeso.guidato', gruppo: 'sezione', titolo: 'Corsa guidata in testata (contrappeso e cabina)',
    valore: 'con la cabina sugli ammortizzatori completamente compressi le guide del contrappeso lo guidano ancora per almeno 0,1 + 0,035·v² m '
      + '(v velocità nominale): dalla sommità del contrappeso, salito della corsa sotto la cabina (extracorsa e corsa degli ammortizzatori), alla '
      + 'sommità delle guide, che il software pone 50 mm sotto la soletta (voce foglio.stime); la cabina nella sua posizione più alta (salto '
      + 'compreso) ha ancora almeno 0,1 m di guida sopra la sommità dell’arcata, dove il software mette i pattini superiori (avviso: l’altezza '
      + 'reale dei pattini è del fornitore)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.6.2 e 5.2.5.6.1.1 (Prospetto 2: cabina sugli ammortizzatori compressi più 0,035·v²); stesso valore in '
      + 'UNI EN 81-1 (1999, 2008), 5.7.1.2',
    fonte: `${letto(T20, 'p. 36')}; ${letto('UNI EN 81-1:2008', 'p. 27')}`, stato: 'confermato',
    // the old standard's same value is the counterweight's (h_cw)
    verifiche: ['h_cw', 'h_guide'], rifVerifica: { h_guide: `${T20}, 5.2.5.6.2 e 5.2.5.6.1.1 (Prospetto 2)` },
  },
  {
    id: 'contrappeso.schermo', gruppo: 'sezione', titolo: 'Schermo del contrappeso in fossa',
    valore: 'dal punto più basso del contrappeso sugli ammortizzatori compressi fino ad almeno 2000 mm sopra il pavimento della fossa '
      + '(altezza dello schermo modificabile sul progetto, mai sotto questo valore)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1 b)', fonte: letto(T20, 'p. 35'), stato: 'confermato',
    verifiche: ['p_screen'],
    nota: 'bordo inferiore, larghezza e spazio tra le guide e la parete (5.2.5.5.1 c)–e)): voce contrappeso.schermo.pianta; fino alla versione 2.22.0 '
      + 'del motore del vano non erano verificati',
  },
];
