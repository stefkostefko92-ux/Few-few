# Limitatori di velocità e tenditori — PFB e Montanari Giulio & C.

[← Indice](README.md)

> Raccolta del 1° ottobre 2026 per i cataloghi e i disegni di Argano. I file di lavoro citati nel testo (cartella `raw/`,
> script e registri della sessione) non sono nel repository: restano come traccia del metodo.


Raccolta del **2026-10-01** per Argano (pianta, sezione, 3D, posa in sala macchine / testata / guida). Solo dati letti da fonti web; nessun valore stimato o dedotto per analogia. Dove manca: **non trovato**.

> **Affidabilità — leggere prima.** I siti dei costruttori e dei rivenditori **non erano apribili** da questa sessione (egress bloccato, vedi §6). Ogni valore qui sotto è l'**estratto testuale del motore di ricerca** (WebSearch, modalità *extended*, spesso limitata al dominio della fonte) relativo alla pagina indicata: la pagina **non è stata aperta direttamente**, quindi pagina/tabella del PDF non sono indicabili e **nessun valore è stato letto da un disegno** (`fromDrawing: false` ovunque). Prima dell'uso in produzione ogni numero va riscontrato sulla fonte (elenco in §7). Il budget di ricerche della sessione si è esaurito prima di poter cercare Montanari.

Legenda: Vn = velocità nominale massima ammessa; Vint = campo delle velocità di intervento; ↓ = intervento solo in discesa; ↓↑ = intervento nei due sensi. Codici fonte tra parentesi quadre → §7.

## 1. PFB — limitatori di velocità

Gamma attuale elencata su pfb.it (categoria *Overspeed governors*): LX120, LXM120, LK120, LKT120, LX150, LX180, LX200, LK200, LK250, LK300, LK315, R1 (R1, R1LR, R1 200, R1 250, R1 300), R3, R5 (R5, R5R, R5SP, R5S), R6 (R6, R6R, R6SP), R10BF, R12BF. Modelli fuori produzione: **non trovato**.

### 1a. Prestazioni (pagine prodotto pfb.it)

| Modello | Direzione | Puleggia Ø [mm] | Fune Ø [mm] | Vn max [m/s] | Vint [m/s] | Fonte |
|---|---|---:|---|---:|---|---|
| LX120 | bidirezionale | 120 | 6–6,5 | 2,00 | 0,20–2,30 | [P-LX120] |
| LK120 | bidirezionale | 120 | 4 (standard); 6–6,5 (in deroga) | 2,00 | 0,20–2,30 | [P-LK120] |
| LX150 | bidirezionale | 150 | 6–6,5 | 2,34 | 0,21–2,70 | [P-LX150] |
| LX180 | bidirezionale | 180 | 4–6 (standard); 6,5 (in deroga) | 2,17 | 0,25–2,50 | [P-LX180] |
| LX200 | bidirezionale | 200 | 6 / 6,5 | 2,30 | 0,20–2,66 | [P-LX200] |
| LK200 | bidirezionale | 200 | 6–6,5 | 1,48 | 0,32–1,70 | [P-LK200] |
| LK250 | bidirezionale | 250 | 6–8 | 1,74 | 0,32–2,00 | [P-LK250] |
| LK300 | bidirezionale | 300 | 6–8 | 2,93 | 0,40–3,37 | [P-LK300] |
| LK315 | bidirezionale | 315 | 8–10 | 2,81 | 0,40–3,24 | [P-LK315] |
| R1 / R1LR | R1 mono; R1LR vedi nota | 300 | 6–8 | 2,23 | 0,41–2,57 | [P-R1] |
| R1 200 | bidirezionale (da titolo pagina) | 200 | 6–6,5 | 1,83 | 0,30–2,11 | [P-R1] |
| R1 250 | bidirezionale (da titolo pagina) | 250 | 6–8 | 1,96 | 0,31–2,25 | [P-R1] |
| R3 | monodirezionale | 250 | 6–8 | 1,24 | 0,48–1,43 | [P-R3] |
| R5 / R5R / R5SP / R5S | monodirezionale | 200 | 6–6,5 | 1,55 | 0,24–1,78 | [P-R5] |
| R6 / R6R / R6SP | monodirezionale | 300 | 6–8 | 2,09 | 0,44–2,40 | [P-R6] |
| R10BF | monodirezionale, a bloccaggio fune | 315 | 8–10 | 2,35 | 0,50–2,70 | [P-R10] |
| R12BF | monodirezionale, a bloccaggio fune | 345 | 8–10 | 4,00 | 1,00–5,06 | [P-R12] |
| LXM120 (limitatore + tenditore a molla) | bidirezionale | 120 | 6–6,5 | 1,74 | 0,20–2,00 | [P-LXM120] |
| R1 300 | bidirezionale (da titolo pagina) | non trovato | non trovato | non trovato | non trovato | [P-R1] solo nome |

