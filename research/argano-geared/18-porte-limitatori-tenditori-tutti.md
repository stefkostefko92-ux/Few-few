# Porte di cabina, sospensioni di piano, limitatori e tenditori — tutti i costruttori sul mercato italiano

[← Indice](README.md)

> Raccolta del **2 ottobre 2026** per LiftPilot (disegno 2D/3D dell'impianto con modelli parametrici nostri).
> Questa volta, a differenza dei file 13 e 14, quasi tutti i siti dei costruttori e dei rivenditori **si aprivano**:
> pagine e PDF sono stati scaricati e letti direttamente, e le quote sono state lette sui disegni pagina per pagina.
> Si riportano **solo numeri** (quote, campi, masse): nessun disegno e nessun testo dei costruttori è stato copiato
> nel repository. I file scaricati restano fuori dal repository, nella cartella di lavoro della sessione
> (`scratchpad/dl/porte-limitatori/<costruttore>/`).

## 0. Legenda e metodo

| Segno | Significato |
|---|---|
| ✅ | letto nella fonte: pagina o documento **del costruttore** (testo, tabella o quota stampata sul disegno) |
| ⚠️ | derivato o fonte secondaria: rivenditore, copia del documento su un sito di terzi, estratto di ricerca dei file 13/14, nostra aritmetica o nostra lettura del significato di una quota (il motivo è sempre indicato) |
| ❓ | non trovato |

- **Data di accesso: 2026-10-02 per tutte le fonti**, salvo i dati ripresi dai file [13] e [14] (2026-10-01, estratti di
  motore di ricerca, sempre ⚠️). Codici fonte tra parentesi quadre → § 7.
- Il segno nella colonna «Fonte» vale per tutti i numeri della riga; un segno scritto accanto a un singolo valore lo
  sostituisce.
- «Quota del disegno» = numero stampato sul disegno del costruttore. Quando il disegno non dice esplicitamente che cosa
  misura (manca la legenda), la descrizione è nostra e il valore è ⚠️.
- Simboli: luce netta = A (2SG), PL (Fermator, Wittur), CO, AP (Dapa), TB (Sematic); altezza utile = HLP (2SG), HL
  (Fermator 40/10), CH (Fermator 50/11), LH (Wittur). Tipi: T2 = 2 ante telescopiche (2AT, 2R/L, 12/R-L, 11), C2 = 2
  ante centrali (2AO, 2AC, 2Z, 02/C, 01/C), T3 = 3 telescopiche (3AT, 3R/L, 32/R-L, 35/R-L), C4 = 4 centrali (4AT nella
  sigla 2SG, 4AC, 4Z, 42/C).
- Metodo: `curl` attraverso il proxy dell'ambiente (TLS verificato, nessun certificato aggiunto); testo dei PDF estratto
  con pdfminer; pagine dei disegni rasterizzate e lette a vista. Nessun captcha o controllo anti-bot aggirato.

## 1. Accesso ai siti e disegni/CAD scaricabili

| Costruttore | Sito | Esito da qui (2026-10-02) | Disegni / CAD scaricabili |
|---|---|---|---|
| PFB | www.pfb.it, download.pfb.it | 302 → 200; download.pfb.it 200 | Manuali d'uso PDF pubblici con disegni quotati (download.pfb.it/manuali-uso). Catalogo, listino, omologazioni: **solo con registrazione** (download.pfb.it → getaccess.pfb.it). CAD (DWG/STEP): ❓ nessun file pubblico; sul sito solo viste 360° a immagini |
| Montanari Giulio & C. | www.montanarigiulio.com | `curl: (60) SSL certificate problem: unable to get local issuer certificate`; WebFetch `EGRESS_BLOCKED`; il registro del proxy segnava alle 06:03 «gateway answered 403 to CONNECT» | ❓ (manuali PDF esistono, vedi file 13, non apribili) |
| Dynatech | www.dynatech-elevation.com | `curl: (60) SSL certificate problem: unable to get local issuer certificate`; WebFetch `EGRESS_BLOCKED` | manuali con disegni quotati ospitati dal rivenditore elevatorequipment.co.uk (PDF, senza login); CAD ❓ |
| Wittur (con Sematic e Selcom) | www.wittur.com | `/` 301 → `/en/default.aspx` 200 (`/en/` dà 403 «directory listing») | brochure PDF pubbliche (`/website/get_download.aspx?ctrb_id=…`); **DXF solo con login** («Wittur Draw – DXF Download», registrazione gratuita; app production.witturdraw.digipara-liftdesigner.com risponde 200); alcuni manuali «Log-in to download»; **STEP pubblico** della porta di piano Hydra 3000 homelift (ctrb_id=10135 → `356181.20-00.zip`, STEP AP203, nessun login) |
| Sematic (Wittur) | www.sematic.com | `curl: (60) SSL certificate problem: certificate has expired`; WebFetch `EGRESS_BLOCKED` | prodotti Sematic 2000 sul sito Wittur |
| Selcom (marchio storico Wittur) | www.selcom.it | `curl: (35) Recv failure: Connection reset by peer` (proxy: «tunnel closed (code 1006)»); WebFetch `EGRESS_BLOCKED` | catalogo tecnico Hydra Plus («Selcom car door») su manualslib, copia di terzi |
| Fermator | www.fermator.com | `curl: (60) SSL certificate problem: unable to get local issuer certificate`; WebFetch `EGRESS_BLOCKED` | PDF ufficiali con disegni quotati: copie su vytahovedily.com, arcolift.com, irp.cdn-website.com (200); CAD ❓ |
| 2SG | www.2sg.it | 200 (a tratti `curl: (35) Recv failure: Connection reset by peer`, risolto ripetendo) | **schede PDF pubbliche con disegni quotati** per ogni operatore e sospensione; CAD ❓ |
| Prisma | www.prismaitaly.it | 200 (reset intermittenti come 2SG) | catalogo tecnico **solo con login** («Accedi»); configuratore DigiPara Lift Designer per porte Prisma (prisma-awp.digipara-liftdesigner.com, risposta 302); `productsboard.pdf` pubblico |
| Dapa | dapasrl.com | 200 | **cataloghi tecnici PDF pubblici** (LOWER, PARVA, MICRON…, disegni scansionati con tabelle); «area riservata» con login; CAD ❓ |
| CMM | www.cmmelevators.com | 200 | solo brochure PDF; disegni e CAD ❓ |
| Bode Components | bode-components.com | 200 (`www.` → 301) | brochure e manuali PDF pubblici; disegni quotati PDF ospitati da elevatorequipment.co.uk; CAD ❓ |
| Rivenditori | elevatorequipment.co.uk 200 · elevatorshop.de 200 · donati.it 200 (alcuni vecchi URL 404) · davenportliftcontrol.com 200 · manualslib.com 200 · lift-store.it `curl: (35) Recv failure: Connection reset by peer` · igilift.com 202 (pagina di verifica da 278 byte, non aggirata) · modernlifttech.com 403 · indiamart.com 403 · docplayer.net nessuna connessione (000) | — |

## 2. Operatori di cabina e sospensioni di piano

### 2.1 2SG (Ronco Briantino)

Dati delle pagine prodotto [2SG-W] e delle schede PDF con disegno [2SG-P]. Nelle tabelle web **A = luce**; L e D sono
lunghezze misurate dal bordo della luce (lato chiusura) verso il pacco ante (disegno in pianta della FLY 2AT).

**Operatori di cabina — tabelle delle pagine web (✅ [2SG-W])**

| Operatore | Tipo | A [mm] | L | D | Altre colonne | Note |
|---|---|---|---|---|---|---|
| FLY 2AT | T2 | 600–1000 (passo 50) | 900, 975, 1050, 1125, 1200, 1270, 1350, 1425, 1500 | 940, 1015, 1090, 1165, 1240, 1315, 1390, 1465, 1540 | — | A 850: L = 1270 sul sito, **1275** nel PDF ✅ [2SG-P-FLY2AT] (conflitto) |
| LIKE 2AT | T2 | 600–1800 (passo 50 fino a 1000, poi 100) | 600–1000 come FLY; 1100→1650, 1200→1800, 1300→1950, 1400→2100, 1500→2250, 1600→2400, 1700→2550, 1800→2700 | 600–1000 come FLY; 1690, 1840, 1990, 2140, 2290, 2440, 2590, 2740 | — | soglia rinforzata 90 a richiesta |
| FLY 2AO | C2 | 600–1000 | 1100 (600–650), 1250 (700–750), 1500 (800–950), 2000 (1000) | 1220, 1320, 1420, 1520, 1620, 1720, 1820, 1920, 2020 | — | — |
| FLY 3AT | T3 | 750–1000 | 1000, 1070, 1135, 1200, 1270, 1335 | 1020, 1090, 1155, 1220, 1290, 1355 | — | — |
| LIKE 3AT | T3 | 750–1000 (righe 1100–1800 vuote) | 1000, 1070, 1135, 1200, 1270, **1355** | 1020, 1090, 1155, 1220, 1290, 1355 | — | A 1000: L 1355 contro 1335 della FLY ⚠️ |
| LIKE «4AT» (4 ante centrali) | C4 | 600–1000 (righe 1100–1800 vuote) | 1000, 1025, 1070, 1125, 1200, 1275, 1350, 1440, 1500 | 1025, 1055, 1100, 1150, 1220, 1290, 1360, 1440, 1525 | — | solo nel PDF ✅ [2SG-P-LIKE4]; i valori non seguono una regola semplice ⚠️ |
| OP93 2AO (a braccio) | C2 | 500–1400 | 1100 (500–650), 1250 (700–750), 1500 (800–950), 2000 (1000–1400) | 600 (500–650), 700 (700–750), 800 (800–950), 1200 (1000–1400) | B: 385, 395, 415, 410, 420, 435, 445, 460, 470, 485, 495, 520, 545, 570, 595 · E: 2575, 2585, 2605, 2600, 2610, 2625, 2635, 2650, 2660, 2675, 2685, 2710, 2735, 2750, 2785 | qui D è un'altra grandezza (costante a gradini) |
| OP93 2AT (a braccio) | T2 | 600–1800 | 1,5·A per tutte le righe (900 … 2700) | — | F = 500…900 per A 600–1000 (F = A − 100, nostra aritmetica ⚠️); B = 1000…1700 e C = 550…900 per A 1100–1800 | — |
| OP93 3AT (a braccio) | T3 | 750–1800 | 1000, 1070, 1135, 1200, 1270, 1335, 1470, 1600, 1735, 1870, 2000, 2135, 2270, 2400 | 1010, 1075, 1145, 1210, 1275, 1345, 1475, 1610, 1745, 1875, 2010, 2145, 2275, 2410 | B: 410…585 · E: 2600…2775 | — |
| OP93 4AT (a braccio) | C4 | 600–1800 | 1000, 1025, 1070, 1125, 1200, 1275, 1350, 1425, 1500, 1650, 1800, 1950, 2100, 2250, 2400, 2550, 2700 | 920, 995, 1070, 1145, 1220, 1295, 1370, 1445, 1520, «11670», 1820, 1970, 2120, 2270, 2420, 2520, 2720 | B: 410…560, poi di nuovo 410…485 · E: 2600…2750, poi 2600…2675 | «11670» (A 1100) e la ripartenza di B/E a A 1300 sono probabili refusi ⚠️ |

**Operatori di cabina — quote dei disegni (✅ [2SG-P], PDF 2025/03)**

| Operatore | Ingombro massimo in larghezza | Altezza d'ingombro | Soglia (lunghezza) | Profondità e altre quote | Soglia (larghezza) | Fonte |
|---|---|---|---|---|---|---|
| FLY 2AT | **1,5·A (+10 max)** | **HLP + 475** (sul prospetto anche 285, 135 e 20 sopra la luce: come si sommino è nostra lettura ⚠️) | **1,5·A + 20**; «(*) + 40» | vista laterale: 220 (sporgenza della trave dal fronte, ⚠️ lettura), 250, 35, 110, 155, 20; HLP + 190; anta = HLP + 10; grembiule 750; pianta: asole 11 × 30, 140, 50, 0,5·A − 50, 120, 95/110, 30 | 75/90 | [2SG-P-FLY2AT] p. 7 |
| FLY 2AO | **2·A (+20 max)** | **HLP + 475** | **2·A + 20** | 220, 250, 35, 110, 155, 20; HLP + 190; anta HLP + 10; 750; pianta 70/90, asole 11 × 30 | 50/70 | [2SG-P-FLY2AO] p. 5 |
| FLY 3AT e LIKE 3AT | **1/3·A + A + 10** | **HLP + 510** (trave 320) | **1/3·A + A + 20**; extracorsa + 40 | 220, 285, 35, 115, 110, 20; HLP + 190; anta HLP + 10; 750; pianta 140, 120, 50 | 120 | [2SG-P-FLY3AT] p. 9 · [2SG-P-LIKE3AT] p. 27 |
| OP93 2AT | **1,5·A + 45 max** | E sul disegno (nella tabella 2AT la colonna E manca; nelle tabelle OP93 2AO/3AT/4AT E = 2575–2785, disegno a HLP 2000 ⚠️) | **1,5·A + 20** standard; **1,5·A + 40** extracorsa | profondità **max 260**; 290; 155; 135; B; HLP + 190; HLP + 10; 750 | 75/90 | [2SG-P-OP93-2AT] p. 15 |

Lettura delle colonne web (⚠️ nostra): nella FLY 2AT **L = 1,5·A** coincide con l'ingombro massimo senza i 10 mm di
tolleranza e **D = 1,5·A + 40** con la soglia «extracorsa» dello stesso disegno; nella FLY 2AO **D = 2·A + 20** coincide
con la soglia. Altri dati ✅ [2SG-W]: motore FLY 200 W DC con encoder, 230 Vca o 24 Vcc; LIKE con motore brushless;
OP93 motore asincrono trifase 125–415 Vca, coppia 2 / 2,5 Nm; FLY e LIKE «adattabili su impianti con testata bassa 2400
mm»; FLY 4AT compatibile con operatori OP93 e «LOUIS» (nessuna tabella).

**Sospensioni e porte di piano 2SG**

| Prodotto | Tipo | Luce A → altezza max [mm] | Soglia | Quote del disegno | Fonte |
|---|---|---|---|---|---|
| Sospensione 2AT (I92) | T2 | 500–750 → 2000; 800–1150 → 2200; 1200–1800 → 3000 | 75/90 (rinforzata 90 a richiesta) | soglia **(1,5·A) + 20**; frontalino 220; telaio alto 2220 e ingombro 2270 per HLP 2000 (cioè HLP + 270, ⚠️ nostra aritmetica); montante 120; pianta 50, 32/42, 32/42, 35, 125/140; sezione 105, 135, 215, 2015; 230 sotto il piano | ✅ [2SG-W] · [2SG-P-SOSP2AT] p. 33 |
| Sospensione I92 2AO | C2 | 500–750 → 2000; 800–1400 → 2200 | 50/70 | soglia **(2·A) + 20**; 220; 2270; 2220; 120; 200; 1000; pianta 50, 42/62, 38/35; sezione 70/90, 135, 215, 2015 | ✅ [2SG-W] · [2SG-P-SOSP2AO] p. 31 |
| Sospensione I92 3AT | T3 | 750–1100 → 2000; 1200–1800 → 2200 | 120 | (PDF scaricato, non letto in dettaglio) | ✅ [2SG-W] |
| Sospensione I92 «4AT» | C4 | 600–1500 → 2000; 1600–2300 → 2200; 2400–4000 → 3000 | 75–90 (90 rinforzata) | (PDF scaricato, non letto in dettaglio) | ✅ [2SG-W] |
| Telaio standard | — | — | — | montanti 120, frontalino 220, spessore 50 | ✅ [2SG-W] |
| Telai di dimensioni speciali | — | — | — | montanti e frontalino minimi 25; spessore a disegno | ✅ [2SG-W] |
| Porta completa Thor EN 81-20/50 | 1AT, 2AC, 2AT, 3AT, 4AC, 6AC | 1AT 500–900 → 2200; 2AC 500–750 → 2000, 800–1400 → 2200; 2AT 500–750 → 2000, 800–1150 → 2200, 1200–1800 → 3000; 3AT 750–1100 → 2000, 1150–1800 → 2200; 4AC 600–1500 → 2000, 1550–2300 → 2200, 2350–4000 → 3000; 6AC 1500–2300 → 2000, 2400–3400 → 2200 | — | montanti 120 (max 150), frontalino 220, spessore 50 | ✅ [2SG-W] |
| Porta EI120 2AT | T2 | 700–750 → 2000; 800–1150 → 2200; 1200–1300 → 2415 | — | montanti 95; spessore telaio 50; ingombro in altezza 2270 + staffe superiori | ✅ [2SG-W] |
| Porta Compact 4 ante | 4AC | 600–1500 → 2000; 1550–2300 → 2200; 2350–4000 → 3000 | H75/H90 | — | ✅ [2SG-W] |

### 2.2 Fermator

Il sito fermator.com non si apre da qui (§ 1). I due documenti tecnici ufficiali sono stati letti su **copie di terzi**:
40/10 PM (DOC-FECMCBP10C00EN-3.2, «printable version 06-02-2018») [F-4010PM] e 50/11 (DOC-FECMCBP50R00EN, «ongoing
version 08-05-2014») [F-5011]. Per questo tutti i valori sono ⚠️ (copia di terzi), ma sono **letti sul disegno**.

**Porta di cabina 40/10 PM** (operatore sincrono brushless PM, cinghia HTD 5M)

| Tipo (soglia) | Lunghezza operatore | Oltre la luce lato chiusura | Soglia | Altezza (dal pavimento di cabina) | Profondità / staffe | Rulli | Fonte |
|---|---|---|---|---|---|---|---|
| C2 (soglia 54) | **2·PL + 50** | — | **2·PL + 40** | sommità **HL + 350**; quote HL + 220, HL + 186, anta HL + 10; quote verticali dell'operatore 340, 133,5, 85, 120, 56 (a che cosa si riferiscano non è scritto ⚠️) | vista laterale 144, 130; staffe di fissaggio: SD 280 (HL + 50), ST 183 (HL + 100), EF 250 (HL + 220), ER 232 (HL + 270), EG 232 (HL + 380); «≥ 25» | Ø 48 concentrico, Ø 33 eccentrico | ⚠️ [F-4010PM] p. 5 |
| T2 (soglia 90) | **1,5·PL + 50** | **15** | **1,5·PL + 40** | sommità **HL + 340**; HL + 220; anta HL + 10; quote verticali dell'operatore 330, 133,5, 85, 120, 56 (riferimento non scritto ⚠️) | vista laterale 120 e 20; staffe come C2 | Ø 48 / Ø 33 | ⚠️ [F-4010PM] p. 8 |
| C4 (soglia 90) e T2 (soglia 70) | disegni presenti (pp. 6, 9), quote non lette in dettaglio | | | HL + 338, HL + 380 sul disegno C4 | | | ⚠️ [F-4010PM] |

Altri dati 40/10 PM (⚠️ [F-4010PM] pp. 2–4): T2 PL 600–1400, HL 1800–2400 (campi degli altri tipi non estratti ❓); massa
totale T2 PL 800 HL 2000 con ante in lamiera **62 kg**; massa mobile max 360 kg; fino a 800 000 cicli/anno e 240
cicli/h; velocità impianto fino a 2,5 m/s; apertura fino a 0,7 m/s, chiusura fino a 0,4 m/s; soglia 54 mm con spessore
«PL ≤ 700 = 3; PL ≥ 750 = 2,5» (a quale pezzo si riferisca non è detto ⚠️); grembiule 750 / 812 (495) / 798 (405);
zona di sblocco +98/−152 o +228/−273; quota AFO «HL + 220» e «HL + 338».

**Porta di piano 50/11** (stessi rulli per C2 e T2)

| Tipo (soglia) | Lunghezza sospensione | Soglia | Altezza | Altre quote | Rulli | Fonte |
|---|---|---|---|---|---|---|
| T2 (soglia 90) | **1,5·CO + 100** | **1,5·CO + 40** | sommità **CH + 265**; CH + 204; anta CH + 10 | 20 + 90 + FD (profondità con telaio); HD (traversa); 0,5·CO + 120; CO − 200; J2 + 100; J2 − 55; J2 − 20; 160; 15; 25; dettaglio soglia FD + 90, 5/40/40/5, 42, 30 | Ø 56 concentrico, Ø 54 eccentrico; «thickness 4» | ⚠️ [F-5011] p. 12 |
| C2 (soglia 54) | **2·CO + 100** | **2·CO + 40** | CH + 265; CH + 204; CH + 10 | 20 + 54 + FD; CO − 200 | Ø 56 / Ø 54 | ⚠️ [F-5011] p. 6 |

Telai 50/11 (⚠️ [F-5011] p. 2): FD 20 → J1 55, HD 210, J2 55 (solo telaio nascosto); FD 25 → J1/J2 50 o 120, HD 210;
FD 40 → J1/J2 60, 50 o 120, HD 210; la tabella prosegue con HD 80, 100 e 210 per montanti 80 e 100. Massa porta di
piano T2 CO 800 CH 2000, telaio 120 × 60, ante in lamiera: **81 kg**; chiusura a molla (T1 a contrappeso). Tipi: C2,
C4, C6, C8, T1, T2, T3, T4 con soglie 54 (C2, T1), 90 (C4, T2), 135 (C6, T3), 180 (C8, T4) (titoli dei disegni).

**Ricambi Fermator di rivenditori** (⚠️ rivenditore, pagine aperte oggi)

| Codice | Pezzo | Quote [mm] | Fonte |
|---|---|---|---|
| 603510789 | soglia di piano Alu, T2, CO 900 | 90 × 1390 × 30 | [DAV-603510789] |
| 603510787 | soglia di cabina VVVF rinforzata, T2, CO 900 | 90 × 1390 × 30 × 15 | [DAV-603510787] |
| 603510796 | soglia C2, CO 700 | 54 × 1440 × 30 × 14,7 × 1938 | [DAV-603510796] |
| 603510786 / 603510011 | soglia di piano / di cabina rinforzata, T3, CO 750 | 135 × 1455 × 30 | [DAV-603510786] [DAV-603510011] |
| 603510008 | «Door suspension 40/10», CO 1100, T2 dx | 540 × 139 × 15 (pezzo singolo, non l'intera sospensione) | [DAV-603510008] |
| — | rulli «aircord» | 47 × 8 × 8 e 64 × 9 × 8 (solo titoli) | [EQ-FERM] |

Le soglie confermano le regole dei disegni: 1390 = 1,5·900 + 40 e 1440 = 2·700 + 40 (⚠️ nostra aritmetica).

### 2.3 Wittur (con Sematic e Selcom)

Selcom è un marchio storico del gruppo Wittur (Selcom S.p.A., oggi Wittur S.p.A., Colorno: estratto di ricerca ⚠️
[WIKI-WITTUR]); su manualslib il catalogo Hydra Plus è indicato come «Selcom car door» ⚠️. La gamma Sematic 2000
(C-MOD, B-HR, B-G) e l'azionamento SDS stanno sul sito Wittur. Le pagine di Hydra, Hydra Plus, Fineline, Augusta EVO e
Hydra 3000 (non homelift) **non esistono più** su wittur.com (rimandano alla home), ma le famiglie compaiono nella
tabella di confronto di ottobre 2024.

**Tabella di confronto delle porte** (✅ [W-RANGE], SB.2.004180 Rev.6, ottobre 2024)

| Famiglia | Velocità impianto | Luce [mm] | Altezza [mm] | Pacchetto soglia C2 / T2 / T3 / C4 / C6 / T1 [mm] | Chiusura | Azionamenti |
|---|---|---|---|---|---|---|
| Augusta EVO | ≤ 3 m/s | 700–1100 | 2000–2200 | 110 / 190 / — / — / — / — | molla | ECO+ |
| Sematic 2000 C-MOD | ≤ 2 m/s | 600–1400 | 2000–2300 | 117 / 185 / 273 / 185 / — / — | spirator, contrappeso | SDS, ECO+, MIDI+ |
| Hydra | ≤ 6 m/s | 500–3200 | 2000–3500 | 180 / 210 / 256 o 302 / 210 / 302 / 180 | molla o contrappeso | ECO+, MIDI+, SUPRA |
| Pegasus | ≤ 10 m/s | 600–3200 | 2000–3800 | 180 / 210 / 303 / 210 / 302 / 180 | molla o contrappeso | MIDI+, SUPRA |
| Sematic 2000 B-HR | ≤ 10 m/s | 800–2400 | 2000–3000 | 200 / 265 / — / 265 / — / — | spirator, contrappeso (MED/TOP), molla (LOW) | SDS, SDS HV, SDS MV |
| Sematic 2000 B-G | ≤ 3 m/s | 1000–3500 | 2000–3500 | 165 / 255 / 345 / 255 / 345 / — | spirator, contrappeso | SDS, SDS MV |
| Fineline | ≤ 2 m/s | 600–900 | 1900–2100 | 85 / 115 / — / 115 (simm. e asimm.) / — / — | contrappeso | ECO+ |
| Hydra 3000 | ≤ 4 m/s | 600–1200 | 1900–2100 | 130 / 180 / 236 / 180 / — / — | molla (contrappeso opzione C2 e C4) | ECO+, MIDI+ |
| ECO BUS (porta di cabina a libro) | ≤ 2 m/s | 500–1100 | 2000–2100 | — / — / — / 130 / — / — | molla | ECO+ |

L'altezza utile «dipende dalla luce» (nota della tabella). Pacchetto soglia = porta di cabina + luce tra le soglie +
porta di piano. Conflitto: la brochure B-HR dà «up to 6 m/s» contro i 10 m/s della tabella (§ 6).

**Porta di cabina Hydra Plus (catalogo tecnico TC.2.001981.EN)** — ⚠️ copia su manualslib di un
documento Wittur [W-HP-TC]; il testo sovrapposto della pagina è stato riposizionato sullo sfondo del disegno per leggerlo

| Tipo | Luce | Larghezza GW | WS | Altezze | Profondità / altre quote | Massa porta di cabina (LH 2000) | Pagine |
|---|---|---|---|---|---|---|---|
| 02/C (C2) | PL 600–1800 | **GW = 2·PL + 50** (1250 … 3650, tutte le righe) | **WS = 2·PL** | HS = LH + HW (HW min 180); sommità HS + 210; motore HS + 385 (ECO) / HS + 465 (MIDI-SUPRA); LH + 145 | cassa motore 395 (ECO) / 505 (MIDI-SUPRA), 45; vista laterale 200 (31, 73), 170, 210; soglia 75; 47; 37; grembiule 750; foratura 974, 80, 100, viti M10 | ante standard 76 (PL 600) … 191 (PL 1800); ante in vetro 127 … 267 | 46–47 |
| 12/R-L (T2) | PL 600–1800 | **GW = 1,5·PL + 25** (925 … 2725) | **WS = 1,5·PL** | come 02/C | cassa 395/505; 45 a destra di GW (significato non indicato ⚠️); 200; 170; 210; soglia 90; binari 5/37/37; 750 | standard 76 … 190; vetro 119 … 258 | 44–45 |
| 32/R-L (T3) | PL 600–2100 | **GW = 4/3·PL + 25** troncato (825, 891, 958, 1025 … 2825) | 825, 885, 930, 1000, 1060, 1130, 1200, 1250, 1330 … 2800 (nessuna regola semplice) | — | — | ❓ (colonne presenti, non ricomposte) | 50–51 |
| 35/R-L (T3) | PL 600–1400 | stessa GW della 32/R-L (825 … 1891) | come 32/R-L | — | — | ❓ | 48–49 |

GM (lunghezza del gruppo motore) e P: colonne per operatori standard e semi-rinforzati/rinforzati, per esempio 02/C GM
1290 … 2690 (standard) e fino a 3630 (rinforzati); 12/R-L GM 1005 … 2035 (standard) e fino a 2730 (rinforzati). Il
testo sovrapposto non permette di attribuire con certezza ogni valore alla sua riga (celle unite) ⚠️. Nota del catalogo:
dove GM > GW (righe con asterisco) l'ingombro è dato da GM; per ante in vetro si usano sempre operatori rinforzati.

**Altre porte e azionamenti Wittur**

| Prodotto | Dato | Valore | Fonte |
|---|---|---|---|
| Sematic 2000 C-MOD (porta di piano e di cabina) | luce × altezza | 600–1400 × 2000–2300, a passi di 50; ECO+/MIDI+: 2Z, 2R, 2L, 4Z; SDS anche 3R/3L | ✅ [W-CMOD] p. 7 |
| C-MOD | altezza della traversa (porta di piano) | **240** (265 solo per 3RL) | ✅ [W-CMOD] p. 4 |
| C-MOD | montanti | scatolati 100 × 60 (opzione 120 × 60) | ✅ [W-CMOD] p. 4 |
| C-MOD | pacchetto soglia K (cabina) / S (piano) / totale, luce tra le soglie 28 | 2R/L 67/90/185 · 3R/L 110/135/273 · 2Z 37/52/117 · 4Z 67/90/185 | ✅ [W-CMOD] p. 4 |
| C-MOD | altezza dell'operatore di cabina | **345** (4Z, 2RL) · **407** (2Z) · **365** (3RL) (riferimento della quota non indicato ⚠️) | ✅ [W-CMOD] p. 5 |
| Sematic 2000 B-HR | luce | S/K 2R e 2Z 800–1400; S/K 4Z 1300–2200; altezza 2000–3000 | ✅ [W-BHR] p. 2 |
| B-HR | rulli superiori | Ø 84 esterno | ✅ [W-BHR] p. 5 |
| Hydra 3000 homelift | tipi, luce, altezza, soglia | 01/C–02/C (C2) soglia **50**; 11/R-L–12/R-L (T2) soglia **75**; CO 600–1200; CH 2000–2100 | ✅ [W-H3000] p. 3 |
| Hydra 3000 homelift | telaio delle ante | 180 sopra, 50 ai lati, 100 sotto; motore ECO+ o MIDI+ orizzontale | ✅ [W-H3000] p. 3 |
| AMD / AMDC (operatore per ammodernamento) | soglia → tipi e luci | 50: 0 L/R 600–1550, 1 C 700–1550 · 100: 2 L/R 700–1550, 3 C 1200–3000 · 150: 4 L/R 900–2100, 5 C 1800–4200; CH 1900–3000; anta singola ≤ 125 kg; velocità delle ante ≤ 1,0 m/s | ✅ [W-AMD] |
| Nettuno (azionamento sotto la soglia) | tipi, soglia, luce | 01/U–02/U soglia 75, CO 600–1800 · 71/RU-LU–72/RU-LU soglia 75, CO 600–1200 · 11/RU-LU–12/RU-LU soglia 120, CO 600–1800 · 41/U–42/U soglia 120, CO 600–3200; CH 1900–3500 | ✅ [W-NETT] |
| Nettuno porta di piano | campi e pacchetti | ≤ 3 m/s; CO 600–2000; CH 2000–3000; C2 180, T2 270, C4 270, T1 180 | ✅ [W-NETT-L] |
| Nettuno porta di cabina | masse mobili max | 300 kg (MIDI+) / 700 kg (SUPRA) | ✅ [W-NETT-C] |
| Luna (porta tonda) | luce, altezza | CO 600–1800; CH 2000–3000; ≤ 3 m/s | ✅ [W-LUNA] |
| Azionamenti ECO+ / MIDI+ / SUPRA | potenza, velocità max, massa max delle ante, IP | 80 W, 0,5 m/s, 130 kg, IP20 / 550 W, 0,7 m/s, 270 kg, IP20-IP54 / 900 W, 1,0 m/s, 600 kg, IP20-IP54; 127/230 Vca ± 20 %, 50/60 Hz | ✅ [W-MIDI] |
| ECOx Smart Drive | motore, alimentazione, massa ante, IP | PMSM trifase; 90–264 Vca 50/60 Hz o 48 Vcc; 130 kg; IP20 | ✅ [W-ECOX] |

Per Hydra (porta di piano), Fineline, Augusta EVO, Pegasus, B-G e Sematic 2000 B: nessuna lunghezza di sospensione né
profondità sono pubblicate oggi (le quote Sematic 2000 B del file 14 vengono da copie igilift non più apribili ⚠️).

### 2.4 Prisma

| Famiglia | Dato | Valore | Fonte |
|---|---|---|---|
| Linee di prodotto 2026 | applicazioni | P100 (spazi ridotti e ammodernamenti), P300 (residenziale), P500 (passeggeri), P700 (merci), P900 (alte prestazioni) | ✅ [PR-BOARD] |
| MICRO (cabina, operatore a cinghia, Drive FOX 230 Vca o DC) | ante, luce × altezza max | 1, 2, 3, 4 ante, centrali o telescopiche; 1100 × 2300 | ✅ [PR-MICRO] |
| MICRO / Serie Q | versioni e rulli | Slim Ø 44 con guide 40 × 10; Medium Ø 67 con 40 × 10; Large Ø 67 con 40 × 10 rinforzate; versione heavy-duty e hi-rise Ø 90 con guide 70 × 14 | ✅ [PR-MICRO] [PR-Q] |
| MICRO 75 (cabina) | soglia | da 90 a **75**; 2 ante telescopiche e 4 centrali; luce ≤ 1100 | ✅ [PR-MICRO75] |
| MICRO MS40 (cabina) | profilo soglia | da 90 a **40**; luce ≤ 1100 | ✅ [PR-MS40] |
| MICRO Mini-Sill | ingombro | **25** per canale di scorrimento; ≤ 1100 × 2300 | ✅ [PR-MINISILL] |
| MACRO (cabina) | versioni, luce × altezza | Medium e Large; 1–6 ante; 3300 × 2800 | ✅ [PR-MACRO] |
| SINUS (cabina, operatore a braccio trifase) | luce × altezza | Slim/Medium/Large; 1–6 ante; 2500 × 2500 | ✅ [PR-SINUS] |
| Serie Q (piano) | ante, luce × altezza | 1, 2, 3, 4, 6 ante; 3200 × 2800; versioni E120, EW30, EW60, EI | ✅ [PR-Q] |
| Q75 / Q50 (piano) | soglia e meccanismo | da 90 a **75** / a **50**; luce ≤ 1150; Q50 anche 4 ante asimmetriche | ✅ [PR-Q75] [PR-Q50] |
| F22 (piano) | luce, altezze | ≤ 1200; 2000 e 2100; E120, EW60 | ✅ [PR-F22] |

Lunghezza, profondità, altezza e massa di operatori e sospensioni: ❓ (catalogo tecnico con login; configuratore
DigiPara).

### 2.5 Dapa (Roma)

Cataloghi tecnici ufficiali, disegni scansionati con tabelle (✅ [DAPA-LOWER] [DAPA-PARVA] [DAPA-MICRON]). Gamma LOWER:
porte di piano DS01D/S (1 anta), DS02C (C2), DS02D/S (T2), DS03D/S (T3), DS04C (C4), DS06C (C6); operatori di cabina
DOPM (a braccio) e DOPE (elettronici). Soglie standard in alluminio, tutte alte 35: 50 e 70 (una gola), 75 e 90
(due gole), 115 (tre gole); gola 12,5 ([DAPA-LOWER] pp. I/02 e A/02).

| Prodotto | Tipo | Luce AP | Lunghezza (tabella «C») | Soglia | Altezze | Profondità e altro | Massa | Pagina |
|---|---|---|---|---|---|---|---|---|
| DOPE2D/2S (cabina, LOWER) | T2 | 600–1200 | 947, 1022, 1097, 1172, 1247, 1322, 1397, 1472, 1547, 1598, 1622, 1772, 1847 → **1,5·AP + 47** salvo AP 1050 e 1100 (⚠️ probabili refusi); «C con extracorsa + 20» | 1,5·AP + 20; larghezza 75 | operatore alto **290**; sotto l'operatore «luce porta + 180» | profondità **217** (100); pianta 312; foratura del tetto 780 × (105 + 65), Ø 10,5; ante 5/30/30/5; luce tra le soglie 30–35; soglia di piano 37,5; grembiule 750 | ❓ | D2T.2 (p. 9) |
| DOPE2C (cabina, LOWER) | C2 | 600–1200 | 1250 … 2450 → **2·AP + 50** | 2·AP + 40; larghezza 50 | **290**; luce + 180 | **217** (100); pianta 300; foratura 325 + 325, Ø 10,5 | «Peso kg» 30, 30,5, 31, 32, 32,5, 33, 35, 35,5, 36, 37, 37,5, 38,5, 40 (con o senza ante: non detto ⚠️) | D2C.1 (p. 22) |
| DS02D/S (piano, LOWER) | T2 | 600–1200 | 924,5 … 1824,5 → **1,5·AP + 24,5** | 1,5·AP + 20; 75 + 6 | **265** dalla sommità della luce alla sommità dell'assieme, staffa compresa (lettura ⚠️); 245 (variabile, nota «**» ⚠️); 159,5; 60; 115 max | 135; 20÷25; 140 max sotto soglia; montanti 120 (variabili 80–200); **foro grezzo AP + 300**; 163 | ❓ | P2T.1 (p. 5) |
| DS02C (piano, LOWER) | C2 | 600–1200 | 1248 … 2448 → **2·AP + 48** | 2·AP + 40; 50 + 6 | **280** dalla sommità della luce alla sommità della sospensione, più 100 di staffa (lettura ⚠️); 246; 159,5 | 30, 60; 37,5; 75; 140 max; montanti 120 (80–200); foro grezzo AP + 300 | ❓ | P2C.1 (p. 19) |
| PARVA SP2C (piano) | C2 | 600–900 | 1280 … 1880 → **2·AP + 80**; ingombro totale con dime C + 40 | 2·AP + 50; soglia 25 | piastra 348 | 20 a muro; 25; 35; 235; 163 | ❓ | SP2C.1 |
| PARVA SP2T (piano) | T2 | 600–900 | 958 … 1408 → **1,5·AP + 58**; totale C + 80 | 1,5·AP + 50; soglia 50 (ante 20 + 20) | piastra 277 | 20; 250; 48; 163 | ❓ | SP2T.2 |
| MICRON cabina 2 ante centrali | C2 | 500 e 550 | 1050 e 1100 | 50 (anche 70 o su misura) | **309**; luce + 215 | **217** (100); pianta 300; foratura 280 + 280 | 27 e 30 kg **senza ante** | p. 2 |
| MICRON cabina 2 ante telescopiche | T2 | 500 e 550 | 800 e 850 (+ 20 con extracorsa) | 1,5·AP + 20; 75 | **309**; luce + 215 | **217**; pianta 314; foratura 475 | 32 e 34 kg senza ante | O2TS.1 (p. 5) |

Le regole «a·AP + b» sono nostra aritmetica esatta sulle righe della tabella (⚠️ solo per la forma, i valori sono ✅).
Dal file 14 (⚠️ rivenditori): operatori LOWER T2 soglia 75/90 e C2 50/70; sospensioni PARVA C2 soglia 25 e T2 50.

### 2.6 CMM (Mezzago)

| Dato | Valore | Fonte |
|---|---|---|
| porte automatiche a soglia ridotta per ammodernamenti | 2AT, 3AT e 4AC, luce 600–1100 | ✅ [CMM-RS] |
| soglia | 2AT e 4AC **60**; 3AT **90** | ✅ [CMM-RS] |
| opzioni | telai di spessore speciale e montanti ridotti; finestra; controllo VVVF | ✅ [CMM-RS] |
| lunghezza, profondità, altezza, massa | ❓ | — |

### 2.7 Riepilogo delle regole di lunghezza e delle quote utili al disegno

| Costruttore e prodotto | Tipo | Operatore di cabina | Soglia | Sospensione di piano | Sommità sopra la luce | Profondità dell'operatore |
|---|---|---|---|---|---|---|
| 2SG FLY | T2 | 1,5·A (+10 max) ✅ | 1,5·A + 20 (+40) ✅ | — | HLP + 475 ✅ | 220 ⚠️ (lettura) |
| 2SG FLY | C2 | 2·A (+20 max) ✅ | 2·A + 20 ✅ | — | HLP + 475 ✅ | 220 ⚠️ |
| 2SG FLY/LIKE | T3 | 4/3·A + 10 ✅ | 4/3·A + 20 (+40) ✅ | — | HLP + 510 ✅ | 220 ⚠️ |
| 2SG OP93 | T2 | 1,5·A + 45 max ✅ | 1,5·A + 20 (+40) ✅ | — | colonna E | max 260 ✅ |
| 2SG I92 | T2 / C2 | — | 1,5·A + 20 / 2·A + 20 ✅ | ❓ (non quotata) | HLP + 270 ⚠️ | — |
| Fermator 40/10 PM | T2 / C2 | 1,5·PL + 50 / 2·PL + 50 ⚠️ (copia) | 1,5·PL + 40 / 2·PL + 40 ⚠️ | — | HL + 340 / HL + 350 ⚠️ | 120–144 sul disegno; staffe 183–280 ⚠️ |
| Fermator 50/11 | T2 / C2 | — | 1,5·CO + 40 / 2·CO + 40 ⚠️ | 1,5·CO + 100 / 2·CO + 100 ⚠️ | CH + 265 ⚠️ | — |
| Wittur Hydra Plus | T2 / C2 / T3 | GW 1,5·PL + 25 / 2·PL + 50 / 4/3·PL + 25 (o GM se maggiore) ⚠️ | WS 1,5·PL / 2·PL ⚠️ | — | HS + 385 (ECO) / HS + 465 (MIDI-SUPRA), HS = LH + HW, HW ≥ 180 ⚠️ | 200 ⚠️ |
| Dapa LOWER | T2 / C2 | 1,5·AP + 47 / 2·AP + 50 ✅ | 1,5·AP + 20 / 2·AP + 40 ✅ | 1,5·AP + 24,5 / 2·AP + 48 ✅ | operatore: luce + 180 + 290 (⚠️ somma); sospensione 265 / 280 (⚠️ lettura) | 217 ✅ |
| Dapa PARVA | T2 / C2 | — | 1,5·AP + 50 / 2·AP + 50 ✅ | 1,5·AP + 58 / 2·AP + 80 ✅ | piastra 277 / 348 ✅ | — |
| Wittur C-MOD | tutti | ❓ | ❓ | ❓ | traversa di piano 240 (265 3RL); operatore 345–407 ✅ | ❓ |
| Prisma, CMM | tutti | ❓ | ❓ | ❓ | ❓ | ❓ |

## 3. Limitatori di velocità

### 3.1 PFB (Modena)

Prestazioni dalla brochure-catalogo [PFB-BR] e dalle pagine prodotto [PFB-W]; quote dai disegni dei manuali d'uso
[PFB-MLK] [PFB-MR1] [PFB-MR356] [PFB-MR1012] [PFB-MLKT] [PFB-MLXM]; masse dal rivenditore [EQ-*] (⚠️). Nei disegni LX e
LKT il diametro è scritto come «Ø esterno (ØP primitivo)»: per esempio LX200 «Ø207 (ØP 200)».

| Modello | Senso | Puleggia (fune) | Ø esterno / seconda gola (disegno) | Vn max [m/s] | Vint [m/s] | H totale | Asse dalla base | Base, fori | Fronte × profondità | Massa (riv. ⚠️) | Fonte quote |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| LX120 | bi | 120 (6–6,5 in deroga) | 125 (ØP 120) | 2,00 | 0,20–2,30 | **178** (70,5 + 108,0) | **70,5** | asole n° 2 × 12, interasse 85 | larghezza **146** (brochure «L: 146»); profondità 71 (63) | ❓ | [PFB-MLK] p. 64 · [PFB-BR] p. 10 |
| LK120 | bi | 120 (6–6,5 in deroga; «4 standard» solo nel file 13 ⚠️) | 125 (ØP 120) | 2,00 | 0,20–2,30 | **270** (71 + 199) | **71** | base 120; asole n° 2 × 12, interasse 85 | piastra 180; profondità 71 (63) | ❓ | [PFB-MLK] p. 63 |
| LX150 | bi | 150 (6–6,5 in deroga) | 155 (ØP 150) | 2,34 | 0,21–2,70 | **274** (86 + 188) | **86** | base 140; asole n° 2 × 12, interasse 85 | profondità 76 (68) + 39 | ❓ | [PFB-MLK] p. 65 |
| LX180 | bi | 180 (6 std; 6,5 in deroga) | 185 (ØP 180) | 2,17 | 0,25–2,50 | **322** (107 + 215) | **107** | base 140; asole n° 2 × 12, interasse 85 | profondità 76 (68) + 38 | ❓ | [PFB-MLK] p. 66 |
| LX200 | bi | 200 (6–6,5) | 207 (ØP 200) | 2,30 | 0,20–2,66 | **349** | **110** (120 dall'asse alla sommità del carter) | asole n° 2 × 16, interasse 130 | larghezza 190; profondità 76 (68) | ❓ | [PFB-MLK] p. 67 |
| LK200 | bi | 200 (6–6,5) | 207 / (vedi nota) | 1,48 | 0,32–1,70 | **230 o 415** (due esecuzioni, non spiegate); riv. 370 ⚠️ | **165** | quote della base: 188, 170, 156 (vista laterale) e 143, 140 (vista dal basso); fori n° 4 + 2 Ø 14; 16; 21,5; 14 | piastra frontale 165; larghezza del telaio lungo l'asse 78/116 | 12 | [PFB-MLK] p. 68 · [EQ-LK200] |
| LK250 | bi | 250 (6–8) | 257 | 1,74 | 0,32–2,00 | come LK200 | 165 | come LK200 | come LK200 | ❓ | [PFB-MLK] p. 68 |
| LK300 | bi | 300 (6–8) | 307 | 2,93 | 0,40–3,37 | come LK200; riv. 370 ⚠️ | 165 | come LK200 (riv.: base 165 × 220 ⚠️) | come LK200 | 14 | [PFB-MLK] p. 68 · [EQ-LK300] |
| LK315 | bi | 315 (8–10) | 315 | 2,81 | 0,40–3,24 | come LK200; riv. 370 ⚠️ | 165 | riv.: base 130 × 220 ⚠️ | come LK200 | 14 | [PFB-MLK] p. 68 · [EQ-LK315] |
| R1 / R1LR | mono (R1) o bi (R1LR) | 300 (6–8) | 307 / 220 | 2,23 | 0,41–2,57 | **294–344** | **190,5** | base **285** (23,5 + 238 + 23,5), asole n° 2 × 16; profondità di base 80 | — (gola 30° R1, 40° R1LR) | R1-LR 9,5 | [PFB-MR1] p. 63 · [EQ-R1LR] |
| R1 200 | bi | 200 (6–6,5) | 207 / 143 | 1,83 | 0,30–2,11 | 294–344 (stesso disegno) | 190,5 | come R1 | — (gola 40°) | ❓ | [PFB-MR1] p. 63 · [PFB-BR] p. 21 |
| R1 250 | bi | 250 (6–8) | 257 / 183 | 1,96 | 0,31–2,25 | 294–344 | 190,5 | come R1 | — (gola 40°) | ❓ | [PFB-MR1] p. 63 · [PFB-BR] p. 21 |
| R3LR (nel manuale: R3) | bi (brochure) | 250 (6–8 brochure; «Ø6–6,5» nel disegno R3 ⚠️) | 255 / 183 | 1,73 | 0,43–2,00 | **348** | **157** | base **196** (20,5 + 155 + 20,5), asole n° 2 × 13 | profondità 100 / 115 | ❓ | [PFB-MR356] p. 65 · [PFB-BR] p. 22 |
| R5 | mono | 200 (6–6,5) | 200 / 143 | 1,55 | 0,24–1,78 | **261** | **120** | **150 × 204** (fori n° 2 Ø 16 a 110; 156) | profondità 98 | 10 | [PFB-MR356] p. 65 · [EQ-R5] |
| R5R | mono | 200 | 200 / 143 | 1,55 | 0,24–1,78 | **256** | **115** | base 170 (fori n° 2 Ø 14 a 140) | profondità 98 | ❓ | [PFB-MR356] p. 66 |
| R5RA | mono | 200 | 200 / 143 | — | — | **282** | **115** | base 170 (140); attacco superiore Ø 8,5 | — | ❓ | [PFB-MR356] p. 66 |
| R5S | mono | 200 | 200 | — | — | **374** | **126** | base 170 (140), Ø 14 | — | ❓ | [PFB-MR356] p. 67 |
| R5SP | mono | 200 | 200 / 143 | — | — | **292,5** | **151,5** | base **360** (41 + 278 + 41), fori n° 2 Ø 16 | profondità 98 | ❓ | [PFB-MR356] p. 67 |
| R6 | mono | 300 (6–8) | 300 / 220 | 2,09 | 0,44–2,40 | **335** | **168** | **150 × 238** (fori n° 2 Ø 16 a 110; 188) | — | 16 | [PFB-MR356] p. 68 · [EQ-R6] |
| R6R | mono | 300 | 300 / 220 | 2,09 | 0,44–2,40 | **330** | **163** | base 170 (fori n° 2 Ø 14 a 140) | profondità 116 | ❓ | [PFB-MR356] p. 68 |
| R6SP | mono | 300 | 300 / 220 | — | — | **333** | **166** | base **420** (20 + 380 + 20) × 106, fori n° 2 Ø 14 | profondità 116 | ❓ | [PFB-MR356] p. 69 |
| R10BF (a bloccaggio fune) | mono | 315 (8–10) | 315 | 2,35 | 0,50–2,70 | **488** | **303** | **460 × 196** (fori n° 4 Ø 13, interassi 300 e 162) | fronte 400; profondità 191 | 31 | [PFB-MR1012] p. 65 · [EQ-R10BF] |
| R12BF (a bloccaggio fune) | mono | 345 (8–10); **340** sul disegno; 346 dal riv. ⚠️ | 340 | 4,00 | 1,00–5,06 | **524** | **337** | **520 × 116** (fori n° 2 Ø 13 a 490; 106) | fronte 408 (198 + 210); profondità 144 (124) | 32 | [PFB-MR1012] p. 66 · [EQ-R12BF] |
| LKT120 (limitatore + tenditore a peso, fossa) | bi | 120 (Ø 4 o Ø 6–6,5) | 125 (Øp 120) | 2,00 | 0,20–2,30 | **(737)** complessiva | — | base 328 (n° 2 Ø 16 a 75 + 75); 368/328/305 × 103/83; n° 4 + 4 Ø 8,5 | larghezza contrappeso 348; profondità 103 + 31 | ❓ | [PFB-MLKT] p. 52 · [PFB-BR] p. 15 |
| LXM120 (limitatore + tenditore a molla) | bi | 120 (6/6,5 IWRC, rottura ≥ 25,9 kN) | — | 2,00 | 0,20–2,30 (brochure); il manuale limita il tenditore a 2,00 ⚠️ | ❓ | — | **300 × 88**, fori Ø 12,5 a 270 | — | ❓ | [PFB-MLXM] p. 10 · [PFB-BR] p. 14 |

Note PFB (✅ salvo dove segnato):
- **Asse**: il disegno unico LK200–LK315 mette l'asse a 165 dalla base per tutte e quattro le taglie e dà l'altezza
  «230/415» senza dire quale esecuzione sia quale. Il rivenditore dà 370 per LK200, LK300 e LK315 ⚠️ (§ 6).
- **Seconda gola**: le coppie 207/143, 257/183 e 307/220 (R1, R5, R6) e 255/183 (R3) sono due diametri della stessa
  puleggia; che il minore sia la gola di prova è nostra lettura ⚠️. Il disegno LK elenca anche Ø 220, 183, 143, 125 e
  86 senza attribuzione.
- **Opzioni (brochure, matrice per modello)**: LX120 gola di prova e gola indurita incluse, comando a distanza IP50, UCM,
  carter, antiscarrucolamento e piastra di fissaggio alla guida disponibili, encoder non disponibile; LK200 tutto
  disponibile salvo piastra alla guida; R1 e R1LR gola di prova inclusa, comando a distanza, encoder e UCM non
  disponibili; R5 e R6 gola di prova inclusa, comando a distanza disponibile, encoder, UCM, gola indurita e piastra
  alla guida non disponibili. Le foto della brochure mostrano esecuzioni con «contatto a riarmo a distanza» (LX120, LK200).
- **Tensioni di comando e riarmo a distanza** (⚠️ rivenditore [EQ-LK200]): standard 24 Vcc «Remote Trip/Reset» IP50;
  12 Vcc/Vca, 24 Vca, 48, 110 Vcc/Vca, 230 Vca a richiesta.
- **Posa**: LX con piastra alla guida (vano); LKT120 e LXM120 in fossa (a pavimento o su staffa alla guida, spinta ≥ 2 kN);
  R5 anche «da appendere» (file 13). Manuali: piano di posa ≥ 2 kN agli inserti (file 13 ⚠️).

### 3.2 Montanari Giulio & C.

Sito bloccato da qui. Restano i dati del file 13 (estratti di ricerca, ⚠️) e tre articoli di rivenditore aperti oggi.

| Modello | Puleggia Ø (fune) | Vn [m/s] | Dati costruttivi | Quote e massa | Fonte |
|---|---|---|---|---|---|
| RQ-A 200 / 250 / 300 | 200 (6–6,5) / 250 / 300; famiglia 6 – 6,5 – 8 | famiglia 0,15–3,0 | mono o bi; istantaneo o progressivo; bobina integrata; ripristino a distanza del contatto; posa con o senza locale, anche capovolto; base stretta o standard; versione ribassata RQ-A 200 H 300 | manuale: A/øD/øP 220/210/150, 270/260/185, 320/310/225 (lettere non definite) | ⚠️ [13] § 8 |
| RQ250 (rivenditore) | 250 | Va 1,3 | sgancio a distanza 48 V | **A 270 · B 230 · C 370**; **14,12 kg** (lettere non definite) | ⚠️ [ES-6790043] |
| RQ300 A destro, base standard | 300 | Ts 1,4 | — | **A 325 · B 230 · C 370**; **13,74 kg** | ⚠️ [ES-6790117] |
| RH300 | 300 | Ts 1,4 | gamma RG-RH (95/16/CE) | **A 290 · B 237 · C 350**; **14,82 kg** | ⚠️ [ES-6790047] |
| NOR | 300 con gola di prova (6 – 8) | 0,30–1,50 | mono o bi; arpione; capovolto | interasse/cerchio fori 219 | ⚠️ [13] § 8 |
| RC (centrifugo) | 200 – 300 (6 – 6,5 – 8) | 1,60–4,2 | mono o bi; istantaneo o progressivo | base stretta; interasse/cerchio fori 132 | ⚠️ [13] § 8 |
| RG 200 | 200 (6–6,5) | 0,15–0,30 | gamma RG-RH | — | ⚠️ [13] § 8 |

### 3.3 Dynatech — venduto in Italia da Donati (VEGA, STAR, QUASAR, LBD-200, A3: titoli [DON-LIST] ⚠️)

| Modello | Puleggia (fune) | Vn | Vint | Quote | Altro | Fonte |
|---|---|---|---|---|---|---|
| VEGA 200 | Ø 200 (6 / 6,3 / 6,5) | 0,1–2,40 | max 3 (manuale) · 0,40–2,87 (riv.) ⚠️ conflitto; 0,4–0,7 mono, 0,7–2,87 bi | **H 332**; asse **199,5**; telaio 200, totale 230; profondità 135 (base 117); piastra 200 × 117, asole 10,2 × 20 a interasse 80; 20,5 / 81,5 | tenditore fissato alla guida con flange; comando a distanza e sistema di parcheggio opzionali | ⚠️ [EQ-VEGA200-M] pp. 13, 16–17 (manuale Dynatech «VEGA instructions» rev. 03, copia del rivenditore) · [EQ-VEGA200] |
| VEGA 300 (A3) | Ø 300 (6 / 6,5 nel manuale) | 0,1–3,4 | max 4,2; 0,5–0,8 mono, 0,8–4,2 bi | **H 349,5**; telaio 220; base 330 / 314 × 152; profondità 133 (42,54); fissaggio: asole 10,2, interassi 100; gola 40°, 18, 4, 2, 8,51 (disegno DYN 53.C01.00) | anti-deriva 24/48/190 Vcc + sensore induttivo; sgancio a distanza opzionale 24/48/190 Vcc; puleggia di prova opzionale | ⚠️ [EQ-VEGA300-M] pp. 11–13 · [EQ-VEGA300] |
| STAR (sul tetto o sotto la cabina, senza contrappeso) | Ø 200 (6) | 0,1–2,3 | max 2,66; 0,35–0,66 solo discesa | ❓ | tensione della fune circa 45–85 kg (manuale) | ⚠️ [EQ-STAR] · [EQ-STAR-M] |

### 3.4 Wittur

| Modello | Senso | Vn [m/s] | Corsa max [m] | Forza frenante min [N] | Fune Ø | Puleggia Ø | UCM | Fonte |
|---|---|---|---|---|---|---|---|---|
| OL20 (MR e MRL) | uni | 0,30*–1,75 | 60 | ≥ 300 | 6 | 180 | — | ✅ [W-SAFETY] p. 7 |
| OL35 / OL35E / OL35M | uni | 0,30–3,00 | 165 | 500 / 800 / 1100 | 6 / 6,5 / 8 | 200 / 203 / 262 | — | ✅ [W-SAFETY] p. 7 |
| EOS e EOS 300 (elettronico, SIL3) | uni e bi | 0,15–2,50 | 120 | 500 / 800 | 6 / 6,5 / 8 | 200 / 300 | sì | ✅ [W-SAFETY] p. 7 |
| OL100 (freno della fune esterno) | uni | 0,51–10,00 | 150 / 400 | 1100 / 2100 / 2900 | 8 / 10 | 304 | — | ✅ [W-SAFETY] p. 7 |

\* 0,15 m/s possibile per la direttiva macchine. Base di appoggio dell'OL20: 125 × 190, interasse 130, asola 13 × 40,
viti M10 (46 Nm) / M12 (80 Nm); collare ≥ 50 sopra il solaio (⚠️ [W-OL20], copia manualslib). OL35 «anche in fossa» (foto
della brochure ✅ [W-SAFETY] p. 15). Ingombri, masse e altezza dell'asse: ❓.

### 3.5 Bode Components (Düsseldorf)

| Modello | Puleggia Ø (fune) | Vint [m/s] | Esame UE | Quote del disegno | Massa | Opzioni | Fonte |
|---|---|---|---|---|---|---|---|
| GB 7 | 300 (6–8); Ø 310 sul disegno | 0,70–3,43 | EU-OG 068 | **H 360**; asse **205**; base 325, fori a interasse 180, asole 14 × 11; profondità 165; ingombro in pianta ca. 412,5; ca. 57; + 250 con anti-deriva / + 200 con sgancio a distanza | **15 kg** | gola di prova; sgancio a distanza 12/24 Vcc, 110/230 Vca; UCMP (A3) 12/24 Vcc, 230 Vca; ripristino elettrico 230 Vca; pre-interruttore da Vn 1,01 | ✅ [BODE-BR] · ⚠️ [EQ-BODE7] (disegno Bode ospitato dal rivenditore) |
| GB 8 | 200 (6–6,5); Ø 210 e Ø 147 sul disegno | 0,50–2,04 (brochure); il disegno «8-ASV» dice 0,50–1,49 ⚠️ | EU-OG 069 | **H 315**; asse **205**; base 221,04; fori a interasse **160** (posa standard) o **210** (posa appesa); 180, 130, 90, 65; centro fune 100 e 45; profondità 170 (140); 187; 115; + 250 / + 200 come GB 7 | **13 kg** | come GB 7 | ✅ [BODE-BR] · ⚠️ [EQ-BODE8] |
| GB 9 | 300 (6–8) | 0,50–0,70 | EU-OG 084 | ❓ | ❓ | come GB 7 | ✅ [BODE-BR] [BODE-GB] |

Accessori ✅ [BODE-BR] [BODE-GB]: mensola per fissare il limitatore alla guida (art. 10100022); piastra adattatrice per
interassi dei fori 171–185 e 134–148; kit fine corsa di vano «altezza 500» fino a Va 1,5. Presenza commerciale in Italia:
❓ (non verificata).

### 3.6 Altri limitatori venduti in Italia (catalogo Donati, solo titoli ⚠️ [DON-LIST])

| Marca | Modelli visti | Dati dai titoli |
|---|---|---|
| ALJO | 2128 (Ø 200 e Ø 300), 2129 | 2128.ESA2 Ø 200 Vn 0,50 / Ve 0,70, riarmo manuale; 2128.BMSA3 Ø 300 discesa Vn 1,00 / Ve 1,40; 2129.TK230 Ø 200, 230 V, 0,60–0,95 m/s |
| Gervall | «Europa» Ø 200 / Ø 300, modello 60 (T-60), 20.200 | 20B.301HB Europa Ø 300 gola indurita, discesa, riarmo manuale; 12.061 T-60 Ø 200 due gole Vn 1; 20.245 Ø 200 Vn 1 |
| MP | 7101 / R7101 | BD Ø 200 e Ø 300 |
| Luezar, Nork, Guillermo Fabián, Mac Puarsa | limitatori e ricambi | Luezar Vn 1 e 1,6 m/s; limitatori «a cinghia» 190/230 Vcc |
| Otis, Schindler, Kone, Orona, Thyssen | ricambi originali | — |

## 4. Tenditori

### 4.1 PFB

| Modello | Tipo | Pulegge Ø | Contrappesi | Fissaggio | Quote del disegno | Fonte |
|---|---|---|---|---|---|---|
| R4MC | a molla, compatto | 120, 150, 180, 200 (brochure); 120–300 (manuale) | — (intervento ≤ 2 m/s) | a pavimento o su staffa alla guida (2 morsetti T2-M12 o T3-M14) | base 300 × 67, fori Ø 13 a 270 (Ø 120); 370 × 67 a 340 (Ø 150–200); 470 × 67 a 440 (Ø 250–300) | ✅ [PFB-BR] p. 28 · [PFB-MR4MC] p. 10 |
| R4M / R4MR 120 / R4MS | a molla | 120, 150, 180, 200 | — (≤ 2 m/s) | pavimento o guida: 2 fori Ø 12 nella guida e 4 morsetti | ❓ | ✅ [PFB-BR] p. 29 · [PFB-MR4M] |
| R4K (interno /I o esterno /E, a leva) | orizzontale | 120–315 (brochure); 150–315 (manuale) | 5, 10, 13, 22 | alla guida | piastra 300 × 160, asole n° 2 × 15 a 100; 175; 257; 27,5; 310; 57,5; 162,5; 192,5; 279 max × 178 max × 80 max accanto al contrappeso (blocco del peso: lettura ⚠️); 34; 45; 15°; 30; 38; 9,2; (112,3) | ✅ [PFB-BR] p. 30 · [PFB-MLK] p. 69 |
| R4X (corto) | orizzontale | 120–315 | 10, 30, 40 | alla guida | (257) + (215) + (219); 490; 227; 222,5; 20,5; 20; piastra 300 × 160 (100); asole n° 2 × 15; 192,5; 30; altezze 224, 103, 48, 6 | ✅ [PFB-BR] p. 31 · [PFB-MLK] p. 69 |
| R4SR 120 (ultra corto) | orizzontale | 120 | 5, 13 | alla guida | (286,9) + (222,2) + (86); 230; 77; 45; 26; 250 × 172 accanto al contrappeso (lettura ⚠️); 48; 35; asole n° 2 × 16,5; 68; 12,5; 50/55/50/45; 30; laterale 87,5, 51,4, 13,5 | ✅ [PFB-BR] p. 32 · [PFB-MLK] p. 69 |
| R4VS (sottile) | verticale | 120, 150, 180, 200 | 30, 60 | a pavimento (anche alla guida, brochure) | base 102 × 226 (30 kg) o 135 × 226 (60 kg), fori a 91 e 118; altezze 659 / 646 / 626; asse a 318 | ✅ [PFB-BR] p. 33 · [PFB-MLK] p. 70 |
| R4T (compatto) | verticale | 120–315 | 30, 60 | a pavimento o alla guida | Ø 250–315: larghezza 375/340, altezza complessiva (891), 440 + 284, (593), laterale 103, 107,5 + 150 + 107,5 · Ø 120–200: 315/297, (775), 380 + 284, (533), base 365 × 134 (103) | ✅ [PFB-BR] p. 34 · [PFB-MLK] p. 70 |
| R4R | verticale | 120–315 | 13, 22, 30, 44 | alla guida | piastra 257 × 160 (27,5 + 175), asole n° 2 × 15 a 100; 222,5; (180)/126; 265; 290 max × 200 max × 114 max accanto al contrappeso (lettura ⚠️); 40; 87,5; 25,5; 17; 8 | ✅ [PFB-BR] p. 35 · [PFB-MLK] p. 69 |
| R4V | verticale | 120–315 | 30, 60, 104 | a pavimento | larghezza 340; asse a **455** dal pavimento; 343; 290 × 200 sul blocco del contrappeso (lettura ⚠️); base 200 × 200 (n° 4 Ø 15 a 160) / 250; laterale 71,4 / 51; sommità sopra l'asse 64,3 … 166 secondo il Ø | ✅ [PFB-BR] p. 36 · [PFB-MLK] p. 70 |

Rivenditore (⚠️): R4T 200/300/315 in kit a pavimento con 60 kg; R4V 200/300/315 con 30, 60 o 104 kg, interruttore IP50
[EQ-R4T] [EQ-R4V]; R4M Ø 200 a pavimento o alla guida [EQ-R4M]; «R4KE» 700 × 330 × 113, 26,52 kg e d = 300 820 × 415 ×
115, 18,36 kg (file 13 ⚠️).

**Tenditori abbinabili (contrappeso in kg; ↓ = intervento solo in discesa, ↓↑ = nei due sensi)** — ✅ [PFB-BR], pagine
viste come immagine salvo dove segnato

| Limitatore | R4MC / R4M | R4X | R4T | R4R | R4V | R4VS | R4SR | R4K |
|---|---|---|---|---|---|---|---|---|
| LX120, LK120 | molla | 10 / 30 | 30 / 60 | 13 / 30 | 30 / 60 | 30 / 60 | 5 / 13 | 5 / 13 |
| LX150, LX180, LX200 | molla | 10 / 30 | 30 / 60 | 13 / 30 | 30 / 60 | 30 / 60 | — | 5 / 13 |
| LK200 | molla (R4M solo ↓) | 30 / 40 | 60 ↓ | 30 / 44 | 60 / 104 | 60 ↓ | — | 13 / 22 |
| LK250 (LK300, LK315 dall'ordine del testo ⚠️) | — | 30 / 40 | 60 ↓ | 30 / 44 | 60 / 104 | — | — | 13 / 22 |
| R1LR, R1 200, R1 250 (tra parentesi R1 monodirezionale); R3LR uguale dall'ordine del testo ⚠️ | — | 30 / 40 (R1: 10 ↓) | 60 ↓ (R1: 30) | 30 / 44 (R1: 22 ↓) | 60 / 104 (R1: 30 ↓) | — | — | 13 / 22 (R1: 10 ↓) |
| R5 | molla | 10 ↓ | 30 ↓ | 22 ↓ | 30 ↓ | 30 ↓ | — | 10 ↓ |
| R6 (R10, R12 dall'ordine del testo ⚠️) | — | 10 ↓ | 30 ↓ | 22 ↓ | 30 ↓ | — | — | 10 ↓ |

### 4.2 Montanari Giulio & C.

| Modello | Tipo | Puleggia Ø | «Weight/Peso» | Dati | Fonte |
|---|---|---|---|---|---|
| TEV200 / TEV250 / TEV300 | verticale, monodirezionale, ghisa, fissaggio a terra | 200 / 250 / 300 | 29 / 30 / 30 kg | contatto a riarmo manuale o automatico | ⚠️ [13] § 8 |
| TEV250 + AC00000551 · TEV300 + AC00000251 | verticale, monodirezionale, fissaggio a pavimento | 250 · 300 | 30 kg | (titoli del rivenditore aperti oggi) | ⚠️ [DON-TEV250] [DON-TEV300] |
| TEV200BD / TEV250BD | verticale, bidirezionale | ❓ | 85 kg | — | ⚠️ [13] § 8 |
| TEL20 (per RQ-A200 in fossa, bidirezionale) | ❓ | ❓ | 65 kg; «Weights: 4» | reset automatico/manuale | ⚠️ [13] § 8 |
| orizzontali Ø 200 / 250 / 300 (codici Donati TE00000820/825/830) | orizzontale, mono | 200 / 250 / 300 | «223N» | — | ⚠️ [13] § 8 |

### 4.3 Bode Components

| Modello | Contrappeso [kg] | Totale con ruota [kg] (Ø 200 / Ø 300) | Senso | Posa | Quote del disegno (Ø 200 salvo nota) | Fonte |
|---|---|---|---|---|---|---|
| SRV | 15 | 24 / 28 | solo discesa | guida | max 910; 315 accanto al peso (lettura ⚠️); 92–203 dal morsetto alla cerniera; 120–270 dalla cerniera alla puleggia; asse del piede guida (90) → centro fune 114–375; dorso guida → centro fune 45 (quota 115); forza di trazione «360 – 760» (unità non scritta; sul disegno SR/FO-V è in N ⚠️) | ✅ [BODE-BR] · ⚠️ [EQ-BODE-SRV200] |
| SR/FO-V (molla a gas) | 30 (2 × 15) | 45 / 47 | discesa e salita | guida | 160–315; 120–270; 445–475; piede guida → centro fune 180–485; forza 530–1220 N; 90; 115 | ✅ [BODE-BR] · ⚠️ [EQ-BODE-SRFOV200] |
| SGI | 65 | 69 / 71 | discesa e salita | fossa, con asta di guida | blocco 330 × 200 (165 a metà); alto 460; profondità 153,5; base 200; fori Ø 17 a 160 e 100; 20; centro fune a 61; 73; 85,8 | ✅ [BODE-BR] · ⚠️ [EQ-BODE-SGI] |
| SGI-S | 65 | 69 / 71 | discesa e salita | guida | 550; 531–max 694; 330; 350; 370,68; 183; 74; 60; centro fune → base guida 40; max 85 | ✅ [BODE-BR] · ⚠️ [EQ-BODE-SGIS] |
| SGD (porta anche il limitatore) | 75 (5 × 15) | 94,5 / 96 | discesa e salita | solo fossa | telaio alto 910 (865); 280; base 500 × 200; fori per GB 7/9 a 180, per GB 8 a 130; corse con limitatore GB 8 48–250, GB 7 48–198 | ✅ [BODE-BR] · ⚠️ [EQ-BODE-SGD] |

Tutti con ruota Ø 200 o Ø 300 uguale a quella del limitatore e interruttore di fune lenta 1NC/1NO a ritenuta ✅
[BODE-BR].

### 4.4 Dynatech

| Modello | Tipo | Puleggia (fune) | Quote | Massa | Fonte |
|---|---|---|---|---|---|
| COMPACT 200 | a molla, preassemblato | Ø 200 (6–6,5) | 336 (275) × 360 (300) × 86,6 (72); fori Ø 13; 330; 187; 175; 47,5; 15; 71,5; Ø 25; 156; 65; 54,2 (disegno DYN 66.C001.00) | ❓ | ⚠️ [EQ-COMPACT-M] p. 8 · [EQ-COMPACT] |
| adattatore alla guida per COMPACT 200 | staffa | — | 560 × 160 × 123; asole a 290 / 330 / 390; Ø 10,5 e Ø 12,5 | 10 kg | ⚠️ [EQ-COMPACT-M] p. 9 |
| tenditore del VEGA | a peso, fissato alla guida con flange | come il limitatore | ❓ | ❓ | ⚠️ [EQ-VEGA200-M] |

### 4.5 Wittur

| Modello | Dati | Fonte |
|---|---|---|
| CTW (Compact Tension Weight, a molla) | per limitatori uni e bidirezionali fino a 3,5 m/s, fune 6–8; forze 250 / 600 / 1250 N; fissaggio a pavimento o alla guida; EN 81-77 | ✅ [W-CTW] [W-SAFETY] p. 8 |
| tenditori a braccio oscillante (swing arm) | forze fino a 600 N; fissaggio alla guida o in fossa; carter, protezione fune e contatto inclusi | ✅ [W-SAFETY] p. 8 |
| tenditore compatto a doppia molla per OL20 | puleggia Ø 180, fune 6, Vn fino a 1,75; forza ≥ 400 N; guide T70 / T82 / T89 / T90 | ✅ [W-SAFETY] p. 8 |
| tenditore verticale | combinabile anche con limitatori di altri costruttori; nessun dato numerico | ✅ [W-SAFETY] p. 9 |

Quote e masse dei tenditori Wittur: ❓.

### 4.6 ALJO e Gervall (titoli Donati ⚠️ [DON-LIST])

ALJO 2105 tenditore Ø 200; ALJO 2106 tenditore Ø 300 a bloccaggio a cuneo, solo discesa; ALJO 2107 Ø 200 bidirezionale
(puleggia FG25). Gervall: pulegge del tenditore Ø 200 (1006401) e Ø 300 (1006501). Quote e masse: ❓.

## 5. Confronto con i valori di LiftPilot oggi

Valori del software letti in `src/shaft/norme.ts`, `src/shaft/norme-porte.ts`, `src/shaft/sill.ts`,
`src/shaft/governor.ts` e `src/components/lift3d/doors.ts` (nessun file modificato).

| Costante / dato del software | Valore attuale | Dati di catalogo trovati oggi | Esito |
|---|---|---|---|
| `doorOpMakers.fermator` | T2 1,5·L + 50; C2 2·L + 50 | 40/10 PM: operatore 1,5·PL + 50 e 2·PL + 50; soglie 1,5·PL + 40 e 2·PL + 40 (disegni ⚠️ copia) | **confermato**; i «+40» del file 14 sono le soglie |
| `doorOpMakers['2sg']` | T2 1,5·L + 40; C2 2·L + 20 | FLY 2AT ingombro massimo 1,5·A (+10 max); soglia 1,5·A + 20 (+40 extracorsa) = colonna D; FLY 2AO 2·A (+20 max) | C2 confermato; T2 è la soglia con extracorsa, l'operatore è 1,5·A + 10 al massimo (il valore attuale resta dal lato sicuro) |
| `doorOpT2`, `doorOpC2` (generici) | 1,5·L + 50; 2·L + 60 | massimi trovati: T2 1,5·PL + 50 (Fermator), 1,5·AP + 47 (Dapa), 1,5·A + 45 (2SG OP93); C2 2·L + 50 (Fermator, Dapa, Hydra Plus GW) | confermati come inviluppo; Hydra Plus può superarli dove GM > GW ⚠️ |
| `doorOpClose` | 25 oltre la luce, lato chiusura | Fermator T2: 15 | da rivedere (25 è prudente) |
| `doorOpDepth` | 150 | profondità sul disegno: 2SG 220 (OP93 max 260), Dapa 217, Hydra Plus 200, Fermator 120–144 con staffe da 183 a 280 | **probabilmente sottostimata** per 2SG, Dapa e Wittur ⚠️ |
| altezza dell'operatore sopra la luce | (nel 3D) | 2SG HLP + 475 (T3 + 510); Fermator HL + 340/350; Dapa luce + 470 (somma ⚠️), MICRON + 524 (somma ⚠️); C-MOD 345–407; Hydra Plus ≥ LH + 565 (ECO) ⚠️ | dato nuovo per la verifica della testata |
| `doorStackT2/C2` + `doorFrame` (porta di piano lungo la parete) | 1,5·L + 110; 2·L + 110 | sospensioni: Fermator 50/11 1,5·CO + 100 / 2·CO + 100; Dapa LOWER 1,5·AP + 24,5 / 2·AP + 48; PARVA 1,5·AP + 58 / 2·AP + 80 (+ 80 / + 40 con le dime) | confermati come inviluppo |
| `doorPortal` 50, `doorHead` 60 | portale e architrave | telai: 2SG montanti 120, frontalino 220, spessore 50; Dapa montanti 120 (80–200), foro grezzo AP + 300; Fermator J1/J2 50–120, HD 210 (80/100), FD 20–140; C-MOD montanti 100 × 60, traversa 240 | il software usa un portale sottile: valori di catalogo più grandi |
| `LANDING_PANEL` 26, `CAR_PANEL` 24 | spessore ante | Dapa: binari 5/30/30/5 (⚠️ lettura); 2SG 32/42 e 42/62 (passi o spessori: non detto ⚠️) | ❓ spessore anta non dichiarato da nessuno |
| `ROLLER_R` 34 (rulli Ø 68) | rulli | Prisma Ø 44 / 67 / 90; Fermator Ø 48/33 (cabina), Ø 56/54 (piano); B-HR Ø 84 | Ø 68 sta nel campo |
| `SILL_H` 24, gola 11 × 14 | profilo soglia | Dapa alto 35, gola 12,5; Fermator 30 (rivenditore) | da rivedere (35 per Dapa) |
| governatore LK200 | asse 240, sommità 130 (370), base 165 × 220 | disegno PFB: asse **165** per LK200–LK315, altezza 230 o 415, piastra frontale 165, quote della base 188/170/156 e 143/140; rivenditore 370 e 165 × 220 | **asse da rivedere** (165 contro 240) |
| LK300 | asse 330, sommità 210 | stesso telaio dell'LK200 (asse 165), riv. 370, 14 kg | da rivedere |
| R12BF | 524 su base 520 × 116 | disegno: 524, base 520 × 116, asse 337; puleggia 340 sul disegno contro 345 | confermato; aggiungere asse 337 |
| R10BF, R1-LR | 488 su 460 × 196; 344 su 285 × 80 | disegni: asse 303 e 190,5; R1 294–344 | confermati; asse ora noto |
| LX120 | 178 di altezza | asse 70,5; larghezza 146 | confermato; dati nuovi |
| LX150 / LX180 / LX200 / LK120 | in proporzione all'LK200 | H 274 / 322 / 349 / 270; assi 86 / 107 / 110 / 71 | **sostituibili con le quote del costruttore** |
| raggio di puleggia `R` | Ø nominale / 2 | LX: Ø nominale = primitivo «ØP» ✅ | coerente |
| tenditore a leva 22 kg, verticale 44 kg | R4K, R4R | brochure [PFB-BR]: LK200 ↓↑ R4K 22, R4R 44 ✅ | confermato |

## 6. Conflitti e lacune

**Conflitti (da chiarire sul documento originale o con il costruttore)**

1. PFB LK200: altezza 230 o 415 nel disegno, 370 dal rivenditore; asse 165 nel disegno contro 240 nel software.
2. PFB R12BF: puleggia 345 (catalogo), 340 (disegno), 346 (rivenditore).
3. PFB R3/R3LR: fune 6–8 e bidirezionale (brochure) contro «Ø6–6,5» sul disegno R3 del manuale.
4. 2SG FLY 2AT, A 850: L 1270 (sito) contro 1275 (PDF). LIKE 3AT A 1000: L 1355 contro 1335 della FLY. OP93 4AT: «11670»
   e ripartenza di B ed E da A 1300.
5. Dapa DOPE2D: C 1598 e 1622 per AP 1050 e 1100 non seguono 1,5·AP + 47 (attesi 1622 e 1697).
6. Wittur B-HR: 6 m/s (brochure) contro 10 m/s (tabella di confronto). Bode GB 8: 0,50–2,04 (brochure) contro 0,50–1,49
   (disegno «8-ASV»).
7. Dynatech VEGA 200: velocità di intervento max 3 (manuale) contro 2,87 (rivenditore). PFB LXM120: intervento
   0,20–2,30 (brochure) contro tenditore adatto fino a 2 m/s (manuale).
8. Montanari: lettere A/B/C dei rivenditori non definite; RQ300 A 325 contro 320 del manuale (file 13).

**Non trovato (❓)**

- **2SG**: tabelle di FLY 4AT, LIKE 2AO e OP93 2AT-B/C oltre quanto riportato; lunghezza delle sospensioni I92 come
  funzione di A; massa di operatori e sospensioni; spessore delle ante.
- **Fermator**: campi di luce e altezza dei tipi diversi da T2 nella 40/10 PM; quote della C4 e della T2 con soglia 70;
  massa dell'operatore da solo; documenti originali sul sito del costruttore (bloccato).
- **Wittur**: lunghezza della sospensione di piano e profondità per Hydra, Fineline, Augusta EVO, Pegasus, B-G, C-MOD;
  attribuzione riga per riga di GM e P nel catalogo Hydra Plus; masse delle T3; ingombri, masse e altezza dell'asse dei
  limitatori OL20/OL35/EOS/OL100; quote dei tenditori.
- **Prisma**: tutte le quote d'ingombro e le masse (catalogo con login).
- **Dapa**: masse delle porte di piano; pagine LOWER T3/C4 non lette (63 pagine, lette 2, 3, 5, 9, 19, 22).
- **CMM**: tutte le quote salvo le soglie.
- **Sematic e Selcom**: siti non apribili; nessun dato oltre a quelli pubblicati da Wittur.
- **PFB**: massa di LX, LK120, LK250, R3, R5R…R6SP; certificati d'esame UE; quote e massa dei gruppi R4* assemblati;
  catalogo e CAD (registrazione).
- **Montanari**: tutto ciò che il file 13 già segnalava come mancante (quote, fori, masse dal costruttore).
- **Dynatech**: quote dello STAR e del tenditore del VEGA; sito del costruttore.
- **Bode**: quote del GB 9; presenza in Italia.
- **Altri** (ALJO, Gervall, MP, Luezar, Nork, Guillermo Fabián): solo titoli di catalogo; altri costruttori di porte
  (Slycma, Meiller, Sodimas, Kleemann e simili) non cercati.

## 7. Fonti (tutte consultate il 2026-10-02)

**PFB**
- [PFB-W] https://pfb.it/en/product/3264/overspeed-governors/lk-200-bidirectional (e le altre pagine prodotto del file 13 § 7)
- [PFB-BR] https://download.pfb.it/api/pdf/348322 (brochure-catalogo, 58 pagine, edizione non indicata; nel testo i numeri di pagina stampati)
- [PFB-MLK] https://download.pfb.it/api/pdf/5801 (manuale «LK LX EU», 73 pagine; dati tecnici pp. 63–70)
- [PFB-MR1] https://download.pfb.it/api/pdf/5798 (manuale R1; p. 63)
- [PFB-MR356] https://download.pfb.it/api/pdf/5799 (manuale R3 R5 R6; pp. 65–69)
- [PFB-MR1012] https://download.pfb.it/api/pdf/5800 (manuale R10 R12; pp. 65–66)
- [PFB-MLKT] https://download.pfb.it/api/pdf/5803 (manuale LKT120; p. 52)
- [PFB-MLXM] https://download.pfb.it/api/pdf/349857 (manuale LXM120, doc. 25.12.MA.0001 Ed.00 25/03/2026; p. 10)
- [PFB-MR4MC] https://download.pfb.it/api/pdf/349872 (manuale R4MC; p. 10)
- [PFB-MR4M] https://download.pfb.it/api/pdf/336190 (manuale R4M – R4MS)
- Area download: https://download.pfb.it/manuali-uso · https://www.pfb.it/en/download · https://getaccess.pfb.it/

**Montanari**
- [13] `research/argano-geared/13-limitatori-e-tenditori.md` § 8 (estratti del 2026-10-01)
- [ES-6790043] https://www.elevatorshop.de/en/montanari-overspeed-governor-rq250-incl.remote-tripping-48v-va-1.3m-s-6790043.html
- [ES-6790117] https://www.elevatorshop.de/en/montanari-overspeed-governor-rq300-a-right-standard-base-ts-1.4m-s-6790117.html
- [ES-6790047] https://www.elevatorshop.de/en/montanari-overspeed-governor-rh300-ts-1.4m-s-6790047.html
- [DON-TEV250] https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari
- [DON-TEV300] https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari-0

**Dynatech** (documenti del costruttore ospitati dal rivenditore)
- [EQ-VEGA200] https://www.elevatorequipment.co.uk/search-by-manufacturer/dynatech/dynatech-vega-overspeed-governor-200mm-pulley
- [EQ-VEGA200-M] https://www.elevatorequipment.co.uk/files/ww/s2%20man%20overspeed%20governor%20vega%20200mm.pdf
- [EQ-VEGA300] https://www.elevatorequipment.co.uk/lift-equipment/a3-the-complete-solution/dynatech-a3-vega-overspeed-governor-300mm-pulley
- [EQ-VEGA300-M] https://www.elevatorequipment.co.uk/files/ww/DYNATECH%20-%20A3%20Vega%20Overspeed%20Governor%20300mm%20Pulley.pdf
- [EQ-STAR] https://www.elevatorequipment.co.uk/search-by-manufacturer/dynatech/dynatech-star-overspeed-governor
- [EQ-STAR-M] https://www.elevatorequipment.co.uk/files/ww/s2%20man%20star%20overspeed%20governor.pdf
- [EQ-COMPACT] https://www.elevatorequipment.co.uk/lift-equipment/a3-the-complete-solution/dynatech-compact-tension-weight-spring-loaded-200mm-pulley
- [EQ-COMPACT-M] https://www.elevatorequipment.co.uk/files/ww/Compact%20200%20Tension%20Weight%20System%20Manual.pdf

**Wittur (Sematic, Selcom)**
- [W-RANGE] https://www.wittur.com/website/get_download.aspx?ctrb_id=9893 (Elevator Doors, SB.2.004180 Ed.1 Rev.6, ottobre 2024)
- [W-CMOD] https://www.wittur.com/website/get_download.aspx?ctrb_id=8689 (2000 C-MOD, luglio 2020)
- [W-BHR] https://www.wittur.com/website/get_download.aspx?ctrb_id=6356 (2000 B-HR, SB.2.004222, settembre 2024)
- [W-H3000] https://www.wittur.com/website/get_download.aspx?ctrb_id=10133 (Hydra 3000 homelift, SB.2.003316, settembre 2023)
- [W-STEP] https://www.wittur.com/website/get_download.aspx?ctrb_id=10135 (STEP Hydra 3000 homelift, non usato per le quote)
- [W-AMD] https://www.wittur.com/website/get_download.aspx?ctrb_id=4382 (AMDC, 2011, agg. 2014)
- [W-NETT] https://www.wittur.com/website/get_download.aspx?ctrb_id=4228 (Nettuno, 2014)
- [W-NETT-L] https://www.wittur.com/en/elevator-components/landing-doors/nettuno-landing-door.aspx
- [W-NETT-C] https://www.wittur.com/en/elevator-components/car-doors/nettuno-car-door.aspx
- [W-LUNA] https://www.wittur.com/en/elevator-components/landing-doors/luna-landing-door.aspx
- [W-MIDI] https://www.wittur.com/en/elevator-components/car-doors/midisupra-v2.aspx
- [W-ECOX] https://www.wittur.com/en/elevator-components/car-doors/ecox-smart-drive.aspx
- [W-SAFETY] https://www.wittur.com/website/get_download.aspx?ctrb_id=8838 (Safety SB.7.002034.EN.01, ottobre 2024)
- [W-CTW] https://www.wittur.com/website/get_download.aspx?ctrb_id=5657 (CTW, Ed.1 Rev.2 febbraio 2017)
- [W-HP-TC] https://www.manualslib.com/manual/1284889/Wittur-Hydra-Plus.html?page=44 (pagine 44–51; catalogo TC.2.001981.EN, copia di terzi)
- [W-OL20] https://www.manualslib.com/manual/3120843/Wittur-Ol20.html?page=12 (PM.7.005828.EN, copia di terzi)
- Wittur Draw: https://www.wittur.com/en/wittur-draw.aspx
- [WIKI-WITTUR] https://en.wikipedia.org/wiki/Wittur (solo estratto del motore di ricerca: storia di Selcom S.p.A., oggi Wittur S.p.A., Colorno)

**Fermator** (copie di terzi dei documenti del costruttore, e rivenditori)
- [F-4010PM] https://www.vytahovedily.com/files/model_4010_pm_printable_version_06-02-2018_doc-fecmcbp10c00en-3.2.pdf
- [F-5011] https://arcolift.com/portal/images/CANNY/Fermator/MODEL_5011_ONGOING_VERSION_08-05-2014__DOC-FECMCBP50R00EN.pdf
- [DAV-603510789] https://www.davenportliftcontrol.com/fermator/sill/603510789 (e le pagine 603510787, 603510796, 603510786, 603510011 dello stesso percorso)
- [DAV-603510008] https://www.davenportliftcontrol.com/fermator/door-suspension/603510008
- [EQ-FERM] https://www.elevatorequipment.co.uk/search-by-manufacturer/fermator

**2SG**
- [2SG-W] https://www.2sg.it/prodotto/operatore-fly-2-ante-telescopiche-2at/ e le altre pagine `https://www.2sg.it/prodotto/…/` (operatori FLY, LIKE, OP93; sospensioni I92 2AO, 2AT, 3AT, 4AT; telaio standard; telai speciali; Thor; EI120; Compact 4 ante)
- [2SG-P-FLY2AT] https://www.2sg.it/wp-content/uploads/2025/03/opertore-fly-2-ante-telescopico-2AT.pdf
- [2SG-P-FLY2AO] https://www.2sg.it/wp-content/uploads/2025/03/operatore-fly-2-ante-centrali-2A0.pdf
- [2SG-P-FLY3AT] https://www.2sg.it/wp-content/uploads/2025/03/operatore-fly-3-ante-telescopico-3AT.pdf
- [2SG-P-LIKE3AT] https://www.2sg.it/wp-content/uploads/2025/03/operatore-like-3-ante-telescopiche-3AT.pdf
- [2SG-P-LIKE4] https://www.2sg.it/wp-content/uploads/2025/03/operatore-like-4-ante-centrali-4A0.pdf
- [2SG-P-OP93-2AT] https://www.2sg.it/wp-content/uploads/2025/03/operatore-op3-2-ante-telescopico-2AT.pdf
- [2SG-P-SOSP2AT] https://www.2sg.it/wp-content/uploads/2025/03/sospensione-2-ante-telescopiche-i92.pdf
- [2SG-P-SOSP2AO] https://www.2sg.it/wp-content/uploads/2025/03/sospensione-2-ante-centrali-i92.pdf

**Prisma**
- [PR-BOARD] https://www.prismaitaly.it/media/tkehi2rt/productsboard.pdf
- [PR-MICRO] https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/6/serie-micro-standard
- [PR-MICRO75] https://www.prismaitaly.it/en/Products/car-doors/standard/53/serie-micro-75
- [PR-MS40] https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/8/serie-micro-ms40
- [PR-MINISILL] https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/9/serie-micro-mini-sill
- [PR-MACRO] https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/11/serie-macro-standard
- [PR-SINUS] https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/3/serie-sinus-standard
- [PR-Q] https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/24/serie-q-standard
- [PR-Q75] https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/25/serie-q-75-standard
- [PR-Q50] https://www.prismaitaly.it/it/Prodotti/porte-di-piano/modernizzazioni/32/serie-q-50-standard
- [PR-F22] https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/33/serie-f22-standard
- DigiPara: https://www.prismaitaly.it/it/digipara/

**Dapa**
- [DAPA-LOWER] https://dapasrl.com/wp-content/uploads/2017/03/001_Catalogo-tecnico-Lower.pdf (pp. 2, 3, 5, 9, 19, 22)
- [DAPA-PARVA] https://dapasrl.com/wp-content/uploads/2017/02/002_Catalogo-tecnico-Parva.pdf (pp. 3, 5)
- [DAPA-MICRON] https://dapasrl.com/wp-content/uploads/2017/02/011_Catalogo-tecnico-Micron.pdf (pp. 2, 5)
- Elenco dei documenti: https://dapasrl.com/catalogo-tecnico-dapa-ita/

**CMM**
- [CMM-RS] https://www.cmmelevators.com/en/_files/ugd/5d3e6e_374ffa87793f4da8bebbd268241f3cab.pdf (porte automatiche con soglia ridotta)

**Bode Components**
- [BODE-GB] https://bode-components.com/geschwindigkeitsbegrenzer/
- [BODE-BR] https://bode-components.com/wp-content/uploads/BODE_Broschuere_DE.pdf
- [EQ-BODE7] https://www.elevatorequipment.co.uk/files/ww/BODE%20Overspeed%20Governor%20Type%207%20Drawing.pdf
- [EQ-BODE8] https://www.elevatorequipment.co.uk/files/ww/BODE%20Overspeed%20Governor%20Type%208%20Drawing.pdf
- [EQ-BODE-SRV200] https://www.elevatorequipment.co.uk/files/ww/BODE%20Tension%20Weight%20SRV%20200mm%20Drawing.pdf
- [EQ-BODE-SRFOV200] https://www.elevatorequipment.co.uk/files/ww/BODE%20Tension%20Weight%20SR%20FO%20V%20200mm%20Drawing.pdf
- [EQ-BODE-SGI] https://www.elevatorequipment.co.uk/files/ww/BODE%20Tension%20Weight%20SGI%20Drawing.pdf
- [EQ-BODE-SGIS] https://www.elevatorequipment.co.uk/files/ww/BODE%20Tension%20Weight%20SGI-S%20Drawing.pdf
- [EQ-BODE-SGD] https://www.elevatorequipment.co.uk/files/ww/BODE%20Tension%20Weight%20SGD%20Double%20Guiding%20Stand%20Drawing.pdf

**Rivenditori (masse e conferme)**
- [EQ-LK200] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk200-bidirectional-overspeed-governor-200mm-pulley
- [EQ-LK300] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk300-bidirectional-overspeed-governor-300mm-pulley
- [EQ-LK315] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk315-bidirectional-overspeed-governor-315mm-pulley
- [EQ-R10BF] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r10bf-clockwise-down-only-direction-overspeed-governor-315mm-pulley
- [EQ-R12BF] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r12bf-clockwise-down-only-direction-overspeed-governor-346mm-pulley
- [EQ-R1LR] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r1lr-bidirectional-overspeed-governor-300mm-pulley
- [EQ-R5] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r5-clockwise-down-only-direction-overspeed-governor-200mm-pulley
- [EQ-R6] https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r6-clockwise-down-only-direction-overspeed-governor-300mm-pulley
- [EQ-R4T] https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4t-vertical-tension-weight-200mm-300mm-315mm-pulley
- [EQ-R4V] https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4v-vertical-tension-weight-200mm-300mm-315mm-pulley
- [EQ-R4M] https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4m-tension-weight-with-springs-200mm-pulley
- [DON-LIST] https://www.donati.it/it/catalogo-prodotti/limitatori-tenditori-paracadute (pagine 0–20) e le schede ALJO/Gervall in `https://www.donati.it/it/prodotti/limitatori-tenditori-paracadute/…`
