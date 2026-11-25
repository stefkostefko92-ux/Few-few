import { Sheet, COL } from './lib.mjs';

export default function t12() {
  const s = new Sheet({
    n: 'T12',
    title: 'Rete, modem 5G e accesso dallo smartphone',
    subtitle: 'Connessione in uscita (VPN) · zone separate · ruoli · nessuna porta aperta da Internet',
  });

  // ---- zona utente / Internet ----
  s.group(30, 50, 330, 560, 'INTERNET E UTENTI', { c: COL.mute });
  const ph = s.box(50, 84, 290, 80, 'Smartphone utente (browser)', { sub: 'HTTPS · login + PIN/2FA\nsolo pagine «Utente»', fill: COL.fillE });
  const mt = s.box(50, 204, 290, 80, 'Manutentore (PC / telefono)', { sub: 'HTTPS · login + 2FA obbligatorio\npagine «Servizio»', fill: COL.fillE });
  const fw = s.box(50, 324, 290, 70, 'Firewall + WAF sul VPS', { sub: 'rate limit · fail2ban\nCORS in lista bianca', fill: COL.fillR });
  s.link([ph.b, mt.t], { c: COL.eth, arrow: false });
  s.link([[195, 164], [195, 204]], { c: COL.eth, arrow: false });
  s.link([[195, 284], [195, 324]], { c: COL.eth });
  const loc = s.box(50, 440, 290, 80, 'Telefono in loco', { sub: 'Wi-Fi del quadro (WPA3)\nacceso con chiave in quadro + PIN a tempo', fill: COL.fillE });
  s.text(52, 560, 'Nota: l\'allarme EN 81-28 usa un proprio\ncomunicatore con SIM dedicata, separato.', { size: 10.5, c: COL.warn });

  // ---- VPS ----
  s.group(400, 50, 330, 560, 'SERVER PORTALE (VPS in UE)', { c: COL.mute });
  const nx = s.box(420, 84, 290, 70, 'Nginx + TLS (Let\'s Encrypt)', { sub: 'HSTS · CSP · reverse proxy', fill: COL.fillE });
  const app = s.box(420, 184, 290, 100, 'App portale (Node 22 + TS)', { sub: 'JWT httpOnly · Argon2id\nRBAC a 4 ruoli · audit-log\nPostgreSQL (utenti, log)', fill: COL.fillE });
  const wg = s.box(420, 314, 290, 70, 'Endpoint WireGuard', { sub: 'un peer per quadro · chiavi per impianto', fill: COL.fillE });
  s.link([nx.b, app.t], { c: COL.eth });
  s.link([app.b, wg.t], { c: COL.eth });
  s.link([[340, 359], [400, 359]], { c: COL.eth, w: 2 });
  s.text(420, 410, 'Tutti i dati restano nell\'UE (ospitamento EU).', { size: 11 });
  s.text(420, 428, 'Nessun dato personale dell\'utente finale oltre\nl\'account (nome, e-mail, ruolo). Log senza PII.', { size: 11 });

  // ---- 5G ----
  s.group(770, 50, 180, 560, 'RETE MOBILE', { c: COL.mute });
  const cell = s.box(786, 190, 148, 110, 'Rete 5G', { sub: 'SIM dati (APN privato\nse disponibile)\nIP non raggiungibile', fill: COL.fillA });
  s.link([[730, 349], [770, 349]], { c: COL.rf, dash: '6 4', w: 2 });
  s.link([[950, 349], [990, 349]], { c: COL.rf, dash: '6 4', w: 2 });
  s.text(860, 345, 'tunnel', { size: 10, anchor: 'middle', c: COL.rf });
  s.text(860, 360, 'in uscita', { size: 10, anchor: 'middle', c: COL.rf });

  // ---- quadro ----
  s.group(990, 50, 570, 560, 'QUADRO DI MANOVRA', { c: COL.ink, dash: '' });
  const rt = s.box(1010, 84, 250, 130, 'Router 5G industriale', { sub: 'firewall: tutto bloccato in ingresso\nWireGuard client · NTP · log\naggiornamento firmware firmato\nSIM-PIN · accesso admin solo VPN', fill: COL.fillE });
  const ap = s.box(1290, 84, 250, 130, 'Access point Wi-Fi locale', { sub: 'spento di default · si accende\ncon chiave + pulsante (10 min)\nSSID nascosto · isolamento client\nvede solo il gateway :443', fill: COL.fillE });
  const gw = s.box(1010, 260, 250, 110, 'Gateway web (Linux)', { sub: 'serve le pagine HTTPS\nvalida e limita ogni scrittura\ndiario locale delle modifiche', fill: COL.fillE });
  const plc = s.box(1010, 420, 250, 100, 'PLC standard', { sub: 'Modbus TCP: solo registri\nin lista bianca (T14)', fill: COL.fillC });
  s.link([rt.b, gw.t], { c: COL.eth, both: true, label: 'VLAN 10', lx: 36 });
  s.link([gw.b, plc.t], { c: COL.eth, both: true, label: 'rete OT isolata', lx: 50 });
  s.link([ap.l, [1275, 149], [1275, 300], [1260, 315]], { c: COL.rf, dash: '6 4', w: 2 });
  s.link([[1275, 300], [1260, 315]], { c: COL.rf, dash: '6 4', w: 2, arrow: false });
  const ci = s.box(1290, 260, 250, 110, 'Alimentazione e UPS', { sub: 'router + gateway su batteria:\nresta raggiungibile con rete\nelettrica assente (≥ 4 h)', fill: COL.fillD });
  s.box(1290, 420, 250, 100, 'Catena di sicurezza', { sub: 'NESSUN collegamento con\nrouter, gateway o Wi-Fi', fill: COL.fillR, c: COL.p230 });
  s.line(1260, 470, 1290, 470, { c: COL.p230, w: 2, dash: '4 4' });
  s.text(1275, 462, '✕', { size: 16, c: COL.p230, anchor: 'middle', weight: 700 });

  // ---- tabella regole ----
  s.group(30, 640, 1000, 360, 'Regole del firewall e dell\'accesso (valori di progetto, da verificare con il responsabile della sicurezza)', { c: COL.mute });
  const rows = [
    ['Sorgente → destinazione', 'Porta', 'Regola'],
    ['Internet → quadro', 'qualsiasi', 'BLOCCA (nessuna porta in ingresso, nessun NAT, nessun IP pubblico)'],
    ['Quadro (router) → VPS', 'UDP WireGuard', 'CONSENTI, solo verso l\'IP del VPS; riconnessione automatica'],
    ['VPS → gateway', 'TCP 443 (HTTPS interno)', 'CONSENTI, solo dal peer WireGuard del VPS'],
    ['Gateway → PLC', 'TCP 502 (Modbus)', 'CONSENTI, indirizzi in lista bianca; scrittura solo su registri «Utente» e «Servizio»'],
    ['Wi-Fi locale → gateway', 'TCP 443', 'CONSENTI solo se il pulsante in quadro è stato premuto (timer 10 min)'],
    ['Wi-Fi locale → altro', 'qualsiasi', 'BLOCCA (client isolati, niente accesso a PLC, router o Internet)'],
    ['PLC → qualsiasi', 'qualsiasi', 'BLOCCA l\'uscita; solo risposte Modbus'],
    ['Router → Internet (NTP, aggiornamenti)', 'UDP 123 / HTTPS', 'CONSENTI verso destinazioni fisse; aggiornamenti solo firmati'],
  ];
  rows.forEach((r, i) => {
    const y = 672 + i * 36;
    const w = [250, 210, 520];
    let x = 46;
    r.forEach((c, j) => {
      s.text(x, y + 8, c, { size: i === 0 ? 11.5 : 11, weight: i === 0 ? 700 : 400, c: i > 0 && j === 2 && c.startsWith('BLOCCA') ? COL.p230 : COL.ink });
      x += w[j];
    });
    s.line(40, y + 18, 1020, y + 18, { c: COL.grid, w: 1 });
  });

  s.legend(1330, 780, [
    [COL.eth, 'Ethernet / VPN', ''],
    [COL.rf, 'Radio (5G, Wi-Fi)', '6 4'],
    [COL.p230, 'Collegamento vietato', '4 4'],
  ]);
  return s;
}