Note: il diametro è quello dichiarato «Pulley Ø»; PFB non dice nell'estratto se è primitivo (asse fune) o esterno → **diametro primitivo: non trovato**. LK120: velocità identiche a LX120 nell'estratto (possibile confusione, da verificare). LK120 e LX180: fune 4 mm «standard», 6–6,5 / 6,5 mm «in deroga» (testuale). R1/R1LR: il titolo dice «R1 monodirectional, R1LR, R1 200, R1 250, R1 300 bidirectional»; l'estratto dice «R1 e R1LR Ø300, mono o bidirezionali» → senso per variante da confermare.

### 1b. Costruttivi, montaggio, dimensioni

| Modello | Sgancio a distanza (bobina) | Ripristino a distanza | Contatto elettrico | Montaggio | L × P × H [mm] | Base / fori | Altezza asse [mm] | Massa [kg] | Forza di tensionamento fune | Opzioni / note | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LX120 | non trovato | non trovato | non trovato | non trovato | H 178 (solo altezza: «profile of only 178 mm height») | non trovato | non trovato | non trovato | non trovato | «the smallest overspeed governor for lifts ever» (news PFB 343371) | [P-LX120] |
| LK120 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | ascensori, homelift, impianti automatici; TÜV SÜD, 2014/33/UE, EN 81-20/50 | [P-LK120] |
| LX150 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | gola temprata | [P-LX150] |
| LX180 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | gola temprata | [P-LX180] |
| LX200 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | gola temprata | [P-LX200] |
| LK200 | opzione «remote control» (tensione: vedi 1c) | non trovato | non trovato (modello base) | non trovato | H 370; base 220 × **165 o 200** (estratti in conflitto) | fori: non trovato | non trovato | 12 | non trovato | rope safety guard, protection cover, encoder, dispositivo UCM, anti-creeping; −20/+80 °C [EQ-LK200]; TÜV SÜD, 2014/33/UE, EN 81-20/50 | [P-LK200] [EQ-LK200] |
| LK250 | sì su art. rivenditore («remote tripping device») | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | TÜV SÜD, 2014/33/UE, EN 81-20/50 | [P-LK250] [ES-6790328] |
| LK300 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | TÜV SÜD, 2014/33/UE, EN 81-20/50 | [P-LK300] |
| LK315 | opzione «remote switch» | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | test groove, rope safety guard, cover, encoder, UCM, anticreeping; EN 81-20/50, 2014/33/UE, Gost TP TC 011/2011 | [P-LK315] |
| R1 / R1LR | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | test groove, rope safety guard, cover; EN 81-20/50, 2014/33/UE, Gost | [P-R1] |
| R1 200 · R1 250 · R1 300 | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | — | [P-R1] |
| R3 | opzione «remote control» | non trovato | non trovato | non trovato | non trovato | opzioni «small size base» o «rope's protection base»; fori: non trovato | non trovato | non trovato | non trovato | rope safety guard, cover | [P-R3] |
| R5 / R5R / R5SP / R5S | opzione «remote control» (anche montato sopra, dentro la struttura) | non trovato | non trovato | «version to hang up» (da appendere); altre: non trovato | non trovato | opzioni «small size base» o «rope protection base»; fori: non trovato | non trovato | non trovato | non trovato | «reduced version»; rope safety guard, cover; le opzioni non sono attribuite alle singole sigle | [P-R5] |
| R6 / R6R / R6SP | opzione «remote control» | non trovato | non trovato | non trovato | non trovato | opzioni «small size base» o «rope's protection base»; fori: non trovato | non trovato | non trovato | non trovato | rope safety guard, cover | [P-R6] |
| R10BF | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | a bloccaggio fune; cover e rope guard di serie | [P-R10] |
| R12BF | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | a bloccaggio fune; cover e rope guard di serie | [P-R12] |
| LXM120 (limitatore + tenditore a molla) | non trovato | non trovato | automatico IP67 per fune allentata | in fossa, a pavimento o alla guida | non trovato | non trovato | non trovato | non trovato | non trovato | tenditore a molla integrato | [P-LXM120] |
| LKT120 (LK120 + tenditore) | non trovato | non trovato | non trovato | in fossa (fossa ridotta) | non trovato | non trovato | non trovato | non trovato | non trovato | LK120 e tenditore nella stessa struttura | [P-LKT120] |

