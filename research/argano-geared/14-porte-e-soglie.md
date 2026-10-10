# Porte di cabina, porte di piano e soglie — quote di catalogo (ricerca del 2026-10-01)

[← Indice](README.md)

> Raccolta del 1° ottobre 2026 per i cataloghi e i disegni di Argano. I file di lavoro citati nel testo (cartella `raw/`,
> script e registri della sessione) non sono nel repository: restano come traccia del metodo.


Scopo: dare ad Argano le quote d'ingombro reali di operatori di cabina, sospensioni di piano e soglie
(2SG, Fermator, Wittur con la gamma Fineline, Prisma Italy, Dapa, CMM). Ogni numero ha la sua fonte. Dove
non c'è un valore è scritto «non trovato»: nessuna lacuna è stata coperta per analogia.
Versione leggibile da programma: `porte.json` (stessi dati, un record per valore).

## 0. Limiti di accesso: leggere prima di usare i dati

- **Nessun documento è stato scaricato.** Il proxy di rete della sessione rifiuta con 403 sia `curl` sia
  WebFetch per tutti gli host provati: 2sg.it, fermator.com, wittur.com, prismaitaly.com, dapa.it,
  cmm-lift.com, donati.it (anche prod11), lift-store.it, liftmaterial.com, shop.ascensoristi.com,
  elevatorshop.de, shop.elvacenter.com, slycma.com, sematic.com, selcom.it, vytahovedily.com,
  arcolift.com, irp.cdn-website.com, 5.imimg.com, duellelift.com, manualslib, scribd, yumpu, pdfcoffee,
  issuu, wikipedia, archive.org, google, example.com. Passano solo github, gitlab e bitbucket, e lì non
  c'è nulla di utile.
- **Unica fonte usata: gli estratti di WebSearch in modalità "extended"**, cioè testo e tabelle delle
  pagine riportati dal motore di ricerca. **Nessun disegno è stato visto** (`fromDrawing = false` ovunque).
  Pagina o tavola sono indicate solo quando l'estratto le nomina.
- **Il budget WebSearch della sessione si è esaurito (200 su 200)** dopo 44 ricerche di questo lavoro.
  Per questo **Dapa non è stata cercata**, mentre Fermator e Wittur sono coperti solo in parte.
- Data di accesso di tutte le fonti: **2026-10-01**.

Grado di evidenza (prefisso del campo `note` nel JSON):

| Sigla | Significato |
|---|---|
| E1 | valore o tabella espliciti della pagina, riportati per intero dall'estratto (righe complete e coerenti): affidabilità medio-alta, da confermare sul documento |
| E2 | valore presente nell'estratto ma con attribuzione o significato incerti: affidabilità bassa |
| T | testo letterale del titolo o dell'URL di un'inserzione di un distributore |
| R | calcolo nostro: formula che riproduce esattamente i valori E1 |
| P | dato del round di ricerca precedente (research-round3.md e voce 58 della lista di verifica), non riverificato oggi |
| NT | non trovato |

---

## 1. 2SG (Ronco Briantino, Italia)

### 1.1 Operatori di cabina

Tabelle «A · L · D» delle pagine prodotto 2sg.it (A = luce netta). **L'estratto non dice cosa siano L e
D**: la legenda è nel disegno, che non abbiamo visto.

**FLY 2AT** (2 ante telescopiche, T2), evidenza E1:

| A | L | D |
|---|---|---|
| 600 | 900 | 940 |
| 650 | 975 | 1015 |
| 700 | 1050 | 1090 |
| 750 | 1125 | 1165 |
| 800 | 1200 | 1240 |

Formule (R): **L = 1,5·A** e **D = 1,5·A + 40**, esatte su tutte le 5 righe. Soglia di cabina in
alluminio da 75–90 mm.
**LIKE 2AT**: tabella identica alla FLY 2AT, quindi probabilmente comune alle due serie (da confermare);
soglia heavy duty da 75–90 mm.

**FLY 2AO** (2 ante centrali, C2), evidenza E1:

| A | L | D |
|---|---|---|
| 600 | 1100 | 1220 |
| 650 | 1100 | 1320 |
| 700 | 1250 | 1420 |
| 750 | 1250 | 1520 |
| 800 | 1500 | 1620 |

Formula (R): **D = 2·A + 20**, esatta su tutte le 5 righe. L va a gradini (1100, 1250, 1500) e non è
lineare in A. Poiché L < 2·A, L non può essere l'ingombro delle ante aperte: il suo significato va letto
sul disegno.

**FLY 3AT** (3 ante telescopiche, T3), evidenza E1; **LIKE 3AT** ha la stessa tabella:

| A | L | D |
|---|---|---|
| 750 | 1000 | 1020 |
| 800 | 1070 | 1090 |
| 850 | 1135 | 1155 |
| 900 | 1200 | 1220 |
| 950 | 1270 | 1290 |

Formula (R): **D = L + 20**, con **L = 4/3·A arrotondato per eccesso ai 5 mm**, cioè D ≈ 1,333·A + 20
(scarto 0…+3,3 mm). Soglia di cabina in alluminio da 120 mm. Motore 200 W DC con encoder; la posizione del
motore non è riportata.

**OP93 2AT** (operatore a braccio, T2), evidenza E1. Tabella «A · L · B · C · F»; B e C sono vuoti
(«–») nell'estratto:

| A | L | F |
|---|---|---|
| 600 | 900 | 500 |
| 650 | 975 | 550 |
| 700 | 1050 | 600 |
| 750 | 1125 | 650 |

Formule (R): L = 1,5·A e F = A − 100 (significato di F sconosciuto). Soglia da 75–90 mm; quella da 90 heavy
duty è a richiesta.

Altri operatori 2SG:

| Famiglia | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| FLY 4AT («4 ante centrali», C4) | tabella dimensioni | non trovato | — | NT |
| FLY 4AT | soglia di cabina in alluminio | 120 mm | | E1 |
| FLY 4AT | sblocco meccanico opzionale «per impianti a testata ridotta» | «2365mm height» (non è chiaro a quale altezza si riferisca) | | E2 |
| LIKE 2AO, LIKE 4AT, OP93 2AO/3AT/4AT | tabella dimensioni | non trovato (le pagine esistono) | — | NT |
| serie LIKE | campo d'impiego | porte pesanti, «dimensions greater than 1100mm» | | E2 |
| operatore meccanico 3×125 V, 2AO, luce 600 o 650 | soglia (dal titolo Lift Store) | 50 mm | | T |
| operatore meccanico 3×125 V, 2AT-CS, luce 750 | soglia (dal titolo Lift Store) | 90 mm | | T |

