# 03 — Costi e scelta dei componenti (quadro di manovra a PLC)

_Data: 2026-10-07 · Stato: ricerca di mercato di fattibilità. **I prezzi dei componenti specifici da ascensore non sono
pubblici**: dove non c'è una fonte aperta c'è scritto «ipotesi» e va sostituita con un preventivo._

## 1. Che cosa è verificato e che cosa no

| Voce | Stato | Fonte |
|---|---|---|
| Router 5G Teltonika RUTX50 — 494,80 € (Amazon.ie, IVA non specificata) | pagina aperta | https://pricespy.ie/product.php?p=7116776 |
| Kunbus RevPi Connect 5 (RS485) — 700,21 € IVA escl. | pagina aperta | https://www.digikey.ie/en/products/detail/kunbus-gmbh/PR100416/26266694 |
| Arduino Opta RS485 — ≈ 167,50 € (varia 159–170 per Paese, IVA non specificata) | solo risultato di ricerca | https://store.arduino.cc/en-pt/products/opta-rs485 |
| SICK Flexi Soft FX3-CPU130002 — 344,41 € | solo risultato di ricerca | https://de.rs-online.com/web/p/sicherheitssteuerungen/2859502 |
| Pilz PNOZmulti 2 base 772104 — 686,16 € | solo risultato di ricerca | https://industry-electronics.com/pilz/772104-pnozmb0.1-lieske_682958.htm |
| Armadio Schneider Spacial 600×500×250 — 171,32 € IVA escl. | solo risultato di ricerca | https://prof-elec.com/all-categories/enclosures-en/steel-enclosures-en/nsys3d6525-en/ |
| Modulo UCM TVRDEX NPK UCM 48AD/1M (certificato, con livellamento e pre-apertura) | esiste; **prezzo dopo login** | https://www.fceu.eu/controller-ucm-tvrdex-npk-ucm-48ad-1m-with-self-levelling-and-door-preopening-02360004 |
| Citofono/comunicatore EN 81-28 4G (2N Lift1, Guardian ETS) | 2N dichiara EN 81-28/-70/-80; Guardian ETS ≈ 624 USD | https://2n.com/it_IT/documents/22902/10488212/Volantino+prodotti+%28IT%29+-+2N%C2%AE+Lift1-+LQ/f2522a71-628a-4fde-b1a7-2da91a109b96/searchTitle-Volantino+prodotti+%28IT%29+-+2N%C2%AE+Lift1 |
| Inverter ascensore (Yaskawa L1000A, Inovance MD500/NICE3000), limitazione ai piani estremi (5.12.1.3), limitatore, encoder nuovo, porte, ARD, valvole Bucher, soft starter, sensori | **non trovato in EUR** (solo usato su eBay, USD o INR) | — |
| Quadro completo sostituito (forum condominiali): 5.000 € (4 piani), 11.000 € (6 piani), 12.000 € + IVA (quadro e pulsantiere) | testimonianze, **con posa, collaudo e margine** | https://www.condominioweb.com/forum/quesito/sostituzione-quadro-manovra-ascensore-23354/ |

Nessun PLC trovato risulta certificato come **componente di sicurezza ascensore** (Direttiva 2014/33/UE). Pilz e SICK sono
controllori di sicurezza industriali generici: usarli nella catena di un ascensore richiede il parere dell'organismo
notificato (vedi 02-normativa, parte «Che cosa può fare un PLC standard»).

## 2. Come si calcola (e perché i numeri sono ipotesi)

`Totale(N) = V + B + p × N`

- **V** parte verificata (PLC, router, modulo di sicurezza generico, armadio) dalle fonti sopra.
- **B** costi fissi **ipotizzati** (inverter con STO, UCM + limitazione ai piani estremi (5.12.1.3), encoder, citofono): nessun prezzo pubblico.
- **p** costo **ipotizzato** per fermata (nodo CAN, pulsantiera, contatto serratura, cavo, posa).
- **N** numero di fermate (12 o 24). Non include: manodopera, collaudo, organismo notificato, margine, porte, ARD, IVA.

| | Economica | Consigliata | Premium |
|---|---|---|---|
| PLC | Arduino Opta RS485 (167,50) | RevPi Connect 5 con 2 CAN FD (754,33) | WAGO PFC200 (1.438,56, prezzo dubbio) |
| Router 5G | Teltonika RUTX50 (494,80) | RUTX50 (494,80) | Robustel R5020 (881,92) |
| Sicurezza generica | SICK FX3 (344,41) | Pilz PNOZmulti (686,16) | Pilz PNOZmulti (686,16) |
| Armadio 600×500×250 | 171,32 | 171,32 | 171,32 |
| **V (verificato)** | **1.178** | **2.107** | **3.178** |
| B (ipotesi) | 2.100 | 3.100 | 4.300 |
| p (ipotesi) | 35 | 50 | 70 |
| **Totale 12 fermate** | **≈ 3.700** | **≈ 5.800** | **≈ 8.300** |
| **Totale 24 fermate** | **≈ 4.100** | **≈ 6.400** | **≈ 9.200** |

