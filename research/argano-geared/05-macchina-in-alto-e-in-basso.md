# 5. Macchina in alto e macchina in basso

[← Indice](README.md)

In Italia molti impianti esistenti hanno il locale macchina **in basso**, spesso laterale al
vano, con le funi che salgono alle pulegge di rinvio in testata. Le verifiche restano quelle del
capitolo 4, ma cambiano i tiri alla puleggia di trazione, l'angolo di avvolgimento, il numero
di pulegge, la direzione del carico sull'albero e il rendimento del vano. Il software deve
gestire entrambe le disposizioni dal primo giorno, con lo stesso motore di calcolo.

## 5.1 Disposizioni da supportare

| Disposizione | Percorso delle funi | Che cosa cambia nel calcolo |
|---|---|---|
| In alto, 1:1, senza rinvio (tiro diretto) | puleggia → cabina e contrappeso in verticale | α = 180°; nessuna puleggia oltre a quella di trazione; interasse delle calate uguale al diametro della puleggia, quindi nella sostituzione un diametro diverso sposta le calate (5.3) |
| In alto, 1:1, con rinvio | puleggia → rinvio → contrappeso | α < 180° dalla geometria (5.3); una flessione semplice; tiro sull'albero inclinato |
| In basso, 1:1, rinvii in testata | cabina → puleggia A in testata → giù alla puleggia di trazione → su alla puleggia B → contrappeso | due pulegge; funi lunghe circa il doppio; tiri alla puleggia ridotti dal peso dei tratti discendenti; **carico sull'albero verso l'alto**; le pulegge in testata portano cabina, contrappeso e funi |
| Taglia 2:1, in alto o in basso | pulegge su cabina e contrappeso, attacchi fissi | velocità delle funi 2·v; più pulegge e possibili flessioni inverse |
| Varianti in basso laterale | rinvii vicino alla macchina per portare le funi nel vano | possibili flessioni inverse e deviazione laterale delle funi (5.4) |

## 5.2 Metodo del percorso della fune

Ogni lato (cabina e contrappeso) è descritto come elenco ordinato di elementi, dal carico
fino alla puleggia di trazione: tratti verticali (lunghezza, percorsi verso l'alto o verso il
basso) e pulegge di rinvio (diametro, inerzia). Il tiro si calcola camminando lungo la fune:

```text
alla sospensione:                    T = m_carico · (g + a_carico) / r
tratto percorso verso l'alto:        T_alto  = T_basso + m_tratto · (g + a_f)
tratto percorso verso il basso:      T_basso = T_alto  − m_tratto · (g − a_f)
puleggia di rinvio:                  T_dopo  = T_prima + J_p · a_f / R_p²
a_carico: accelerazione del carico verso l'alto;  a_f = r · a_carico (lungo il verso di percorrenza)
tiro calcolato negativo → 0 (fune allentata)
```

Derivazione: equilibrio dinamico di ogni tratto e di ogni puleggia. I casi del capitolo 4.4 si
ottengono cambiando carico, posizione della cabina e accelerazione: caricamento (a = 0, cabina
in basso, 1,25·Q), frenatura (cabina carica in discesa decelerata in basso; cabina vuota in
salita decelerata in alto), cabina bloccata (contrappeso sugli ammortizzatori: carico nullo
sul lato contrappeso). Controllo di coerenza: con la macchina in alto senza rinvii il metodo dà
gli stessi tiri delle formule dirette del capitolo 4.2. Gli esempi del capitolo 7 sono calcolati
così.

Tre conseguenze che il software deve rispettare:

- **Peso dei tratti discendenti.** Con la macchina in basso la fune che scende dalle pulegge in
  testata alla puleggia di trazione toglie lo stesso peso a entrambi i tiri: il rapporto T1/T2
  **aumenta** e l'aderenza peggiora. Nel capitolo 7, a parità di impianto e con α = 180°, il
  rapporto nel caso critico passa da 1,642 (macchina in alto) a 1,687 (in basso): l'utilizzo
  dell'aderenza sale da 0,97 a 0,99.
- **Inerzia delle pulegge.** In frenatura aumenta T1/T2 e va contata; il modo di considerarla va
  confermato sul testo di EN 81-50 ⚠️. L'attrito delle pulegge invece riduce T1/T2 in entrambi
  i casi di frenatura: trascurarlo nella verifica di aderenza è a favore di sicurezza, ma va
  messo nella potenza (5.6).
- **Tiro nullo.** Con la macchina in basso e il contrappeso sugli ammortizzatori il tiro lato
  contrappeso alla puleggia si annulla: il rapporto è infinito e la verifica di cabina
  bloccata è soddisfatta. Il codice deve trattarlo senza dividere per zero.

## 5.3 Angolo di avvolgimento dalle quote

Il software calcola α dalle coordinate dei centri e dai diametri delle pulegge, invece di
chiederlo a occhio. Per un ramo che va dalla puleggia di trazione (raggio R0) a una puleggia
(raggio R1) toccata dallo stesso lato della fune (flessione semplice), con centro spostato di
Δx in orizzontale e h in verticale:

```text
θ = atan(Δx / h) − asin( (R0 − R1) / √(Δx² + h²) )     deviazione del ramo dalla verticale
α = 180° − θ   se il ramo devia verso l'esterno;   α = 180° + θ   se devia verso l'interno
```