**Non trovati per nessun operatore 2SG:** profondità (sporgenza dal frontale di cabina o dal piano delle
ante); altezza della trave sopra la luce; massa; posizione del motore (salvo l'etichetta FLY 3AT); sporgenza
oltre il lato di chiusura e oltre il lato di impacchettamento. La scheda tecnica «SCHEDA TECNICA OPERATORE
"FLY" 2AT DATA SHEET» esiste (copia yumpu, documento 15906105) ma non è leggibile da questa sessione.

### 1.2 Porte di piano e sospensioni

| Prodotto | Tipo | Luce A → altezza max (mm) | Soglia di piano | Evid. |
|---|---|---|---|---|
| Sospensione 2AT | T2 | 500–750 → 2000; 800–1150 → 2200; 1200–1800 → 3000 | alluminio 75–90 | E1 per la soglia; E2 per i campi (un secondo estratto attribuisce gli stessi valori alla «sospensione 2 ante centrali») |
| Sospensione I92 2AO | C2 | 500–750 → 2000; 800–1400 → 2200 | alluminio heavy duty 50–70 | E1 |
| Sospensione I92 3AT | T3 | 750–1100 → 2000; 1200–1800 → 2200 | — | E1 |
| Sospensione I92 4AT («4 ante centrali») | C4 | 600–1500 → 2000; 1600–2300 → 2200; 2400–4000 → 3000 | alluminio 75–90 | E1 |
| Telai di piano | — | montanti (stipiti) fino a **25 mm**, solo in esecuzione speciale; larghezza standard non trovata | — | E1 |

Sospensione 2AT (etichette E1): fissaggio a telaio o a muro, chiusura a molla, staffe della soglia incluse.

**Porta con telaio proprio — indicazione del cliente (4 ottobre 2026):** soglia e sospensione della porta di piano
sono fissate al telaio; il telaio sta tutto nel vano di corsa, contro la parete; gli imbotti stanno sul pavimento del
pianerottolo. Scelte del cliente sulla stessa domanda: il vano nel muro è l'ingombro esterno del telaio, le staffe
Panev (sotto la soglia e sopra la sospensione) tengono il telaio, lo spessore del telaio è dentro la profondità della
porta di piano. Concorda con il «fissaggio a telaio» della 2AT qui sopra e con la profondità di Fermator con telaio,
20 + 90 + FD (cap. 18). Nel software: `liftpilot/src/shaft/frame.ts`, voce `porte.telaio`.
**Non trovati:** lunghezza complessiva della sospensione rispetto alla luce; profondità nel vano dal filo
del muro di piano; altezza dell'architrave o testata sopra la luce; distanza dal muro di piano al bordo
della soglia; testata minima.

---

## 2. Fermator

Documenti individuati (titoli e URL dagli estratti; **nessuno letto direttamente**):
- «40/10 NEW INSTALLATION RESIDENTIAL LIFTS» (fermator.com, caricato 2024/07);
- «40/10 PM NEW INSTALLATION RESIDENTIAL LIFTS», DOC-FECMCBP10C00EN, in più edizioni: fermator.com
  2024/07, «printable version 06-02-2018» v3.2, «ongoing version 08-05-2014»;
- 40/10 PM Car Installation (liftmaterial.com);
- 40/10 SLIM;
- 50/11 VF;
- 50/11 PM MEGA;
- PLATINUM e PLATINUM PM (DOC-FECMCBPRHC00EN 2.6);
- PREMIUM PM e Premium PM UDD (DOC-FECMCBPY0C00EN 2.5);
- MOD MC ELITE PM C&M;
- brochure DOC-FECMCBPCOR00EN;
- manuale VF5.

| Famiglia | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| 40/10 | C2, C4, T2 RLO, T2-T3-T4 | luce PL | 600–1400 mm (ante in acciaio); 600–1000 mm (ante in vetro) | E1 |
| 40/10 | idem | altezza utile HL | 2000–2400 mm (acciaio); 2000–2100 mm (vetro) | E1 |
| 40/10 | — | traffico / velocità | fino a 240 cicli/h; fino a 3 m/s | E1 |
| 40/10 (PM/VF) | T2 | lunghezza operatore | **1,5·PL + 40** | E2 |
| 40/10 (PM/VF) | T2 | lunghezza operatore, seconda formula vista | **1,5·PL + 50** | E2 (quale vale per quale variante, VF/PM o mano, non si ricava) |
| 40/10 VF | C2 | lunghezza operatore | **2·PL + 50** | P (oggi la stessa formula è ricomparsa, ma attribuita a T2) |
| 40/10 PM | C2 | altre formule viste | 2·PL + 40; 2·PL + 100; PL + 50 | E2, significato sconosciuto |
| 40/10 VF | T2 | lato di chiusura oltre la luce | 25 mm | P; oggi nei disegni T2 compare solo «≥ 25» senza contesto |
| 40/10 PM | C2 | quote verticali viste | CH + 220; CH + 338 | E2: a quale elemento si riferiscano non si ricava |

**Non trovati (Fermator):** profondità dell'operatore; altezza sopra la luce (in modo attribuibile);
massa; sospensione di piano (lunghezza, profondità, architrave, stipiti); soglie (larghezza, spessore,
gole, materiale); luce tra le soglie.

---

## 3. Wittur (con la gamma Fineline)

> **Aggiornamento (secondo giro):** pacchetti porta Hydra, Hydra 3000, Augusta EVO, Sematic e Taurus nel § 11.

### 3.1 Fineline (porta di piano + porta di cabina, per ammodernamenti EN 81-80)

| Dato | Valore | Fonte | Evid. |
|---|---|---|---|
| luce | 600–900 mm | pagina «FINELINE® landing door» | E1 |
| altezza utile | 1900–2100 mm | idem | E1 |
| velocità nominale | ≤ 2 m/s | idem | E1 |
| pacchetto T2 (2 e 4 ante laterali): porta di cabina + luce tra le soglie + porta di piano | **115 mm** | idem | E1 |
| pacchetto C2 | **85 mm** | idem | E1 |
| pacchetto C4 (simmetrico / asimmetrico) | 115 / 115 mm | idem | E1 |
| motorizzazione dell'operatore | solo ECO PLUS: PMSM trifase, 127 V/2 A o 230 V/1 A, IP20 | pagina «Fineline car door operator» (vecchio sito Wittur su graphoservice.it) | E1 |
| esiste una versione a 4 ante | Fineline 4-panel landing door (Interlift 2015) | wittur.com | E1 |

**Non trovati (Fineline):** lunghezza dell'operatore in funzione della luce, profondità, altezza sopra la
luce, massa, luce tra le soglie come valore a sé (è nota solo la somma: 115 mm per T2, 85 mm per C2).

### 3.2 Altre porte di cabina e azionamenti Wittur

| Famiglia | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| Hydra Plus (porta di cabina) | 02/C (C2); 12/L/R (probabilmente T2) | luce | 600–1800 mm | E1 |
| Hydra Plus | 32/L/R (probabilmente T3) | luce | 600–2100 mm | E1 |
| Hydra Plus | 42/C (probabilmente C4) | luce | 1200–3500 mm | E1 |
| Hydra Plus | tutti | altezza utile | 1900–3500 mm | E1 |
| Hydra Plus UD 300 («reduced height design») | 02/C | soglia | 50 mm | E1 |
| Hydra Plus UD 300 | 12/L (probabilmente T2) | soglia | 75 o 90 mm | E1 |
| Hydra Plus, manuale di 77 pagine, p. 47 | 02/C | tabella delle quote C, C1, D1…D4 per PL 600–1800 | **non trovato**: la tabella esiste, ma gli estratti danno solo numeri sparsi, senza colonna | NT |
| ECO+ / MIDI+ / SUPRA | — | massa max delle ante (non dell'operatore) | 130 / 270 / 600 kg | E1 |
| ECO+ / MIDI+ / SUPRA | — | potenza / velocità max | 80 W, 0,5 m/s / 550 W, 0,7 m/s / 900 W, 1,0 m/s | E1 |
| MIDI / SUPRA (istruzioni D823MGB, versione precedente) | — | massa max delle ante | 300 / 700 kg (nell'estratto compare anche «LL<=4200», senza contesto) | E1 |
| MIDI / SUPRA | — | massa dell'operatore | ≈ 30 kg | P |

Solo «02/C = 2 ante centrali» è confermato (titolo di p. 47 del manuale). Le corrispondenze 12 → T2,
32 → T3 e 42 → C4 sono probabili ma non confermate dagli estratti.

**Non trovati (Wittur):** formula della lunghezza dell'operatore (Hydra Plus, ECO+/MIDI+/SUPRA, AMD,
Fineline); profondità; altezza sopra la luce; porte di piano Hydra (lunghezza e profondità della
sospensione, architrave, stipiti).

---

## 4. Prisma Italy (Prisma S.p.A.)

> **Aggiornamento (secondo giro):** vedi § 12.

Il catalogo tecnico si scarica **solo previa registrazione** (accesso con login). I dati sotto vengono
dalle pagine prodotto di prismaitaly.it (E1) e dai titoli di Lift Store (T).

| Famiglia | Tipo | Dato | Valore |
|---|---|---|---|
| MICRO (porta di cabina) | 1, 2, 3, 4 ante, centrali o telescopiche | luce max × altezza max | 1100 × 2300 mm (versioni Slim, Medium, Large; operatore a cinghia diretta, Drive FOX 230 Vca) |
| MICRO | — | rotelle / profili | Slim: Ø44 e 40×10; Medium: Ø67 e 40×10; Large: Ø67 e 40×10 con rinforzo |
| MICRO 75 | — | soglia | 75 mm |
| MICRO MS40 | — | profondità del profilo soglia | da 90 (standard) a **40 mm** |
| MICRO Mini-Sill | — | ingombro per canale di scorrimento | **25 mm** per canale |
| MACRO | 1, 2, 3, 4, 6 ante | luce max × altezza max | 3300 × 2800 mm |
| SINUS (operatore a braccio, trifase) | 1, 2, 3, 4, 6 ante | luce max × altezza max | 2500 × 2500 mm |
| Serie Q (porta di piano) | — | luce max × altezza max | 3200 × 2800 mm |
| Serie Q 75 | — | profondità di sospensione e profilo | da 90 (standard) a **75 mm** |
| Serie Q 50 | — | profondità di sospensione e profilo | da 90 (standard) a **50 mm** |
| Serie F22 (porta di piano, stesso meccanismo della Q) | 2 ante, centrali o telescopiche | luce max / altezze | 1200 / 2000 e 2100 mm (anche E120 ed EW60) |
| MICRO, luce 800 e 750, 2AT, mano dx (Lift Store) | T2 | soglia (dal titolo) | «H.75» (T) |

**Non trovati (Prisma):** lunghezza, profondità e altezza dell'operatore; ingombro della sospensione,
architrave e stipiti; luce tra le soglie, numero di gole e spessore delle soglie.

---

## 5. Dapa (Italia)

> **Aggiornamento (secondo giro):** Dapa S.r.l. (Roma, dapasrl.com): soglie LOWER e PARVA nel § 12.

**Non trovato. Nessuna ricerca eseguita:** il budget WebSearch si è esaurito prima di arrivare a Dapa, e
l'host dapa.it è comunque bloccato.

## 6. CMM (Italia)

> **Aggiornamento (secondo giro):** CMM S.r.l. (Mezzago, cmmelevators.com) nel § 12.

| Dato | Valore | Fonte | Evid. |
|---|---|---|---|
| tipo | 2AC (2 ante, apertura centrale), accoppiatore fisso, completo di accessori | titoli e URL di Lift Store (articoli 4597 e 4598) | T |
| luci in vendita | 600 e 650 mm | idem | T |

**Non trovato** tutto il resto: lunghezza, profondità e altezza dell'operatore, porte di piano, soglie
(l'URL contiene «spess. s…», troncato).

---

## 7. Riepilogo: ingombro dell'operatore = a·L + b (L = luce netta)

| Marca | Famiglia | Tipo | a | b (mm) | Campo di luce | Evidenza | Nota |
|---|---|---|---|---|---|---|---|
| 2SG | FLY, LIKE | 2AT (T2) | 1,5 | +40 (quota «D») | 600–800 | E1 + R, 5 righe esatte | significato di D non visto sul disegno |
| 2SG | FLY, LIKE, OP93 | 2AT (T2) | 1,5 | 0 (quota «L») | 600–800 (OP93: 600–750) | E1 + R | seconda quota di lunghezza; significato non visto |
| 2SG | FLY | 2AO (C2) | 2 | +20 (quota «D») | 600–800 | E1 + R, 5 righe esatte | «L» a gradini: 1100, 1250, 1500 |
| 2SG | FLY, LIKE | 3AT (T3) | 4/3 | +20 (D = L + 20) | 750–950 | E1 + R | L arrotondata per eccesso ai 5 mm |
| Fermator | 40/10 (PM/VF) | T2 | 1,5 | +40 oppure +50 | prodotto 600–1400 | E2 (e P) | attribuzione delle due formule incerta |
| Fermator | 40/10 VF | C2 | 2 | +50 | prodotto 600–1400 | P | oggi visti anche 2·PL + 40 e 2·PL + 100 (E2) |
| Wittur | tutte, Fineline compresa | tutti | non trovato | non trovato | — | NT | — |
| Prisma | MICRO, MACRO, SINUS | tutti | non trovato | non trovato | — | NT | catalogo dietro login |
| Dapa | — | — | non trovato | non trovato | — | NT | non cercata |
| CMM | 2AC | C2 | non trovato | non trovato | — | NT | — |

Confronto con la regola di Argano oggi (voce 58: 1,5·L + 50 per T2, 2·L + 60 per C2, 25 mm oltre la luce
dal lato di chiusura, profondità 150 mm):
- **T2:** la regola dà un valore uguale o superiore a tutti quelli trovati (2SG +40; Fermator +40 o +50).
- **C2:** la regola supera 2SG di 40 mm e la formula Fermator del round precedente di 10 mm.
- **T3:** Argano non ha una regola; 2SG dà D ≈ 4/3·L + 20.
- **Profondità di 150 mm e 25 mm sul lato di chiusura:** nessun valore di catalogo li conferma oggi. I
  25 mm vengono solo dal round precedente (Fermator).

## 8. Profili di soglia

Per «larghezza» si intende la profondità del profilo misurata perpendicolarmente al piano della porta.

| Marca | Prodotto | Lato | Larghezza (mm) | Materiale | Evid. |
|---|---|---|---|---|---|
| 2SG | FLY 2AT, LIKE 2AT (heavy duty), OP93 2AT (90 heavy duty a richiesta) | cabina | 75–90 | alluminio | E1 |
| 2SG | FLY 3AT, FLY 4AT | cabina | 120 | alluminio | E1 |
| 2SG | operatore meccanico 2AO, luce 600/650 | cabina | 50 | — | T |
| 2SG | operatore meccanico 2AT-CS, luce 750 | cabina | 90 | — | T |
| 2SG | Sospensione 2AT; I92 4AT | piano | 75–90 | alluminio | E1 |
| 2SG | I92 2AO | piano | 50–70 | alluminio heavy duty | E1 |
| Prisma | MICRO standard | cabina | 90 | — | E1 (citato come termine di confronto) |
| Prisma | MICRO 75 | cabina | 75 | — | E1 |
| Prisma | MICRO MS40 | cabina | 40 | — | E1 |
| Prisma | MICRO Mini-Sill | cabina | 25 per canale di scorrimento | — | E1 |
| Prisma | Serie Q / Q 75 / Q 50 (sospensione e profilo) | piano | 90 / 75 / 50 | — | E1 |
| Prisma | MICRO 2AT (Lift Store) | cabina | «H.75» | — | T |
| Wittur | Fineline: porta di cabina + luce tra le soglie + porta di piano | entrambi | T2 e C4: 115; C2: 85 (somma, non la sola soglia) | — | E1 |
| Wittur | Hydra Plus UD 300 | cabina | 02/C: 50; 12/L (probabilmente T2): 75 o 90 | — | E1 |
| Fermator, CMM, Dapa | — | — | non trovato | — | NT |

**Spessore o altezza del profilo, numero di gole, luce tra le soglie e staffe di sostegno (quote), distanza
dal muro di piano al bordo della soglia:** non trovati per nessuna marca. 2SG dichiara solo che le staffe
della soglia sono incluse nella sospensione 2AT.

## 9. Lacune (non trovato)

1. **Dapa:** tutto (non cercata).
2. **CMM:** tutte le quote; è nota solo l'esistenza dell'operatore 2AC con luce 600/650.
3. **Wittur, Fineline compresa:** lunghezza dell'operatore in funzione della luce, profondità, altezza
   sopra la luce; tabella di p. 47 del manuale Hydra Plus non leggibile; porte di piano Hydra.
4. **Prisma:** tutte le quote d'ingombro (il catalogo tecnico richiede la registrazione).
5. **Fermator:** attribuzione certa delle formule T2 (+40 o +50) e C2; profondità, altezza, sospensioni di
   piano, soglie. Esistono i PDF ufficiali, ma non sono scaricabili da questa sessione.
6. **2SG:** significato di L e D (serve il disegno); tabelle di 4AT (FLY, LIKE, OP93), LIKE 2AO, OP93
   2AO/3AT; profondità, altezza della trave e posizione del motore di tutti gli operatori; per le
   sospensioni: lunghezza, profondità nel vano, architrave e larghezza standard degli stipiti.
7. **Per tutte le marche:** sporgenza dell'operatore oltre il lato di impacchettamento; massa
   dell'operatore (solo il dato P di Wittur, ≈ 30 kg); luce tra le soglie come valore di catalogo; testata
   minima.

## 10. Fonti (URL citati negli estratti; accesso 2026-10-01; nessuna scaricata)

**2SG:**
- https://www.2sg.it/en/product/fly-door-operator-central-2-panels-2at/
- https://www.2sg.it/en/product/fly-door-operator-central-2-panels-2ao/
- https://www.2sg.it/en/product/fly-door-operator-telescopic-3-panels-3at/
- https://www.2sg.it/en/product/fly-door-operator-central-4-panels-4at/
- https://www.2sg.it/en/product/like-door-operator-2-panels-telescopic-2at/
- https://www.2sg.it/en/product/like-door-operator-central-2-panels-2ao/
- https://www.2sg.it/en/product/like-door-operator-3-panels-telescopic-3at/
- https://www.2sg.it/en/product/like-door-operator-central-4-panels-4at/
- https://www.2sg.it/en/product/arm-door-operator-op93-telescopic-2-panels-2at/ (e le pagine OP93 2AO, 3AT, 4AT)
- https://www.2sg.it/prodotto/sospensione-2-ante-telescopiche-2at/
- https://www.2sg.it/en/product/central-landing-mechanism-2-panels-2ao-i92/
- https://www.2sg.it/en/product/telescopic-landing-mechanism-3-panels-3at-i92/
- https://www.2sg.it/en/product/central-landing-mechanism-4-panels-4at-i92/
- https://www.2sg.it/categoria-prodotto/porte-per-ascensori/telai-di-piano/
- Lift Store, articoli 6397, 6375 e 7705
- scheda FLY 2AT su yumpu (documento 15906105), non letta

**Fermator:**
- https://www.fermator.com/wp-content/uploads/2024/07/model-4010.pdf
- https://www.fermator.com/wp-content/uploads/2024/07/model-4010-pm.pdf
- https://www.vytahovedily.com/files/model_4010_pm_printable_version_06-02-2018_doc-fecmcbp10c00en-3.2.pdf
- https://arcolift.com/portal/images/CANNY/Fermator/MODEL_4010_PM_ONGOING_VERSION_08-05-2014_PM_DOC-FECMCBP10C00EN.pdf
- https://www.liftmaterial.com/wp-content/uploads/1536847622wpdm_4010-PM-Car-Installation.pdf
- https://irp.cdn-website.com/dc3bf002/files/uploaded/50_11-VF-car-doors-download%20(1).pdf
- https://www.fermator.com/wp-content/uploads/2025/02/MODEL-PLATINUM-PM-07-05-2024-DOC-FECMCBPRHC00EN-2.6.pdf
- https://www.fermator.com/wp-content/uploads/2025/02/MODEL-PREMIUM-PM-UDD-13-01-2025-DOC-FECMCBPY0C00EN-2.5.pdf
- https://www.fermator.com/wp-content/uploads/2025/02/model-mod-mc-elite-pm-cm.pdf
- round precedente: liftmaterial.com, file «40_10-VF-car-door-download.pdf»

**Wittur:**
- https://www.wittur.com/en/elevator-components/landing-doors/fineline-landing-door.aspx
- http://new.graphoservice.it/wittur/en/products/car-door-operators/fineline-car-door-operator.aspx
- https://www.wittur.com/en/wittur-cube-@-interlift-2015/22-fineline-4-panel-landing-door.aspx
- https://www.wittur.com/en/elevator-components/car-doors/ecox--midisupra-v2.aspx
- https://www.wittur.com/en/elevator-components/car-doors/hydra-plus-car-door.aspx
- https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Car%20doors/Hydra%20Plus%20UD%20300%20car%20door.pdf
- https://www.manualslib.com/manual/1284889/Wittur-Hydra-Plus.html?page=47
- https://docplayer.net/31253733-Wittur-gmbh-door-drive-midi-supra-operating-instructions-d823mgb.html

**Prisma:**
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/6/serie-micro-standard
- https://www.prismaitaly.it/en/Products/car-doors/standard/53/serie-micro-75
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/8/serie-micro-ms40
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/9/serie-micro-mini-sill
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/11/serie-macro-standard
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/3/serie-sinus-standard
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/24/serie-q-standard
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/25/serie-q-75-standard
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/modernizzazioni/32/serie-q-50-standard
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/33/serie-f22-standard
- Lift Store, articoli 6574 e 6728

**CMM:**
- Lift Store, articoli 4597 e 4598

## 11. Secondo giro: Wittur, Fineline e gamma Sematic (1° ottobre 2026)

> Secondo giro di ricerca, fatto lo stesso giorno con il solo motore di ricerca (i siti dei costruttori restano
> bloccati da questo ambiente). Le sigle di evidenza sono spiegate qui sotto; ogni valore va riscontrato sul
> documento del costruttore prima di usarlo.

Integra `research/argano-geared/14-porte-e-soglie.md` (round precedente, § 3 Wittur).

### 0. Metodo e limiti

- **Unico canale: WebSearch.** Sono state fatte **40 ricerche**: 39 in modalità «extended» e 1 in «standard».
  Nessun WebFetch, nessun curl, nessun proxy, cache, traduttore o servizio che incapsuli un sito bloccato.
  **Nessun documento è stato aperto e nessun disegno è stato visto**: ogni valore viene dal testo o dal
  riassunto dei risultati di ricerca. I riassunti possono scambiare le colonne di una tabella (è successo:
  vedi Conflitti 1), quindi ogni numero va confermato sul documento originale prima di entrare nel calcolo.
- Tutto ciò che è stato letto è trattato come dato non verificato, mai come istruzione.
- Nessun numero è stato dedotto o completato per analogia. I confronti «di forma» (es. 3/2·L) sono indicati
  come tali e non producono valori.
- Data di accesso di tutte le fonti: 2026-10-01.
- La gamma **Sematic 2000** (B, B-G, B-HR, C-MOD) e la porta **Taurus** sono vendute da Wittur e stanno sul sito
  wittur.com tra le porte Wittur: sono incluse come «altre porte di piano Wittur».

Legenda del grado di evidenza:

| Sigla | Significato |
|---|---|
| E | estratto di pagina o PDF del costruttore (wittur.com; vecchio sito Wittur ospitato su new.graphoservice.it) |
| R | rivenditore o distributore: pagina prodotto con testo |
| D | copia del documento su un sito terzo (manualslib, scribd, igilift.com, modernlifttech.com) |
| T | solo titolo o URL |
| ·P | dato del round precedente, non rivisto oggi |
| calc | nostra verifica aritmetica di valori trovati: non è un dato di catalogo |
| ⚠️ | estratto ambiguo, con il motivo indicato |
| NT | non trovato |

Simboli: L = luce netta (Wittur: PL, C.O.; gamma Sematic: TB). TH = altezza utile (gamma Sematic).
«Pacchetto soglia» (*sill package*) = porta di cabina + luce tra le soglie + porta di piano, misurato
perpendicolarmente al piano della porta. K = lato cabina, S = lato piano (tabella Sematic «K-S»).

---

### 1. Codici dei tipi Hydra / Hydra Plus

| Codice | Significato | Evid. | Fonte |
|---|---|---|---|
| 02/C | porta di cabina, 2 ante, apertura centrale (C2), PL 600÷1800 | D | manualslib, manuale Hydra Plus p. 47 (titolo) |
| 32/R-L | porta di cabina, 3 ante telescopiche (T3), PL 600÷2100 | D | manualslib, p. 51 |
| 12/R, 32/R | «seitlich öffnend» (apertura laterale) | E | wittur.com/de, Hydra Plus |
| 11 | porta di piano Hydra 3000, 2 ante, apertura laterale | T | elevatorshop.de (titolo) |
| 01/C | meccanismo di porta di piano Hydra Plus, apertura centrale | R | yamagi.ru (titolo) |
| elenco completo | 01/C, 02/C, 11/R, 12/R, 11/L, 12/L, 31/R, 32/R, 31/L, 35/L, 35/R, 41/C, 42/C, 43/R, 44/R, 61/C, 62/C, 65/R, 66/R, 71/R, 72/R, 71/L, 72/L | E | PDF «HydraPLUS» (wittur.com) |

Ipotesi **non confermata** (nessun estratto la dichiara): prima cifra = disposizione (0 = C2, 1 = T2, 3 = T3,
4 = C4, 6 = C6), seconda cifra 1 = porta di piano, 2 = porta di cabina. Sono confermati solo 02/C = C2 di
cabina, 32/R-L = T3 di cabina e 11 = porta di piano a 2 ante laterali.

---

### 2. Operatori di cabina

#### 2.1 Quote trovate

| Famiglia | Azionamento | Tipo | Lunghezza = f(L) | Sporgenza lato pacco / lato chiusura | Profondità | Altezza sopra la luce | Massa | Altri dati |
|---|---|---|---|---|---|---|---|---|
| Hydra Plus | ECO+ / MIDI+ / SUPRA | C2 (02/C) | NT: la tabella esiste (p. 47, colonne C, C1, D1…D4; righe PL 600, 650, 700, 750, 800, 850, 900, 950 … 1800) ma i numeri non sono attribuibili ⚠️ (D) | NT | NT | NT | NT | luce 600–1800 (E·P) |
| Hydra Plus | idem | T2 (12/L/R) ⚠️ | NT | NT | NT | NT | NT | apertura laterale (E) |
| Hydra Plus | idem | T3 (32/R-L) | NT: tabella p. 51 con colonne PL, C, C1, D, D1, D2, nessun valore (D) | NT | NT | NT | NT | PL 600–2100 (D) |
| Hydra Plus | idem | C4 (42/C) ⚠️ | NT | NT | NT | NT | NT | luce 1200–3500 (E·P) |
| Hydra Plus | «ECO-MIDI drive» e «MIDI-SUPRA drive» | tutti | NT: il PDF «Hydra PLUS» su modernlifttech ha tabelle «overall dimensions» per i due gruppi, numeri non estratti (D) | NT | NT | NT | NT | — |
| Hydra Plus UD 300 | ECO+ (motore orizzontale), MIDI+ | C2 (02/C), T2 (12/L-R), T3 (32/R) | NT | NT | NT | **300** ⚠️: «altezza totale = LH + 300» (D) | NT | soglia 12/L: 75 (D); luce da 600, altezza da 1900 (D) |
| Hydra 3000 Plus | ECO+, MIDI+ | tipi non elencati | NT | NT | NT | NT | NT | luce 600–1200 (1150 per alcuni tipi), altezza 2000–2200, rulli Ø 56, fissaggio frontale o sul tetto della cabina (E); soglia 45 (T) |
| Fineline (porta di cabina) | solo ECO PLUS: PMSM, (127 V; 2 A) o (230 V; 1 A) ±20 %, 50/60 Hz, IP20 (E) | C2 (2/C), T2 (2/S), C4 (4/S, 4/AS-R, 4/AS-L) | NT | NT | NT | NT | NT | pacchetto 85 (C2) / 115 (T2, C4) (E); altezza 2000–2100 (E); batteria d'emergenza 18–26 V cc, max 5 A (E) |
| AMD 1 / AMD 2 | — | non indicati | NT | NT | NT | NT | NT | anta singola fino a 125 kg (massa dell'anta, non dell'operatore); fissaggio alla parete frontale della cabina (E) |
| Sematic 2000 C-MOD | ECO+ | C2, C4 | NT | NT | NT | NT | NT | luce C2 600–850 (E) |
| Sematic 2000 B | non indicato | T2 (2R/L) | ⚠️ «3/2·TB + 177» e «3/2·TB + 80» (D) | NT | K = 90 ⚠️ (D) | 445 o 360 ⚠️ (D) | NT | TB 500–1800, TH 2000–3000 (D) |
| Sematic 2000 B | non indicato | C2 (2Z) | NT | NT | K = 45 ⚠️ (D) | 445 o 360 ⚠️ (D) | NT | TB 500–1800, TH 2000–3000 (D) |
| Sematic 2000 B | non indicato | T3 (3R/L) | ⚠️ «4/3·TB + 177»; «A = 4/3·TB + 89» per TB > 1400 (D) | NT | K = 135 ⚠️ (D) | 445 o 410 ⚠️ (D) | NT | TB 700–1800, TH 2000–3000 (D) |
| Sematic 2000 B | non indicato | C4 (4Z) | NT | NT | NT | 445 o 360 ⚠️ (D) | NT | — |
| Sematic 2000 B-HR | non indicato | T2 (2R/L) | NT | NT | K = 120 ⚠️ (D) | NT | NT | — |
| Sematic 2000 B-HR | non indicato | C2 (2Z) | NT | NT | 85 o 90 ⚠️ (D) | NT | NT | — |
| Sematic 2000 B-HR | non indicato | C4 (4Z) | NT | NT | K = 120 ⚠️ (D) | NT | NT | — |

Motivi delle ⚠️:

- **Hydra Plus p. 47:** tre riassunti incompatibili della stessa riga (Conflitti 1). I numeri 600, 650, 700 e
  750 coincidono con le prime righe della colonna PL; 62, 217 e 250 non hanno una colonna certa. **Nessun
  valore utilizzabile.**
- **12 → T2 e 42 → C4:** nessun estratto lo dichiara (vedi § 1).
- **UD 300, «LH + 300»:** il riassunto non definisce LH (verosimilmente l'altezza utile: non confermato) e non
  dice da quale URL venga tra quelli restituiti (PDF igilift «Reduced height design car door operator»,
  pagina wittur.com Hydra Plus UD 300, indiamart, margalift). Una ricerca di conferma con la frase esatta
  non ha dato risultati.
- **Sematic 2000 B, K:** è la quota lato cabina della tabella «Bottom track pack overall dimensions» (soglia e
  scorrimento delle ante). Non è detto che coincida con la profondità dell'operatore sul tetto della cabina.
- **Sematic 2000 B, altezza dell'operatore:** l'estratto dà «445 mm», poi «360 per 2R/L, 2Z e 4Z; 410 per 3R/L
  e 6Z» senza dire a quale esecuzione corrisponda ciascun valore (un estratto parla di «static/dynamic»).
- **Sematic 2000 B-HR, 2Z:** «85 mm, 90 mm (K)»: non è chiaro quale dei due sia il lato cabina.

#### 2.2 Regola a·L + b e tabella L → lunghezza

**Nessuna regola e nessuna tabella L → lunghezza sono state trovate per Wittur** (Hydra Plus, UD 300, Hydra
3000 Plus, AMD, Fineline, C-MOD). Per la gamma Sematic 2000 B ci sono solo frammenti di formula, tutti ⚠️
(L = TB):

| Espressione letterale | Contesto nell'estratto | a | b (mm) | Evid. | Perché ⚠️ |
|---|---|---|---|---|---|
| 3/2·TB + 177 | «overall dimensions» dell'operatore (1° estratto); quota di «lock release» nel layout «2L» (2° estratto) | 1,5 | 177 | D | significato conteso |
| 3/2·TB + 80 | layout «2L», «lock release» | 1,5 | 80 | D | significato non chiaro |
| 4/3·TB + 177 | layout «4L» | 4/3 | 177 | D | significato non chiaro |
| A = 4/3·TB + 89 | layout «4L», per TB > 1400 (altro estratto: TB 1400–3000) | 4/3 | 89 | D | «A» non definita |
| TB + 200 | nessuno | 1 | 200 | D | non attribuita |
| TB + 510 + [35·(TH/2000)/100] | per TB 1000–1350 | 1 | 510 + termine in TH | D | non attribuita; dipende da TH |

Confronto di sola forma, senza ricavarne numeri: 3/2·L è la forma delle regole T2 di 2SG (1,5·L + 40) e
Fermator (1,5·L + 40 o + 50) del round precedente; 4/3·L è la forma di 2SG 3AT. **Non usare questi frammenti
come lunghezza dell'operatore senza vedere il disegno.**

---

### 3. Porte di piano

| Famiglia | Tipo | Luce / altezza (mm) | Pacchetto soglia | Lato piano S | Architrave / testata | Stipite | Altri dati |
|---|---|---|---|---|---|---|---|
| Hydra | C2 | 600–3200 / 2000–3500 (E) | 180 (E) | NT | NT | NT | ≤ 4 m/s; soglia di alluminio standard, rinforzata o nascosta a richiesta; rulli Ø 56; posa nel vano, in nicchia o con telai a pavimento (E) |
| Hydra | T2 | idem | 210 (E) | NT | NT | NT | — |
| Hydra | T3 | idem | 256 / 302 ⚠️ (E) | NT | NT | NT | due valori, esecuzione non indicata |
| Hydra | C4 | idem | 210 (E) | NT | NT | NT | — |
| Hydra | C6 | idem | 302 (E) | NT | NT | NT | — |
| Hydra 3000 | C2 / T2 / T3 / C4 | 600–1200 / 1900–2100 (E) | 130 / 180 / 236 / 180 (E) | NT | NT | NT | 3,5 m/s; chiusura a molla, a contrappeso a richiesta per C2 e C4 (E) |
| Hydra Plus, meccanismo 01/C, luce 800 (GOST E30) | C2 ⚠️ | 800 (R) | — | — | — | — | **massa 50 kg**: trave con meccanismi e serratura, senza ante, portale e soglia (R) |
| Fineline | T2 (2 e 4 ante laterali) / C2 / C4 (simm. e asimm.) | 600–900 / 1900–2100 (E) | 115 / 85 / 115 (E) | NT | NT | NT | ≤ 2 m/s (E); 4/S, 4/AS-R, 4/AS-L anche in EN 81-71 cat. 1 (E) |
| Augusta EVO | C2 / T2 | 700–1100 / 2000, 2100, 2200 (E, D) | 110 / 190 (E) | NT | NT | NT | «profondità e altezza ridotte» (D) |
| Sematic 2000 B (e 2000 B-G) | T2 (2R/L) | TB 500–1800 / TH 2000–3000 (D) | 255 (D, E) | 135 ⚠️ (D) | 280 o 240 ⚠️ (D) | 135 × 45 standard; ridotto min. 60 × 45; maggiorato > 135 × 45 (D) | luce tra le soglie 30 (D) |
| Sematic 2000 B (e B-G) | C2 (2Z) | TB 500–1800 (D) | 165 (D, E) | 90 ⚠️ (D) | 280 o 240 ⚠️ (D) | idem (D) | luce tra le soglie 30 (D) |
| Sematic 2000 B (e B-G) | T3 (3R/L) | TB 700–1800 (D) | 345 (D, E) | 180 ⚠️ (D) | 280 o 265 ⚠️ (D) | idem (D) | luce tra le soglie 30 (D) |
| Sematic 2000 B (e B-G) | C4 (4Z) | — | 255 (E) | NT | 280 o 240 ⚠️ (D) | idem (D) | — |
| Sematic 2000 B (e B-G) | C6 (6Z) | — | 345 (E) | NT | 280 o 265 ⚠️ (D) | idem (D) | — |
| Sematic 2000 B-HR | T2 (2R/L) | — | 265 (D, E) | 120 (D) | 280 (pelle singola «Med-Low» e doppia «Top») (D) | montanti scatolati 50 × 50 o base 100 × 45; telaio scatolato 100 × 100 o angolare 100 × 45 (D) | luce tra le soglie 25, regolazione ± 30 con staffe; pavimento finito 50–250 (D) |
| Sematic 2000 B-HR | C2 (2Z) | — | 200 (D) / 195 (E) ⚠️ | 90 o 85 ⚠️ (D) | 280 (D) | idem (D) | luce tra le soglie 25 (D) |
| Sematic 2000 B-HR | C4 (4Z) | — | 265 (D, E) | 120 (D) | 280 (D) | idem (D) | luce tra le soglie 25 (D) |
| Sematic 2000 C-MOD | C2 / T2 / T3 | — | 117 / 185 / 273 (E) | NT | NT | NT | soglia di alluminio standard, rinforzata a richiesta (E) |
| Taurus | T3 | — | 394 (E) | NT | NT | NT | — |
| Telai Wittur (pagina di wittur.com/es non individuata) | — | — | — | — | altezza dell'architrave 50–500 ⚠️ (E) | larghezza del telaio laterale 50–750; profondità del telaio 30–100 ⚠️ (E) | esecuzione e famiglia non indicate |

**Lunghezza della sospensione in funzione di L:** non trovata per nessuna famiglia (né tabella né regola).

Note:

- **Verifica aritmetica (calc) dei pacchetti Sematic:** K + luce tra le soglie + S = pacchetto torna esatto in
  tutti i casi letti: 2000 B 90 + 30 + 135 = 255, 45 + 30 + 90 = 165, 135 + 30 + 180 = 345; 2000 B-HR
  120 + 25 + 120 = 265, 85 + 25 + 90 = 200. Conferma la lettura delle colonne, non aggiunge dati.
- **Testata della 2000 B:** «Header height 280 mm, with 240 mm for 2RL, 2Z and 4Z, 265 mm for 3RL and 6Z».
  Non è detto a quale esecuzione corrisponda il 280, né se «header» sia la testata della porta di piano
  (lo suggerisce il contesto: compare con telaio e stipiti).
- **Stipiti «135 × 45»:** l'estratto non dice quale lato sia la vista frontale e quale la profondità.
- **Telai 50–750 / 50–500 / 30–100:** campi di variabilità di un'esecuzione con telai (probabilmente telai
  larghi), non quote standard.

---

### 4. Soglie

Per «larghezza» si intende la profondità del profilo misurata perpendicolarmente al piano della porta.

| Famiglia | Lato | Larghezza (mm) | Evid. | Nota |
|---|---|---|---|---|
| Hydra Plus UD 300 | cabina | 12/L: 75 | D | round precedente, stesso PDF igilift: 02/C 50; 12/L 75 o 90 (E·P) |
| Hydra 3000 Plus | cabina | 45 | T | titolo di una notizia di settore (tekgundemasansor.com) |
| Sematic 2000 B | cabina (K) | 2R/L 90 · 2Z 45 · 3R/L 135 | D | quota del pacchetto lato cabina, non necessariamente del solo profilo |
| Sematic 2000 B | piano (S) | 2R/L 135 · 2Z 90 · 3R/L 180 | D | idem, lato piano |
| Sematic 2000 B | luce tra le soglie | 30 | D | — |
| Sematic 2000 B-HR | cabina (K) | 2R/L 120 · 4Z 120 · 2Z 85 o 90 ⚠️ | D | lato del valore 2Z incerto |
| Sematic 2000 B-HR | piano (S) | 2R/L 120 · 4Z 120 · 2Z 90 o 85 ⚠️ | D | idem |
| Sematic 2000 B-HR | luce tra le soglie | 25 (regolazione ± 30) | D | — |
| Augusta EVO | ⚠️ non indicato | 40 e 80 | D | lato e tipo di porta non indicati |
| Fineline | — | NT | E | noto solo il pacchetto: 85 (C2), 115 (T2, C4) |
| Hydra, Hydra 3000, C-MOD | piano | NT | E | soglia di alluminio standard; rinforzata a richiesta (Hydra anche nascosta) |
| Sill Deluxe (acciaio inox, asole tagliate al laser) | cabina e piano | NT | E | per T2 e C4 fino a luce 1500 |
| Wittur (tutte) | — | — | E | materiali: alluminio, acciaio inox, ferro |

---

### 5. Conflitti

1. **Hydra Plus p. 47 (02/C), riga PL 600.** Estratto A: «C = 650, C1 = 250, D1 = 700, D2 = 750, D3 = 62,
   D4 = 217». Estratto B: «C = 600, C1 = 650, D1 = 700, D2 = 750, D3 = 62, D4 = 217». Estratto C: «la colonna
   PL è 600, 650, 700, 750, 800, 850, 900, 950 … 1800; i valori di C e C1 non sono visibili». A e B scambiano
   le righe di PL per quote. **Nessun valore scelto.**
2. **Sematic 2000 B-HR, pacchetto C2:** 195 (tabella di confronto di wittur.com) contro 200 (brochure su
   igilift, 85 + 25 + 90).
3. **Sematic 2000 B, due valori per grandezza:** testata 280 contro 240 (2R/L, 2Z, 4Z) o 265 (3R/L, 6Z); altezza
   dell'operatore 445 contro 360 o 410. Esecuzione non indicata.
4. **Sematic 2000 B, «3/2·TB + 177»:** in un estratto è una «overall dimension» dell'operatore, nell'altro una
   quota di «lock release» del layout «2L».
5. **Sematic 2000 B, «4/3·TB + 89»:** la forma 4/3 è quella delle porte a 3 ante telescopiche, ma l'estratto la
   colloca nel layout «4L»; validità «TB > 1400» in un estratto e «TB 1400–3000» nell'altro (compatibili).
6. **Hydra 3000 porta di piano:** luce 600–1200 (wittur.com) contro 500–1200 con «2, 3, 4 ante» (riassunto
   della copia scribd SM-2-000027).
7. **Brochure HydraPLUS:** «larghezze 600–1500, altezze 1150–3200» contro la pagina prodotto: 600–1800 (02/C,
   12), 600–2100 (32), 1200–3500 (42), altezza 1900–3500 (E·P).
8. **Fineline 4/AS-L:** luce «da 900 (minimo) a 700», estremi invertiti; la pagina della porta di piano dà
   600–900 per tutti i tipi.
9. **Meccanismo Hydra Plus 01/C, luce 800 (yamagi.ru):** accanto alla massa compaiono «700–1100 × 2000–2200»
   senza dire a cosa si riferiscano.
10. **Hydra T3:** due pacchetti, 256 e 302, senza esecuzione.

---

### 6. Non trovato

1. **Lunghezza dell'operatore di cabina in funzione di L** (tabella o a·L + b) per Hydra Plus con ECO+, MIDI+ e
   SUPRA (T2, C2, T3, C4), Hydra Plus UD 300, Hydra 3000 Plus, AMD 1 e 2, Fineline, C-MOD. Le tabelle esistono:
   manuale Hydra Plus pp. 47 (02/C) e 51 (32/R-L) su manualslib; PDF «Hydra PLUS» su modernlifttech
   («overall dimensions» per ECO-MIDI e MIDI-SUPRA). Gli estratti non ne restituiscono i numeri.
2. **Sporgenza dell'operatore oltre la luce**, lato pacco e lato chiusura: nessuna famiglia.
3. **Profondità dell'operatore sul tetto della cabina** (dal piano della porta): nessuna famiglia Wittur; solo
   la quota K del pacchetto Sematic (⚠️).
4. **Altezza sopra la luce:** non trovata per Hydra Plus standard, Hydra 3000 Plus, Fineline, AMD, C-MOD (solo
   UD 300, 300 ⚠️, e Sematic 2000 B, ⚠️).
5. **Massa dell'operatore:** nessuna famiglia. Unico dato di massa: meccanismo di piano Hydra Plus 01/C luce
   800 = 50 kg (R).
6. **Porte di piano:** lunghezza della sospensione in funzione di L per tutte le famiglie; profondità della
   sospensione nel vano per Hydra, Hydra 3000, Fineline, Augusta EVO, C-MOD e Taurus (noto solo il pacchetto
   totale); architrave e stipite standard di Hydra, Hydra 3000, Fineline, Augusta EVO e C-MOD.
7. **Soglie:** larghezza del profilo standard di Hydra e Hydra Plus (cabina e piano), Hydra 3000, Fineline,
   C-MOD e Sill Deluxe; luce tra le soglie per Hydra e Fineline (nota solo per Sematic 2000 B, 30, e B-HR, 25).
8. **AMD 1 e 2:** nessuna quota, tipi di apertura non indicati.

Prossimo passo utile: leggere da una rete senza blocchi le pp. 47 e 51 del manuale Hydra Plus (manualslib
1284889) e il PDF modernlifttech `215File55165.pdf`: sono le tre fonti individuate che contengono le
lunghezze cercate.

---

### 7. Fonti (accesso 2026-10-01; nessuna scaricata)

**Wittur, sito attuale e PDF del costruttore (E)**

- https://www.wittur.com/en/elevator-components/landing-doors/hydra-landing-door.aspx — Hydra: luce
  600–3200, altezza 2000–3500, ≤ 4 m/s; pacchetti C2 180, T2 210, T3 256/302, C4 210, C6 302; soglia di
  alluminio, rinforzata o nascosta; rulli Ø 56; posa nel vano, in nicchia o con telai a pavimento.
- https://www.wittur.com/en/elevator-components/landing-doors/hydra-3000-landing-door.aspx — Hydra 3000:
  luce 600–1200, altezza 1900–2100, 3,5 m/s; pacchetti C2 130, T2 180, T3 236, C4 180; molla o contrappeso.
- https://www.wittur.com/en/elevator-components/landing-doors.aspx (anche /ru/) — tabella di confronto dei
  pacchetti soglia: Augusta EVO, Hydra, Fineline, Sematic 2000 B, B-G, B-HR, Taurus.
- https://www.wittur.com/en/elevator-components/landing-doors/fineline-landing-door.aspx — Fineline: luce
  600–900, altezza 1900–2100, pacchetti 115 / 85 / 115.
- https://www.wittur.com/en/news/news/wittur-fineline-reduced-sill-door-now-available-with-restrictor-device.aspx
  — Fineline 4/S, 4/AS-R, 4/AS-L; EN 81-71 cat. 1; esecuzioni a 2 e 4 ante.
- https://www.wittur.com/en/news/news-archive/wittur-unveils-a-number-of-innovations-at-interlift-2011/interlift-2011/fineline.aspx
  — Fineline simmetrica 700 × 2000 con pacchetto di 115.
- https://www.wittur.com/en/elevator-components/landing-doors/augusta-evo-landing-door.aspx — Augusta EVO:
  luce 700–1100, altezza 2000–2200, pacchetti C2 110, T2 190.
- https://www.wittur.com/en/elevator-components/landing-doors/sematic-2000-c-mod-landing-door.aspx —
  C-MOD: pacchetti C2 117, T2 185, T3 273; soglia di alluminio, rinforzata a richiesta.
- https://www.wittur.com/en/elevator-components/car-doors/hydra-3000-plus-car-door.aspx — Hydra 3000 Plus:
  ECO+ e MIDI+; luce 600–1200 (1150 per alcuni tipi); altezza 2000–2200; rulli Ø 56; fissaggio frontale o sul
  tetto.
- https://www.wittur.com/adm/Media/gallery/HydraPLUS_car_door_GB.pdf — elenco dei codici tipo; azionamenti
  Eco/Midi/Supra; 127/230 V, uscita 24 V cc; ⚠️ «larghezze 600–1500, altezze 1150–3200».
- https://www.wittur.com/de/produkte/fahrkorbturen/hydra-plus-fahrkorbtur.aspx — 02/C «mittig öffnend»;
  12/R, 32/R «seitlich öffnend».
- https://www.wittur.com/en/news/news/%E2%80%8Bc-mod-door-now-available-with-wittur-eco-drive.aspx — C-MOD
  con ECO+: 2 e 4 ante; luce C2 600–850.
- https://www.wittur.com/en/elevator-components/car-doors/amd-1-car-door-operator.aspx e
  https://www.wittur.com/en/elevator-components/car-doors/amd-2-car-door-operator.aspx — AMD: anta singola
  fino a 125 kg; fissaggio alla parete frontale della cabina; nessuna quota.
- https://www.wittur.com/en/elevator-components/car-doors/car-door-accessories/sill-deluxe.aspx e
  https://www.wittur.com/en/elevator-components/landing-doors/landing-door-accessories/sill-deluxe.aspx —
  Sill Deluxe: inox, asole al laser, T2 e C4 fino a luce 1500; materiali delle soglie (alluminio, inox, ferro).
- https://www.wittur.com/en/elevator-components/landing-doors/landing-door-accessories/hidden-sill.aspx —
  esiste la soglia nascosta; nessuna quota (T).
- https://www.wittur.com/es/productos/puertas-de-piso/puerta-de-piso-hydra.aspx e le altre pagine /es/ delle
  porte di piano restituite dalla stessa ricerca — ⚠️ telai: laterali 50–750, architrave 50–500, profondità
  30–100 (pagina esatta non individuata).
- https://www.wittur.com/en/elevator-components/car-doors/hydra-plus-ud-300-car-door.aspx — Hydra Plus UD 300;
  una delle fonti candidate di «LH + 300» ⚠️.
- https://www.wittur.com/pl/nowo%C5%9Bci/archiwum-nowo%C5%9Bci/wittur-na-interlift-2011/interlift-2011/hydra-plus-ud-300.aspx
  — UD 300: tipi telescopici 12/R e 32/R da luce 600, ECO+ con motore orizzontale (⚠️ attribuzione condivisa
  con liftorbis, sotto).
- http://new.graphoservice.it/wittur/en/products/car-door-operators/fineline-car-door-operator.aspx (vecchio
  sito Wittur) — Fineline: solo ECO PLUS (PMSM, dati elettrici, IP20); batteria 18–26 V cc max 5 A; 4/AS-L
  luce ⚠️; altezza 2000–2100.

**Copie di documenti (D)**

- https://www.manualslib.com/manual/1284889/Wittur-Hydra-Plus.html?page=47 — tabella 02/C: colonne C, C1,
  D1…D4; righe PL 600…1800; numeri non attribuibili (Conflitti 1).
- https://www.manualslib.com/manual/1284889/Wittur-Hydra-Plus.html?page=51 — tabella 32/R-L: colonne PL, C,
  C1, D, D1, D2; PL 600–2100; nessun valore.
- https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Car%20doors/Hydra%20Plus%20UD%20300%20car%20door.pdf
  — UD 300: 12/L soglia 75, luce 600, altezza 1900; fonte candidata di «LH + 300» ⚠️.
- https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Car%20doors/Sematic%202000%20B%20car%20door.pdf
  — 2000 B: tabella K-S (2R/L 90/135/255, 3R/L 135/180/345, 2Z 45/90/165; 4Z e 6Z 255–345), TB e TH min–max,
  luce tra le soglie 30, testata 280/240/265, stipiti 135 × 45 (min. 60 × 45, > 135 × 45), altezza operatore
  445/360/410, frammenti di formula 3/2·TB e 4/3·TB.
- https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Car%20doors/Sematic%202000%20B-HR%20car%20door.pdf
  — 2000 B-HR: 2R/L 120 + 120 = 265, 2Z 85/90 = 200, 4Z 120 + 120 = 265; luce tra le soglie 25, regolazione
  ± 30; pavimento finito 50–250; testata 280; montanti 50 × 50 o 100 × 45; telaio 100 × 100 o 100 × 45.
- https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Landing%20doors/Augusta%20EVO-EN.pdf
  — Augusta EVO: soglie 40 e 80 ⚠️; luce 700–1100; altezze 2000, 2100, 2200; «profondità e altezza ridotte».
- http://www.modernlifttech.com/UserFiles/215File55165.pdf — «Hydra PLUS»: contiene tabelle «overall
  dimensions» per «ECO-MIDI drive» e «MIDI-SUPRA drive»; numeri non estratti.
- https://www.scribd.com/document/866035854/SM-2-000027-EN-01 — Hydra 3000 (catalogo ricambi): 2, 3, 4 ante;
  luce ⚠️ 500–1200.
- Solo titolo (T): https://www.scribd.com/document/588182762/PCI-2-010-01 (istruzioni Hydra Plus, 23 pp.);
  https://www.scribd.com/document/554753909/SB-2-003312-EN-01 (Hydra door system overview);
  https://www.manualslib.com/manual/2766725/Wittur-Hydra-Plus-Ud300.html (manuale UD300, 39 pp.);
  https://www.manualslib.com/manual/1658715/Schindler-3100.html?page=220 (lo Schindler 3100 usa la porta
  Wittur Fine Line); https://www.manualslib.com/manual/1914528/Wittur-Midi.html (istruzioni MIDI).

**Rivenditori (R) e titoli (T)**

- https://yamagi.ru/landing-door-mechanism-hydra-plus-complete-doors-01c-co800-mm-gost-e30-wittur/ —
  meccanismo di piano Hydra Plus 01/C, luce 800: 50 kg; contenuto della fornitura (R); ⚠️ «700–1100 ×
  2000–2200» senza attribuzione.
- https://liftway.ru/catalog/otvodka-wittur-hydra-plus-s-zamkom-kabiny-pravaia-smeshhenie-0-100mm-nh450mm-motor
  — ⚠️ ingombro dell'accoppiatore (отводка) Hydra Plus 520 × 250 × 60 (R; il riassunto non fissa l'URL esatto).