Montaggio in sala macchine / in testata senza locale / sulla guida / sulla cabina: per i singoli modelli PFB **non trovato**, salvo R5 (versione «da appendere»), LXM120 e LKT120 (in fossa).

### 1c. Varianti e tarature da rivenditori (quote A/B/C come pubblicate, significato non indicato dalla fonte)

| Variante | A [mm] | B [mm] | C [mm] | Massa [kg] | Taratura | Sgancio / contatti | Fonte |
|---|---:|---:|---:|---:|---|---|---|
| LK200 con test groove, art. 6790115 | 240 | 220 | 375 | 16,2 | Ts 1,3 m/s | sgancio a distanza 230 V AC | [ES-6790115] |
| LK200 «LSP24V», art. 6790226 | 255 | 170 | 370 | non trovato | Ts 1,4 m/s | «safety switch» + «descent stopping sys.»; «LSP24V» non spiegato | [ES-6790226] |
| LK200 (Elvacenter) | — | — | — | — | Vn 1,02÷1,12 → Vint 1,40 m/s | «+ remote 230V» | [ELVA] |
| LK250, art. 6790328 | — | — | — | — | Ts 0,78 m/s | «remote tripping device» | [ES-6790328] |
| «LK250 250mm bidirectional» (marca non nel titolo) | — | — | — | — | Vn 1,25 → Vi 1,6 m/s | — | [FCEU] |
| Manuale LK (attribuzione incerta) | — | — | — | — | Vn 0,55–0,60 → 0,75; Vn 0,60–0,66 → 0,82 m/s | — | [PFB-5801] |

Un estratto non attribuibile a una pagina precisa cita anche «14,98 kg» per un LK200 con contatto di sicurezza: **non usato**.

## 2. Montanari Giulio & C. — limitatori di velocità

| Modello | Puleggia Ø | Fune Ø | Vn | Vint | Direzione | Sgancio / ripristino a distanza | Contatto | Montaggio | L × P × H | Base / fori | Altezza asse | Massa | Forza fune | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (tutti) | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | — |

Motivo: `montanarigiulio.com` bloccato dall'egress e budget di ricerche esaurito prima di qualsiasi ricerca Montanari. **Indizio NON verificato** (note di un giro precedente di questa sessione, file scratchpad `research-round3.md`, senza URL esatto): famiglia «RQ» (RQ200, RQ-A), documento «MANUALE_RQ-RQA» su montanarigiulio.com; per RQ200 «A=220, øD=210, øP=150»; RQ-A interasse base 170 (stretta 132); funi 6 / 6,5 / 8 mm. Significato delle quote non noto: **da non usare** finché non si apre il manuale.

## 3. Tenditori (pulegge di rinvio in fossa)

### 3a. PFB