Derivazione (tangente esterna a due cerchi); con Δx = R0 − R1 il ramo è verticale e θ = 0.
Esempio: R0 = 280 mm, R1 = 200 mm, rinvio 300 mm di lato e 600 mm sotto → θ = 19,7°,
α = 160,3°. In generale α è l'arco tra i due punti di tangenza sul lato di contatto; con la
macchina in basso e i rami verticali verso le pulegge in testata α = 180°, e una differenza
di 70 mm tra le calate su 24 m di altezza vale appena 0,17°.

**Tiro diretto nella sostituzione.** Senza rinvio l'interasse delle calate è uguale al diametro
della puleggia. Se la puleggia nuova ha un diametro diverso, gli attacchi di cabina e contrappeso
restano dove sono e le funi si inclinano. Con la puleggia nuova centrata sulle calate esistenti
ogni calata si sposta di Δ = (D_esistente − D_nuova)/2; allineandola al lato cabina, tutto lo
spostamento va sul lato contrappeso. Per ogni posizione della cabina:

```text
α = 180° − atan(Δ_cabina / L_cabina) − atan(Δ_contrappeso / L_contrappeso)
L: lunghezza libera della fune tra puleggia e attacco (minima, L0, con il carico a fine corsa)
Δ > 0 se la puleggia nuova è più piccola (funi divergenti, α < 180°)
```

Il valore peggiore si ha con la cabina a un estremo della corsa, cioè nelle posizioni delle
verifiche di aderenza. Con i dati del capitolo 7 (600 → 560 mm, puleggia centrata, L0 = 2 m,
H = 18 m): Δ = 20 mm per lato, α = 179,4° ed e^(f·α) in frenatura scende da 1,696 a 1,693.
Sull'aderenza l'effetto è trascurabile; i 20 mm per lato vanno invece controllati sui fori della
soletta e sugli attacchi, e con spostamenti grandi serve un rinvio. Allineando la puleggia al lato
cabina lo spostamento diventa 40 mm sul lato contrappeso e α scende a 178,9° con la cabina in
basso.

## 5.4 Deviazione laterale delle funi

Nelle disposizioni in basso laterali le funi possono arrivare alla puleggia inclinate rispetto
al piano della gola. Non è stato trovato un limite in EN 81 ⚠️. Le indicazioni generali per funi
a 6 o 8 trefoli danno al massimo 2,5° per lato (Mennens), riferite ad argani e tamburi e non
specifiche per le pulegge di trazione. Il software calcola l'angolo dallo scostamento laterale
tra i piani delle gole e dalla lunghezza del tratto, e avvisa oltre una soglia configurabile.

## 5.5 Carico sull'albero e ancoraggio

- **Macchina in alto**: la risultante dei tiri spinge la macchina verso il basso, sul basamento e
  sul solaio del locale macchina.
- **Macchina in basso**: la risultante tira la macchina **verso l'alto**. Il sollevamento netto è
  `R − m_macchina·g` e deve essere assorbito dall'ancoraggio (tirafondi, basamento) con i
  coefficienti del progettista strutturale. In una sostituzione una macchina nuova più leggera
  aumenta il sollevamento netto sugli ancoraggi esistenti: nel capitolo 7, 158 kg in più.
- Le pulegge in testata scaricano sulla struttura dell'edificio circa la somma dei tiri dei due
  rami: il software lo riporta come dato per la verifica strutturale, non come verifica propria.

## 5.6 Rendimento del vano

Il rendimento complessivo è il prodotto del rendimento del riduttore e del rendimento del vano
(pulegge fisse e mobili, attrito delle guide, peso delle funi); secondo Elevator World il
rendimento del vano va tipicamente **dal 60% all'86%**. Più pulegge significano rendimento più
basso: nel capitolo 7 si usano 0,85 per la macchina in alto con un rinvio e 0,80 per la macchina
in basso con due pulegge in testata (ipotesi dentro l'intervallo). Nel software è un dato con
default per disposizione, modificabile e riportato nel report.

## 5.7 Funi e N_equiv per disposizione

| Disposizione | Flessioni tipiche | Effetto |
|---|---|---|
| In alto senza rinvio | nessuna oltre alla puleggia di trazione | N_equiv(p) = 0 |
| In alto con rinvio | una semplice | N_equiv(p) = K_p |
| In basso, rinvii in testata | due semplici | N_equiv(p) = 2·K_p; funi lunghe circa il doppio |
| 2:1 | pulegge di cabina, contrappeso e testata | contare anche le flessioni inverse ⚠️ |

Con la macchina in basso il tiro massimo della fune non è alla puleggia di trazione ma alla
puleggia in testata lato cabina: il coefficiente di sicurezza effettivo va calcolato lì.
Anche le pulegge di rinvio devono rispettare il rapporto minimo tra diametro e fune ⚠️.

## 5.8 Dati di geometria da chiedere

| Dato | Serve a |
|---|---|
| Posizione della macchina e schema del percorso delle funi | scegliere l'elenco di elementi (5.2) |
| Coordinate e diametri di puleggia di trazione e rinvii | α (5.3), N_equiv(p) |
| Interasse delle calate esistenti e posizione della nuova puleggia (tiro diretto) | spostamento delle calate, α nella sostituzione (5.3) |
| Distanza verticale tra pulegge in testata e puleggia di trazione | peso dei tratti discendenti |
| Inerzia (o massa e forma) delle pulegge di rinvio | frenatura di emergenza |
| Flessioni inverse, scostamenti laterali tra le gole | N_equiv(p), deviazione laterale |
| Massa della macchina esistente e della nuova, tipo di ancoraggio | sollevamento netto (in basso) |
