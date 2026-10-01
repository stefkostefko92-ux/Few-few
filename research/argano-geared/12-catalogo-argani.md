# Argani a riduttore: dati tecnici reali di SICOR, Sassi, Montanari e GEAT

[← Indice](README.md)

> Raccolta del 1° ottobre 2026 per i cataloghi e i disegni di Argano. I file di lavoro citati nel testo (cartella `raw/`,
> script e registri della sessione) non sono nel repository: restano come traccia del metodo.


_Raccolta del 1° ottobre 2026. Completa `research/argano-geared/`, capitoli 1.3, 8.1 e 11.
Il dettaglio di ogni numero (URL, documento, pagina, data, note) è in `argani.json`._

## 0. Come leggere questi dati

**Canale.** Siti dei costruttori, rivenditori, copie dei cataloghi, archive.org e Google Patents
risultano tutti bloccati dal proxy di rete di questo ambiente (elenco al § 9). L'unico canale
disponibile era la ricerca web: ogni valore viene dall'**estratto o riassunto del motore di ricerca**
della pagina indicata. Nessun documento è stato aperto, per cui:

- ogni numero va riverificato sull'originale prima di entrare nel catalogo (capitolo 8.2);
- “pagina” vale “pagina web (non paginata)” oppure “PDF non aperto, pagina non determinabile”;
- **nessun valore è stato letto da un disegno** (`fromDrawing = false` in tutto il JSON);
- dove l'estratto mescolava più risultati, il JSON riporta tutti gli URL candidati e la nota
  “attribuzione non univoca”.

**Il budget di ricerche della sessione (200, condiviso) si è esaurito** dopo circa 60 ricerche mie.
Per questo Montanari è quasi scoperto (§ 4) e quote, coppie freno e rendimenti mancano per tutti.

**Definizioni da non confondere:**

- **Carico statico massimo**: come lo dichiara il costruttore. SICOR scrive “Maximum static load”
  in kN e in kg; Sassi scrive “static load”. Che cosa includa (tiri delle funi, peso della puleggia,
  coefficienti) **non è stato trovato** per nessun costruttore.
- **Velocità**:
  - Sassi dà la *velocità della puleggia* (velocità delle funi): in 2:1 la cabina va a metà;
  - SICOR dà la *velocità della cabina sincrona* (SH110B) o la “velocità sincrona” delle tabelle;
  - le potenze Sassi sono indicate “SYNC”.
- **Portata massima**: Sassi la dà per 1:1 e per 2:1. SICOR dà quasi sempre una sola “maximum
  capacity” senza la sospensione: nelle tabelle compare come “(sosp. n.d.)”.

**Marcatori:**