| Modello | Tipo | Pulegge Ø [mm] | Contrappeso (ghisa) [kg] | Fissaggio | Contatto fune lenta | L × P × H [mm] | Massa gruppo [kg] | Note | Fonte |
|---|---|---|---|---|---|---|---|---|---|
| R4K | orizzontale a leva 'all-in-one' | 150 / 180 / 200 / 250 / 300 / 315 | 5 / 10 / 13 / 22 | alla guida ('guide rail fixation') | contatto modulare dentro o fuori la struttura, totalmente reversibile | non trovato | non trovato | rope safety guard e protection cover a richiesta | [P-R4K] |
| R4X | orizzontale | 120 / 150 / 180 / 200 / 250 / 300 / 315 | 10 / 30 / 40 | alla guida ('guide rail fixation') | non trovato | non trovato | non trovato | — | [P-R4X] |
| R4T | verticale 'extremely slim', in fossa | 120 / 150 / 180 / 200 / 250 / 300 / 315 | 30–60 | a pavimento o alla guida | non trovato | non trovato | non trovato | — | [P-R4T] |
| R4V | verticale | 120 / 150 / 180 / 200 / 250 / 300 / 315 | 30 / 60 / 104 | a pavimento ('floor fixation') | non trovato | non trovato | non trovato | — | [P-R4V] |
| R4VS | verticale extra sottile e compatto | 120 / 150 / 180 / 200 | 30 / 60 | a pavimento o alla guida | non trovato | non trovato | non trovato | con cover e rope safety guard | [P-R4VS] |
| R4R | verticale | 200 / 260 / 300 / 315 | 22 / 30 / 44 | non trovato | non trovato | non trovato | non trovato | '260' come da estratto (possibile refuso per 250: NON corretto, da verificare); usi: ascensori, montacarichi, impianti automatici, trasloelevatori | [P-R4R] |
| R4M | a molla ('extra small dimensions') | 120 / 150 / 180 / 200 | nessun contrappeso (molla) | a pavimento, alla guida o entrambi | non trovato | non trovato | non trovato | velocità di intervento fino a 2,00 m/s; con LK200 solo intervento in discesa (tabella LK200) | [P-R4M] |
| R4MC | a molla, ultra compatto | 120 / 150 / 180 / 200 / 250 / 300 | nessun contrappeso (molla) | a pavimento, alla guida o entrambi | non trovato | non trovato | non trovato | velocità di intervento fino a 2,00 m/s | [P-R4MC] |
| «R4KE» per LK200, due sensi (art. 6790127) | (rivenditore) | non trovato | non trovato | non trovato | non trovato | A 700 · B 330 · C 113 | 26,52 | sigla del rivenditore: corrispondenza con R4K non confermata | [ES-6790127] |
| «R4KE» d=300 (art. 6790134) | (rivenditore) | 300 | «13kg» nel titolo (contrappeso o gruppo: non indicato) | non trovato | non trovato | non trovato | non trovato | solo titolo | [ES-6790134] |

Regola PFB: Ø puleggia del tenditore = Ø puleggia del limitatore; il contrappeso dipende dal limitatore abbinato; nessun contrappeso con tenditore a molla; contatto di sicurezza che apre se la fune si allenta [P-NEWSTENS]. Morsetti di fissaggio alla guida (numero, filettatura), forza di tensionamento risultante: **non trovato**.

### 3b. PFB — contrappeso richiesto per abbinamento (tabelle «tenditori combinabili» delle pagine limitatore)

| Tenditore | LK200 ↓ / ↓↑ [kg] | LK250 ↓ / ↓↑ [kg] | LK300 ↓ / ↓↑ [kg] | LK315 ↓ / ↓↑ [kg] |
|---|---|---|---|---|
| R4K | 13 / 22 | 13 / 22 | citato senza valori / non trovato | 13 / 22 |
| R4X | 30 / 40 | 30 / 40 | 30 / 40 | 30 / 40 |
| R4R | 30 / 44 | 30 / 44 | citato senza valori / non trovato | 30 / 44 |
| R4V | 60 / 104 | 60 / 104 | 60 / 104 | 60 / 104 |
| R4VS | 60 / non trovato | non elencato nell'estratto | non elencato nell'estratto | non elencato nell'estratto |
| R4T | non elencato nell'estratto | 60 (senso non indicato) / non trovato | 60 / non trovato | 60 / non trovato |
| R4M | molla (tabella: 'Down tripping only') / non trovato | non elencato nell'estratto | non elencato nell'estratto | non elencato nell'estratto |
| R4MC | molla (senso non indicato) / non trovato | non elencato nell'estratto | non elencato nell'estratto | non elencato nell'estratto |

