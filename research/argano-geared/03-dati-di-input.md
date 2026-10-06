# 3. Dati di input

[← Indice](README.md)

Principio: chiedere solo ciò che entra in almeno una verifica del capitolo 4, e dire all'utente
*perché* lo si chiede. Ogni campo ha unità, intervallo ammesso, origine del valore (targa,
misura, stima, catalogo) e, se ha un default, la fonte del default. Il caso principale è la
**sostituzione dell'argano su impianto esistente**: il wizard (capitolo 9.7) parte dal rilievo
del capitolo 6.2 e precompila da lì i campi qui sotto.

## 3.1 I parametri chiave e dove entrano nel calcolo

| Parametro | Unità | Dove entra | Da dove viene nella sostituzione |
|---|---|---|---|
| Angolo di avvolgimento α | gradi | aderenza (e^(f·α)), carico sull'albero | calcolato dalle quote (capitolo 5.3) |
| Potenza del motore | kW | verifica di potenza, coppia nominale, coppia di accelerazione | targa (vecchio), catalogo (nuovo) |
| Rapporto di riduzione i | — | velocità reale, coppie al motore, freno, forza al volantino | targa o conteggio principi/denti |
| Massa della cabina P | kg | aderenza, albero, potenza, freno, funi | libretto o stima; sensibilità ±10% |
| Massa del contrappeso M_cw (o bilanciamento k) | kg | aderenza, albero, potenza, freno | blocchi contati o prova di bilanciamento (capitolo 6.3) |
| Numero, diametro, massa lineare e carico di rottura delle funi | —, mm, kg/m, kN | D/d, coefficiente di sicurezza, peso dei tratti, squilibrio, inerzia | scheda del fornitore delle funi nuove |
| Poli e giri di targa del motore | —, giri/min | velocità reale, velocità sincrona, coppia nominale | targa |
| Coefficiente di aderenza | — | μ convenzionale della norma per ciascun caso (capitolo 4.4) combinato con il fattore di gola f | norma (μ) + profilo, β, γ e tempra della gola |
| Diametro della puleggia D | mm | D/d, velocità, coppie, N_equiv, carico sull'albero | catalogo (nuovo), misura (vecchio) |
| Velocità nominale v | m/s | cinematica, μ in frenatura, potenza | targa; non va cambiata (capitolo 6.5) |

Altri dati dello stesso tipo che migliorano il calcolo:

| Parametro | Dove entra |
|---|---|
| Disposizione (in alto o in basso), percorso delle funi, pulegge di rinvio (diametro, inerzia, flessioni) | tiri, α, N_equiv(p), rendimento del vano (capitolo 5) |
| Distanza verticale tra pulegge in testata e puleggia di trazione | peso dei tratti discendenti (macchina in basso) |
| Taglia r | tiri, velocità delle funi, giri della puleggia |
| Corsa, testata, fossa | lunghezze e masse delle funi per lato |
| Compensazione (catene o funi) e cavo flessibile | tiri e squilibrio lungo la corsa |
| Rendimento del riduttore diretto e inverso, per rapporto | potenza, freno, forza al volantino |
| Rendimento del vano | potenza, forza al volantino (capitolo 5.6) |
| Inerzie di motore, volano, freno, puleggia e rinvii | coppia di accelerazione, freno, frenatura d'emergenza |
| Accelerazione di progetto, decelerazione di verifica | coppie dinamiche, aderenza in frenatura |
| Avviamenti/ora e rapporto di intermittenza | verifica termica di motore e riduttore |
| Massa della macchina e tipo di ancoraggio | sollevamento netto con la macchina in basso |
| Scostamento laterale tra i piani delle gole | deviazione laterale delle funi |
| Dati dei componenti di sicurezza esistenti | compatibilità con la velocità nominale |

## 3.2 Impianto

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Contesto | sostituzione dell'argano (default) · impianto nuovo | sì | cambia il percorso normativo (capitoli 2.4 e 6.6) |
| Tipo di impianto | persone · merci accompagnate | sì | casi di carico, area utile |
| Portata Q | kg | sì | > 0; persone = ⌊Q/75⌋; coerenza con l'area utile (EN 81-20 tabella 6: 450 kg → 1,30 m², 630 kg → 1,66 m², 1000 kg → 2,40 m²) ⚠️ |
| Massa della cabina P | kg | sì | > 0; origine obbligatoria: documentata o stimata |
| Bilanciamento k *oppure* massa del contrappeso *oppure* carico di equilibrio misurato | — / kg / kg | sì | uno solo dei tre, gli altri si ricavano |
| Velocità nominale v | m/s | sì | > 0 |
| Corsa H · fermate · testata · fossa | m · — · m · m | sì | H > 0; fermate ≥ 2 |
| Ammortizzatori | ad accumulo · a dissipazione · a corsa ridotta | sì | decelerazione di verifica in frenatura: almeno 0,5 m/s² (UNI EN 81-50:2020, 5.11.2.2.2); 0,8 m/s² con corsa ridotta, scelta del software |

