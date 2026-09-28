# 4. Modello di calcolo

[← Indice](README.md)

Questo capitolo è la specifica del motore di calcolo: ogni formula diventa una funzione pura
e ogni verifica un `CheckResult` (capitolo 9.4). Legenda: ✅ confermato da almeno due fonti
indipendenti o riprodotto numericamente su un caso pubblicato; ⚠️ fonte secondaria o estratto
non letto integralmente, **da verificare riga per riga sul testo UNI EN 81-50:2020 / EN ISO
8100-2:2026 acquistato prima di scrivere il codice**; “derivazione” = meccanica elementare,
indipendente dalla norma.

## 4.1 Simboli

| Simbolo | Significato | Unità |
|---|---|---|
| Q | portata nominale | kg |
| P | massa della cabina completa (arcata, porte, operatore, paracadute, accessori) | kg |
| k | bilanciamento del contrappeso | — |
| M_cw | massa del contrappeso | kg |
| r | taglia (1 per 1:1, 2 per 2:1) | — |
| v | velocità nominale della cabina | m/s |
| H, L0 | corsa; lunghezza di fune oltre la corsa su ciascun lato (semplificazione) | m |
| n, d, q_f | numero di funi, diametro nominale, massa lineare di una fune | —, mm, kg/m |
| F_min | carico di rottura minimo di una fune (scheda del fornitore) | N |
| D, Dp | diametro primitivo della puleggia di trazione, delle pulegge di rinvio | mm |
| α | angolo di avvolgimento sulla puleggia di trazione | rad |
| β, γ | angolo del sottosquadro, angolo della gola | rad |
| i | rapporto di riduzione, i = n_motore / n_puleggia > 1 | — |
| η_d, η_i | rendimento del riduttore diretto (vite motrice) e inverso (ruota motrice) | — |
| g | 9,81 m/s² | m/s² |

## 4.2 Masse e tiri delle funi

```text
M_cw = P + k·Q
massa di una calata di funi lunga L:  m_f(L) = n · q_f · L
cabina al piano più basso:  L_cabina = H + L0,  L_contrappeso = L0
cabina al piano più alto:   L_cabina = L0,      L_contrappeso = H + L0
tiro statico lato cabina:   T_c  = [(P + carico)/r + m_f(L_cabina)] · g
tiro statico lato contrappeso: T_cw = [M_cw/r + m_f(L_contrappeso)] · g
```

Derivazione. Con taglia r:1 sulla puleggia grava una sola calata di funi per lato, mentre
cabina e contrappeso sono divisi per r. Nei casi dinamici le masse appese accelerano con
`a` e le funi con `r·a`. Compensazione (catene o funi) e cavo flessibile si aggiungono al
lato su cui gravano, in funzione della posizione della cabina; la loro esatta
modellazione va presa da EN 81-50 §5.11 ⚠️. Le formule qui sopra valgono per la macchina in alto
senza rinvii; per la macchina in basso e per ogni percorso con pulegge i tiri si calcolano con il
metodo del percorso della fune (capitolo 5.2). L'attrito di guide e pulegge riduce T1/T2 in
frenatura: si trascura nella verifica di aderenza (a favore di sicurezza) e si conta nella
potenza con il rendimento del vano; l'inerzia delle pulegge invece si conta ⚠️.

## 4.3 Cinematica, rapporto e velocità reale

```text
velocità delle funi:          v_f = r · v
giri della puleggia:          n_p = 60 · r · v / (π · D)
rapporto ideale:              i_id = n_m / n_p          (n_m = giri nominali di targa)
velocità reale:               v_reale = π · D · n_m / (60 · r · i)
frequenza per v nominale:     f = f_n · v / v_reale     (azionamento VVVF)
```

Derivazione; la formula della velocità riproduce il dato Sassi “5,62 m/s con puleggia
Ø1000” a circa 107 giri/min della puleggia. Il motore asincrono va inserito con i giri di
targa (con scorrimento), non con i giri sincroni `60·f/coppie_polari`. Lo scostamento
ammesso tra velocità reale e nominale va preso dalla norma ⚠️ (non trovato nelle fonti
consultate): nel software è un parametro del profilo normativo.