Fonti: [P-LK200] [P-LK250] [P-LK300] [P-LK315]. Per LK315 l'estratto riporta R4K 13/22 kg come per LK200 (da verificare). Per gli altri limitatori (LX, R, LK120) le tabelle di abbinamento: **non trovato**.

### 3c. Montanari Giulio & C. — tenditori

Tipo, pulegge, contrappesi, ingombri, fissaggio, contatto: **non trovato** (stesso motivo di §2).

## 4. Verifica delle ipotesi attuali di Argano

| Ipotesi attuale | Esito | Dato trovato |
|---|---|---|
| PFB LK200: puleggia Ø200 | **confermato** | Ø 200, gola temprata [P-LK200] |
| LK200: fune 6 mm | **da precisare** | fune 6–6,5 mm [P-LK200] |
| LK200: fino a 1,48 m/s | **confermato** (pagina prodotto) | Vn ≤ 1,48; Vint 0,32–1,70 [P-LK200]; un riassunto riporta 1,77 / 0,28–2,04 (conflitto, non usato) |
| LK200: ingombro ~370 mm | **confermato** | H 370 [EQ-LK200]; C 370 [ES-6790226]; variante con sgancio 230 V: C 375 [ES-6790115] |
| LK200: base 165 × 220 | **non confermato** | 220 confermato da due estratti; l'altro lato 165 in un estratto, 200 in un altro [EQ-LK200]; fori: non trovato |
| Oltre 1,48 m/s → Ø300 con fune 8 | **da correggere** | PFB copre di più anche con pulegge piccole: LX200 Ø200 fune 6–6,5 fino a 2,30; LX150 Ø150 fino a 2,34; LX120 Ø120 fino a 2,00; R1 200 Ø200 fino a 1,83; LK250 Ø250 fune 6–8 fino a 1,74; LK300 Ø300 per fune **6–8** (non solo 8) fino a 2,93; fune 8–10 solo LK315 (Ø315, ≤2,81), R10BF (Ø315, ≤2,35), R12BF (Ø345, ≤4,00) [pagine §1a] |
| PFB R4K a leva 22 kg | **confermato per LK200/LK250 ↓↑** | 22 kg ↓↑, 13 kg solo ↓ [P-LK200] [P-LK250]; contrappesi R4K 5/10/13/22; pulegge 150–315; fissaggio alla guida [P-R4K]; «R4KE per LK200 due sensi» 700 × 330 × 113, 26,52 kg [ES-6790127] |
| PFB R4T verticale 30 kg | **da correggere** | R4T ha contrappesi 30–60 kg [P-R4T], ma nelle tabelle compare con **60 kg** (solo ↓) per LK300/LK315 e 60 kg per LK250; per LK200 non compare nell'estratto. Verticali indicati per LK200: R4R 30 ↓ / **44 ↓↑**, R4V 60 / 104, R4VS 60 ↓ [P-LK200] |

## 5. Lacune e conflitti

**Non trovato (PFB, tutti i limitatori salvo dove indicato in §1b):** diametro primitivo; ripristino a distanza; tensione della bobina di sgancio (salvo 230 V AC su due articoli LK200 di rivenditori); tipo/codice del contatto elettrico; posizioni di montaggio ammesse; L × P × H completi; impronta della base e fori di fissaggio; altezza dell'asse puleggia; massa (salvo LK200 12 kg e la variante 16,2 kg); forza di tensionamento della fune richiesta/generata; modelli fuori produzione diffusi in Italia; certificati di esame UE del tipo (TÜV SÜD citato, numeri e contenuti non letti).

**Non trovato (tenditori PFB):** ingombri e masse dei gruppi (salvo «R4KE» del rivenditore), morsetti alla guida, dettagli del contatto fune lenta (salvo R4K «contatto modulare» e LXM120 IP67), abbinamenti per LX/R/LK120.

