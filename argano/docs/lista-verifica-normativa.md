# Lista di verifica normativa — profilo IT-2026.1

Italia — sostituzione dell'argano su impianto esistente. Generata da `argano/src/calc/norme.ts` con `npm run lista`: non modificare a mano.

Per l'ingegnere incaricato: per ogni voce confrontare il valore usato dal software con il testo vigente del documento
indicato e segnare l'esito (conforme, diverso con il valore corretto e la clausola esatta, non applicabile). Le voci
«da verificare» vengono da fonti secondarie; «stima» e «scelta del software» sono decisioni del software da approvare
o correggere; «derivazione» è meccanica elementare; «confermato» vuol dire due fonti indipendenti o un caso pubblicato
riprodotto, e va comunque confrontato con il testo. Ogni correzione entra nel registro e cambia insieme motore di
calcolo, lista e relazione.

## Documenti del profilo

- **Direttiva 2014/33/UE** — requisiti essenziali di sicurezza (Allegato I)
- **DPR 162/1999 e s.m.i. (DPR 8/2015, DPR 23/2017)** — sostituzione del macchinario come modifica costruttiva; verifica straordinaria (art. 14)
- **UNI EN 81-20:2020** — funi (5.5), freno (5.9.2.2), distanze nel vano (5.2.5) e superficie della cabina (5.4.2)
- **UNI EN 81-50:2020** — aderenza (5.11) e coefficiente di sicurezza delle funi (5.12)
- **UNI 10411-1:2024** — modifiche e sostituzioni su ascensori elettrici esistenti non conformi alle direttive
- **DM 236/1989** — accessibilità: cabina e porta minime (8.1.12), per il progetto del vano

Voci: 61 (argano 47, vano 14) — da verificare 35, confermate 4, scelte del software 16, stime 2, derivazioni 3, prassi 1.

## Aderenza

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 1 | Aderenza: tre condizioni di Euler-Eytelwein | T1/T2 ≤ e^(f·α) al caricamento e in frenatura di emergenza; T1/T2 ≥ e^(f·α) con cabina bloccata | UNI EN 81-50:2020, 5.11 | Mellor; Elevator World; Scientific Reports 2025 | confermato | aderenza al caricamento; aderenza in frenatura, in discesa; aderenza in frenatura, in salita; cabina bloccata |
| 2 | Coefficiente di attrito, caricamento | μ = 0,1 | UNI EN 81-50:2020, 5.11.2 (sottoclausola da individuare) | fonti secondarie concordi | da verificare | aderenza al caricamento |
| 3 | Coefficiente di attrito, frenatura di emergenza | μ = 0,1 / (1 + v_f/10), v_f = velocità delle funi | UNI EN 81-50:2020, 5.11.2 | fonti secondarie concordi | da verificare | aderenza in frenatura, in discesa; aderenza in frenatura, in salita; aderenza alla decelerazione reale (avviso) |
| 4 | Coefficiente di attrito, cabina bloccata | μ = 0,2 | UNI EN 81-50:2020, 5.11.2 | fonti secondarie concordi | da verificare | cabina bloccata |
| 5 | Carico della verifica di caricamento — Il campione cita anche il peso dei dispositivi di movimentazione, dove usati: non modellato. | 1,25·Q, cabina in basso e in alto | UNI EN 81-50:2020, 5.11.2.3.2 | campione BSI di EN 81-50:2020 (p. 50) | da verificare | aderenza al caricamento |
| 6 | Decelerazione della verifica di frenatura | 0,5 m/s²; 0,8 m/s² con ammortizzatori a corsa ridotta | UNI EN 81-50:2020, 5.11.2.2.2 | fonti secondarie; 0,8 m/s² da EN 81-1 secondo una fonte secondaria | da verificare | aderenza in frenatura, in discesa; aderenza in frenatura, in salita |
| 7 | Combinazioni della frenatura di emergenza | cabina vuota e con portata × in discesa e in salita × in basso e in alto; conta la peggiore per verso | UNI EN 81-50:2020, 5.11.2.2.2 | derivazione (copertura completa dei casi) | scelta del software | aderenza in frenatura, in discesa; aderenza in frenatura, in salita |
| 8 | Aderenza alla decelerazione reale del freno — Se la lettura è confermata diventa un esito; nell'esempio B del capitolo 7 cambia 1,005 in 4,17. | Seconda verifica con la decelerazione data dal freno (tutti i gruppi, mai sotto il minimo); oggi solo avviso | UNI EN 81-50:2020, 5.11.2.2.2 (lettura da decidere sul testo) | fonti secondarie: "ogni parte con la sua decelerazione" | da verificare | aderenza alla decelerazione reale (avviso) |
| 9 | Soglia di attenzione sull'utilizzo dell'aderenza | utilizzo > 0,97 → «Attenzione» | — | scelta del software (margine per incertezza su masse e bilanciamento) | scelta del software | aderenza al caricamento; aderenza in frenatura, in discesa; aderenza in frenatura, in salita; aderenza alla decelerazione reale (avviso) |

