import { Sheet, COL } from './lib.mjs';

export default function t10() {
  const s = new Sheet({
    n: 'T10',
    title: 'Ispezione, emergenza, manutenzione e recupero',
    subtitle: 'Priorità: STOP > ispezione > emergenza elettrica > normale · remoto escluso in manutenzione',
  });
  // gerarchia
  const lv = [
    ['STOP (fossa, tetto, ispezione, macchinario, pannello)', 'ferma e tiene fuori servizio · bistabile · SIL 3 · mai in cabina', COL.fillR, COL.p230],
    ['ISPEZIONE (tetto / fossa)', 'uomo presente · ≤ 0,63 m/s (≤ 0,30 m/s se ≤ 2,0 m) · esclude servizio normale, emergenza e livellamento', COL.fillD, COL.warn],
    ['EMERGENZA ELETTRICA (pannello)', 'uomo presente · ≤ 0,30 m/s · energia per portare la cabina al piano entro 1 h', COL.fillD, COL.warn],
    ['MANUTENZIONE (chiave nel quadro)', 'esclude chiamate di piano e comandi remoti · ferma le porte · invia ai piani estremi', COL.fillE, COL.eth],
    ['SERVIZIO NORMALE', 'solo se tutti i livelli sopra sono inattivi e la catena è chiusa', COL.fillB, COL.sic],
  ];
  lv.forEach(([t, sub, fill, c], i) => {
    const y = 60 + i * 96;
    s.box(40 + i * 24, y, 700 - i * 24, 80, t, { sub, fill, c, size: 13 });
    if (i < lv.length - 1) s.link([[390 + 12, y + 80], [390 + 12, y + 96]], { c: COL.mute, w: 1.6 });
  });
  s.text(40, 560, 'Più postazioni di ispezione: la cabina si muove solo premendo gli stessi tasti su tutte (5.12.1.5.2.1 i).', { size: 11 });

  // pannello emergenza e prove
  s.group(800, 50, 750, 520, 'PANNELLO DI EMERGENZA E PROVE (fuori dal vano o nel quadro, EN 81-20:2020 5.2.6.6)', { c: COL.ink, dash: '' });
  const it = [
    ['Generale QS1', 'lucchettabile'],
    ['Commutatore EMERGENZA', 'SIL 3 · IPXXD'],
    ['Pulsanti SALITA · DISCESA · MARCIA', 'bianco · nero · blu (prosp. 17)'],
    ['Display / vista macchina', 'direzione · zona · velocità'],
    ['BYPASS porte', 'coperchio o presa-spina · cicalino'],
    ['STOP del pannello', 'bistabile, EN 60947-5-5'],
    ['Citofono di soccorso', 'verso la cabina'],
    ['Interruttore MANUTENZIONE', 'chiave · blocca anche il web'],
    ['Ripristino esterno al vano', 'riservato (ispezione in fossa)'],
    ['Luce ≥ 200 lx', 'sui dispositivi del pannello'],
  ];
  it.forEach(([t, sub], i) => {
    const x = 820 + (i % 2) * 360;
    const y = 90 + Math.floor(i / 2) * 92;
    s.box(x, y, 340, 76, t, { sub, fill: COL.fillA, size: 12.5 });
  });

  // idraulico e trazione: recupero
  s.group(40, 600, 740, 370, 'Recupero senza rete', { c: COL.mute });
  [
    'TRAZIONE: freno a mano (5.9.2.2.2.7) oppure emergenza elettrica da riserva a ricarica',
    '   automatica; obbligatoria se serve una forza > 400 N (5.9.2.3.3); ≤ 0,30 m/s; energia per 1 h (5.9.2.3.1 b).',
    'IDRAULICO: valvola manuale di discesa ≤ 0,3 m/s, azione mantenuta (5.9.3.9.1); pompa a mano (5.9.3.9.2);',
    '   YV4 (T03) azionata da batteria per la discesa elettrica al piano.',
    'ARD (opzionale): batteria + invertitore o alimentazione della valvola; il generale aperto non ammette marcia',
    '   automatica (5.10.5.5); in antincendio e ispezione l\'ARD non interferisce (81-73 5.1.2.2).',
    'Istruzioni di soccorso nel pannello e nel manuale: EN 81-20 7.2.2 i), EN 13015 6.4.',
  ].forEach((t, i) => s.text(56, 636 + i * 30, t, { size: 11.5 }));
  s.group(800, 600, 750, 370, 'Remoto e manutenzione', { c: COL.mute });
  [
    'EN 81-20 5.12.1.7 — nel quadro: mezzi riservati per escludere chiamate e comandi remoti.',
    'EN 81-50 B.1 r. 7–8 — da remoto solo dati informativi; il codice non si modifica da remoto.',
    'EN 81-28:2004 4.1.1 — l\'allarme si invia anche in manutenzione; il filtro mai in manutenzione (4.1.5).',
    'Progetto: l\'interruttore MANUTENZIONE spegne le scritture da web/5G (restano lettura e allarme).',
    'Progetto: «modo prova» che blocca il servizio normale finché attivo (81-50 B.2 r. 13).',
    'Marcia dal tetto o dal pannello: il PLC non genera mai comandi di marcia (la catena e le pulsantiere',
    'agiscono direttamente sugli organi di potenza, 5.11.2.4).',
  ].forEach((t, i) => s.text(816, 636 + i * 30, t, { size: 11.5 }));
  return s;
}
