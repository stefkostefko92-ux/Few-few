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

> **Aggiornamento (secondo giro):** gamma RQ-A, NOR, RC e RG-RH dal sito del costruttore nel § 8.

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

> **Aggiornamento (secondo giro):** TEV200, TEV250, TEV300 (e versioni BD) e TEL20 nel § 8.

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

## 8. Secondo giro: limitatori e tenditori Montanari e PFB (1° ottobre 2026)

> Secondo giro di ricerca, fatto lo stesso giorno con il solo motore di ricerca (i siti dei costruttori restano
> bloccati da questo ambiente). Le sigle di evidenza sono spiegate qui sotto; ogni valore va riscontrato sul
> documento del costruttore prima di usarlo.

Raccolta del **1° ottobre 2026** per Argano (limitatore in sala macchine, fune in pianta, tenditore in fossa, 3D).

> **Affidabilità: leggere prima.** I siti dei costruttori e dei rivenditori non sono apribili da questo ambiente (policy di rete). Ogni valore qui sotto è l'**estratto o riassunto del motore di ricerca** (WebSearch) relativo all'URL indicato. Nessuna pagina è stata aperta, quindi nessun valore è stato letto da un disegno e la pagina del PDF non è indicabile. Dove l'estratto non permette di attribuire il dato a un URL preciso c'è il segno ⚠️. **Nessun numero è stato dedotto, convertito o stimato.** Prima della produzione ogni valore va riscontrato sulla fonte.

**Legenda delle prove:** **E** = pagina o documento del costruttore · **R** = rivenditore · **D** = copia di documento ospitata da terzi · **T** = solo titolo/URL · ⚠️ = ambiguo o in conflitto (motivo nel testo). «giro prec.» = dato di un giro precedente (file `13-limitatori-e-tenditori.md`), riportato per contesto e non ricercato di nuovo. Codici fonte tra parentesi quadre → §7.

Unità: mm, m/s, kg. Vn = velocità nominale; Vint = velocità di intervento.

---

### 1. Montanari Giulio & C.: limitatori di velocità

Gamma trovata su montanarigiulio.com: **RQ-A** (200/250/300; manuale comune «RQ & RQ-A 200-250-300»), **NOR**, **RC** (centrifugo), **RG-RH** (gamma meno recente). Elenco completo del catalogo: non verificato.

#### 1a. Prestazioni e configurazione

| Modello | Puleggia Ø | Funi Ø | Vn | Vint | Direzione | Azionamento | Sgancio / ripristino a distanza | Posa | Fonti |
|---|---|---|---|---|---|---|---|---|---|
| **RQ-A 200** | 200 (E) | 6–6,5 (E) | gamma della famiglia 0,15–3,0 (E); per taglia: non trovato | non trovato (vedi 1c) | mono o bidirezionale (E) | istantaneo o progressivo (E) | bobina/elettromagnete integrato, alimentabile solo per pochi secondi (E); schema per il ripristino a distanza del contatto (E) | con o senza locale macchine; in piano o capovolto nelle versioni dedicate (E) | [M-RQA] [M-RQA-EN] [M-MAN-ENG21/25] |
| **RQ-A 250** | 250 (E) | famiglia 6 – 6,5 – 8 (E ⚠️ non attribuite per taglia) | famiglia 0,15–3,0 (E) | non trovato (rivenditore: vedi 1c) | mono o bi (E) | istantaneo o progressivo (E) | come RQ-A 200 (dato di famiglia, E) | come RQ-A 200 (E) | [M-RQA] [M-MAN-ITA] |
| **RQ-A 300** | 300 (E) | famiglia 6 – 6,5 – 8 (E ⚠️) | famiglia 0,15–3,0 (E) | non trovato | mono o bi (E) | istantaneo o progressivo (E) | come RQ-A 200 (dato di famiglia, E) | come RQ-A 200 (E) | [M-RQA] [M-MAN-ITA] |
| **NOR** | 300, con gola di prova (E) | 6 – 8 (E ⚠️ intervallo o due valori?) | 0,30–1,50 (E) | non trovato | mono o bidirezionale (E) | arpione (E) | non trovato | capovolta: sì (E); paracadute cabina o contrappeso (E) | [M-NOR] [M-NOR-EN] |
| **RC** (centrifugo) | 200 – 300 (E ⚠️ due taglie o intervallo?) | 6 – 6,5 – 8 (E) | 1,60–4,2 (E) | non trovato | mono o bidirezionale (E) | istantaneo o progressivo; contatto elettrico gestito separatamente (E) | non trovato | capovolta: sì (E); fune e idraulico; cabina o contrappeso (E) | [M-RC] [M-RC-EN] |
| **RG 200** (gamma RG-RH) | 200 (E) | 6–6,5 (E) | 0,15–0,30 (E) | non trovato | mono o bidirezionale (E) | non trovato | non trovato | verticalità con bolla o filo a piombo; fune parallela alla gola, pendenza max consigliata ±0,50° (E) | [M-RGRH] [M-MAN-NORRG] |
| **RG-RH Ø300** (sigla non indicata) | 300 (E) | non trovato | non trovato | non trovato | mono o bi (gamma, E) | non trovato | non trovato | non trovato | [M-RGRH] |

Note: RQ-A: le funi 6 – 6,5 – 8 sono date per l'intera gamma (e la query conteneva quei numeri: possibile eco ⚠️); una fune per taglia è confermata solo per la 200 (6–6,5). RQ-A può avere il sistema anti-deriva per i movimenti incontrollati della cabina (UCM) secondo EN 81-20/50 (E). La sigla «A3» compare solo in un riassunto non attribuito ⚠️. RG-RH è omologato TÜV secondo la **95/16/CE** (vecchia direttiva) (E). È quindi probabilmente un prodotto non più a catalogo, ma non è confermato.

#### 1b. Ingombri, base e massa