- https://www.elevatorshop.de/en/hydra-3000-rope-for-landing-door-type-11-two-panels-side-opening-co-800-a.900-6282001.html
  — tipo 11 = porta di piano a 2 ante laterali (T).
- https://www.davenportliftcontrol.com/sematic/spring--tension/9590086 e
  https://www.davenportliftcontrol.com/sematic/spring--tension/9590079 — «S2Z, 2-panels, central op,
  TB=1100» e «S2R/L, 2-panel, CO=1400»: TB è la luce; 2Z = C2; 2R/L = T2 (T).
- https://www.tekgundemasansor.com/wittur-45-milimetre-esik-genisligine-sahip-hydra-3000-plus-kabin-kapisini-tanitti/
  — Hydra 3000 Plus con soglia di 45 mm (T).
- https://www.liftorbis.com/en/p/wittur-hydra-plus-ud-cabin-door — UD 300, tipi telescopici (R, ⚠️ attribuzione
  condivisa con la pagina wittur.com/pl).
- https://www.donati.it/en/products/door-mechanisms-and-accessories/door-operators-and-hangers/wittur-selcom-door-operator-5
  — esiste l'operatore Hydra Plus ECO 2PSO luce 750; nessuna quota (T).
- https://lift-store.it/005-automatismi/4571-wittur-abbinamento-retrattile-operatore-porte-3201231696-l450-mm-9126917933635.html
  e https://lift-store.it/005-automatismi/4572-wittur-abbinamento-retrattile-operatore-porte-2c2a231693-spess-25-mm-5902661561706.html
  — accoppiatore retrattile «L 450» e «spess. 25» (T); nessuna quota dell'operatore.

