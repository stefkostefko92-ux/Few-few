import { Sheet, COL } from './lib.mjs';

export default function t14() {
  const s = new Sheet({
    n: 'T14',
    title: 'Impostazioni sbloccate per ruolo (pagina web dal telefono)',
    subtitle: 'Il gateway valida ogni scrittura; il PLC accetta solo registri in lista bianca e dentro i limiti',
  });

  // flusso
  const f = [
    ['1 · Accesso', 'QR sul quadro o\nlink dell\'impianto', COL.fillE],
    ['2 · Login', 'e-mail + password\n(Argon2id) + 2FA', COL.fillE],
    ['3 · Ruolo', 'il portale assegna\nUtente / Manutentore', COL.fillE],
    ['4 · Pagina', 'solo le impostazioni\nsbloccate per il ruolo', COL.fillB],
    ['5 · Scrittura', 'limiti + registro\ndelle modifiche', COL.fillC],
    ['6 · PLC', 'accetta solo registri in\nlista bianca e in range', COL.fillC],
  ];
  f.forEach(([t, sub, fill], i) => {
    const b = s.box(40 + i * 255, 60, 225, 70, t, { sub, fill, size: 13 });
    if (i < f.length - 1) s.link([[265 + i * 255, 95], [295 + i * 255, 95]], { c: COL.eth });
  });

  // matrice
  const cols = [
    ['Impostazione / funzione', 440],
    ['Utente\n(L1)', 100],
    ['Amministratore\n(L1+)', 130],
    ['Manutentore\n(L2)', 110],
    ['Installatore\n(L3, in loco)', 140],
  ];
  const x0 = 40;
  const y0 = 170;
  let x = x0;
  cols.forEach(([t, w], i) => {
    s.rect(x, y0, w, 44, { fill: i === 0 ? '#e5e7eb' : COL.fillE, c: COL.ink, sw: 1 });
    s.text(x + (i === 0 ? 10 : w / 2), y0 + 19, t, { size: 11.5, weight: 700, anchor: i === 0 ? 'start' : 'middle' });
    x += w;
  });
  const OK = '●';
  const RO = '○';
  const NO = '—';
  const rows = [
    ['Vedere stato: piano, porte, fuori servizio', RO, RO, RO, RO],
    ['Tempo porte aperte e di chiusura, SOLO entro i minimi di legge (≥ 8 s / ≥ 4 s)', NO, NO, OK, OK],
    ['Piano di parcheggio e orario di riposo (modalità notte)', OK, OK, OK, OK],
    ['Blocco chiamate di cabina a piani scelti, con orario (non attivo in antincendio)', NO, OK, OK, OK],
    ['Volume del gong e della voce, luminosità del display', OK, OK, OK, OK],
    ['Segnalare un problema (messaggio al manutentore)', OK, OK, OK, OK],
    ['Storico guasti (ultimi 50), contatori di corse e ore di moto', NO, RO, RO, RO],
    ['Diagnostica ingressi/uscite e stato di ogni tratto della catena', NO, NO, RO, RO],
    ['Reset di guasti NON di sicurezza', NO, NO, OK, OK],
    ['Soglie di pre-allarme (usura, temperatura, numero avviamenti)', NO, NO, OK, OK],
    ['Accendere il Wi-Fi locale (richiede anche la chiave in quadro)', NO, NO, NO, OK],
    ['Numero di fermate, mappa piani, offset di livello, rampe e velocità di livello', NO, NO, NO, OK],
    ['Apprendimento del vano e calibrazione del pesacarico', NO, NO, NO, OK],
    ['Parametri dell\'azionamento (via CAN, copia di riserva e ripristino)', NO, NO, NO, OK],
    ['Aggiornamento del software del PLC o del gateway', NO, NO, NO, OK],
    ['Comando di marcia da remoto', NO, NO, NO, NO],
    ['Scrittura di qualsiasi parametro di sicurezza (soglie, tempi dei dispositivi)', NO, NO, NO, NO],
  ];
  rows.forEach((r, i) => {
    let xx = x0;
    const yy = y0 + 44 + i * 30;
    r.forEach((c, j) => {
      const w = cols[j][1];
      const bad = i >= rows.length - 2;
      s.rect(xx, yy, w, 30, { fill: bad ? COL.fillR : j === 0 ? '#fff' : i % 2 ? '#fff' : '#fafafa', c: '#cbd5e1', sw: 0.8 });
      s.text(xx + (j === 0 ? 10 : w / 2), yy + 20, c, {
        size: j === 0 ? 11 : 15,
        anchor: j === 0 ? 'start' : 'middle',
        c: c === OK ? COL.sic : c === RO ? COL.v24 : c === NO ? (bad ? COL.p230 : COL.mute) : COL.ink,
        weight: j === 0 ? 400 : 700,
      });
      xx += w;
    });
  });
  const yb = y0 + 44 + rows.length * 30 + 20;
  s.text(40, yb, '● può modificare   ○ solo lettura   — non disponibile.  Ultime due righe: vietate a tutti i ruoli, a prescindere dall\'account.', { size: 11.5 });

  // livelli di sblocco
  s.group(1010, 170, 550, 520, 'Livelli di sblocco', { c: COL.mute });
  const lv = [
    ['L0 · Pubblico', 'Nessuna pagina: il QR porta al login.', COL.fillA],
    ['L1 · Utente / Amministratore', 'Account del condominio o della portineria.\nSolo le impostazioni della colonna sbloccata.', COL.fillB],
    ['L2 · Manutentore', 'Ditta abilitata (DPR 162/1999). 2FA obbligatorio.\nDiagnostica, reset non di sicurezza, soglie.', COL.fillC],
    ['L3 · Installatore', 'In loco: chiave nel quadro + pulsante + account.\nParametri di messa in servizio e aggiornamenti.', COL.fillD],
    ['L4 · Sicurezza', 'Non esiste via software. Una modifica è una nuova\nversione del PLC + nuova verifica (art. 14 DPR 162).', COL.fillR],
  ];
  lv.forEach(([t, sub, fill], i) => {
    s.box(1030, 200 + i * 96, 510, 80, t, { sub, fill, size: 13 });
  });
  s.text(1030, 712, 'Ogni modifica è registrata (chi, quando, valore prima/dopo)\ne si può esportare in PDF per il libretto di manutenzione.', { size: 11.5 });
  s.text(40, 870, 'Nota normativa: EN 81-70:2005 5.2.3 — il tempo porte non è accessibile all\'utente; DM 236/1989 8.1.12 — porte aperte ≥ 8 s, chiusura ≥ 4 s;', { size: 11.5, c: COL.warn });
  s.text(40, 888, 'EN 81-20:2020 5.12.1.7 — in manutenzione i comandi remoti vanno esclusi dal quadro: l\'interruttore «MANUTENZIONE» blocca anche la pagina web.', { size: 11.5, c: COL.warn });
  return s;
}
