# 01 — Studio di fattibilità: quadro di manovra a PLC per ascensori (trazione geared e idraulico)

_Carbon Stealth VCC · 2026-10-07 · Italiano · Documento di studio, **non** è un progetto esecutivo né una dichiarazione di conformità._

## 1. Risposta in breve

Per un quadro **a costo minimo che resta a norma** (EN 81-20/50:2020 per il nuovo, UNI 10411:2024 per la modernizzazione) la
strada è:

1. **PLC standard** (non di sicurezza) per tutta la manovra: chiamate, porte, posizione, parametri, bus, web, remoto.
2. **Tutto ciò che è «dispositivo elettrico di sicurezza» resta fuori dal PLC**: catena di contatti ad apertura positiva in
   serie (48 V c.c.), più **moduli certificati acquistati** per bypass delle porte (livellamento/rilivellamento) e UCM.
3. **Distacco del motore** con 2 contattori indipendenti (opzione più economica, EN 81-20 5.9.2.5.4 a) oppure STO SIL 3 (d);
   per l'idraulico 2 contattori in salita e 2 dispositivi in serie sulle valvole di discesa.
4. **Bus CAN** per pulsanti e piani: da 12 a 24 fermate si aggiungono solo nodi di piano; il quadro non cambia.
5. **Router 5G + gateway web**: connessione in uscita (VPN), nessuna porta aperta; da remoto solo dati e parametri non critici;
   la sicurezza non ha alcun collegamento con rete e web.

Perché è la via più economica: evita la certificazione di un proprio sistema elettronico di sicurezza (PESSRAL con esame di
tipo, EN 81-50 5.6 e 5.16) e usa componenti già certificati dove la norma lo impone.

## 2. Che cosa ha chiesto il committente e dove sta la risposta

| Richiesta | Risposta | Dove |
|---|---|---|
| Elettrico geared e idraulico | stesso PLC/bus/web, cambiano azionamento e catena | T02, T03, T04, T05 |
| EN 81-20 (nuovo) o UNI 10411 (modernizzazione) | punti e valori per caso | 02-normativa (sezioni 0, 10, 11) |
| PLC programmabile con software di manovra | POU, macchina a stati, I/O | 04-software, T06, T13 |
| Impostazioni sbloccate per l'utente dal telefono (browser) | ruoli e matrice di accesso | T14, 04-software |
| Collegamento remoto con modem 5G nel quadro | VPN in uscita, firewall, zone | T12, 05-remoto |
| Tavole di tutto, fino a 12 fermate (24) | 16 tavole in `schemi/` (SVG e PDF) | indice sotto |
| Costo minimo | formula e configurazioni | 03-costi |
| Tutto in italiano | sì | — |

## 3. Opzioni confrontate

| Opzione | Descrizione | Pro | Contro | Giudizio |
|---|---|---|---|---|
| **A — PLC standard + catena cablata + moduli CE** | quella di questo studio | costo minimo; componenti già certificati; software libero; nessun esame di tipo proprio sulla manovra | il quadro non è «tutto software»: più cablaggio; serve un modulo CE per bypass e UCM | **consigliata** |
| B — Controllore di sicurezza SIL 2/3 (PESSRAL) per catena e bypass | un solo apparecchio certificato | meno cablaggio, funzioni di sicurezza flessibili | esame di tipo con organismo notificato (EN 81-50 5.6, 5.16, App. B), documentazione software, prove a 0 °C e +65 °C; **nessun PLC di sicurezza trovato certificato per ascensori** | solo se si vuole un prodotto proprio |
| C — Quadro commerciale di serie + solo gateway web/5G | si compra il quadro, si sviluppa la parte web | rischio minimo di conformità | costo più alto; vincolo sul fornitore; il software di manovra non è nostro | alternativa per una prima installazione |
| D — Quadro tutto su Linux (RevPi) con sicurezza nel software | massima integrazione | poco hardware | la sicurezza nel software richiede PESSRAL; non accettabile per risparmio | **sconsigliata** |

Decisioni che spettano a progettista, ingegnere e organismo notificato (non a questo studio): se la lettura della catena e la
sorveglianza dei contattori da parte del PLC è accettabile (5.9.2.6, 5.11.2.1.2); l'architettura di sicurezza finale.

## 4. Architettura (T01) e scelte chiave

- **Catena a 48 V c.c.**: tensione ≤ 250 V (5.10.1.3.2); i contatti di serratura raggiungibili dal dito di prova devono stare
  entro 25 V c.a. / 50 V c.c. nella modernizzazione senza esame di tipo (10411-1 11.1.2): 48 V c.c. rientra.