| Modello | Quote del manuale A / øD / øP ⚠️ | L × P × H | Base | Fori di fissaggio | Altezza asse | Massa | Fonti |
|---|---|---|---|---|---|---|---|
| **RQ-A 200** | 220 / 210 / 150 (E) | H **300** solo per la **versione ribassata** (E); versione standard: non trovato | stretta o standard (E) | non trovato. Indizio di un giro precedente «170, stretta 132»: **non confermato** ⚠️ | non trovato | non trovato | [M-MAN-ITA] [M-MAN-ENG21] [M-RQA] |
| **RQ-A 250** | 270 / 260 / 185 (E) | non trovato | stretta o standard (E); «brede basis» (base larga) negli articoli RQ250 (T) | non trovato | non trovato | non trovato | [M-MAN-ITA] [ELVA-RQ250-*] |
| **RQ-A 300** | 320 / 310 / 225 (E) | non trovato | stretta o standard (E) | non trovato | non trovato | non trovato | [M-MAN-ITA] |
| **NOR** | — | non trovato | standard (E) | **219** (E): IT «interasse fori di fissaggio», EN «bolt holes pitch circle» ⚠️ | non trovato | non trovato | [M-NOR] [M-NOR-EN] |
| **RC** | — | non trovato | stretta (E); la gamma prevede stretta o standard (E) | **132** (E), con la stessa ambiguità IT/EN ⚠️ | non trovato | non trovato | [M-RC] [M-RC-EN] |
| **RG 200 / RG-RH** | — | non trovato | con o senza gola di prova (E) | non trovato | non trovato | non trovato | [M-RGRH] |

Le lettere A, øD e øP del manuale RQ & RQ-A **non sono definite nell'estratto**. Sono riportate tali e quali e non vanno messe su L/P/H finché non si legge il disegno. Il manuale indica inoltre (E): piano di posa uniforme e orizzontale, tolleranza di livellamento 0,2 mm, usare tutti i punti di fissaggio, e se il limitatore è capovolto il fissaggio deve reggere la forza d'intervento [M-MAN-ENG21].

#### 1c. Articoli di rivenditori e tarature

| Articolo | Dati | Prova | URL |
|---|---|---|---|
| fceu.eu 01200052, titolo «osg rq200 200mm for rope 6 6 5mm nom speed 1 0m s» | RQ200 (senza «-A»), Ø200, fune 6–6,5, Vn 1,0 | T | [FCEU-RQ200] |
| elvacenter, «montanari rq250 vnom 0 63 m sec vint 0 82 m sec bi direction brede basis» | RQ250, Vn 0,63, Vint 0,82, bidirezionale, base larga | T | [ELVA-RQ250-BI] |
| elvacenter, «… links brede basis» | RQ250, Vn 0,63, Vint 0,82, «links» (sinistro), base larga | T | [ELVA-RQ250-L] |
| riassunto non attribuibile (ricerca in russo) | «RQ-A 200: Vn 1,00, Vint 1,37 m/s» | ⚠️ senza URL, non usato | — |
| riassunto non attribuibile (prima ricerca) | RQ-A 200: «orario/antiorario», «limitatore appeso», «per sala macchine e vano» | ⚠️ senza URL, non usato | — |

---

### 2. Montanari Giulio & C.: tenditori

| Modello | Tipo | Senso | Puleggia Ø | «Weight/Peso» pubblicato ⚠️ | Contatto | Fissaggio | Ingombri | Massa gruppo | Fonti |
|---|---|---|---|---|---|---|---|---|---|
| **TEV200** | verticale (E) | mono (E) | 200 (R ⚠️ solo riassunto Donati) | 29 kg (E) | ripristino manuale o automatico (E) | a pavimento (E) | «ridotti», nessun numero (E) | non trovato | [M-TEV200] [DON-CAT] |
| **TEV200BD** | verticale (E) | bi (E) | non trovato | 85 kg (E) | ripristino manuale o automatico (E) | non trovato | non trovato | non trovato | [M-TEV200BD] |
| **TEV250** | verticale (E) | mono (E) | 250 (R ⚠️ solo riassunto Donati) | 30 kg (E) | ripristino manuale o automatico (E) | non trovato | non trovato | non trovato | [M-TEV250] [DON-CAT] |
| **TEV250BD** | verticale (E) | bi (E) | non trovato | 85 kg (E) | ripristino manuale o automatico (E) | a pavimento (E) | «ridotti» (E) | non trovato | [M-TEV250BD] |
| **TEV300** | verticale (E) | mono (E) | 300 (R) | 30 kg (E); «30kg» nel titolo Donati (R) | ripristino manuale o automatico (E) | a pavimento (E) | «ridotti» (E) | non trovato | [M-TEV300] [DON-TEV300] |
| **TEV300BD** | ⚠️ esistenza solo da riassunto | bi | non trovato | non trovato | non trovato | non trovato | non trovato | non trovato | [M-CAT-TENS] (T) |
| **TEL20** | non indicato; «tension device for pit speed governor» (E) | per RQ-A200 bidirezionale (E) | non trovato | 65 kg (E); «Weights: 4» = numero di pesi (E) | reset automatico/manuale (E) | non trovato | non trovato | non trovato | [M-TEL20] |
| **Orizzontale Ø200** (TE00000820+AC00000553) | orizzontale (R) | mono (R) | 200 (R) | «223N» (R ⚠️) | non trovato | non trovato | non trovato | non trovato | [DON-M] ⚠️ |
| **Orizzontale Ø250** (TE00000825+AC00000553) | orizzontale (R) | mono (R) | 250 (R) | «223N» (R ⚠️) | non trovato | non trovato | non trovato | non trovato | [DON-M] ⚠️ |
| **Orizzontale Ø300** (TE00000830+AC00000553) | orizzontale (R) | mono (R) | 300 (R) | «223N» (R ⚠️) | non trovato | non trovato | non trovato | non trovato | [DON-M] ⚠️ |

