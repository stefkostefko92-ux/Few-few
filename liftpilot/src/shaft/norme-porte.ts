// Registry of the doors in the plan of the shaft: the landing door's room along its wall, the car's width for the
// door, the opening in the wall and the car door's operator, a landing door set apart from its car door, the landing
// call station, the linings (imbotti) that fill an old opening between the marbles round a narrower new door. Same form
// as norme.ts; Italian texts, clause numbers and values only.
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
      + '(il lato di chiusura 25 mm oltre la luce) e 2·L + 60 mm con porta centrale, profondo 150 mm, dentro il vano; con il fornitore scelto: '
      + '2SG FLY/LIKE 1,5·L + 40 mm (telescopica) e 2·L + 20 mm (centrale), Fermator 40/10 1,5·L + 50 mm e 2·L + 50 mm; con due accessi adiacenti '
      + 'gli operatori non devono sovrapporsi all\'angolo tra le porte (altrimenti «Attenzione»: operatori da scegliere con il fornitore)',
    riferimento: 'dato del fornitore delle porte',
    fonte: 'cataloghi 2SG FLY 2AT (1,5·A + 40) e 2AO (2·A + 20), Fermator 40/10 VF (1,5·PL + 40/50; 2·PL + 50; chiusura a 25 mm dalla luce), '
      + 'letti da estratti di ricerca: presi i valori più lunghi, da confermare con il fornitore. Le formule con + 40 danno esattamente la lunghezza '
      + 'delle soglie Fermator di catalogo (2 ante telescopiche, luce 900: 1390 mm; 2 ante centrali, luce 700: 1440 mm): potrebbero essere la '
      + 'soglia e non la trave dell\'operatore. Wittur, Prisma, Dapa e CMM: lunghezza dell\'operatore non trovata',
    stato: 'da_verificare',
    costanti: ['doorPortal', 'doorOpT2', 'doorOpC2', 'doorOpClose', 'doorOpDepth', 'doorOpMakers'], verifiche: ['v_door', 'v_door2', 'v_op'],
  },
  {
    id: 'porte.disassamento', gruppo: 'porte', titolo: 'Porta di piano spostata rispetto alla porta di cabina (disassamento)',
    valore: 'la luce netta della porta di piano sporge al massimo 50 mm per lato oltre quella della porta di cabina: con la stessa luce, '
      + 'disassamento ≤ 50 mm (oltre: «Non conforme»); lo stesso spostamento a tutti i piani, per ciascun accesso, con il vano nel muro, '
      + 'il portale, gli imbotti, la soglia sulle staffe e la bottoniera della porta di piano; il passaggio libero è la parte comune delle due '
      + 'luci (luce − disassamento), ed è quello verificato per l\'accessibilità (DM 236/1989)',
    riferimento: 'UNI EN 81-20:2020, 5.3.2.2 (larghezza degli accessi; numero della clausola da confermare sul testo)',
    fonte: 'fonti secondarie: sintesi dei requisiti EN 81-20 dei costruttori letta tramite motore di ricerca (i documenti non erano raggiungibili); '
      + 'che la 5.3.2.1 sia l\'altezza libera degli accessi (≥ 2 m) lo confermano le interpretazioni VDMA della serie EN 81 (DAfA 104, 16.09.2020)',
    stato: 'da_verificare',
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
      + 'imbotto superiore; gli stessi imbotti per tutte le porte di piano, in lamiera sul filo del muro verso il pianerottolo, disegnati in '
      + 'pianta, in sezione e nel 3D',
    riferimento: 'dato del fornitore delle porte (imbotti su misura)', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['doorHead'],
  },
];