## 3.3 Sospensione e funi

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Taglia r | 1:1 · 2:1 | sì | 4:1 e oltre in una fase successiva |
| Numero di funi n | — | sì | ≥ 2 ⚠️; con 2 funi il minimo del coefficiente di sicurezza passa da 12 a 16 ⚠️; nella sostituzione di norma quello delle funi esistenti (6.5) |
| Diametro nominale d | mm | sì | ≥ 8 mm salvo approvazione di un organismo notificato ⚠️; nella sostituzione di norma quello delle funi esistenti (6.5) |
| Costruzione e grado | es. 8×19 Seale anima tessile, 1570 o 1370/1770 N/mm² | sì | da elenco (ISO 4344:2022, EN 12385-5:2021) |
| Carico di rottura minimo · massa lineare | kN · kg/m | sì | dalla scheda del fornitore; mai stimati dal software senza avviso |
| Compensazione · cavo flessibile | massa lineare, punto di attacco | no | necessari per corse lunghe |

## 3.4 Geometria della trazione

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Posizione della macchina | in alto · in alto con rinvio · in basso con rinvii in testata · in basso laterale con rinvii | sì | sceglie il percorso della fune (capitolo 5.1) |
| Pulegge di rinvio | per ciascuna: diametro, inerzia (o massa), posizione, flessione semplice o inversa | sì (anche “nessuna”) | N_equiv(p), tiri in frenatura; D/d anche per i rinvii ⚠️ |
| Quote | coordinate dei centri delle pulegge, distanza tra le calate, distanza verticale testata–puleggia | sì | α calcolato; inserimento diretto di α solo come alternativa motivata |
| Profilo della gola | semicircolare · con sottosquadro (β, γ) · a V (γ, temprata sì/no) | se macchina inserita a mano | per le macchine a catalogo viene dal catalogo |
| Gole dell'argano esistente | profilo e angoli misurati, usura | no | baseline del capitolo 6.4 |
| Scostamento laterale tra le gole | mm | no | deviazione laterale delle funi (capitolo 5.4) |

## 3.5 Argano esistente (solo sostituzione)

| Campo | Nota |
|---|---|
| Targa del motore: kW, poli (anche 4/16), giri, tensione, corrente | velocità reale e confronto |
| Rapporto di riduzione | dalla targa o contando principi e denti |
| Diametro della puleggia, funi esistenti | baseline di aderenza e funi |
| Freno: numero di elementi meccanici, coppia se nota, volano | confronto e adeguamenti UNI 10411-1 |
| Massa della macchina, basamento, interassi di fissaggio | vincoli di selezione, sollevamento netto |
| Rendimento del riduttore | se non noto: default dichiarato e marcato nel report |

## 3.6 Servizio, azionamento, sicurezza

| Campo | Unità / valori | Nota |
|---|---|---|
| Avviamenti all'ora · rapporto di intermittenza | 1/h · % | servizio S3/S4/S5 secondo IEC 60034-1 |
| Alimentazione | V, Hz, fasi | filtra i motori del catalogo |
| Azionamento | VVVF (nuovo) · due velocità (solo verifica dell'esistente) | con VVVF la velocità si corregge in frequenza |
| Rendimento del vano | — | default per disposizione (capitolo 5.6), modificabile |
| Limitatore, paracadute, ammortizzatori esistenti | velocità di intervento, velocità nominali, masse ammesse | compatibilità (capitolo 6.5) |
| Decelerazione media del paracadute | m/s² | limite della decelerazione massima del freno |
| Manovra di emergenza | manuale (raggio del volantino) · elettrica | oltre 400 N serve quella elettrica ⚠️ |
| Protezioni già presenti | UCM, eccesso di velocità in salita, temporizzatore, arresto vicino alla macchina | stato degli adeguamenti (capitolo 6.6) |

## 3.7 Vincoli e preferenze

- Produttori ammessi; modelli fuori produzione ammessi solo per verificare l'esistente.
- Ingombri massimi, interassi di fissaggio, massa massima (solaio in alto, ancoraggi in basso).
- Lato di uscita delle funi, lato della puleggia (destra/sinistra), posizione di montaggio.
- Criterio di ordinamento: margine minimo, costo, rendimento, massa (capitolo 8.6).

## 3.8 Regole di coerenza tra campi

Implementate come `refine` dello schema zod, con messaggio che indica il campo da correggere:

- bilanciamento, massa del contrappeso e carico di equilibrio: uno solo inserito, gli altri calcolati;
- macchina in basso: servono le pulegge in testata e la distanza verticale testata–puleggia, che
  deve essere almeno pari alla corsa;
- taglia 2:1: servono le pulegge di cabina e contrappeso e gli attacchi fissi;
- persone = ⌊Q/75⌋ e area utile compatibile con la tabella della norma, per gli impianti per persone;
- diametro della fune compatibile con almeno una puleggia del catalogo, altrimenti avviso immediato;
- velocità reale del vecchio argano lontana dalla velocità di targa: avviso di dato incoerente.

## 3.9 Che cosa non si chiede all'utente

Tutto ciò che si ricava: contrappeso (dal bilanciamento o dal carico di equilibrio), masse delle
funi per lato, angolo di avvolgimento, giri della puleggia, rapporto ideale, tiri, fattori di gola,
N_equiv, coppie, potenze, sollevamento netto. Il report le mostra come grandezze calcolate, con la
formula.