Lettura corretta: **il costo di 12 → 24 fermate è piccolo** (≈ 400–900 € di materiali, 12 nodi in più) perché il bus non
cresce con i piani (T07, T16). Il costo dominante è B: inverter, UCM/limitazione ai piani estremi (5.12.1.3), encoder e citofono.

**Idraulico:** dati insufficienti per un totale (valvole Bucher solo usate in USD, soft starter e sensori non trovati). In
qualità: si elimina l'inverter con encoder e il limitatore di velocità elettronico dell'argano; si aggiungono blocco valvole,
pressostato, controllo della temperatura e limitatore di tempo del motore. Il blocco valvole spesso resta quello dell'impianto
esistente in modernizzazione (certificato proprio).

Confronto di mercato (solo ordine di grandezza): le offerte private trovate vanno da 5.000 a 12.000 € **posa e margine
compresi**; i totali sopra sono solo materiali e non si confrontano 1:1.

## 3. Dove si risparmia davvero (senza uscire dalla norma)

1. **PLC standard** al posto di un controllore di sicurezza SIL: il comando non è nella catena (T04/T05); la sicurezza è
   cablata o in moduli già certificati. È la scelta che pesa di più.
2. **Moduli certificati acquistati** (bypass porte, UCM, limitazione ai piani estremi (5.12.1.3)) invece di far certificare un proprio PESSRAL
   (certificazione dell'organismo notificato, tempi e costi non trascurabili).
3. **Bus CAN** per pulsanti e piani: il cavo non cresce con le fermate e il numero di conduttori del cavo mobile resta quello.
4. **Un solo PLC e stesso software** per trazione e idraulico: cambiano 3 blocchi (T13).
5. **Gateway e router commerciali** invece di sviluppare hardware: l'unico sviluppo è il software (PLC + web).
6. **Modernizzazione:** riutilizzare macchina, freno, blocco valvole, porte e cablaggio del vano, se conformi (vedi 02-normativa).

## 4. Scelta dei PLC (candidati)

| Candidato | Pro | Contro |
|---|---|---|
| Arduino Opta RS485 (≈ 170 €) | il più economico; Ethernet, RS485, IEC 61131-3 | niente CAN integrato (serve gateway CAN); modulo piccolo; da validare in ambiente quadro |
| Kunbus RevPi Connect 5 con CAN FD (≈ 750 €) | Linux industriale, CAN FD, Node/CODESYS, può ospitare anche il gateway web | non è un PLC classico: il «ciclo» va progettato (real-time) |
| WAGO PFC200 (≈ 1.400 €, dubbio) | PLC industriale vero, CODESYS V3.5, WebVisu, modulo CANopen | più caro; modulo CAN a parte |
| Siemens S7-1200, Schneider, Eaton easyE4 | ecosistema noto | prezzi non trovati; non necessari |

Raccomandazione: **RevPi Connect 5 con 2 CAN FD** (CAN1 cabina, CAN2 piani, gateway web nello stesso apparecchio, un solo
dispositivo da alimentare), oppure **Opta + gateway CAN** se il costo minimo prevale e il bus è semplice. Verificare il
profilo **CiA 417** (ascensori): nessuna fonte trovata che lo dichiari già pronto; va implementato o scelto un nodo già conforme.

## 5. Preventivi da chiedere (ordine di priorità)

1. Modulo UCM + limitazione ai piani estremi (5.12.1.3) + bypass (TVRDEX NPK, Safeline, Pfitzer, Elgo, Dynatech).
2. Inverter ascensore con STO (Yaskawa L1000A, Inovance, KEB, Gefran).
3. Operatore porte con controllo CAN o a contatti.
4. Comunicatore EN 81-28 (2N Lift1 o equivalente) e ARD.
5. Batterie e caricabatterie.
6. Blocco valvole certificato e soft starter (idraulico).

_Limiti di questa ricerca:_ i prezzi vengono in gran parte da risultati di ricerca non riaperti; tre siti hanno bloccato la
lettura (403/timeout). Non c'è nessun prezzo di quadro pre-assemblato con PLC.