## 4.4 Aderenza (EN 81-50 §5.11)

Tre condizioni, tutte basate su Euler-Eytelwein ✅ (Mellor; Elevator World; Scientific Reports
2025, che cita §5.11.2.3 di EN 81-50):

```text
1. caricamento           T1/T2 ≤ e^(f·α)   statico, 1,25·Q, cabina in basso e in alto   μ = 0,1
2. frenatura d'emergenza T1/T2 ≤ e^(f·α)   dinamico, cabina vuota e carica, in discesa e
                                            in salita, in basso e in alto; a ≥ 0,5 m/s²
                                            (0,8 m/s² con ammortizzatori a corsa ridotta)   μ = 0,1/(1 + v_f/10)
3. cabina bloccata       T1/T2 ≥ e^(f·α)   contrappeso sugli ammortizzatori, macchina
                                            che gira in salita (cabina vuota in alto)      μ = 0,2
T1 = tiro maggiore, T2 = tiro minore
```

- La struttura (tre condizioni, due “≤” e una “≥”) e la dipendenza del caso 2 da `v_f` sono
  confermate; i valori numerici di μ, la decelerazione di 0,5 m/s² e il carico 1,25·Q
  sono ⚠️: il valore di 0,8 m/s² con ammortizzatori a corsa ridotta compare in EN 81-1
  secondo una fonte secondaria; il campione BSI di EN 81-50:2020 (p. 50, §5.11.2.3.2) parla di
  “1,25 Q più il peso dei dispositivi di movimentazione, dove usati”.
- Caso 1: il software calcola le due posizioni estreme e tiene la peggiore (di norma la cabina in
  basso).
- Caso 2: il software calcola tutte le otto combinazioni di carico (vuota, con portata), verso
  (discesa, salita) e posizione (in basso, in alto) e mostra la peggiore per ciascun verso. Di
  solito governano la cabina con portata in discesa in basso e la cabina vuota in salita in alto
  (capitolo 7: la seconda). Con contrappeso pesante e funi lunghe la riga “in discesa” può essere
  governata dalla cabina vuota in discesa in alto (14,5% di 6 013 argani casuali), che però alla
  stessa decelerazione non supera mai la cabina vuota in salita: cambia la riga, non l'esito.

**Decelerazione reale del freno (seconda verifica, per ora un avviso).** Secondo le fonti
secondarie, EN 81-50 chiede di considerare ogni parte in movimento “con la sua decelerazione” e
fissa solo il minimo di 0,5 (0,8) m/s² ⚠️. In un arresto di emergenza la decelerazione vera la
dà il freno, e con due gruppi dimensionati secondo EN 81-20 è spesso molto più alta del
minimo. Il software calcola anche questa, per ogni combinazione del caso 2, con tutti i gruppi e
riduttore rigido (funi che non slittano):

```text
ruota lenta che trascina il riduttore (η_i):  β = (M_f − η_i·M_g/i) / (J_m·i + η_i·J_l/i)
motore che trascina il riduttore (η_d):       β = (η_d·i·M_f − M_g) / (J_l + η_d·J_m·i²)
a = β · D / (2·r),   a_verifica = max(a, 0,5 o 0,8 m/s²)
M_f: coppia totale del freno sull'albero motore; M_g: squilibrio statico alla puleggia · D/2,
     > 0 se asseconda il moto; J_l: inerzia del lato lento riportata alla puleggia
     (masse, funi, puleggia, rinvii); β: decelerazione angolare della puleggia
η_i ≈ 2 − 1/η_d se il costruttore non lo dà (vite senza fine; 0 = irreversibile)
```

Derivazione: equilibrio dei momenti sui due alberi con il rendimento del riduttore nel verso in
cui passa la potenza. L'attrito del riduttore aumenta la decelerazione, come il volano dei vecchi
argani la attenua. Il risultato è mostrato come avviso e non cambia l'esito, finché la lettura
di §5.11.2.2.2 non è confermata sul testo della norma; insieme il software dà l'intervallo della
coppia del freno: dal minimo richiesto da EN 81-20 (4.9) al massimo che tiene l'aderenza alla
decelerazione reale. Nel capitolo 7 quell'intervallo è vuoto con la gola semicircolare
(capitolo 7.4).

