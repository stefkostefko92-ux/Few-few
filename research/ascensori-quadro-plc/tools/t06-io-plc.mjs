import { Sheet, COL } from './lib.mjs';

// Assegnazione ingressi/uscite del PLC (trazione). Identica per 12 e 24 fermate.
export default function t06() {
  const s = new Sheet({
    n: 'T06',
    title: 'Ingressi e uscite del PLC (identici da 12 a 24 fermate)',
    subtitle: 'Le chiamate di piano e di cabina viaggiano sul bus CAN: non occupano ingressi fisici',
  });

  const DI = [
    ['I00', 'Controllo fasi / rete presente'],
    ['I01', 'Catena A — arresti fossa/testata, ispezione (lettura)'],
    ['I02', 'Catena B — finecorsa finali, limitatore, paracadute (lettura)'],
    ['I03', 'Catena C — serrature di piano (lettura)'],
    ['I04', 'Catena D — porta di cabina (lettura)'],
    ['I05', 'Retroazione KM1'],
    ['I06', 'Retroazione KM2'],
    ['I07', 'Retroazione freno 1 (KB1)'],
    ['I08', 'Retroazione freno 2 (KB2)'],
    ['I09', 'Zona porta — sensore 1 (copia di comando)'],
    ['I10', 'Zona porta — sensore 2 (copia di comando)'],
    ['I11', 'Rallentamento alto (finecorsa di riduzione)'],
    ['I12', 'Rallentamento basso (finecorsa di riduzione)'],
    ['I13', 'Commutatore ispezione attivo'],
    ['I14', 'Chiave pompieri (comando antincendio)'],
    ['I15', 'Sovraccarico cabina'],
    ['I16', 'Carico completo (esclude chiamate di piano)'],
    ['I17', 'Inverter pronto'],
    ['I18', 'Inverter in guasto'],
    ['I19', 'PTC motore'],
    ['I20', 'Batteria / ARD attivo'],
    ['I21', 'Chiave SERVIZIO nel quadro'],
    ['I22', 'Pulsante Wi-Fi locale'],
    ['I23', 'Porta aperta (finecorsa operatore)'],
    ['I24', 'Porta chiusa (finecorsa operatore)'],
    ['I25', 'Barriera / costa porte'],
    ['I26', 'Pulsante di allarme (copia, il comando è sul citofono)'],
    ['I27', 'Riserva'],
  ];
  const DO = [
    ['Q00', 'Consenso KM1 (attraverso la catena)'],
    ['Q01', 'Consenso KM2 (attraverso la catena)'],
    ['Q02', 'Consenso freno 1 (KB1)'],
    ['Q03', 'Consenso freno 2 (KB2)'],
    ['Q04', 'Inverter: marcia salita'],
    ['Q05', 'Inverter: marcia discesa'],
    ['Q06', 'Inverter: velocità 1 (alta)'],
    ['Q07', 'Inverter: velocità 2 (livello)'],
    ['Q08', 'Inverter: velocità 3 (ispezione/recupero)'],
    ['Q09', 'Inverter: reset'],
    ['Q10', 'Operatore porte: apri'],
    ['Q11', 'Operatore porte: chiudi'],
    ['Q12', 'Luce cabina (con risparmio energetico)'],
    ['Q13', 'Ventola cabina / quadro'],
    ['Q14', 'Alimentazione Wi-Fi locale (10 min)'],
    ['Q15', 'Avvisatore acustico fuori servizio'],
    ['Q16', 'Spia «fuori servizio» al piano principale'],
    ['Q17', 'Riserva'],
  ];
  const AI = [
    ['A0', 'Pesacarico 4–20 mA'],
    ['A1', 'Temperatura quadro (PT100/NTC)'],
    ['HSC0', 'Encoder A/B/Z (contatore veloce)'],
    ['CAN1', 'Cabina: COP, display, porte, pesacarico'],
    ['CAN2', 'Piani 1…24 (nodi di piano)'],
    ['ETH1', 'Rete OT verso gateway (Modbus TCP)'],
  ];

  const col = (x, y, title, rows, fill, w = 480) => {
    s.rect(x, y, w, 30, { fill, c: COL.ink, sw: 1.2 });
    s.text(x + 10, y + 20, title, { size: 13, weight: 700 });
    rows.forEach(([a, b], i) => {
      const yy = y + 30 + i * 26;
      s.rect(x, yy, 62, 26, { fill: '#f8fafc', c: '#cbd5e1', sw: 0.8 });
      s.rect(x + 62, yy, w - 62, 26, { fill: '#fff', c: '#cbd5e1', sw: 0.8 });
      s.text(x + 8, yy + 17, a, { size: 11.5, weight: 700, c: COL.v24 });
      s.text(x + 72, yy + 17, b, { size: 11.5 });
    });
  };
  col(30, 54, 'Ingressi digitali 24 V (28)', DI, COL.fillC, 500);
  col(560, 54, 'Uscite digitali (18)', DO, COL.fillD, 480);
  col(560, 54 + 30 + 18 * 26 + 24, 'Analogici, contatore e bus', AI, COL.fillE, 480);

  s.group(1070, 54, 490, 500, 'Dimensionamento (indicativo)', { c: COL.mute });
  [
    '• ≈ 28 ingressi e ≈ 18 uscite digitali, 2 analogici,',
    '  1 contatore veloce, 2 CAN: stessi per 12 e 24 fermate.',
    '• Se il PLC base ha meno punti, si aggiunge un modulo',
    '  di espansione (circa 16 DI + 16 DO), mai per le fermate.',
    '• Le uscite verso contattori e valvole sono SOLO consensi:',
    '  la catena di sicurezza li interrompe indipendentemente.',
    '• Gli ingressi di catena (I01…I04) sono isolati e a',
    '  basso carico: non alterano la tensione della catena.',
    '• Scelta I/O: isolamento galvanico, protezione contro',
    '  inversione, fusibile per gruppo, morsetti estraibili.',
    '• Ogni ingresso porta la propria etichetta, polarità e',
    '  filtro (20 ms) nella POU IO_Map (04-software).',
    '• Idraulico: al posto di Q04…Q09 e I07/I08/I17/I18 si',
    '  usano le valvole YV1…YV4, la pressione e la',
    '  temperatura olio (T03). Il resto non cambia.',
  ].forEach((t, i) => s.text(1084, 86 + i * 26, t, { size: 11.5 }));
  return s;
}
