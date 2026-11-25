import { Sheet, COL } from './lib.mjs';

export default function t13() {
  const s = new Sheet({
    n: 'T13',
    title: 'Macchina a stati del software di manovra (PLC)',
    subtitle: 'Manovra collettiva selettiva · stesso programma per trazione e idraulico (cambiano 3 blocchi)',
  });
  const st = (x, y, w, h, t, sub, fill = COL.fillA, c = COL.ink) => s.box(x, y, w, h, t, { sub, fill, c, size: 13 });

  const init = st(40, 80, 170, 70, 'INIT / AUTOTEST', 'verifica catena, bus,\nparametri, posizione', COL.fillC);
  const ref = st(260, 80, 170, 70, 'RIFERIMENTO', 'corsa lenta fino al\nfinecorsa di rialzo/riduzione', COL.fillC);
  const idle = st(480, 80, 170, 70, 'FERMO AL PIANO', 'porte aperte/chiuse\nattesa chiamate', COL.fillB);
  const close = st(700, 80, 170, 70, 'CHIUSURA PORTE', 'con rilevamento ostacolo\ne ritorno in apertura', COL.fillA);
  const start = st(920, 80, 170, 70, 'PARTENZA', 'freno/valvola, rampa,\ncontrollo catena', COL.fillA);
  const run = st(1140, 80, 190, 70, 'CORSA', 'velocità nominale,\ncontrollo posizione', COL.fillA);
  const dec = st(1140, 220, 190, 70, 'DECELERAZIONE', 'da posizione di rallentamento\nalla velocità di livello', COL.fillA);
  const lev = st(920, 220, 170, 70, 'LIVELLAMENTO', 'ingresso in zona porta\nstop di precisione', COL.fillA);
  const stp = st(700, 220, 170, 70, 'ARRESTO', 'freno chiuso/valvola\nverifica fermo', COL.fillA);
  const opn = st(480, 220, 170, 70, 'APERTURA PORTE', 'sblocco solo in zona porta', COL.fillA);
  [[init, ref], [ref, idle], [idle, close], [close, start], [start, run]].forEach(([a, b]) => s.link([a.r, b.l], { c: COL.ink, w: 2 }));
  s.link([run.b, dec.t], { c: COL.ink, w: 2 });
  [[dec, lev], [lev, stp], [stp, opn]].forEach(([a, b]) => s.link([a.l, b.r], { c: COL.ink, w: 2 }));
  s.link([opn.t, idle.b], { c: COL.ink, w: 2 });
  s.text(500, 192, 'porte aperte → tempo di attesa', { size: 10.5, c: COL.mute });

  // stati speciali
  s.group(40, 340, 1290, 400, 'Stati speciali (priorità decrescente dall\'alto: sicurezza > incendio > recupero > ispezione > servizio)', { c: COL.mute });
  const sic = st(60, 372, 230, 84, 'ARRESTO DI SICUREZZA', 'catena aperta: il PLC non comanda,\nregistra quale tratto, attende', COL.fillR, COL.p230);
  const inc = st(310, 372, 230, 84, 'MANOVRA ANTINCENDIO', 'ritorno al piano designato,\nporte aperte (EN 81-73)', COL.fillR, COL.p230);
  const rec = st(560, 372, 230, 84, 'RECUPERO / EMERGENZA', 'senza rete: ARD o discesa\nd\'emergenza al piano più vicino', COL.fillD);
  const isp = st(810, 372, 230, 84, 'ISPEZIONE', 'da cabina o tetto: comandi\nad azione mantenuta, bassa vel.', COL.fillD);
  const srv = st(1060, 372, 250, 84, 'SERVIZIO / PARAMETRI', 'chiave in quadro + account:\nmodifica parametri protetti', COL.fillE);
  s.text(60, 492, 'Ingressi che fanno cambiare stato (esempi)', { size: 12, weight: 700 });
  const rules = [
    '• catena di sicurezza aperta (qualunque tratto)  → ARRESTO DI SICUREZZA (nessun comando di marcia)',
    '• chiave pompieri attiva al piano o in cabina  → MANOVRA ANTINCENDIO (annulla le chiamate)',
    '• mancanza rete e batteria presente  → RECUPERO; nessuna chiamata accettata',
    '• commutatore ISPEZIONE su tetto/fossa  → ISPEZIONE; le chiamate di piano sono ignorate',
    '• chiave SERVIZIO nel quadro  → servizio: marcia consentita solo in ispezione, scrittura parametri protetti',
    '• guasto non di sicurezza (es. encoder incoerente)  → FUORI SERVIZIO al piano con porte aperte, allarme remoto',
    '• timeout marcia (idraulico) o sovratemperatura olio  → ARRESTO, discesa al piano, poi FUORI SERVIZIO',
    '• reset: solo da quadro o da portale con ruolo «Manutentore» e solo per guasti non di sicurezza',
  ];
  rules.forEach((r, i) => s.text(70, 516 + i * 24, r, { size: 12 }));

  // tre blocchi che cambiano
  s.group(1350, 80, 210, 250, 'Cambiano tra i due impianti', { c: COL.can });
  s.text(1360, 112, 'PARTENZA / CORSA / ARRESTO:\n· trazione: freno + inverter\n   (rampa S, encoder)\n· idraulico: valvole di salita/\n   discesa, soft starter\nLIVELLAMENTO:\n· trazione: velocità di livello\n· idraulico: valvola di\n   livellamento + ri-livellamento\nRIFERIMENTO:\n· idraulico: pressione/temperatura', { size: 10.5 });
  return s;
}