## Gole

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 10 | Fattore di gola, semicircolare con o senza sottosquadro | f = μ·4·(cos(γ/2) − sin(β/2)) / (π − β − γ − sin β + sin γ); senza sottosquadro β = 0 | UNI EN 81-50:2020, 5.11.2.3 (ex EN 81-1 Allegato M) | fonti secondarie; controllo di coerenza con Mellor | da verificare | aderenza al caricamento; aderenza in frenatura, in discesa; aderenza in frenatura, in salita; cabina bloccata |
| 11 | Fattore di gola a V | temprata (e ogni gola a V con cabina bloccata): f = μ / sin(γ/2); non temprata: f = μ·4·(1 − sin(β/2)) / (π − β − sin β) | UNI EN 81-50:2020, 5.11.2.3 | fonti secondarie; controllo di coerenza con Mellor | da verificare | aderenza al caricamento; aderenza in frenatura, in discesa; aderenza in frenatura, in salita; cabina bloccata |
| 12 | Limite del sottosquadro | β ≤ 106° (oltre: KO) | UNI EN 81-50:2020, 5.11.2.3 (valore di EN 81-1) | fonte secondaria su EN 81-1 | da verificare | geometria della gola |
| 13 | Sottosquadro raccomandato | β ≤ 90° (oltre: «Attenzione») | — | Montanari, documento tecnico del costruttore | scelta del software | geometria della gola |
| 14 | Angolo minimo della gola a V | γ ≥ 35° (sotto: KO) | UNI EN 81-50:2020, 5.12 (tabella di N_equiv(t)) | la tabella usata parte da 35°; Montanari: γ ≥ 32°, consigliato 35–40° | scelta del software | geometria della gola |

## Funi

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 15 | Rapporto D/d della puleggia di trazione | D/d ≥ 40 | UNI EN 81-20:2020, 5.5.2.1 | ELA 2026 e fonti concordi | confermato | D/d della puleggia |
| 16 | Rapporto D/d delle pulegge di rinvio | Dp/d ≥ 40 | UNI EN 81-20:2020, 5.5.2.1 | fonti secondarie | da verificare | Dp/d dei rinvii |
| 17 | Numero minimo di funi | almeno 2 funi indipendenti, ciascuna con il suo attacco | Direttiva 2014/33/UE, Allegato I; UNI EN 81-20:2020, 5.5 | fonte secondaria | da verificare | numero e diametro delle funi |
| 18 | Diametro nominale minimo | d ≥ 8 mm (salvo approvazione di un organismo notificato) | UNI EN 81-20:2020, 5.5 | fonti secondarie | da verificare | numero e diametro delle funi |
| 19 | Coefficiente di sicurezza minimo | 12 con tre o più funi; 16 con due funi | UNI EN 81-20:2020, 5.5 | fonti secondarie | da verificare | coefficiente di sicurezza delle funi |
| 20 | Coefficiente di sicurezza richiesto S_f | S_f = 10^[2,6834 − log10(695,85·10^6·N_equiv/(D/d)^8,567) / log10(77,09·(D/d)^−2,894)] | UNI EN 81-50:2020, 5.12 (ex EN 81-1 Allegato N) | riprodotto su due casi pubblicati (liftdesign.it S_f 16,69; Mellor) | confermato | coefficiente di sicurezza delle funi |
| 21 | N_equiv delle pulegge — Da confermare anche quando una flessione conta come inversa (distanza tra le pulegge): oggi la classifica il progettista. | N_equiv(p) = K_p·(N_ps + 4·N_pr), K_p = (D/Dp)^4 | UNI EN 81-50:2020, 5.12 | fonti secondarie | da verificare | coefficiente di sicurezza delle funi |
| 22 | N_equiv(t) della gola: valori confermati | U senza sottosquadro 1; U β 105° 15,2; V γ 35° 18,5 | UNI EN 81-50:2020, 5.12, tabella 2 | fonti concordi | confermato | coefficiente di sicurezza delle funi |
| 23 | N_equiv(t) della gola: altri valori (provvisori) | β 75° 2,5; 80° 3,0; 85° 3,8; 90° 5,0; 95° 6,7; 100° 10,0 · γ 36° 15,2; 38° 10,5; 40° 7,1; 42° 5,6; 45° 4,0 | UNI EN 81-50:2020, 5.12, tabella 2 | fonti secondarie (β 90° indiretto); gli altri non verificati | da verificare | coefficiente di sicurezza delle funi |
| 24 | Uso della tabella di N_equiv(t) | nessuna interpolazione: punto più sfavorevole (β superiore, γ inferiore); oltre 105° estrapolazione dall'ultimo tratto, segnalata | UNI EN 81-50:2020, 5.12 | scelta prudente del software (la tabella non dà una regola) | scelta del software | coefficiente di sicurezza delle funi |
| 25 | Tiro massimo per fune | cabina con portata ferma al piano più basso; con la macchina in basso sul primo tratto verso la testata | UNI EN 81-50:2020, 5.12 | definizione di EN 81-1 da fonte secondaria | da verificare | coefficiente di sicurezza delle funi |
| 26 | Stima di carico di rottura e massa delle funi | 8×19 Seale anima tessile 1570 N/mm²: 8 mm = 30,4 kN e 0,215 kg/m, poi in proporzione a d² | — | tabella Pfeifer 8×19S NFC; usata solo con il pulsante di stima e nella proposta libera | stima | — |