Note:
- Sulle pagine TEV, «Weight/Peso» non dice se si tratta del **contrappeso** o della **massa del gruppo**. Donati lo presenta come contrappeso («Vertical tension weight Ø300mm 30kg one-way»). Il valore è stato tenuto così com'è.
- TEV200, TEV250BD e TEV300 hanno contrappeso in ghisa, protezione della puleggia, fissaggio a terra e ingombro ridotto (E).
- TEL20 va ordinato insieme al limitatore RQ-A200 (E). «Torque moment: 640N» è riportato come pubblicato, anche se l'unità non torna per un momento ⚠️.
- I tenditori orizzontali vengono da un riassunto dei risultati Donati e non sono attribuibili a uno dei tre URL. «223N» potrebbe essere il peso del contrappeso oppure la forza di tensionamento: **non convertito**. Che siano a leva non è dichiarato.

---

### 3. PFB: limitatori, dimensioni e masse

#### 3a. Valori per modello

Le colonne Ø, fune, Vn e Vint servono da contesto: sono del giro precedente (pagine pfb.it, E) salvo dove indicato.

| Modello | Ø / fune / Vn / Vint | H | Base larg. × prof. | Altezza asse | Massa | Sgancio / ripristino a distanza | Fonti |
|---|---|---|---|---|---|---|---|
| **LK200** | 200 / 6–6,5 / ≤1,48 / 0,32–1,70 (E giro prec.; R conferma) | **370** (R) | **165 × 220** (R, 2 estratti) ⚠️ vedi §5 | non trovato | **12** (R) | bobina 24 V DC «Remote Trip/Reset», contatto IP50, cod. LK200-0.25M/S (R) | [EQ-LK200a] [EQ-LK200b] [P-LK200] |
| **LK250** | 250 / 6–8 / ≤1,74 / 0,32–2,00 (E giro prec.) | non trovato (C 375 su una variante ⚠️) | non trovato (B 220 su una variante ⚠️) | non trovato | **14** (R, variante con sgancio a distanza) | «remote tripping device» sull'art. 6790328 (R) | [ES-6790328] [ES-OSG] ⚠️ |
| **LK300** | 300 / 6–8 / ≤2,93 / 0,40–3,37 (E giro prec.) | 370 (R ⚠️) **oppure** C 375 (R) | 165 × 220 (R ⚠️) | non trovato | **14 (R ⚠️) oppure 17,04 / 17,36 (R, varianti)** | sì sull'art. 6790217 (R) | [EQ-LK300] [ES-6790217] [ES-6790183] |
| **LK315** | 315 / 8–10 / ≤2,81 / 0,40–3,24 (E giro prec.) | 370 (R ⚠️) | 130 × 220 (R ⚠️) | non trovato | 14 (R ⚠️) | opzione «remote switch» (E giro prec.) | [EQ-LK315] |
| **R10BF** | 315 / 8–10 / ≤2,35 / 0,50–2,70; solo discesa, rotazione oraria (T) | **488** (R) | **460 × 196** (R) | non trovato | **31** (R) | non trovato | [EQ-R10BF] [P-R10] |
| **R12BF** | 345 (E giro prec.) / 346 (T) ⚠️; 8–10; ≤4,00; 1,00–5,06; solo discesa, rotazione oraria (T) | **524** (R) | **520 × 116** (R) | non trovato | **32** (R) | non trovato | [EQ-R12BF] [P-R12] |
| **R1-LR** | 300 / 6–8 / ≤2,23 / 0,41–2,57 (E giro prec., dati di «R1 e R1LR»); bidirezionale (T) | **344** (R) | **285 × 80** (R) | non trovato | **9,5** (R) | non trovato | [EQ-R1LR] [P-R1] |
| **R1 200** | 200 / 6–6,5 / ≤1,83 / 0,30–2,11 (E giro prec.) | non trovato | non trovato | non trovato | non trovato | non trovato | [P-R1] [MSL-R1] (T) |
| **R1 250** | 250 / 6–8 / ≤1,96 / 0,31–2,25 (E giro prec.) | non trovato | non trovato | non trovato | non trovato | non trovato | [P-R1] |
| **LX120** | 120 / 6–6,5 / ≤2,00 / 0,20–2,30 (E giro prec.) | **178** («profilo di soli 178 mm», E) | non trovato | non trovato | non trovato | non trovato | [P-LX120-NEWS] |
| **LX150** | 150 / 6–6,5 (E) / ≤2,34 / 0,21–2,70 | non trovato | non trovato | non trovato | non trovato | non trovato | [P-LX150-IT] |
| **LX180** | 180 / 6 std, 6,5 in deroga (E) ⚠️ / ≤2,17 (E) / 0,25–2,50 | non trovato | non trovato | non trovato | non trovato | non trovato | [P-LX180-IT] |
| **LX200** | 200 / 6–6,5 (E) / ≤2,30 (E) / 0,20–2,66 | non trovato | non trovato | non trovato | non trovato | non trovato | [P-LX200-IT] |
| **LK120** | 120 / 4 std, 6–6,5 in deroga / ≤2,00 / 0,20–2,30 ⚠️ (E giro prec.) | non trovato | non trovato | non trovato | non trovato | non trovato | [P-LK120] |

Note:
- «Base width / base depth» sono i termini di elevatorequipment.co.uk. Quale lato sia parallelo al piano della puleggia non è indicato.
- Elevatorequipment dà gli **stessi valori** per LK200 (H 370, 165 × 220) e LK300 (H 370, 165 × 220, 14 kg), e LK315 ha la stessa altezza e massa dell'LK300: potrebbe trattarsi di una scheda-modello copiata ⚠️.
- I valori di R10BF, R12BF e R1-LR invece sono diversi tra loro e coerenti.
- Fori di fissaggio: **non trovati** per nessun modello. Il manuale LK200 chiede solo inserti che reggano un carico di esercizio di **almeno 2 kN** (D) [EQ-LK200-MAN].