- **PLC fuori dalla catena**: lettura dei tratti A–D solo con interfaccia isolata e guasto analizzato (5.11.2.1.2), o con
  modulo di monitoraggio certificato.
- **Moduli CE**: bypass/livellamento (SIL 2, 5.12.1.4), UCM (rilevamento SIL 2, attivazione SIL 1, esame di tipo 81-50 5.8),
  limitatore di velocità e relativo DES (SIL 2, 5.6.2.2.1.6). I punti del prospetto A.1 sono in 02-normativa.
- **Remoto**: da remoto solo dati informativi, mai codice di sicurezza (81-50 B.1 r. 7–8); comandi remoti escludibili dal
  quadro in manutenzione (5.12.1.7); parametri dell'allarme protetti (81-28:2004 4.2.5).

## 5. Trazione e idraulico: differenze che toccano il quadro

| Voce | Trazione (argano geared) | Idraulico |
|---|---|---|
| Azionamento | inverter ad anello chiuso + encoder (T02) | soft starter / stella-triangolo + blocco valvole (T03) |
| Distacco | 2 contattori **o** STO SIL 3 (5.9.2.5.4); freno a 2 dispositivi (5.9.2.2.2.3) | salita: 2 contattori (5.9.3.4.2); discesa: ≥ 2 dispositivi in serie (5.9.3.4.3) |
| Limitatore di tempo | min(45 s; corsa + 10 s; min 20 s) (5.9.2.7) | min(45 s; corsa a pieno carico + 10 s; min 20 s) (5.9.3.10) |
| Extracorsa | alto e basso | solo alto (5.12.2.1) |
| Temperatura | protezione motori (5.10.4.2) | olio **obbligatorio** (5.9.3.11), ritorno al piano più basso |
| Emergenza | apertura freno / emergenza elettrica ≤ 0,30 m/s | discesa manuale ≤ 0,3 m/s, pompa a mano |
| Antideriva | — | 15 min al piano più basso (5.12.1.10) |
| Sovraccarico | blocca anche il rilivellamento | non blocca il rilivellamento (5.12.1.2.1) |
| Velocità | ≤ + 5 % (5.9.2.4) | vm, vd ≤ 1,0 m/s (5.9.3.8.1) |
| Pressostato | — | **non richiesto** dai testi appresi |

Il software PLC è lo stesso; cambiano le POU di azionamento (04-software) e due blocchi della macchina a stati (T13).

## 6. Impianto nuovo o modernizzazione

| Domanda | Risposta (02-normativa, sezione 0 e 10) |
|---|---|
| Nuovo impianto | UNI EN 81-20/50:2020 (+ EN 81-21:2022 se testata/fossa ridotte, EN 81-28/-70/-73 per allarme, accessibilità, antincendio) |
| Solo il quadro sostituito | **modifica costruttiva** (DPR 162/1999 art. 2): comunicazione, **verifica straordinaria** (art. 14 c. 3), documenti di UNI 10411 App. C/A, DdC (DM 37/2008) |
| Senza CE | UNI 10411-1 (elettrici a frizione) o -2 (idraulici); deroghe per funzioni assenti prima (11.1.3) |
| Con CE | UNI 10411-11 / -12: deroghe solo per impianti EN 81-1/-2; **il controllo del carico non è derogabile**, né il livellamento in carico, né la riapertura su urto |
| Regolazione di velocità | **non si può aggiungere** dove non c'era (sostituzione di soli componenti) |
| UCM mancante | misure compensative su freno (corrente permanente, reset manuale) o 2 elettrovalvole in serie con autocontrollo |
| Modifica sostanziale | quadro + macchina + porta di piano + cabina con telaio → EN 81-20 intera |
| Tabelle DM 23/07/2009 | alla modernizzazione significativa vale la Tab. C |

Tamburo senza CE: nessuna parte 10411 appresa. EN ISO 8100-1/-2:2026 non appresa: per il nuovo, riverificare prima della
progettazione esecutiva.

## 7. Software e web (sintesi di 04)

POU: IO_Map, Catena_Diagnosi (sola lettura), Posizione, Chiamate, Stati, Azionamento_Trazione / Azionamento_Idraulico, Porte,
Bus_CAN, Parametri, Log, Modbus_Slave. Gateway Node 22 + TypeScript con ruoli Utente / Amministratore / Manutentore /
Installatore, 2FA, registro delle modifiche e **lista bianca** di registri. Il tempo porte **non** è modificabile dall'utente
(81-70 5.2.3), con minimi DM 236/1989 (≥ 8 s aperte, ≥ 4 s chiusura). Matrice completa: T14.

## 8. Da 12 a 24 fermate (T07, T16)