## Freno

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 27 | Gruppi meccanici del freno | almeno 2 | UNI EN 81-20:2020, 5.9.2.2; UNI 10411-1:2024 | sintesi della UNI 10411-1:2021 e fonti secondarie | da verificare | gruppi del freno |
| 28 | Freno, tutti i gruppi | arresta la cabina in discesa a velocità nominale con 1,25·Q | UNI EN 81-20:2020, 5.9.2.2 | due ricerche indipendenti, stessa formulazione | da verificare | freno, tutti i gruppi |
| 29 | Freno, un solo gruppo | rallenta, arresta e tiene la cabina con portata in discesa e la cabina vuota in salita | UNI EN 81-20:2020, 5.9.2.2; UNI 10411-1:2024 | sintesi della UNI 10411-1:2021 | da verificare | freno, un gruppo in discesa; freno, un gruppo a vuoto in salita |
| 30 | Attrito del riduttore nel fabbisogno del freno | non conteggiato (η_i = 1): a favore di sicurezza | — | scelta prudente del software | scelta del software | freno, tutti i gruppi; freno, un gruppo in discesa; freno, un gruppo a vuoto in salita |
| 31 | Decelerazione massima del freno | ≤ 1 g (oltre: «Attenzione»), da confrontare con paracadute e ammortizzatori | UNI EN 81-20:2020, 5.9.2.2 | fonte secondaria | da verificare | decelerazione massima del freno |

## Riduttore e motore

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 32 | Rendimento inverso del riduttore se non dato — Da sostituire con il valore del costruttore: la decelerazione reale del freno ne dipende molto. | η_i ≈ 2 − 1/η_d (0 = irreversibile) | — | approssimazione della teoria della vite senza fine | stima | aderenza alla decelerazione reale (avviso); decelerazione massima del freno |
| 33 | Coppia di accelerazione | ≤ 2 volte la coppia nominale (oltre: «Attenzione»; nella proposta: criterio di scelta del motore) | — | scelta del software; il limite vero è quello di motore e inverter | scelta del software | coppia di accelerazione |
| 34 | Soglia di attenzione sui limiti del costruttore | oltre il 98% del limite di catalogo (albero, coppia in uscita) → «Attenzione» | — | scelta del software | scelta del software | carico sull'albero; coppia in uscita |
| 35 | Potenza statica del motore | P_st = ΔF·v_f / (η_d·η_vano) ≤ P_n, con ΔF il maggiore tra cabina carica in salita dal basso e vuota in discesa dall'alto | — | derivazione | derivazione | potenza del motore |
| 36 | Coppia massima in uscita dal riduttore | M_p = ΔF·D/2 + J·i·α_m, confrontata con il valore di catalogo se inserito | dato del costruttore | derivazione | derivazione | coppia in uscita |
| 37 | Tolleranza tra velocità reale e nominale | non verificata: il software mostra la velocità reale e la frequenza per la nominale | da individuare (UNI EN 81-20:2020 o UNI 10411-1:2024) | non trovata nelle fonti consultate | da verificare | — |

## Manovra di emergenza

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 38 | Forza massima al volantino | ≤ 400 N, altrimenti manovra elettrica di emergenza | UNI EN 81-20:2020 (clausola da individuare) | Elevator World; stesso valore in EN 81-1 | da verificare | forza al volantino |