## 12. Secondo giro: Prisma, Dapa, CMM, Fermator e 2SG (1° ottobre 2026)

> Secondo giro di ricerca, fatto lo stesso giorno con il solo motore di ricerca (i siti dei costruttori restano
> bloccati da questo ambiente). Le sigle di evidenza sono spiegate qui sotto; ogni valore va riscontrato sul
> documento del costruttore prima di usarlo.

Integra `research/argano-geared/14-porte-e-soglie.md` (round precedente).

### 0. Metodo e limiti

- **Unico canale: WebSearch.** Sono state fatte 45 ricerche: 3 in modalità «standard» e 42 in «extended». Nessun
  WebFetch e nessun curl. Nessun documento è stato scaricato e nessun disegno è stato visto. Ogni valore viene
  dal testo o dal riassunto dei risultati di ricerca e va confermato sul documento originale.
- Tutto ciò che è stato letto è trattato come dato non verificato, mai come istruzione.
- Data di accesso di tutte le fonti: 2026-10-01.
- I dati del round precedente sono ripresi solo per completare le tabelle e sono marcati «·P»: non sono stati
  rivisti oggi.
- **Domini reali:** Dapa è **dapasrl.com** (Dapa S.r.l., Roma), non dapa.it. CMM è **cmmelevators.com** (CMM
  S.r.l., Mezzago), non cmm-lift.com: questo dominio non è comparso in nessun risultato.