Fattore della gola `f` (forma di EN 81-1 Allegato M, ripresa in EN 81-50 §5.11.2.3) ⚠️:

```text
gola semicircolare con sottosquadro:
    f = μ · 4·(cos(γ/2) − sin(β/2)) / (π − β − γ − sin β + sin γ)
    (gola semicircolare senza sottosquadro: β = 0)
gola a V temprata (e ogni gola a V nel caso “cabina bloccata”):
    f = μ / sin(γ/2)
gola a V non temprata, casi caricamento e frenatura:
    f = μ · 4·(1 − sin(β/2)) / (π − β − sin β)
```

Controllo di coerenza: con queste formule una gola a V non temprata con β = 105° e una a V
temprata con γ = 50° danno entrambe f ≈ 0,2 in frenatura a 1 m/s (0,219 e 0,215), come nell'esempio
di Mellor. È un controllo di plausibilità, non una verifica del testo.

Limiti geometrici delle gole: la norma pone un limite superiore a β (EN 81-1: 106°) ⚠️;
Montanari raccomanda β ≤ 90° e non oltre 105°, γ ≥ 32°, consigliato 35–40° (documento
tecnico del costruttore). L'usura modifica la geometria della gola e quindi l'aderenza
(Montanari): nella verifica dell'argano esistente il software usa gli angoli misurati.

## 4.5 Funi (EN 81-20 §5.5 ed EN 81-50 §5.12)

Requisiti minimi:

- D/d ≥ 40 per funi di acciaio secondo ISO 4344 ✅ (ELA 2026: “la vecchia regola D/d ≥ 40 resta
  applicabile senza considerazioni di fatica”).
- Almeno due funi indipendenti, ciascuna con il proprio attacco (Direttiva 2014/33/UE,
  Allegato I, testo riportato da fonte secondaria) ⚠️.
- Diametro nominale ≥ 8 mm salvo approvazione di un organismo notificato ⚠️.
- Coefficiente di sicurezza minimo: 12 con tre o più funi, 16 con due funi ⚠️.

Coefficiente di sicurezza richiesto (EN 81-50 §5.12, ex EN 81-1 Allegato N) ✅ riprodotto
numericamente su due casi pubblicati:

```text
N_equiv   = N_equiv(t) + N_equiv(p)
N_equiv(p) = K_p · (N_ps + 4·N_pr),   K_p = (D / Dp_medio)^4
S_f,calc  = 10^[ 2,6834 − ( log10(695,85·10^6 · N_equiv / (D/d)^8,567)
                            / log10(77,09 · (D/d)^−2,894) ) ]
S_f,richiesto = max(S_f,calc ; minimo normativo)
S_f,effettivo = F_min / T_max,fune,   T_max,fune = [(P + Q)/r + m_f(H + L0)] · g / n
```

Riproduzioni (la divisione va fatta prima della sottrazione: solo così i casi tornano): la
relazione di calcolo pubblicata da liftdesign.it (N_equiv = 20,898, D/d ≈ 50,9) dà S_f = 16,69
esattamente; il caso di Mellor (N_equiv = 7, D/d = 40) dà 16,4
contro “circa 16”. N_ps = pulegge con flessione semplice, N_pr = pulegge con flessione
inversa; la regola su quando una flessione inversa va contata (distanza tra le pulegge)
va presa dalla norma ⚠️. La definizione di T_max,fune (cabina ferma al piano più basso con
la portata) è quella di EN 81-1 ⚠️.

Valori di N_equiv(t):

