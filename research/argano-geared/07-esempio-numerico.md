# 7. Esempio numerico completo

[← Indice](README.md)

Scopo: mostrare che cosa deve calcolare il software su casi realistici, con i valori
intermedi. Le formule sono quelle dei capitoli 4 e 5 (con i loro ⚠️). **I dati delle macchine
sono illustrativi**: dello stesso ordine di grandezza dei cataloghi consultati, ma non descrivono
modelli reali. I risultati vengono da un prototipo del motore di calcolo con il metodo del
percorso della fune (script Node, doppia precisione).

## 7.1 Dati comuni

| Gruppo | Dato | Valore | Origine |
|---|---|---|---|
| Impianto | portata Q · massa cabina P · bilanciamento k → contrappeso | 630 kg · 700 kg · 0,50 → 1 015 kg | ipotesi |
| | velocità · taglia · corsa H · fune oltre corsa L0 | 1,0 m/s · 1:1 · 18 m · 2 m | ipotesi |
| Funi nuove (caso A; nel caso B quelle esistenti, 7.3) | numero × diametro, costruzione | 4 × Ø10 mm, 8×19 Seale anima tessile, 1570 N/mm² | ipotesi |
| | carico di rottura minimo · massa lineare | 47,5 kN · 0,336 kg/m | stime dalla tabella Pfeifer (8 mm: 30,4 kN; 21,5 kg/100 m) |
| Nuovo argano | puleggia · gola | 560 mm · semicircolare con sottosquadro β = 90°, γ = 35° | illustrativo, nei limiti raccomandati da Montanari |
| | rapporto · rendimento diretto η_d | 43 · 0,70 | illustrativo · ipotesi |
| | rendimento inverso η_i (frenata con la ruota che trascina la vite) | 0,571 = 2 − 1/η_d | stima (capitolo 4.4) |
| | motori a catalogo (4 poli, 1450 giri/min) | 5,5 kW (J = 0,06 kg·m²) · 7,5 kW (J = 0,08 kg·m²) | illustrativo |
| | freno sull'albero motore | 2 × 45 N·m (5,5 kW) · 2 × 60 N·m (7,5 kW) | illustrativo |
| | inerzia puleggia · carico statico max albero · massa | 2,5 kg·m² · 2 500 kg · 450 kg | illustrativo |
| Servizio | accelerazione · decelerazione di verifica · decelerazione minima del freno | 0,8 · 0,5 · 0,5 m/s² | ipotesi · norma ⚠️ · ipotesi |
| Soccorso | raggio del volantino | 0,2 m | ipotesi |

## 7.2 Caso A — macchina in alto con rinvio

Rinvio Ø400 mm (inerzia 0,8 kg·m²) 600 mm sotto e 300 mm di lato: α = 160,3° dalla geometria
(capitolo 5.3), 160° nel calcolo.
Rendimento del vano 0,85 (capitolo 5.6) → η = 0,70 · 0,85 = 0,595.

**Cinematica**: 34,10 giri/min alla puleggia, rapporto ideale 42,52; con i = 43 la velocità reale
è 0,989 m/s (−1,1%), 1,00 m/s a 50,57 Hz.

| Aderenza | μ | f | e^(f·α) | T1 [N] | T2 [N] | T1/T2 | Utilizzo |
|---|---|---|---|---|---|---|---|
| caricamento 1,25·Q, cabina in basso | 0,100 | 0,1849 | 1,676 | 14 856 | 9 991 | 1,487 | 0,89 |
| frenatura, cabina carica in discesa | 0,0909 | 0,1681 | 1,599 | 13 989 | 9 472 | 1,477 | 0,92 |
| frenatura, cabina vuota in salita | 0,0909 | 0,1681 | 1,599 | 10 760 | 6 542 | 1,645 | **1,029 KO** |
| cabina bloccata | 0,200 | 0,3698 | 2,809 | 6 893 | 272 | 25,4 | ≥ → OK |

