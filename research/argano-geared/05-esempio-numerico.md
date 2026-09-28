# 5. Esempio numerico completo

[← Indice](README.md)

Scopo: mostrare che cosa deve calcolare il software su un caso realistico, con tutti i valori
intermedi. Le formule sono quelle del capitolo 4 (con i loro ⚠️). **I dati della macchina sono
illustrativi**: dello stesso ordine di grandezza dei cataloghi consultati (puleggia 560 mm con
4 funi Ø10, rapporti intorno a 1/40, carico statico di qualche migliaio di kg), ma non
descrivono un modello reale. I risultati sono stati calcolati con un prototipo delle
funzioni del motore (script Node, doppia precisione).

## 5.1 Dati

| Gruppo | Dato | Valore | Origine |
|---|---|---|---|
| Impianto | portata Q · massa cabina P · bilanciamento k | 630 kg · 700 kg · 0,50 | ipotesi |
| | contrappeso M_cw = P + k·Q | 1015 kg | calcolato |
| | velocità v · taglia · corsa H · fune oltre corsa L0 | 1,0 m/s · 1:1 · 18 m · 2 m | ipotesi |
| Funi | numero × diametro, costruzione | 4 × Ø10 mm, 8×19 Seale anima tessile, 1570 N/mm² | ipotesi |
| | carico di rottura minimo F_min | 47,5 kN | stima dalla tabella Pfeifer (8 mm: 30,4 kN → K = 0,3025) |
| | massa lineare q_f | 0,336 kg/m | stima dalla stessa tabella (8 mm: 21,5 kg/100 m) |
| Trazione | puleggia D · gola | 560 mm · semicircolare con sottosquadro β = 90°, γ = 35° | illustrativo, nei limiti raccomandati da Montanari |
| | rinvio · angolo di avvolgimento | Dp = 400 mm, flessione semplice · α = 160° | ipotesi di layout |
| Riduttore | rapporto i · rendimento diretto η_d · altri rendimenti | 43 · 0,65 · 0,95 | illustrativo · ipotesi · ipotesi |
| Motore | potenza · poli · giri di targa · inerzia motore + freno | 5,5 kW · 4 · 1450 giri/min · 0,06 kg·m² | illustrativo |
| | inerzia della puleggia | 2,5 kg·m² | ipotesi |
| Freno | gruppi × coppia | 2 × 45 N·m, sull'albero motore | illustrativo |
| Macchina | carico statico massimo sull'albero | 2500 kg (somma vettoriale dei tiri) | illustrativo |
| Servizio | accelerazione di progetto · decelerazione di verifica | 0,8 m/s² · 0,5 m/s² | ipotesi · norma ⚠️ |
| Soccorso | raggio del volantino | 0,2 m | ipotesi |

Masse delle funi (una calata per lato): lato cabina con cabina al piano più basso
m_f(20 m) = 4 · 0,336 · 20 = **26,9 kg**; lato contrappeso m_f(2 m) = **2,7 kg**.

## 5.2 Cinematica

| Grandezza | Formula | Risultato |
|---|---|---|
| giri della puleggia | 60·r·v/(π·D) | 34,10 giri/min |
| rapporto ideale | 1450 / 34,10 | 42,52 |
| velocità reale con i = 43 | π·D·n_m/(60·r·i) | 0,989 m/s (−1,1%) |
| frequenza per 1,00 m/s | 50 Hz · 1,00/0,989 | 50,57 Hz |

## 5.3 Aderenza

| Caso | μ | f | e^(f·α) | T1 [N] | T2 [N] | T1/T2 | Utilizzo | Esito |
|---|---|---|---|---|---|---|---|---|
| caricamento 1,25·Q, cabina in basso | 0,100 | 0,1849 | 1,676 | 14 856 | 9 984 | 1,488 | 0,89 | OK |
| frenatura, cabina carica in discesa, in basso | 0,0909 | 0,1681 | 1,599 | 13 989 | 9 475 | 1,477 | 0,92 | OK |
| frenatura, cabina vuota in salita, in alto | 0,0909 | 0,1681 | 1,599 | 10 742 | 6 542 | 1,642 | **1,027** | **KO** |
| cabina bloccata (contrappeso sugli ammortizzatori) | 0,200 | 0,3698 | 2,809 | 6 893 | 26 | 261 | ≥ | OK |

Il caso critico è la frenatura con cabina vuota in salita: il contrappeso, più pesante della
cabina vuota, tende a far slittare le funi. È il caso che governa con bilanciamento al 50% e
un rinvio che riduce l'angolo di avvolgimento.

## 5.4 Funi