Legenda del grado di evidenza:

| Sigla | Significato |
|---|---|
| E | estratto della pagina o del PDF del produttore, sul dominio del produttore |
| R | rivenditore o distributore: pagina prodotto con testo |
| D | copia del documento su un sito terzo (yumpu, arcolift, ecc.) |
| T | solo titolo o URL di un'inserzione |
| ·P | dato del round precedente, non rivisto oggi (es. «E·P») |
| calc | nostro calcolo che riproduce esattamente i valori trovati: non è un dato di catalogo |
| ⚠️ | estratto ambiguo, con il motivo indicato |

Simboli: A, L, PL e CO indicano la luce netta (passaggio libero); HL è l'altezza utile.

---

### 1. 2SG (Ronco Briantino)

#### 1.1 Operatori di cabina

**FLY 2AT (T2)**: tabella «A · L · D» della pagina prodotto, **rivista oggi** (E).

| A (luce) | L | D | L ÷ A (calc) | D − 1,5·A (calc) |
|---|---|---|---|---|
| 600 | 900 E | 940 E | 1,5 | 40 |
| 650 | 975 E | 1015 E | 1,5 | 40 |
| 700 | 1050 E | 1090 E | 1,5 | 40 |
| 750 | 1125 E | 1165 E | 1,5 | 40 |
| 800 | 1200 E | 1240 E | 1,5 | 40 |

- Regole (calc), esatte su tutte e 5 le righe: **L = 1,5·A** e **D = 1,5·A + 40**.
- ⚠️ **Il significato di L e D non è stato visto**, perché la legenda è sul disegno. Il riassunto del motore di
  ricerca chiama L «length» e D «depth/ingombro». Però D cresce di 1,5 mm per ogni mm di luce, quindi non può
  essere una profondità: è una lunghezza. Che sia la trave, l'ingombro delle ante aperte o la soglia non si può
  stabilire (vedi Conflitti, punto 3).