## Albero e ancoraggi

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 39 | Carico sull'albero della puleggia | risultante dei tiri con 1,25·Q al piano più basso, confrontata con il limite del costruttore | dato del costruttore | derivazione; definizione del costruttore da confermare | da verificare | carico sull'albero |
| 40 | Sollevamento netto sugli ancoraggi (macchina in basso) | carico verso l'alto meno la massa della macchina: da verificare con il progettista strutturale | — | derivazione | derivazione | sollevamento netto |

## Sostituzione (Italia)

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 41 | La sostituzione del macchinario è una modifica costruttiva | adeguamento della parte sostituita, comunicazione al Comune e al soggetto delle verifiche, verifica straordinaria prima del servizio | DPR 162/1999 e s.m.i., art. 2 (dopo il DPR 23/2017) e art. 14 | testi consolidati non ufficiali; fonti secondarie concordi | da verificare | — |
| 42 | Adeguamenti richiesti per la sostituzione del macchinario | elenco del capitolo 6.6 della ricerca (tra cui freno a due gruppi) | UNI 10411-1:2024 | sintesi pubblicate della UNI 10411-1:2021 (edizione superata) | da verificare | gruppi del freno |
| 43 | Funi nella sostituzione | di norma funi nuove con lo stesso numero e diametro di quelle montate; la proposta le tiene fisse | — | indicazione di Panev Ascensori (29 settembre 2026) | prassi di cantiere | — |

## Modello di calcolo

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 44 | Accelerazione di gravità | g = 9,81 m/s² (anche come limite di 1 g) | UNI EN 81-50:2020 (simboli) | valore d'uso nei calcoli degli ascensori | da verificare | — |
| 45 | Tiri con il metodo del percorso della fune | masse e funi di ogni tratto, inerzia delle pulegge di rinvio; attrito di guide e pulegge trascurato in aderenza | UNI EN 81-50:2020, 5.11 | derivazione; il conteggio dell'inerzia delle pulegge va confermato | da verificare | aderenza al caricamento; aderenza in frenatura, in discesa; aderenza in frenatura, in salita; aderenza alla decelerazione reale (avviso); cabina bloccata |
| 46 | Compensazione e cavo flessibile | non modellati a parte: la loro massa sul lato cabina entra in P | UNI EN 81-50:2020, 5.11 | limite del modello attuale | scelta del software | — |
| 47 | Analisi di sensibilità | P ±10%; k ±0,05 se il carico di equilibrio non è misurato | — | scelta del software (incertezza tipica del rilievo) | scelta del software | — |

## Vano: cabina e portata

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 48 | Superficie utile massima della cabina per portata — la superficie è calcolata come larghezza × profondità interne, senza nicchie né rientranze della porta | 100 kg 0,37 m²; 180 kg 0,58; 225 kg 0,70; 300 kg 0,90; 375 kg 1,10; 400 kg 1,17; 450 kg 1,30; 525 kg 1,45; 600 kg 1,60; 630 kg 1,66; 675 kg 1,75; 750 kg 1,90; 800 kg 2,00; 825 kg 2,05; 900 kg 2,20; 975 kg 2,35; 1000 kg 2,40; 1050 kg 2,50; 1125 kg 2,65; 1200 kg 2,80; 1250 kg 2,90; 1275 kg 2,95; 1350 kg 3,10; 1425 kg 3,25; 1500 kg 3,40; 1600 kg 3,56; 2000 kg 4,20; 2500 kg 5,00; oltre 2500 kg +0,16 m² ogni 100 kg; interpolazione lineare | UNI EN 81-20:2020, 5.4.2.1 (Tabella 6) | Elevator World, «Rated Load and Maximum Available Car Area» (fonte secondaria); valori della EN 81-1 (Tabella 1.1) | da verificare | superficie della cabina per la portata |
| 49 | Numero di passeggeri | il minore tra Q/75 arrotondato per difetto e il numero ammesso dalla superficie: 1 persona 0,28 m²; 2 0,49; 3 0,60; 4 0,79; 5 0,98; 6 1,17; 7 1,31; 8 1,45; 9 1,59; 10 1,73; 11 1,87; 12 2,01; 13 2,15; 14 2,29; 15 2,43; 16 2,57; 17 2,71; 18 2,85; 19 2,99; 20 3,13; oltre 20 +0,115 m² per persona | UNI EN 81-20:2020, 5.4.2 (Tabella 8) | valori della EN 81-1 (Tabella 1.2), edizione superata | da verificare | — |