#### 3b. Articoli di rivenditori con quote A/B/C (significato non definito dalla fonte ⚠️)

| Articolo | A | B | C | Massa | Taratura / opzioni | Prova | URL |
|---|---|---|---|---|---|---|---|
| LK200, art. 6790115 (giro prec.) | 240 | 220 | 375 | 16,2 | Ts 1,3; test groove; sgancio 230 V AC | R | [ES-6790115] |
| LK200 «LSP24V», art. 6790226 (giro prec.) | 255 | 170 | 370 | non trovato | Ts 1,4; safety switch + descent stopping sys. | R | [ES-6790226] |
| LK250 «standard» | 260 | 220 | 375 | non trovato | Ts 1,4 | R ⚠️ pagina esatta non indicata | [ES-OSG] |
| LK250, art. 6790328 | ⚠️ | ⚠️ | ⚠️ | 14 | Ts 0,78; remote tripping device | R | [ES-6790328] |
| LK300, art. 6790217 | 310 | 170 | 375 | 17,36 | Ts 2,1; sgancio a distanza | R | [ES-6790217] |
| LK300, art. 6790183 | 300 | 234 | 375 | 17,04 | Ts 1,88; encoder 125 impulsi | R | [ES-6790183] |
| LK300 con anticreeping | 300 | 220 | 375 | non trovato | anticreeping device | R ⚠️ pagina esatta non indicata | [ES-OSG] |

LK250, art. 6790328: due estratti danno quote incompatibili (282 / 225 / 41 e 250 / 78 / 18) e **non sono stati usati**. La massa di 14 kg è uguale nei due estratti. Su tutti gli LK la quota C vale 370–375, cioè quanto l'altezza di 370 data da elevatorequipment per l'LK200. È solo una coincidenza numerica, **non una definizione**.

---

### 4. PFB: tenditori, dimensioni e masse

| Modello | Tipo | Pulegge Ø | Contrappesi | Fissaggio | Corredo | Ingombri | Massa | Fonti |
|---|---|---|---|---|---|---|---|---|
| **R4K** | orizzontale «all-in-one», reversibile (E); «a leva» secondo il brief e il giro prec. | 150 / 180 / 200 / 250 / 300 / 315 (E) | 5 / 10 / 13 / 22 (E) | alla guida (E) | contatto modulare (E giro prec.) | non trovato | non trovato | [P-R4K-IT] [P-R4K] |
| **«R4KE» per LK200, due sensi** (art. 6790127) | non indicato | 200 (R ⚠️ dal riassunto «d=200mm» e dal titolo «for LK200») | non trovato | non trovato | — | **A 700 · B 330 · C 113** (R ⚠️ lettere non definite) | **26,52** (R) | [ES-6790127] |
| **«R4KE» d=300, «13kg»** (art. 6790134) | non indicato | 300 (R) | «13kg» nel titolo (R ⚠️) | non trovato | — | **A 820 · B 415 · C 115** (R ⚠️) | **18,36** (R) | [ES-6790134] |
| **R4R** | verticale (E) | 200 / 260 / 300 / 315 (E) ⚠️ | 22 / 30 / 44 (E) ⚠️ | **alla guida**: «deve essere fissato alla guida» (E) | — | non trovato | non trovato | [P-R4R-IT] |
| **R4T** | verticale compatto e sottile (E) | 120–315 (E); 200 / 300 / 315 (R) | «Kg. 30 - 60» (E ⚠️ due valori o intervallo?); «60kg weights» (R) | a pavimento o alla guida (E); kit a pavimento (R) | contatto di sicurezza, puleggia, protezione (R) | non trovato | non trovato | [P-R4T-IT] [EQ-R4T] |
| **R4V** | verticale (E giro prec.) | 200 / 300 / 315 (R) | 30 / 60 / 104 (R) | a pavimento (R) | contatto + protezione puleggia (R) | non trovato | non trovato | [EQ-R4V] [P-R4V] |
| **Kit tenditore alla guida** (elevatorequipment, modello PFB non indicato ⚠️) | non indicato | 200 (fune 6–6,5) / 300 (6–8) / 315 (8–10) (R) | non trovato | alla guida (R) | — | non trovato | non trovato | [EQ-GMK200/300/315] |

Note:
- «R4KE» è una sigla del rivenditore: che corrisponda all'R4K **non è confermato**.
- L'R4KE d=300 pesa meno di quello per LK200 (18,36 contro 26,52 kg). Forse dipende dal contrappeso incluso (13 contro 22 kg), ma **non è dichiarato**.
- Massa e ingombri di R4K, R4R e R4T secondo il costruttore: **non trovati**.

---

### 5. Conflitti