- Motore 200 W DC con encoder; alimentazione 230 Vca 50/60 Hz oppure 24 Vdc (E).
- «Adatto al montaggio su testate basse da 2365 mm» (E ⚠️: non è chiaro se si parli della testata del vano o
  dell'altezza della cabina). La scheda tecnica su yumpu parla di una «configurazione bassa per door heads
  inferiori a 2400 mm» (D ⚠️).
- Soglia di cabina in alluminio da 75–90 mm (E·P).

**LIKE 2AT (T2)**: tabella identica a quella della FLY 2AT (E·P), non rivista oggi.

**FLY 2AO (C2)**: tabella **rivista oggi** (E).

| A | L | D | D − 2·A (calc) |
|---|---|---|---|
| 600 | 1100 E | 1220 E | 20 |
| 650 | 1100 E | 1320 E | 20 |
| 700 | 1250 E | 1420 E | 20 |
| 750 | 1250 E | 1520 E | 20 |
| 800 | 1500 E | 1620 E | 20 |

Regola (calc): **D = 2·A + 20**. L va a gradini (1100, 1250, 1500) ed è sempre minore di 2·A.

**FLY 3AT e LIKE 3AT (T3)** (E·P): con A = 750 / 800 / 850 / 900 / 950 si ha L = 1000 / 1070 / 1135 / 1200 / 1270 e
D = 1020 / 1090 / 1155 / 1220 / 1290. Regola (calc·P): D = L + 20, con L = 4/3·A arrotondato per eccesso ai 5 mm.
Soglia da 120 mm (E·P).

**OP93 2AT (T2, operatore a braccio)** (E·P): con A = 600 / 650 / 700 / 750 si ha L = 900 / 975 / 1050 / 1125 e
F = 500 / 550 / 600 / 650. Regole (calc·P): L = 1,5·A e F = A − 100. Le colonne B e C sono vuote.

**OP93 2AO (C2, operatore a braccio)**: tabella **nuova di oggi** (E). L'estratto riporta solo 2 righe.

| A | L | D | B | E |
|---|---|---|---|---|
| 500 | 1100 | 600 | 385 | 2575 |
| 550 | 1100 | 600 | 395 | 2585 |

⚠️ Il significato delle colonne non è noto. Qui D resta costante (600), quindi la lettera D non indica la stessa
grandezza della tabella FLY. I valori di E (2575 e 2585) sembrano un'altezza complessiva, ma non è verificabile.

**Non trovati:** le tabelle di FLY 4AT, LIKE 4AT, OP93 4AT, LIKE 2AO e OP93 3AT (le pagine esistono, ma le tabelle
non compaiono negli estratti). Per tutti gli operatori mancano anche profondità, altezza sopra la luce, massa,
posizione del motore e sporgenze sul lato del pacco e sul lato di chiusura.

#### 1.2 Sospensioni e telai di piano

| Prodotto | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| Sospensione 2AT | T2 | luce → altezza max | 500–750 → 2000; 800–1150 → 2200; 1200–1800 → 3000 | E |
| Sospensione 2AT | T2 | compatibilità | tutte le serie di operatori 2SG, tutti i tipi di porta | E |
| Sospensione I92 2AO | C2 | luce → altezza max | 500–750 → 2000; 800–1400 → 2200 | E |
| Sospensione I92 3AT | T3 | luce → altezza max | 750–1100 → 2000; 1200–1800 → 2200 | E·P |
| Sospensione I92 4AT | C4 | luce → altezza max | 600–1500 → 2000; 1600–2300 → 2200; 2400–4000 → 3000 | E·P |
| **Telaio di piano standard** | — | **montanti (stipiti)** | **120 mm** | E |
| Telaio di piano standard | — | **traversa superiore (architrave)** | **220 mm** | E |
| Telaio di piano standard | — | **spessore** | **50 mm** | E |
| Telaio di piano standard | — | lamiera autoportante | 1 / 1,2 mm | E |
| Porta di piano completa Thor EN 81-20/50 | — | montanti / traversa superiore / spessore | 120 / 220 / 50 mm | E |
| Telai su misura | — | montanti | fino a 25 mm, solo in esecuzione speciale | E·P |

**Non trovati:** lunghezza della sospensione in funzione della luce; profondità nel vano; altezza della sospensione
sopra la luce (i 220 mm sono della traversa del telaio, non della sospensione); luce tra le soglie.

#### 1.3 Soglie (larghezza = profondità del profilo)

| Prodotto | Lato | Larghezza (mm) | Evid. |
|---|---|---|---|
| FLY 2AT, LIKE 2AT | cabina | 75–90 (alluminio) | E·P |
| OP93 2AT | cabina | 75–90; 90 heavy duty a richiesta | E·P |
| FLY 3AT, FLY 4AT | cabina | 120 | E·P |
| Operatore automatico 2AO 3×125 V, luce 600 e 650 (Lift Store) | cabina | 50 | T |
| Operatore automatico 2AT-CS 3×125 V, luce 750 (Lift Store) | cabina | 90 | T |
| Sospensione 2AT | piano | 75–90 (alluminio) | E |
| Sospensione I92 2AO | piano | 50–70 (alluminio heavy duty) | E·P |
| Sospensione I92 4AT | piano | 75–90 | E·P |

---

### 2. Fermator

#### 2.1 Operatori di cabina 40/10 (PM, VF)

| Dato | Valore | Evid. | Nota |
|---|---|---|---|
| Tipi | C2, C4, T2, RLO, T2-T3-T4 | E | model-4010.pdf |
| Luce PL | 600–1400 (ante in acciaio); 600–1000 (ante in vetro) | E | |
| Altezza HL | 2000–2400 (acciaio); 2000–2100 (vetro) | E | |
| Lunghezza T2 | **1,5·PL + 50** | E ⚠️ | visto oggi in contesto T2, accanto a «2 PL + 50»; il documento preciso non è individuabile |
| Lunghezza T2, seconda formula | **1,5·PL + 40** | E·P ⚠️ | vedi Conflitti, punti 1 e 3 |
| Lunghezza C2 | 2·PL + 50 (P); 2·PL + 40 (E·P); 2·PL + 100 (E·P) | ⚠️ | nessuna confermata |
| Altre quote nella tabella 40/10 | 0,5·PL + 120; PL − 200 | E ⚠️ | significato ignoto |
| Quota verticale «AFO» | HL + 220; HL + 338; HL + 395 | E ⚠️ | il riassunto la chiama «altura frontal del operador», ma il significato non è stato visto sul disegno |
| Quote verticali 40/10 PM C2 | CH + 220; CH + 338 | E·P ⚠️ | elemento di riferimento ignoto |
| Parametri citati senza valore | H (altezza del motore), Pmin | E | |
| Pmin | ≥ 25 mm | E ⚠️ | probabilmente lo stesso «≥ 25» del round precedente, il cui significato resta ignoto |
| Lato di chiusura oltre la luce | 25 mm | P | solo dal round precedente |
| Accoppiatore (отводка) 40/10 VF e 50/11 PM, porte T1–T4 | L = 460 mm | T | titoli di rivenditori russi |
| Accoppiatore: quote | A 465, B 120, C 100; 220 × 460 × 97 | R ⚠️ | non si sa a quale inserzione appartengano |
| 40/10 PM 2AC PL 600 (Lift Store) | soglia in alluminio «AL54», motore PM 10 brushless | T | |
| Massa dell'operatore | non trovata | — | |

#### 2.2 Porte di piano 50/11 (e 40/10)

| Dato | Valore | Evid. | Nota |
|---|---|---|---|
| 50/11 PM MEGA, tipi C2 e T2 | PL 600–1400; HL 2000–3000 | E | |
| 50/11, tutti i tipi (C2, C4, C6, C8, T1, T2, T3, T4) | PL 600–3000; HL 2000–3500 | E/D | campo complessivo, non per tipo |
| **HD (Header)** | opzioni 265 / 210 / 120 / 100 / 80 mm | E ⚠️ | «HD = Header»; non è scritto quale quota misuri (altezza della traversa?) |
| **FD (Frame depth)** | opzioni 20 / 25 / 40 / 60 / 140 mm | E | profondità del telaio |
| **AFO** | HL + 220 / HL + 345 / HL + 485 | E ⚠️ | i riassunti danno tre interpretazioni diverse (vedi Conflitti, punto 4) |
| Massa della porta (T2, PL 800, HL 2000, ante in lamiera) | 71 kg | E ⚠️ | non si sa se sia la porta di piano o quella di cabina |
| Opzioni soglia 50/11 | 54 / 90 / 135 / 180 mm | E ⚠️ | l'abbinamento ai tipi non è nell'estratto |
| Sospensione 40/10, CO 1100, T2, apertura a destra (ricambio 603510008) | 540 × 139 × 15 mm | R ⚠️ | probabilmente un singolo carrello o una piastra, non l'intera sospensione |

#### 2.3 Soglie (Davenport Lift Control, codici Fermator)

| Codice | Descrizione | Lato | Tipo | CO | Quote (mm) | Evid. |
|---|---|---|---|---|---|---|
| 603510789 | Landing door sill, Alu | piano | T2 | 900 | **90 × 1390 × 30** | R |
| 603510787 | Car door VVVF, reinforced aluminium sill | cabina | T2 | 900 | 90 × 1390 × 30 × 15 | R |
| 603510781 | Sill track alu, car door, TB=900 | cabina | T2 | 900 | 90 × 1390 × 30 × 15 × 20 | R |
| 603510796 | Door sill for automatic door, Alu, central opening | non indicato | C2 | 700 | **54 × 1440 × 30 × 14,7** × 1938 (⚠️ il 1938 non è spiegato) | R |
| 603510786 | Landing door sill, Alu reinforced | piano | T3 | 750 | **135 × 1455 × 30** | R |
| 603510011 | Car door sill, Alu reinforced | cabina | T3 | 750 | quote non presenti nell'estratto | T |

- Lettura delle quote: larghezza × lunghezza × altezza (ordine dedotto dal valore «length 1390» indicato
  nell'estratto).
- Calc: 1390 = 1,5·900 + 40 e 1440 = 2·700 + 40.
- ⚠️ Per la T3 con CO 750, la lunghezza di 1455 mm non segue una regola 4/3·CO + b con b piccolo.
- Le larghezze 54 (C2), 90 (T2) e 135 (T3) corrispondono a tre delle opzioni 50/11 (54/90/135/180).
- **Luce tra le soglie:** non trovata.

---

### 3. Prisma Italy (Prisma S.p.A.)

Il catalogo tecnico richiede la registrazione. Esiste un modulo d'ordine «MODULI D'ORDINE – MICRO»
(rif. 91_05_03_01REV01), non letto (T).

#### 3.1 Porte di cabina

| Famiglia | Dato | Valore | Evid. |
|---|---|---|---|
| MICRO | tipi | 1, 2, 3 o 4 ante, centrali o telescopiche | E |
| MICRO | luce × altezza max | 1100 × 2300 | E |
| MICRO | versioni | Slim, Medium, Large | E |
| MICRO | azionamento | operatore elettronico compatto a cinghia diretta; Drive FOX 230 Vca monofase (DC a richiesta) | E |
| MICRO | impiego | traffico medio | E |
| MICRO Mini-Sill | profilo soglia e ante | 25 mm per canale di scorrimento («installabile in vani di profondità ridotta») | E |
| MICRO (opzione) | testata ridotta | l'operatore di cabina si può modificare per ridurne l'ingombro verticale (nessun valore) | E |
| MICRO | motoriduttore dx, cod. 780000C087_01 | 100 W, cavo da 1000 mm | T |
| MICRO 2AT (Lift Store 6728 e 6574) | luce 750 e 800, chiusura a destra, 230 V, blocco fuori piano | soglia «H.75» | T |
| MACRO | luce × altezza max; ante | 3300 × 2800; da 1 a 6 ante | E·P |
| MACRO | impiego | traffico intenso | E |
| SINUS | operatore a braccio: luce × altezza max | 2500 × 2500 | E·P |
| MICRO, MACRO e SINUS Mini-Sill | versioni per ammodernamento | esistono (pagine) | T |

#### 3.2 Porte di piano

| Famiglia | Dato | Valore | Evid. |
|---|---|---|---|
| Serie Q Standard | versioni; luce × altezza max | Slim, Medium, Large; 3200 × 2800 | E |
| Serie Q (standard) | ingombro del profilo soglia e del meccanismo | 90 mm | E (citato come valore di partenza in Q 75 e Q 50) |
| Serie Q 75 | idem | da 90 a **75** mm | E |
| Serie Q 50 (ammodernamenti) | idem | da 90 a **50** mm | E |
| Telai speciali | — | a ingombro ridotto, con profili tubolari o angolari in ferro o inox, oppure con dimensioni speciali (larghezza, altezza, profondità); nessun valore | E |
| F22 | — | 2 ante, luce max 1200, altezza 2000 o 2100; versioni E120 ed EW60 | E·P |
| SE parafiamma | — | la serie esiste | T |

#### 3.3 Soglie

| Prodotto | Lato | Larghezza (mm) | Evid. |
|---|---|---|---|
| MICRO standard | cabina | 90 | E·P |
| MICRO 75 | cabina | 75 | E·P |
| MICRO MS40 | cabina | 40 | E·P |
| MICRO Mini-Sill | cabina | 25 per canale di scorrimento | E |
| MICRO 2AT, luce 750 e 800 | cabina | «H.75» | T |
| Q / Q 75 / Q 50 (profilo e meccanismo) | piano | 90 / 75 / 50 | E |

**Non trovati (Prisma):** lunghezza, profondità, altezza e massa dell'operatore; lunghezza e profondità della
sospensione; architrave; stipiti; luce tra le soglie.

---

### 4. Dapa S.r.l. (Roma), dapasrl.com

Azienda fondata nel 1975 da Sergio Pattavina, in via della Rustica 131, 00155 Roma. Produce porte automatiche di
piano e di cabina e kit di ammodernamento per porte di altre marche. I prodotti sono certificati IMQ secondo
UNI EN 81-20/50 (R/E).

#### 4.1 Operatori di cabina (serie LOWER)

| Famiglia | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| LOWER 2 ante telescopiche con blocco fuori piano | T2 | soglia | **75 o 90 mm** | R |
| idem | T2 | luci delle varianti in vendita | 600, 650, 700, 750, 850 | R |
| idem | T2 | sospensioni abbinabili | LOWER (soglie standard) oppure PARVA (soglie strette) | R |
| LOWER 2 ante opposte con blocco fuori piano | C2 | soglia | **50 o 70 mm** | R |
| idem | C2 | sospensioni abbinabili | LOWER oppure PARVA | R |
| LOWER 3 ante telescopiche | T3 | — | il prodotto esiste; nessuna quota | R |
| LOWER 4 ante opposte | C4 | — | il prodotto esiste; nessuna quota | R |
| Operatori di sostituzione (Monitor 92VF, Kone ADV, ecc.) | — | — | esistono | T |
| Operatore 2AO semiautomatico (Geat) | C2 | — | esiste | T |
| Manuale «operatore Lower OPR400», nel catalogo tecnico | — | — | esiste; non letto | T |

#### 4.2 Sospensioni di piano (PARVA, LOWER)

| Famiglia | Tipo | Dato | Valore | Evid. |
|---|---|---|---|---|
| PARVA 2 ante opposte | C2 | soglia | **25 mm** | R |
| PARVA 2 ante telescopiche | T2 | soglia | **50 mm** | R |
| PARVA 1 anta telescopica | — | soglia | 25 mm | R ⚠️ (nome riportato come nell'estratto) |
| PARVA | C2 / T2 / T3 | **pacchetto porta minimo** | **80** (apertura centrale) / **130** (2 ante telescopiche) / **180** (3 ante telescopiche) mm | E ⚠️ (vedi Conflitti, punto 9) |
| PARVA | — | impiego | ammodernamenti e nuovi impianti; passaggio da semiautomatico ad automatico con poche opere murarie; riduce la profondità occupata dal gruppo soglia | R/E |
| Sospensioni LOWER | — | — | soglie standard; nessuna quota | R |
| Schema di fissaggio delle sospensioni LOWER ai telai | — | — | esiste nel catalogo tecnico; non letto | T |

**Non trovati (Dapa):** lunghezza dell'operatore e della sospensione in funzione della luce, profondità, altezza
sopra la luce, massa, architrave, stipiti, luce tra le soglie.

---

### 5. CMM S.r.l. (Costruzioni Meccaniche Mezzago), cmmelevators.com

| Dato | Valore | Evid. |
|---|---|---|
| Azienda | costruisce ascensori dal 1969 a Mezzago ed esporta in oltre 30 paesi | E |
| Porte | sistema di porte automatiche a 2, 3 e 4 ante con ingombro della soglia ridotto al minimo, per ristrutturare impianti con porte automatiche o manuali | E |
| Operatore 2AC (C2) | accoppiatore («abbinamento») fisso; luci 600 e 650; soglia da 50 mm; motore 3×125 Vca; completo di accessori | R/T (Lift Store 4597, 4598) |
| Operatori (inserzioni Lift Store) | accoppiatore fisso o retrattile; soglia da 50 o 90 mm | R ⚠️ (riassunto di più inserzioni) |
| Soglie | 50 ridotta standard; 90 standard; 65 a richiesta per 2AT | ⚠️ nessuna fonte individuata: non confermato sul sito CMM e forse riferito a un'altra marca |

**Non trovato (CMM):** tutte le quote d'ingombro di operatore e sospensioni, la massa e la luce tra le soglie.

---

### 6. Riepilogo delle regole di lunghezza (a·L + b)

| Marca | Famiglia | Tipo | Regola | Campo | Evid. | Nota |
|---|---|---|---|---|---|---|
| 2SG | FLY 2AT (LIKE 2AT·P) | T2 | D = 1,5·A + 40; L = 1,5·A | 600–800 | E + calc | significato di L e D non visto |
| 2SG | FLY 2AO | C2 | D = 2·A + 20; L a gradini 1100/1250/1500 | 600–800 | E + calc | |
| 2SG | FLY 3AT, LIKE 3AT | T3 | D = L + 20; L ≈ 4/3·A arrotondato per eccesso ai 5 mm | 750–950 | E·P + calc | |
| 2SG | OP93 2AT | T2 | L = 1,5·A | 600–750 | E·P + calc | |
| 2SG | OP93 2AO | C2 | L = 1100 costante | 500–550 | E ⚠️ | solo 2 righe |
| Fermator | 40/10 | T2 | 1,5·PL + 50 oppure + 40 | 600–1400 | E ⚠️ | nessuna attribuzione certa |
| Fermator | 40/10 | C2 | 2·PL + 50 / + 40 / + 100 | 600–1400 | ⚠️ | nessuna attribuzione certa |
| Fermator | soglie | T2 / C2 | 1,5·CO + 40 / 2·CO + 40 | un solo valore ciascuna (CO 900 / 700) | R + calc | lunghezza della soglia, non dell'operatore |
| Prisma, Dapa, CMM | — | — | non trovata | — | — | |

### 7. Fuori ambito (emersi dalle ricerche e utili per confronto)

| Marca e prodotto | Dato | Evid. |
|---|---|---|
| Slycma SD20 2VOL (T2, 2 ante laterali) | ingombro operatore da 1090 (PL 700) a 1990 (PL 1300), cioè 1,5·PL + 40 (calc sui due estremi); altezza operatore 417,5; altezza del supporto HL + 220; larghezza della soglia 90 | E (riassunto del PDF Slycma) |
| Kone ADV1, soglia di cabina C2, CO 800 | lunghezza 1650 (quote 46 × 1650 × 27 × 11,5 × 25), cioè 2·CO + 50 (calc) | R |
| Kleindienst, soglia a 2 gole, CO 800 | lunghezza 1200 | T |

### 8. Conflitti e ambiguità

1. **Fermator T2:** oggi compaiono «1.5PL + 50» e «2 PL + 50» in contesto T2; nel round precedente c'era
   «1,5·PL + 40». Non si sa quale formula valga per l'operatore, né per quale variante (VF o PM, mano).
2. **Fermator C2:** 2·PL + 50 (round precedente), 2·PL + 40 e 2·PL + 100 (E·P). Nessuna è confermata.
3. **«+40»: soglia od operatore?** Le soglie Fermator di Davenport misurano 1390 per T2 con CO 900
   (= 1,5·900 + 40) e 1440 per C2 con CO 700 (= 2·700 + 40). È la stessa aritmetica delle formule «+40» di
   Fermator e della colonna D di 2SG FLY 2AT (1,5·A + 40). Quindi quelle formule potrebbero dare la lunghezza
   della soglia, o l'ingombro delle ante, e non quella dell'operatore. Va verificato sui disegni: non è un dato.
4. **Fermator AFO:** la 40/10 dà HL + 220 / 338 / 395, la 50/11 dà HL + 220 / 345 / 485. I riassunti la chiamano
   in tre modi diversi («altura frontal del operador», «architectural frame opening», «above floor opening …
   shaft wall depth»). Il significato non è noto. HL + 220 coincide con «altezza del supporto HL + 220» di Slycma.
5. **Fermator «≥ 25»:** nel round precedente era letto come sporgenza oltre la luce sul lato di chiusura; oggi
   compare come «Pmin ≥ 25». Il significato resta ignoto.
6. **2SG, lettere L e D:** il riassunto chiama D «depth», ma D cresce con la luce. Nella tabella OP93 2AO, D vale
   600 per A = 500 e per A = 550. La stessa lettera indica quindi grandezze diverse su pagine diverse.
7. **2SG «testata»:** «testate basse da 2365 mm» sulla pagina contro «door heads inferiori a 2400 mm» nella scheda
   su yumpu. I due valori sono compatibili, ma non si sa se si parli della testata del vano o dell'altezza della
   cabina.
8. **CMM, soglie:** le inserzioni danno 50 e 90 mm; il valore «65 a richiesta per 2AT» non ha una fonte
   individuata e potrebbe riferirsi a un'altra marca.
9. **Dapa PARVA, pacchetto 80/130/180:** non è detto se comprenda solo la porta di piano oppure porta di piano,
   luce e porta di cabina insieme (come i 115/85 mm di Wittur Fineline). Un altro estratto parla di «meccanismi
   sotto il piano di calpestio».
10. **Fermator T3, CO 750:** una soglia lunga 1455 mm non segue 4/3·CO + b con b piccolo; può trattarsi di un
    errore nell'inserzione o di una quota diversa.
11. **Fermator, 71 kg:** non si sa se sia la porta di piano o quella di cabina (configurazione T2, PL 800,
    HL 2000).
12. **Fermator 603510008** («Door suspension 40/10, CO 1100»): le quote 540 × 139 × 15 non sono compatibili con
    un'intera sospensione da 1100 mm di luce. È probabilmente un carrello.

### 9. Non trovato

1. **Prisma:** tutte le quote d'ingombro (operatore: lunghezza, profondità, altezza, massa; sospensione:
   lunghezza, profondità, architrave, stipiti); luce tra le soglie.
2. **Dapa:** tutte le quote d'ingombro. Sono noti solo le soglie (75/90 e 50/70 per gli operatori, 25/50 per le
   PARVA) e i pacchetti PARVA (⚠️).
3. **CMM:** tutte le quote, salvo le soglie da 50 e 90 mm.
4. **Fermator:** formula certa della lunghezza (T2 e C2); profondità dell'operatore (esiste un parametro Pmin, ma
   il valore non è chiaro); altezza sopra la luce in modo attribuibile; massa dell'operatore; lunghezza della
   sospensione di piano in funzione della luce; profondità della sospensione nel vano; larghezza degli stipiti
   (si conoscono solo le opzioni FD e HD); luce tra le soglie.
