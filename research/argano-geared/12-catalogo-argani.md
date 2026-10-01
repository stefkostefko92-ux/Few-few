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

> **Aggiornamento (secondo giro):** gli argani GEM (serie HW) e FAER (P58F, P58S, P60F) sono nel § 10.

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

> **Aggiornamento (secondo giro):** i dati del costruttore (carichi statici, rapporti, motori, pesi, varianti) sono nel § 10.

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

> **Aggiornamento (secondo giro):** Montanari, GEM e FAER nel § 10; masse SICOR MR12C e SH160, Sassi LEO nel § 11. Gli ingombri L × W × H restano non trovati per tutti.

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

## 10. Secondo giro: Montanari, GEM e FAER (1° ottobre 2026)

> Secondo giro di ricerca, fatto lo stesso giorno con il solo motore di ricerca (i siti dei costruttori restano
> bloccati da questo ambiente). Le sigle di evidenza sono spiegate qui sotto; ogni valore va riscontrato sul
> documento del costruttore prima di usarlo.

Ricerca per Argano, 2026-10-01. Canale unico: WebSearch, 40 ricerche in totale (standard ed extended). Non sono stati usati WebFetch, curl o proxy. Tutti i numeri vengono da titoli ed estratti dei risultati di ricerca, con l'URL corrispondente. Nessun valore è stato dedotto. Le conversioni USA→SI sono indicate come «conv. nostra».

### Legenda e avvertenze

| Sigla | Significato |
|---|---|
| **E** | estratto dal sito del produttore: montanarigiulio.com, montanarigiulio.in (Montanari India), montanarina.com (Montanari North America), gem-ita.com, faer.net |
| **R** | rivenditore o distributore (fceu.eu, donati.it, geatelevators.it, liftexpo, bsbasansor, aigtcc…) |
| **D** | documento-mirror (catalogo GEM su asb.pl e modernlifttech, PDF su innolift, manualslib, scribd…) |
| **T** | solo titolo o URL |
| **E/D** | estratto aggregato da pagine del produttore e da mirror del suo catalogo, che non si può attribuire a un solo URL |
| ⚠️ | valore ambiguo (modello, unità, significato o attribuzione non chiari): vedi la nota |
| n.t. | non trovato |

- **TP/TS** indica il diametro della puleggia di trazione in mm. Le «config. tipiche» sono le *typical applications* del catalogo: sono esempi, non limiti.
- **Massa Montanari**: è il «Peso riduttore / Gearbox weight» del catalogo. Il produttore non dice cosa includa. Solo alcuni rivenditori (per M65 e M73) scrivono «senza motore, puleggia e volano».
- **Varianti Montanari**: senza suffisso = standard, senza supporto. **H** = alto carico statico senza supporto. **S** (M73S, M75S) e M85/M95 = con supporto. **AL** = albero lungo. **B** = con freno ausiliario. Le definizioni sono quelle dichiarate dal produttore (E).
- Le colonne **L×W×H / asse puleggia** sono vuote per tutti i modelli: nessun estratto ha dato ingombri utilizzabili (vedi «Non trovato»).

---

### 1. Montanari Giulio & C.

#### 1.1 Tabella per modello e variante

