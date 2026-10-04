# Funi con la macchina in basso: disposizioni, pulegge, flessioni e carichi

[← Indice](README.md)

> Raccolta del 1° ottobre 2026 per i cataloghi e i disegni di Argano. I file di lavoro citati nel testo (cartella `raw/`,
> script e registri della sessione) non sono nel repository: restano come traccia del metodo.


Ricerca per Argano (verifica dell'argano geared nella sostituzione). Data: 1 ottobre 2026.
File di lavoro nella stessa cartella: `raw/funi_geom.py` (verifica numerica della geometria),
`raw/funi-in-basso-log.md` (registro di ricerca), testi delle fonti in `raw/it`, `raw/is`, `raw/hk`, `raw/gh`.

## 0. Metodo, limiti, legenda

**Limite principale, da leggere per primo.** Il budget di ricerca web della sessione era già esaurito
(200 su 200) prima della prima ricerca di questo compito. L'apertura diretta delle pagine è bloccata dal
proxy (EGRESS_BLOCKED) per tutti i siti richiesti: elevatorworld.com, patents.google.com, espacenet,
USPTO, liftescalatorlibrary.org, normattiva.it, anacam.it, archive.org e altri. Restava raggiungibile solo
GitHub (ricerca nel codice e `raw.githubusercontent.com`). Per questo:

- **non** ho consultato Janovský, Barney/Al-Sharif, CIBSE D, Strakosch/Caporale, Elevator World,
  ANACAM, i cataloghi Montanari/Sassi/SICOR, i brevetti con disegni e il testo di EN 81-20/50;
- ho letto per intero due testi primari pubblici trovati su GitHub: il **DPR 1497/1963** (testo
  Normattiva) e la **IS 14665 (Part 4):2001** (norma indiana sugli ascensori elettrici a fune,
  pubblicata in rete con la nota «Disclosure to Promote the Right To Information»);
- ho trovato un **caso reale** di macchina sotto il vano (Metropolis Trust Building, San Francisco, 1907);
- la geometria delle disposizioni è **ricostruita** da me con le regole delle fonti e verificata con lo
  script. Non è il disegno di un impianto reale: va confermata con rilievi di cantiere (Panev) o con le
  fonti del capitolo 14.

Nessuna figura e nessun brano sono copiati: le geometrie sono descritte con coordinate proprie.

| Simbolo | Significato |
|---|---|
| ✅ | letto in questa sessione sul testo della fonte |
| 🔶 | da estratti dei motori di ricerca raccolti nelle ricerche precedenti del repository (`research/argano-geared/11-fonti.md`, ricerca sulle tavole del 30/9): non riaperto oggi |
| ⚠️ | ricordo dell'autore, non verificato: da controllare sul testo |
| 🧮 | mia derivazione geometrica o meccanica (inferenza), calcolata con `raw/funi_geom.py` |

## 1. Che cosa dicono le fonti lette (✅)

### 1.1 DPR 29 maggio 1963 n. 1497 (regolamento ascensori e montacarichi in servizio privato)

Il regolamento valeva per gli impianti installati in Italia tra il 1964 e il 1999, cioè, presumibilmente
(inferenza), per gran parte degli impianti con locale macchine in basso su cui si fa oggi la sostituzione.

| Articolo | Contenuto (parafrasi) | Che cosa serve ad Argano |
|---|---|---|
| 5.1 | Le strutture portanti **del macchinario e delle pulegge di rinvio** si calcolano per i carichi fissi più **1,5 volte** il carico statico massimo trasmesso dalle funi (peso delle funi compreso), con coefficiente di sicurezza **≥ 6** per acciaio e cemento armato | carico di progetto delle travi in testata e degli ancoraggi della macchina in basso |
| 5.2 | Le travi portanti, sotto quel carico, hanno freccia **≤ 1/1500** della luce libera | verifica delle travi dei rinvii |
| 6, 7, 8 | «Locali del macchinario **e delle pulegge di rinvio**»: stesse regole per i due locali (niente canne fumarie o tubazioni estranee, spazio per ispezione e manutenzione, accesso diretto e sicuro senza scale verticali, illuminazione, chiusura a chiave, cartello) | il **locale pulegge** era un locale previsto e regolato |
| 6.3 | Altezza del locale del macchinario ≥ 2 m dove si fa manutenzione; nessuna altezza fissata per il locale pulegge | — |
| 6.4 | Solo per le pulegge di rinvio sono tollerate coperture scorrevoli o ribaltabili, se necessario | locale pulegge con copertura apribile |
| 9.2 | Le aperture per il passaggio delle funi nel vano devono essere le più piccole possibili | fori nel solaio, nella parete e nel fondo della fossa |
| 23.2 | Con il contrappeso sugli arresti: ≥ 0,8 m tra il tetto della cabina e la parte più sporgente del soffitto del vano; ≥ 0,3 m tra le parti più sporgenti sopra la cabina e quelle del soffitto | i rinvii appesi sotto il solaio sono «parti sporgenti del soffitto» |
| 23.3 | Ammortizzatori invece degli arresti fissi se v > 0,85 m/s o se cabina o contrappeso si muovono sopra locali accessibili | macchina sotto il vano |
| 33.1–33.2 | Contrappeso sopra un locale accessibile senza un pilastro fino al terreno: paracadute del contrappeso (progressivo se v > 0,85 m/s) | macchina sotto il vano |
| 35.3, 35.5 | Funi ≥ 8 mm; diametro di avvolgimento **≥ 40 volte** il diametro della fune e ≥ 500 volte il diametro dei fili (escluso il filo centrale dei trefoli) | vale per ogni puleggia, rinvii compresi |
| 36.1 | Coefficiente di sicurezza convenzionale delle funi ≥ 12 (statico) | confronto con l'impianto originale |
| 37.1 | Aderenza: (T1/T2)·c1·c2 ≤ e^(f·α), con cabina al piano più basso con 1,5·portata e cabina vuota al piano più alto; c1 ≥ 1,15 (a ≥ 0,7 m/s²); c2 = 1,2 per gola a cuneo, 1 per gola semicircolare con intaglio | verifica storica dell'impianto |
| 43.3 | Distanza orizzontale **≥ 50 mm** tra contrappeso e cabina e tra contrappeso e pareti (guide rigide); con guide a fune +8 mm per ogni metro di fune libera | gioco dietro il contrappeso, analogia per le funi |

Fonte: copia del testo Normattiva su GitHub (vedi capitolo 13, voce F1).

### 1.2 IS 14665 (Part 4):2001, Bureau of Indian Standards

| Punto (pagina del fascicolo) | Contenuto (parafrasi) |
|---|---|
| Sec 7, §4.3 (p. 23) | Pulegge di trazione **a sbalzo**: precauzioni contro l'uscita delle funi dalle gole e contro oggetti che si infilano tra funi e gole **quando la macchina non è sopra il vano**; le protezioni non devono impedire ispezione e manutenzione |
| Sec 7, §4.4 (p. 23) | Protezione delle parti rotanti accessibili; puleggia di trazione, volantino e tamburo del freno esclusi ma verniciati di giallo almeno in parte |
| Sec 3, §6.2 (p. 9) | Pulegge sul contrappeso: dispositivi contro l'uscita delle funi allentate e contro l'introduzione di oggetti |
| Sec 3, §8.2 (p. 9) | Pulegge di deviazione o secondarie **allineate** con la puleggia di trazione; gole lavorate |
| Sec 3, §8.3 e tab. 1 (pp. 9–10) | Raggio della gola dei rinvii maggiore del raggio della fune di 0,75 mm (d ≤ 16), 1,25 (18–22), 1,5 (24–27), 2,5 (≥ 31); la gola abbraccia almeno un terzo della circonferenza della fune |
| Sec 3, §8.4 (p. 10) | Diametro di pulegge e rinvii ≥ d·(2,95·S + 37), S velocità della fune in m/s, minimo 40·d (a 1 m/s: 39,95·d; a 2 m/s: 42,9·d) |
| Sec 8, §2.3 (p. 25) | Il numero di flessioni inverse influisce in modo deciso sulla vita della fune; con 2:1 la fune percorre il doppio della corsa |
| Sec 8, §7.3 (pp. 30–31) | Con macchina **«basement drive»** si ispezionano dal tetto della cabina, in discesa, i tratti che vanno dalla puleggia della macchina e dal contrappeso alle **pulegge in testata** («overhead wheels»); il resto dalla fossa |

La §7.3 della Sec 8 conferma come disposizione reale e normata la «macchina in basso con pulegge in
testata»; la §4.3 della Sec 7 conferma la puleggia di trazione a sbalzo con macchina non sopra il vano.

### 1.3 Un caso reale di macchina sotto il vano

Metropolis Trust Building, 625 Market Street, San Francisco, 1907 (pagina dell'installatore Star
Elevator, premio Elevator World «Project of the Year»): argani gearless **«basement traction» sotto i
vani**. Per avere il giusto angolo di uscita delle funi dalle pulegge in testata i **contrappesi correvano
in vani diversi da quelli delle cabine**, con un percorso «incrociato» e più di 3/4 di miglio (circa 1,2 km)
di fune per cabina. Nel rifacimento le macchine sono state portate in alto. È la conferma pratica del
vincolo dei «corridoi» del capitolo 2.2 ✅.

## 2. Regole geometriche comuni a tutte le disposizioni (🧮)

Convenzioni: in pianta, **C** è la calata della cabina (attacco 1:1 al centro dell'arcata) e **W** quella
del contrappeso; **M_c** e **M_w** sono i rami che scendono alla macchina dal lato cabina e dal lato
contrappeso; **s** è la distanza in pianta tra una calata e il suo ramo verso la macchina; **Dp** è il
diametro dei rinvii; **Hv** è la distanza verticale tra gli assi dei rinvii in testata e il punto in cui il
ramo smette di essere verticale (tangenza sulla trazione o su un rinvio in basso).

**2.1 Deviazione di 180° per lato.** Su ogni lato la fune sale dalla cabina (o dal contrappeso) e deve
riscendere verso la macchina: in testata serve una deviazione totale di 180°.

| Caso | Soluzione | Flessioni |
|---|---|---|
| s = Dp | un rinvio a 180° | 1 semplice |
| s ≈ Dp (scarto di pochi cm) | un rinvio a 180° con ramo leggermente inclinato: angolo = atan((s − Dp)/Hv); 50 mm su 24 m = 0,12°, avvolgimento 180,1° | 1 semplice |
| s > Dp | due rinvii a 90° alla stessa quota, con tratto orizzontale lungo s − Dp (Dp uguali): s = 1,0 m e Dp = 0,5 m danno 0,50 m | 2 semplici, stesso verso |
| s < Dp in modo marcato | non si risolve riducendo Dp sotto 40·d (DPR 35.5): si sposta il ramo o si usa l'inclinazione | — |

Ogni rinvio sta nel piano verticale che contiene le due verticali che collega: i due lati possono avere
piani diversi e, con rami verticali, non nasce deviazione laterale.

**2.2 Corridoi liberi.** I rami che scendono alla macchina devono passare fuori dalla pianta della
cabina e del contrappeso, con un gioco che propongo di almeno 50 mm per analogia con il DPR, art. 43.3
(inferenza), e lontano dalle staffe delle guide. Con l'arcata al centro della cabina il ramo di un solo
rinvio a 180° cadrebbe a Dp = 0,4–0,5 m dalla calata, cioè **dentro la pianta della cabina** per
qualunque cabina normale (mezza larghezza e mezza profondità oltre 0,4 m). Per questo il lato cabina
richiede di solito **due rinvii a 90°**, a meno che:

- l'arcata sia a sbalzo («a zaino») con l'attacco vicino alla parete delle guide;
- la cabina sia molto stretta e il ramo passi nel gioco tra cabina e parete;
- la sospensione sia 2:1 con pulegge sotto la cabina (capitolo 7).

Il caso di San Francisco (1.3) mostra lo stesso vincolo risolto spostando i contrappesi.

**2.3 Verso delle flessioni.** I rinvii in testata piegano la fune passando sopra; la puleggia di
trazione in basso la piega passando sotto: i versi sono opposti, ma i punti di contatto distano circa Hv
(24 m = 2182·d con funi da 11 mm), molto oltre 200·d, quindi **non** è una flessione inversa. Due rinvii a
90° sullo stesso lato piegano nello stesso verso: due flessioni semplici. Un rinvio vicino alla macchina
che porta in verticale il ramo uscito **dall'alto** della trazione piega in verso opposto e a meno di 1 m:
**flessione inversa** (capitolo 3.3).

**2.4 Puleggia di trazione.** Con i due rami verticali verso l'alto, o con i due rami orizzontali dalle
tangenti alta e bassa, l'avvolgimento è 180°; scarti di pochi centimetri su 24 m cambiano α di decimi di
grado (20 mm: 0,05°; 100 mm: 0,24°; 300 mm: 0,72°). La direzione del carico sull'albero segue i rami:
**verso l'alto** con rami verticali, **orizzontale verso il vano** con rami orizzontali.

**2.5 Deviazione laterale.** Uno scostamento ripartito sull'intera altezza è trascurabile (0,1–0,7°).
Lo stesso scostamento su un tratto corto non lo è: 0,10 m su 0,5 m tra la trazione e un rinvio vicino
valgono 11°. La IS 14665 chiede rinvii allineati con la trazione (§8.2, qualitativo) ✅; un limite
numerico nelle norme EN 81 non è stato trovato (capitolo 5.4 della ricerca) e l'indicazione dei
fabbricanti di funi è 2,5° per lato, non specifica per gli ascensori (Mennens) 🔶.

**2.6 Altezza fino ai rinvii (Hv).** Con i rinvii sotto il solaio, Hv va dall'asse dei rinvii all'asse
della trazione. Con un locale pulegge gli assi salgono sopra il solaio: nell'esempio del capitolo 4.1
da 24,60 a 25,70 m, quindi Hv cresce di 1,1 m. Con rinvii in basso Hv arriva al rinvio in basso; i tratti
orizzontali non pesano sui tiri ma aggiungono attrito e inerzia.

**2.7 Diametri.** Pulegge e rinvii ≥ 40·d (DPR 35.5 ✅; IS 14665 §8.4 ✅; EN 81-20 5.5.2.1 🔶): 400 mm con
funi da 10 mm, 440 mm da 11, 520 mm da 13. Il fattore K_p = (D/Dp)⁴ penalizza i rinvii più piccoli della
trazione: con D = 600 mm vale 2,07 per Dp = 500 e 3,46 per Dp = 440.

**2.8 Come le funi passano dal locale al vano.** Quattro modi, tutti con aperture minime (DPR 9.2 ✅):

| Modo | Pulegge in più | Flessioni in più | Carico sull'albero | Dove |
|---|---|---|---|---|
| trazione nel vano, a sbalzo attraverso un'apertura della parete | nessuna | nessuna | verso l'alto | 3.1 |
| rami orizzontali attraverso la parete, rinvii in basso nel vano | 2 (90° + 90°) | 1 semplice + 1 inversa | orizzontale | 3.3 |
| rami verticali attraverso fori nel fondo della fossa | nessuna | nessuna | verso l'alto | 5 |
| rami verticali in un cavedio, ingresso dal soffitto del locale | nessuna in basso | nessuna in basso | verso l'alto | 4.2 |

I rami possono essere leggermente inclinati se l'inclinazione è ripartita sull'altezza (capitoli 2.1 e
2.5); un passaggio inclinato su pochi metri, per esempio dentro il solaio del locale, non è ammissibile
senza un rinvio.

## 3. Disposizione 1: rinvii su travi in testata, locale macchine in basso dietro la parete del contrappeso

**Dati dell'esempio** (capitolo 7, caso B): P = 700 kg, Q = 630 kg, contrappeso 1015 kg, 4 funi da 11 mm
(0,407 kg/m), corsa H = 18 m, L0 = 2 m, Hv = 24 m, trazione Ø600, rinvii Ø500 (Dp/d = 45). Pianta
ipotetica: cabina 1,20 × 1,45 m appesa al centro, C = (0; 0); contrappeso 0,80 × 0,15 m dietro la cabina,
W = (0; 0,85); parete di fondo a u = 1,10 m. Il gioco tra contrappeso e parete passa da 50–80 mm
(macchina in alto) a **175 mm**, perché deve contenere i rami: 50 mm + 60 mm di funi affiancate + 50 mm,
più il margine (inferenza). Coordinate in metri: x lungo la parete di fondo, u dalla cabina verso la
parete, y in verticale con y = 0 al pavimento del locale macchine (allo stesso livello della fossa) e
l'asse della trazione a y = 0,60.

### 3.1 Variante 1A: puleggia di trazione nel vano, a sbalzo dal locale dietro la parete

Il gruppo motore e riduttore sta nel locale; l'albero lento attraversa la parete e la puleggia lavora nel
vano, nel gioco dietro il contrappeso, con il piano parallelo alla parete. I due rami salgono in verticale
nel vano. Elementi della disposizione documentati: puleggia a sbalzo con macchina non sopra il vano (IS
14665 Sec 7 §4.3 ✅); aperture minime (DPR 9.2 ✅); pulegge in testata con «basement drive» (IS 14665 Sec 8
§7.3 ✅). EN 81-1 ammetteva, a certe condizioni, la puleggia di trazione nel vano con il locale macchine
adiacente e la manutenzione fatta dal locale ⚠️.

```text
PIANTA (sopra la fossa)                         x →
 u=1,10   ═════════════ parete di fondo ═════════════  (oltre: locale macchine, solo in basso)
 u=1,01         M_c ●━━━━ trazione Ø600 ━━━━● M_w      centro (0,22; 1,01), asse lungo u
              (x -0,08)                  (x 0,52)
 u=0,925   ┌──────── contrappeso 0,80 × 0,15 ────────┐
 u=0,85    │               W (0; 0,85)                │
 u=0,775   └──────────────────────────────────────────┘
 u=0,725  ┌───────────── retro della cabina 1,20 × 1,45 ─────────────┐
 u=0      │                     C (0; 0)                              │
```

```text
SEZIONE SCHEMATICA (i due lati stanno in piani diversi)
 y=24,85 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ sommità dei rinvii (sopra: travi e solaio)
  24,60    A1 ◯━━━━━ 0,51 m ━━━━━◯ A2           ◯ B          rinvii Ø500
           90°┃                  ┃90°        ┏━━┛ ┗━━┓ 180°
              ┃ (cabina)         ┃           ┃(contr.)┃
              ┃                  ┃           ┃        ┃      i rami alla macchina scendono
              ▼                  ┃           ▼        ┃      verticali dietro il contrappeso
                                 ┃                    ┃
  0,60 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┗━━━━━━ ◯ ━━━━━━━━━━┛  trazione Ø600, 180°, nel vano
```

| Elemento | Centro in pianta (x; u) | Quota asse y | Piano | Avvolgimento | Flessione |
|---|---|---|---|---|---|
| A1, rinvio lato cabina sopra C | (−0,020; 0,249) | 24,60 | per C e M_c (4,5° dall'asse u) | 90° | semplice |
| A2, rinvio lato cabina sopra M_c | (−0,060; 0,761) | 24,60 | stesso di A1 | 90° | semplice, stesso verso di A1 |
| trazione | (0,22; 1,01) | 0,60 | parallelo alla parete | 180° | (N_equiv(t) della gola) |
| B, rinvio lato contrappeso | (0,239; 0,924) | 24,60 | per W e M_w (17,1° dall'asse x) | 180,1° | semplice |

- Lato cabina: 2 rinvii; lato contrappeso: 1 rinvio. s_A = 1,013 m > Dp, tratto orizzontale 0,513 m;
  s_B = 0,544 m ≈ Dp, ramo inclinato di 0,105° (44 mm su 24 m).
- A2 e trazione, trazione e B: versi opposti a 24 m (2182·d): **non** inverse.
- **N_ps = 3, N_pr = 0**; K_p = (600/500)⁴ = 2,07; N_equiv(p) = 6,22. Con il valore provvisorio
  N_equiv(t) = 6,7 della gola β = 95°: S_f richiesto **13,02** contro **12,31** del modello attuale a due
  rinvii (che riproduce il capitolo 7.3).
- A2 e B stanno sopra la pianta del contrappeso: il contrappeso alla quota più alta deve restare sotto
  di loro con margine (con L0 = 2 m il suo attacco è circa 2 m sotto gli assi).
- Carico sull'albero verso l'alto: protezione contro l'introduzione di oggetti (capitolo 9).
- A1 è nella proiezione del tetto della cabina: conta per le distanze in testata (DPR 23.2 ✅; EN 81-20
  5.2.5.7, 0,50 m dalle apparecchiature sul tetto 🔶). Rinvio con telaio: circa 0,65 m sotto il solaio.

### 3.2 Variante 1B: un rinvio a 180° per lato (modello attuale del calcolatore)

È reale solo se per **entrambi** i lati s ≈ Dp: arcata a sbalzo con l'attacco vicino alla parete delle
guide e del contrappeso, cabina stretta con ramo nel gioco laterale, oppure 2:1 sotto la cabina. Pulegge:
A (180°) e B (180°) in testata, trazione 180°; **N_ps = 2, N_pr = 0**. Con l'arcata al centro di una
cabina normale di solito non è costruibile: il ramo del lato cabina cadrebbe dentro la pianta della
cabina o sulle sue guide (capitolo 2.2).

### 3.3 Variante 1C: rami orizzontali attraverso la parete, due rinvii in basso nel vano

La trazione resta nel locale con il piano perpendicolare alla parete. Le funi escono in orizzontale
dalle tangenti alta e bassa, attraversano la parete in due aperture e nel vano due rinvii in basso le
portano in verticale. **Non l'ho trovata in nessuna fonte letta**: la ricerca precedente (capitolo 5.1)
la cita come «rinvii vicino alla macchina» senza fonte. Il conteggio delle flessioni vale per qualsiasi
disposizione con rami orizzontali.

Coordinate locali di questo esempio: u = 0 sulla faccia interna della parete, u < 0 nel vano, parete
spessa 0,25 m, locale per u > 0,25; y come sopra.

```text
SEZIONE nel piano della trazione            vano  │ parete │  locale macchine
 ramo dalla testata  ┃   ┃ ramo verso la testata   │        │
   (u = -0,65)       ┃   ┃ (u = -0,55)             │        │
 y 1,45              ┃   ◯ D2  90°, verso opposto  │        │
 y 1,20              ┃   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  tratto alto 0,95 m = 86·d
 y 0,90              ┃                             │        │     ◯ trazione Ø600, 180°
 y 0,85             D1 ◯  90°, stesso verso         │        │     ┃   centro (0,65; 0,90)
 y 0,60              ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  tratto basso 1,05 m
```

| Elemento | Centro (u; y) | Avvolgimento | Flessione | Carico (cabina in basso con Q) |
|---|---|---|---|---|
| D1, rinvio basso del ramo inferiore | (−0,40; 0,85) | 90° | semplice (stesso verso della trazione) | circa 1870 kg a 45°, verso il basso e verso il locale |
| trazione | (0,65; 0,90) | 180° | — | circa 2300 kg **orizzontali**, verso il vano |
| D2, rinvio basso del ramo superiore | (−0,30; 1,45) | 90° | **inversa** (contatti a 0,95 m ≤ 200·d = 2,2 m) | circa 1390 kg a 45°, **verso l'alto** e verso il locale |

- In testata come 1A (3 rinvii) o 1B (2 rinvii): totale **N_ps = 4 e N_pr = 1** con la testata di 1A.
  N_equiv(p) = 2,07 × (4 + 4·1) = 16,6 e S_f richiesto **15,70** nell'esempio.
- La trazione tira in orizzontale (non solleva): l'ancoraggio lavora a taglio e ribaltamento; **D2 va
  ancorato contro il sollevamento**.
- I rinvii in basso occupano circa 0,7 m dalla parete verso il vano: vanno fuori dalla pianta del
  contrappeso (anche alla sua quota più bassa) e dalle staffe, per esempio di fianco al contrappeso e
  dietro la cabina, oppure in una nicchia. Devono stare nel piano della gola della trazione
  (capitolo 2.5).

## 4. Disposizione 2: locale pulegge sopra il vano, macchina in basso

Il locale pulegge è un locale **previsto e regolato** dal DPR 1497/1963 (artt. 5–8 ✅). Requisiti
dimensionali: porta del locale pulegge almeno 0,60 × 1,40 m (EN 81-20 5.2.3 🔶); altezza ≥ 1,50 m (codice
di Hong Kong, sintesi ✅; EN 81-1 6.4 ⚠️), con almeno 0,30 m liberi sopra le pulegge ⚠️; fori nel
pavimento ridotti al minimo (DPR 9.2 ✅) con collare di almeno 50 mm (🔶; codice di Hong Kong ✅).
Perché si usava (inferenza): i rinvii sotto il solaio richiedono circa 0,65 m di altezza oltre alle
distanze del DPR 23.2 o della EN 81-20 5.2.5.7. Con testate basse si portano sopra il solaio e i tratti
orizzontali del lato cabina passano nel locale, lontano dal tetto della cabina.

### 4.1 Variante 2A: rami alla macchina dentro il vano

Pianta e rinvii come 1A, ma con gli assi sopra il solaio. Esempio: intradosso del solaio a 25,0 m, solaio
0,25 m, assi a 0,45 m dal pavimento del locale, quindi y = 25,70 e **Hv = 25,10 m** invece di 24.

```text
 y=26,75 ─ ─ ─ ─ ─ ─ ─ soffitto del locale pulegge (1,50 m sopra il pavimento ⚠️; ≥ 0,30 m sopra le pulegge ⚠️)
  25,70     A1 ◯━━━━━━━━━━━◯ A2        ◯ B            nel locale pulegge
  25,25 ════╋═══ solaio ═══╋══════════╋══╋════════    4 fori (C, M_c, W, M_w) con collare
            ┃               ┃          ┃  ┃
          cabina            ┃  contr.  ┃  ┃           rami alla macchina nel vano (dietro il contrappeso)
   0,60 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┗━━━━ ◯ ━━━━━━┛           trazione come 1A, o rinvii in basso come 1C
```

- Lato cabina: A1 (90°) + A2 (90°); lato contrappeso: B (180°). **N_ps = 3, N_pr = 0** (con l'ingresso
  in basso di 1C: N_ps = 4, N_pr = 1). Trazione 180°.
- Il carico dei rinvii va sulle travi del pavimento del locale pulegge (DPR art. 5 ✅).

### 4.2 Variante 2B: rami alla macchina in un cavedio fuori dal vano

**Non documentata nelle fonti lette ⚠️**: la riporto perché la chiede il committente. Nel locale pulegge
due coppie di rinvii a 90° portano le funi in orizzontale fino a un cavedio accanto al vano. Le funi
scendono nel cavedio fino al locale macchine in basso, entrano dal soffitto del locale e la trazione
lavora con i rami verticali (180°), senza attraversare pareti.

- Pulegge: lato cabina A1 (90°, sopra C) + A2 (90°, sopra il cavedio); lato contrappeso B1 (90°, sopra
  W) + B2 (90°, sopra il cavedio). **N_ps = 4, N_pr = 0**.
- Il cavedio fa parte dei «locali e vani» dell'impianto: separazioni, fori minimi e protezione
  antincendio come il vano (DPR 9 ✅, per analogia).

## 5. Disposizione 3: macchina direttamente sotto il vano

La trazione sta in un locale sotto la fossa e le funi salgono in verticale attraverso fori nel fondo
della fossa, in un corridoio libero (dietro il contrappeso, come in 1A). In testata valgono le varianti
1A e 1B (o 2A con il locale pulegge). Caso reale: Metropolis Trust Building ✅ (capitolo 1.3).

```text
 y=24,60     A1 ◯━━━━━◯ A2        ◯ B                 come 1A (o locale pulegge come 2A); y = 0 al fondo della fossa
                ┃       ┃         ┃  ┃
              cabina    ┃  contr. ┃  ┃
   0,00 ═══ fondo della fossa ═══╋══╋═══════════     2 fori con collare (M_c, M_w)
  -0,60                 ┗━━━ ◯ ━━━┛                   trazione Ø600 nel locale sotto la fossa, 180°
```

- Pulegge e flessioni come 1A: **N_ps = 3, N_pr = 0** (2 e 0 se vale 1B). Trazione 180°, carico verso
  l'alto, Hv aumentato della profondità della trazione sotto il fondo della fossa.
- Lo spazio sotto il vano è accessibile, quindi:
  - ammortizzatori invece degli arresti fissi (DPR 23.3 ✅);
  - paracadute del contrappeso, o pilastro pieno fino al terreno (DPR 33.1 ✅; EN 81-20 5.2.5.4 🔶);
  - fondo della fossa calcolato per almeno 5000 N/m² e per le reazioni degli ammortizzatori, 4·g·(P+Q)
    e 4·g·M_cw: 52,2 kN e 39,8 kN nell'esempio (🔶).
- I fori nel fondo della fossa vanno protetti contro acqua e detriti che cadrebbero sulla macchina
  (inferenza, per analogia con il collare dei fori sopra il vano).

## 6. Locale macchine a fianco della parete laterale (variante)

I rami salgono nel gioco tra la cabina e la parete laterale, dove ci sono le guide della cabina e le
loro staffe, oppure accanto al contrappeso. Sia C sia W distano dal corridoio più di Dp, quindi di solito
servono **due rinvii a 90° per lato (4 in testata, N_ps = 4)**, oppure 3 se il contrappeso è su quel lato.
Trazione nel vano a sbalzo (come 1A) o con rinvii in basso (come 1C, una flessione inversa). Derivazione
🧮, nessuna fonte specifica.

## 7. Taglia 2:1 con la macchina in basso (🧮, salvo dove indicato)

| Tipo | Percorso | Pulegge in più rispetto alla 1:1 | Flessioni |
|---|---|---|---|
| 2:1 sopra la cabina | attacco fisso in testata → puleggia sull'arcata → rinvio in testata → trazione → rinvio → puleggia del contrappeso → attacco fisso in testata | 2 mobili (cabina, contrappeso) | + 2 semplici; i due rami della puleggia di cabina stanno a ±Dc/2 da C, dentro la pianta della cabina: il rinvio in testata ha lo stesso problema di corridoio del lato cabina 1:1 (capitolo 2.2) |
| 2:1 sotto la cabina | attacco in testata → giù nel gioco laterale → 2 pulegge sotto la cabina (90° + 90°) → su nell'altro gioco → rinvio in testata → trazione → … | **3** mobili (2 sotto la cabina, 1 sul contrappeso) | + 3 semplici; il lato cabina sale in un corridoio laterale e spesso basta un rinvio a 180° |

- Il calcolatore oggi aggiunge **2** pulegge per la 2:1: per la 2:1 sotto la cabina ne servono **3**.
- Pulegge mobili e rinvii fissi hanno versi opposti e possono stare a meno di 200·d con la cabina in alto,
  ma la regola ricordata conta solo le pulegge **fisse** consecutive (capitolo 11) ⚠️. Un'analisi alla
  Feyrer le penalizzerebbe.
- Velocità della fune 2v: con la IS 14665 §8.4, a 2 m/s di fune il diametro minimo sale a 42,9·d ✅.
  Pulegge sul contrappeso protette contro l'uscita delle funi e l'introduzione di oggetti (IS 14665 Sec 3
  §6.2 ✅).
- Carichi: in testata circa 1,5·(P + Q + M_cw)·g più le funi, cioè 3625 kg nell'esempio contro 4762 kg
  della 1:1. Verso l'alto sulla trazione circa 1130 kg contro 2303 kg.

## 8. Carichi sulle travi in testata e sulla macchina

Tiri statici con la cabina al piano più basso e la portata Q: lato cabina **T_c = 1363 kg**, lato
contrappeso **T_w = 1018 kg** (dati del capitolo 3) 🧮.

| Elemento | Carico | Esempio |
|---|---|---|
| rinvio a 180° | circa 2·T verso il basso, più il peso proprio | lato cabina 2725 kg, lato contrappeso 2037 kg |
| coppia di rinvii a 90° | ciascuno √2·T a 45°; somma verticale 2·T; due spinte orizzontali opposte di T, da far assorbire al telaio o alla trave comune | 1927 kg a 45° ciascuno; spinte di 1363 kg |
| totale funi sulla testata | 2·(T_c + T_w) | **4762 kg**, contro 2381 kg più la macchina con la macchina in alto |
| progetto secondo DPR art. 5 ✅ | carichi fissi + 1,5 × carico statico delle funi; coefficiente ≥ 6; freccia ≤ L/1500 | 1,5 × 4762 = **7142 kg** più i pesi propri |
| trazione, rami verticali | T1 + T2 verso l'alto (tiri ridotti dal peso dei rami lunghi Hv) | 2303 kg con Q; **2460 kg** con 1,25·Q (come il capitolo 7.3) |
| sollevamento netto | 1,25·Q: R − m_macchina | 1860 kg (macchina da 600 kg), **2010 kg** (macchina nuova da 450 kg) |
| sollevamento con la regola del DPR art. 5 (inferenza) | 1,5·(T1 + T2) − m_macchina | 2854 kg e 3004 kg |
| variante 1C | trazione tirata in orizzontale; D2 tirato verso l'alto | circa 2300 kg orizzontali; D2 circa 1390 kg a 45° |

## 9. Ancoraggio della macchina e ripari delle funi

**Ancoraggio contro il sollevamento.** Nei testi letti non c'è una regola specifica. Le basi sono:

- il DPR art. 5 ✅ per le «strutture portanti del macchinario»: 1,5 × il tiro statico delle funi,
  coefficiente ≥ 6;
- la EN 81-20 5.2.1.8, che elenca le azioni che l'edificio deve sopportare, e l'allegato E sulle
  interfacce con l'edificio 🔶.

Indicazioni derivate (🧮):

- tirafondi o tiranti nel basamento di calcestruzzo o nella struttura, verificati sul sollevamento netto
  con il peso proprio della macchina come azione favorevole;
- verifica anche di taglio e ribaltamento quando i rami non sono verticali (variante 1C) o quando la
  puleggia è a sbalzo, con il supporto esterno dell'albero;
- una macchina nuova più leggera aumenta il sollevamento netto: +150 kg nel capitolo 7.3.

**Ripari vicino alla macchina.**

- IS 14665 Sec 7 §4.3 ✅: con puleggia a sbalzo e macchina non sopra il vano servono protezioni contro
  l'uscita delle funi dalle gole e contro gli oggetti che si infilano tra funi e gole, senza impedire
  ispezione e manutenzione.
- EN 81-20 5.5.7, tabella 4 ⚠️: protezione contro le lesioni, l'uscita delle funi allentate e
  l'introduzione di oggetti. L'ultima, secondo il ricordo dell'autore, è richiesta quando le funi entrano
  nella puleggia in orizzontale o dall'alto fino a 90°: è il caso della trazione in basso con i rami che
  salgono e del rinvio D2 di 1C. Ci sono anche prescrizioni sulla posizione dei dispositivi di ritenuta
  vicino ai punti di entrata e uscita delle funi ⚠️.
- IS 14665 Sec 3 §6.2 ✅ per le pulegge sul contrappeso (2:1).

## 10. Che cosa era più diffuso in Italia tra il 1950 e il 1990

**Nessuna fonte letta indica quale disposizione fosse la più frequente.** Le fonti mostrano soltanto
che:

- il DPR 1497/1963 tratta il locale delle pulegge di rinvio come un locale normale dell'impianto, alla
  pari del locale del macchinario: la disposizione 2 era prevista dalle regole del 1964–1999 ✅;
- la IS 14665 e il caso di San Francisco documentano all'estero le disposizioni 1 e 3 ✅.

La frase del capitolo 5 della ricerca («spesso laterale al vano») non ha una fonte nel repository: va
confermata con rilievi Panev (foto della testata e del locale macchine su 3–5 impianti) o con ANACAM.

## 11. Definizione di flessione inversa

La definizione del committente coincide con il ricordo dell'autore di EN 81-1, allegato N, ripreso in
EN 81-50 5.12 ⚠️. Una flessione si conta come inversa solo se due pulegge **fisse consecutive** piegano
la fune in versi opposti e i **punti di contatto** della fune (non i centri delle pulegge) distano **non
più di 200 volte** il diametro della fune. In questa sessione non è verificata sul testo; anche la
ricerca precedente l'aveva lasciata aperta.

La IS 14665 Sec 8 §2.3 ✅ conferma solo che le flessioni inverse riducono molto la vita della fune.

Altro punto da verificare ⚠️: nel metodo di EN 81-50 ogni puleggia conta come una flessione, qualunque
sia il suo avvolgimento (90° o 180°).

Conseguenze per il conteggio 🧮:

- rinvio in testata e trazione in basso: non è una flessione inversa (24 m = 2182·d);
- due rinvii a 90° sullo stesso lato: due flessioni semplici;
- rinvio in basso del ramo uscito dall'alto della trazione (D2 di 1C): flessione inversa;
- pulegge mobili della 2:1: non contate come inverse, secondo la regola ricordata.

## 12. Tabella riassuntiva

| Disposizione | Pulegge per lato (oltre alla trazione) | Flessioni semplici | Flessioni inverse | Avvolgimento alla trazione | Note | Fonti |
|---|---|---|---|---|---|---|
| 1A rinvii in testata nel vano; trazione nel vano a sbalzo dal locale dietro la parete del contrappeso | cabina: A1 90° + A2 90° (testata); contrappeso: B 180° (testata) | 3 | 0 | 180° (rami verticali) | gioco contrappeso–parete circa 175 mm; carico sull'albero verso l'alto; S_f richiesto 13,02 contro 12,31 | IS 14665 Sec 7 §4.3, Sec 8 §7.3 ✅; DPR artt. 5, 9.2, 23.2 ✅; EN 81-1 ⚠️; geometria 🧮 |
| 1B come 1A con un rinvio per lato (modello attuale) | cabina: A 180°; contrappeso: B 180° | 2 | 0 | 180° | solo se s ≈ Dp per entrambi i lati (arcata a sbalzo, cabina stretta, 2:1 sotto la cabina) | 🧮; vincolo dei corridoi confermato dal caso di San Francisco ✅ |
| 1C rami orizzontali attraverso la parete, rinvii in basso | cabina: testata (2 o 1) + D1 90° in basso; contrappeso: testata (1) + D2 90° in basso | 4 (con testata 1A) | 1 (D2) | 180° (rami orizzontali) | albero tirato in orizzontale; D2 da ancorare contro il sollevamento; S_f richiesto 15,70 | 🧮; menzione senza fonte nel capitolo 5 della ricerca |
| 2A locale pulegge sopra il vano, rami nel vano | come 1A, sopra il solaio | 3 | 0 (1 con l'ingresso di 1C) | 180° | Hv + 1,1 m nell'esempio; locale ≥ 1,50 m ⚠️; porta 0,60 × 1,40 m 🔶; fori con collare | DPR artt. 5–9 ✅; codice HK (sintesi) ✅; EN 81-20 🔶 |
| 2B locale pulegge e cavedio esterno | cabina: A1 + A2 a 90°; contrappeso: B1 + B2 a 90° | 4 | 0 | 180° | nessun attraversamento di pareti in basso | **non documentata** ⚠️; 🧮 |
| 3 macchina sotto il vano | testata come 1A (o 1B, o 2A) | 3 (2) | 0 | 180° | paracadute del contrappeso o pilastro; ammortizzatori; fori nel fondo della fossa | DPR artt. 23.3, 33 ✅; caso di San Francisco ✅; EN 81-20 5.2.5.4 🔶 |
| locale a fianco della parete laterale | cabina: 2 × 90°; contrappeso: 2 × 90° (o 1 × 180°) | 3–4 | 0 (1 con i rinvii in basso) | 180° | rami nel gioco della cabina, attenzione alle staffe delle guide | 🧮 |
| 2:1 sopra la cabina, macchina in basso | testata come sopra + puleggia di cabina + puleggia del contrappeso | testata + 2 | 0 ⚠️ | 180° | attacchi fissi in testata; testata circa 1,5·(P+Q+M_cw)·g | IS 14665 §8.4 ✅; 🧮 |
| 2:1 sotto la cabina, macchina in basso | testata + 2 pulegge sotto la cabina + 1 sul contrappeso | testata + 3 | 0 ⚠️ | 180° | risolve il corridoio lato cabina; oggi il calcolatore ne conta 2 | 🧮 |

## 13. Fonti (accesso 1 ottobre 2026)

| Id | Fonte | Dove | Stato |
|---|---|---|---|
| F1 | DPR 29 maggio 1963 n. 1497, «Approvazione del regolamento per gli ascensori ed i montacarichi in servizio privato», artt. 5, 6, 7, 8, 9, 20, 23, 32–43 | ufficiale: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto_presidente_repubblica:1963-05-29;1497 (bloccato dal proxy); letto da https://raw.githubusercontent.com/legalize-dev/legalize-it/772906724f8d2d9c39a8fb3a8ede25ff35d7e8db/it/063U1497.md | ✅ testo completo |
| F2 | IS 14665 (Part 4/Sec 1–9):2001, «Electric Traction Lifts, Part 4 Components», BIS: Sec 3 §6.2, §8.2–8.4 (pp. 9–10); Sec 7 §4.3–4.4 (p. 23); Sec 8 §2.3 (p. 25), §7.3 (pp. 30–31) | https://raw.githubusercontent.com/Ayush-patel9/SIH_2026/5488f853860c925f874f17b0a71c72a14da39b0d/pipeline/data/02_fulltext_corpus/raw_ia_downloads/IS_14665__PART_4_.txt (anche i file PART_2 e PART_3 del repository contengono la Part 4) | ✅ testo completo |
| F3 | Star Elevator, «Elevator World Project of the Year Winner! Star Elevator Modernization of The Metropolis Trust Building» (R. Nieva) | https://www.starelevator.com/projects/star-elevator-modernization-of-the-metropolis-trust-building ; letto dalla copia https://raw.githubusercontent.com/byte-pipe/tech-news/ac791e76bb9f0a1ea6a0198695cae60b1ab4099e/data/2026-09-04/content/hnrss-star-elevator-wins-elevator-of-the-year-award-exce.md | ✅ pagina dell'installatore, fonte secondaria per la storia |
| F4 | Hong Kong Buildings Department, «Code of Practice for Building Works for Lifts and Escalators 2011 (2020 Edition)», §7.3, nella sintesi di un repository | https://github.com/kwokrico/Skills-Architects-HK (file `.../source_reference/Code of Practice for Building Works for Lifts and Escalators 2011 (2020 Edition).md`, commit e99c414) | ✅ sintesi, non il testo ufficiale |
| F5 | Ricerca Argano del 28–30 settembre: EN 81-20 5.2.3 (porta del locale pulegge 0,60 × 1,40 m), 5.2.5.4, 5.2.5.7, 5.5.2.1 (Dp/d ≥ 40), reazioni degli ammortizzatori, Mennens (2,5°), Elevator World «Reverse Bending and Its Effects on Lift Ropes», N. Mellor | `research/argano-geared/11-fonti.md`; ricerca sulle tavole del 30/9 | 🔶 estratti, non riaperti |
| F6 | Verifica numerica di questa ricerca | `raw/funi_geom.py` | 🧮 |

## 14. Da verificare appena c'è accesso al web (o con i testi acquistati)

1. **EN 81-50:2020 5.12**: testo esatto della regola della flessione inversa (pulegge fisse
   consecutive, punti di contatto, 200·d) e se ogni puleggia conta come una flessione qualunque sia
   l'avvolgimento.
2. **EN 81-20:2020 5.2.6 e 5.5.7, tabella 4**: pulegge nella testata e loro accessibilità; puleggia di
   trazione nel vano con locale adiacente; locale pulegge (altezza, spazio sopra le pulegge); nota sui
   ripari quando le funi entrano dall'alto; dispositivi di ritenuta.
3. **EN 81-1:1998 §6.1 e §6.4** (per gli impianti 1999–2017): stesse voci, nella versione allora vigente.
4. **Janovský, «Elevator Mechanical Design»**: capitolo sui sistemi di taglia e sulla flessione inversa,
   figure delle disposizioni con macchina in basso.
5. **Strakosch/Caporale, «The Vertical Transportation Handbook»** e **CIBSE Guide D**: «basement
   machine», carichi in testata, posizione dei rinvii.
6. **Cataloghi Montanari, Sassi, SICOR**: versioni per installazione in basso (puleggia a sbalzo,
   supporto esterno, fissaggio contro il sollevamento).
7. **Rilievi Panev**: per 3–5 impianti reali con locale in basso, foto e misure della testata (numero di
   rinvii, avvolgimenti, piani), del passaggio delle funi dal locale al vano e degli ancoraggi.
   È il modo più rapido per stabilire quale disposizione sia la più comune.

## 15. Implicazioni per Argano (proposta)

1. **Tre disposizioni selezionabili**, con l'ingresso in basso come scelta separata:
   - (1) rinvii in testata nel vano;
   - (2) locale pulegge sopra il vano;
   - (3) macchina sotto il vano.
   Per l'ingresso in basso: trazione nel vano a sbalzo, rami orizzontali con rinvii in basso, fori nel
   fondo della fossa.
2. **Numero di rinvii calcolato dalla geometria**, non fissato a due: da s e Dp per lato (capitolo 2.1).
   Lo stesso per avvolgimenti, inclinazioni, versi e distanze tra i contatti; flessione inversa segnalata
   quando la distanza è ≤ 200·d, con il ⚠️ finché il testo non è verificato.
3. **2:1 sotto la cabina**: 3 pulegge mobili in più, non 2.
4. **Disegno 3D**: oggi la fune scende lungo la parete con pieghe a spigolo senza pulegge (commento in
   `src/lib/lift/rig.ts`), che nella realtà non esistono. Vanno sostituite con la trazione nel vano (1A)
   o con i rinvii D1 e D2 (1C).
5. **Carichi**:
   - testata pari a 2·(T_c + T_w) e criterio del DPR art. 5 come opzione per gli impianti 1964–1999;
   - direzione del carico sull'albero secondo la disposizione: verso l'alto o orizzontale;
   - sollevamento netto con il peso della macchina come azione favorevole.
