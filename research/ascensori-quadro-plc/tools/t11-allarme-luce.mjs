import { Sheet, COL } from './lib.mjs';

export default function t11() {
  const s = new Sheet({
    n: 'T11',
    title: 'Allarme EN 81-28, luce di emergenza e batteria',
    subtitle: 'Il comunicatore ha SIM e batteria proprie, separato dal router 5G del quadro',
  });
  const chg = s.box(40, 100, 200, 80, 'Caricabatterie', { sub: 'da QF5 (a monte del generale)', fill: COL.fillD, size: 13 });
  const bat = s.box(320, 100, 200, 80, 'Batteria', { sub: '12 V · ricarica automatica', fill: COL.fillD, size: 13 });
  s.link([chg.r, bat.l], { c: COL.warn, w: 2.4 });
  const luce = s.box(620, 60, 280, 70, 'Luce di emergenza', { sub: '≥ 5 lx per 1 h (5.4.10.4)\ninserzione automatica', fill: COL.fillA, size: 13 });
  const cit = s.box(620, 150, 280, 70, 'Comunicatore / citofono', { sub: 'fonia bidirezionale permanente\nSIM propria 4G/5G (EN 81-28)', fill: COL.fillD, size: 13 });
  const rec = s.box(620, 240, 280, 70, 'Discesa / apertura di emergenza', { sub: 'YV4 (idraulico) · porte', fill: COL.fillA, size: 13 });
  s.link([bat.r, [570, 140], [570, 95], [620, 95]], { c: COL.warn });
  s.link([bat.r, [570, 185], [620, 185]], { c: COL.warn });
  s.link([[570, 140], [570, 275], [620, 275]], { c: COL.warn });
  const pul = s.box(1000, 100, 240, 80, 'Pulsante giallo (cabina)', { sub: 'campana · conferma visiva + acustica\n(EN 81-70 5.4.4.3)', fill: COL.fillD, size: 12.5 });
  const pf = s.box(1000, 210, 240, 80, 'Allarme fossa e tetto', { sub: 'dove si può restare\nintrappolati (5.2.1.6)', fill: COL.fillD, size: 12.5 });
  s.link([pul.l, [960, 140], [960, 185], [900, 185]], { c: COL.warn });
  s.link([pf.l, [960, 250], [960, 190]], { c: COL.warn, arrow: false });
  const cen = s.box(1320, 130, 220, 100, 'Centro di soccorso', { sub: 'riconoscimento ≤ 5 min\narrivo ≤ 1 h (B.3, informativo)', fill: COL.fillE, size: 12.5 });
  s.link([[900, 196], [1320, 196]], { c: COL.rf, dash: '6 4', w: 2, label: '5G (rete mobile)', lx: 170, ly: 16 });

  s.group(40, 340, 760, 330, 'Dimensionamento della batteria (esempio con ipotesi, da rifare con i dati reali)', { c: COL.mute });
  [
    'Ipotesi: luce di emergenza 6 W · comunicatore 10 W in conversazione + 3 W a riposo · ventola esclusa.',
    'Durata richiesta: 1 h (EN 81-20 5.4.10.4); 3 h se l\'impianto deve rispettare DM 236/1989 8.1.12.',
    'Energia ≈ (6 + 13) W × 3 h = 57 Wh.',
    'Capacità = E / (V × profondità di scarica × rendimento) = 57 / (12 × 0,8 × 0,85) ≈ 7 Ah.',
    'Con margini di invecchiamento (−20 %) e temperatura: 9 … 12 Ah. Sostituzione periodica a programma.',
    'Avviso di autonomia sotto 1 h inviato al soccorso (EN 81-28:2004 4.1.3).',
    'Il generale aperto non toglie luce di cabina, allarme e prese (EN 81-20 5.10.5.1.1).',
  ].forEach((t, i) => s.text(56, 376 + i * 36, t, { size: 11.5 }));

  s.group(830, 340, 720, 330, 'Punti di norma (numero, termine, valore)', { c: COL.mute });
  [
    'EN 81-28:2004 4.1.1 invio e ritentativi · 4.1.2 fine allarme solo dall\'impianto · 4.1.3 batteria, avviso < 1 h',
    '4.1.5 filtro allarmi indebiti (mai in manutenzione) · 4.2.1 autotest almeno ogni 3 giorni · 4.2.5 parametri protetti',
    '4.2.2 interfaccia con i circuiti di sicurezza (5.11.2.1.2 di EN 81-20) · 5.2 fonia guasta → impianto fuori servizio',
    'EN 81-20:2020 5.12.3.1 teleallarme · 5.12.3.2 citofono se corsa > 30 m · 5.12.1.1.1 giallo solo per l\'allarme',
    'EN 81-70:2005 5.4.4.3 pittogrammi giallo/verde · 35–65 dB(A) · DM 236/1989 8.1.12 luce ≥ 3 h; citofono 1,10–1,30 m',
    'Nota di mercato: EN 81-28:2022 non è nei testi appresi; la trasmissione cellulare è fuori ambito della norma.',
  ].forEach((t, i) => s.text(846, 376 + i * 36, t, { size: 11 }));
  s.legend(1300, 760, [[COL.warn, 'Batteria / emergenza', ''], [COL.rf, 'Rete mobile', '6 4']]);
  return s;
}
