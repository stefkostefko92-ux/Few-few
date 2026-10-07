import { Sheet, COL } from './lib.mjs';

export default function t01() {
  const s = new Sheet({
    n: 'T01',
    title: 'Architettura generale a blocchi',
    subtitle: 'PLC standard + catena di sicurezza cablata + moduli certificati · trazione e idraulico',
  });

  // ---- alimentazione ----
  s.text(40, 52, 'ALIMENTAZIONE', { size: 13, weight: 700, c: COL.mute });
  const rete = s.box(40, 64, 180, 60, 'Rete 3~ 400 V + N + PE', { sub: 'dal quadro generale edificio', fill: COL.fillR });
  const qs1 = s.box(40, 170, 180, 78, 'QS1 sezionatore generale', { sub: 'lucchettabile · differenziale\nselettivo (tipo B con VVVF)', fill: COL.fillR });
  const qs2 = s.box(40, 300, 180, 70, 'QS2 luce e FM', { sub: 'cabina e vano\ncircuito separato', fill: COL.fillR });
  s.link([rete.b, qs1.t], { c: COL.p230 });
  s.poly([[130, 148], [24, 148], [24, 335], [40, 335]], { c: COL.p230, arrow: true });
  s.need = (s.need || new Set()).add(COL.p230);
  s.dot(130, 148, COL.p230);
  s.link([[qs1.r[0], 209], [250, 209]], { c: COL.p230 });

  // ---- quadro ----
  s.group(250, 40, 780, 568, 'QUADRO DI MANOVRA', { c: COL.ink, dash: '', fill: '#fcfcfd' });

  // riga A: alimentazioni
  const psu48 = s.box(272, 64, 224, 46, 'SMPS 48 V c.c. (SELV)', { sub: 'alimenta la catena di sicurezza', fill: COL.fillB });
  const psu24 = s.box(520, 64, 224, 46, 'SMPS 24 V c.c. (PELV)', { sub: 'logica · bus · sensori', fill: COL.fillC });
  const ard = s.box(768, 64, 240, 46, 'ARD + batteria', { sub: 'recupero · luce emergenza · allarme', fill: COL.fillD });

  // riga B: controllo
  const plc = s.box(272, 150, 224, 100, 'PLC standard', { sub: '(non di sicurezza)\nCPU IEC 61131-3 · I/O digitali\ncontatore veloce · master CAN', fill: COL.fillC });
  const gw = s.box(520, 150, 224, 100, 'Gateway web', { sub: 'HTTPS · ruoli · log · 2FA\nWi-Fi locale a tempo\nnessuna scrittura sicurezza', fill: COL.fillE });
  const rtr = s.box(768, 150, 240, 100, 'Router industriale 5G', { sub: 'SIM · firewall · VPN in uscita\nnessuna porta aperta\nda Internet', fill: COL.fillE });
  s.link([[496, 200], [520, 200]], { c: COL.eth, both: true, label: 'Modbus', ly: -6, size: 9 });
  s.link([[744, 200], [768, 200]], { c: COL.eth, both: true });

  // riga C: sicurezza
  const cat = s.box(272, 290, 224, 74, 'Catena di sicurezza', { sub: 'da SMPS 48 V · contatti ad apertura\npositiva in serie · cablata', fill: COL.fillB });
  const mod = s.box(520, 290, 224, 74, 'Modulo certificato CE', { sub: 'bypass porte · UCM (SIL 2)\nprosp. A.1 di EN 81-20', fill: COL.fillB });
  const sti = s.box(768, 290, 240, 74, 'Interblocco di potenza', { sub: 'trazione: 2 contattori OPPURE STO SIL 3\nidraulico: 2 contattori / 2 dispositivi in serie', fill: COL.fillB });
  s.link([plc.b, cat.t], { c: COL.v24, label: 'lettura tratti', lx: 38, size: 10 });
  s.link([cat.r, mod.l], { c: COL.sic, w: 2.6 });
  s.link([mod.r, sti.l], { c: COL.sic, w: 2.6 });

  // riga D: azionamenti e servizi
  const dw = 140;
  const dy = 440;
  const d = [
    s.box(272, dy, dw, 90, 'Trazione', { sub: 'inverter VVVF\n2 contattori o STO', fill: COL.fillA, size: 12 }),
    s.box(272 + 152, dy, dw, 90, 'Idraulico', { sub: 'soft starter\nblocco valvole', fill: COL.fillA, size: 12 }),
    s.box(272 + 304, dy, dw, 90, 'Porte', { sub: 'operatore con\ninverter proprio', fill: COL.fillA, size: 12 }),
    s.box(272 + 456, dy, dw, 90, 'Master CAN', { sub: '125 kbit/s\nbotoniere · piani', fill: COL.fillD, size: 12 }),
    s.box(272 + 608, dy, 128, 90, 'Teleallarme', { sub: 'EN 81-28\ncitofono 4G/5G', fill: COL.fillD, size: 12 }),
  ];
  // rail verde: da interblocco a trazione/idraulico (alternativi: T02 o T03)
  s.poly([[888, 364], [888, 396], [342, 396]], { c: COL.sic, w: 2 });
  s.link([[342, 396], [342, dy]], { c: COL.sic });
  s.link([[494, 396], [494, dy]], { c: COL.sic });
  s.text(540, 392, 'abilitazione (solo uno dei due: trazione OPPURE idraulico)', { size: 10, c: COL.sic });
  // rail blu: comandi dal PLC
  s.poly([[272, 200], [262, 200], [262, 420], [840, 420]], { c: COL.v24, w: 1.8 });
  [412, 564, 716, 868].forEach((x, i) => {
    s.link([[x, 420], [x, dy]], { c: COL.v24, w: 1.6 });
  });
  s.text(300, 414, 'comandi logici (24 V) dal PLC', { size: 10, c: COL.v24 });

  // ---- impianto ----
  s.text(1060, 52, 'IMPIANTO', { size: 13, weight: 700, c: COL.mute });
  const mot = s.box(1060, 64, 250, 96, 'Macchina', { sub: 'TRAZIONE: argano geared + freno\nencoder · PTC\nIDRAULICO: pompa + motore + valvole', fill: COL.fillA });
  const vano = s.box(1060, 184, 250, 104, 'Vano di corsa', { sub: 'stop fossa/testata · finecorsa\nsensori zona porta · serrature piano\nlimitatore velocità · paracadute', fill: COL.fillA });
  const cab = s.box(1060, 312, 250, 112, 'Cabina (cavo mobile)', { sub: 'COP + display · ispezione\noperatore porte · pesacarico\ncitofono · luce emergenza', fill: COL.fillA });
  const pia = s.box(1060, 448, 250, 84, 'Piani 1…12 (… fino a 24)', { sub: 'botoniere su bus CAN\nserrature · chiave pompieri', fill: COL.fillD });
  s.link([[1030, 112], [1060, 112]], { c: COL.p400, w: 3.4 });
  s.link([[1030, 236], [1060, 236]], { c: COL.sic, w: 2.4 });
  s.link([[1030, 368], [1060, 368]], { c: COL.can, w: 2, both: true });
  s.link([[1030, 490], [1060, 490]], { c: COL.can, w: 2, both: true });
  s.text(1034, 106, '400 V', { size: 9, c: COL.p400, anchor: 'middle' });

  // ---- remoto ----
  s.text(1340, 52, 'REMOTO', { size: 13, weight: 700, c: COL.mute });
  const vps = s.box(1340, 64, 210, 80, 'Server portale (VPS UE)', { sub: 'WireGuard · reverse proxy\nlogin + 2FA · audit', fill: COL.fillE });
  const tel = s.box(1340, 196, 210, 76, 'Smartphone / PC', { sub: 'solo browser · HTTPS\nutente · manutentore', fill: COL.fillE });
  const loc = s.box(1340, 324, 210, 76, 'Smartphone in loco', { sub: 'Wi-Fi WPA3 del quadro\nchiave + PIN a tempo', fill: COL.fillE });
  s.link([vps.b, tel.t], { c: COL.eth, label: 'HTTPS', lx: 28 });
  s.poly([[1340, 104], [1325, 104], [1325, 30], [1018, 30], [1018, 200], [1008, 200]], { c: COL.rf, dash: '6 4', arrow: true, w: 2 });
  s.need.add(COL.rf);
  s.text(1170, 24, '5G → VPN WireGuard (connessione in uscita dal quadro)', { size: 10.5, c: COL.rf, anchor: 'middle', weight: 600 });
  s.poly([[1340, 362], [1330, 362], [1330, 300], [1022, 300], [1022, 216], [1008, 216]], { c: COL.rf, dash: '2 4', arrow: true, w: 2 });
  s.text(1176, 294, 'Wi-Fi locale', { size: 10, c: COL.rf, anchor: 'middle' });

  // ---- note ----
  s.group(40, 630, 990, 360, 'Principi di progetto (perché è la via più economica che resta a norma)', { c: COL.mute });
  const note = [
    '1. Il PLC è STANDARD: comanda manovra, porte, posizione, parametri. Non fa mai parte del circuito di sicurezza (T04/T05 e 02-normativa).',
    '2. Ciò che è di sicurezza resta cablato (contatti ad apertura positiva in serie) o è un modulo certificato già acquistato (bypass, UCM, rallentamento ai piani estremi).',
    '3. Il PLC LEGGE ogni tratto della catena per la diagnosi (es. «porta piano 7 aperta»): non la scavalca mai.',
    '4. Il remoto è solo diagnostica e parametri non critici: nessun comando di marcia, nessuna scrittura su parametri di sicurezza;',
    '    la modifica di parametri protetti richiede la chiave fisica nel quadro (modalità servizio).',
    '5. Da 12 a 24 fermate si aggiungono nodi di piano sullo stesso bus CAN e al più un modulo di botoniera in cabina (T16).',
    '6. Trazione e idraulico condividono PLC, bus, web, remoto, allarme: cambiano l\'azionamento (T02/T03) e la catena (T04/T05).',
    '7. Modernizzazione (UNI 10411): stesso hardware; cambiano documenti, verifica straordinaria e le edizioni «del tempo» (02-normativa).',
  ];
  note.forEach((t, i) => s.text(58, 662 + i * 36, t, { size: 12 }));

  s.legend(1330, 640, [
    [COL.p400, 'Potenza 400 V c.a.', ''],
    [COL.p230, 'Rete a monte', ''],
    [COL.sic, 'Catena di sicurezza 48 V c.c.', ''],
    [COL.v24, 'Logica 24 V c.c.', ''],
    [COL.can, 'Bus CAN', ''],
    [COL.eth, 'Ethernet / VPN', ''],
    [COL.rf, 'Radio (5G / Wi-Fi)', '6 4'],
  ]);
  return s;
}