- ⚠️ dubbio o attribuzione incerta;
- (R) configurazione o articolo di un rivenditore (dato nel titolo dell'inserzione);
- (P) dato della ricerca precedente del 28/09/2026, **non riverificato** oggi;
- “non trovato” = nessun valore negli estratti accessibili.

## 1. GEAT: chi è

| Voce | Esito |
|---|---|
| Ragione sociale | GEAT Elevators S.r.l. |
| Sede | Via dell'Epomeo 72, 80126 Napoli (fonte: atoka.io) |
| Sedi operative | Napoli, Firenze, Torino; un estratto cita anche Milano |
| Fondazione | 1956 |
| Sito | https://www.geatelevators.it/it-IT/ |
| Associazioni | scheda ANACAM: https://www.anacam.it/it/aziende-associate/ricerca-aziende/geat-elevators-srl.html |
| Attività | vendita di ricambi e componenti per ascensori. Progetta e produce gettoniere, quadri di manovra e pulsantiere |
| Argani a catalogo | Montanari M73 (anche con freno 60 V), Montanari M65, FAER P58F e P58S, Sassi MODY (VVVF, 1/60) |
| Argani a marchio GEAT | **nessuno trovato** |

**Conclusione: GEAT non risulta un costruttore di argani a riduttore.** È un distributore di
componenti, che produce quadri e pulsantiere e rivende argani Montanari, Sassi e FAER. Un
costruttore di argani chiamato “GEAT” **non è identificabile con certezza**.

Due possibili equivoci, da confermare con il proprietario (non indagati oltre):

- **GEM – General Elevator Machines S.r.l.**, costruttore italiano di argani. Donati vende per esempio:
  - “GEM RR 1/65 L/R, AC1/VVVF 3,7 kW, freno 60/80 V, puleggia 480 mm”;
  - “GEM RR 1/53 L/R AC1/VVVF”.
- **FAER**, marchio degli argani P58F e P58S venduti da GEAT.

Se “GEAT” indicava gli argani acquistati tramite GEAT, i dati che servono sono quelli di
Montanari e Sassi.

## 2. SICOR

### 2.1 Dati di gamma e freno sull'albero lento

- **Modelli geared** (pagina “GEARED SERIES”):
  - piccoli: SV110, SH110B, SH110 SSB, MR12C;
  - SH130: SH130, SH130 SSB, SH130G, SH130G SSB;
  - SH140: SH140, SH140 SSB, SH140T;
  - SH160: SH160, SH160T, SH160 SSB, SH160LS, SH160LSB;
  - SH190: SH190, SH190 SSB;
  - MR grandi: MR21, MR21 SSB, MR26, MR26 SSB, MR35.
- **Pulegge di gamma**: da 320 a 885 mm; **velocità della cabina** fino a 4 m/s. Sono dati di
  gamma, non di un modello.
- **SSB = “Slow Shaft Brake”**, cioè freno sull'albero lento (titolo della pagina SH110 SSB):
  - versioni SSB di SH110, SH130, SH130G, SH140, SH160, SH190, MR21 e MR26;
  - per SICOR, sulle macchine geared il freno di sicurezza sull'albero lento è “un'opzione di
    costo importante”, mentre sui gearless è incluso (news SICOR);
  - **certificato, coppia frenante e organo su cui agisce: non trovati.**
- Ricambi (R):
  - “Brake unit SSB, old version, for SH110B-130B-140B, 103,5–207 V”;
  - kit XMC00011 di microinterruttori “for brake arm monitoring EN81-20/50”.
- Conformità dichiarata da un rivenditore (RALOE): EN 81-20 ed EN 81-50, con freni di sicurezza da
  montare sull'albero lento come accessorio. Nessun certificato citato.
- **Condizioni delle tabelle portate** (scheda MR12C ITA 2025):
  - riduttore in alto, contrappeso al 50%, rendimento 0,80;
  - portate comprensive del peso delle funi;
  - colonne “CSW” ed “ESW”, sigle non spiegate negli estratti. Compaiono anche nelle tabelle SH190.

### 2.2 Famiglia piccola: SV110, SH110B, MR12C, SH130, SH130G

| Campo | SV110 | SH110B | MR12C | SH130 | SH130G |
|---|---|---|---|---|---|
| Tipo di riduttore | non trovato | non trovato | non trovato | non trovato | non trovato |
| Rapporti | 1/55; 1/43 | 1/55; 1/43; 2/43; 2/55 | 1/52; 1/45; 1/43; 2/53; 2/43 | 1/52; 1/45; 1/43; 1/37; 2/53; 2/43; 3/47 | 1/52; 1/43; 1/37 |
| Ø pulegge (mm) | 480; 520 | 320–600 | 340–550 nelle tabelle ⚠️ (un estratto arriva a 600) | 320–700 | non trovato |
| Gole × Ø funi | non trovato | (R) 600 × 4 gole, funi 9/11 | non trovato (ricambi in 2.6) | (R) SH130B: 600 × 4 gole, funi 9–11 | non trovato |
| Profilo delle gole | non trovato | non trovato | non trovato | non trovato | non trovato |
| Carico statico max | 19,62 kN – 2 000 kg | 20,6 kN – 2 100 kg | 25,5 kN – 2 600 kg | 25,5 kN – 2 600 kg | 28,5 kN – 2 900 kg |
| Portata max | 450 kg (sosp. n.d.) | 400 kg in 1:1 | 550 kg (sosp. n.d.); tabelle 550–750 kg ⚠️ | 550 kg, 1:1 ⚠️ | 630 kg (sosp. n.d.) |
| Velocità | fino a 1 m/s | cabina 0,3–2,2 m/s a 50 Hz; 0,37–2,6 m/s a 60 Hz (sincrona) | tabelle: 0,34–0,66 m/s sincrona (estratto parziale) | non trovato | (R) 1,0 m/s con 630 kg |
| Potenza motore | VVVF 4 poli: fino a 4 kW (50 Hz), fino a 4,4 kW (60 Hz) | VVVF: 2,7–5,5 kW (50 Hz), 4–6 kW (60 Hz). AC2: 2,7–4 kW (50 Hz), 4,4 kW (60 Hz) | 2,7–5,5 kW (50 Hz); 4–6 kW (60 Hz) | 2,7–7,5 kW (50 Hz); 4–8,2 kW (60 Hz) | 5,5–7,5 kW (50 Hz); 6–8,2 kW (60 Hz) |
| Poli / giri | 4 poli, VVVF | (R) 4 poli VVF; 1 000 giri/min (RR 1/43, 2,7 kW) | non trovato | (R) SH130B: AC2 1500/375 giri/min; VVVF 6 poli | non trovato |
| Freno: tipo · coppia | non trovato · non trovato | (R) elettromagnete 60 V · non trovato | non trovato · non trovato | (R) 60 V · non trovato | non trovato · non trovato |
| Freno sull'albero lento | nessuna versione SSB in elenco | versione SH110 SSB | nessuna versione SSB in elenco | versione SH130 SSB | versione SH130G SSB (solo nome) |
| Rendimento diretto / inverso | non trovato | non trovato | non trovato (le tabelle usano 0,80) | non trovato | non trovato |
| Massa | 160 kg (max) | 210 kg | non trovato | 250–260 kg | 250 kg (max) |
| L × W × H | non trovato | non trovato | non trovato | non trovato | non trovato |
| Altezza asse puleggia | non trovato | non trovato | non trovato | non trovato | non trovato |
| Basamento e fissaggio | non trovato | non trovato | non trovato | non trovato | non trovato |
| Puleggia a sbalzo o supportata | non trovato | non trovato | non trovato | non trovato | non trovato |
| Volantino | non trovato | non trovato | non trovato | non trovato | non trovato |
| Olio | 2 l | 2,8 l | 3,8 l | 3,7 l | 3,7 l |
| Certificazioni | non trovato | non trovato | non trovato | non trovato | non trovato |
| Fonte principale | pagina Geared SV110 | Technical Sheet SH110B Geared EN 2025 | pagina MR12C + Scheda Tecnica MR12C ITA 2025 | pagina Geared SH130 | pagina Geared SH130G |

Note:

- SV110: “progetto recente basato su componenti chiave dell'SH110”. Esiste una brochure SV110
  ENG/ITA (non aperta).
- MR12C: i 750 kg delle tabelle superano la portata massima di 550 kg. Può essere una tabella in
  2:1 o un errore dell'estratto: **non usare senza il PDF**.
- SH130: “1:1” compare solo nel riassunto ⚠️.

### 2.3 Famiglia media: SH140, SH160, SH190

| Campo | SH140 | SH160 | SH190 |
|---|---|---|---|
| Tipo di riduttore | non trovato | non trovato | non trovato |
| Rapporti | 1/71; 1/59; 1/52; 1/45; 1/37; 2/71; 2/53; 3/47 | 1/55; 1/43; 1/35; 2/53; 2/43; 3/41 | 1/40; 1/51; 1/62; 2/59; 3/47 |
| Ø pulegge (mm) | non trovato | non trovato | 520–650 nelle tabelle (estratto parziale) |
| Gole × Ø funi | non trovato | non trovato | non trovato |
| Profilo delle gole | non trovato | non trovato | non trovato |
| Carico statico max | 32,4 kN – 3 300 kg | 42,2 kN – 4 300 kg | 51 kN – 5 200 kg |
| Portata max | non trovato per SH140; SH140 SSB: 875 kg (sosp. n.d.) | 1 250 kg (sosp. n.d.) | 1 800 kg (sosp. n.d.) |
| Velocità | non trovato | non trovato | tabelle: 0,66–0,99 m/s sincrona (estratto parziale) |
| Potenza motore | 4 poli VVVF 4–11 kW a 50 Hz (scheda). La pagina dice 2,6–11 kW a 50 Hz e 4–12 kW a 60 Hz ⚠️ | non trovato | 4 poli VVVF 7,5–30 kW (50 Hz); 6/16 poli 4,7–10 kW (60 Hz) |
| Poli / giri | 4 poli (VVVF) | non trovato | 4 poli VVVF; 6/16 poli |
| Freno: tipo · coppia | non trovato · non trovato | non trovato · non trovato | non trovato · non trovato |
| Freno sull'albero lento | versione SH140 SSB | versione SH160 SSB | versione SH190 SSB (solo nome) |
| Rendimento diretto / inverso | non trovato | non trovato | non trovato |
| Massa | 280 kg | 450–470 kg | 620 kg |
| L × W × H | non trovato | non trovato | non trovato |
| Altezza asse puleggia | non trovato | non trovato | non trovato |
| Basamento e fissaggio | non trovato | non trovato | non trovato |
| Puleggia a sbalzo o supportata | non trovato | non trovato | non trovato |
| Volantino | non trovato | non trovato | non trovato |
| Olio | 3,6 l | 9 l | 11,5 l |
| Certificazioni | non trovato | non trovato | non trovato |
| Fonte principale | Technical Sheet SH140 Geared EN 2025 + pagina | pagina Geared SH160 | Technical Sheet SH190 Geared EN 2025 + pagina |

### 2.4 Famiglia grande: MR21, MR26, MR35

| Campo | MR21 | MR26 | MR35 |
|---|---|---|---|
| Tipo di riduttore | non trovato | non trovato | non trovato |
| Rapporti | 1/62; 1/51; 1/40; 2/63; 2/51; 3/47 | 1/72; 1/57; 1/44; 2/63; 2/45; 3/55 | 1/58; 1/53; 2/73; 2/60; 3/70; 3/53 |
| Ø pulegge (mm) | non trovato | non trovato | non trovato |
| Gole × Ø funi | non trovato | non trovato | non trovato |
| Profilo delle gole | non trovato | non trovato | non trovato |
| Carico statico max | 55 kN – 5 600 kg; versione “TS” 72,6 kN – 7 400 kg | 64,7 kN – 6 600 kg; versione “TS” 80,2 kN – 8 175 kg | 139,3 kN – 14 200 kg |
| Portata max | 2 000 kg (sosp. n.d.) | non trovato per MR26; MR26 SSB: 3 000 kg (sosp. n.d.) | 5 500 kg (sosp. n.d.) |
| Velocità | non trovato | non trovato | non trovato |
| Potenza motore | MR21 SSB: 7,5–30 kW e 8,2–33 kW (frequenze non indicate) | non trovato | non trovato |
| Poli / giri | non trovato | non trovato | non trovato |
| Freno: tipo · coppia | non trovato · non trovato | non trovato · non trovato | non trovato · non trovato |
| Freno sull'albero lento | versione MR21 SSB | versione MR26 SSB | nessuna versione SSB in elenco |
| Rendimento diretto / inverso | non trovato | non trovato | non trovato |
| Massa | 770–1 000 kg | 1 200–1 600 kg | 1 600–1 900 kg |
| L × W × H | non trovato | non trovato | non trovato |
| Altezza asse puleggia | non trovato | non trovato | non trovato |
| Basamento e fissaggio | non trovato | non trovato | non trovato |
| Puleggia a sbalzo o supportata | non trovato (significato di “TS” non trovato) | non trovato (come MR21) | non trovato |
| Volantino | non trovato | non trovato | non trovato |
| Olio | 7,8 l | 10,8 l | 23,5 l |
| Certificazioni | non trovato | non trovato | non trovato |
| Fonte principale | pagina Geared MR21 + Technisches Datenblatt MR21 DE | pagina Geared MR26 + ficha técnica MR26 ES 2025 | pagina Geared MR35 |

### 2.5 Varianti

| Variante | Dati trovati |
|---|---|
| SH110 SSB | carico statico 20,6 kN – 2 100 kg |
| SH130 SSB | carico statico 25,5 kN – 2 600 kg |
| SH140 SSB | portata massima 875 kg |
| SH140T | massa 350 kg ⚠️ (nel riassunto, senza la pagina SH140T tra i risultati) |
| SH160 SSB | portata massima 1 250 kg |
| SH160T | portata massima 400 kg ⚠️ (anomala per 4 300 kg statici); massa 550 kg |
| SH160LS | portata massima 1 250 kg; carico statico 3 200–4 300 kg |
| MR21 SSB | 55 kN – 5 600 kg (TS 72,6 kN – 7 400 kg); 2 000 kg; rapporti 1/62; 1/51; 1/40; 2/63 |
| MR26 SSB | portata massima 3 000 kg |
| SH130G SSB, SH160LSB, SH190 SSB | solo il nome. Per SH190 SSB un estratto dava “20,6 kN – 2 100 kg”, identico a SH110 SSB: **scartato come errore** |

### 2.6 Modelli storici, ancora presenti negli impianti

| Campo | MR12 | MR16 | MR17 |
|---|---|---|---|
| Carico statico max | 2 600 kg | 4 300 kg | 5 200 kg |
| Rapporti | 1/52; 1/43; 2/53; 2/43 | 1/55; 1/43; 1/35; 2/53; 2/43; 3/41 | 1/55; 1/43; 1/35; 2/43; 3/41 |
| Portata | progettato per 480 kg | gamma 1 000 kg | non trovato |
| Potenza | non trovato | VVVF 7,5–20 kW; AC2 5,1–12 kW (50/60 Hz) | VVVF 5,5–15 kW; AC2 5,5–15 kW |
| Massa | 240 kg | 450 kg | 550 kg |
| Olio | 3,8 l | 9 l, Shell Omala S4 WE | 8,5 l, Shell Omala S4 WE |
| Altro | oltre 400 000 unità in più di 60 paesi | puleggia smontabile in ghisa sferoidale, durezza min. 250 HB; freno elettromagnetico; carcassa motore in alluminio | — |
| Tutti gli altri campi | non trovato | non trovato | non trovato |
| Fonte | copie di terzi (listino MR12, elevatorexpress, narod.ru) ⚠️ attribuzione non univoca | schede di rivenditori (kartel-in, alaa-al-jazeera, repipl) ⚠️ | schede di rivenditori (ttilift, repipl, igilift) ⚠️ |

- Per MR12 una copia di terzi (SICOR-MR12.pdf su demsanascenseurs.com) dichiara di riportare i
  **rendimenti della macchina sopra ogni tabella portate**: è una pista, non un dato.
- MR10 e MR13 compaiono solo come compatibili con le pulegge di ricambio.
- Per MR14 esiste un manuale d'uso e manutenzione su manualslib. Non è stato aperto e nessun dato è
  stato trovato.

### 2.7 Configurazioni commerciali e ricambi (R)

- **Pulegge di ricambio per SH110, SH130, MR12, MR10 e MR13** (lift-store.it): Ø480 × 4 gole,
  Ø520 × 4, Ø520 × 3 e Ø600 × 4. Tutte per funi da 9–11 mm, interpretazione del suffisso “9-11”.
- **SH110B** (lift-store.it): VVF 4 kW, 50 Hz, RR 1/55, freno 60 V, 4 poli, puleggia
  600 × 4 × 9/11. Lo slug dell'URL dice 3,6 kW: discrepanza nella fonte.
- **SH110B** (elvacenter): RR 1/43, VVVF, 1 000 giri/min, 2,7 kW.
- **SH110B** (benelifts): motori da 4 kW e da 5,5 kW.
- **SH130B** (Donati): RR 1/43, AC2 1500/375 giri/min, 4 kW.
- **SH130B** (lift-store.it): VVVF 3,6 kW, 6 poli, freno 60 V, RR 1/43, puleggia 600 × 4 × 9-11.
- **SH130G**: codice commerciale MK-SH130G-630-1.0, cioè 630 kg a 1,0 m/s.

## 3. Alberto Sassi S.p.A.

### 3.1 Dati di gamma

- Modelli a puleggia con le pagine attuali su sassi.it:
  - MODY, LEO e TORO;
  - serie MF: MF48, MF84, MF94;
  - serie MB: MB95, MB108, con MB94 citato. La serie MB ha il motore B3 a sbalzo (“cantilever”).
- Esistono anche argani a tamburo senza contrappeso, fuori dal nostro scopo.
- Catalogo “CATALOGO ARGANI GEARBOXES CATALOGUE REV 2023/01” (non aperto): i diagrammi del motore
  sono calcolati con **rendimento del vano 0,8**.
- Altre edizioni individuate: 2019 (copia Atwell), 2016/01 (docplayer) e una copia IGI Lift.
- **Regolazione**: per tutti i modelli “4/16” (motore a due velocità 4/16 poli) oppure “VF”
  (4 poli con inverter).
- **Freno di sicurezza sull'albero lento per A3/UCM**: opzione per LEO e MF84. Certificato e coppia
  non trovati.

### 3.2 MODY, LEO, TORO

| Campo | MODY | LEO | TORO |
|---|---|---|---|
| Tipo di riduttore | non trovato | vite senza fine, asse della vite inclinato | non trovato |
| Rapporti | 1/37; 1/49; 1/60; 2/47; 3/41 | 1/71; 1/55; 1/45; 2/71; 2/57; 3/47 | 1/61; 1/49; 1/39; 2/53; 3/47 |
| Ø pulegge (mm) | tabella pesi da Ø320 (funi 8) a Ø600 (funi 15) | tabella pesi: Ø320 (funi 8), Ø400 (10), Ø480 (12), parziale; (R) “TS 700” | non trovato; (R) “TS 600”, “520” |
| Gole × Ø funi | (R) 4 × 8 con Ø400 | (R) 3 × 10 con “TS 700” | (R) 4 × 12 (TS 600); 6 × 11 (520) |
| Profilo delle gole | non trovato | non trovato | non trovato |
| Carico statico max | **2 300 kg** | 3 000 kg | 4 200 kg |
| Portata max 1:1 / 2:1 | 480 / 630 kg | 630 / 1 000 kg | 1 000 / 2 000 kg |
| Velocità della puleggia | 0,23–3,68 m/s | 0,18–4,21 m/s | 0,22–4,20 m/s |
| Potenza motore (sinc.) | 4/16 poli: 3,5–5,5 kW. VF 4 poli: 2,2–6,6 kW | 4/16 poli: 3,5–5,5 kW. VF 4 poli: 3,3–11 kW | 4/16 poli: 3,5–11 kW. VF 4 poli: 3,3–20,6 kW |
| Poli / giri | 4/16 poli o VF 4 poli; giri non trovati | come MODY | come MODY |
| Inerzia del motore J | VF: 0,190 kg·m² | AC2: 0,371–0,488 kg·m². VF: 0,046–0,171 kg·m² | non trovato |
| Freno: tipo · coppia | non trovato · non trovato | non trovato · non trovato | non trovato · non trovato |
| Freno sull'albero lento | non trovato | opzione: freno di sicurezza per A3/UCM | non trovato |
| Rendimento diretto / inverso | non trovato | non trovato | non trovato |
| Massa | non trovato (puleggia 19–39 kg) | non trovato (puleggia 24–34,6 kg, larghezza 90 mm) | 246–299 kg |
| L × W × H | non trovato | non trovato | non trovato |
| Altezza asse puleggia | non trovato | non trovato | non trovato |
| Basamento e fissaggio | non trovato | non trovato | non trovato |
| Montaggio | non trovato | verticale o orizzontale; puleggia destra o sinistra | tre piani: verticale, orizzontale, destra e sinistra |
| Puleggia a sbalzo o supportata | non trovato | non trovato | non trovato |
| Volantino | non trovato | non trovato | non trovato |
| Olio | lubrificato a vita (quantità non indicata) | sigillato a vita, olio sintetico | lubrificato a vita |
| Certificazioni | non trovato | non trovato | non trovato |
| Fonte principale | sassi.it/en/geared-machines/mody/ | …/leo/ | …/toro/ |

### 3.3 Serie MF: MF48, MF84, MF94

| Campo | MF48 | MF84 | MF94 |
|---|---|---|---|
| Tipo di riduttore | vite senza fine e ruota (design “tradizionale”) | non trovato | non trovato |
| Rapporti | 1/60; 1/47; 2/71; 3/56 | 1/65; 1/48; 1/39; 2/53; 2/39; 3/47 | 1/65; 1/53; 2/71; 2/53; 4/67 |
| Ø pulegge (mm) | non trovato | non trovato; (R) 520 | fino a Ø1000 (pagina storica); (R) 650 |
| Gole × Ø funi | non trovato | (R) 6 × 11 | (R) 8 × 12; 5 × 16 |
| Profilo delle gole | non trovato | non trovato | non trovato |
| Carico statico max | 3 100 kg | 6 000 kg | 8 000 kg |
| Portata max 1:1 / 2:1 | 630 / 1 000 kg | 1 600 / 3 000 kg | 2 500 / 4 000 kg |
| Velocità della puleggia | 0,28–3,52 m/s | 0,28–3,86 m/s | 0,29–4,50 m/s (pagina attuale); fino a 5,62 m/s con Ø1000 (pagina storica) |
| Potenza motore (sinc.) | 4/16 poli: 3,5–7,3 kW. VF 4 poli: 3,3–11,4 kW | 4/16 poli: 6,0–20,6 kW. VF 4 poli: 5,9–27,9 kW | 4/16 poli: 13,6–20,6 kW. VF 4 poli: 11,0–27,9 kW |
| Inerzia del motore J (VF) | 0,011 kg·m² | 0,050 kg·m² ⚠️ (identico a MF94) | 0,050 kg·m² |
| Freno: tipo · coppia | non trovato · non trovato | non trovato · non trovato | non trovato · non trovato |
| Freno sull'albero lento | non trovato | nuovo freno sull'albero lento; opzione freno di sicurezza per A3/UCM | non trovato |
| Rendimento diretto / inverso | non trovato | non trovato | non trovato |
| Massa | non trovato | non trovato | 602–623 kg (4/16); 529–623 kg (VF) |
| L × W × H | non trovato | non trovato | non trovato |
| Altezza asse puleggia | non trovato | non trovato | non trovato |
| Basamento e fissaggio | non trovato | non trovato | non trovato |
| Puleggia a sbalzo o supportata | non trovato | non trovato | non trovato |
| Volantino | non trovato | non trovato | non trovato |
| Olio | 3,8 l | lubrificato a vita ⚠️ | 9 l |
| Certificazioni | non trovato | non trovato | non trovato |
| Fonte principale | sassi.it/en/geared-machines/mf-series/; J da copia sls-ltd.co.uk | pagina MF series | pagina MF series + pagina storica new.sassi.it MF94 |

Controllo di coerenza (calcolo, non dato): con 4/67, puleggia Ø1000 e 1 800 giri/min (4 poli
sincroni a 60 Hz) si ottengono 5,63 m/s. Il valore 5,62 m/s della pagina storica è quindi
coerente con un'alimentazione a 60 Hz; a 1 500 giri/min la stessa combinazione dà 4,69 m/s.

Un rivenditore (globalpartnerelevator) indica per MF84 “velocità cabina fino a 1,6 m/s”: non è un
dato del costruttore.

### 3.4 Serie MB

| Campo | MB95 | MB108 |
|---|---|---|
| Carico statico max | 12 000 kg | 15 000 kg |
| Portate | 3 000 / 5 000 / 10 000 kg (sospensioni non indicate) | 5 000 / 10 000 / 15 000 kg (sospensioni non indicate) |
| Rapporti | 1/48; 1/53; 2/80; 2/64; 3/80; 3/66; 3/50 | 1/64; 1/48; 2/71; 2/57; 3/68; 4/59 |
| Velocità della puleggia | 0,35–4,51 m/s | 0,34–5,10 m/s |
| Potenza | AC2 17,6–50,7 kW; VVVF 14,7–50,7 kW | 25,7–91,9 kW |
| Massa | 980 kg | 1 405 kg |
| Motore | B3 a sbalzo (“cantilever”) | B3 a sbalzo (“cantilever”) |
| Tutti gli altri campi | non trovato | non trovato |
| Fonte | pagina MB series (sassi.it), pagine MB95/MB108 del sito precedente e fupa.com.tr ⚠️ attribuzione non univoca | idem |

### 3.5 Configurazioni commerciali (R)

| Modello | Potenza | Portata | Sospensione | Velocità | Puleggia e funi | Fonte |
|---|---|---|---|---|---|---|
| MODY | 4,9 kW | 550 kg | 2:1 | 1,00 m/s | TS 400 – 4 × 8 mm | fceu.eu |
| LEO | 4,4 kW | 450 kg | 1:1 | 1,00 m/s | TS 700 – 3 × 10 mm | fceu.eu |
| LEO | 4,0 kW | 400 kg | 1:1 | 1,00 m/s | TS 700 – 3 × 10 mm | fceu.eu |
| TORO | 9,2 kW | 900 kg | 1:1 | 1,00 m/s | TS 600 – 4 × 12 mm | fceu.eu |
| TORO | 10,3 kW | — | — | — | puleggia 520 × 11 × 6 (“max weight 4200 kg”) | youmats |
| MF84 | 17,6 kW | 1 600 kg | 2:1 | 1,05 m/s | TS 520 – 6 × 11 mm | fceu.eu |
| MF94 | 24,6 kW | 6 000 kg | 3:1 | 0,50 m/s | TS 650 – 8 × 12 mm | fceu.eu |
| MF94 | 19,1 kW | 4 200 kg | 2:1 | 0,48 m/s | rapporto 1/53, TK 650 – 5 × 16 | fceu.eu |
| MODY | — | — | — | — | VVVF, rapporto 1/60 | GEAT |

“TS” e “TK” sono sigle del rivenditore: presumibilmente diametro della puleggia in mm e
numero × diametro delle funi, non verificato.

## 4. Montanari Giulio & C.

**Copertura insufficiente:** il budget di ricerche si è esaurito prima di arrivare alle pagine
Montanari, e il sito montanarigiulio.com è bloccato dal proxy.

| Campo | M65 | M73 | M105 / M105B | M109 |
|---|---|---|---|---|
| Tipo di riduttore | non trovato | non trovato | non trovato | non trovato |
| Rapporti | non trovato | (R) 1/75; 1/46 | (P) M105: da 1/71 a 4/67 | non trovato |
| Ø pulegge (mm) | (P) 480 | (R) “TS 700” | non trovato | (R) “TS 700” |
| Gole × Ø funi | (P) 3 × 10; 4 × 10 | (R) 2 × 11; 3 × 11 | non trovato | (R) 8 × 16 |
| Profilo delle gole | non trovato | non trovato | non trovato | non trovato |
| Carico statico max | non trovato | 2 200–3 500 kg (“variabile”) | (P) M105B: fino a 9 800 kg | non trovato |
| Portata | (P) 320 kg a 0,7 m/s con 3 kW; 400 kg a 1,0 m/s con 4 kW | fino a 480 kg (sosp. n.d.). (R) 250 kg in 1:1 a 0,70 m/s con 3,0 kW; 400 kg in 1:1 a 1,00 m/s con 5,5 kW | non trovato | (R) 11 000 kg in 4:1 a 0,4 m/s con 45 kW |
| Freno | versione “con freno” (GEAT) | (R) versione con freno 60 V | (P) M105B: freno di emergenza sull'albero lento | non trovato |
| Montaggio | verticale o orizzontale (GEAT) | non trovato | non trovato | non trovato |
| Massa, L × W × H, altezza dell'asse, basamento, sbalzo, volantino, olio, rendimento, certificazioni | non trovato | non trovato | non trovato | non trovato |
| Fonte | GEAT; (P) pagina M65 | fceu.eu (2 inserzioni), Donati M73S, GEAT | (P) pagina M105 | fceu.eu; (P) pagina M109 |

- **M73** è descritto come “l'argano a riduttore più venduto al mondo per impianti da 6 persone”.
  **Mancava** dalla ricerca precedente. Esiste anche la variante **M73S** (Donati).
- M83, M84, M85, M93, M94, M95, M98 e M98H, elencati nella ricerca precedente: **nessun dato** in
  questa sessione.

## 5. Tabella trasversale dei dati principali

Le velocità Sassi sono della puleggia, quelle SICOR della cabina (sincrona). “n.d.” = sospensione
non dichiarata.

| Costruttore | Modello | Carico statico max | Ø puleggia (mm) | Rapporti | Portata 1:1 | Portata 2:1 | Velocità (m/s) | Potenza (kW) | Massa (kg) | L × W × H |
|---|---|---|---|---|---|---|---|---|---|---|
| SICOR | SV110 | 2 000 kg (19,62 kN) | 480; 520 | 1/55; 1/43 | 450 kg (n.d.) | non trovato | ≤ 1 | VVVF fino a 4 (50 Hz) / 4,4 (60 Hz) | 160 (max) | non trovato |
| SICOR | SH110B | 2 100 kg (20,6 kN) | 320–600 | 1/55; 1/43; 2/43; 2/55 | 400 kg | non trovato | 0,3–2,2 (50 Hz) | 2,7–5,5 (VVVF, 50 Hz) | 210 | non trovato |
| SICOR | MR12C | 2 600 kg (25,5 kN) | 340–550 ⚠️ | 1/52; 1/45; 1/43; 2/53; 2/43 | 550 kg (n.d.) | non trovato | tabelle 0,34–0,66 ⚠️ | 2,7–5,5 (50 Hz) | non trovato | non trovato |
| SICOR | SH130 | 2 600 kg (25,5 kN) | 320–700 | 1/52; 1/45; 1/43; 1/37; 2/53; 2/43; 3/47 | 550 kg ⚠️ | non trovato | non trovato | 2,7–7,5 (50 Hz) | 250–260 | non trovato |
| SICOR | SH130G | 2 900 kg (28,5 kN) | non trovato | 1/52; 1/43; 1/37 | 630 kg (n.d.) | non trovato | non trovato | 5,5–7,5 (50 Hz) | 250 (max) | non trovato |
| SICOR | SH140 | 3 300 kg (32,4 kN) | non trovato | 1/71; 1/59; 1/52; 1/45; 1/37; 2/71; 2/53; 3/47 | SSB: 875 kg (n.d.) | non trovato | non trovato | 4–11 (VVVF, 50 Hz) | 280 | non trovato |
| SICOR | SH160 | 4 300 kg (42,2 kN) | non trovato | 1/55; 1/43; 1/35; 2/53; 2/43; 3/41 | 1 250 kg (n.d.) | non trovato | non trovato | non trovato | 450–470 | non trovato |
| SICOR | SH190 | 5 200 kg (51 kN) | 520–650 (tabelle) | 1/40; 1/51; 1/62; 2/59; 3/47 | 1 800 kg (n.d.) | non trovato | tabelle 0,66–0,99 | 7,5–30 (VVVF, 50 Hz) | 620 | non trovato |
| SICOR | MR21 | 5 600 kg (55 kN); TS 7 400 kg | non trovato | 1/62; 1/51; 1/40; 2/63; 2/51; 3/47 | 2 000 kg (n.d.) | non trovato | non trovato | SSB: 7,5–30 | 770–1 000 | non trovato |
| SICOR | MR26 | 6 600 kg (64,7 kN); TS 8 175 kg | non trovato | 1/72; 1/57; 1/44; 2/63; 2/45; 3/55 | SSB: 3 000 kg (n.d.) | non trovato | non trovato | non trovato | 1 200–1 600 | non trovato |
| SICOR | MR35 | 14 200 kg (139,3 kN) | non trovato | 1/58; 1/53; 2/73; 2/60; 3/70; 3/53 | 5 500 kg (n.d.) | non trovato | non trovato | non trovato | 1 600–1 900 | non trovato |
| SICOR | MR12 (storico) | 2 600 kg | (ricambi 480; 520; 600) | 1/52; 1/43; 2/53; 2/43 | progetto 480 kg | non trovato | non trovato | non trovato | 240 | non trovato |
| SICOR | MR16 (storico) | 4 300 kg | non trovato | 1/55; 1/43; 1/35; 2/53; 2/43; 3/41 | gamma 1 000 kg | non trovato | non trovato | VVVF 7,5–20; AC2 5,1–12 | 450 | non trovato |
| SICOR | MR17 (storico) | 5 200 kg | non trovato | 1/55; 1/43; 1/35; 2/43; 3/41 | non trovato | non trovato | non trovato | 5,5–15 | 550 | non trovato |
| Sassi | MODY | 2 300 kg | 320–600 (tabella pesi) | 1/37; 1/49; 1/60; 2/47; 3/41 | 480 kg | 630 kg | puleggia 0,23–3,68 | 4/16: 3,5–5,5; VF: 2,2–6,6 | non trovato | non trovato |
| Sassi | LEO | 3 000 kg | 320–480+ (tabella parziale) | 1/71; 1/55; 1/45; 2/71; 2/57; 3/47 | 630 kg | 1 000 kg | puleggia 0,18–4,21 | 4/16: 3,5–5,5; VF: 3,3–11 | non trovato | non trovato |
| Sassi | TORO | 4 200 kg | non trovato | 1/61; 1/49; 1/39; 2/53; 3/47 | 1 000 kg | 2 000 kg | puleggia 0,22–4,20 | 4/16: 3,5–11; VF: 3,3–20,6 | 246–299 | non trovato |
| Sassi | MF48 | 3 100 kg | non trovato | 1/60; 1/47; 2/71; 3/56 | 630 kg | 1 000 kg | puleggia 0,28–3,52 | 4/16: 3,5–7,3; VF: 3,3–11,4 | non trovato | non trovato |
| Sassi | MF84 | 6 000 kg | non trovato | 1/65; 1/48; 1/39; 2/53; 2/39; 3/47 | 1 600 kg | 3 000 kg | puleggia 0,28–3,86 | 4/16: 6,0–20,6; VF: 5,9–27,9 | non trovato | non trovato |
| Sassi | MF94 | 8 000 kg | fino a 1 000 | 1/65; 1/53; 2/71; 2/53; 4/67 | 2 500 kg | 4 000 kg | puleggia 0,29–4,50 (5,62 con Ø1000) | 4/16: 13,6–20,6; VF: 11,0–27,9 | 529–623 | non trovato |
| Sassi | MB95 | 12 000 kg | non trovato | 1/48; 1/53; 2/80; 2/64; 3/80; 3/66; 3/50 | 3 000 / 5 000 / 10 000 kg (n.d.) | — | puleggia 0,35–4,51 | AC2 17,6–50,7; VVVF 14,7–50,7 | 980 | non trovato |
| Sassi | MB108 | 15 000 kg | non trovato | 1/64; 1/48; 2/71; 2/57; 3/68; 4/59 | 5 000 / 10 000 / 15 000 kg (n.d.) | — | puleggia 0,34–5,10 | 25,7–91,9 | 1 405 | non trovato |
| Montanari | M65 | non trovato | (P) 480 | non trovato | (P) 320 / 400 kg | non trovato | (P) 0,7 / 1,0 | (P) 3 / 4 | non trovato | non trovato |
| Montanari | M73 | 2 200–3 500 kg | (R) 700 | (R) 1/75; 1/46 | (R) 250 / 400 kg; max 480 kg | non trovato | (R) 0,70 / 1,00 | (R) 3,0 / 5,5 | non trovato | non trovato |
| Montanari | M105B | (P) fino a 9 800 kg | non trovato | (P) M105: 1/71 … 4/67 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato |
| Montanari | M109 | non trovato | (R) 700 | non trovato | (R) 11 000 kg in 4:1 | — | (R) 0,4 | (R) 45 | non trovato | non trovato |
| GEAT | — | non è un costruttore di argani (§ 1) | | | | | | | | |

## 6. Lacune (non trovate per nessun costruttore)

1. **Dimensioni**: L × W × H, altezza dell'asse della puleggia dal basamento, impronta del
   basamento e interassi di fissaggio. Sono nei disegni dei cataloghi, ma nessun PDF è stato aperto.
2. **Freno**: tipo costruttivo (tamburo o disco, numero di ceppi), **coppia frenante** e numero dei
   gruppi, per tutti i modelli. Per le versioni SICOR SSB e per il freno sull'albero lento Sassi
   (LEO, MF84) mancano anche i numeri dei certificati di esame UE del tipo e i loro limiti.
3. **Rendimento** diretto e inverso per rapporto. Ci sono solo due piste:
   - le ipotesi delle tabelle: SICOR 0,80; Sassi rendimento del vano 0,8;
   - la copia MR12 che dichiara rendimenti sopra le tabelle.
4. **Coppia massima in uscita**, corrente nominale, giri di targa, avviamenti/ora, servizio S3/S5.
5. **Pulegge**:
   - numero di gole e diametro funi per modello, salvo le configurazioni (R) e i ricambi SICOR;
   - **profili delle gole** (U, U con sottosquadro, V, angoli β e γ, tempra);
   - definizione del diametro (primitivo o esterno).
6. **Puleggia a sbalzo o con supporto esterno**: non trovato. La versione SICOR “TS”, con carico
   statico più alto, potrebbe essere questo, ma il significato della sigla non è stato trovato.
7. **Volantino** e manovra manuale: non trovato.
8. **Masse mancanti**: SICOR MR12C; Sassi MODY, LEO, MF48 e MF84; tutti i Montanari.
9. **Inerzie**: trovate solo quelle del motore Sassi (MODY, LEO, MF48, MF84, MF94). Mancano
   SICOR e Montanari e, per tutti, le inerzie di puleggia e freno.
10. **Montanari**: quasi tutto (§ 4).
11. **SICOR “ESW” e “CSW”**: significato delle colonne delle tabelle non trovato.

## 7. Correzioni e conferme rispetto alla ricerca precedente

| Dove | Che cosa diceva | Esito di oggi |
|---|---|---|
| 01 §1.3, Sassi | MODY: carico statico 2 250 kg | **Da correggere**: la pagina Sassi attuale dice **2 300 kg**. Ricontrollare sul catalogo 2023/01 (forse è il valore di un catalogo precedente) |
| 01 §1.3, Sassi | MODY: “480 o 630 kg, 1:1 o 2:1, 1 m/s” | Portate confermate. **1 m/s non è un limite del modello**: era la configurazione del listino del rivenditore. La velocità della puleggia va da 0,23 a 3,68 m/s |
| 01 §1.1 | rapporti MODY “1/37–1/49 e 2/47–3/41” | **Incompleto**: manca **1/60**. Elenco: 1/37 – 1/49 – 1/60 – 2/47 – 3/41 |
| 01 §1.1 | “per Sassi MODY il riduttore è sigillato a vita con olio sintetico” | **Da precisare**: “sigillato a vita con olio sintetico” è detto di **LEO**. Per MODY e TORO l'estratto dice “lubrificato a vita”, per MF84 lo stesso ⚠️. MF48 ha 3,8 l di olio, MF94 9 l |
| 01 §1.3, Sassi | MF48: 630 kg in 1:1, 1 000 kg in 2:1 (listino di un rivenditore) ⚠️ | **Confermato** dalla pagina Sassi della serie MF. Carico statico 3 100 kg. Il ⚠️ si può togliere dopo il controllo sul PDF |
| 01 §1.3, Sassi | MF94: puleggia fino a Ø1000, fino a 5,62 m/s | Confermato solo dalla **pagina storica** (new.sassi.it). La pagina attuale dice 0,29–4,50 m/s. 5,62 m/s torna con 4/67, Ø1000 e 1 800 giri/min (60 Hz) |
| 01 §1.3, Sassi | MF84: 6 000 kg statici; TORO: 1 000 kg in 1:1, 2 000 kg in 2:1 | **Confermati**. TORO ha 4 200 kg statici, MF84 1 600 kg in 1:1 e 3 000 kg in 2:1 |
| 01 §1.3, Sassi | serie “MB” senza modelli | MB95 (12 000 kg) e MB108 (15 000 kg), motore B3 a sbalzo. MB94 è citato |
| 01 §1.3, SICOR | MR12C: 25,5 kN (2 600 kg), fino a 550 kg | **Confermato** |
| 01 §1.3, SICOR | MR21 SSB: 55 kN ⚠️; MR26: 64,7 kN ⚠️ | **Confermati** (5 600 kg e 6 600 kg). Le versioni “TS” arrivano a 72,6 kN e 80,2 kN |
| 01 §1.3, SICOR | serie: MR12C, MR21 (SSB), MR26 (SSB), SH130, SH140 SSB, SH160 SSB | **Incompleta**. Mancano SV110, SH110B, SH130G, SH140, SH140T, SH160, SH160T, SH160LS/LSB, SH190 e MR35. **SSB = Slow Shaft Brake**, cioè freno sull'albero lento |
| 01 §1.3, SICOR | pulegge 320–885 mm | **Confermato**, come dato di gamma |
| 01 §1.2 | “SICOR fino a 5 500 kg in taglia 1:1 e 4 m/s” | 5 500 kg è la portata massima della **MR35** (sospensione non indicata nell'estratto); 4 m/s è un dato di gamma. “In taglia 1:1” **non verificato** ⚠️ |
| 01 §1.3, Montanari | serie M65, M83–M85, M93–M95, M98–M98H, M105, M109 | **Manca M73** (con la variante M73S), il modello più diffuso. Fino a 480 kg, statico 2 200–3 500 kg. I dati M65, M105 e M105B **non sono stati riverificati** |
| 01 §1.3, nota finale | non trovati: …, inerzie, masse | Ora trovati: **masse** (tutti i SICOR attuali; Sassi TORO, MF94, MB95, MB108), **inerzie del motore** Sassi, **quantità d'olio**. Restano mancanti coppia in uscita, coppia del freno, rendimento per rapporto, corrente, avviamenti/ora |
| 06 §6.5 | “4/16 poli, opzione che compare in una pagina storica Sassi ⚠️” | **Confermato** anche sulle pagine attuali (MODY, LEO, TORO, serie MF: “Power range 4/16 poles”). Il ⚠️ si può togliere |
| 04 §4.3 | “5,62 m/s con puleggia Ø1000” (Sassi) | Il valore è della pagina storica ed è coerente con 60 Hz (vedi sopra). Le velocità e le potenze Sassi sono **sincrone** (“SYNC”) |
| 04 §4.7 | “Sassi pubblica un rendimento statico per ogni rapporto” | **Non riverificato**. Trovato solo “rendimento del vano 0,8” nei diagrammi del catalogo 2023 |
| 04 §4.10 | freno sull'albero lento: Sassi MF84 certificato; Montanari M105B | Sassi offre il freno di sicurezza sull'albero lento per A3/UCM anche su **LEO**. SICOR lo offre come versioni **SSB** di otto modelli. Certificati non visti |
| 01 §1.3 | GEAT assente | **Nuovo**: GEAT Elevators S.r.l. è un distributore, non un costruttore di argani (§ 1) |

## 8. Fonti principali

Tutte consultate il 2026-10-01 tramite estratti di ricerca. L'elenco completo, valore per valore,
è in `argani.json`.

- **SICOR**:
  - pagine di modello `https://www.sicoritaly.com/en/geared-series/geared-<modello>/` (sv110,
    sh110b, sh110-ssb, mr12c, sh130, sh130-ssb, sh130g, sh140, sh140-ssb, sh160, sh160-ssb,
    sh160t, sh160ls, sh190, mr21, mr21-ssb, mr26, mr26-ssb, mr35);
  - schede tecniche 2025:
    - https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SH110B-Geared-EN-2025.pdf
    - …/Technical-Sheet-SH140-Geared-EN-2025.pdf
    - …/Technical-Sheet-SH190-Geared-EN-2025.pdf
    - …/Scheda-Tecnica-MR12C-Geared-ITA-2025.pdf
    - …/Technisches-Datenblatt-MR21-Geared-DE.pdf
    - …/ficha-tecnica-MR26-geared-ES-2025.pdf
  - news: https://www.sicoritaly.com/news/caratteristiche-degli-argani-per-ascensori-sicor/
- **Sassi**:
  - pagine di modello `https://www.sassi.it/en/geared-machines/{mody,leo,toro,mf-series,mb-series}/`;
  - pagine storiche https://new.sassi.it/en/products/gears/Pages/MF94.aspx (e MB95, MB108);
  - catalogo https://www.sassi.it/tabelle/file/Catalogue%20Gearbox%202023_01.pdf;
  - copia 2019 https://atwellinternational.com/wp-content/uploads/2020/07/Gear_Catalogue_2019.pdf.
- **Montanari**:
  - inserzioni fceu.eu (M73 ×2, M109);
  - schede GEAT (M73, M65);
  - Donati (M73S);
  - URL Montanari della ricerca precedente (11-fonti).
- **GEAT**:
  - https://www.geatelevators.it/it-IT/ e /chi-siamo.aspx;
  - scheda ANACAM;
  - atoka.io;
  - schede articolo degli argani rivenduti.
- **Rivenditori con configurazioni**: fceu.eu, lift-store.it, Donati, elvacenter, benelifts,
  youmats, thangmayitaly. Sono dati di inserzione, non del costruttore.

## 9. Problemi di accesso

- **Bloccati dal proxy di rete** (`EGRESS_BLOCKED`, curl `CONNECT 403`):
  - siti dei costruttori: sicoritaly.com, sassi.it, montanarigiulio.com;
  - rivenditori e ricambi: donati.it, fceu.eu, lift-store.it, shop.elvacenter.com, cdn.abicart.com;
  - copie di cataloghi e manuali: manualslib.com, img1.wsimg.com (catalogo SICOR di PEW),
    demsanascenseurs.com, it.readkong.com, atwellinternational.com, fupa.com.tr, sls-ltd.co.uk;
  - patents.google.com.
- web.archive.org non è raggiungibile e docplayer.net non si risolve (DNS).
- **Budget di ricerche della sessione esaurito** (200 su 200, condiviso): le ricerche su Montanari,
  sulle dimensioni e sulle coppie dei freni non sono state fatte.
- Il controllo dello stato del proxy è stato negato dal classificatore dei permessi: non insistito.
- Conseguenza: tutti i valori vengono da estratti. Prima dell'importazione servono i PDF dei
  costruttori (o un accordo per i dati, capitolo 8.2) e la doppia verifica.