Nessun limite di norma al numero di fermate nei testi appresi. Cambiano: +12 nodi CAN, +12 contatti di serratura in serie,
eventuale secondo modulo pulsanti in cabina, magneti/lamelle di zona; non cambiano CPU, quadro, inverter, cavo mobile.
Idraulico oltre 2 piani: verifica della zona di sbloccaggio indipendente dall'energia (5.9.3.9.3). Corsa > 30 m: citofono
(5.12.3.2).

## 9. Costi (sintesi di 03)

Materiali del quadro per 12 fermate ≈ 3.700 € (economica), 5.800 € (consigliata), 8.300 € (premium); per 24 fermate ≈ 4.100 /
6.400 / 9.200 €. **Solo ≈ 1.200–3.200 € sono verificati**; il resto (inverter, UCM, encoder, citofono, costo per fermata) è
ipotesi in attesa di preventivi. Escluse manodopera, collaudo, organismo notificato, porte, ARD, IVA.

## 10. Rischi e decisioni aperte

| # | Rischio / decisione | Azione |
|---|---|---|
| 1 | Architettura di sicurezza (lettura catena da PLC, sorveglianza contattori) | parere preliminare dell'organismo notificato |
| 2 | EN ISO 8100-1/-2:2026 non appresa; citazione GUUE e transizione non confermate | acquistare la norma e verificare la GUUE |
| 3 | EN 81-28:2022, 81-70:2022, 81-73:2020, EN 61800-5-2, EN 60204-1 non apprese | acquisto/consultazione |
| 4 | Prezzi dei componenti da ascensore non pubblici | preventivi (elenco in 03-costi, sezione 5) |
| 5 | CiA 417 non verificato come già disponibile su alcun PLC | verificare o implementare un profilo semplificato |
| 6 | Cybersicurezza: RED/EN 18031 per il router; CRA dal 11/12/2027 | dichiarazioni di conformità del modello scelto; SBOM e gestione vulnerabilità |
| 7 | Accesso remoto: nessuna linea guida pubblica trovata | validare con l'organismo; tenere solo lettura e parametri non critici |
| 8 | Testo coordinato DPR 162/1999 non appreso | verificare su Normattiva (numerazione «cc)» dopo il DPR 23/2017) |

## 11. Piano di lavoro (fasi, durate da stimare)

1. **Norme e preventivi**: acquisto EN ISO 8100 e delle norme mancanti; preventivi di UCM/bypass, inverter, comunicatore, ARD.
2. **Parere preliminare** dell'organismo notificato su architettura e interfacce.
3. **Progetto esecutivo** del quadro (schemi IEC 60617, analisi di guasto 5.11.1.2, elenco morsetti, fascicolo).
4. **Software**: simulatore di vano (12 e 24 fermate), POU, gateway, portale.
5. **Banco di prova**: catena, moduli CE, prove di mancanza rete/bus/5G, prove di scrittura non consentita.
6. **Impianto pilota** con prove EN 81-20 punto 6.3 (isolamento, UCM, freno, livellamento) e verifica straordinaria.

## 12. Indice delle tavole (schemi/)

| Tav. | Titolo |
|---|---|
| T01 | Architettura generale a blocchi |
| T02 | Potenza — elettrico geared (VVVF) |
| T03 | Potenza — idraulico |
| T04 | Catena di sicurezza — trazione |
| T05 | Catena di sicurezza — idraulico |
| T06 | Ingressi e uscite del PLC |
| T07 | Bus CAN: cabina e piani (12 → 24) |
| T08 | Cabina, cavo mobile e dispositivi del vano |
| T09 | Controllo delle porte |
| T10 | Ispezione, emergenza, manutenzione, recupero |
| T11 | Allarme EN 81-28, luce di emergenza, batteria |
| T12 | Rete, modem 5G, accesso dallo smartphone |
| T13 | Macchina a stati del software |
| T14 | Impostazioni sbloccate per ruolo |
| T15 | Disposizione fisica del quadro |
| T16 | Espansione da 12 a 24 fermate |

Visualizzazione: `schemi/index.html` (galleria) e `Tavole-quadro-PLC.pdf` (A3 orizzontale). Le tavole si rigenerano con
`node tools/build.mjs` e `node tools/pdf.mjs`.

## 13. Avvertenze

Questo studio non sostituisce il progetto firmato da un progettista abilitato, né la dichiarazione di conformità
dell'installatore, né la verifica del soggetto abilitato. Valori e punti di norma sono riportati come numero e valore; il
testo delle norme (UNI/EN/ISO, protetto da diritto d'autore) non è riprodotto. Le schede di dettaglio con le parafrasi
interne restano nella base privata (non pubblicate).