| Gola | N_equiv(t) | Stato |
|---|---|---|
| semicircolare senza sottosquadro | 1 | ✅ |
| semicircolare con sottosquadro β = 90° | 5,0 | ⚠️ indiretto (vita della fune ridotta dell'80%) |
| semicircolare con sottosquadro β = 105° | 15,2 | ✅ |
| a V, γ = 35° | 18,5 | ✅ |
| altri angoli (β 75–100°, γ 36–45°) | tabella 2 di EN 81-50 | ⚠️ da trascrivere dal testo acquistato |

Il calcolatore prototipo usa per gli altri angoli valori **provvisori, non verificati**:
β 75° → 2,5; 80° → 3,0; 85° → 3,8; 95° → 6,7; 100° → 10,0; γ 36° → 15,2; 38° → 10,5; 40° → 7,1;
42° → 5,6; 45° → 4,0 ⚠️. Tra due punti **non interpola**: prende il valore del punto più
sfavorevole (il β superiore, il γ inferiore), perché la tabella non dà una regola di
interpolazione e quella lineare sottostimerebbe N_equiv (β = 96°: 7,36 invece di 10,0).
Fuori tabella prende il valore più sfavorevole (β < 75° → 2,5; γ > 45° → 4,0), rifiuta γ < 35° e
tra 105° e il limite di 106° estrapola dall'ultimo tratto, segnalando il valore come non
verificato. I valori vanno sostituiti con la tabella 2 prima dell'uso.

Pressione specifica nella gola: presente in EN 81-1 fino all'edizione 1986, sostituita dal
calcolo del coefficiente di sicurezza dell'Allegato N nell'edizione 1998 (Elevator World,
“Rope-Specific Pressure”). Nel software va offerta solo come verifica di buona pratica o
come limite del costruttore, mai come verifica normativa ⚠️.

## 4.6 Carico sull'albero della puleggia

```text
R = √( T1² + T2² + 2·T1·T2·cos(π − α) )
```

Derivazione: somma vettoriale dei due tiri; con α = 180° (funi verticali) R = T1 + T2. Casi
da calcolare: cabina con portata al piano più basso; prova statica con 1,25·Q ⚠️. Il
confronto con il “carico statico massimo sull'albero” del catalogo va fatto nella
definizione del costruttore (capitolo 8.2): nessun costruttore consultato pubblica la
formula con cui lo intende. Con la macchina in basso la risultante è diretta verso l'alto e
conta anche il sollevamento netto sugli ancoraggi (capitolo 5.5).

## 4.7 Riduttore

```text
ΔF_carica   = [(P + Q − M_cw)/r + m_f(L_cabina) − m_f(L_contrappeso)] · g   (cabina carica in salita dal basso)
ΔF_vuota    = [(M_cw − P)/r + m_f(L_contrappeso) − m_f(L_cabina)] · g       (cabina vuota in discesa dall'alto)
ΔF          = il maggiore dei due (con k > 0,5 o funi lunghe sul lato contrappeso governa il
              secondo: 34% di 6 013 argani casuali con k tra 0,40 e 0,55)
M_p,statica = ΔF · D/2
M_p,max     = M_p,statica + J_ext,p · (2·r·a/D)                            (durante l'accelerazione, caso peggiore)
```

- `M_p,max` va confrontato con la coppia massima in uscita del riduttore, se il costruttore
  la pubblica; altrimenti con la sua tabella portata/velocità.
- Rendimento della vite senza fine (derivazione dalla teoria degli ingranaggi):
  `η_d = tan λ / tan(λ + φ')`, `η_i = tan(λ − φ') / tan λ` (λ angolo d'elica, φ' angolo
  d'attrito). Dipende dal rapporto e dal numero di principi: il software usa il valore
  del costruttore **per rapporto**. Intervalli trovati solo in fonti generiche (30–90%);
  Sassi pubblica un “rendimento statico” per ogni rapporto. L'irreversibilità della vite
  non va mai considerata un dispositivo di sicurezza.
- Capacità termica: il riduttore a vite senza fine ha capacità termica inferiore a quella
  degli ingranaggi elicoidali (DIN 3996:2019-09; ISO/TS 14521:2020). Nella pratica la
  verifica usa la potenza termica e gli avviamenti/ora dichiarati dal costruttore.

## 4.8 Motore

```text
potenza statica:            P_st = ΔF · v_f / η,       η = η_d · η_vano
formula semplificata:       P ≈ (1 − k) · Q · g · v / η          (senza funi né compensazione)
coppia nominale:            M_n = 9550 · P_n[kW] / n_n
coppia statica al motore:   M_st = M_p,statica / (i · η)
inerzia riportata al motore: J_ext = (P + Q + M_cw)·(D/(2·r·i))² + m_funi·(D/(2·i))² + J_puleggia/i²
coppia di accelerazione:    M_acc = M_st + (J_ext/η + J_motore) · α_m,   α_m = 2·r·i·a/D
coppia efficace (termica):  M_rms = √( Σ M_k²·t_k / T_ciclo ),  T_ciclo = 3600 / avviamenti_ora
```

Derivazioni standard. η_vano è il rendimento del vano (pulegge, guide, funi): secondo Elevator
World va tipicamente dal 60% all'86% (capitolo 5.6). La formula semplificata sottostima la
potenza quando le funi non sono compensate: nel capitolo 7, con 18 m di corsa, del 7% circa.
Le condizioni di servizio (S3, S4, S5 e rapporto di intermittenza) seguono IEC 60034-1; il confronto di
`M_acc` va fatto con la coppia che motore **e** inverter possono dare per il tempo di
accelerazione (dati di targa, non valori tipici).

## 4.9 Freno (EN 81-20 §5.9.2.2)

Requisito ⚠️ (stessa formulazione trovata in due ricerche indipendenti): il freno da solo deve
arrestare la macchina con la cabina in discesa alla velocità nominale con la portata più il
25%, con decelerazione media non superiore a quella dell'intervento del paracadute o
dell'arresto sugli ammortizzatori. Gli organi meccanici sono in almeno due gruppi; se uno
non agisce, l'altro deve ancora rallentare, arrestare e tenere ferma la cabina in discesa a
velocità nominale con la portata **e in salita a vuoto** (formulazione riportata dalle sintesi
della UNI 10411-1:2021; da confrontare con EN 81-20 §5.9.2.2) ⚠️.

```text
coppia richiesta al motore (tutti i gruppi, 1,25·Q):
    M_f ≥ [(P + 1,25·Q − M_cw)/r + m_f(L_cabina) − m_f(L_contrappeso)]·g·(D/2)·η_i/i + J_tot·a_f·2·r·i/D
coppia richiesta a un singolo gruppo: stessa formula con Q al posto di 1,25·Q, e caso a vuoto in
    salita con lo squilibrio del contrappeso [M_cw − P + funi]·g al posto di quello della cabina
```

- Scelta prudente: `η_i = 1` (l'attrito del riduttore aiuta il freno, ma non ci si conta).
- `a_f` è la decelerazione minima voluta (dato di progetto, > 0).
- Verifica inversa: con la coppia di catalogo si calcola la decelerazione reale di ogni caso di
  frenata (formula del 4.4, qui con l'η_i del costruttore o stimato, perché l'attrito la
  aumenta). La **massima** si confronta con il limite del paracadute o degli ammortizzatori
  (1 g ⚠️). Di solito è quella della cabina vuota in discesa, dove gravità e freno si sommano
  sulla massa più piccola.
- Intervallo della coppia per gruppo: il minimo è il più alto dei requisiti qui sopra; il massimo
  è la coppia oltre la quale, alla decelerazione reale, l'aderenza non regge più in qualche caso
  (4.4). Se il minimo supera già il massimo, nessuna regolazione del freno risolve: servono più
  aderenza (gola, angolo di avvolgimento) o una frenatura più dolce.

## 4.10 UCMP e protezione contro la velocità eccessiva in salita

EN 81-20 §5.6.6 (velocità eccessiva in salita) e §5.6.7 (movimenti incontrollati della
cabina) esistono nella versione 2020 ✅. Nelle macchine gearless il freno agisce sullo
stesso albero della puleggia e può essere certificato come elemento di arresto; nella
macchina geared il freno standard sta sull'albero veloce del motore e tra lui e la puleggia
c'è il riduttore ⚠️ (fonti secondarie concordi). Le soluzioni sul mercato:

- freno sull'albero lento: Sassi MF84 con freno certificato per velocità eccessiva in salita
  e UCM secondo EN 81-20:2020 / EN 81-50:2020; Montanari M105B con freno di emergenza
  sull'albero lento (fonti del costruttore); CMF dichiara la conformità a EN 81-20:2014 §5.6.7 per
  AMI 100 MONO UCM, tipo di macchina da verificare ⚠️;
- freno sulle funi o paracadute bidirezionale (dispositivi esterni alla macchina) ⚠️.

Attenzione: secondo CMA & Partners un freno sull'albero lento di un albero sostenuto da più
di due supporti non è riconosciuto da EN 81-20:2020 come componente di sicurezza ⚠️. Regola del
software: se il freno agisce sull'albero motore, la configurazione è ammissibile solo con un
dispositivo esterno certificato, e il report ne riporta certificato e limiti (masse,
velocità). Questa regola vale per gli impianti nuovi; nella sostituzione dell'argano valgono gli
adeguamenti della UNI 10411-1 (capitolo 6.6).

## 4.11 Manovra di emergenza

```text
M_man = M_p,statica / (i · η_d · η_vano)      (cabina con portata in salita, freno aperto)
F_volantino = M_man / r_volantino
```

Se la forza supera 400 N, o se la macchina non ha volantino, serve la manovra elettrica di
emergenza ⚠️ (Elevator World, “Electrical Safety Devices in Elevators”; lo stesso valore era in
EN 81-1).

## 4.12 Riepilogo delle verifiche

| Id | Verifica | Limite | Stato della fonte |
|---|---|---|---|
| `kin.speed` | velocità reale vs nominale | tolleranza del profilo normativo | ⚠️ |
| `rope.dd` | D/d | ≥ 40 | ✅ |
| `rope.count_diameter` | numero e diametro delle funi | ≥ 2; ≥ 8 mm | ⚠️ |
| `rope.safety_factor` | S_f,effettivo | ≥ max(S_f,calc; 12 o 16) | ✅ formula / ⚠️ minimi |
| `traction.loading` | T1/T2 caricamento | ≤ e^(f·α) | ⚠️ valori |
| `traction.braking` | T1/T2 frenatura, otto combinazioni a 0,5 (0,8) m/s² | ≤ e^(f·α) | ⚠️ valori |
| `traction.braking_real` | T1/T2 frenatura alla decelerazione reale del freno (avviso) | ≤ e^(f·α) | ⚠️ lettura della norma |
| `traction.stalled` | T1/T2 cabina bloccata | ≥ e^(f·α) | ⚠️ valori |
| `shaft.load` | carico sull'albero | ≤ dato del costruttore | derivazione + catalogo |
| `gear.torque` | coppia in uscita | ≤ dato del costruttore | derivazione + catalogo |
| `gear.thermal` | potenza termica, avviamenti/ora | ≤ dato del costruttore | catalogo |
| `motor.power` | potenza statica | ≤ potenza nominale | derivazione |
| `motor.accel_torque` | coppia di accelerazione | ≤ capacità motore + inverter | derivazione + catalogo |
| `motor.rms` | coppia efficace | ≤ coppia nominale | derivazione (IEC 60034-1) |
| `brake.torque` | 1,25·Q tutti i gruppi; un gruppo con Q in discesa e a vuoto in salita | ≥ coppia richiesta | ⚠️ |
| `brake.max_decel` | decelerazione massima | ≤ paracadute / ammortizzatori | ⚠️ |
| `brake.range` | coppia per gruppo tra il minimo richiesto e il massimo per l'aderenza reale | intervallo non vuoto | derivazione |
| `ucmp.route` e `acop.route` | organo di arresto ammesso | certificato valido | ⚠️ |
| `rescue.manual` | forza al volantino | ≤ 400 N, altrimenti manovra elettrica | ⚠️ |
| `layout.uplift` | sollevamento netto (macchina in basso) | ≤ capacità degli ancoraggi | derivazione + dato strutturale |
| `rope.fleet_angle` | deviazione laterale delle funi | soglia configurabile | ⚠️ |