## Vano: distanze in pianta

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 50 | Parete del vano di fronte all'entrata della cabina | distanza orizzontale dalla soglia o dal telaio della porta di cabina ≤ 150 mm (qui: profondità della porta di piano + gioco tra le soglie) | UNI EN 81-20:2020, 5.2.5.3.1 | schede EN 81-20 dei costruttori (KONE), fonti secondarie | da verificare | parete di fronte all'entrata |
| 51 | Gioco tra soglia di cabina e soglia di piano | distanza orizzontale ≤ 35 mm | UNI EN 81-20:2020 (clausola da individuare; 11.2.3 nella EN 81-1) | fonti secondarie concordi | da verificare | gioco tra le soglie |
| 52 | Distanza tra cabina e contrappeso | ≥ 50 mm tra la cabina con i suoi componenti e il contrappeso con i suoi | UNI EN 81-20:2020, 5.2.5.5.1 | schede EN 81-20 dei costruttori (KONE), fonti secondarie | da verificare | distanza cabina–contrappeso |

## Vano: accessibilità (DM 236/1989)

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 53 | Edifici residenziali nuovi: cabina e porta minime | cabina larga 950 mm e profonda 1300 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (non verificata) | DM 236/1989, 8.1.12 | sintesi pubblicate del DM 236/1989 (disabili.com, studiomadera.it), fonti secondarie concordi | da verificare | cabina minima (DM 236/1989); porta minima (DM 236/1989); porta sul lato corto |
| 54 | Edifici non residenziali nuovi: cabina e porta minime | cabina larga 1100 mm e profonda 1400 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (non verificata) | DM 236/1989, 8.1.12 | sintesi pubblicate del DM 236/1989 (disabili.com, studiomadera.it), fonti secondarie concordi | da verificare | cabina minima (DM 236/1989); porta minima (DM 236/1989); porta sul lato corto |
| 55 | Adeguamento di edifici esistenti: cabina e porta minime | cabina larga 800 mm e profonda 1200 mm, porta di 750 mm sul lato corto; piattaforma davanti alla porta 1,40 × 1,40 m (non verificata) | DM 236/1989, 8.1.12 | sintesi pubblicate del DM 236/1989 (disabili.com, studiomadera.it), fonti secondarie concordi | da verificare | cabina minima (DM 236/1989); porta minima (DM 236/1989); porta sul lato corto |

## Vano: porte

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 56 | Ingombro della porta di piano lungo la parete del vano | telescopica a 2 ante: 1,5·L + 110 mm; centrale a 2 ante: 2·L + 110 mm (L = luce netta) | dato del fornitore delle porte | valori tipici: scelta del software da confermare con il fornitore | scelta del software | ingombro della porta di piano |
| 57 | Larghezza della cabina rispetto alla porta | larghezza interna ≥ luce della porta + 50 mm; profondità interna ≥ 800 mm | — | scelta del software | scelta del software | la cabina entra nel vano |

## Vano: ingombri tipici

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 58 | Ingombri tipici nel vano (modificabili su ogni progetto) | profondità della porta di piano 80 mm; gioco tra le soglie 30 mm; porta di cabina 80 mm; pareti della cabina 35 mm; guide e staffe della cabina 165 mm per lato; cabina–contrappeso 60 mm; spessore del contrappeso 140 mm; guide e staffe del contrappeso 80 mm; cabina–parete di fondo 60 mm | dati del costruttore di guide, porte e cabina | valori tipici: scelta del software | scelta del software | la cabina entra nel vano |
| 59 | Contrappeso laterale | la guida della cabina su quel lato sta a metà profondità della cabina, il contrappeso dietro di essa, a 100 mm dal suo asse e a 40 mm dalla parete di fondo; lunghezza del contrappeso in pianta da 400 a 900 mm (sotto 400 mm: «Attenzione»); con il contrappeso sul fondo, al massimo la larghezza tra le guide della cabina | — | scelta del software | scelta del software | lunghezza del contrappeso |

## Vano: limiti del progetto

| N. | Voce | Valore nel software | Dove verificare | Fonte attuale | Stato | Verifiche interessate |
|---|---|---|---|---|---|---|
| 60 | Dimensioni proposte della cabina | la cabina più grande che entra nel vano, a passi di 10 mm, con superficie entro il limite della portata; a parità di superficie, la più profonda | — | scelta del software | scelta del software | — |
| 61 | Limiti del progetto in pianta | solo la pianta: fossa, testata e spazi di rifugio non sono verificati; il rilievo dal disegno CAD va controllato in cantiere | UNI EN 81-20:2020, 5.2.5.7 e 5.2.5.8 (fossa e testata) | limite del modello attuale | scelta del software | — |
