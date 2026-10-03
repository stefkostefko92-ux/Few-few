// Registry of the spaces in the headroom and the pit (UNI EN 81-20:2020, 5.2.5): refuges, the car's highest position, the
// clearances over the car roof, the buffers' place in the pit, the balustrade, the counterweight's screen. Spread at the
// head of VOCI_VERT (norme-vert.ts); same form as norme.ts, Italian texts, clause numbers and values only.
import type { VoceVano } from './norme';
import { EN } from './norme-fonti';

export const VOCI_SPAZI: readonly VoceVano[] = [
  {
    id: 'spazi.rifugio', gruppo: 'sezione', titolo: 'Spazi di rifugio sul tetto di cabina e in fossa',
    valore: 'tipo 1 (in piedi) 400 × 500 mm in pianta, alto 2000 mm; tipo 2 (accucciato) 500 × 700 mm, alto 1000 mm; tipo 3 (disteso, solo in fossa) '
      + '700 × 1000 mm, alto 500 mm; in testata con la cabina nella posizione più alta, in fossa con la cabina sugli ammortizzatori compressi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.1 e 5.2.5.8.1 (Tabella 3)', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_refuge', 'p_refuge'],
  },
  {
    id: 'spazi.salto', gruppo: 'sezione', titolo: 'Posizione più alta della cabina',
    valore: 'contrappeso sugli ammortizzatori completamente compressi, più il salto 0,035·v² m (v velocità nominale)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.6.1 (Tabella 2)', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_refuge', 'h_clear'],
  },
  {
    id: 'spazi.testata.parti', gruppo: 'sezione', titolo: 'Distanze libere dal soffitto con la cabina nella posizione più alta',
    valore: '≥ 500 mm sopra le apparecchiature sul tetto di cabina (operatore); ≥ 100 mm sopra pattini, attacchi delle funi e traversa dell\'arcata; '
      + '≥ 300 mm sopra il corrimano della balaustra',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_clear'],
  },
  {
    id: 'spazi.testata.pulegge', gruppo: 'sezione', titolo: 'Parte più alta della cabina sotto ciò che pende sopra',
    valore: 'con la cabina nella posizione più alta: a 2:1 la puleggia di cabina (Dp + 30 mm sopra la traversa) sotto il soffitto, con la macchina '
      + 'in basso la traversa sotto le pulegge appese al solaio (asse a Dp/2 + 120 mm sotto il soffitto); distanza libera ≥ 100 mm, quella '
      + 'della traversa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.2', fonte: 'scelta del software: la puleggia di cabina contata come parte della traversa (se per il '
      + 'costruttore è un\'apparecchiatura sul tetto, servono 500 mm)', stato: 'da_verificare',
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
    valore: '≥ 500 mm dal pavimento della fossa alle parti più basse della cabina; grembiule alto ≥ 750 mm sotto la soglia di cabina, con ≥ 100 mm liberi '
      + 'dal pavimento della fossa',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.8.2 e 5.4.5', fonte: EN, stato: 'da_verificare',
    verifiche: ['p_refuge', 'p_apron'],
  },
  {
    id: 'spazi.balaustra', gruppo: 'sezione', titolo: 'Balaustra sul tetto di cabina',
    valore: 'richiesta se la distanza libera dal tetto alla parete supera 300 mm: alta 700 mm fino a 500 mm di distanza, 1100 mm oltre',
    riferimento: 'UNI EN 81-20:2020, 5.4.7.4', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_parapet'],
  },
  {
    id: 'spazi.tetto.superficie', gruppo: 'sezione', titolo: 'Superficie dove una persona può stare sul tetto di cabina',
    valore: 'area continua ≥ 0,12 m² con il lato minore ≥ 250 mm (disegnata 400 × 300 mm, modificabile sulla pianta in testata); sopra di essa '
      + 'deve esserci l\'altezza dello spazio di rifugio',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7.3', fonte: EN, stato: 'da_verificare',
    verifiche: ['h_stand'],
  },
  {
    id: 'spazi.altezze', gruppo: 'sezione', titolo: 'Altezza libera degli accessi e della cabina',
    valore: 'luce netta in altezza delle porte di piano e di cabina ≥ 2000 mm; altezza libera interna della cabina ≥ 2000 mm',
    riferimento: 'UNI EN 81-20:2020, 5.3.2.1 e 5.4.1',
    fonte: `${EN}; per la 5.3.2.1 anche le interpretazioni VDMA della serie EN 81 (DAfA 104, 16.09.2020); 2 m anche in DM 587/1987 (UNI EN 81-1), `
      + '7.3.1, 8.1.1 e 8.1.2', stato: 'da_verificare',
    verifiche: ['h_door', 'h_car'],
    nota: 'negli impianti esistenti (DPR 1497/1963, artt. 24, 27 e 29) le porte possono essere alte 1,90 m e la cabina 2,00 m; con la sola '
      + 'sostituzione della macchina le altezze restano (parti esistenti); la UNI 10411-1 ammette porte di piano sostituite più basse di 2 m se non '
      + 'più basse delle esistenti (punti 18.1 e 21.3/21.4 dell\'edizione 2014, da verificare sulla 2024): il software non conosce le esistenti e '
      + 'segnala ogni porta sotto 2000 mm',
  },
  {
    id: 'contrappeso.guidato', gruppo: 'sezione', titolo: 'Corsa guidata del contrappeso in testata',
    valore: 'con la cabina sugli ammortizzatori completamente compressi le guide del contrappeso lo guidano ancora per almeno 0,1 + 0,035·v² m '
      + '(v velocità nominale): dalla sommità del contrappeso, salito della corsa sotto la cabina (extracorsa e corsa degli ammortizzatori), alla '
      + 'sommità delle guide, che il software pone 50 mm sotto la soletta (voce foglio.stime)',
    riferimento: 'UNI EN 81-1 (DM 587/1987), 5.7.1.2; nella UNI EN 81-20:2020 la posizione più alta del contrappeso è nella tabella delle '
      + 'posizioni estreme (5.2.5.6.1: cabina sugli ammortizzatori compressi più 0,035·v²)',
    fonte: 'DM 587/1987 (testo di legge); corso UNI sulla UNI EN 81-20 (2021) per le posizioni estreme. La clausola della UNI EN 81-20 sulla corsa '
      + 'guidata ulteriore non è stata trovata nelle fonti secondarie: il software tiene il valore della UNI EN 81-1, più severo della sola posizione '
      + 'estrema', stato: 'da_verificare',
    verifiche: ['h_cw'],
  },
  {
    id: 'contrappeso.schermo', gruppo: 'sezione', titolo: 'Schermo del contrappeso in fossa',
    valore: 'dal punto più basso del contrappeso sugli ammortizzatori compressi fino ad almeno 2000 mm sopra il pavimento della fossa '
      + '(altezza dello schermo modificabile sul progetto, mai sotto questo valore)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1', fonte: EN, stato: 'da_verificare',
    verifiche: ['p_screen'],
  },
];