**Non trovato (Montanari Giulio & C.):** tutto (limitatori e tenditori).

**Conflitti da risolvere sulla fonte:**

- LK200 Vn 1,48 / Vint 0,32–1,70 (pagina prodotto) contro 1,77 / 0,28–2,04 (un riassunto) — forse estensione di certificato, non verificabile.
- LK200 larghezza base 165 contro 200 (due estratti di elevatorequipment.co.uk).
- R1 fune 6–8 (pagina R1) contro 8–10 (un riassunto).
- LK120 con le stesse velocità di LX120; R4R puleggia «260» (forse 250); R4K con LK315 = valori LK200.
- Quote A/B/C di elevatorshop.de senza definizione; «R4KE» (rivenditore) contro «R4K» (PFB); «LSP24V» non spiegato.

## 6. Problemi di accesso

- Policy di rete dell'ambiente. WebFetch → `EGRESS_BLOCKED`: www.pfb.it, download.pfb.it, www.montanarigiulio.com, www.donati.it, www.elevatorequipment.co.uk. `curl` → «CONNECT tunnel failed, response 403»: pfb.it, www.pfb.it, www.montanarigiulio.com; `curl` senza connessione (codice 000) anche per www.elevatorshop.de, www.lift-store.it, www.fceu.eu, web.archive.org. Rimedio: aggiungere questi domini (o un livello di accesso più ampio) nelle impostazioni *Network access* dell'ambiente.
- Budget WebSearch della sessione esaurito (200/200) dopo le prime ricerche PFB: niente Montanari, niente lift-store.it, niente certificati. Rimedio: alzare `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`.
- Da aprire appena possibile: download.pfb.it/manuali-uso; download.pfb.it/api/pdf/5801 (manuale LK200–LK315); manuali PFB ospitati da elevatorequipment.co.uk (LK200, R1-LR, R5 & R6); pagina PFB news 338457 (contatti di sicurezza); manuale Montanari «MANUALE_RQ-RQA»; pagine catalogo Montanari limitatori/tenditori; lift-store.it.

## 7. Fonti (consultate il 2026-10-01 tramite estratto del motore di ricerca)

