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
    verifiche: ['h_refuge', 'p_refuge'],
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
    valore: '≥ 500 mm sopra le apparecchiature sul tetto di cabina (operatore); ≥ 100 mm sopra pattini, attacchi delle funi e traversa dell\'arcata; '
      + '≥ 300 mm sopra il corrimano della balaustra',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2 a)–c)', fonte: letto(T20, 'p. 38'), stato: 'da_verificare',
    verifiche: ['h_clear'],
    nota: 'I valori 500, 100 e 300 mm sono confermati. Da concordare con l\'organismo: il software dà alla traversa dell\'arcata i 100 mm di b) '
      + '(il testo nomina traversa o architrave e parti di porte verticali; se non vale per l\'arcata servono i 500 mm di a)); non verifica i '
      + '500 mm in obliquo oltre i 400 mm dal corrimano (c) 2)).',
  },
  {
    id: 'spazi.testata.pulegge', gruppo: 'sezione', titolo: 'Parte più alta della cabina sotto ciò che pende sopra',
    valore: 'con la cabina nella posizione più alta: a 2:1 la puleggia di cabina (Dp + 30 mm sopra la traversa) è un\'apparecchiatura sul tetto, '
      + 'distanza libera ≥ 500 mm dal soffitto o dalle pulegge appese; a 1:1 con la macchina in basso la traversa sotto le pulegge appese al solaio '
      + '(asse a Dp/2 + 120 mm sotto il soffitto), distanza libera ≥ 100 mm, quella della traversa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2 a) e b)', fonte: letto(T20, 'p. 38'), stato: 'confermato',
    nota: 'fino alla versione 1.17.0 del motore del progetto la puleggia di cabina era verificata a 100 mm; i 100 mm della traversa sono la '
      + 'stessa lettura di spazi.testata.parti',
    verifiche: ['h_top'],
  },
  {
    id: 'ammortizzatori.posizione', gruppo: 'sezione', titolo: 'Ammortizzatori e spazio di rifugio in fossa, in pianta',
    valore: 'lo spazio di rifugio in fossa resta libero dagli ammortizzatori di cabina: il software lo mette sotto il centro della cabina o, se un '
      + 'piatto vi entra, nel posto libero più vicino sotto l\'interno della cabina; due o più ammortizzatori di cabina a 160 mm dai fianchi della '
      + 'piattaforma, più in fuori finché i piatti escono dalla pianta del rifugio, sempre sotto la piattaforma; la verifica vale anche per quelli '
      + 'messi dal software (margine ≥ 0)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.1', fonte: 'scelta del software sul modello della fossa (posizioni tipiche, da confermare con i dati '
      + 'del fornitore degli ammortizzatori)', stato: 'scelta',
    verifiche: ['v_buffer'],
  },
  {
    id: 'spazi.fossa', gruppo: 'sezione', titolo: 'Distanze in fossa con la cabina sugli ammortizzatori compressi',
    valore: '≥ 500 mm dal pavimento della fossa alle parti più basse della cabina; grembiule sotto la soglia di cabina: tratto verticale ≥ 750 mm, poi '
      + 'uno smusso a ≥ 60° sull\'orizzontale con proiezione orizzontale ≥ 20 mm (circa 35 mm più in basso), con ≥ 100 mm liberi dal pavimento della fossa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.2 a) e 5.4.5.1–5.4.5.2', fonte: letto(T20, 'pp. 40–41, 69'), stato: 'confermato',
    verifiche: ['p_refuge', 'p_apron'],
  },
  {
    id: 'spazi.balaustra', gruppo: 'sezione', titolo: 'Balaustra sul tetto di cabina',
    valore: 'richiesta se dal bordo esterno del tetto alla parete ci sono più di 300 mm; alta 700 mm se dal bordo interno del corrimano alla parete '
      + 'ci sono fino a 500 mm, 1100 mm oltre; il corrimano (30 mm) con la faccia esterna a 100 mm dal bordo del tetto, come nel 3D',
    riferimento: 'UNI EN 81-20:2020, 5.4.7.2 b) e 5.4.7.4 b)–c)', fonte: letto(T20, 'pp. 70–72'), stato: 'confermato',
    nota: 'fino alla versione 2.12.0 del motore del vano il software misurava i 500 mm dal bordo del tetto; la norma vuole la balaustra entro '
      + '150 mm dal bordo: se è più interna, la distanza cresce e può servire l\'altezza maggiore',
    verifiche: ['h_parapet'],
  },
  {
    id: 'spazi.tetto.superficie', gruppo: 'sezione', titolo: 'Superficie dove una persona può stare sul tetto di cabina',
    valore: 'area continua ≥ 0,12 m² con il lato minore oltre 250 mm (disegnata 400 × 300 mm, modificabile sulla pianta in testata); sopra di essa '
      + 'deve esserci l\'altezza dello spazio di rifugio',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.3', fonte: letto(T20, 'p. 39'), stato: 'confermato',
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
      + 'delle esistenti (19.1), una cabina nuova sotto 2 m se non più bassa dell\'esistente e mai sotto 1,90 m (22 m)) e accessi di cabina mai '
      + 'sotto 1,80 m (22 n)), con avvertimenti: il software non conosce le esistenti e segnala ogni porta sotto 2000 mm',
  },
  {
    id: 'contrappeso.guidato', gruppo: 'sezione', titolo: 'Corsa guidata del contrappeso in testata',
    valore: 'con la cabina sugli ammortizzatori completamente compressi le guide del contrappeso lo guidano ancora per almeno 0,1 + 0,035·v² m '
      + '(v velocità nominale): dalla sommità del contrappeso, salito della corsa sotto la cabina (extracorsa e corsa degli ammortizzatori), alla '
      + 'sommità delle guide, che il software pone 50 mm sotto la soletta (voce foglio.stime)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.6.2 e 5.2.5.6.1.1 (Prospetto 2: cabina sugli ammortizzatori compressi più 0,035·v²); stesso valore in '
      + 'UNI EN 81-1 (1999, 2008), 5.7.1.2',
    fonte: `${letto(T20, 'p. 36')}; ${letto('UNI EN 81-1:2008', 'p. 27')}`, stato: 'confermato',
    verifiche: ['h_cw'],
  },
  {
    id: 'contrappeso.schermo', gruppo: 'sezione', titolo: 'Schermo del contrappeso in fossa',
    valore: 'dal punto più basso del contrappeso sugli ammortizzatori compressi fino ad almeno 2000 mm sopra il pavimento della fossa '
      + '(altezza dello schermo modificabile sul progetto, mai sotto questo valore)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1 b)', fonte: letto(T20, 'p. 35'), stato: 'confermato',
    verifiche: ['p_screen'],
    nota: 'non verificati: il bordo inferiore dello schermo a non più di 300 mm dal fondo della fossa (5.2.5.5.1 c)) e la protezione dello spazio '
      + 'oltre 300 mm tra guide del contrappeso e parete (e))',
  },
];
