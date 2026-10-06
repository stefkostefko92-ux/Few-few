// Registry of the doors in the plan of the shaft: the landing door's room along its wall, the car's width for the
// door, the opening in the wall and the car door's operator, a landing door set apart from its car door, the landing
// call station, the linings (imbotti) that fill an old opening between the marbles round a narrower new door. Same form
// as norme.ts; Italian texts, clause numbers and values only.
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

export const VOCI_PORTE: readonly VoceVano[] = [
  {
    id: 'porte.ingombro', gruppo: 'porte', titolo: 'Ingombro della porta di piano lungo la parete del vano',
    valore: 'telescopica a 2 ante: 1,5·L + 110 mm; centrale a 2 ante: 2·L + 110 mm (L = luce netta)',
    riferimento: 'dato del fornitore delle porte', fonte: 'valori tipici: scelta del software da confermare con il fornitore', stato: 'scelta',
    costanti: ['doorStackT2', 'doorStackC2', 'doorFrame'], verifiche: ['v_door'],
  },
  {
    id: 'porte.cabina', gruppo: 'porte', titolo: 'Larghezza della cabina rispetto alla porta',
    valore: 'larghezza interna ≥ luce della porta + 50 mm; profondità interna ≥ 800 mm',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['carDoorMargin', 'carMinDepth'], verifiche: ['v_fit'],
  },
  {
    id: 'porte.operatore', gruppo: 'porte', titolo: 'Vano porta di piano e operatore della porta di cabina',
    valore: 'vano nel muro: luce netta + 2 × 50 mm di portale; operatore della porta di cabina lungo 1,5·L + 50 mm con porta telescopica '
      + '(il lato di chiusura 25 mm oltre la luce) e 2·L + 60 mm con porta centrale, profondo 220 mm, dentro il vano; con il fornitore scelto: '
      + '2SG FLY/LIKE 1,5·L + 40 mm (telescopica) e 2·L + 20 mm (centrale), profondo 220 mm; Fermator 40/10 1,5·L + 50 mm e 2·L + 50 mm, profondo '
      + '144 mm; Dapa LOWER 1,5·L + 47 mm e 2·L + 50 mm, profondo 217 mm; con due accessi adiacenti gli operatori non devono sovrapporsi '
      + 'all\'angolo tra le porte (altrimenti «Attenzione»: operatori da scegliere con il fornitore)',
    riferimento: 'dato del fornitore delle porte',
    fonte: 'schede PDF 2SG FLY 2AT (ingombro massimo 1,5·A + 10; soglia 1,5·A + 20, + 40 con l\'extracorsa: presa la più lunga) e 2AO (2·A + 20), '
      + 'profondità 220 letta sul disegno; catalogo tecnico Dapa LOWER (1,5·AP + 47, 2·AP + 50, profondità 217); Fermator 40/10 PM in copie presso '
      + 'terzi (1,5·PL + 50 e 2·PL + 50, le soglie + 40; profondità 120–144 sul disegno, con le staffe 183–280; chiusura a 15 mm dalla luce, il '
      + 'software ne tiene 25); Wittur Hydra Plus da una copia del catalogo Selcom (1,5·PL + 25 e 2·PL + 50, profondo 200); letti il 2 ottobre 2026 '
      + '(research/argano-geared/18-porte-limitatori-tenditori-tutti.md). Il generico è l\'inviluppo: il più lungo (Fermator, Dapa) e il più '
      + 'profondo (2SG FLY). Hydra Plus può superarlo dove la sua quota GM supera la GW; Prisma e CMM: lunghezza e profondità non trovate',
    stato: 'stima',
    costanti: ['doorPortal', 'doorOpT2', 'doorOpC2', 'doorOpClose', 'doorOpDepth', 'doorOpMakers'], verifiche: ['v_door', 'v_door2', 'v_op'],
  },
  {
    id: 'porte.disassamento', gruppo: 'porte', titolo: 'Porta di piano spostata rispetto alla porta di cabina (disassamento)',
    valore: 'la luce netta della porta di piano sporge al massimo 50 mm per lato oltre quella della porta di cabina: con la stessa luce, '
      + 'disassamento ≤ 50 mm (oltre: «Non conforme»); lo stesso spostamento a tutti i piani, per ciascun accesso, con il vano nel muro, '
      + 'il portale, gli imbotti, la soglia sulle staffe e la bottoniera della porta di piano; il passaggio libero è la parte comune delle due '
      + 'luci (luce − disassamento), ed è quello verificato per l\'accessibilità (DM 236/1989)',
    riferimento: 'UNI EN 81-20:2020, 5.3.2.2', fonte: letto('UNI EN 81-20:2020', 'p. 49'), stato: 'confermato',
    costanti: ['landingShiftMax'], verifiche: ['v_land', 'v_land2'],
    nota: 'nel 3D la leva della serratura con i rulli resta in linea con l\'accoppiatore della porta di cabina: con il disassamento va montata '
      + 'spostata sull\'anta della porta di piano (da concordare con il fornitore delle porte)',
  },
  {
    id: 'porte.bottoniera', gruppo: 'porte', titolo: 'Bottoniera di piano',
    valore: 'accanto a ogni porta di piano, sul pianerottolo: per default a destra guardando la porta, il centro della pulsantiera a 150 mm '
      + 'dal vano della porta e i pulsanti a 1100 mm dal pavimento; pulsantiera di 120 × 300 mm, sporgente 15 mm dal muro; lato, distanza '
      + 'e altezza modificabili su ogni progetto',
    riferimento: 'altezze e distanze dagli angoli per l\'accessibilità da verificare (DM 236/1989, UNI EN 81-70)',
    fonte: 'scelta del software', stato: 'scelta',
    costanti: ['callOffset', 'callHeight', 'callPanel'],
  },
  {
    id: 'porte.imbotti', gruppo: 'porte', titolo: 'Imbotti della porta di piano (sostituzione con una luce più piccola)',
    valore: 'quando la porta nuova ha una luce più piccola del vano esistente tra i marmi, gli imbotti laterali (a sinistra e a destra '
      + 'guardando la porta dal pianerottolo) e quello superiore coprono la differenza: distanza tra i marmi = imbotto sinistro + luce + '
      + '2 × 50 mm di portale + imbotto destro; altezza sotto il marmo superiore = altezza della luce + 60 mm di architrave del portale + '
      + 'imbotto superiore (con il telaio proprio della porta, i suoi montanti e il suo frontalino al posto del portale); gli stessi imbotti '
      + 'per tutte le porte di piano, in lamiera sul filo del muro verso il pianerottolo, disegnati in pianta, in sezione e nel 3D',
    riferimento: 'dato del fornitore delle porte (imbotti su misura)', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['doorHead'],
    nota: 'Montanti e pannelli accanto alla porta più larghi di 150 mm che chiudono l\'apertura vanno con la prova del pendolo della porta '
      + '(UNI EN 81-20:2020, 5.3.5.3.4): la copre il fornitore.',
  },
  {
    id: 'porte.telaio', gruppo: 'porte', titolo: 'Telaio proprio delle porte di piano',
    valore: 'a scelta del progettista, al posto del portale (2 × 50 mm, architrave 60 mm): il telaio della porta, uguale a tutti i piani, per '
      + 'default il telaio standard con montanti da 120 mm a tutta altezza, frontalino da 220 mm sopra la luce tra i montanti e spessore 50 mm; '
      + 'montanti, frontalino e spessore modificabili su ogni progetto, montanti e frontalino da 25 mm (telai su misura). Il telaio sta tutto '
      + 'nel vano di corsa, contro la parete e sulla soglia: soglia e sospensione della porta sono fissate al telaio e le coppie Panev (sotto la '
      + 'soglia e sopra la sospensione) lo tengono alla parete; il vano nel muro è il suo ingombro esterno (luce + 2 montanti, altezza della '
      + 'luce + frontalino), gli imbotti stanno sul pavimento del pianerottolo. Lo spessore del telaio è dentro la profondità della porta di '
      + 'piano: le ante scorrono dietro il telaio, il binario più vicino alla parete (68 mm prima del bordo della soglia nelle porte '
      + 'telescopiche, 30 mm nelle centrali) almeno a filo del telaio, altrimenti «Attenzione» (si aumenta la profondità della porta di '
      + 'piano). Disegnato in pianta, in sezione e nel 3D; la bottoniera si misura dal bordo del vano nel muro',
    riferimento: 'dato del fornitore delle porte',
    fonte: '2SG, pagina del telaio standard (montanti 120, frontalino 220, spessore 50; lamiera autoportante 1/1,2 mm; montaggio sul pavimento '
      + 'finito, staffe e tasselli per il muro) e disegno del telaio (larghezza luce + 240) letti il 2 ottobre 2026; telai di dimensioni speciali '
      + 'con montanti e frontalino da 25 mm (research/argano-geared/14-porte-e-soglie.md, 18-porte-limitatori-tenditori-tutti.md). Il telaio '
      + 'nel vano di corsa con soglia e sospensione fissate, tenuto dalle coppie Panev, il vano nel muro della misura del telaio, lo spessore '
      + 'dentro la profondità della porta e gli imbotti sul pavimento del pianerottolo: indicazione del cliente (4 ottobre 2026)',
    stato: 'scelta',
    costanti: ['frameStd', 'frameMin'],
    verifiche: ['v_telaio'],
  },
];