- **[P-LK200]** PFB — pagina prodotto 'Bidirectional Overspeed Governor LK200 for lifts' (pfb.it, EN; edizione/anno non indicati) — https://pfb.it/en/product/3264/overspeed-governors/lk-200-bidirectional
- **[P-LK250]** PFB — pagina prodotto 'Bidirectional Overspeed Governor LK250' (pfb.it, EN) — https://pfb.it/en/product/3265/overspeed-governors/lk-250-bidirectional
- **[P-LK300]** PFB — pagina prodotto 'Bidirectional Overspeed Governor for lifts LK300' (pfb.it, EN) — https://pfb.it/en/product/3266/overspeed-governors/lk-300-bidirectional
- **[P-LK315]** PFB — pagina prodotto 'Bidirectional Overspeed Governor for lifts LK315' (pfb.it, EN) — https://pfb.it/en/product/3267/overspeed-governors/lk-315-bidirectional
- **[P-LK120]** PFB — pagina prodotto 'Bidirectional Overspeed Governor LK120' (pfb.it, EN) — https://pfb.it/en/product/3263/overspeed-governors/lk-120-bidirectional
- **[P-LKT120]** PFB — pagina prodotto 'Governor and Tension Weight for reduced pit lifts LKT120' (pfb.it, EN) — https://pfb.it/en/product/4891/overspeed-governors/lkt120-bidirectional
- **[P-LX120]** PFB — pagina prodotto 'Bidirectional overspeed governor for lifts LX120' (pfb.it, EN) + news 343371 'LX120: the smallest overspeed governor for lifts ever' — https://pfb.it/en/product/343313/overspeed-governors/bidirectional-overspeed-governor-lifts-lx120
- **[P-LXM120]** PFB — pagina prodotto 'All-in-one Overspeed Governor and Tensioner LX120 for Elevators' (LXM120) (pfb.it, EN) — https://pfb.it/en/product/348271/overspeed-governors/lxm120-overspeed-governor-spring-tensioner-allinone-elevators
- **[P-LX150]** PFB — pagina prodotto 'Bidirectional Overspeed Governor LX150' (pfb.it, EN) — https://pfb.it/en/product/4056/overspeed-governors/lx150-bidirectional
- **[P-LX180]** PFB — pagina prodotto 'Overspeed Governor LX180 for lifts' (pfb.it, EN) — https://pfb.it/en/product/4055/overspeed-governors/lx180-bidirectional
- **[P-LX200]** PFB — pagina prodotto 'Overspeed Governor LX200 for lifts' (pfb.it, EN) + news 335556 — https://pfb.it/en/product/335278/overspeed-governors/lx200-bidirectional
- **[P-R1]** PFB — pagina prodotto 'Monodirectional and bidirectional Overspeed Governor R1' (R1, R1LR, R1 200, R1 250, R1 300) (pfb.it, EN) — https://pfb.it/en/product/3219/overspeed-governors/r1-monodirectional-r1lr-r1-200-r1-250-r1-300-bidirectional
- **[P-R3]** PFB — pagina prodotto 'Monodirectional Overspeed Governor R3' (pfb.it, EN) — https://pfb.it/en/product/3259/overspeed-governors/r3-monodirectional
- **[P-R5]** PFB — pagina prodotto 'Monodirectional Overspeed Governor R5' (R5, R5R, R5SP, R5S) (pfb.it, EN) — https://pfb.it/en/product/3260/overspeed-governors/r5-r5r-r5sp-r5s-monodirectional
- **[P-R6]** PFB — pagina prodotto 'Monodirectional Overspeed Governor R6' (R6, R6R, R6SP) (pfb.it, EN) — https://pfb.it/en/product/3262/overspeed-governors/r6-r6r-r6sp-monodirectional
- **[P-R10]** PFB — pagina prodotto 'Monodirectional rope clamping Overspeed Governor R10' (R10BF) (pfb.it, EN) — https://pfb.it/en/product/3268/overspeed-governors/r10bf-rope-clamping
- **[P-R12]** PFB — pagina prodotto 'Monodirectional rope clamping Overspeed Governor R12' (R12BF) (pfb.it, EN) — https://pfb.it/en/product/3269/overspeed-governors/r12bf-rope-clamping
- **[P-NEWSGOV]** PFB — articolo 'How does the overspeed governor for lifts work?' (pfb.it, news 325627) — https://pfb.it/en/news/325627/how-does-the-overspeed-governor-work-lift
- **[P-R4K]** PFB — pagina prodotto 'R4K Horizontal Tension Weight all-in-one' (pfb.it, EN) — https://pfb.it/en/product/3301/tension-weights/r4k-horizontal
- **[P-R4X]** PFB — pagina prodotto 'Horizontal tension weight R4X' (pfb.it, EN) — https://pfb.it/en/product/325375/tension-weights/r4x-horizontal
- **[P-R4T]** PFB — pagina prodotto 'Vertical tension weight for lifts R4T' (pfb.it, EN; anche /it/prodotto/321543/tenditori/r4t-verticale) — https://pfb.it/en/product/321543/tension-weights/r4t-verticale
- **[P-R4V]** PFB — pagina prodotto 'Vertical tension weight for lifts R4V' (pfb.it, EN; anche /it/prodotto/325384/tenditori/r4v-verticale) — https://pfb.it/en/product/325384/tension-weights/r4v-vertical
- **[P-R4VS]** PFB — pagina prodotto 'Vertical tension weight R4VS' (pfb.it, EN) — https://pfb.it/en/product/324657/tension-weights/r4vs-vertical
- **[P-R4R]** PFB — pagina prodotto 'Vertical Tension Weight for lifts R4R' (pfb.it, EN; anche /it/prodotto/4118/tenditori/r4r-verticale) — https://pfb.it/en/product/4118/tension-weights/r4r-vertical
- **[P-R4M]** PFB — pagina prodotto 'Spring tensioner R4M for lifts' (pfb.it, EN) — https://pfb.it/en/product/335308/tension-weights/r4m-tensioner-with-spring-lifts
- **[P-R4MC]** PFB — pagina prodotto 'Compact spring tensioner R4MC for lifts' (pfb.it, EN) — https://www.pfb.it/en/product/348151/tension-weights/r4mc-compact-tensioner-with-spring-lifts
- **[P-NEWSTENS]** PFB — articolo 'Lift tensioner: what it is, how it works and how to choose the right one' (pfb.it, news 326060; IT: /it/news/326060/tenditore-ascensori-come-funziona) — https://pfb.it/en/news/326060/lift-tensioner-what-it-is-how-it-works
- **[EQ-LK200]** Elevator Equipment Ltd (UK, rivenditore) — pagine LK200: manuale PFB 'MANUALE D'USO E MANUTENZIONE / INSTRUCTIONS, USE AND MAINTENANCE MANUAL', 'AGGIORNAMENTO 01/07/2021' e/o scheda https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk200-bidirectional-overspeed-governor-200mm-pulley (pagina esatta non determinabile) — https://www.elevatorequipment.co.uk/files/ww/LK200%20Overspeed%20Governor%20Manual.pdf
- **[ES-6790115]** Hauer elevatorshop.de (rivenditore) — 'Overspeed governor LK200 w. test groove, remote tripping 230V AC, Ts=1,3m/s', art. 6790115 — https://www.elevatorshop.de/en/overspeed-governor-lk200-w.-test-groove-remote-tripping-230v-ac-ts-1-3m-s-6790115.html
- **[ES-6790226]** Hauer elevatorshop.de (rivenditore) — 'PFB, governor LK200 LSP24V, Ts=1.4m/s, w. safety switch a. descent stopping sys.', art. 6790226 — https://www.elevatorshop.de/en/pfb-governor-lk200-lsp24v-ts-1.4m-s-w.-safety-switch-a.-descent-stopping-sys.-6790226.html
- **[ES-6790127]** Hauer elevatorshop.de (rivenditore) — 'Tension weight type R4KE for LK200, triggering in both directions', art. 6790127 — https://www.elevatorshop.de/en/tension-weight-type-r4ke-for-lk200-triggering-in-both-directions-6790127.html
- **[ES-6790134]** Hauer elevatorshop.de (rivenditore) — titolo 'Tension weight type R4KE, d=300, 13kg', art. 6790134 (solo titolo) — https://www.elevatorshop.de/en/tension-weight-type-r4ke-d-300-13kg-6790134.html
- **[ES-6790328]** Hauer elevatorshop.de (rivenditore) — titolo 'PFB, overspeed governor LK250, remote tripping device, Ts=0.78m/s', art. 6790328 (solo titolo) — https://www.elevatorshop.de/en/pfb-overspeed-governor-lk250-remote-tripping-device-ts-0.78m-s-6790328.html
- **[ELVA]** Elvacenter shop (rivenditore) — titolo 'PFB, Speed governor: LK200 - Ø 200 mm rated 1.02÷1.12 m/s trip 1.40 m/s - + remote 230V' (solo titolo) — https://shop.elvacenter.com/shop/speed-governors/overspeed-governor/pfb-speed-governor-lk200-o-200-mm-rated-1-02%C3%B71-12-m-s-trip-1-40-m-s-remote-230v/
- **[FCEU]** fceu.eu (rivenditore) — titolo 'overspeed governor lk250 250mm bidirectional vn 1,25 m/s vi 1,6 m/s', cod. 02260037 (solo titolo; marca non indicata nel titolo) — https://www.fceu.eu/overspeed-governor-lk250-250mm-bidirectional-vn-1-25-m-s-vi-1-6-m-s-02260037
- **[PFB-5801]** PFB — manuale limitatori LK200-LK250-LK300-LK315 (download.pfb.it, PDF 5801; edizione non letta) — ATTRIBUZIONE INCERTA: l'estratto mescolava anche donati.it/en/catalogo-prodotti/overspeed-governors-tension-weights-safety-gears/overspeed-governor-lk-0 — https://download.pfb.it/api/pdf/5801