| Grandezza | Valore |
|---|---|
| D/d | 56 ≥ 40 → OK |
| N_equiv(t) (β = 90°) | 5,0 ⚠️ |
| K_p = (560/400)^4 · N_equiv(p) | 3,842 · 3,842 |
| N_equiv | 8,842 |
| S_f,calc | 11,17 → richiesto max(11,17; 12) = **12** |
| T_max per fune (cabina con Q ferma in basso) | 3 328 N |
| S_f,effettivo = 47 500 / 3 328 | **14,27** → OK |

## 5.5 Motore, riduttore, freno, soccorso, albero

| Verifica | Calcolo | Limite | Esito |
|---|---|---|---|
| squilibrio ΔF (cabina carica in salita dal basso) | [(700 + 630 − 1015) + 26,9 − 2,7]·9,81 = 3 328 N | — | — |
| coppia statica alla puleggia | 3 328 · 0,28 = 932 N·m | — | — |
| potenza statica (η = 0,65·0,95 = 0,6175) | 3 328 · 1,0 / 0,6175 = **5,39 kW** | 5,5 kW | OK (98%) |
| stessa potenza con formula semplificata | (1 − 0,5)·630·9,81·1,0/0,6175 | — | 5,00 kW (sottostima) |
| coppia statica al motore | 932 / (43 · 0,6175) = 35,1 N·m | M_n = 9550·5,5/1450 = 36,2 N·m | OK (97%) |
| coppia di accelerazione (a = 0,8 m/s²) | 35,1 + (0,102/0,6175 + 0,06)·122,9 = **62,8 N·m** | 1,73·M_n: da verificare con motore e inverter | da dati di targa |
| coppia massima in uscita dal riduttore | 932 + 188,7 · 2,857 = **1 471 N·m** | dato del costruttore | da catalogo |
| freno, tutti i gruppi, 1,25·Q, a_f = 0,5 m/s² | 31,7 + 13,0 = 44,7 N·m | 90 N·m | OK |
| freno, un gruppo, Q | 21,7 + 12,4 = 34,1 N·m | 45 N·m | OK |
| decelerazione massima (cabina carica in salita, freno pieno) | (3 328 + 13 821) / 3 822 kg equivalenti = 4,49 m/s² (0,46 g) | paracadute / ammortizzatori dell'impianto | da confrontare |
| forza al volantino | 932 / (43 · 0,65) / 0,2 = **167 N** | 400 N ⚠️ | OK, volantino ammesso |
| carico sull'albero, prova 1,25·Q | √(14 856² + 9 984² + 2·14 856·9 984·cos 20°) = 24 477 N = **2 495 kg** | 2 500 kg | OK (99,8%) |

Sensibilità sul rendimento: con η_d = 0,55 invece di 0,65 la potenza statica sale a
**6,37 kW** e il motore da 5,5 kW non basta più. Per questo il rendimento deve venire dal
costruttore, rapporto per rapporto.

## 5.6 Correggere la verifica fallita: perché serve un selettore

Il motore di calcolo cerca la leva minima che rende ammissibile la frenatura con cabina
vuota (serve f·α ≥ ln 1,642 = 0,4959) e poi **ricontrolla tutte le altre verifiche**:

| Leva | Valore minimo | Aderenza | Effetto collaterale | Esito complessivo |
|---|---|---|---|---|
| angolo di avvolgimento | α ≥ 169,0°; senza rinvio α = 180° → e^(f·α) = 1,696 | OK | funi verticali: carico sull'albero **2 532 kg > 2 500** | **KO** |
| zavorra in cabina (k costante) | P ≥ 762 kg (+62 kg) | OK (1,5986 ≤ 1,5990) | carico sull'albero **2 617 kg > 2 500** | **KO** |
| sottosquadro maggiore | β ≥ 96,9° → β = 100°: e^(f·α) = 1,664 | OK (utilizzo 0,99) | oltre i 90° raccomandati da Montanari; N_equiv(t) 10,0 ⚠️ → S_f richiesto sale a 12,87 (effettivo 14,27); usura delle funi maggiore | OK, margini minimi |
| gola a V temprata γ = 40° | e^(f·α) = 2,101 | OK | N_equiv(t) 7,1 ⚠️ → S_f,calc 11,95; incertezze sulla tempra e maggiore usura | OK |

Due delle quattro correzioni “ovvie” rompono un'altra verifica, e le due che passano spingono
la gola fuori dall'intervallo raccomandato o verso una gola a V temprata. La configurazione
con β = 100° ha due verifiche sopra il 98% di utilizzo (aderenza e albero): l'ordinamento del
capitolo 6.6 la mette in fondo e propone prima una macchina con carico sull'albero più alto o
una taglia 2:1. È il lavoro che un foglio di calcolo per singola verifica non fa, e che
giustifica il software.