1. **LK200, base 165 o 200.** In questo giro due estratti di elevatorequipment.co.uk danno 165 × 220 (codice LK200-0.25M/S, H 370, 12 kg), e c'è anche un estratto precedente con 165. Un solo estratto di un giro precedente, di pagina non determinata, dà 200. Le quote B di elevatorshop.de (220 e 170) non sono definite. **Più fonti per 165**, ma nessun disegno PFB letto: il conflitto resta aperto finché non si apre il manuale.
2. **LK300, massa:** 14 kg (elevatorequipment ⚠️) contro 17,04 kg e 17,36 kg (elevatorshop, varianti con encoder o sgancio a distanza).
3. **LK300, altezza e base:** H 370 e 165 × 220 (elevatorequipment, valori identici all'LK200) contro C 375 e B 170 / 234 / 220 (elevatorshop, lettere non definite).
4. **LK315:** fonte unica (H 370, base 130 × 220, 14 kg) con valori sospetti: altezza e massa uguali alla pagina LK300 dello stesso rivenditore, base più stretta di quella dell'LK200.
5. **LK250, art. 6790328:** due estratti con quote A/B/C incompatibili (282/225/41 e 250/78/18); concordano solo sui 14 kg.
6. **R12BF, puleggia:** 345 (pfb.it, giro prec.) contro «346mm Pulley» (titolo elevatorequipment).
7. **R4R:** un estratto dà pulegge 200/260/300/315 e contrappesi 22/30/44 kg; un altro, sullo stesso tema, dà pulegge 120–315 «tipo ridotto» e contrappesi 13/22/30/44 kg. «260» non è stato corretto.
8. **LX180, funi:** «6 standard, 6,5 in deroga» (questo giro) contro «4–6 standard, 6,5 in deroga» (giro prec.).
9. **R4KE d=300:** titolo «13kg» contro peso dell'articolo 18,36 kg (probabilmente contrappeso contro articolo, non dichiarato).
10. **Montanari NOR / RC, fori:** l'italiano dice «interasse fori di fissaggio», l'inglese «bolt holes pitch circle». Non è chiaro se 219 e 132 siano un interasse o un diametro di foratura.
11. **Montanari RQ-A, base:** l'indizio «170 / stretta 132» non è confermato; 132 è confermato solo per la base stretta dell'**RC**.
12. **Montanari TEV, «Weight»:** contrappeso o massa del gruppo non specificato. Donati lo tratta come contrappeso.
13. **Montanari, codici Donati:** il riassunto assegna lo stesso accessorio AC00000551 a TEV200 e TEV250, e AC00000553 a tutti gli orizzontali. Può essere un errore del riassunto.
14. **RQ-A 200, taratura:** Vn 1,00 / Vint 1,37 da un riassunto senza URL, contro il titolo fceu RQ200 «nom speed 1,0» che non riporta la Vint.

### 6. Non trovato

**Montanari, limitatori:**
- massa di tutti i modelli;
- L × P × H (salvo H 300 della versione ribassata dell'RQ-A 200);
- impronta della base e fori, salvo interasse/cerchio 219 (NOR) e 132 (RC);
- altezza dell'asse puleggia;
- significato di A, øD e øP;
- per l'RQ-A, funi e limiti di velocità per taglia;
- campi Vint per modello (solo titoli di rivenditore RQ200/RQ250);
- sgancio e ripristino a distanza per NOR, RC e RG;
- dati della sigla RH;
- diametro primitivo.

**Montanari, tenditori:**
- ingombri di tutti i modelli;
- se «Weight» sia il contrappeso o il gruppo;
- puleggia di TEV200BD e TEV250BD;
- dati del TEV300BD;
- tipo e ingombri del TEL20;
- tenditori a leva espliciti (gli «orizzontali» Donati non dicono «leva»);
- fissaggio alla guida, numero di morsetti.

**PFB, limitatori:**
- L × P × H completi per tutti i modelli;
- altezza dell'asse per tutti i modelli;
- fori di fissaggio per tutti i modelli;
- dimensioni e massa di LX150, LX180, LX200 e LK120;
- dimensioni dell'LX120, salvo H 178;
- dimensioni di R1 200 e R1 250;
- massa dell'LK300 senza conflitto;
- dati dell'LK315 verificati;
- quote definite dell'LK250.

**PFB, tenditori:**
- ingombri e masse dei gruppi R4K, R4R, R4T e R4V secondo il costruttore (per l'R4K esistono solo gli articoli «R4KE» del rivenditore);
- morsetti alla guida;
- forza di tensionamento.

### 7. Fonti

Tutte consultate il 2026-10-01 **solo come estratto del motore di ricerca**. Con «(giro prec.)» sono indicate le fonti del giro precedente, citate per contesto.

**Montanari, costruttore (montanarigiulio.com):**
- **[M-RQA]** https://www.montanarigiulio.com/prodotto/sicurezza/limitatori/rqa/: RQ-A, Vn 0,15–3,0; pulegge 200/250/300; base stretta o standard; gola di prova; versione ribassata RQ-A 200 H 300; installazione capovolta; istantaneo o progressivo; fune e idraulico; cabina o contrappeso; anti-deriva UCM; funi 6 – 6,5 – 8 (⚠️ possibile eco). (E)
- **[M-RQA-EN]** https://www.montanarigiulio.com/en/product/safety/speed-governors/rqa/: rated 0,15–3; pulley 200–250–300; upside-down yes. (E)
- **[M-RQA-NEWS]** https://www.montanarigiulio.com/news/nuovo-limitatore-rq-a-montanari/: news «Nuovo limitatore RQ-A», solo titolo. (T)
- **[M-MAN-ITA]** https://www.montanarigiulio.com/wp-content/uploads/2019/02/MANUALE_RQ_RQA_ITA_rev_3_01_21.pdf: manuale «RQ & RQ-A 200-250-300» rev. 3_01_2021; quote A/øD/øP 220/210/150, 270/260/185, 320/310/225. (E)
- **[M-MAN-ENG21]** https://www.montanarigiulio.com/wp-content/uploads/2021/01/MANUALE_RQ_RQA_ENG_rev_3_01_21.pdf: stesse quote; posa con o senza locale; in piano o capovolto; livellamento 0,2 mm; tutti i punti di fissaggio; bobina integrata alimentabile per pochi secondi; ripristino a distanza del contatto; fune 6–6,5 per la taglia 200 (attribuzione tra i due manuali EN non certa). (E)
- **[M-MAN-ENG25]** https://www.montanarigiulio.com/wp-content/uploads/2019/02/MANUALE_RQ-RQA_rev10_02_2025-ENG.pdf: manuale EN rev. 10_02_2025, stesso contenuto dell'estratto sopra. (E)
- **[M-MAN-FR]** https://www.montanarigiulio.com/wp-content/uploads/2021/11/MANUALE_RQ_RQA_FR.pdf: titolo, REV 06_06_2022. (T)
- **[M-MAN-ESP]** https://montanarigiulio.com/wp-content/uploads/2021/01/MANUALE_RQ_RQA_ESP_rev_3_01_21.pdf: titolo. (T)
- **[M-MAN-PT]** https://www.montanarigiulio.com/wp-content/uploads/2019/02/MANUALE_RQ-RQA_rev10_02_2025_PT.pdf: titolo. (T)
- **[M-MAN-DEU]** https://www.montanarigiulio.com/wp-content/uploads/2019/02/MANUALE_RQ-RQA_rev10_02_2025-DEU.pdf: titolo «Einbau, Bedienung und Wartung Geschwindigkeitsbegrenzer». (T)
- **[M-NOR]** https://www.montanarigiulio.com/prodotto/sicurezza/limitatori/nor/: NOR, puleggia 300 con gola di prova; mono o bi; Vn 0,30–1,50; funi 6 – 8; capovolta sì; arpione; interasse fori 219; base standard. (E)
- **[M-NOR-EN]** https://www.montanarigiulio.com/en/product/safety/speed-governors/nor/: stessi dati, «bolt holes pitch circle 219 mm». (E)
- **[M-MAN-NORRG]** https://www.montanarigiulio.com/wp-content/uploads/2018/05/MANUALE_NOR_RG_ENG.pdf: manuale «NOR - RG200» REV 06_11_2022; verticalità con bolla o piombo; pendenza fune ±0,50°; posa capovolta e forza d'intervento. (E)
- **[M-RC]** https://www.montanarigiulio.com/prodotto/sicurezza/limitatori/rc/: RC centrifugo, Vn 1,60–4,2; puleggia 200 – 300; funi 6 – 6,5 – 8; interasse fori 132; base stretta; mono o bi; istantaneo o progressivo; contatto gestito separatamente. (E)
- **[M-RC-EN]** https://www.montanarigiulio.com/en/product/safety/speed-governors/rc/: stessi dati, upside-down yes, «bolt holes pitch circle 132 mm», base narrow. (E)
- **[M-RGRH]** https://www.montanarigiulio.com/products-page/limitatori/prodotto-rg-rh/: gamma RG-RH, pulegge 200 e 300; con o senza gola di prova; mono o bi; RG 200 Vn 0,15–0,30, funi 6–6,5; TÜV 95/16/CE. (E)
- **[M-CAT-LIM]** https://www.montanarigiulio.com/catalogo/sicurezza/limitatori/: catalogo dei limitatori, solo titolo. (T)
- **[M-TEL20]** https://www.montanarigiulio.com/en/product/safety/tension-devices/tel20/: TEL20, tenditore per limitatore in fossa, con RQ-A200; Weight 65 kg; reset automatico/manuale; Weights 4; «Torque moment 640N»; per RQA200 bidirezionale. (E)
- **[M-TEV200]** https://www.montanarigiulio.com/prodotto/sicurezza/tenditori/tev200/: verticale mono; ghisa; protezione puleggia; 29 kg; contatto manuale/automatico; a terra; ingombro ridotto. (E)
- **[M-TEV200BD]** https://www.montanarigiulio.com/en/product/safety/tension-devices/tev200bd/: verticale bi; 85 kg; switch manuale/automatico. (E)
- **[M-TEV250]** https://www.montanarigiulio.com/en/product/safety/tension-devices/tev250/: verticale mono; 30 kg; switch manuale/automatico. (E)
- **[M-TEV250BD]** https://www.montanarigiulio.com/prodotto/sicurezza/tenditori/tev250bd/: verticale bi; ghisa; protezione; 85 kg; contatto; a terra. (E)
- **[M-TEV300]** https://www.montanarigiulio.com/en/product/safety/tension-devices/tev300/: verticale mono; 30 kg; switch manuale/automatico. (E)
- **[M-CAT-TENS]** https://www.montanarigiulio.com/en/catalog/safety/tension-devices/: catalogo «Tension devices»; per il riassunto vi compare il TEV300BD ⚠️. (T)

**Montanari, rivenditori:**
- **[DON-TEV300]** https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari-0: titolo «MONTANARI TEV300+AC00000251 - Vertical tension weight Ø300mm 30kg one-way». (R)
- **[DON-M]** https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari: riassunto (non attribuibile al singolo URL ⚠️) sui tenditori orizzontali Montanari Ø200/250/300 mono, codici TE00000820/825/830 + AC00000553, «223N». (R)
- **[DON-M2]** https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari-2: pagina dei tenditori Montanari, solo titolo. (T)
- **[DON-M3]** https://www.donati.it/en/products/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari/montanari-3: idem, anche su prod11.donati.it. (T)
- **[DON-CAT]** https://www.donati.it/en/catalogo-prodotti/overspeed-governors-tension-weights-safety-gears/tension-weights-montanari-0: catalogo «Diam. Pulley mm»; il riassunto dà TEV200 Ø200 29 kg e TEV250 Ø250 30 kg ⚠️. (R)
- **[FCEU-RQ200]** https://www.fceu.eu/osg-rq200-200mm-for-rope-6-6-5mm-nom-speed-1-0m-s-01200052: titolo RQ200, Ø200, fune 6–6,5, Vn 1,0. (T)
- **[ELVA-RQ250-BI]** https://shop.elvacenter.com/shop/speed-governors/overspeed-governor/montanari-rq250-vnom-0-63-m-sec-vint-0-82-m-sec-bi-direction-brede-basis/: titolo RQ250, Vn 0,63, Vint 0,82, bidirezionale, base larga. (T)
- **[ELVA-RQ250-L]** https://shop.elvacenter.com/shop/speed-governors/overspeed-governor/montanari-rq250-vnom-0-63-m-sec-vint-0-82-m-sec-links-brede-basis/: titolo RQ250 «links», base larga. (T)

**PFB, rivenditori e documenti:**
- **[EQ-LK200a]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/lk-200-200mm-pulley-overspeed-governor-bi-directional: H 370; base 165 × 220; 12 kg; fune 6–6,5; Vint 0,32–1,70; Vn ≤1,48; 24 VDC Remote Trip/Reset IP50; cod. LK200-0.25M/S. (R)
- **[EQ-LK200b]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk200-bidirectional-overspeed-governor-200mm-pulley: 370 / 165 / 220 / 12 kg (attribuzione probabile). (R)
- **[EQ-LK200-MAN]** https://www.elevatorequipment.co.uk/files/ww/LK200%20Overspeed%20Governor%20Manual.pdf: manuale PFB «AGGIORNAMENTO 01/07/2021»; inserti per un carico di esercizio ≥ 2 kN. (D)
- **[EQ-LK300]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/pfb-lk300-bidirectional-overspeed-governor-300mm-pulley: H 370; 165 × 220; 14 kg ⚠️. (R)
- **[EQ-LK300b]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/lk-300-300mm-pulley-overspeed-governor-bi-directional: pagina LK300 alternativa, solo titolo. (T)
- **[EQ-LK315]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-lk315-bidirectional-overspeed-governor-315mm-pulley: H 370; 130 × 220; 14 kg ⚠️. (R)
- **[EQ-LK315b]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/lk-315-315mm-pulley-overspeed-governor-bi-directional: pagina LK315 alternativa, solo titolo. (T)
- **[EQ-R12BF]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r12bf-clockwise-down-only-direction-overspeed-governor-346mm-pulley: H 524; 520 × 116; 32 kg; «346mm Pulley»; solo discesa, rotazione oraria. (R)
- **[EQ-R10BF]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r10bf-clockwise-down-only-direction-overspeed-governor-315mm-pulley: H 488; 460 × 196; 31 kg. (R)
- **[EQ-R10BF-b]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/r10bf-315mm-pulley-overspeed-governor-down-directional-only-rope-clamping: titolo «down directional only, rope clamping». (T)
- **[EQ-R1LR]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-r1lr-bidirectional-overspeed-governor-300mm-pulley: H 344; 285 × 80; 9,5 kg; bidirezionale; Ø300. (R)
- **[EQ-R1LR-MAN]** https://www.elevatorequipment.co.uk/files/ww/R1-LR%20Overspeed%20Governor%20Manual.pdf: manuale PFB R1-LR, solo titolo. (T)
- **[EQ-RANGE]** https://www.elevatorequipment.co.uk/lift-equipment/overspeed-governor-ranges/pfb-overspeed-governor-range: pagina della gamma, solo titolo. (T)
- **[EQ-R5R6-MAN]** https://www.elevatorequipment.co.uk/files/ww/s2%20man%20r5%20&%20r6%20installation%20manual.pdf: manuale R5 e R6, solo titolo. (T)
- **[EQ-R4T]** https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4t-vertical-tension-weight-200mm-300mm-315mm-pulley: R4T a pavimento; 200/300/315; switch, puleggia, protezione; pesi 60 kg. (R)
- **[EQ-R4V]** https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4v-vertical-tension-weight-200mm-300mm-315mm-pulley: R4V a pavimento; 200/300/315; switch e protezione; 30/60/104 kg. (R)
- **[EQ-TWR]** https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range: gamma dei tenditori PFB, solo titolo. (T)
- **[EQ-R4M]** https://www.elevatorequipment.co.uk/lift-equipment/tension-weight-systems/pfb-tension-weight-range/pfb-r4m-tension-weight-with-springs-200mm-pulley: R4M a molle Ø200, solo titolo. (T)
- **[EQ-GMK200]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-guide-mounted-tension-weight-kit-200mm-pulley: kit alla guida Ø200, funi 6–6,5. (R)
- **[EQ-GMK300]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-guide-mounted-tension-weight-kit-300mm-pulley: kit alla guida Ø300, funi 6–8. (R)
- **[EQ-GMK315]** https://www.elevatorequipment.co.uk/search-by-manufacturer/pfb/pfb-guide-mounted-tension-weight-kit-315mm-pulley: kit alla guida Ø315, funi 8–10. (R)
- **[ES-6790328]** https://www.elevatorshop.de/en/pfb-overspeed-governor-lk250-remote-tripping-device-ts-0.78m-s-6790328.html: LK250, sgancio a distanza, Ts 0,78; 14 kg; A/B/C incoerenti ⚠️. (R)
- **[ES-6790217]** https://www.elevatorshop.de/en/overspeed-governor-lk300-with-remote-tripping-ts-2.1m-s-6790217.html: LK300, A 310, B 170, C 375, 17,36 kg, Ts 2,1. (R)
- **[ES-6790183]** https://www.elevatorshop.de/en/overspeed-governor-lk300-encoder-125-pulse-ts-1.88m-s-6790183.html: LK300 con encoder, A 300, B 234, C 375, 17,04 kg, Ts 1,88. (R)
- **[ES-6790127]** https://www.elevatorshop.de/en/tension-weight-type-r4ke-for-lk200-triggering-in-both-directions-6790127.html: R4KE per LK200 due sensi, A 700, B 330, C 113, 26,52 kg. (R)
- **[ES-6790134]** https://www.elevatorshop.de/en/tension-weight-type-r4ke-d-300-13kg-6790134.html: R4KE d=300 «13kg», A 820, B 415, C 115, 18,36 kg. (R)
- **[ES-6790269]** https://www.elevatorshop.de/en/pfb-roller-with-60mm-axle-for-counter-weight-lk200-rope-6-6.5mm-6790269.html: titolo «roller with 60mm axle for counter weight LK200, rope 6-6.5mm». (T)
- **[ES-OSG]** https://www.elevatorshop.de/en/products/overspeed-governor/: categoria; le quote «LK250 standard Ts 1,4: 260/220/375» e «LK300 anticreeping: 300/220/375» vengono da ricerche limitate a elevatorshop.de, ma la pagina esatta non è indicata ⚠️. (R)
- **[ES-6790115]** (giro prec.) https://www.elevatorshop.de/en/overspeed-governor-lk200-w.-test-groove-remote-tripping-230v-ac-ts-1-3m-s-6790115.html: LK200, A 240, B 220, C 375, 16,2 kg. (R)
- **[ES-6790226]** (giro prec.) https://www.elevatorshop.de/en/pfb-governor-lk200-lsp24v-ts-1.4m-s-w.-safety-switch-a.-descent-stopping-sys.-6790226.html: LK200 LSP24V, A 255, B 170, C 370. (R)
- **[MSL-R1]** https://www.manualslib.mx/manual/105674/Pfb-R1.html: manuale PFB R1 (ES), pag. 21 «Fornitura complessiva», solo titolo. (T)
- **[MSL-LKT120]** https://www.manualslib.com/manual/2649804/Pfb-Lkt120.html: manuale PFB LKT120, solo titolo. (T)
- **[PFB-PDF]** https://download.pfb.it/api/pdf/5799, https://download.pfb.it/api/pdf/349872, https://download.pfb.it/api/pdf/5801: PDF PFB, solo URL (il 5801 è indicato nel giro precedente come manuale LK200–LK315). (T)

**PFB, costruttore (pfb.it):**
- **[P-LX120-NEWS]** https://pfb.it/en/news/343371: LX120, «profilo di soli 178 mm». (E)
- **[P-LX150-IT]** https://pfb.it/it/prodotto/4056/limitatori-di-velocita/limitatore-di-velocita-lx-150-bidirezionale-ascensori: LX150, Ø150, gola temprata, funi 6–6,5. (E)
- **[P-LX180-IT]** https://pfb.it/it/prodotto/4055/limitatori-di-velocita/lx-180-bidirezionale: LX180, Vn ≤2,17, Ø180, fune 6 standard, 6,5 in deroga, TÜV SÜD. (E)
- **[P-LX200-IT]** https://pfb.it/it/prodotto/335278/limitatori-di-velocita/lx-200-bidirezionale: LX200, Vn ≤2,30, Ø200, funi 6/6,5, TÜV SÜD. (E)
- **[P-LX200-NEWS]** https://pfb.it/it/news/335556/il-nuovo-limitatore-di-velocita-bidirezionale-lx200-per-ascensori: news LX200, solo titolo. (T)
- **[P-R4K-IT]** https://www.pfb.it/it/prodotto/3301/tenditori/r4k-orizzontale-tenditore-ascensori: R4K reversibile, alla guida, pulegge 150–315, contrappesi 5/10/13/22. (E)
- **[P-R4R-IT]** https://pfb.it/it/prodotto/4118/tenditori/r4r-verticale: R4R, pulegge 200/260/300/315, contrappesi 22/30/44, «deve essere fissato alla guida»; secondo estratto in conflitto (§5.7). (E)
- **[P-R4T-IT]** https://pfb.it/it/prodotto/321543/tenditori/r4t-verticale: R4T compatto, a pavimento o alla guida, pulegge 120–315, contrappesi «30 - 60». (E)
- **[P-NEWS338457]** https://pfb.it/it/news/338457/contatti-per-limitatori-di-velocita-tenditori-ascensori: news sui contatti di limitatori e tenditori, solo titolo. (T)
- Pagine del giro precedente, citate per Ø, fune, Vn e Vint (E):
  - **[P-LK200]** https://pfb.it/en/product/3264/overspeed-governors/lk-200-bidirectional
  - **[P-LK250]** https://pfb.it/en/product/3265/overspeed-governors/lk-250-bidirectional
  - **[P-LK300]** https://pfb.it/en/product/3266/overspeed-governors/lk-300-bidirectional
  - **[P-LK315]** https://pfb.it/en/product/3267/overspeed-governors/lk-315-bidirectional
  - **[P-LK120]** https://pfb.it/en/product/3263/overspeed-governors/lk-120-bidirectional
  - **[P-R1]** https://pfb.it/en/product/3219/overspeed-governors/r1-monodirectional-r1lr-r1-200-r1-250-r1-300-bidirectional
  - **[P-R10]** https://pfb.it/en/product/3268/overspeed-governors/r10bf-rope-clamping
  - **[P-R12]** https://pfb.it/en/product/3269/overspeed-governors/r12bf-rope-clamping
  - **[P-LX120]** https://pfb.it/en/product/343313/overspeed-governors/bidirectional-overspeed-governor-lifts-lx120
  - **[P-LX150]** https://pfb.it/en/product/4056/overspeed-governors/lx150-bidirectional
  - **[P-LX180]** https://pfb.it/en/product/4055/overspeed-governors/lx180-bidirectional
  - **[P-LX200]** https://pfb.it/en/product/335278/overspeed-governors/lx200-bidirectional
  - **[P-R4K]** https://pfb.it/en/product/3301/tension-weights/r4k-horizontal
  - **[P-R4R]** https://pfb.it/en/product/4118/tension-weights/r4r-vertical
  - **[P-R4T]** https://pfb.it/en/product/321543/tension-weights/r4t-verticale
  - **[P-R4V]** https://pfb.it/en/product/325384/tension-weights/r4v-vertical

### 8. Metodo e limiti

- In questo giro sono state fatte **34 ricerche WebSearch**: 22 per Montanari e 12 per PFB, di cui 4 in modalità standard e 30 in modalità estesa. Una 35ª ricerca è stata **rifiutata** perché il budget della sessione era esaurito (200/200, `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`). Nessun uso di WebFetch o curl e nessun aggiramento della policy di rete.
- Da aprire appena l'accesso lo consente, in ordine di resa:
  1. manuale Montanari RQ & RQ-A (ITA rev. 3_01_21 / ENG rev. 10_02_2025): disegno con A/øD/øP, base, fori, masse;
  2. manuale PFB LK200–LK315 (download.pfb.it/api/pdf/5801) e manuale LK200 di elevatorequipment: quote e fori;
  3. manuale «NOR - RG200»;
  4. pagine dei tenditori TEV e TEL20;
  5. pagine Donati dei tenditori orizzontali Montanari;
  6. manuale PFB R1 (manualslib).