| Altre verifiche | Risultato |
|---|---|
| funi: D/d · N_equiv · S_f richiesto · S_f effettivo | 56 · 8,84 (5,0 + K_p 3,84) · max(11,17; 12) = 12 · 47 500 / 3 328 N = **14,27** |
| rinvio: Dp/d | 400 / 10 = **40**, al limite: con funi Ø11 sarebbe 36,4 → KO |
| potenza statica (squilibrio 3 335 N, cabina vuota in discesa dall'alto; con la cabina carica in salita dal basso 3 320 N) | 3 335 · 1,0 / 0,595 = **5,61 kW**: il motore da 5,5 kW è al 102% → **KO**; con 7,5 kW al 75% |
| formula semplificata (1 − k)·Q·g·v/η | 5,19 kW: sottostima del 7,5% per il peso delle funi non compensate |
| coppia di accelerazione, motore 7,5 kW | 36,3 + (0,103/0,595 + 0,08) · 122,9 = 67,4 N·m = 1,36 · M_n (49,4 N·m) |
| coppia massima in uscita dal riduttore | 1 473 N·m (da confrontare con il catalogo) |
| freno 2 × 60 N·m: 1,25·Q tutti i gruppi · un gruppo con Q in discesa · un gruppo a vuoto in salita | 46,2 · 35,7 · 33,7 N·m → OK |
| decelerazione massima in frenata, tutti i gruppi (cabina vuota in discesa in alto) | 6,98 m/s² (0,71 g) con η_i stimato; 5,91 m/s² con η_i = 1; da confrontare con paracadute e ammortizzatori |
| aderenza alla decelerazione reale del freno (avviso, capitolo 4.4) | cabina vuota in salita in alto, a = 5,67 m/s²: T1/T2 = 5,59 contro e^(f·α) = 1,60, utilizzo **3,50** |
| forza al volantino (perdite di riduttore e vano incluse) | 36,3 N·m / 0,2 m = **182 N** ≤ 400 N ⚠️ |
| carico sull'albero, prova 1,25·Q, verso il basso | **2 496 kg** su 2 500 kg (99,8%) |

**Correggere l'aderenza** (serve f·α ≥ ln 1,645 = 0,4976), ricontrollando tutto il resto:

| Leva | Valore minimo | Aderenza | Effetto collaterale | Esito |
|---|---|---|---|---|
| togliere il rinvio | α ≥ 169,6°; con α = 180° e^(f·α) = 1,696 | OK (0,97) | funi verticali: albero **2 532 kg > 2 500** | **KO** |
| zavorra in cabina, k costante | P ≥ 766 kg (+66 kg) | OK (1,00) | albero **2 626 kg > 2 500** | **KO** |
| sottosquadro maggiore | β ≥ 97,3° → β = 100°: e^(f·α) = 1,664 | OK (0,99) | oltre i 90° raccomandati; N_equiv(t) 10 → S_f richiesto 12,87 (effettivo 14,27); più usura | OK, margini minimi |
| gola a V temprata γ = 40° | e^(f·α) = 2,101 | OK (0,78) | N_equiv(t) 10 (EN 81-50:2020, tab. 2) → S_f,calc 12,87 (effettivo 14,27); incertezze sulla tempra, più usura | OK |

Due correzioni “ovvie” su quattro rompono la verifica dell'albero; le due che passano spingono
la gola oltre l'intervallo raccomandato o verso la gola a V temprata. L'ordinamento del capitolo
8.6 mette in fondo la configurazione con due verifiche sopra il 98% e propone prima una macchina
con carico sull'albero più alto o la taglia 2:1.

## 7.3 Caso B — sostituzione su impianto con macchina in basso

Stesso impianto, ma con locale macchina in basso laterale: due pulegge in testata Ø500 mm
(inerzia 1,5 kg·m² ciascuna), 24 m tra le pulegge in testata e la puleggia di trazione, rami
verticali (α = 180°), rendimento del vano 0,80. Prova di bilanciamento: carico di equilibrio
315 kg → k = 0,50. L'argano esistente, dal rilievo:
- puleggia Ø600 mm con 4 funi Ø11 (carico di rottura stimato 57,5 kN, 0,407 kg/m) e gole con
  sottosquadro β = 95°, γ = 35°;
- rapporto 1/45 e motore a due velocità 4/16 poli, 7,5 kW, 1430 giri/min sull'avvolgimento veloce;
- rendimento della vite 0,60 (ipotesi), inerzia di motore e volano 0,25 kg·m²;
- freno con un solo elemento da 80 N·m, massa 600 kg.

Il nuovo argano è quello del caso A con il motore da 7,5 kW. Le funi nuove hanno numero e
diametro di quelle esistenti, come si fa di norma nella sostituzione (indicazione di Panev
Ascensori, capitolo 6.2): 4 × Ø11 della stessa costruzione, 57,5 kN e 0,407 kg/m.

| Grandezza | Argano esistente | Argano nuovo | Nota |
|---|---|---|---|
| velocità reale | 0,998 m/s | 0,989 m/s a 50 Hz; 1,00 m/s a 50,57 Hz | velocità nominale invariata: nessun “cambiamento della velocità” |
| D/d | 54,5 | 50,9 | stesse funi Ø11 su una puleggia più piccola |
| S_f richiesto · effettivo | 12,31 · 17,20 | 12,26 · 17,20 | due pulegge in testata: N_equiv(p) = 2·K_p |
| aderenza: caricamento · frenatura in discesa · frenatura a vuoto in salita | 0,83 · 0,87 · 0,98 | 0,85 · 0,89 · **1,005 KO** | con le stesse funi la gola del caso A (β = 90°) non basta; con β = 95°, come l'esistente, 0,984; la proposta del software sceglie β = 98° (0,970) |
| cabina bloccata | OK | tiro lato contrappeso nullo alla puleggia → OK | caso limite del capitolo 5.2 |
| potenza statica · utilizzo del motore | 7,04 kW · 94% | 6,03 kW · 80% | il riduttore nuovo rende di più |
| coppia di accelerazione / coppia nominale | 2,10 | 1,47 | il volano del motore vecchio pesa |
| freno | un solo elemento | 2 × 60 N·m: 47,0 · 36,4 · 34,3 N·m richiesti | il vecchio non rispetta i due esemplari della UNI 10411-1 (capitolo 6.6) |
| decelerazione massima del freno, tutti i gruppi | 0,21 g | 0,70 g | η_i stimato 0,333 e 0,571; da confrontare con paracadute e ammortizzatori |
| aderenza alla decelerazione reale del freno (avviso) | 1,32 a 1,74 m/s² | **4,17** a 5,54 m/s² | cabina vuota in salita in alto in entrambi; capitolo 7.4 |
| forza al volantino | 235 N | 196 N | ≤ 400 N ⚠️ |
| carico sull'albero (1,25·Q), verso l'alto | 2 460 kg | 2 460 kg | stesse funi, stesso carico; ≤ 2 500 kg della nuova macchina |
| sollevamento netto sugli ancoraggi | 1 860 kg | **2 010 kg** | +150 kg: la nuova macchina è più leggera, gli ancoraggi esistenti vanno verificati |
| coppia massima in uscita | 1 623 N·m | 1 514 N·m | da confrontare con il catalogo |

Effetto della disposizione, a parità di impianto, di argano e di funi: nel caso critico di
frenatura il rapporto T1/T2 è 1,650 con macchina in alto senza rinvio (utilizzo 0,973) e
**1,704** con macchina in basso (1,005), per il peso dei tratti discendenti e l'inerzia delle
pulegge in testata. Con la macchina in basso il margine di aderenza non basta più.

Effetto delle funi: con funi nuove 4 × Ø10 (0,336 kg/m al posto di 0,407) la stessa verifica
darebbe 0,995 e passerebbe. Nella sostituzione, però, le funi restano quelle di prima per numero
e diametro, quindi la gola nuova deve tenere almeno l'aderenza della vecchia: con β = 95° come
l'argano esistente (0,984), oppure con la gola della proposta. Il calcolatore tiene le funi
esistenti nella verifica e nella proposta, salvo che l'utente tolga la spunta.

## 7.4 Freno e aderenza alla decelerazione reale

La verifica di frenatura della norma usa 0,5 m/s². In un arresto di emergenza, però, la
decelerazione la dà il freno, e con i due gruppi che EN 81-20 chiede è molto più alta. Caso B,
argano nuovo con le funi Ø11; la regolazione minima per gruppo (36,4 N·m) è quella con cui ogni
gruppo da solo rallenta la cabina con portata a 0,5 m/s² (capitolo 4.9):

| Configurazione | Decelerazione reale (cabina vuota in salita, in alto) | Utilizzo dell'aderenza | Coppia per gruppo ammessa |
|---|---|---|---|
| 2 × 60 N·m, η_i 0,571 (stima) | 5,54 m/s² | 4,17 | da 36,4 N·m: nessuna tiene l'aderenza |
| 2 × 60 N·m, η_i = 1 (riduttore senza attrito) | 3,97 m/s² | 2,42 | nessuna |
| 2 × 36,4 N·m (minimo), η_i 0,571 | 3,11 m/s² | 1,90 | nessuna |
| 2 × 36,4 N·m, η_i = 1 | 2,06 m/s² | 1,45 | nessuna |
| gola a V temprata γ = 35°, 2 × 36,4 N·m, η_i 0,571 | 3,11 m/s² | 1,25 | nessuna; S_f richiesto 16,88 ≤ 17,20 |
| gola a V temprata γ = 35°, 2 × 36,4 N·m, η_i = 1 | 2,06 m/s² | 0,95 | da 36,4 a 38,8 N·m, con S_f in regola |
| argano esistente, 1 × 80 N·m e volano, η_i 0,333 (stima) | 1,74 m/s² | 1,32 | — |
| argano esistente, η_i = 1 | 1,14 m/s² | 1,14 | — |

Con la gola semicircolare (β = 90°) la cabina vuota in salita tiene l'aderenza solo fino a
0,48 m/s², meno della decelerazione di verifica (da qui il KO del 7.3); con la gola a V temprata
γ = 35° fino a 2,25 m/s². Il minimo dei due gruppi la frena a 2–3 m/s². Con la gola semicircolare
nessuna regolazione del freno che rispetti EN 81-20 chiude il problema: in un arresto di
emergenza a cabina vuota in salita le funi possono slittare. Con le funi Ø11 la gola a V temprata
rispetta anche S_f, e un freno regolato tra 36,4 e 38,8 N·m per gruppo terrebbe l'aderenza anche
alla decelerazione reale se il riduttore frenasse senza attrito (η_i = 1); con la stima
η_i = 0,571 no. La risposta dipende quindi dal rendimento inverso reale, da chiedere al
costruttore. Il vecchio argano, con un solo freno e il volano, frenava più dolce. Se la
lettura della norma che chiede la decelerazione reale è quella giusta, la soluzione passa dalla
gola, dall'angolo di avvolgimento, dalla taglia 2:1 o da una frenatura controllata; per questo il
calcolatore mostra il caso come avviso, con i numeri, e non come esito. La lettura va decisa sul
testo di EN 81-50 §5.11.2.2.2 ⚠️. Nella proposta il software preferisce comunque le configurazioni
che tengono l'aderenza anche alla decelerazione reale, quando i limiti della gola lo consentono.

## 7.5 Che cosa insegna l'esempio

- Nessuna verifica si può fare da sola: aderenza, carico sull'albero, funi e motore si influenzano
  a vicenda, e la correzione di una può rompere un'altra.
- La disposizione in basso peggiora l'aderenza e ribalta il carico sull'albero: sono due
  verifiche che un selettore pensato solo per la macchina in alto non farebbe.
- Il rendimento del vano e quello del riduttore decidono la taglia del motore (5,5 o 7,5 kW):
  vanno presi dal costruttore e dalla disposizione reale, non da un valore unico.
- Nella sostituzione il confronto con l'argano esistente mostra subito che cosa migliora (potenza,
  freno a due elementi) e che cosa va verificato in più (margine di aderenza, ancoraggi).
- Le funi che restano montate decidono l'esito: con 4 × Ø11, come prima, la gola del caso A non
  tiene più l'aderenza (1,005), con Ø10 la teneva (0,995). La verifica e la proposta vanno fatte
  con le funi che resteranno sull'impianto.
- Il freno a due gruppi, obbligatorio nella sostituzione, frena molto più forte del vecchio: la
  verifica di aderenza a 0,5 m/s² non basta a sapere se le funi tengono in un arresto di
  emergenza (7.4).