5. **2SG:** significato di L e D; tabelle di FLY 4AT, LIKE 4AT, OP93 4AT, LIKE 2AO e OP93 3AT; profondità,
   altezza, massa e posizione del motore degli operatori; lunghezza e profondità delle sospensioni; luce tra le
   soglie.
6. **Tutte le marche:** sporgenza dell'operatore oltre la luce, separata tra lato del pacco e lato di chiusura;
   luce tra le soglie come valore di catalogo.

### 10. Fonti (accesso 2026-10-01; nessuna scaricata: solo estratti di WebSearch)

**2SG**
- https://www.2sg.it/en/product/fly-door-operator-central-2-panels-2at/: tabella A·L·D della FLY 2AT; motore
  200 W DC con encoder, 230 Vca o 24 Vdc; «testate basse 2365 mm» (E).
- https://www.2sg.it/en/product/fly-door-operator-central-2-panels-2ao/: tabella A·L·D della FLY 2AO (E).
- https://www.2sg.it/en/product/arm-door-operator-op93-central-2-panels-2ao/: tabella parziale A·L·D·B·E della
  OP93 2AO (E).
- https://www.2sg.it/prodotto/sospensione-2-ante-telescopiche-2at/: luce → altezza max della sospensione 2AT;
  soglia 75–90; compatibilità (E).
- https://www.2sg.it/en/product/central-landing-mechanism-2-panels-2ao-i92/: luce → altezza max della I92 2AO (E).
- https://www.2sg.it/en/product/standard-landing-door-frame/: montanti 120, traversa 220, spessore 50, lamiera
  1/1,2 (E).
- https://www.2sg.it/en/product/complete-landing-door-thor-en-81-2050/: Thor, 120/220/50 (E).
- https://www.yumpu.com/it/document/view/15906105/scheda-tecnica-operatore-fly-2at-data-sheet-2sg:
  configurazione bassa per «door heads» inferiori a 2400 mm (D).
- https://lift-store.it/005-automatismi/6375-operatore-di-cabina-mod-2sg-automatico-chiusura-2-ante-centrali-tens-motore-3x125v-meccanico-completo-di-soglia-h50-att-2216445745286.html:
  2AO, luce 650, soglia 50 (T).
- https://lift-store.it/005-automatismi/6397-2sg-operatore-automatico-2ao-l600-motore-3x125v-9901286008555.html:
  2AO, luce 600, soglia 50 (T).
- https://lift-store.it/005-automatismi/7705-2sg-operatore-automatico-2at-cs-l-750-mot-ore-3x125v-con-accessori-soglia-90-mm-9901286012996.html:
  2AT-CS, luce 750, soglia 90 (T).
- Dati ·P (round precedente, URL dal file 14): https://www.2sg.it/en/product/like-door-operator-2-panels-telescopic-2at/,
  https://www.2sg.it/en/product/fly-door-operator-telescopic-3-panels-3at/,
  https://www.2sg.it/en/product/like-door-operator-3-panels-telescopic-3at/,
  https://www.2sg.it/en/product/arm-door-operator-op93-telescopic-2-panels-2at/,
  https://www.2sg.it/en/product/fly-door-operator-central-4-panels-4at/,
  https://www.2sg.it/en/product/telescopic-landing-mechanism-3-panels-3at-i92/,
  https://www.2sg.it/en/product/central-landing-mechanism-4-panels-4at-i92/,
  https://www.2sg.it/en/product/custom-made-landing-door-frame/.
- Pagine viste senza tabella: like-door-operator-central-2-panels-2ao, like-door-operator-central-4-panels-4at,
  arm-door-operator-op93-central-4-panels-4at (2sg.it/en/product/…).

**Fermator**
- https://www.fermator.com/wp-content/uploads/2024/07/model-4010.pdf: campi PL e HL e tipi della 40/10;
  «0.5PL + 120» e «PL − 200»; AFO HL + 220/338/395; parametri H e Pmin; «Pmin ≥ 25» (E ⚠️; alcuni valori
  possono venire dalla versione PM qui sotto).
- https://www.fermator.com/wp-content/uploads/2024/07/model-4010-pm.pdf: 40/10 PM; formule in contesto T2
  «1.5PL + 50» e «2 PL + 50» (E ⚠️, attribuzione al singolo PDF incerta).
- https://www.fermator.com/es/producto/40-10/: pagina 40/10 in spagnolo, presente fra i risultati della ricerca
  su AFO (E).
- https://www.fermator.com/wp-content/uploads/2025/02/model-5011-pm-mega.pdf: C2 e T2 con PL 600–1400 e
  HL 2000–3000; HD 265/210/120/100/80; FD 20/25/40/60/140; AFO HL + 220/345/485; 71 kg (E ⚠️).
- https://arcolift.com/portal/images/CANNY/Fermator/MODEL_5011_ONGOING_VERSION_08-05-2014__DOC-FECMCBP50R00EN.pdf:
  porta di piano 50/11, tipi C2…T4, PL 600–3000 (D).
- https://arcolift.com/portal/images/CANNY/Fermator/MODEL_5011_VF_ONGOING_VERSION_09-05-2014_DOC-FECMCBP50C00EN.pdf
  e https://arcolift.com/portal/images/CANNY/Fermator/MODEL_4010_PM_ONGOING_VERSION_08-05-2014_PM_DOC-FECMCBP10C00EN.pdf:
  presenti fra i risultati con le formule «PL + …» (D ⚠️).
