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

**Non trovato. Nessuna ricerca eseguita:** il budget WebSearch si è esaurito prima di arrivare a Dapa, e
l'host dapa.it è comunque bloccato.

## 6. CMM (Italia)

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