«= M73» significa: stesso valore della riga della gamma (rapporti, motori, olio e config. tipiche sono dichiarati per l'intera gamma).

| Modello | Statico max (kg) | Rapporti | Pulegge (mm) | Gole × Ø fune | Motori (kW) | Portate 1:1 (kg @ m/s; puleggia, rapporto, funi, kW) | Portate 2:1 | Massa (kg), cosa include | L×W×H / asse | Freno | Olio | Vite/corona | Montaggio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **M65** | 2200 E | 1/63 · 1/50 · 1/46 · 1/37 · 2/46 E | 480 E | 3×10 · 4×10 E | VVVF 4P 3–4–5,5; 6P 3–4 E | 320 @0,7 (480; 1/50; 3×10; 3 kW) E · 400 @1,0 (480; 1/37; 4×10; 4 kW) E · portata max 400 E | n.t. | 80 E, peso riduttore | n.t. | n.t. (in lista kit microcontatti freno, T) | 2 l sintetico E | n.t. | orizzontale **o verticale**; smontabile in 3 parti (motore, riduttore, puleggia) E |
| **M68** | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | ⚠️ «maximum weight 200 kg» (fonte non attribuibile, non usare) | n.t. | in lista kit freno T; «M68B» ⚠️ | n.t. | n.t. | n.t. |
| **M71** | n.t. (solo nome: «puleggia di trazione per argano M71/M76», T) | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. |
| **M73** | 2200 E (gamma 2200–3200 E; «2200–3500» E⚠️) | 1/75 · 1/60 · 1/52 · 1/46 · 1/37 · 2/55 · 2/37 E | 480 E · 700 R | 5×10 su 480 E · 2×11 e 3×11 su TS 700 R | VVVF 4P 3–4–5,5; 6P 3–4 E | 480 @1,0 (480; 1/37; 5×10; 5,5 kW) E · 250 @0,70 (TS 700; 2×11; 3,0 kW) R · 400 @1,00 (TS 700; 3×11; 5,5 kW) R · max 480 E | n.t. | 110 E; «senza puleggia, volano e motore» R | n.t. (disegno PDF: quote 485 · 150 · 546 max ⚠️) | elettromagnete 48/60 V R · freno completo 60 Vdc R · opzioni 48/60/110 V R⚠️ | 2,8 l E | n.t. | standard E |
| M73H | 2700 E | = M73 | = M73 | = M73 | = M73 | vedi M73 | n.t. | 110 E | n.t. | = M73 | 2,8 l E | n.t. | alto statico senza supporto E |
| M73S | 3200 E | = M73 | = M73 | = M73 | = M73 | vedi M73 | n.t. | 115 E | n.t. | = M73 | 2,8 l E | n.t. | con supporto E |
| M73AL | 2500 E | = M73 | = M73 | = M73 | = M73 | vedi M73 | n.t. | 145 E (⚠️ «M73AL – 150 kg» nel titolo del PDF M75) | n.t. | = M73 | 2,8 l E | n.t. | albero lungo E |
| M73B | n.t. | = M73 | = M73 | = M73 | = M73 | vedi M73 | n.t. | n.t. | n.t. | freno ausiliario E | 2,8 l E | n.t. | standard + freno ausiliario E |
| **M75** | 2000 E | 1/52 · 1/50 · 1/37 · 2/55 · 2/37 E | 480 E | 6×10 E | VVVF 4P 3–4–5,5–7,5; 6P 3–4–5,5 E | 630 @1,0 (480; 1/37; 6×10; 7,5 kW) E · max 630 E | n.t. | 115 E | n.t. | freno completo 60 Vdc (M73/M75/M76/M83) R | 2,8 l sintetico E | n.t. | standard E |
| M75H | 2700 E | = M75 | = M75 | = M75 | = M75 | vedi M75 | n.t. | 115 E | n.t. | = M75 | 2,8 l E | n.t. | alto statico senza supporto E |
| M75S | 3200 E | = M75 | = M75 | = M75 | = M75 | vedi M75 | n.t. | 120 E | n.t. | = M75 | 2,8 l E | n.t. | con supporto E |
| **M76** (vecchio) | 2000 R⚠️ | n.t. | n.t. | n.t. | n.t. | portata 320–480 (1:1) R⚠️ | n.t. | n.t. | n.t. | freno completo 60 Vdc R | n.t. | n.t. | n.t. (esiste M76S, T) |
| **M77** (sito India ⚠️) | 2300 E | 1/55 · 1/37 · 2/55 E | n.t. | n.t. | n.t. («7.5HP» in un titolo, T) | max 544 E | n.t. | 100 E | n.t. | n.t. | 3 l E | n.t. | n.t. |
| M77H | 2700 E | = M77 | n.t. | n.t. | n.t. | max 544 E | n.t. | 100 E | n.t. | n.t. | 3 l E | n.t. | n.t. |
| **M83** | 3200 E (gamma 3000–4000 E/R) | 1/69 · 1/60 · 1/50 · 1/43 · 1/37 · 2/42 · 2/50 E | 480 · 520 E · 700 R | 5×11 su 480, 5×10 su 520 E · 6×11 su 480, 4×10 su TS 700 R | VVVF 4P 3–4–5,5–7,5–9–11; 6P 3–4–5,5–7,5 (50/60 Hz) E⚠️ | 800 @1,0 (480; 5×11; 9 kW) E · 630 @1,6 (520; 5×10; 9 kW) E · 750 @1,0 (480; 1/37; 6×11; 9,0 kW) R · 550 @1,0 (TS 700; 1/43; 4×10; 7,5 kW) R · max 800 E | n.t. | 169 E | n.t. | freno 48 V opzionale R · freno completo 60 Vdc R | 4,5 l E | n.t. | standard E |
| M83AL | 3000 E | = M83 | = M83 | = M83 | = M83 | vedi M83 | n.t. | 199 E | n.t. | = M83 | 4,5 l E | n.t. | albero lungo E |
| M83B | n.t. | = M83 | = M83 | = M83 | = M83 | vedi M83 | n.t. | 169 E | n.t. | freno ausiliario E | 4,5 l E | n.t. | + freno ausiliario E |
| M85 | 4000 E | = M83 | = M83 | = M83 | = M83 | vedi M83 | n.t. | 181 E | n.t. | = M83 | 4,5 l E | n.t. | con supporto E |
| **M87** (sito India ⚠️) | 3200 E | 1/37 · 2/42 · 2/50 E | n.t. | n.t. | n.t. | portata 888 (taglia n.t.) E | n.t. | 169 E | n.t. | n.t. | 5 l E | n.t. | n.t. |
| **PENTA** | 3000 E | 1/55 · 1/43 · 1/46 · 1/37 · 2/71 · 2/55 · 3/47 E | 480 E | 5×10 E | VVVF 4P 3–4–5,5–7,5–9–11; 6P 3–4 E | 480 @1,0 (480; 1/37; 5×10; 5,5 kW) E · max 630 E | n.t. | 210 E ⚠️ (più della PENTA 830) | n.t. | n.t. | 3 l sintetico E | n.t. | **argano verticale** E |
| **PENTA 830** | 3200 E | 1/50 · 1/37 · 2/42 · 3/43 E | 480 E | 5×11 E | 9 (solo config.) E | 800 @1,0 (480; 1/37; 5×11; 9 kW) E · max 800 E | n.t. | 180 E | n.t. | n.t. | 5 l E | n.t. | **argano verticale** E |
| **M93** | 5000 E | 1/62 · 1/50 · 1/43 · 1/39 · 2/49 · 3/47 · 4/51 E | 520 E | 6×13 E | 4P fino a 22; 6P fino a 13 E | max 1250 (1:1) E · config. 1250 @1,0 (520; 1/39; 6×13; 13 kW) E, taglia non scritta ⚠️ | n.t. | 250 E | n.t. | n.t. | n.t. | n.t. | standard E |
| M93AL | 3600 E | = M93 | = M93 | = M93 | = M93 | vedi M93 | n.t. | 329 E | n.t. | n.t. | n.t. | n.t. | albero lungo E |
| M93B | n.t. | = M93 | = M93 | = M93 | = M93 | vedi M93 | n.t. | 250 E | n.t. | freno ausiliario E | n.t. | n.t. | + freno ausiliario E |
| M95 | 5000 E | = M93 | = M93 | = M93 | = M93 | vedi M93 | n.t. | 253 E | n.t. | n.t. | n.t. | n.t. | con supporto E |
| **M98** | 7000 E | 1/65 · 1/52 · 1/47 · 1/37 · 2/61 · 2/49 · 4/57 E | 580 · 520 E | 8×13 E | 18,5 · 22 (solo config.) E | config., taglia non scritta ⚠️: 1600 @1,0 (580; 1/37; 8×13; 18,5 kW) E · 1250 @1,6 (520; 2/49; 8×13; 22 kW) E | n.t. | 480 E | n.t. | n.t. | n.t. (M98H USA: 12 l) | n.t. | standard E |
| M98H | 7000 E | = M98 | = M98 | = M98 | = M98 | vedi M98 | n.t. | 402 E | n.t. | n.t. | 12 l (USA) E | n.t. | alto statico senza supporto E |
| M98HB | 7000 E | = M98 | = M98 | = M98 | = M98 | vedi M98 | n.t. | 402 E | n.t. | freno ausiliario E | n.t. | n.t. | alto statico + freno ausiliario E |
| M98HAL | 5100 E | = M98 | = M98 | = M98 | = M98 | vedi M98 | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | alto statico, albero lungo E |
| **M104** (sito India ⚠️) | 12000 E | 2/63 · 2/53 E | n.t. | n.t. | n.t. | max 2500 (1:1) E | n.t. | 780 E | n.t. | n.t. | 16,5 l E | n.t. | n.t. |
| **M105** | 9800 E | 1/71 · 1/65 · 1/49 · 2/63 · 2/53 · 4/67 E | 650 E | 8×13 E | 4P 11–13–15–18,5–22–26–30–37–45; 6P 7,5–9–11–13–15–18,5–22–26–30 E | 1600 @2,5 (650; 2/53; 8×13; 30 kW) E · 2000 @1,0 (650; 1/49; 8×13; 22 kW) E · max 3000 E | n.t. | 520 con motore B9 / 605 con B3 E | n.t. | n.t. | 16,5 l E | n.t. | senza cuscinetto esterno E |
| M105B | (già noto: 9800; non riletto qui) | = M105 | = M105 | = M105 | = M105 | vedi M105 | n.t. | 670 (B9) / 755 (B3) E | n.t. | **freno ausiliario di emergenza sull'albero lento**, senza cuscinetto esterno, EN 81-20 E | 16,5 l E | n.t. | come M105 |
| **M109** | 15000 E | 1/64 · 1/49 · 2/55 · 3/58 E | 650 · 700 · 750 E⚠️ | 8×13 · 8×15 · 6×16 E | config.: 22 · 37 · 44 · 55 E; «fino a 90» ⚠️ | config., taglia non scritta ⚠️: 1600 @2,5 (700; 3/58; 8×13; 44 kW) · 2000 @1,6 (n.t.; 2/55; 8×15; 37 kW) · 2500 @1,0 (650; 1/49; 8×15; 22 kW) · 3000 @2,0 (750; 2/55; 6×16; 55 kW) E · portata «oltre 5000» E | uso **2:1 o 4:1** dichiarato E; portate per taglia n.t. | 890 (M109) / 940 (M109B3) E | n.t. | n.t. | 38 l E | n.t. | n.t. (impiego: montacarichi, ascensori auto E) |
| **M84 · M94** | nessun risultato in 40 ricerche | | | | | | | | | | | | |

#### 1.2 Montanari North America: valori in unità USA (E)

Fonti: brochure USA M98H/M105/M109 rev. 06 (2025) e «Geared range» rev. 04 (2024) su montanarina.com.

| Modello | Statico | Portata max @500 FPM, 1:1 | Rapporti | Motori | Pulegge | Peso riduttore | Olio |
|---|---|---|---|---|---|---|---|
| M98H | 14 000 lb (≈6350 kg) | 2500 lb (≈1134 kg) | 1/37 · 1/52 · 2/61 | 4 o 6 poli: 10–15–20–25–30 HP | 21,6 · 25,6 · 31,5 in (≈549 · 650 · 800 mm) | 890 lb (≈404 kg, coerente con 402 kg) | 12 l (3,2 gal) |
| M105 | 20 000 lb (≈9072 kg) | 3500 lb (≈1588 kg) | 1/49 · 2/53 | 4 poli: 25–30–40–50 HP | 25,6 · 27,6 · 29,5 · 31,5 in (≈650 · 701 · 749 · 800 mm) | n.t. | «38 l (10 gal)» ⚠️ |
| M109 | 24 000 lb (≈10 886 kg) | 6000 lb (≈2722 kg) | 1/49 · 2/55 · 1/64 | 4 o 6 poli: 20–25–30–40–50–60–75 HP | 25,6 · 29,5 · 31,5 in (≈650 · 749 · 800 mm) | n.t. | n.t. |

Pulegge citate per la gamma: 21,6 · 23,6 · 25,6 · 27,6 · 29,5 in. 500 FPM ≈ 2,54 m/s. Conversioni nostre: 1 lb = 0,4536 kg; 1 in = 25,4 mm.

#### 1.3 Coppie e rendimenti (E)

| Gamma | Rapporto | Coppia (Nm) | Rendimento | Nota |
|---|---|---|---|---|
| M93–M95 | 1/62 | 2015 | 0,73 / 0,71 | regimi 1500/1800 e 1000/1200 giri; ⚠️ non è chiaro quale rendimento vada con quale regime |
| M93–M95 | 1/50 | 2530 | 0,74 / 0,71 | ″ |
| M93–M95 | 1/43 | 2475 | 0,73 / 0,71 | ″ |
| M93–M95 | 1/39 | 2475 | 0,77 / 0,74 | ″ |
| M93–M95 | 2/49 | 1905 | 0,82 / 0,79 | ″ (3/47 e 4/51 non presenti nell'estratto) |
| M98 | tutti | 2141–3593 | 0,63–0,89 | solo intervallo |
| M104 | 2/63 | 4363 | 0,85 | 1500 giri |
| M104 | 2/53 | 4446 | 0,85 | 1500 giri |

#### 1.4 Altri argani Montanari trovati, fuori ambito (solo nome, T/E)

- **Homelift**: MP50, M50/M50P.
- **A tamburo** (senza contrappeso): M75T, PENTA T, M83T/M83DT, M93T.
- **Scale mobili**: M73ES, M93ES (per M93ES esiste un manuale su manualslib).
- Esiste una pagina «Montanari Atex Gearboxes».

---

### 2. GEM – General Elevator Machines S.r.l.

La serie di argani GEM si chiama **HW** (HW134 CAMEL, HW140C LION, HW175 ELEPHANT). Nei risultati non c'è nessuna «serie RR». Su Donati «RR» compare nel titolo «GEM – Argano RR 1/65…», ma anche nei titoli SICOR («SH130B RR 1/43», «SH110B RR 1/43»). È quindi probabile che «RR» significhi «rapporto di riduzione»: è una **nostra interpretazione ⚠️**.

| Modello | Statico max (kg) | Rapporti | Pulegge (mm) | Gole × Ø fune | Motori (kW) | Portate | Massa (kg) | Dimensioni | Freno | Olio | Vite/corona | Montaggio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **HW134 CAMEL** | 2300 E/D (2000 con puleggia Ø600) | 1/37 · 1/42 · 1/53 · 1/65 E/D | 480 · 550 · 600 E/D | n.t. | max 4,0 AC1 · 6,1 AC2 · 6,8 VVVF E/D (rivenditore: «AC1 5HP», «AC2 5HP», T) | 3–6 persone, fino a 1 m/s R | 220, peso medio della macchina E/D | interasse albero lento-veloce 134 mm E/D; ingombri n.t. | elettromagnetico 24/48/60/110/200 V E/D | n.t. | tipo n.t.; coppia max 1094 Nm; rendimento medio 0,7 E/D | senza supporto esterno |
| HW134L CAMEL | 2700 E/D (2300 con Ø600) | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | n.t. | **con supporto esterno** E/D |
| HW134VF CAMEL / HW134B BRAKE | solo nomi (versione VVVF e versione con freno), T | | | | | | | | | | | |
| **HW140C LION** | 3100 E/D | 1/58 · 1/53 · 1/44 · 1/37 · 2/43 E/D | 480 · 560 · 600 E/D | n.t. | n.t. | n.t. | n.t. | n.t. | integrato E | n.t. | coppia max 1470 Nm E/D | corpo compatto con motore, freno e **puleggia a sbalzo** E |
| HW140CL LION | solo nome, T | | | | | | | | | | | |
| **HW175 ELEPHANT** | 5200 E/D | 1/54 · 1/42 · 1/36 · 2/58 · 2/44 · 3/42 E/D | 480 · 560 · 600 E/D | n.t. | max 11 AC2 · 20 VVVF (50 Hz) E/D | «duty load … up to 1.200 kg» R⚠️ (titolo troncato) | 450, peso medio della macchina E/D | n.t. | n.t. | n.t. | coppia max 2480 Nm E/D | n.t. |
| HW175C | solo nome (nuovo argano con SKF), T | | | | | | | | | | | |
| «Argano RR» (Donati; modello GEM non indicato) | n.t. | 1/65 R (l'estratto aggregato aggiunge 1/53 ⚠️) | 480 R (aggregato: 480 · 550 · 600 ⚠️) | n.t. | AC2 4 R (aggregato: 3,7–4 kW, AC1/VVVF e AC2 ⚠️) | n.t. | n.t. | n.t. | 60/80 V R | n.t. | n.t. | versioni dx/sx R |

Pulegge 480/550/600 e rapporti 1/53 e 1/65 dell'«Argano RR» coincidono con quelli dell'HW134. È un'**ipotesi nostra**, non dichiarata da nessuna fonte.

---

### 3. FAER S.r.l. (Roma)

GEAT Elevators (Napoli) è solo un distributore. Le sue schede P58F e P58S sono articoli di magazzino con dati specifici (rapporto, mano).

| Modello | Statico max (kg) | Rapporti | Pulegge (mm) | Gole × Ø fune | Motori (kW) | Portate | Massa | Dimensioni | Freno | Olio | Vite/corona | Montaggio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **P58F (II serie)** | 3200 E | 1/58 R (articolo GEAT); «66:1» ⚠️ | «fino a 700» E; 440 · 480 · 520 · 550 · 600 ⚠️ (estratto non attribuibile) | n.t. | 3,7 (5 HP) R; gamma FAER «fino a 10 HP» E⚠️ | fino a 630 (taglia n.t.) E; gamma «fino a 1,2 m/s» E⚠️ | n.t. | n.t. | n.t. | bagno d'olio R (quantità n.t.) | vite in acciaio legato, rettificata, su cuscinetti a rulli conici; corona in bronzo centrifugato; gioco vite-corona regolabile E⚠️/R | **doppio albero lento** (un albero unisce corona e puleggia, un albero statico porta il carico) E; «con supporto puleggia, mano dx» R |
| **P58S (II serie)** | 2800 E | 1/58 R | n.t. | n.t. | 3,7 (5 HP) R | fino a 630 E | n.t. | n.t. | n.t. | n.t. | come sopra (testo generale) E⚠️ | «senza supporto puleggia, mano sx» R |
| **P60F (II serie)** | 3500 E | n.t. | n.t. | n.t. | n.t. | 720 (taglia n.t.) E | n.t. | n.t. | n.t. | n.t. | vite e corona più dimensionate della P58F E | stessa base della P58F, meccanica diversa E |

---

### 4. Conflitti

1. **M65, statico, peso e olio.** Il produttore dà 2200 kg, 80 kg e 2 l sintetico (E). Un estratto precedente, non riverificato qui, dava «statico max 2300 kg, peso senza motore/puleggia/volano 95 kg, olio 3,2 l». Forse è una revisione di catalogo diversa.
2. **M73, statico.** La scheda della gamma dice «from 2.200 to 3.200 kg» (E). Un altro testo del sito dice «variable static load from 2200 to 3500 kg» (E⚠️), ripreso anche dai rivenditori. La variante più alta dichiarata è M73S, 3200 kg. L'estratto precedente «M73 static load max 2000 kg» contrasta con lo standard M73 a 2200 kg (E).
3. **M73AL, peso.** La pagina M73 dà 145 kg (E). Il titolo del PDF M75 riporta «M73AL – 150 kg» (E): forse un refuso per M75AL.
4. **PENTA 210 kg contro PENTA 830 180 kg.** Il modello più grande pesa meno. Forse i due valori includono cose diverse: da verificare.
5. **M98H, statico.** EU 7000 kg (E), USA 14 000 lb ≈ 6350 kg (E). Il peso è invece coerente: 402 kg ≈ 890 lb.
6. **M105, statico e portata.** EU 9800 kg e 3000 kg 1:1 (E). USA 20 000 lb ≈ 9072 kg e 3500 lb ≈ 1588 kg a 500 FPM (E).
7. **M105, olio.** EU 16,5 l (E). L'estratto USA dà «38 l (10 gal)» ⚠️, che è il valore EU dell'M109: probabile attribuzione errata.
8. **M109, statico.** EU 15 000 kg (E), USA 24 000 lb ≈ 10 886 kg (E). I valori USA sono sistematicamente più bassi (criteri di rating diversi? ⚠️). Da non mescolare.
9. **FAER P58F, pulegge e rapporto.** La pagina FAER dice «pulegge fino a 700 mm» (E). Un estratto dice 440–600 mm con «66:1» ⚠️. L'articolo GEAT dice 1/58 (R).
10. **Freno M73.** Si trovano elettromagnete 48/60 V (R), freno completo 60 Vdc (R) e opzioni 48/60/110 V (R⚠️). Non sono necessariamente in contrasto, perché esistono più versioni. Manca un dato del produttore.
11. **Range USA ed EU dei rapporti.** I rapporti USA sono sottoinsiemi di quelli EU (M98H: 1/37 · 1/52 · 2/61; M105: 1/49 · 2/53; M109: 1/49 · 2/55 · 1/64). Non è un conflitto, ma l'offerta USA è ridotta.

### 5. Non trovato

- **Dimensioni d'ingombro L×W×H e altezza dell'asse puleggia dalla base**: n.t. per **tutti** i modelli, di tutti e tre i marchi. Le uniche quote viste sono «485 · 150 · 546 max» nel PDF M73 e «0 120 185 30 485 … 733 max 385 Ø max 491» nel manuale generale Montanari, entrambe senza significato chiaro ⚠️. I disegni esistono nei PDF «Montanari-Gearbox-M73.pdf», nel manuale d'uso degli argani e nel manuale M73ES, ma i loro numeri non escono negli estratti.
- **Tipo di vite senza fine e corona** (profilo, materiali) per Montanari e GEM: n.t. Per FAER c'è solo il testo generale.
- **Freno Montanari dal produttore** (tipo, tensione standard per modello): n.t. Ci sono solo dati di rivenditori. L'esistenza di un «Annex Gearbox With Brake» e di un'«Appendice Argani Brake» è nota solo dal titolo.
- **Portate in 2:1** per tutti i modelli Montanari: n.t. (M109 dichiara solo l'uso in 2:1 e 4:1).
- **Taglia (roping) delle config. tipiche** di M93, M98 e M109: non scritta.
- **M84, M94**: nessun risultato. **M68, M71**: solo nomi. **M76**: solo statico e portata da rivenditori. **M98HAL**: peso n.t. **M93B, M83B, M73B**: statico n.t. **M105B**: statico non riletto.
- **Olio** di M93–M95 e M98 (EU): n.t.
- **Pulegge, gole e motori** di M77, M87 e M104: n.t.
- **GEM**: pesi di HW140C e HW134L, olio, dimensioni, freno dell'HW175, potenze dell'HW140C: n.t.
- **FAER**: lista completa dei rapporti, pesi, olio, freno, dimensioni: n.t. Esiste un «MACHINE SELECTION FORM» (faer.net), noto solo dal titolo.

### 6. Fonti

#### Montanari, produttore (E)

| URL | Cosa ha dato |
|---|---|
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m65/ (anche /prodotto/argani/argani-lift/m65/) | M65: statico, portata, rapporti, olio, peso, config. 1:1, motori, montaggio verticale e orizzontale, smontabile in 3 parti |
| https://www.montanarigiulio.in/wp-content/uploads/2019/10/Montanari-Gearbox-M65.pdf | titolo «The Small Versatile Gearbox – Installazione Verticale & Orizzontale» (T) |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m73-m73s-m73h-m73b-m73al/ (anche IT e DE) | M73: varianti e statici, gamma 2200–3200, portata 480, rapporti, olio 2,8 l, pesi, config., motori; un altro testo «2200–3500» ⚠️ |
| https://www.montanarigiulio.com/wp-content/uploads/2019/10/Montanari-Gearbox-M73.pdf | olio 2,8 l (titolo); quote disegno ⚠️ |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m75-m75s-m75h/ (anche IT) | M75: statici, portata 630, rapporti, olio, pesi, config., motori |
| https://www.montanarigiulio.com/wp-content/uploads/2019/10/Montanari-Gearbox-M75.pdf | titolo con i pesi «M75/M75H 115, M75S 120, M73AL 150» |
| https://www.montanarigiulio.in/catalog/gearboxes/lift-gearboxes/m77-m77h/ · https://www.montanarigiulio.in/wp-content/uploads/2020/02/Gearbox-M77.pdf | M77/M77H: statici, portata 544, rapporti, olio 3 l, peso 100 |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m83-m85/ | M83–M85: statici, varianti, rapporti, olio 4,5 l, pesi, config. 1:1, motori |
| https://www.montanarigiulio.in/catalog/gearboxes/lift-gearboxes/m87/ | M87: statico, portata 888, rapporti, olio 5 l, peso 169 |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/penta/ | PENTA: statico, portata, rapporti, olio, peso, motori, config. |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/penta-830/ | PENTA 830: statico, portata, rapporti, olio, peso, config. |
| https://www.montanarigiulio.com/pdf/catalogo/MONTANARI_SCHEDA_GEARBOX-PENTA_da_cat_REV21_05_2024.pdf | solo titolo (T) |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m93-m95/ (anche IT) | M93–M95: statici, varianti, rapporti, config. 1250 kg, motori |
| https://www.montanarigiulio.com/pdf/catalogo/MONTANARI_SCHEDA_GEARBOX-M93-M95_da_cat_REV21_05_2024.pdf | pesi M93/M93B/M93AL/M95; coppie e rendimenti |
| https://www.montanarigiulio.in/wp-content/uploads/2020/02/Gearbox-M93.pdf | titolo: M93 250 kg, statico 5000 kg |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m98-m98h/ | M98: statici e varianti, config. 1600 kg e 1250 kg |
| https://www.montanarigiulio.com/pdf/catalogo/MONTANARI_SCHEDA_GEARBOX-M98_da_cat_REV21_05_2024.pdf | M98: pesi 480/402, statici, rapporti, coppia, rendimento |
| https://www.montanarigiulio.in/catalog/gearboxes/lift-gearboxes/m104/ · https://www.montanarigiulio.in/wp-content/uploads/2020/02/Gearbox-M104.pdf | M104: statico, portata, rapporti, olio, peso, coppie |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m105/ (anche IT e montanarigiulio.in) | M105/M105B: statico, portata, rapporti, olio, pesi B9/B3, freno sull'albero lento, config. 1:1, motori |
| https://www.montanarigiulio.com/en/product/gearboxes/lift-gearboxes/m109/ (anche IT e montanarigiulio.in) | M109: statico, portata, 2:1/4:1, rapporti, olio 38 l, pesi, config. |
| https://www.montanarina.com/m109/ | estratto con pulegge 700/650/750 per le config. M109 e «fino a 90 kW» (⚠️ attribuzione) |
| https://www.montanarina.com/wp-content/uploads/2025/03/BROCHURE_USA_M98H_M105_M109_rev-06.pdf · https://www.montanarina.com/wp-content/uploads/2024/07/MONTANARI-NORTH-AMERICA_GEARED-RANGE_REV-04_07_2024.pdf · https://www.montanarina.com/gearbox/m98h/ · https://www.montanarina.com/gearbox/m105/ | tabella USA (§1.2) |
| https://www.montanarigiulio.com/wp-content/uploads/2021/02/Appendice-Argani-Brake-ITA.pdf | varianti con freno M68B/M76B ⚠️ (T) |
| https://www.montanarigiulio.com/wp-content/uploads/2020/03/Manual-Use-and-Maintenance-Gearbox-Montanari-ENG.pdf | quote disegno senza significato chiaro ⚠️; olio sintetico ISO VG 220 consigliato ⚠️ (attribuzione) |

#### Montanari, rivenditori e mirror (R/D/T)

| URL | Cosa ha dato |
|---|---|
| https://www.fceu.eu/geared-machine-montanari-m83-9-0kw-load-750kg-1-1-speed-1-0m-s-ts-480-6x11mm-01720443 | M83: 750 kg 1:1, 1,0 m/s, 9,0 kW, TS 480 6×11, 1/37, freno 48 V opzionale; «portata fino a 800, statico 3000–4000» (R) |
| https://www.fceu.eu/geared-machine-montanari-m83-7-5kw-load-550kg-1-1-speed-1-0m-s-ts-700-4x10mm-01720487 | M83: 550 kg 1:1, 1,0 m/s, 7,5 kW, TS 700 4×10, 1/43 (R) |
| https://www.fceu.eu/geared-machine-montanari-m73-load-400-kg-1-1-speed-1-00-m-s-5-5-kw-ts-700-3x11mm-01720362 | M73: 400 kg 1:1, 1,00 m/s, 5,5 kW, TS 700 3×11 (R) |
| https://www.fceu.eu/geared-machine-montanari-m73-load-250-kg-1-1-speed-0-70-m-s-3-0-kw-ts-700-2x11mm-01720047 | M73: 250 kg 1:1, 0,70 m/s, 3,0 kW, TS 700 2×11 (R) |
| http://www.donati.it/en/products/gear-motors-inverter-and-accessories/montanari-gear-motors/montanari-geared-traction-1 · https://www.donati.it/en/products/gear-motors-inverter-and-accessories/montanari-gear-motors/montanari-geared-traction-2 | M73 LH e RH, 1/52, elettromagnete 48/60 V (R) |
| https://www.donati.it/en/products/geared-motors-bedframes-pulleys-brakes-accessories/montanari-gear-motors/montanari-17 | freno completo 60 Vdc per M73/M75/M76/M83 (R) |
| https://www.donati.it/fr/produits/treuils-variation-de-frequence-et-accessoires/treuil-montanari/montanari-kit-micro-contact · https://www.telcal.com/catalogo/cod861.205-kit-contatti-controllo-freno-montanari-arg-m65m68m73m75m76m83m85m95 | lista modelli M65/M68/M73/M75/M76/M83/85/95 (T) |
| https://www.geatelevators.it/it-IT/articoli/MONTANARI-Puleggia--M71-M76--2011.aspx | nome M71/M76 (T) |
| https://www.geatelevators.it/it-IT/articoli/Argano-M73---freno-60V-9966.aspx | M73 con freno 60 V (R) |
| https://www.bsbasansor.com.tr/en-us/geared-lift-traction-machines-mr/montanari-m76-lift-machine-motor · https://aigtcc.com/p-products/montanari-m76-lift-machine-motor/ · https://aigtcc.com/p-products/montanari-m76s-lift-machine-motor/ | M76: statico 2000, portata 320–480 1:1 (R⚠️); M76S (T) |
| https://liftstrade.com/product/montanari-guilio-m77-5hp-lift-gear-box/ | «M77 7.5HP» (T) |
| https://shop.elvacenter.com/shop/machines/motor/montanari-liftmachine-m73-by-configuration/ (anche M75 e M93-M95) | solo titoli (T) |
| https://www.vemaslift.it/argani-e-gearless/m109.html | solo titolo (T) |
| https://www.manualslib.com/products/Montanari-M83-13016499.html | esiste un manuale M83 di 36 pagine (T) |
| https://de.scribd.com/document/353673570/Catalogue-Montanari-Ascenseurs · http://www.itasia.it/wp-content/uploads/2019/05/Montanari-General-Brochure-1.pdf · https://docshare.wps.com/document/montanari-gearbox-m93-m95-parameter-and-performance-data-table/192883/_payload.json · https://www.famcocorp.com/product/18480/%D9%85%D9%88%D8%AA%D9%88%D8%B1-%DA%AF%DB%8C%D8%B1%D8%A8%DA%A9%D8%B3-%D8%A2%D8%B3%D8%A7%D9%86%D8%B3%D9%88%D8%B1-%D9%85%D9%88%D9%86%D8%AA%D8%A7%D9%86%D8%A7%D8%B1%DB%8C-montanari | mirror di cataloghi e brochure: solo titoli (T/D) |

#### GEM

| URL | Cosa ha dato |
|---|---|
| https://gem-ita.com/en/hw134-camel-2/ · http://www.gem-ita.com/it/products/hw134-camel | HW134: statico, interasse, coppia, peso, rapporti, pulegge, motori max, rendimento, freno (E/D) |
| https://gem-ita.com/en/hw134l-camel-gear-box/ | HW134L: statico 2700 (2300 con Ø600), con supporto esterno (E/D) |
| https://gem-ita.com/en/hw134vf-camel-gear-box/ · https://gem-ita.com/en/gear-box/hw134b-brake-2/ · https://gem-ita.com/en/hw140cl-lion-gear-box/ | solo nomi (T) |
| https://gem-ita.com/hw140c-lion/ | HW140C: statico 3100, rapporti, coppia, pulegge, puleggia a sbalzo (E/D) |
| https://gem-ita.com/en/hw175-elephant-2/ | HW175: statico, peso, coppia, rapporti, pulegge, motori max (E/D) |
| http://www.asb.pl/uploads/pdf/GEM.pdf · http://modernlifttech.com/UserFiles/206File46364.pdf · https://it.readkong.com/page/catalogue-gem-general-elevator-machines-srl-4407451 · https://innolift.hu/wp-content/uploads/2022/05/GEM-HW134-KatCert.pdf | mirror del catalogo GEM (rev. 2017), fonte dei dati aggregati E/D (D) |
| https://www.liftexpo.com/?view=productDetails&pid=863 · https://liftexpo.com/?pid=866&view=productDetails · https://www.liftexpo.com/?view=productDetails&pid=870 | «3–6 persone, fino a 1 m/s»; HW175 «fino a 1.200 kg» ⚠️ (R) |
| https://www.elevator.gr/en-gb/%CF%80%CF%81%CE%BF%CF%8A%CE%BF%CE%BD%CF%84%CE%B1/traction-machine-s/new-machnes/traction-machines-gem/traction-machine-hw134-camel-ac1-5hp.html (e …-ac2-5hp.html) | «HW134 CAMEL AC1 5HP / AC2 5HP» (T) |
| https://www.donati.it/it/prodotti/argani-telai-pulegge-freni-accessori/argani-gem/gem-argano-rr-165-dxsx-ac2-4-kw-freno-0 | «GEM – Argano RR 1/65 dx/sx, AC2 4 kW, freno 60/80 V, puleggia 480 mm» (R) |
| https://www.donati.it/it/prodotti/argani-telai-pulegge-freni-accessori/argani-sicor/sicor-argano-sh130b-rr-143-vvvf-1500-rpm | «RR» usato anche per SICOR (T) |
| https://evolution.skf.com/it/gem-e-skf-insieme-per-il-nuovo-argano-hw175c/ | esiste l'HW175C (T) |

#### FAER

| URL | Cosa ha dato |
|---|---|
| https://www.faer.net/en/geared-machines-for-elevators-catalog/geared-machine-p58f-ii-serie/ | P58F II: statico 3200, portata 630, doppio albero lento, pulegge fino a 700 (E) |
| https://www.faer.net/en/geared-machines-for-elevators-catalog/geared-machine-p58s-ii-serie/ | P58S II: statico 2800, portata 630 (E) |
| https://www.faer.net/en/geared-machines-for-elevators-catalog/geared-machine-p60f-ii-serie/ | P60F II: statico 3500, portata 720, vite e corona maggiorate (E) |
| https://www.faer.net/en/ · https://www.faer.net/en/geared-machines-for-elevators-catalog/ | testo generale: fino a 10 HP, fino a 1,2 m/s, ghisa, vite rettificata su cuscinetti a rulli conici, corona in bronzo centrifugato (E⚠️) |
| https://www.faer.net/wp-content/uploads/2020/07/Datasheet.pdf | «MACHINE SELECTION FORM» (T) |
| https://www.geatelevators.it/it-IT/articoli/Argano-P58F-5200.aspx | P58F: 3,7 kW (5 HP), 1/58, con supporto puleggia, mano dx, bagno d'olio, gioco vite-corona regolabile (R) |
| https://www.geatelevators.it/it-IT/articoli/Argano-P58S-5198.aspx | P58S: 3,7 kW, 1/58, senza supporto, mano sx (R) |

## 11. Secondo giro: ingombri e masse di SICOR e Sassi (1° ottobre 2026)

> Secondo giro di ricerca, fatto lo stesso giorno con il solo motore di ricerca (i siti dei costruttori restano
> bloccati da questo ambiente). Le sigle di evidenza sono spiegate qui sotto; ogni valore va riscontrato sul
> documento del costruttore prima di usarlo.

Data: 1 ottobre 2026. Unico canale: WebSearch, **40 ricerche** (7 standard, 33 extended). Nessun
PDF è stato aperto. Ogni valore viene dall'estratto o dal riassunto di un risultato e va
**verificato sul documento** prima di entrare nel catalogo dell'app.

Livelli di evidenza:

- **E**: estratto da pagina o PDF del costruttore;
- **R**: rivenditore;
- **D**: copia del documento (manualslib, scribd, yumpu, docplayer, copie dei cataloghi);
- **T**: solo titolo o URL.

Altre sigle: ⚠️ = estratto ambiguo (modello, unità o significato non chiari); **n.t.** = non
trovato; **n.r.** = non ricercato di nuovo, perché il valore è già in `12-catalogo-argani.md`.

### In breve

- **L × W × H, altezza dell'asse e interasse dei fori, con etichetta: non trovati per nessuno dei 22
  modelli.** Le quote stanno nei disegni e i riassunti di ricerca non le leggono.
- **SICOR**: trovate le tabelle quotate del **telaio con puleggia di rinvio superiore** (avvolgimento
  “CSW”):
  - complete per SH110B e SH140, solo i due estremi per SH190;
  - per ogni Ø di puleggia danno X e L max, per ogni Ø di rinvio danno A, B e C;
  - il significato delle lettere non è negli estratti.
- **Masse nuove**:
  - MR12C: 240 kg (E);
  - LEO: 202–218 kg con motore 4/16, senza volano e puleggia (D);
  - MF48: circa 245–269 kg con motore 4/16 (E ⚠️).
  - **MODY: non trovata. MF84: solo un estratto ambiguo.**
- **Sassi**: trovate quattro righe di numeri **senza intestazioni** dalla tabella quote del
  catalogo (MF48, TORO, MF84, MF94) e il testo di un disegno quotato MF84 (versione freno DQ). Non
  si possono usare senza il disegno.
- **Coppia frenante: non trovata per nessun modello.**
- **Le quote esistono in forma scaricabile, ma questa rete le blocca**:
  - SICOR pubblica “2D and 3D technical drawings (ZIP)” sulle pagine modello;
  - Sassi tiene DXF e STEP nell'area riservata “MY SASSI”;
  - i manuali SICOR su manualslib hanno la sezione “Technical features” con gli ingombri in
    configurazione massima.

### 1. SICOR

| Modello | L | W | H | Asse puleggia | Basamento / fori | Massa | Pulegge e gole | Freno · coppia |
|---|---|---|---|---|---|---|---|---|
| SV110 | n.t. | n.t. | n.t. | n.t. | n.t. | 160 kg max (E) | Ø480, Ø520 (E); Ø600 solo da Donati (R) ⚠️ | elettromagnete 60 V (R) · n.t. |
| SH110B | n.t. | n.t. | n.t. | n.t. | telaio CSW, A/B/C per Dt (E ⚠️) → §1.1; fori n.t. | n.r. (210 kg) | Ø320, 360, 400, 450, 480, 520, 550, 600 (E); Ø450 × 70 mm (T); 600 × 4 gole, funi 9–11 (R) | elettromagnete, bobina 200 V (T) o 60 V (R) · n.t. |
| MR12C | n.t. | n.t. | n.t. | n.t. | frammenti ⚠️ → §1.2 | **240 kg**, “geared weight” (E) | Ø340, 400, 450, 480, 550, 600 (E ⚠️). Gole: 4×Ø11 e 5×Ø11 passo 17; 4×Ø12 e 3×Ø13 passo 19; 6×Ø8 passo 12 o 20 ⚠️ (E) | elettromagnete, versioni 24–200 V (E ⚠️) · n.t. |
| SH130 | n.t. | n.t. | n.t. | n.t. | tabella telaio CSW con Dt 400/450/520, valori non estratti (E) | 250–260 kg max (E) | gole a V e a U con sottosquadro, parametri γ, β, passo (E); gamma Ø320–700 (T); 600 × 4, funi 9–11 (R) | elettromagnete, bobina 200 V (T) o 60 V (R) · n.t. |
| SH130G | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (250 kg) | n.t. | n.t. |
| SH140 | n.t. | n.t. | n.t. | n.t. | telaio CSW, A/B/C per Dt (E ⚠️) → §1.1; fori n.t. | 280 kg (R) | Ø360, 400, 450, 480, 520, 560 ⚠️, 600 (E); gamma Ø320–700 (T) | elettromagnete, bobina 200 V (T) · n.t. |
| SH160 | ⚠️ → §1.2 | ⚠️ | ⚠️ | n.t. | n.t. | **450 kg**, “geared weight” (E) | Ø450, 520, 560, 600, 650 (E). Rinvii: Dt 400 7×Ø8, Dt 450 6×Ø11, Dt 520 5×Ø13 (E ⚠️) | elettromagnete, bobina 200 V (T) · n.t. |
| SH190 | n.t. | n.t. | n.t. | n.t. | telaio: solo estremi (E) → §1.1 | 620–645 kg (R ⚠️) | Ø520, 600, 650, 690, 750 (E) | n.t. |
| MR21 | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (770–1 000 kg) | tabella D, larghezza E, P e carico F presente, valori non estratti (E) | n.t. |
| MR26 | n.t. | n.t. | n.t. | n.t. | ingombri nel manuale, non estratti (D) | n.r. (1 200–1 600 kg) | n.t. | n.t. |
| MR35 | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (1 600–1 900 kg) | n.t. | n.t. |
| MR12 (storico) | “306 ÷ 348” ⚠️ (D) | n.t. | n.t. | n.t. | “4 x d.22” ⚠️, forse 4 fori Ø22 (D) | 260 kg max (D) | ricambi Ø480 e Ø600 × 4 gole, funi 9–11 (R) | n.t. |
| MR16 (storico) | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (450 kg) | n.t. | il manuale descrive il freno, valori non estratti (D) |
| MR17 (storico) | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (550 kg) | n.t. | n.t. |

Dati nuovi non dimensionali:

- SH160: potenza 4 poli VVVF 7,5–20 kW a 50 Hz (E). Prima mancava; è uguale a quella del vecchio
  MR16.
- La fiche SH130 FR chiarisce che “CSW” è un **tipo di avvolgimento**: la tabella quote è quella del
  telaio per macchina con puleggia superiore e avvolgimento CSW. La sigla resta non spiegata.

#### 1.1 Tabelle del telaio con puleggia di rinvio (E)

Pulegge di trazione D, quote X e L max (mm):

| D | SH110B: X | SH110B: L max | SH140: X | SH140: L max |
|---|---|---|---|---|
| 320 | non estratto | non estratto | non in tabella | non in tabella |
| 360 | 200 | 880 | 200 | 880 |
| 400 | 180 | 900 | 180 | 900 |
| 450 | 155 | 925 | 155 | 925 |
| 480 | 140 | 940 | 140 | 940 |
| 520 | 120 | 960 | 120 | 960 |
| 550 | 105 | 975 | non in tabella | non in tabella |
| 560 | non in tabella | non in tabella | 105 ⚠️ | 975 ⚠️ |
| 600 | 80 | 1000 | 80 | 1000 |

Pulegge di rinvio Dt, quote A, B, C (mm):

| Dt | SH110B: A / B / C | SH140: A / B / C |
|---|---|---|
| 400 | 1012 / 280 / 692 | 1016 / 280 / 696 |
| 450 | 1012 / 280 / 692 | 1016 / 280 / 696 |
| 520 | 1032 / 300 / 712 | 1036 / 300 / 716 |

SH190, solo estremi:

- pulegge D: 520, 600, 650, 690, 750;
- D 520 → X 340, L max 1160;
- D 750 → X 225, L max 1275.

Controllo di coerenza (calcolo, non dato). Le due quote cambiano esattamente di D/2:

- SH110B: X + D/2 = 380 e L max − D/2 = 700 in ogni riga;
- SH190: X + D/2 = 600 e L max − D/2 = 900 a entrambi gli estremi;
- SH140: la riga “560” rompe la relazione. Con D = 560 servirebbero X 100 e L max 980, mentre 105
  e 975 corrispondono a D = 550. Le tabelle SH110B e SH140 sono quasi identiche: **verificare sul
  PDF**.

La relazione serve a controllare i valori, non a dedurre il significato delle quote.

#### 1.2 Estratti ambigui SICOR (⚠️, da non usare senza il PDF)

- **SH160** (E):
  - “A 305, B 239 max, C 260, D 90, E 100/167, X 752 max, L max 910”;
  - per le pulegge di trazione “E 115”, per i rinvii “E 116”;
  - la struttura non somiglia alle tabelle SH110B e SH140: etichette probabilmente rimescolate dal
    riassunto.
- **MR12C** (E): valori “340, 195, 245”; “L massimo fino a 930 mm, L minimo 500 mm”.
- **MR12, manuale a p. 12** (D): in “Technical Features”, ingombri in configurazione massima,
  compare il frammento “306 ÷ 348 4 x d.22”.

### 2. Alberto Sassi

| Modello | L | W | H | Asse puleggia | Basamento / fori | Massa | Pulegge e gole | Freno · coppia |
|---|---|---|---|---|---|---|---|---|
| MODY | n.t. | n.t. | n.t. | n.t. | n.t. | **n.t.** (tre ricerche mirate) | Ø320–600, larghezza 80 mm, puleggia 19–39 kg (E); configurazioni Ø480, 560, 600 × 4 gole × Ø10 (R) | n.t. |
| LEO | n.t. | n.t. | n.t. | n.t. | viti classe 8.8, serraggio 170 Nm (D); fori n.t. | **202 / 210 / 218 kg** con 4/16 da 3,5 / 4,0 / 5,5 kW, senza volano e puleggia (D); VF n.t.; “peso motore” 186 kg (R ⚠️) | Ø320–700, larghezza 90 mm, puleggia 24–48 kg, funi 8–16 (E); Ø500 (R) | versione con freno a disco (T) · n.t. |
| TORO | riga ⚠️ → §2.1 | n.t. | n.t. | n.t. | n.t. | n.r. (246–299 kg) | Ø520; passo gole 18 mm; gola con sottosquadro a 97° (R) | freno a tamburo 220 V DC (R); freni DQ come freno di sicurezza standard (E ⚠️) · n.t. |
| MF48 | riga ⚠️ → §2.1 | n.t. | n.t. | n.t. | n.t. | **circa 245–269 kg** con 4/16 da 3,5 a 7,3 kW (E ⚠️) | serie MF: Ø450–800, larghezze 80/115/180 mm (E, dato di serie) | “attacco con encoder” nella versione con freno (E ⚠️) · n.t. |
| MF84 | riga ⚠️ → §2.1 | n.t. | n.t. | n.t. | disegno DQ, quote non attribuibili (T ⚠️) → §2.2 | **n.t.** (estratto ambiguo → §2.3) | Ø450–800, larghezza 115–180 mm (T); serie MF (E) | versione con freno DQ (T) · n.t. |
| MF94 | riga ⚠️ → §2.1 | n.t. | n.t. | n.t. | n.t. | n.r. (529–623 kg) | serie MF Ø450–800 (E) ⚠️, contro Ø1000 della pagina storica | n.t. |
| MB95 | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (980 kg) | n.t. | n.t. |
| MB108 | n.t. | n.t. | n.t. | n.t. | n.t. | n.r. (1 405 kg) | n.t. | n.t. |

Il manuale LEO in tedesco parla anche di “una sola posizione per la puleggia di trazione e i piani
d'appoggio” (parafrasi del riassunto ⚠️).

#### 2.1 Righe della tabella quote del catalogo (⚠️ senza intestazioni)

Il riassunto le attribuisce al catalogo 2023/01 su sassi.it. La ricerca includeva però anche le copie
2019 (Atwell), 2022 (construction.am) e IGI Lift.

| Modello | Valori in mm, nell'ordine dell'estratto | Quanti valori |
|---|---|---|
| MF48 | `600 800 100 30 365 150 515 320 490 30 30 600` | 12 |
| TORO | `700 960 130 40 430 220 650 220 40 30 700` | 11: ne manca uno rispetto alle altre |
| MF84 | `800 1030 115 45 513 187 700 260 460 40 50 800` | 12 |
| MF94 | `800 1020 110 35 165 515 680 200 460 40 35 800` | 12 |

- In ogni riga il primo e l'ultimo valore coincidono (600, 700, 800, 800).
- Il significato delle colonne non è negli estratti.
- Le righe di MODY e LEO non sono emerse.
- **Non usarle come L, W o H.**

#### 2.2 Disegno quotato MF84, versione DQ, mano sinistra (T ⚠️)

Il file `mf84_dq_sx_2019_04.PDF` su sassi.it ha come titolo di ricerca il testo del disegno:
“(115-180) ( 450-800) 245 =•= 290 150 E 500 =•= B A 260 40 Encoder D C 400 =•=”.

- “(115-180)” e “(450-800)” coincidono con larghezze e diametri delle pulegge della serie MF (E).
- Gli altri numeri non hanno la loro linea di quota.
- Le lettere A–E sono quote variabili, date in una tabella che l'estratto non riporta.

Il nome del file fa pensare a disegni simili per gli altri modelli. **Non trovati.**

#### 2.3 Estratto ambiguo sulla massa MF84

L'estratto dice: “245 kg (3,5–4,0 kW) … 378 kg (6,0–7,3 kW), senza volano e puleggia, 4/16”.

- 3,5–4,0 kW sta sotto la gamma MF84 (6,0–20,6 kW).
- 245 kg coincide con l'inizio della tabella MF48.
- È quindi un probabile miscuglio delle righe MF48 e MF84: **la massa MF84 resta non trovata.**

### 3. Conflitti

1. **MR12, massa**: 240 kg nelle copie di terzi (giro precedente) contro 260 kg massimi nel
   manuale (D). L'MR12C attuale dichiara 240 kg (E).
2. **SH190, massa**: 620 kg dalla scheda (giro precedente, E) contro 620–645 kg (R ⚠️).
3. **SH190, potenza**: la scheda dice 7,5–30 kW a 50 Hz e, con 6/16 poli, 4,7–10 kW a 60 Hz. Il
   rivenditore dice 4,2–30 kW a 50 Hz e 4,7–33 kW a 60 Hz (R ⚠️).
4. **Etichetta errata**: l'estratto da domini di rivenditori attribuisce a “SH160” dati SH190 (51 kN,
   rapporti 1/40 … 3/47, olio 11,5 l). La scheda SH160 2025 (E) dà 42,2 kN, 450 kg e 9 l.
5. **SH140 contro SH110B**: tabelle del telaio quasi identiche. SH140 ha la riga “560” dove SH110B
   ha “550”, con le stesse X e L max, e A, C maggiori di 4 mm.
6. **SV110, pulegge**: Ø480 e Ø520 sulla pagina SICOR (E); Donati vende anche varianti Ø600 (R).
7. **LEO, massa**: 202–218 kg con 4/16, senza volano e puleggia (D), contro “peso motore” 186 kg
   con 7,3 kW VVVF/AC2 (R ⚠️, significato non chiaro).
8. **MF84, massa**: le potenze dell'estratto sono fuori dalla gamma MF84 (§2.3).
9. **Pulegge della serie MF**: Ø450–800 sulla pagina attuale (E) contro MF94 fino a Ø1000 sulla
   pagina storica (giro precedente).
10. **SH110B da lift-store**:
    - il titolo attuale dice RR 1/43, la nota precedente RR 1/55;
    - lo slug dice 3,6 kW, il titolo 4 kW.
11. **MB108, portate**: lift-store dice 5 000 kg in 1:1, 8 000 kg in 2:1 e 15 000 kg in 4:1. Il
    giro precedente aveva 5 000 / 10 000 / 15 000 kg senza sospensioni.
12. **SH130, rapporti nella fiche FR**: l'estratto ha 1/52, 1/45, 1/43, 1/37 e 2/43; mancano 2/53 e
    3/47 della pagina. È probabilmente un estratto parziale, non un conflitto vero.
13. **Nome del file SH130 FR**: `Fiche-technique-SH130-gearless-FR.pdf` contiene dati geared.

### 4. Non trovato

- **L, W, H etichettati**: tutti i 22 modelli. Per la stessa macchina non c'è nemmeno la
  configurazione (con motore e freno, puleggia destra o sinistra).
- **Altezza dell'asse della puleggia dal basamento**: tutti i modelli.
- **Posizione e sbalzo della puleggia lungo la macchina**: tutti i modelli. Per LEO c'è solo “una
  sola posizione” ⚠️.
- **Impronta del basamento e interasse dei fori**: tutti i modelli. Ci sono solo frammenti:
  - MR12: “4 x d.22” ⚠️;
  - LEO: viti 8.8 serrate a 170 Nm;
  - MF84: il disegno DQ ⚠️.
- **Massa**:
  - MODY: non trovata;
  - MF84: c'è solo l'estratto ambiguo;
  - LEO VF: non trovata.
  - Per SH110B, SH130G, MR21, MR26, MR35, MR16, MR17, TORO, MF94, MB95 e MB108 non è stata
    ricercata di nuovo.
- **Coppia frenante**: tutti i modelli.
- **Tipo di freno SICOR**: oltre a “elettromagnete” e alle tensioni (24–200 V, 60 V, 200 V), niente.
- **Nessun dato dimensionale nuovo** per MR21, MR26, MR35, MR16, MR17, SH130G, MB95 e MB108.
- **Significato delle quote**: X, L max, A, B, C di SICOR e colonne della tabella Sassi.

### 5. Dove sono le quote, per chiudere i buchi

Tutte le fonti qui sotto sono bloccate per questo ambiente. Le deve aprire o scaricare a mano il
titolare.

- **SICOR**: le pagine modello offrono “2D and 3D technical drawings (ZIP)” oltre alle schede 2025
  (EN, IT, FR, DE, ES), che hanno le tabelle quotate.
- **Sassi**:
  - disegni DXF e STEP nell'area riservata “MY SASSI”, dopo il login;
  - PDF dei disegni per modello in `sassi.it/tabelle/file/`, per esempio `mf84_dq_sx_2019_04.PDF`;
  - catalogo `Catalogue Gearbox 2023_01.pdf`.
- **Manuali SICOR su manualslib**: MR12 a p. 12, MR14 a p. 11, MR16, MR17, MR26, SH110B. Hanno la
  sezione “Technical features” con gli ingombri in configurazione massima.

### 6. Fonti

#### SICOR, costruttore (E salvo dove indicato)

- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SH110B-Geared-EN-2025.pdf:
  elenco pulegge 320–600; tabella D → X, L max; tabella Dt → A, B, C.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SH140-Geared-EN-2025.pdf:
  tabella D → X, L max; tabella Dt → A, B, C.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SH190-Geared-EN-2025.pdf:
  pulegge 520–750; X e L max, solo gli estremi.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SH160-Geared-EN-2025.pdf:
  - 450 kg, 9 l, 42,2 kN, 7,5–20 kW;
  - pulegge e rinvii con gole;
  - quote ⚠️.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-MR12C-Geared-EN-2025.pdf:
  - 240 kg, 3,8 l, 25,5 kN;
  - gole e passo; tabella elettromagneti 24–200 V;
  - frammenti di quote ⚠️.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Scheda-Tecnica-MR12C-Geared-ITA-2025.pdf:
  versione italiana, nessun numero nuovo (T).
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Fiche-technique-SH130-gearless-FR.pdf:
  - SH130: 250–260 kg, 3,7 l;
  - gole a V e a U con sottosquadro;
  - la tabella del telaio è “con puleggia superiore e avvolgimento CSW”, con Dt 400/450/520.
- https://www.sicoritaly.com/wp-content/uploads/2025/03/Technisches-Datenblatt-MR21-Geared-DE.pdf:
  struttura della tabella pulegge (D, E, P, F), senza valori.
- https://www.sicoritaly.com/en/geared-series/geared-sh130/: 250–260 kg; disegni 2D e 3D in ZIP
  disponibili.
- https://sicoritaly.com/en/geared-series/geared-sv110/: 160 kg max, 2 000 kg, pulegge 480 e 520,
  rapporti 1/55 e 1/43, scheda tecnica citata.
- https://www.sicoritaly.com/en/geared-series/geared-sh130g/: nessun dato nuovo (T).
- https://www.sicoritaly.com/wp-content/uploads/2023/01/SICOR_catalogo_generale_geared_gearless_ENG_low.pdf:
  presente nei risultati, nessun numero estratto (T).

#### SICOR, rivenditori e copie

- https://www.donati.it/en/catalogo-prodotti/gear-motors-inverter-and-accessories/sicor-gear-motors/geared-traction-machine-1:
  varianti SV110 con Ø480, 520 e 600, freno 60 V (R).
- https://www.donati.it/en/products/gear-motors-inverter-and-accessories/sicor-gear-motors/sicor-geared-traction-machine-12:
  SV110 1/43 VVVF, freno 60 V (T).
- https://www.donati.it/sites/default/files/commerce_product/product/shared_attachment/2024-09/Brochure%20SV110_ENG_HiRes.pdf:
  esiste la brochure SV110 ENG; nessun numero (T).
- https://www.donati.it/en/products/geared-motors-bedframes-pulleys-brakes-accessories/sicor-gear-motors/sicor-sheave-o-450x70:
  puleggia Ø450 × 70 mm per SH110B e SH130B (T).
- https://www.donati.it/en/products/geared-motors-bedframes-pulleys-brakes-accessories/sicor-gear-motors/sicor-anti-fleeting:
  anti-scavalcamento SH110-130-140 da Ø320 a Ø700 (T).
- https://www.donati.it/en/products/gear-motors-inverter-and-accessories/sicor-gear-motors/sicor-brake-coil-200-v-geared:
  bobina freno 200 V per SH110B, SH130B, SH140 e SH160 (T).
- https://www.donati.it/en/products/gear-motors-inverter-and-accessories/sicor-gear-motors/sicor-geared-traction-machine-15:
  SH110B RR 1/43 VVVF 1500 giri/min, 4 kW (T).
- https://www.donati.it/en/catalogo-prodotti/gear-motors-inverter-and-accessories/sicor-gear-motors/electromagnet-sicor-geared:
  pagina degli elettromagneti, senza valori (R).
- https://lift-store.it/124-argani/6913-argano-sicor-sh110b-ac1-vvf-36-kw-50hz-rr-1-43-tens-freno-60v-4-poli-puleggia-6000x4x9-11-9901286004359.html:
  SH110B 4 kW, RR 1/43, freno 60 V, puleggia 600 × 4 × 9/11 (R).
- https://lift-store.it/123-argani-e-gearless/6701-azionamento-vvf-ac1-potenza-motore-36-kw-50hz-tens-elettromagnete-freno-60v-giri-motori-asincroni-1500-tensione-nominal-9901286002805.html:
  SH130B 3,6 kW, 6 poli, freno 60 V, puleggia 600 × 4 × 9-11 (R).
- https://lift-store.it/128-pulegge/6708-puleggia-trazione-argano-sicor-d600x4x9-11-per-a-rgano-sh110-sh130-mr12-mr10-mr13-9901286018530.html
  e
  https://lift-store.it/128-pulegge/6707-puleggia-trazione-argano-sicor-d480x4x9-11-per-ar-gano-sh110-sh130-mr12-mr10-mr13.html:
  pulegge Ø600 e Ø480 × 4 × 9-11 (R).
- https://igilift.com/products/spare-parts/geared-machines/sicor/: URL più probabile dell'estratto
  aggregato da domini di rivenditori (R ⚠️):
  - SH140: 280 kg, 32,4 kN, 3,6 l;
  - “SH160”, in realtà SH190: 620–645 kg, 4,2–30 kW;
  - pulegge 480, 520, 550, 600.
- https://shop.elvacenter.com/shop/uncategorized/sicor-sh110b-rr-traction-motor-1-43-scale-vvvf-1000-rpm-2-7-kw-2/:
  SH110B 1/43, 2,7 kW (R, già noto).
- https://www.manualslib.com/manual/3437508/Sicor-Mr12.html: MR12, 260 kg max; “306 ÷ 348 4 x
  d.22” a p. 12 (D ⚠️).
- https://www.manualslib.com/manual/3437732/Sicor-Mr26.html: il manuale ha gli ingombri in
  configurazione massima; valori non estratti (D).
- https://www.manualslib.com/manual/1378386/Sicor-Mr16.html: manuale di 36 pagine con freno; nessun
  valore (D).
- https://www.manualslib.com/manual/1713579/Sicor-Mr17.html: esiste il manuale MR17 (T).
- https://www.manualslib.com/manual/3435238/Sicor-Sh110b.html?page=2: indice del manuale SH110B (T).
- https://www.manualslib.com/manual/2629734/Sicor-Mr14.html?page=11 e
  https://www.manualslib.com/brand/sicor/winches.html: MR14 “Technical Features” ed elenco dei
  manuali SICOR (T, MR14 fuori elenco).

#### Sassi, costruttore (E salvo dove indicato)

- https://www.sassi.it/tabelle/file/Catalogue%20Gearbox%202023_01.pdf:
  - pulegge MODY larghezza 80 mm, 19–39 kg; LEO larghezza 90 mm, 24–48 kg;
  - masse MF48 circa 245–269 kg ⚠️;
  - righe senza intestazioni ⚠️ di MF48, TORO, MF84, MF94;
  - estratto ambiguo sulle masse MF84.
- https://www.sassi.it/en/geared-machines/leo/: pulegge LEO Ø320–700, larghezza 90 mm, funi 8–16.
- https://www.sassi.it/en/geared-machines/mf-series/: pulegge della serie MF Ø450–800, larghezze
  80/115/180 mm.
- https://www.sassi.it/en/geared-machines/mody/: nessuna massa.
- https://www.sassi.it/tabelle/file/mf84_dq_sx_2019_04.PDF: testo del disegno quotato MF84 DQ SX
  (T ⚠️).
- https://www.sassi.it/en/brakes/: freni DQ sul TORO come freno di sicurezza standard; “attacco con
  encoder” per MF48 con freno; DXF e STEP in “MY SASSI” (riassunto ⚠️).
- Consultati senza dati utili:
  - https://www.sassi.it/en/frames/
  - https://www.sassi.it/tabelle/file/Catalogo%20generale%202023_01.pdf
  - https://new.sassi.it/en/products/gears-with-drum/Pages/Leo-Toro-drum.aspx: versioni a tamburo,
    fuori scopo.

#### Sassi, copie e rivenditori

- https://www.scribd.com/document/360945986/Leo: LEO 4/16 202, 210, 218 kg senza volano e puleggia
  (D).
- https://www.yumpu.com/de/document/view/21315286/getriebe-leo-ausfuhrung-mit-alberto-sassi-spa:
  LEO con freno a disco; viti 8.8 serrate a 170 Nm; “una sola posizione” della puleggia ⚠️ (D).
  - Pagina 7, https://www.yumpu.com/de/document/view/21315286/getriebe-leo-ausfuhrung-mit-alberto-sassi-spa/7:
    manovra a mano, nessun numero (T).
- https://www.yumpu.com/fr/document/view/17531017/treuil-leo-version-avec-frein-a-disques-alberto-sassi-spa:
  LEO versione con freno a dischi (T).
- https://docplayer.net/50962885-alberto-sassi-s-p-a-catalogo-argani-gearboxes-catalogue-rev-2016-01-riproduzione-riservata-copyright-by-alberto-sassi-spa.html:
  catalogo 2016/01 con tabelle PESO/WEIGHT MF48-MF84; numeri non estratti (D).
- https://atwellinternational.com/wp-content/uploads/2020/07/Gear_Catalogue_2019.pdf,
  https://igilift.com/webiste%20pdf/Spare%20Parts%20Category/Geared%20and%20Gearless/ALBERTO%20SASSI-GEARED%20SERIES%20-%20Catalogue.pdf,
  https://www.construction.am/images/photo-gallery/3948/Alberto_SASSI_Catalogue_Geared_2022_Rev_03.pdf
  e https://it.readkong.com/page/catalogo-generale-general-catalogue-gears-gearless-2054126: copie dei
  cataloghi, tra le fonti degli estratti aggregati su masse e righe (D).
- https://omranmodern.com/mag/wp-content/uploads/2024/05/Sassi-TORO-11-KW-1.pdf (R):
  - TORO 11 kW, 27,5 A; puleggia 520;
  - passo gole 18 mm; gola a 97° con sottosquadro;
  - freno a tamburo 220 V DC; volano “400-32P”; 1,00 m/s; 4 200 kg.
- https://www.famcocorp.com/product/18228/%D9%85%D9%88%D8%AA%D9%88%D8%B1-%DA%AF%DB%8C%D8%B1%D8%A8%DA%A9%D8%B3-%D8%A2%D8%B3%D8%A7%D9%86%D8%B3%D9%88%D8%B1%DB%8C-%D8%A2%D9%84%D8%A8%D8%B1%D8%AA%D9%88-%D8%B3%D8%A7%D8%B3%DB%8C-alberto-sassi
  (R ⚠️): LEO, 7,3 kW, puleggia 500, 750 kg, “peso motore” 186 kg.
- https://lift-store.it/124-argani/6034-argano-sassi-mod-mody-4-poli-vvvf-portata-480-kg-velocita-070-m-s-potenza-4kw-puleggia-mano-sinistra-freq-50hz-6474636064882.html,
  https://lift-store.it/124-argani/6036-argano-sassi-mod-mody-4-poli-vvvf-portata-480-kg-potenza-4kw-puleggia-mano-destra-freq-50hz-tens-400v-tensione-elettr-2390062352109.html
  e
  https://lift-store.it/124-argani/6035-argano-sassi-mod-mody-4-poli-vvvf-portata-480-kg-potenza-4kw-puleggia-mano-sinistra-freq-50hz-tens-400v-tensione-elett-4539589417566.html
  (R): MODY VVVF 4 kW, 480 kg, pulegge 480, 560 e 600 × 4 × 10, mano sinistra o destra.
- https://lift-store.it/124-argani/6040-argano-mf48-portata-630-kg-con-tiro-1-1-portata-1000-kg-con-tiro-2-1-rapporti-1-60-1-47-2-71-3-56-gamma-potenze-4-16-9215039774001.html,
  https://lift-store.it/124-argani/6042-argano-mf94-portata-fino-a-2500-kg-con-tiro-1-1-portata-4000-kg-con-tiro-2-1-regolazione-4-16-vvvf-rapporti-1-65-1-53-2-2156594009580.html
  e
  https://lift-store.it/124-argani/6045-argano-mb108-portata-fino-a-5000-kg-con-tiro-1-1-portata-8000-kg-con-tiro-2-1-portata-15000-kg-con-tiro-4-1-regolazione-4-1-8060074281493.html
  (R): portate MF48 e MF94, coerenti; MB108 in conflitto.
- https://www.geatelevators.it/it-IT/articoli/Argano-Asincrono-MODY-10553.aspx: MODY VVVF 1/60 (R).
- Solo titolo: https://aigtcc.com/p-products/alberto-sassi-mf48-lift-machine-motor/ e
  https://globalpartnerelevator.com/alberto-sassi-%E2%80%93-mf-84-traction-machine/en-US/products/514
  (T).

Ricerche senza risultati utili:

- russo (“габаритные размеры”): due ricerche;
- docplayer e scribd per SICOR;
- MODY “PESO / WEIGHT”.