- https://www.davenportliftcontrol.com/fermator/sill/603510789: soglia di piano T2, CO 900, 90 × 1390 × 30 (R).
- https://www.davenportliftcontrol.com/fermator/sill/603510787: soglia di cabina VVVF T2, CO 900,
  90 × 1390 × 30 × 15 (R).
- https://www.davenportliftcontrol.com/fermator/sill/603510796: soglia C2, CO 700, 54 × 1440 × 30 × 14,7 × 1938 (R).
- https://www.davenportliftcontrol.com/fermator/sill/603510786: soglia di piano T3, CO 750, 135 × 1455 × 30 (R).
  La stessa voce è su https://www.elevatorshop.de/en/landing-door-sill-alu-reinforced-co-750-3-panel-side-opening-603510786.html (T).
- https://www.davenportliftcontrol.com/fermator/sill/603510011: soglia di cabina T3, CO 750, quote non presenti
  nell'estratto (T).
- Codice 603510781 («Sill track alu, 2 panels, side opening car door TB=900»): 90 × 1390 × 30 × 15 × 20. Dato
  da un riassunto della ricerca su davenportliftcontrol.com; URL della scheda non mostrato (R ⚠️).
- https://www.davenportliftcontrol.com/fermator/door-suspension/603510008: «Door suspension 40/10, CO=1100»,
  540 × 139 × 15 (R ⚠️).
- https://lift-store.it/005-automatismi/4549-fermator-operatore-apertura-centrale-a-2-ante-modello-40-10-pm-pl-600-soglia-in-alluminio-al54-motore-pm-10-brushles-1265766898431.html:
  40/10 PM 2AC, PL 600, soglia AL54, motore PM 10 brushless (T).
- https://el-es.ru/catalog/zapasnye-chasti-dlya-liftov/18221/ e
  https://liftway.ru/catalog/otvodka-privoda-fermator-4010-vf-5011-pm-dveri-t1-t2-t3-t4-levaia-l460-mm:
  accoppiatore 40/10 VF e 50/11 PM, T1–T4, L = 460 (T).
- https://spiritdv.ru/product/otvodka-dverey-kabiny-pravoe-otkryva/, https://partleader.ru/catalog/elevators/door-skates/otvodka-dverei-kabiny-4010-5011vf-teleskopiceskie-dveri-levoe-otkryvanie-otvodka-dveri-kabiny-40-10-50-11vf,
  https://www.nlp-group.ru/catalog/lift/dveri-privody-dverey/karetki-otvodki-rychagi/38998/ e
  https://revator.ru/catalog/dveri/karetki_otvodki/RR13271/: inserzioni da cui vengono le quote A 465,
  B 120, C 100 e 220 × 460 × 97 (R ⚠️, l'inserzione esatta non è individuabile).

**Prisma**
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/9/serie-micro-mini-sill: Drive FOX
  230 Vca o DC; 25 mm per canale; testata ridotta (E).
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/standard/6/serie-micro-standard e
  https://www.prismaitaly.it/en/Products/car-doors/standard/52/serie-micro-standard: MICRO 1–4 ante,
  1100 × 2300, Slim/Medium/Large, traffico medio (E).
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/24/serie-q-standard e
  https://www.prismaitaly.it/en/Products/landing-doors/standard/75/serie-q-standard: Serie Q,
  3200 × 2800, Slim/Medium/Large, telai speciali (E).
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/standard/25/serie-q-75-standard: Q 75, da 90 a 75 (E).
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/modernizzazioni/32/serie-q-50-standard: Q 50, da 90 a 50 (E).
- https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/12/serie-macro-mini-sill e
  https://www.prismaitaly.it/it/Prodotti/porte-di-cabina/modernizzazioni/4/serie-sinus-mini-sill: le versioni
  Mini-Sill esistono (T).
- http://www.prismaitaly.it/prisma/productsFamilyDetail.asp?ID=132&IdFamily=3: vecchio sito; MICRO per traffico
  medio, MACRO per traffico intenso; «MODULI D'ORDINE – MICRO» rif. 91_05_03_01REV01 (E/T).
- https://lift-store.it/005-automatismi/6728-operatore-micro-prisma-l750-2at-ch-dx-completo-soglia-h75-ed-accessori-230v-blocco-fuori-pian-9901286018561.html
  e https://lift-store.it/005-automatismi/6574-operatore-micro-prisma-l800-2at-ch-dx-completo-di-soglia-h75-ed-accessori-tens-230v-9901286001167.html:
  MICRO 2AT, luce 750 e 800, soglia H.75 (T).
- https://lift-store.it/004-accessori/6343-prisma-780000c08701-assieme-motore-riduttore-dx-100w-cavo-l1000-mm-per-operatore-micro-0187960629820.html:
  motoriduttore 100 W (T).
- https://www.prismaitaly.it/it/Prodotti/porte-di-piano/parafiamma/23/serie-se-parafiamma: la serie SE esiste (T).
- Dati ·P: le pagine MICRO 75, MICRO MS40, MACRO standard, SINUS standard e F22 elencate nel file 14.

**Dapa**
- https://shop.ascensoristi.com/shop/dapasrl/ e https://www.anicalift.it/schede-aziende-associate/dapa/: azienda,
  sede, elenco degli operatori LOWER e delle sospensioni PARVA (R/E).
- https://dapasrl.com/product/?lang=en e https://dapasrl.com/azienda-eng/?lang=en: prodotti e storia
  dell'azienda (E).
- https://shop.ascensoristi.com/prodotto/operatore-lower-2-ante-telescopiche-con-blocco-fuori-piano/: LOWER
  2AT, soglia 75/90, luci 600–850, abbinamento LOWER o PARVA (R).
- https://shop.ascensoristi.com/prodotto/operatore-lower-2-ante-opposte-con-blocco-fuori-piano/ e
  https://www.cmaandpartners.com/index.php/prodotto/operatore-lower-2-ante-opposte-con-blocco-fuori-piano/:
  LOWER C2, soglia 50/70 (R).
- https://shop.ascensoristi.com/prodotto/operatore-lower-3-ante-telescopiche-con-blocco-fuori-piano/: LOWER 3AT (R).
- https://dapasrl.com/serie-parva/: pacchetti PARVA 80/130/180; certificazione IMQ (E ⚠️).
- https://shop.ascensoristi.com/prodotto/sospensione-parva-2-ante-opposte-soglia-25-mm/ e
  https://www.cmaandpartners.com/index.php/prodotto/sospensione-parva-2-ante-opposte-soglia-25-mm/: PARVA C2,
  soglia 25 (R).
- https://dapasrl.com/catalogo-tecnico-dapa-ita/: catalogo tecnico, manuale OPR400, schema di fissaggio delle
  sospensioni LOWER (T).
- https://www.geatelevators.it/it-IT/articoli/Operatore--2AO-semi-automatico--219.aspx: operatore 2AO
  semiautomatico Dapa (T).
- https://shop.ascensoristi.com/prodotto/operatore-sostituzione-monitor-92vf/ e
  https://shop.ascensoristi.com/prodotto/operatore-sostituzione-kone-adv/: operatori di sostituzione (T).

**CMM**
- http://www.cmmelevators.com/cmm-prodotti.html e https://www.cmmelevators.com/en/prodotti: porte automatiche a
  2, 3 e 4 ante con soglia ridotta al minimo (E).
- https://www.cmmelevators.com/en: storia dell'azienda (1969, Mezzago, oltre 30 paesi) (E).
- https://lift-store.it/005-automatismi/4598-cmm-operatore-per-porte-automatiche-2-ante-apertura-centrale-2ac-abb-fisso-luce-650-mm-completo-di-accessori-spess-s-2413502757521.html:
  2AC, accoppiatore fisso, luce 650, soglia 50, motore 3×125 Vca (R/T).
- https://lift-store.it/brand/23-cmm: elenco CMM; luci 600 e 650 (R/T).
- https://chrysalis-gerbil-mefw.squarespace.com/s/CMM-Lift-Me-Design.pdf: brochure LIFT ME 8000/9000, nessuna
  quota delle porte (D).

**Fuori ambito**
- https://www.slycma.com/wp-content/uploads/plaquette-format-a4_sd20_it.pdf: Slycma SD20 2VOL (E, riassunto).
- https://www.davenportliftcontrol.com/kone/sill/6060271: Kone ADV1, soglia C2, CO 800, L 1650 (R).
- https://www.davenportliftcontrol.com/universal-components/sill/6082048: Kleindienst, soglia a 2 gole,
  L 1200, CO 800 (T).

## 13. Terzo giro su Wittur (2 ottobre 2026)

Canale nuovo e più utile: la vetrina di **Wittur Elevator Components India** su IndiaMART (testi del costruttore, E);
poi PDF su igilift, ricambi Davenport e liftway.ru (R). Ricerche in tedesco, turco, cinese e persiano senza risultati
utili. **La regola della lunghezza dell'operatore in funzione della luce (a·L + b) non è stata trovata per nessuna
famiglia Wittur**: nel software gli operatori Wittur restano senza regola (`doorOpMakers`).

| Famiglia | Dato nuovo | Grado | Fonte |
|---|---|---|---|
| Hydra Plus MIDI | operatore tipo 02/C, luce 800, con serratura di cabina: **75 kg** (non è detto se netto o di spedizione ⚠️) | R | https://liftway.ru/catalog/privod-dverei-wittur-selcom-hydra-plus-midi-co800mm-02c-s-zamkom-dk-i-s-samoo-11730 |
| Hydra Plus UD 300 | altezza totale = LH + 300 mm (LH non definita nel testo) | E | https://www.indiamart.com/proddetail/hydra-plus-ud-300-car-door-operator-8005149391.html |
| MDS1 (famiglia nuova) | altezza dell'operatore CH + 345, del meccanismo CH + 170; pacchetto 105 / 185 mm ⚠️; profondità della soglia fissa per la gamma MDS | E | https://www.indiamart.com/proddetail/mds1-landing-door-8004995791.html |
| Hydra 3000 (piano) | soglie 50 / 75 / 116 mm; telai spessi 30 / 40 mm, larghi 80–200 a richiesta ⚠️; 2, 3 o 4 ante; luce 500–1200 mm, contro 600–1200 di wittur.com ⚠️ | E | https://www.indiamart.com/proddetail/hydra-3000-landing-door-8005056112.html |
| Fineline | pacchetto di 115 mm confermato; altezza dell'operatore non trovata (una sintesi le attribuiva CH + 345, che è dell'MDS1) | E | https://www.indiamart.com/proddetail/fineline-car-door-8005197130.html |
| Hydra Plus | 9 tipi di porta di cabina; la porta di piano Hydra si abbina a Hydra Plus, Pegasus Plus, Eco Piuma e Hydra 3000 Plus; 11 configurazioni della porta di piano | E / D | https://www.indiamart.com/proddetail/hydra-plus-car-door-8005134062.html · https://www.indiamart.com/proddetail/hydra-landing-door-8005010212.html |
| Sematic 2000 B-G (merci) | testata 280 mm; montanti scatolati 120 × 90 (min. 80 × 90); altezza dell'operatore 446 / 340 / 400 ⚠️ (quale sia la standard non è chiaro) | D | https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Landing%20doors/Sematic%202000%20B-G%20EN.pdf |
| Soglie Selcom/Wittur | tipi 11/12 e 41/42: 90 × 1200 × 35 × 12,8 mm; luce 800: 75,6 × 1200 × 35 mm | R | https://www.davenportliftcontrol.com/selcom/typ-11-12-u-41-42--l-1200mm/6082011 |

Ancora non trovati: lunghezza dell'operatore per luce (Hydra Plus, ECO+/MIDI+/SUPRA, AMD), profondità dell'operatore
sul tetto della cabina, luce tra le soglie, lunghezza e profondità delle sospensioni di piano; per Fermator
VVVF4+/VF5+, Dapa, CMM e Prisma nessun dato nuovo.

Documenti che chiuderebbero le lacune (da una rete normale):

- manuale Hydra Plus, 77 pagine, con le lunghezze dell'operatore per luce alle pp. 47–51:
  https://www.manualslib.com/manual/1284889/Wittur-Hydra-Plus.html?page=47 (copie: https://pdfcoffee.com/wittur-hydra-plus-manual-pdf-free.html,
  https://idoc.pub/documents/wittur-hydra-plus-manual-gen5jkxeep4o);
- tabelle «overall dimensions» ECO-MIDI e MIDI-SUPRA: http://www.modernlifttech.com/UserFiles/215File55165.pdf;
- brochure Hydra Plus (profondità e altezza dell'operatore): https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Doors/WITTUR/Car%20doors/Hydra%20Plus%20car%20door.pdf;
- manuale UD 300 (significato di LH): https://www.manualslib.com/manual/2766725/Wittur-Hydra-Plus-Ud300.html;
- istruzioni MIDI/SUPRA: https://docplayer.net/31253733-wittur-gmbh-door-drive-midi-supra-operating-instructions-d823mgb.html;
- porte di piano Hydra / Hydra EVO: https://docplayer.net/23921871-hydra-hydra-evo-the-versatile-door.html;
- catalogo ricambi Hydra 3000: https://www.scribd.com/document/866035854/SM-2-000027-EN-01;
- catalogo tecnico Hydra Plus, codice TC.2.001981.EN ⚠️: da chiedere a Wittur;
- Fermator 40/10: https://www.fermator.com/wp-content/uploads/2024/07/model-4010.pdf; Dapa: https://dapasrl.com/catalogo-tecnico-dapa-ita/.
