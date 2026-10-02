# 17. Argani a riduttore sul mercato italiano: tutti i costruttori, i dati e i disegni

[← Indice](README.md)

> Raccolta del 2 ottobre 2026 per il catalogo e i disegni di LiftPilot. Completa i capitoli 8 e 12 senza
> sostituirli: qui ci sono i **documenti dei costruttori letti oggi** (schede, cataloghi, brochure) e i
> costruttori nuovi. I file scaricati restano nello spazio di lavoro temporaneo, **non nel repository**
> (elenco al § 11). Dai documenti si prendono **solo numeri**: nessun disegno, testo o geometria del
> costruttore entra nel software.

## 0. Come leggere

**Marcatori (per ogni numero).**

- ✅ letto nel documento indicato (del costruttore o copia integrale di un suo catalogo; l'host è nella chiave);
- ⚠️ dedotto da noi (somma di quote, misura in scala sul disegno, conversione di unità) **oppure** fonte
  secondaria (rivenditore, estratto del motore di ricerca): la nota dice quale;
- ❓ non trovato.

Quando un numero è letto ✅ ma il suo **significato** è una nostra interpretazione del disegno, la cella lo
dice con «(sign. ⚠️)».

**Chiavi delle fonti** (tutte consultate il **2026-10-02**, salvo dove indicato). Nelle tabelle la chiave
è seguita dalla pagina del PDF, per esempio «SC-B p.9».

| Chiave | Documento | URL |
|---|---|---|
| SC-B | SICOR, brochure «Geared» EN, aprile 2026, 112 pagine | https://sicoritaly.com/wp-content/uploads/2026/04/SICOR-Brochure-Geared-EN.pdf |
| SC-S | SICOR, schede tecniche 2025 (IT; SV110 in EN) | https://sicoritaly.com/wp-content/uploads/2025/03/Scheda-Tecnica-MODELLO-Geared-ITA-2025.pdf · https://sicoritaly.com/wp-content/uploads/2025/03/Technical-Sheet-SV110-Geared-EN-2025.pdf |
| SC-W | SICOR, 22 pagine modello | https://sicoritaly.com/en/geared-series/geared-MODELLO/ (sv110, sh110b, sh110-ssb, mr12c, sh130, sh130-ssb, sh130g, sh130g-ssb, sh140, sh140-ssb, sh140t, sh160, sh160-ssb, sh160t, sh160ls, sh190, sh190-ssb, mr21, mr21-ssb, mr26, mr26-ssb, mr35) |
| SC-Z | SICOR, ZIP «2D e 3D» | https://sicoritaly.com/wp-content/uploads/_pda/AAAA/MM/MODELLO.zip (indice letto con richieste a intervalli, § 2.7) |
| SC-M | SICOR, manuale SV110 MUM0335 rev. 01 | https://sicoritaly.com/wp-content/uploads/_pda/2024/02/MUM0335_REV01_EN.pdf |
| SC-L | SICOR MR12, manuale MUM0040 rev. 08, pagina «Technical features» (ManualsLib) | https://www.manualslib.com/manual/1387409/Sicor-Mr12.html?page=12 |
| C13 | cap. 12 § 13.1: lettura dei disegni delle schede 2025 e dei modelli STEP (giro del 2026-10-02); i numeri sono stati ricontrollati oggi nel testo di SC-B | [12-catalogo-argani.md](12-catalogo-argani.md) |
| SH | `liftpilot/src/lib/catalog/shapes.ts`: misure prese dai modelli STEP SICOR nel giro del 2026-10-02 | — |
| SA-C | Alberto Sassi, «Catalogo argani / Gearboxes catalogue» REV 2022/03, 73 pagine, copia integrale su construction.am | https://www.construction.am/images/photo-gallery/3948/Alberto_SASSI_Catalogue_Geared_2022_Rev_03.pdf |
| SA-12 | cap. 12 §§ 3, 11, 12: estratti di ricerca delle pagine sassi.it (2026-10-01/02) | [12-catalogo-argani.md](12-catalogo-argani.md) |
| MO-12 | cap. 12 §§ 10, 12: estratti di ricerca delle pagine e dei PDF Montanari (2026-10-01/02) | [12-catalogo-argani.md](12-catalogo-argani.md) |
| MO-B | Montanari, «General brochure» 2015, copia su itasia.it | https://www.itasia.it/wp-content/uploads/2019/05/Montanari-General-Brochure-1.pdf |
| MO-D | Donati (rivenditore), argani Montanari M73 e M73S | https://www.donati.it/en/products/geared-motors-bedframes-pulleys-brakes-accessories/montanari-gear-motors/montanari-gear |
| GE-S | GEM, schede modello (pagine del catalogo 2019) | https://gem-ita.com/wp-content/uploads/2020/12/HW134.pdf (e HW134B, HW134L, HW134VF, HW135VF, HW135L-VF, HW140C, HW175 .pdf) |
| GE-C | GEM, «Catalogo prodotti» REV2021, 13 pagine | https://gem-ita.com/wp-content/uploads/2020/12/GEM_Catalogo-Prodotti_REV2021.pdf |
| GE-W | GEM, pagine modello | https://gem-ita.com/hw134-camel/ (e /hw134b-brake/, /hw134l-camel/, /hw134vf-camel/, /hw135-vf/, /hw135l-vf/, /hw140c-lion/, /hw140cl-lion/, /hw175-elephant/) |
| FA-S | FAER, schede modello | https://www.faer.net/wp-content/uploads/2020/07/p58f-p58f.pdf · …/P60f-scheda-ok.pdf · …/P68f-scheda-ok.pdf · …/P70f-scheda-ok.pdf · …/P80f-scheda-ok.pdf |
| FA-C | FAER, catalogo «Technical data 12», 8 pagine | https://www.faer.net/wp-content/uploads/2020/07/catalogo-FAER_compressed.pdf |
| FA-W | FAER, pagine modello e gamma | https://www.faer.net/en/geared-machines-for-elevators-catalog/ · https://www.faer.net/argani-per-elevatori/ |
| IT-X | estratti del motore di ricerca delle pagine top-gears.it | https://top-gears.it/en/product/geared-machine-itg-127/ · https://www.top-gears.it/english/geared-machines-for-elevatoren/ |
| IT-R | Allied International (rivenditore), ITG 134 | https://aigtcc.com/p-products/topgears-itg-134-lift-machine-motor/ |
| IT-E | Europages, scheda Italian Top Gears S.r.l. | https://www.europages.it/ITALIAN-TOP-GEARS-SRL/00000005339972-639130001.html |
| GT | GEAT Elevators (distributore), categoria argani e articoli | https://www.geatelevators.it/it-IT/categorie/161-argani-001.001.aspx · …/articoli/GEKO-3631.aspx · …/articoli/Argano-SH110TSB-5194.aspx · …/categorie/2-Argani--Gearless--Pulegge-e-Accessori--001.aspx |
| DO | Donati (rivenditore), marchi degli argani e Uberlift | https://www.donati.it/it/catalogo-prodotti/argani-telai-pulegge-freni-accessori · https://www.donati.it/en/products/gear-motors-inverter-and-accessories/gem-gear-motors/uberlift-brake-geared-traction-6 · https://www.donati.it/en/news/product-information-sheets/uberlift-universal-frames |
| TC | Telcal (rivenditore), categoria argani | https://www.telcal.com/argani |

**Convenzioni dei disegni.** «Asse lento» = asse della puleggia; «piano dei piedi» = piano d'appoggio;
P = distanza tra il piano medio della puleggia e il piano verticale della vite (come in C13); E = larghezza
della puleggia; D = diametro della puleggia. Le velocità SICOR sono della cabina (sincrone, 1:1); quelle
Sassi della puleggia; quelle FAER e GEM della cabina, alle condizioni delle tabelle (§§ 5, 6).

## 1. Quadro: costruttori, modelli, documenti e accesso

| Costruttore | Modelli a puleggia trovati | Documenti letti oggi | CAD / disegni scaricabili | Sito da qui (2026-10-02) |
|---|---|---|---|---|
| **SICOR** (Rovereto) | 13 attuali (SV110, SH110B, MR12C, SH130, SH130G, SH140, SH160, SH190, MR21, MR26, MR35 + SH140LS, SH160LS) + versioni SSB/TS; a tamburo SH140T, SH160T; storici SH110, SH130B, SH140B, MR21B, SH110TSB, MR10, MR12, MR13, MR14, MR16, MR17 | brochure 2026 (112 pp.), 15 schede 2025 (13 modelli), 19 manuali, 22 pagine | **Sì**: ZIP per modello con DWG/DXF (2D) e STEP (3D), per mano (DX/SX) e Ø; **senza login** (HTTP 200); **SV110: nessuno ZIP** (§ 2.7) | **200** (https://sicoritaly.com; www → 301) |
| **Alberto Sassi** (Valsamoggia BO) | MODY, LEO, TORO, MF48, MF84, MF94, MB94, MB95, MB108; a tamburo LEO/TORO/MF84; nomi storici GEKO ⚠️, RF18 | catalogo argani REV 2022/03 (copia integrale) | DXF e STEP nell'area riservata «MY SASSI», **login** (account dal commerciale) ⚠️ SA-12; disegni quotati nel catalogo (PDF) | **bloccato**: curl «(60) SSL certificate problem: unable to get local issuer certificate» (il server manda solo il certificato foglia *.sassi.it, emittente Actalis OV Server CA G3); WebFetch «EGRESS_BLOCKED» |
| **Montanari Giulio & C.** | M65, M73 (H, S, AL, B), M75 (H, S), M83 (AL, B), M85, PENTA, PENTA 830, M93 (AL, B), M95, M98 (H, HB, HAL), M105 (B), M109; sito India: M77, M87, M104; storici M68, M71, M76 | brochure generale 2015 (copia), pagine Donati | ❓ nessun CAD trovato; esistono PDF per gamma con disegni (non aperti, sito bloccato) | **bloccato**: montanarigiulio.com curl «(60) … unable to get local issuer certificate», WebFetch «EGRESS_BLOCKED»; montanarigiulio.in e montanarina.com HTTP 202 con rimando a «/.well-known/sgcaptcha/» (verifica anti-bot, non aggirata); montanari.cn 200 (solo gearless e scale mobili) |
| **GEM – General Elevator Machines** | HW134 CAMEL, HW134L, HW134VF, HW134B (freno), HW135VF, HW135L-VF, HW140C LION, HW140CL, HW175 ELEPHANT | 8 schede + 2 cataloghi REV2021 + 9 pagine | ❓ nessun CAD; disegni quotati nelle schede PDF | **200** (gem-ita.com); alcune richieste chiuse con «curl: (35) Recv failure: Connection reset by peer», riuscite riprovando piano |
| **FAER** (Roma) | P58S II, P58F II (anche BT), P60F II, P68F III, P70F III, P80F; storici P35F, P46F, P56F (solo nomi, GT) | 5 schede + catalogo «Technical data 12» + pagine | ❓ nessun CAD; disegni quotati nelle schede PDF; modulo di selezione «Datasheet.pdf» | **200** (www.faer.net) |
| **Italian Top Gears (ITG)** (Borzano di Albinea RE) | ITG 075, ITG 090, ITG 125, ITG 127 (serie 130), ITG 134, ITG 160 | nessuno (sito bloccato) | ❓ | **bloccato**: curl «(35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL» / «Recv failure: Connection reset by peer»; WebFetch «EGRESS_BLOCKED» |
| **GEAT Elevators** (Napoli) | nessuno proprio: **distributore** (cap. 12 § 1) di Sassi, Montanari, FAER e SICOR | categoria argani | — | **200** (lento, ~25 s) |
| **Uberlift** | ❓ nessuna macchina descritta: telai universali, freni «RR1» e pulegge per argani «Uberlift e GEM» (DO) | pagine Donati | ❓ | uberlift.com: curl «Connection reset by peer», WebFetch «EGRESS_BLOCKED» |
| **Volpi** (storico) | VS30, VS40, VS50, VS60, VS70, VR42, VR65 (solo nomi: kit contatti freno su TC) | — | ❓ | — |

Nessun altro costruttore di argani a riduttore venduti in Italia è emerso: Donati elenca solo SICOR, Sassi,
Montanari, GEM e Uberlift (DO); GEAT vende Sassi, Montanari, FAER e SICOR (GT); Telcal aggiunge solo i
ricambi Volpi (TC). Le ricerche in italiano e in inglese («argano a riduttore ascensore», «geared traction
machine», cataloghi, CAD) hanno dato solo ITG come costruttore nuovo; i nomi esteri incontrati (es. Torin)
compaiono come gearless ⚠️ (estratti di ricerca).

## 2. SICOR

### 2.1 Dati di gamma (modelli attuali)

Condizioni delle tabelle portate SICOR: macchina in alto, contrappeso 50 %, rendimento dell'impianto 0,80,
portate **comprensive del peso delle funi** ✅ (SC-B p.11). Il carico statico è «sull'albero lento, CSW =
avvolgimento singolo convenzionale», 100 % in tutte le direzioni ✅ (SC-B p.10); ESW = «extended single
wrap» (brevettato) ✅ (SC-B p.25). Sigle delle versioni ✅ (SC-B p.6): **B = SSB, freno sull'albero lento;
TS = terzo supporto; LS = albero lungo; T = tamburo**.

| Modello | Rapporti | Ø pulegge (mm) | Carico statico max | Portata max 1:1 (kg) | Vel. cabina sincr. 50 / 60 Hz (m/s) | Potenza 50 / 60 Hz (kW) | Massa (kg) | Olio (l) |
|---|---|---|---|---|---|---|---|---|
| SV110 | 1/55 · 1/43 ✅ SC-B p.10 | 480 · 520 · 600 ✅ SC-B p.9 | 19,6 kN – 2000 kg ✅ p.9 | 450 ✅ p.9 | 0,27–1,10 / 0,27–1,32 ✅ p.9 | 3,6–5,5 / 4–6 ✅ p.6 (4 poli VVVF 4–5,5; 6 poli 3,6) | 160 ✅ p.10 | 2 ✅ p.10 |
| SH110B | 1/55 · 1/43 · 2/43 · 2/55 ✅ p.18 | 320 · 360 · 400 · 450 · 480 · 520 · 550 · 600 ✅ p.9 | 20,6 kN – 2100 kg ✅ p.9 | 400 ✅ p.9 | 0,30–2,19 / 0,37–2,63 ✅ p.9 | 2,7–5,5 / 4–6 ✅ p.6 | 200 ✅ p.18 (200–210 ✅ SC-W sh110-ssb) | 2,9 ✅ p.18 (2,8 ✅ SC-W sh110-ssb) |
| MR12C | 1/55 · 1/43 · 2/43 · 2/55 ✅ p.25; **le tabelle portate usano 1/52 · 1/45 · 1/43 · 2/53 · 2/43** ✅ p.26–27 (= SC-W) ⚠️ conflitto | 340 · 400 · 450 · 480 · 550 · 600 ✅ p.25, p.29 (a p.9: 340 · 420 · 440 · 480 · 550 · 600 ⚠️) | 25,5 kN – 2600 kg ✅ p.25 | 550 ✅ p.9 | 0,34–2,19 / 0,62–2,63 ✅ p.9 | 2,7–6,7 / 4–6 ✅ p.6 | 240 ✅ p.25 | 3,8 ✅ p.25 |
| SH130 | 1/52 · 1/45 · 1/43 · 1/37 · 2/43 ✅ p.35; **tabelle portate e SC-W anche 2/53 · 3/47** ✅ p.36–37 ⚠️ conflitto | 320 · 360 · 400 · 450 · 480 · 520 · 550 · 600 · 650 · 700 ✅ p.9 | 25,5 kN – 2600 kg ✅ p.35; con puleggia E 90 (Ø480–550): 23,5 kN – 2400 kg ✅ p.35 | 550 ✅ p.9 | 0,32–3,51 / 0,39–4,21 ✅ p.9 | 2,7–7,5 / 4–8,2 ✅ p.6 | 250 ✅ p.35 (250–260 ✅ SC-W) | 3,7 ✅ p.35 |
| SH130G | 1/52 · 1/43 · 1/37 ✅ p.43 | 480 · 520 · 550 · 600 ✅ p.9 | 28,4 kN – 2900 kg ✅ p.9, p.43 (28,5 kN ✅ p.6 e SC-W) | 630 ✅ p.9 | 0,72–1,27 / 0,87–1,53 ✅ p.9 | 5,5–7,5 / 6–8,2 ✅ p.6 | 250 ✅ p.43 | 3,7 ✅ p.43 (4,2 ✅ SC-W) |
| SH140 | 1/71 · 1/59 · 1/52 · 1/45 · 1/37 · 2/71 · 2/53 · 3/47 ✅ p.49 | 360 · 400 · 450 · 480 · 520 · 560 · 600 ✅ p.9 | 32,4 kN – 3300 kg ✅ p.49 | 875 ✅ p.9 | 0,25–3,01 / 0,31–3,61 ✅ p.9 | 2,7–11 / 4–12 ✅ p.6 (2,6–11 ✅ SC-W) | 280 ✅ p.49 | 3,6 ✅ p.49 |
| SH160 | 1/55 · 1/43 · 1/35 · 2/53 · 2/43 · 3/41 ✅ p.61 | 450 · 520 · 560 · 600 · 650 · 700 ✅ p.9 | 42,2 kN – 4300 kg ✅ p.61 | 1250 ✅ p.9 | 0,43–4,02 / 0,51–4,83 ✅ p.9 | 5,1–20 / 5,5–18 ✅ p.6 | 450 ✅ p.61 (450–470 ✅ SC-W) | 9 ✅ p.61 |
| SH190 | 1/40 · 1/51 · 1/62 · 2/59 · 3/47 ✅ p.73 | 520 · 600 · 650 · 690 · 750 ✅ p.9 | 51 kN – 5200 kg ✅ p.73 | 1800 ✅ p.9 | 0,44–3,76 / 0,53–4,51 ✅ p.9 | 4,2–30 / 4,7–33 ✅ p.6 | 620 ✅ p.73 (620–645 ✅ SC-W) | 11,5 ✅ p.73 |
| MR21 | 1/62 · 1/51 · 1/40 · 2/63 · 2/51 · 3/47 ✅ p.82 | 520 · 600 · 650 · 690 · 750 ✅ p.9 | 55 kN – 5600 kg; **TS 72,6 kN – 7400 kg** ✅ p.82 | 2000 ✅ p.9 | 0,44–3,76 / 0,53–4,51 ✅ p.9 | 7,5–30 / 8,2–33 ✅ p.6 | 770–1000 ✅ p.82 | 7,8 ✅ p.82 |
| MR26 | 1/72 · 1/57 · 1/44 · 2/63 · 2/45 · 3/55 ✅ p.92 | 560 (solo ESW) · 600 · 650 · 690 · 750 · 800 ✅ p.9, p.92 | 64,7 kN – 6600 kg; **TS 80,2 kN – 8175 kg**; ESW 560: 59 kN – 6000 kg ✅ p.92 | 3000 ✅ p.9 | 0,41–3,43 / 0,49–4,11 ✅ p.9 | 11–43 / 11–47 ✅ p.6 (4 poli VVVF 13,5–43; 33 Hz 11–29 ✅ p.92) | 1200–1600 ✅ p.92 | 10,8 ✅ p.92 |
| MR35 | 1/58 · 1/53 · 2/73 · 2/60 · 3/70 · 3/53 ✅ p.101 | 690 · 770 · 800 · 885 ✅ p.9 | 139,3 kN – 14200 kg, componente orizzontale ≤ 70 kN ✅ p.101 | 5500 ✅ p.9 | 0,62–3,93 / 0,75–4,72 ✅ p.9 | 20–90 / 22–100 ✅ p.6 (4 poli VVVF 25–90 ✅ p.101) | 1600–1900 ✅ p.101 | 23,5 ✅ p.101 |
| SH140LS (albero lungo) | come SH140 ✅ p.9 | 360–600 ✅ p.9 | 19,6 kN – 2000 kg ✅ p.9; per ogni lunghezza dell'albero A = 500/600/725, con quota B = 150/175/200: 2000/1700/1500 kg ✅ p.59 | 875 ✅ p.9 | come SH140 ✅ p.9 | come SH140 | ❓ | ❓ |
| SH160LS (albero lungo) | come SH160 ✅ SC-W | 450–700 ✅ p.9 | 42,2 kN – 4300 kg ✅ p.9; con B = 150/175/200: 4300/3700/3200 kg ✅ p.69; albero 500–725 mm ✅ SC-W | 1250 ✅ p.9 | come SH160 ✅ p.9 | 5,1–20 / 5,5–18 ✅ SC-W | 495 ✅ SC-W | 9 ✅ SC-W |
| SH140T (**tamburo**, fuori ambito) | 1/52 ✅ p.60 | tamburo Ø400 ✅ p.9 | — | 225 (cabina max 300; 2 funi Ø8–10) ✅ p.60 | 0,60 ✅ p.60 | 5,5 ✅ p.60 | 350 ✅ p.60 | 3,6 ✅ p.60 |
| SH160T (**tamburo**, fuori ambito) | 1/43 ✅ p.70 | tamburo Ø400 ✅ p.9 | — | 400 ✅ p.9 | 0,63 ✅ p.70 | 9–11 ✅ p.70 | 550 ✅ p.70 | 9 ✅ p.70 |

**Freno (tutti i modelli).** Freno a ceppi sull'albero veloce, con elettromagnete; kit di microinterruttori
per la posizione dei ceppi «del freno dell'albero veloce»; ridondanza meccanica (EN 81-20:2020) ed
elettrica; freno sull'albero lento (SSB) a richiesta ✅ SC-B p.6. Elettromagneti ✅: SV110, SH110B, MR12C,
SH130, SH130G, SH140: 24/48/60/80/110/200 V, 106–126 W (SC-B p.10, 18, 25, 35, 43, 49); SH160 e SH190:
24–200 V, 200–238 W (p.61, 73); MR21: 48–200 V, 200–238 W (p.82); MR26: 48–205 V, 243–262 W (p.92); MR35:
48–205 V, 235–320 W (p.101). **Coppia frenante: ❓** (non pubblicata).

**Motori (esempio SV110, ✅ SC-B p.13).** 50 Hz: 4 poli VVVF 4 kW (1423 giri/min, 9,4 A, 26,8 Nm) e 5,5 kW
(1424, 12,4 A, 36,9 Nm); 6 poli VVVF 3,6 kW (962, 10,9 A). 60 Hz: 4,4 kW (1714), 6 kW (1708), 4 kW 6 poli
(1138). Servizio 60 %, 240 avviamenti/h, classe F, IP21. Le altre schede motore sono nelle pagine
«Electric motor data» di ogni modello (SC-B).

**Coppia massima in uscita e rendimento del riduttore** (righe di testata delle tabelle portate, ✅ SC-B):
SV110 680 Nm (1/55) e 700 Nm (1/43), rendimento 0,71–0,76 (p.11); SH110B 680–750 Nm, 0,71–0,76 (p.19);
SH130G 1100–1210 Nm, 0,75–0,82 (p.44); SH190 3500–3600 Nm, 0,71–0,84 (p.75, estratto parziale); MR21
3260–4060 Nm, 0,70–0,82 (p.85, estratto parziale). L'abbinamento valore ↔ rapporto ↔ motore va letto in
tabella: il testo estratto non lo conserva ⚠️.

### 2.2 Pulegge e gole (numero massimo di gole × Ø fune, passo)

Profili: gola a V con sottosquadro (VCI) o a U con sottosquadro (UCI); i valori degli angoli γ e β sono
in un grafico non estratto ❓. Tutto ✅ SC-B, pagina indicata.

| Modello | D (mm) · E (mm) | Gole × Ø fune (passo mm) |
|---|---|---|
| SV110 (p.14) | 480 · 520 · 600; E 70 | 5×8 (14); 4×9, 4×10, 4×11 (17); 3×12 (19); con 520 e 600 anche 3×13 (19) |
| SH110B (p.21) | 320 (E 76); 360–600 (E 70) | 320: 5×8; 360: 5×8, 4×9; 400: + 4×10; 450: + 4×11; 480: + 3×12; 520–600: + 3×13 (passi 14/17/19) |
| MR12C (p.29) | 340 ESW (E 116); 340 (E 76 o 100); 400–550 (E 70); 600 (E 68) | ESW 340: 6×8 (20); 340/76: 6×8 (12); 340/100: 8×8 (12); 400: 5×8 (14), 4×9, 4×10 (17); 450: + 4×11; 480: 4×11 (17), 3×12 (19); 550: da 5×8 a 3×13; 600/68: 5×8 (12), 4×9, 4×10 (16), 3×11, 3×12 (18), 3×13 (19) |
| SH130 (p.39) | 320 (E 76); 340 ESW (E 116); 360–450 (E 70); 480–550 (E 70 o 90); 600–700 (E 70) | 320: 5×8; 360: 5×8, 4×9; 400: + 4×10; 450: + 4×11; 480: + 3×12; 520–700: + 3×13 (passi 14/17/19); con E 90 (480–550) una gola in più per ogni fune (6×8 … 4×13); ESW 340: 6×8 (20) |
| SH130G (p.45) | 480–550 (E 90); 600 (E 70) | E 90: 6×8, 5×9–5×11, 4×12, 4×13; E 70: 5×8, 4×9–4×11, 3×12, 3×13 |
| SH140 (p.56) | 360–600, E 100 | 6×8 (14); 5×9–5×11 (17) oppure 6×9–6×11 (16); 4×12, 4×13 (19) da Ø480/520 |
| SH160 (p.66) | 450–700, E 115 | 7×8 (14); 6×9–6×11 (17); 5×12, 5×13 (19) da Ø520; 4×14 (22) da 560; 4×15 da 600; 4×16 da 650 |
| SH190 e MR21 (p.78, p.88) | 520 (E 176, CSW o ESW); 600–750 (E 160) | ESW 520: 7×10 (24), 6×13 (30); CSW 520: 10×10 (16), 9×11, 9×12 (18), 8×13 (19); 600–750: 9×10 (16), 8×11, 8×12 (18), 8×13 (19), 6×14, 6×15 (22); 6×16 da 650 |
| MR26 (p.98) | 560 ESW (E 236); 600–800 (E 160) | ESW 560: 8×13 (30); CSW come SH190 da Ø600, 6×16 da 650 |
| MR35 (p.106) | 690 · 800 · 885 (E 208); 770 (E 252) | E 208: 10×13 (19), 9×14–9×16 (22); E 252: 12×13 (19), 11×14–11×16 (22) |

### 2.3 Quote per disegnare la macchina

Lettura dei disegni come in C13; i numeri sono stampati nelle pagine indicate di SC-B (✅). «Ingombri» =
dal lato opposto al motore (misurato dall'asse lento) · lato motore max · altezza.

| Modello | Asse puleggia dal piano piedi | Asse vite | Ingombri (mm) | Piedi / base | Fori | P · E per Ø | Volantino (CAD) |
|---|---|---|---|---|---|---|---|
| SH110B | 162 ✅ p.18 | 272 sopra i piedi ⚠️ SH | 162 · 537 max · 549 ✅ p.18 | 317 × 196 ✅ | 4 × M20 su 205 × 150 ✅ | 187 · 70 (Ø360–600); 190 · 76 (Ø320) ✅ | Ø344 ⚠️ SH |
| MR12C | 172 = 19 + 153 ⚠️ somma di quote ✅ p.25 | 306 ⚠️ SH (MR12: 172 + 134 ✅ SC-L) | 306–348 · 542 · 555 ✅ p.25 | 290 × 230 ✅ | 4 × Ø22 su 220 × 180 ✅ | 195 · 76 e 202 · 100 (Ø340); 197 · 70 (Ø400–550); 232 · 68 (Ø600); ESW 340: 210 · 116 ✅ | Ø340 ⚠️ SH |
| SH130 | 166 ✅ p.35 | 300 ⚠️ SH | 166 · 583 max · 577 ✅ | 331 × 224 ✅ | 4 × M20 su 220 × 180 ✅ | 195 · 76 (Ø320); 192 · 70 (Ø360–700); 197 · 90 (Ø480–550, E 90); ESW 340: 205 · 116 ✅ | Ø344 ⚠️ SH |
| SH130G | 166 ✅ p.43 | 300 ⚠️ SH | 166 · 583 max · 584 ✅ | 331 × 224 ✅ | 4 × M20 su 220 × 180 ✅ | 197 · 90 (Ø480–550); 192 · 70 (Ø600) ✅ | Ø378 ⚠️ SH |
| SH140 | 166 ✅ p.49 | 300 ⚠️ SH | 166 · 583 max · 584 ✅ | 320 × 246 ✅ | 4 × M20 su 220 × 200 ✅ | 210 · 100 (Ø360–600) ✅ | Ø378 ⚠️ SH |
| SH160 | 225 ✅ p.61 | 400 ⚠️ SH | 257 · 768 max · 733 ✅ | 225 a sinistra dell'asse · larghezza 316 ✅ (sign. ⚠️) | 4 × M24 su 235 × 260 ✅ | 248,5 · 115 (Ø450–700) ✅ | Ø478 ⚠️ SH |
| SH190 | 209 ✅ p.73 | 399 ⚠️ SH | 289 · 769 max · 732 ✅ | 490 × 362 (490 = 380 + 2 × 55 ⚠️) | 4 × M24 su 380 × 230 ✅ | 279 · 176 (Ø520); 271 · 160 (Ø600–750) ✅ | Ø478 ⚠️ SH |
| MR21 | 475 ✅ p.82 | 260 (vite **sotto** la ruota) ✅ | 317 · 525 + 691 max · 727 ✅ | base 750 × 400 ✅ | 8 × Ø24 su ±145/±190 × 330, più 2 × M20 ✅ | 290 · 176 (Ø520 CSW); 290 · 160 (Ø600–750); ESW 520: 303 · 176 ✅ | Ø428 ⚠️ SH |
| MR26 | 540 ✅ p.92 | 280 ✅ | 387 · 575 + 835 max · 827 ✅ | base 845 × 420 ✅ | 8 × Ø24 su ±180/±230 × 350, più 2 × M20 ✅ | 330 · 160 (Ø600–800); ESW 560: 347 · 236 ✅ | Ø430 ⚠️ SH |
| MR35 | 685 = 350 + 335 ⚠️ somma | 350 ✅ p.101 | 443 · 700 + 1025 max · 1062 ✅ | base 600 × 861 con supporto esterno ✅ | 6 × Ø28 su 480 (lungo la vite), più 2 × M24 ✅ | 275 · 208 (Ø690, 800, 885); 275 · 252 (Ø770) ✅; rinvio non sul lato freno ✅ | Ø428 ⚠️ SH |

Le SH e la MR12C hanno la puleggia **a sbalzo accanto alla cassa e sotto il piano dei piedi**: si montano su
un telaio rialzato (C13). Telai SICOR ✅: per SV110 XTE0456 (49 kg, senza rinvio) e XTE0516/XTE0517 (163/153
kg, con rinvio Dt 520 o 400–450; per D 480/520/600: X 140/120/80, L max 940/960/1000; per Dt 400/450/520: A
994/994/1014, B 280/280/300, C 674/674/694) SC-B p.15–16; per SH110B e SH140 tabelle analoghe in C13.

### 2.4 SV110 in dettaglio (nessun CAD: l'unico modello da disegnare con la sola scheda)

Disegno della scheda SC-S SV110 p.2 = SC-B p.10. La scala del disegno è stata verificata sulle quote 144,
591, 150, 200, 205 e 261 (scarto ≤ 1 %): le misure «in scala» sono ⚠️.

| Grandezza | Valore | Marcatore e fonte |
|---|---|---|
| Montaggio | solo verticale, motore e vite in alto | ✅ SC-B p.10 |
| Asse puleggia dal piano dei piedi | 144 | ✅ SC-B p.10 |
| Altezza totale | 591 (il manuale MUM0335 rev. 01 dà 589) | ✅ SC-B p.10 · ✅ SC-M p.12 |
| Dall'asse lento alla sommità | 447 | ✅ SC-B p.10 |
| Vista lungo l'asse lento: lunghezza totale | 445 | ✅ SC-B p.10 |
| … di cui dall'asse lento verso il lato del disco / verso la leva di sblocco freno | ≈ 278 / ≈ 169 | ⚠️ in scala |
| Vista di fianco: dal piano della vite all'estremità dell'albero lento (lato puleggia) | 261 | ✅ SC-B p.10 |
| Vista di fianco: dal piano della vite al lato opposto | 172 | ✅ SC-B p.10 |
| P · E | 187 · 70 (Ø480, 520, 600) | ✅ SC-B p.10 |
| Base: larghezza lungo l'asse lento | 200 | ✅ SC-B p.10 |
| Fori | 4 × M20, interasse 150 lungo l'asse lento × 205 in direzione perpendicolare | ✅ SC-B p.10 |
| Posizione dei fori | simmetrici rispetto al piano della vite (150) e all'asse lento (205) | ⚠️ dal disegno |
| Asse della vite (verticale) dall'asse lento | ≈ 110 (verso il lato del disco) | ⚠️ in scala |
| Disco in sommità (volano/volantino, coassiale alla vite) | Ø ≈ 335, spessore ≈ 28, con codolo dell'albero sopra | ⚠️ in scala (sign. ⚠️) |
| Elementi tra cassa e disco | motore (con scatola morsetti sul lato opposto alla puleggia), poi freno a ceppi con elettromagnete | ⚠️ dal disegno |
| Freno | elettromagnete 24/48/60/80/110/200 V, 126/110/106/120/112/126 W | ✅ SC-B p.10 |
| Telaio | XTE0456, 49 kg con antivibranti | ✅ SC-B p.15 |
| CAD | nessuno ZIP sulla pagina SV110 (solo scheda, manuale, brochure) | ✅ SC-W sv110 |

### 2.5 Versioni

| Versione | Modelli | Dati | Fonte |
|---|---|---|---|
| SSB (B), freno sull'albero lento | SH110, SH130, SH130G, SH140, SH160, SH190, MR21, MR26 | stessi dati del modello base; ZIP propri (§ 2.7) | ✅ SC-W, SC-B p.110 |
| TS, terzo supporto | MR21, MR26 | statico MR21TS 7400 kg, MR26TS 8175 kg; CAD MR21TS e MR26TSB | ✅ SC-B p.82, p.92 · ✅ SC-Z |
| LS, albero lungo | SH140LS, SH160LS (CAD SH140LS nello ZIP SH140; SH160LS e telaio «SH160LSB_600_175_CONTELAIO.dxf») | tabelle A/B/C e statici in § 2.1 | ✅ SC-B p.59, p.69 · ✅ SC-Z |
| T, tamburo | SH140T, SH160T (fuori ambito) | § 2.1 | ✅ SC-B p.60, p.70 |
| ESW, avvolgimento esteso (brevettato) | MR12C 340, SH130 340, SH190 e MR21 520, MR26 560 | P · E e statici in §§ 2.1–2.3 | ✅ SC-B |

### 2.6 Modelli storici, ancora presenti negli impianti

| Modello | Dati | Fonte |
|---|---|---|
| SH110 (prima della B) | CAD ancora pubblicato: cartella «sh110» nello ZIP SH110B (14 DWG + 14 STEP) | ✅ SC-Z |
| SH130B, SH140B, MR21B | CAD nelle cartelle «sh130b», «sh140b», «mr21b» degli ZIP SH130, SH140, MR21; significato di «B» qui ❓ | ✅ SC-Z |
| SH110TSB | 1500 giri/min, 4 kW (5,5 HP), rapporto 1/55, con supporto puleggia, mano destra (articolo di magazzino) | ✅ GT (rivenditore) |
| MR12 | asse lento 172 (19 + 153), vite 134 più in alto, altezza 601; «4 × d.22» | ✅ SC-L (immagine della pagina) |
| MR14, MR16, MR17 | manuali su ManualsLib (MR14 1372375, MR16 1378386, MR17 1454060 e 1713579); dati MR16/MR17 solo da rivenditori | ✅ esistenza · ⚠️ dati in cap. 12 § 2.6 |
| MR10, MR13 | solo nomi (compatibilità pulegge di ricambio) | ⚠️ cap. 12 § 2.6 |

### 2.7 CAD SICOR scaricabili (senza login, HTTP 200)

Ogni ZIP contiene «DWG - 2D» (DWG, a volte DXF) e «STEP - 3D», per mano DX/SX e diametro. Indice letto
con richieste a intervalli, **senza scaricare gli ZIP** (✅ SC-Z):

| ZIP | Dimensione | Contenuto |
|---|---|---|
| …/_pda/2025/03/SH110B.zip | 315 MB | 15 DWG + 15 STEP SH110B; 14 + 14 SH110 (storico) |
| …/_pda/2024/02/SH110SSB.zip | 153 MB | 16 DWG + 16 STEP |
| …/_pda/2024/02/MR12C.zip | 12,7 MB | MR12C_SX_340.dwg, MR12C_550.dwg, MR12C.stp, MR12C-SX-400.stp |
| …/_pda/2024/02/SH130.zip | 397 MB | 26 + 26 SH130; 26 + 26 SH130B |
| …/_pda/2024/02/SH130SSB.zip | 198 MB | 26 + 26 (anche per SH130G SSB) |
| …/_pda/2024/02/SH130G.zip | 17,7 MB | 2 DWG + 1 DXF; 3 STEP (DX/SX 650, SX 550) |
| …/_pda/2024/02/SH140.zip | 278 MB | 15 + 14 SH140; 14 + 14 SH140B; 1 + 1 SH140LS |
| …/_pda/2024/02/SH140SSB.zip | 155 MB | 14 + 14 |
| …/_pda/2024/02/SH140T.zip | 48,5 MB | 4 DWG + 4 STEP (DX/SX, H/V) |
| …/_pda/2024/02/SH160.zip | 74,4 MB | 5 DWG + 8 STEP SH160; 2 + 1 SH160LS |
| …/_pda/2024/02/SH160SSB.zip | 1,1 MB | 1 DWG (SX 520) |
| …/_pda/2024/02/SH160T.zip | 1,5 MB | 1 DWG |
| …/_pda/2024/02/SH160LS.zip | 8,4 MB | SH160LS.dwg, telaio .dxf, SH160LS.stp |
| …/_pda/2024/03/SH190.zip | 132 MB | 10 + 10 |
| …/_pda/2024/03/SH190SSB.zip | 6,8 MB | 1 STEP (SX 600) |
| …/_pda/2024/03/MR21.zip | 106 MB | 10 + 10 MR21; 10 + 10 MR21B; 1 + 2 MR21TS |
| …/_pda/2024/03/MR21SSB.zip | 48 MB | 10 + 10 |
| …/_pda/2024/03/MR26.zip | 136 MB | 12 + 12 |
| …/_pda/2024/03/MR26SSB.zip | 68 MB | 2 DXF + 2 STEP MR26SSB; 12 + 12 MR26TSB |
| …/_pda/2024/03/MR35.zip | 24,5 MB | 3 DWG + 4 STEP |
| SV110 | — | **nessuno ZIP** |

## 3. Alberto Sassi

### 3.1 Dati di gamma (catalogo REV 2022/03, ✅ SA-C)

Ipotesi delle tabelle Sassi ✅ (SA-C p.3): rendimento del vano 0,8; vita 30 000 h a 8 h/giorno con lo
spettro di carico dichiarato. Le velocità sono **della puleggia**; le potenze sono «kW SYNC». Le tabelle
del catalogo danno la **differenza di tiro** (kg) per rapporto, Ø e potenza, non la portata.

| Modello | Carico statico max | Rapporti | Potenze 4/16 poli · VVVF 4 poli (kW sync) | Inerzia J (kg·m²) | Massa (kg) e cosa include | Olio | Portata 1:1 / 2:1 (kg) | Fonte |
|---|---|---|---|---|---|---|---|---|
| New MODY | 2300 ✅ | 1/37 · 1/49 · 1/60 · 2/47 · 3/41 ✅ | 3,5–5,5 · 2,2–6,6 ✅ | AC2 0,460–0,475; VVVF 0,190 ✅ | 158 (3,5–4,0 kW) · 163 (4,9) · 169 (5,5); VVVF 158 (2,2–5,9) · 163 (6,6); **senza volano e puleggia** ✅ | a vita ✅ | 480 / 630 ⚠️ SA-12 | SA-C p.12 |
| LEO | 3000 ✅ | 1/71 · 1/55 · 1/45 · 2/71 · 2/57 · 3/47 ✅ | 3,5–5,5 · 3,3–11 ✅ | AC2 0,371–0,488; VVVF 0,046–0,171 ✅ | 202 / 210 / 218 (4/16: 3,5–4,0 / 4,9 / 5,5 kW); VVVF 181 / 186 / 192 (3,3–5,9 / 6,3–7,3 / 7,7–11 kW); **senza puleggia** ✅ | a vita ✅ | 630 / 1000 ⚠️ SA-12 | SA-C p.19 |
| TORO | 4200 ✅ | 1/61 · 1/49 · 1/39 · 2/53 · 3/47 ✅ | 3,5–11 · 3,3–20,6 ✅ | 0,026 ✅ | da 246 (3,5–4,0 kW) a 299 (11 kW; VVVF 18–20,6); senza volano e puleggia ✅ | a vita ✅ | 1000 / 2000 ⚠️ SA-12 | SA-C p.26 |
| MF48 | 3100 ✅ | 1/60 · 1/47 · 2/71 · 3/56 ✅ | 3,5–7,3 · 3,3–11,4 ✅ | 0,011 ✅ | 245–268 (4/16 3,5–7,3; VVVF 3,3–11,4), senza volano e puleggia ✅ | 3,8 l ✅ | 630 / 1000 ⚠️ SA-12 | SA-C p.38 |
| MF84 | 6000 ✅ | 1/65 · 1/48 · 1/39 · 2/53 · 2/39 · 3/47 ✅ | 6,0–20,6 · 5,9–27,9 ✅ | 0,050 ✅ | VVVF 354 (5,9 kW) … 454 (25,1–27,9); 4/16 378 (6,0–7,3) … 454 (16,2–20,6); senza volano e puleggia ✅ (abbinamento 4/16 a 9,2 e 11 kW ⚠️ testo rimescolato) | a vita ✅ | 1600 / 3000 ⚠️ SA-12 | SA-C p.44 |
| MF94 | 8000 ✅ | 1/65 · 1/53 · 2/71 · 2/53 · 4/67 ✅ | 13,6–20,6 · 11–27,9 ✅ | 0,050 ✅ | 529 (VVVF 11 kW) … 623 (20,6 / 27,9 kW), senza volano e puleggia ✅ | 9 l ✅ | 2500 / 4000 ⚠️ SA-12 | SA-C p.51 |
| MB94 | 8000 ✅ | 1/65 · 1/53 · 2/71 · 2/53 · 4/67 ✅ | 13,6–40,4 · 11–40,4 ✅ | 0,22 ✅ | 534 **senza motore, volano e puleggia** ✅ | 9 l ✅ | ❓ | SA-C p.53 |
| MB95 | 12000 ✅ | 1/53 · 1/48 · 2/80 · 2/64 · 3/80 · 3/66 · 3/50 ✅ | 17,6–50,7 · 14,7–50,7 ✅ | 2,1 ✅ | 980 senza motore, volano e puleggia ✅ | 20 l ✅ | 3000 / 5000 / 10000 (sosp. n.d.) ⚠️ SA-12 | SA-C p.59 |
| MB108 | 15000 ✅ | 1/64 · 1/48 · 2/71 · 2/57 · 3/68 · 4/59 ✅ | 25,7–91,9 · 25,7–91,9 ✅ | 1,25 ✅ | 1405 senza motore, volano e puleggia ✅ | 18 l ✅ | 5000 / 10000 / 15000 (sosp. n.d.) ⚠️ SA-12 | SA-C p.64 |

**Velocità della puleggia (MODY, ✅ SA-C p.17–18):** 0,42–3,45 m/s a 1500 giri/min con Ø320–600 e rapporti
da 1/60 a 3/41. Il sito dava 0,23–3,68 m/s ⚠️ SA-12, senza le condizioni.

**Definizione del carico statico (✅ SA-C p.5)** — il dato che il cap. 8.1 chiede: Cs = (Q + F + G)/n + S +
S1/n [kg], con Q portata, F cabina, G contrappeso, S funi (sbilanciate), S1 catena di compensazione, n
coefficiente di taglia (1…7). È quindi la somma delle masse sospese riportate all'albero, **senza
coefficienti dinamici e senza il peso della puleggia**. La differenza di tiro è T = (Q/(2n) + S − S1/n)/η
se G = F + Q/2, e T = ((Q + F − G)/n + S − S1/n)/η se G < F + Q/2; η dalla tabella dei rinvii: con cuscinetti a
sfere 0,99 · 0,98 · 0,97 · 0,96 · 0,95 · 0,94 · 0,93 per 1…7 pulegge, con bronzine 0,96 · 0,92 · 0,88 ·
0,85 · 0,81 · 0,78 · 0,75.

**Freni.** Freno di emergenza sull'albero lento: MODY (DFA1/DFA2), LEO (DF03, DFA1, DFA2), TORO, MF48 (DF03),
MF84 ✅ SA-C p.14, p.21, p.39, p.69 (tabella accessori: disponibile a richiesta per MODY, LEO, MF48, TORO,
MF84; non per MF94 e MB). TORO e MF84 con freno a tamburo; MF84 con motore 330 anche «Warner brake 5800» ✅
SA-C p.27, p.45. **Coppia frenante: ❓.**

**Motori VVVF 4 poli 400 V 50 Hz di serie (✅ SA-C p.70):** da 4,0 kW (1420 giri/min, 25,5 Nm, 9,0 A, J rotore
0,067) a 27,9 kW (1483 giri/min, 178 Nm, 61 A, J 0,302), con il campo d'impiego per modello.

### 3.2 Pulegge e volani

| Modello | Pulegge | Gole e funi | Volani | Fonte |
|---|---|---|---|---|
| MODY | Ø320–600, larghezza 80 ✅ | fune 8: Ø ≥ 320, 3–4 gole passo 17 o 5 gole passo 14 (19 kg); 9: Ø ≥ 360 (21 kg); 10: Ø ≥ 400, fino a 4 gole (24 kg); 11: Ø ≥ 450 (28 kg); 12: Ø ≥ 480 (30 kg); 13: Ø ≥ 520, 3 gole passo 20 (33 kg); 14: Ø ≥ 560 (36 kg); 15: Ø ≥ 600, passo 21 (39 kg) ✅ | 400-32 P (Ø400 × 32, plastica, 1,0 kg) · 328-43 MF (Ø328 × 43, 7,63 kg) · 382-24 MC (10,5 kg) · 400-26 MC (13,0 kg); J 0,025–0,375 ✅ | SA-C p.15 |
| LEO | Ø320–700, larghezza 90 ✅ | 8: Ø ≥ 320, fino a 6 gole (24 kg); 8–9: Ø ≥ 360 (26,5); 10: Ø ≥ 400, fino a 5 (28,8); 11: 450 (33,2); 12: 480 (34,6); 13: 520, fino a 4, passo 20 (37,9); 14: 560 (40,8); 15: 600, passo 21 (42); 16: 650 (45) e 700 (48) ✅ | 260-15 A (alluminio, 2,7 kg) · 350-28 P (0,8 kg) · 350-35 (16 kg) · 350-43 (19 kg) · 350-50 (20,7 kg) ✅ | SA-C p.22 |
| TORO | Ø320–700, larghezza 80–115 ✅ | ❓ (tabella non estratta) | Ø400 ✅ | SA-C p.27 |
| MF48, MF84, MF94, MB94, MB95 | Dp 450 · 480 · 520 · 560 · 600 · 650 · 700 · 750 · 800 (De = Dp + 4 mm); larghezza L 80, 115 o 180 secondo il numero di gole (2–3, 4, 5, 6, 7–8) e il Ø delle funi ✅ | funi 8–12 passo 17, 13–14 passo 20, 15–16 passo 21; masse da 24 kg (Dp 450, L 80) a 135 kg (Dp 800, L 180) ✅ | MF: tabelle a p.6; MF84 D 400 (VVVF) / 460 (AC2) ✅ | SA-C p.4, p.45 |
| MB108 | Ø520–800 ✅ | ❓ | ❓ | SA-C p.65 |

### 3.3 Quote per disegnare la macchina (✅ SA-C, pagina indicata; significato delle quote letto sul disegno)

| Modello | Asse lento dal piano piedi | Vite rispetto all'asse lento | Ingombri | Fori e piedi | Puleggia (P, E) | Volano | Note |
|---|---|---|---|---|---|---|---|
| MODY orizzontale dx (p.13) | 170 ✅ | 110 **sotto** ✅ | L 660 = 160 (lato opposto) + 500 (lato volano) dall'asse lento ✅ (somma ⚠️); W 420 (faccia esterna puleggia → bordo volano) ✅; H 595 = 391 (pomello leva sopra la vite) + 204 (sotto la vite) ✅ | 4 × M16×35 su 205 (lungo la vite, simmetrici all'asse lento; primo foro a 57,5 dall'estremità) × 150 (simmetrici alla vite) ✅; motore 74 sotto il piano dei piedi ✅ (sign. ⚠️) | faccia esterna 220 e piano medio 180 dal piano della vite; E 80 ✅ | Ø400 coassiale alla vite ✅ | cassa larga 230 (115 + 115) ✅ |
| MODY orizzontale sx (p.13) | 150 ✅ (sign. ⚠️) | 110 ✅ | L 660; H 651 ✅ | 4 × M16×35 su 205 (57,5; 245) ✅ | E 80 ✅ | Ø400 ✅ | — |
| MODY verticale (p.13) | 160 ✅ | vite verticale a 110 dall'asse lento ✅ | H 660; 391 + 204 orizzontali ✅ | 4 × M16×35 su 205 × 150; base 150 + 170 dall'asse lento ✅ (sign. ⚠️) | Ø ≥ 400 per funi verso l'alto ✅ | Ø400 ✅ | — |
| LEO orizzontale dx (p.20) | 220 ✅ | asse della vite inclinato ⚠️ | da −230 (70 + 160) a +720…735 dall'asse lento ✅ (somma ⚠️); H 530 ✅; pianta 360 ✅ | 4 × M16×35 su 205 =•= (lungo) e piedi 260; flangia laterale con 2 × M16; 2 asole Ø20 ✅ | E 90; P ≈ 185 ✅ (sign. ⚠️) | Ø350 ✅ | verticale: H 910 (717) ✅ |
| TORO (p.27, con freno a tamburo; tra parentesi motore 270) | 195 ✅ (sign. ⚠️) | inclinata ⚠️ | pianta L 870 (895); H 615 (650) sx, 620 (670) dx; verticale H 870 (895) ✅ | 4 × M24 passanti su 240 × 240; piedi 310 × 290 ✅ | E 80–115; Ø320–700 ✅ | Ø400 ✅ | — |
| MF48 (p.39, con freno DF03) | 170 ✅ | 140 sopra ✅ | H 700; W 690 (386 + 220 … sign. ⚠️); vista lungo l'asse 600 / 410 / 205 ✅ (sign. ⚠️); verticale H 800, asse lento 200 dalla base ✅ (sign. ⚠️) | 6 × Ø25 passanti: 4 a ±80 e ±165, 2 a ±165, file a 230 =•= ✅; piedi 330 / 380 ✅ (sign. ⚠️) | E 80–115; Ø400–700 ✅ | ❓ | — |
| MF84, motore 240/270 (p.45) | 200 ✅ | 190 sopra ✅ | A 630/660 (asse lento → lato volano); 260 + 40 encoder (lato opposto); H = C 780/820 ✅ | 4 × M24 passanti su 400 × 245; piedi 500 × 300 ✅ | E 115–180; Ø450–800 ✅ | D 400 (VVVF) / 460 (AC2) ✅ | con motore 330 e freno Warner 5800: L 1080 (820 + 250), H 935 ✅ |
| MF94/240-270 (p.52; tra parentesi motore 270) | 260 ✅ | 248 sopra ✅ | 676 (705) lato volano + 440 lato encoder; H 905 (950) ✅ | 4 × Ø25 passanti su 280 × 240; supporto esterno 2 × Ø25 a 120 =•= ✅ | P 310 ✅ (sign. ⚠️); E 80–180; Ø450–800 ✅ | Ø400–460 ✅ | MF94/330: 860 + 440, H 1060 ✅ |
| MB94 (p.54) | 260 ✅ | 248 sopra ✅ | L 1540, H 985; motore su mensola con piede M20 a 930 dall'asse lento ✅ | 4 × Ø25 passanti su 280 × 240; supporto 2 × Ø25 (120) ✅ | E 80–180; Ø450–800 ✅ | ❓ | — |
| MB95 (p.60) | 315 ✅ | 259 sopra ✅ | L 1650 (400 + 580 + 670); H 1180; W 1018 ✅ | 8 × Ø25 passanti (cassa) + 4 × Ø25 (supporto); 340 =•=, 490, 110 ✅ | E 115–180; Ø450–800 ✅ | ❓ | motore su mensola con piede M20 ✅ |
| MB108 (p.65) | 737 = 333 + 404 dalla base del piedistallo ⚠️ somma | 323 sopra ✅ | L 1872 = 500 + 390 + 982 ⚠️ somma; H 1635 ✅ | 5 × Ø30 + 3 × Ø30 passanti; 1000 / 870 / 630 / 320 / 180 ✅ (sign. ⚠️) | Ø520–800 ✅ | ❓ | — |

Varianti con supporto esterno, alberi allungati (LEO: tabelle a, b, statico 1150–3000 kg per lunghezza) e
attacco encoder sono alle pagine 14, 21, 25, 28, 46 di SA-C ✅.

### 3.4 Disegni e CAD Sassi

- Disegni quotati: nel catalogo SA-C (PDF) ✅; disegni per modello in `sassi.it/tabelle/file/` (es.
  `mf84_dq_sx_2019_04.PDF`) ⚠️ SA-12, non raggiungibili.
- DXF e STEP: area riservata «MY SASSI», account dal commerciale ⚠️ SA-12. **Login richiesto.**
- Nomi storici: GEKO (VVVF 2,9 kW, 1500 giri/min, 1/45, con supporto puleggia; marchio Sassi dedotto
  dall'elenco GEAT ⚠️ GT), RF18 (pulegge di ricambio su DO) ✅ nome.

## 4. Montanari Giulio & C.

Sito bloccato da qui (§ 1): **nessun documento Montanari letto oggi** oltre alla brochure generale 2015 e
alle pagine di un rivenditore. I dati di modello vengono dagli estratti di ricerca del cap. 12 (MO-12),
quindi **tutti ⚠️**; varianti: H = alto carico statico senza supporto, S = con supporto, AL = albero lungo,
B = freno sull'albero lento.

| Modello | Statico max (kg) | Rapporti | Pulegge (mm) · gole × fune | Motori (kW) | Portata max (kg) | Massa riduttore (kg) | Olio | Fonte |
|---|---|---|---|---|---|---|---|---|
| M65 | 2200 ⚠️ (✅ MO-B) | 1/63 · 1/50 · 1/46 · 1/37 · 2/46 ⚠️ | 480; 3×10, 4×10 ⚠️ | VVVF 4P 3–5,5; 6P 3–4 ⚠️ | 400 ⚠️ (✅ MO-B) | 80 ⚠️ | 2 l ⚠️ | MO-12, MO-B p.2 |
| M73 (H, S, AL, B) | 2200; H 2700; S 3200 (✅ MO-B); AL 2500 ⚠️; Donati scrive 2000 per la M73S ✅ MO-D (conflitto) | 1/75 · 1/60 · 1/52 · 1/46 · 1/37 · 2/55 · 2/37 ⚠️ (1/75, 1/60, 1/52, 1/46 ✅ MO-D) | 480 (5×10); 700 (rivenditore) ⚠️ | 4P 3–5,5; 6P 3–4 ⚠️ | 480 ⚠️ (✅ MO-B) | 110; S 115; AL 145 ⚠️ (110 ✅ MO-D) | 2,8 l ⚠️ (✅ MO-D) | MO-12, MO-B, MO-D |
| M75 (H, S) | 2000; H 2700; S 3200 ⚠️ | 1/52 · 1/50 · 1/37 · 2/55 · 2/37 ⚠️ | 480, 6×10 ⚠️ | 4P 3–7,5 ⚠️ | 630 ⚠️ | 115; S 120 ⚠️ | 2,8 l ⚠️ | MO-12 |
| M83 (AL, B), M85 | 3200; AL 3000; M85 4000 ⚠️ | 1/69 · 1/60 · 1/50 · 1/43 · 1/37 · 2/42 · 2/50 ⚠️ | 480 (5×11), 520 (5×10) ⚠️ | 4P 3–11; 6P 3–7,5 ⚠️ | 800 ⚠️ | 169; AL 199; M85 181 ⚠️ | 4,5 l ⚠️ | MO-12 |
| PENTA (verticale, roomless) | 3000 ⚠️ (✅ MO-B) | 1/55 · 1/43 · 1/46 · 1/37 · 2/71 · 2/55 · 3/47 ⚠️ | 480, 5×10 ⚠️ | 4P 3–11 ⚠️ | 630 ⚠️ (✅ MO-B) | 210 ⚠️ | 3 l ⚠️ | MO-12, MO-B p.3 |
| PENTA 830 | 3200 ⚠️ | 1/50 · 1/37 · 2/42 · 3/43 ⚠️ | 480, 5×11 ⚠️ | 9 ⚠️ | 800 ⚠️ | 180 ⚠️ | 5 l ⚠️ | MO-12 |
| M93 (AL, B), M95 | 5000; AL 3600; M95 5000 ⚠️ | 1/62 · 1/50 · 1/43 · 1/39 · 2/49 · 3/47 · 4/51 ⚠️ | 520, 6×13 ⚠️ | 4P fino a 22; 6P fino a 13 ⚠️ | 1250 ⚠️ | 250; AL 329; M95 253 ⚠️ | ❓ | MO-12 |
| M98 (H, HB, HAL) | 7000; HAL 5100 ⚠️ | 1/65 · 1/52 · 1/47 · 1/37 · 2/61 · 2/49 · 4/57 ⚠️ | 520, 580; 8×13 ⚠️ | 18,5–22 (config.) ⚠️ | 1600 (config.) ⚠️ | 480; H 402 ⚠️ | H 12 l ⚠️ | MO-12 |
| M105 (B) | 9800 ⚠️ | 1/71 · 1/65 · 1/49 · 2/63 · 2/53 · 4/67 ⚠️ | 650, 8×13 ⚠️ | 4P 11–45; 6P 7,5–30 ⚠️ | 3000 ⚠️ | 520 (motore B9) / 605 (B3); B 670/755 ⚠️ | 16,5 l ⚠️ | MO-12 |
| M109 | 15000 ⚠️ (✅ MO-B, «fino a 90 kW») | 1/64 · 1/49 · 2/55 · 3/58 ⚠️ | 650 · 700 · 750; 8×13, 8×15, 6×16 ⚠️ | 22–55 (config.) ⚠️ | «oltre 5000» ⚠️ | 890 / 940 ⚠️ | 38 l ⚠️ | MO-12, MO-B |
| M77, M87, M104 (sito India) | 2300; 3200; 12000 ⚠️ | vedi cap. 12 ⚠️ | ❓ | ❓ | 544; 888; 2500 ⚠️ | 100; 169; 780 ⚠️ | 3; 5; 16,5 l ⚠️ | MO-12 |
| M68, M71, M76 (storici) | M76: 2000 (rivenditore) ⚠️ | ❓ | ❓ | ❓ | M76: 320–480 ⚠️ | ❓ | ❓ | MO-12 |

**Freno (✅ MO-B p.3):** tutta la gamma può avere, o essere predisposta per, il dispositivo «Brake» contro la
sovravelocità in salita; nelle versioni B è sull'albero lento (MO-12 ⚠️). Elettromagnete 48/60 V sugli M73
del rivenditore ✅ MO-D. **Quote d'ingombro, asse puleggia, fori: ❓** (solo numeri senza etichetta ⚠️, cap. 12
§ 10.5). **CAD: ❓.**

## 5. GEM – General Elevator Machines (e Uberlift)

Tutti i dati ✅ dalle schede GE-S (pagine del catalogo 2019, verificate oggi) salvo dove indicato. Le
tabelle portate sono «esempi»: 50 Hz 1500 giri/min e 60 Hz 1800 giri/min; il carico statico non ha una
definizione esplicita ❓.

### 5.1 Dati

| Modello | Interasse | Statico max (kg) | Coppia max uscita | Rapporti | Potenza max | Rendimento medio | Pulegge (mm) | Freno | Olio | Massa media (kg) | Portate / velocità d'esempio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HW134 CAMEL | 134 ✅ | 2300 (2000 con Ø600) ✅ | 1094 Nm ✅ | 1/37 · 1/42 · 1/53 · 1/65 ✅ | 4,0 AC1 · 6,1 AC2 · 6,8 VVVF ✅ | 0,7 ✅ | 480 · 550 · 600 ✅ | elettromagnete 24/48/60/110/200 V, doppia azione indipendente ✅ | 3 l sintetico, a vita ✅ | 220 ✅ | 320–480 kg, 0,66–1,27 m/s (50 Hz) ✅ |
| HW134L (supporto esterno autoallineante) | 134 ✅ | 2700 (2300 con Ø600) ✅ | 1094 ✅ | come HW134 ✅ | come HW134 ✅ | 0,7 ✅ | 480 · 550 · 600 ✅ | come HW134 ✅ | 3 l ✅ | 220 ✅ | 480–630 kg, 0,70–1,27 m/s (50 e 60 Hz) ✅ |
| HW134VF (solo VVVF) | 134 ✅ | 2300 senza / 2700 con supporto ✅ | 1094 ✅ | come HW134 ✅ | 5,5 (50 Hz) · 5,8 (60 Hz) ✅ | 0,7 ✅ | 480 · 550 · 600 ✅ | come HW134 ✅ | 3 l ✅ | 160 ✅ | 320–480 kg, 0,66–1,03 m/s ✅ |
| HW134B BRAKE (freno di emergenza sull'albero lento) | — | — | **coppia frenante 780 Nm; forza 3600 N** ✅ | — | — | — | — | 103,5 V cc mantenimento / 207 V cc sovraeccitazione; 0,492/0,984 A; 210 Ω; 51/204 W; 14,3 kg; traferro 0,3 (max 0,6); ED 60 %; IP54; classe F ✅ | — | — | esempio: 480 kg, Ø550 → 777 Nm necessari ✅ |
| HW135VF | 135 ✅ | 2300 (senza supporto) ✅ | 1094 ✅ | 1/37 · 1/42 · 1/53 ✅ | 6,1 ✅ | 0,7 ✅ | 480 · 550 ✅ | 24–200 V ✅ | 2,9 l ✅ | 180 ✅ | 320–550 kg, 0,65–1,03 m/s ✅ |
| HW135L-VF | 135 ✅ | 2700 (con supporto) ✅ | 1094 ✅ | 1/37 · 1/42 ✅ | 7,6 ✅ | 0,7 ✅ | 480 · 550 ✅ | 24–200 V ✅ | 2,9 l ✅ | 210 ✅ | 480–630 kg, 0,90–1,03 m/s ✅ |
| HW140C LION | 140 ✅ | 3100 ✅ | 1470 Nm ✅ | 1/58 · 1/53 · 1/44 · 1/37 · 2/43 ✅ | 8,1 AC2 · 10,8 VVVF (50 Hz) ✅ | 0,75 ✅ | 480 · 560 · 600 ✅ | 24–200 V ✅ | 3,5 l ✅ | **260** ✅ (240 ⚠️ pagina web, cap. 12) | 630 kg, 0,71–1,53 m/s (50 e 60 Hz) ✅ |
| HW140CL LION (supporto esterno) | 140 ✅ | 3800 ✅ GE-C p.10 | 1470 ✅ | come HW140C ✅ | 11,5 (17 HP) ✅ | 0,75 ✅ | 480 · 560 · 600 ✅ | 24–200 V ✅ | 3,5 l ✅ | 240 ✅ GE-C p.10 | 630–800 kg, fino a 1,53 m/s (60 Hz) ✅ |
| HW175 ELEPHANT | **173** ✅ (il nome dice 175) | 5200 ✅ | 2480 Nm ✅ (cap. 12: 1985 Nm, 2480 attribuito a HW175C ⚠️ conflitto) | 1/54 · 1/42 · 1/36 · 2/58 · 2/44 · 3/42 ✅ | 11 AC2 · 20 VVVF (50 Hz) ✅ | 0,74 ✅ | 480 · 560 · 600 ✅ | 24–200 V ✅ | 8,5 l ✅ | 450 ✅ | 800–1000 kg, 0,70–1,57 m/s (50 e 60 Hz) ✅ (fino a 1250 kg in GE-C p.12) |

### 5.2 Quote per disegnare la macchina (✅ GE-S, disegno della scheda; significato letto sul disegno)

Tutte le HW hanno la **vite sopra la ruota**, il motore a sbalzo e il volantino sul lato opposto al motore;
la puleggia è a sbalzo, salvo le versioni L/CL con supporto esterno.

| Modello | Asse lento dal piano piedi | Vite | Lunghezza dall'asse lento (lato volantino + lato motore) | Larghezza (estremità dell'albero lento → piano medio puleggia · P · piano della vite → lato opposto) | Altezza | Piedi | Fori | E | Volantino |
|---|---|---|---|---|---|---|---|---|---|
| HW134 | 153 ✅ | +134 ✅ | 300/345 + 500 ✅ | 81 (72 con Ø600) · 191 (200 con Ø600) · 170; totale 442 ⚠️ somma | 552 ✅ | 280 × 230; spessore 25 ✅ (sign. ⚠️) | 4 × Ø21 su 224 × 184 ✅ | 72 (68 con Ø600) ✅ | Ø340 ✅ |
| HW134L | 153 ✅ | +134 ✅ | 300/345 + 500 ✅ | P 191 (200 con Ø600) = 99 (108 con Ø600, dal piano medio alla fila di fori più vicina) + 92 ✅; fila dei fori del supporto a 224 dalla stessa fila, cioè 125 oltre il piano medio ⚠️ differenza; supporto: 2 × Ø17 a 144, piastra 192, quote 43 e 65 ✅ (sign. ⚠️) | 552 ✅ | come HW134 ✅ | 4 × Ø21 su 224 (112 + 112) × 184 (92 + 92) ✅ | 72 (68) ✅ | Ø340 ✅ |
| HW134VF | 153 ✅ | +134 ✅ | totale 676 = 273 + 404 ✅ | 81 · 191 · 155 = 427 ✅ | 552 ✅ | 280 × 230 ✅ | 4 × Ø21 su 224 × 184 ✅ | 72 (68) ✅ | disco Ø310 sul lato motore ✅ (sign. ⚠️) |
| HW134B | 153 ✅ | +134 ✅ | 300/345 + 500 ✅ | 272 + 272 (con freno sull'albero lento: 81 · 191 · 156 · 116) ✅ | 562 ✅ | 280 × 230; 25 ✅ | 4 × Ø21 su 224 × 184 ✅ | 72 (68) ✅ | Ø340 ✅ |
| HW135VF | 153 ✅ | +135 ✅ | 760 max = 300 + 460/440 ✅ | 81 · 191 · 170 = 442 ✅ | 562 ✅ | 280 × 230; 25 ✅ | 4 × Ø22 su 224 × 184 ✅ | 70/80 ✅ | Ø340 ✅ |
| HW135L-VF | 153 ✅ | +135 ✅ | 300 + 460/440 ✅ | catena fori supporto → piano medio puleggia → fila fori vicina → piano vite → fila lontana: 125 · 99 · 92 · 92 ✅; P 191 ✅; supporto 2 × Ø17 a 144, piastra 192, quote 43 e 65 ✅ (sign. ⚠️) | 562 ✅ | come HW135VF ✅ | 4 × Ø22 su 224 × 184 ✅ | 70/80 ✅ | Ø340 ✅ |
| HW140C | 153 ✅ | +140 ✅ | 775–893 = 452–522 (motore) + 308 + 15–63 ✅ | 456 = 170 + 286; P 215 ✅ | 590 (553 ✅, sign. ⚠️) | 280 × 230 ✅ | 4 × Ø21 su 224 × 184 ✅ | 100 ✅ | Ø340 ✅ |
| HW140CL | 153 ✅ | +140 ✅ | — | P 215 ✅; supporto 2 × Ø17 a 160 (piastra 230), 22,5 e 74; piano medio → fori supporto 123, → fori piedi 123 ✅ | ❓ | — | 4 × Ø21 su 224 × 184 ✅ | ❓ | ❓ |
| HW175 | 200 ✅ | +173 ✅ | 550–667 (lato volantino) + 206 ✅ | 566 totale; P 265 ✅ (sign. ⚠️) | 750 ✅ | 477 × 310 ✅ | 4 × Ø25: 242 + 149 dall'asse lento (non simmetrici) × 260 ✅ | 135 ✅ | Ø440 ✅ |

**Uberlift.** Su DO il marchio compare con: freni di ricambio «per argano RR1» 48/60/80/110 V, «telaio alto per
argano HW134», pulegge, carter e antiscarrucolamento «Uberlift e GEM», telai universali L = 765 e 990 mm «per
qualsiasi argano» fino a 480 kg (codice FL00992 per argani GEM e Uberlift) ✅ DO. **Macchine con dati propri: ❓**;
il sito uberlift.com non si apre da qui (§ 1). Il «GEM – Argano RR 1/65» di Donati (cap. 12) potrebbe essere
lo stesso «RR1» ⚠️ ipotesi.

**CAD GEM:** nessun file CAD sulle pagine né nel negozio; solo PDF con disegno quotato ✅ GE-W.

## 6. FAER

Condizioni delle tabelle (✅ FA-C p.2): contrappeso al 50 %, peso funi non bilanciato per 21 m di corsa,
taglia 1:1, rendimento dell'impianto 80 %, macchina in alto; **due velocità per riga: a pieno carico e a
vuoto**. Rapporti scritti «76:1» = 1/76 e «50:2» = 2/50. Potenze in HP (1 HP = 0,746 kW ⚠️ conversione nostra).
Serie F: «doppio albero lento» (un albero porta corona e puleggia, un albero statico porta il carico),
supporto esterno e basamento integrato ✅ FA-W.

### 6.1 Dati

| Modello | Statico (kg) | Rapporti | Pulegge Ø (mm) | Motori 50 Hz | Portata max (kg) | Velocità (m/s) | Fonte |
|---|---|---|---|---|---|---|---|
| P58S II (senza supporto) | 2800 ✅ | 1/76 · 1/66 · 1/58 · 1/52 · 1/44 · 1/37 ✅ | 440 · 480 · 520 · 550 · 600; 650 e 700 solo con 1/76 e 1/66 ✅ | 4 poli 5–10 HP; 6 poli 4–6 HP ✅ | 670 (4 poli, 1/37, Ø440, 10 HP); 630 (6 poli) ✅ | 0,41–1,27 (4 poli); 0,28–0,85 (6 poli) ✅ | FA-S p58f |
| P58F II (supporto, doppio albero) | 3200 ✅ | come P58S ✅ | come P58S; versione BT con basamento autoportante e pulegge fino a 700 ✅ FA-W | come P58S ✅ | come P58S ✅ | come P58S ✅ | FA-S p58f, FA-W |
| P60F II | 3500 ✅ | 1/44 · 1/37 · 2/50 ✅ | 440 · 480 · 520 · 550 · 600 ✅ | 4 poli 7–10 HP; 6 poli 5–7 HP ✅ | 670 ✅ | 0,71–1,88 (4 poli); 0,49–1,26 (6 poli) ✅ | FA-S P60f |
| P68F III | 6000 ✅ | 1/69 · 1/62 · 1/52 · 1/44 · 1/38 · 2/60 · 2/43 ✅ | 520 · 550 · 600 · 650 ✅ | 4 poli 8–16 HP; 6 poli 6–10 HP ✅ | 1040 ✅ | 0,54–2,37 (4 poli) ✅; «fino a 2,40» ✅ FA-W | FA-S P68f |
| P70F III | 8000 ✅ | 1/65 · 1/55 · 1/48 · 1/38 · 2/54 ✅ | 520 · 600 · 650 · 700 ✅ | 4 poli 14–25 HP; 6 poli 8–14 HP ✅ | 1600 ✅ | 0,57–2,03 (4 poli); 0,39–0,96 (6 poli) ✅ | FA-S P70f |
| P80F | 8000 ✅ | 1/48 · 1/38 · 2/54 (4 poli); 1/55 · 1/48 · 1/38 (6 poli) ✅ | 550 ✅ | 4 poli 22–30 HP; 6 poli 12–18 HP ✅ | 1900 ✅ (2000 ✅ FA-W) | 0,82–1,60 (4 poli); 0,49–0,76 (6 poli) ✅ | FA-S P80f |
| P35F, P46F, P56F (storici) | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | solo nomi, elettromagnete 60 V doppia bobina ✅ GT |

**Dati comuni (✅ FA-C p.2):** freno a corrente continua 48/60/80/110/180–220 V; gola a V 35° con intaglio 105°
di serie, altre a richiesta; olio Mobil Gear 630; motori 50 o 60 Hz, classe F, IP21; avviamenti/h 90–120
autoventilati, 180–240 con ventilatore esterno; giri a pieno carico (a vuoto): 4 poli 1360 (1500), 6 poli 930
(1000), 4/16 1360/320 (1500/375), 6/16 930/320 (1000/375), 4/24 1360/215 (1500/250), 6/24 930/215 (1000/250). Vite in acciaio legato rettificata su cuscinetti a
rulli conici, corona in bronzo centrifugato, gioco vite-corona registrabile ✅ FA-W. **Masse: ❓. Coppia
frenante: ❓.**

### 6.2 Quote per disegnare la macchina (✅ FA-S, disegno della scheda; significato letto sul disegno)

| Modello | Assi | Lunghezza | Fori e piedi | Puleggia | Note |
|---|---|---|---|---|---|
| P58S | vite **sotto** la ruota: asse vite 194 dai piedi, asse lento 154 più in alto (348 ⚠️ somma) ✅ | dall'asse lento: 210 + max 410 fino al volantino ✅ | Ø17: 180 + 180 lungo la vite, 135 + 135 di traverso (simmetrici al piano della vite) ✅ | piano medio a 215 dal piano della vite ✅ (sign. ⚠️) | volantino all'estremità del motore ✅ |
| P58F / P60F | asse vite 315 dalla base dei piedi (piedi a squadra; 7 ✅ sign. ⚠️), asse lento 154 più in alto (469 ⚠️) ✅ | 210 + max 405 (P58F) / max 515 (P60F) ✅ | Ø17: 180 + 180 × 135 + 135, più la fila del supporto esterno a 110 oltre il piano medio ✅ | piano medio a 225 dal piano della vite ✅ | — |
| P68F | asse vite 280 dalla base di due travi (altezza 120), asse lento 178 più in alto (458 ⚠️) ✅ | max 585 (lato motore) + 470 ✅ (sign. ⚠️) | Ø20: 210 + 210 lungo la vite; file di traverso a −160, +95, +380 dal piano della vite (130 · 155 · 95 · 160) ✅ (sign. ⚠️) | piano medio a +250 ⚠️ somma | — |
| P70F | come P68F ma asse lento 217 sopra la vite (497 ⚠️) ✅ | max 660 + 470 ✅ | come P68F ✅ | come P68F ⚠️ | — |
| P80F | asse vite 280; asse lento +217 ✅ | max 590 + 470 ✅ | Ø20: 210 + 210 (420); file a −155, +100, +425 (150 · 175 · 100 · 155; 325 e 255) ✅ (sign. ⚠️) | piano medio a +275 ⚠️ somma | — |

**CAD FAER:** nessuno; schede PDF e un modulo di selezione (https://www.faer.net/wp-content/uploads/2020/07/Datasheet.pdf) ✅.

## 7. Italian Top Gears (ITG) — costruttore nuovo

Sede: Via Martiri della Romania 47C, Borzano di Albinea (RE) ✅ IT-E; produce argani, gearless e componenti
✅ IT-E. Sito bloccato da qui (§ 1): **tutti i dati sono ⚠️** (estratti di ricerca IT-X o rivenditore IT-R).

| Modello | Dati trovati | Fonte |
|---|---|---|
| ITG 075, ITG 090 | esistono (scheda PDF su igilift.com, bloccata da verifica anti-bot) ⚠️ | IT-X |
| ITG 125 | statico 3400 kg «in tutte le direzioni»; fino a 8 persone in 1:1; vite monolitica cementata e temprata; rapporto 2/57 citato ⚠️ | IT-X |
| ITG 127 (serie ITG 130) | statico 2600 kg; portata 320–630 kg; motori 2,2–8,6 kW; rapporti 1/55 · 1/45 · 2/57 ⚠️ | IT-X |
| ITG 134 | statico 3400 kg; fino a 10 persone in 1:1; olio sintetico poliglicolico, cambio dopo 20 000 h ⚠️ | IT-R |
| ITG 160 | statico 5200 kg ⚠️ | IT-X |
| Quote, pulegge, masse, freni, CAD | ❓ | — |

## 8. GEAT e marchi minori

- **GEAT Elevators** (Napoli) resta un **distributore** (cap. 12 § 1). Oggi vende ✅ GT: Sassi MODY, LEO,
  GEKO; Montanari M65, M73 (anche «solo riduzione»), M83; FAER P58F, P58S; SICOR SH110TSB, SH130; ricambi per
  FAER P35F–P60F e supporto esterno «LEO GEKO».
- **Volpi**: argani storici VS30, VS40, VS50, VS60, VS70, VR42, VR65 (kit contatti freno su TC) ✅ nomi; dati ❓.
- **Uberlift**: § 5.

## 9. Differenze rispetto al catalogo del software (`liftpilot/src/lib/catalog/machines.ts`)

Da verificare prima di modificare il codice (questo capitolo non cambia nulla):

1. **SICOR, portate 1:1** (SC-B p.9) oggi assenti nel software salvo SH110B: SV110 450, MR12C 550, SH130 550,
   SH130G 630, SH140 875, SH160 1250, SH190 1800, MR21 2000, MR26 3000, MR35 5500 kg ✅.
2. **SICOR MR12C e SH130, rapporti**: il riquadro dati (usato dal software) e le tabelle portate della stessa
   brochure non coincidono (§ 2.1) ⚠️ — chiedere a SICOR quale elenco vale.
3. **SICOR varianti**: SH140LS ha statico 2000 kg (1500–2000 secondo l'albero), SH160LS 3200–4300 kg; MR21TS
   7400 kg e MR26TS 8175 kg (TS = terzo supporto) ✅.
4. **Sassi**: MB94 (8000), MB95 (12000), MB108 (15000) mancano; masse nuove MODY 158–169, LEO 181–218, TORO
   246–299, MF48 245–268, MF84 354–454 (definizioni diverse: senza volano e puleggia, MB senza motore) ✅;
   pulegge TORO 320–700 (il software ha 520–600), MF48 400–700, MF84 e MF94 450–800 (il software ha 650–1000
   per MF94: Ø1000 era solo sulla pagina storica) ✅.
5. **GEM**: mancano HW134VF (160 kg, 5,5 kW), HW135VF (2300 kg, 6,1 kW, 180 kg), HW135L-VF (2700 kg, 7,6 kW,
   210 kg), HW140CL (3800 kg, 11,5 kW, 240 kg) e il kit freno HW134B (780 Nm); HW140C ha 10,8 kW VVVF e 260 kg
   nella scheda ✅.
6. **FAER**: P58F/P58S hanno sei rapporti (1/76 … 1/37) e pulegge 440–700, portata fino a 670 kg, potenza max
   10 HP ≈ 7,5 kW ⚠️ conversione; mancano P60F (3500 kg), P68F (6000), P70F (8000), P80F (8000) ✅.
7. **ITG** è un marchio nuovo, con dati solo ⚠️.
8. **Quote per disegnare** ora disponibili, oltre a SICOR: SV110 (§ 2.4), tutte le GEM (§ 5.2), tutte le FAER
   (§ 6.2) e tutte le Sassi (§ 3.3), dai disegni quotati PDF.

## 10. Lacune

1. **Montanari**: nessun documento del costruttore aperto (sito con catena TLS incompleta; .in e .com USA con
   verifica anti-bot). Dati solo ⚠️; quote, asse puleggia, fori e CAD ❓. Da chiedere al costruttore o a un
   rivenditore: le schede «MONTANARI_SCHEDA_GEARBOX-…_REV21_05_2024.pdf» e i PDF «Montanari-Gearbox-M73/M75/…».
2. **Sassi**: il sito non si apre (stessa causa); dati dal catalogo 2022/03 in copia. Il catalogo 2023/01
   citato nel cap. 12 non è stato confrontato. DXF/STEP solo con login «MY SASSI». Portate per taglia ⚠️ (dal
   sito, non dal catalogo).
3. **ITG**: tutto ⚠️; sito bloccato.
4. **Coppia frenante**: trovata solo per GEM HW134B (780 Nm). ❓ per SICOR, Sassi, FAER, Montanari, ITG e per i
   freni di serie GEM. Certificati d'esame UE del tipo dei freni sull'albero lento: ❓.
5. **Profili delle gole** (angoli γ e β): SICOR li disegna ma i valori non sono nel testo ❓; FAER V 35°/105° ✅;
   Sassi, GEM ❓.
6. **Masse**: FAER ❓; Sassi con definizioni diverse (senza volano, puleggia o motore).
7. **SV110**: nessun CAD; posizione di motore, freno e disco solo in scala ⚠️ (§ 2.4).
8. **Significato di alcune quote** (marcato «sign. ⚠️») nei disegni Sassi LEO/TORO/MF48/MB108 e FAER
   P68F/P70F/P80F: da confermare sul disegno prima di disegnare la macchina.
9. **Modelli storici** (SICOR MR10–MR17, Sassi GEKO e RF18, Montanari M68/M71/M76, FAER P35F–P56F, Volpi): solo
   nomi o pochi dati.
10. **Uberlift**: ruolo (costruttore o marchio di ricambi) non chiarito; «RR1» ❓.

## 11. File scaricati (solo nello spazio di lavoro, non nel repository)

Cartella `…/scratchpad/dl/argani/`:

- `sicor/sheets/`: 15 schede 2025 (Scheda-Tecnica-…-Geared-ITA-2025, anche le versioni «-1» di SH140 e SH160,
  SH140T, SH160T; Technical-Sheet-SV110-Geared-EN-2025), SICOR-Brochure-Geared-EN.pdf, dichiarazione di
  incorporazione; `sicor/manuals/`: 19 manuali MUM…; `sicor/manualslib/`: pagine e due immagini (MR12, MR14);
  `sicor/zip-*.lst`: indici dei 20 ZIP CAD (gli ZIP non sono stati scaricati).
- `sassi/`: Alberto_SASSI_Catalogue_Geared_2022_Rev_03.pdf.
- `gem/`: HW134, HW134B, HW134L, HW134VF, HW135VF, HW135L-VF, HW140C, HW175 (.pdf), GEM_Catalogo-Prodotti_REV2021,
  GEM_Catalogo-Prodotto_REV2021 (gearless).
- `faer/`: p58f-p58f, P60f-, P68f-, P70f-, P80f-scheda-ok, catalogo-FAER_compressed, Datasheet (.pdf).
- `montanari/`: Montanari-General-Brochure-1.pdf; pagine Donati.
- `geat/`, `itg/`, `altri/`: solo pagine HTML.
