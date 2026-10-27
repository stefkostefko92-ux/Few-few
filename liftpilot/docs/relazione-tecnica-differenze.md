# Relazione tecnica di modifica — differenze dal modello Excel del titolare

Generato da `npx tsx scripts/rt2-differenze.ts` dai registri del codice (`src/lib/rt2/differenze*.ts`): non modificare a mano.

Per ogni punto: che cosa fa il file «RT-E MOD - 10411-1» e che cosa fa LiftPilot. Le correzioni sono dove il file contraddice la norma, non è a favore di sicurezza o dà un numero o un esito sbagliato; altrove la relazione segue il file. Solo numeri di punto delle norme, mai il loro testo.

Totale: 136 punti.

## Dati Generali

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-DG-1 | Il «dopo» copia il «prima»; un «prima» vuoto vale 0. | Il «dopo» viene dal Calcolo argano; un «prima» non documentato vale come il «dopo». | — |
| E-DG-2/17 | «era:» stampato anche quando il valore non cambia; l’unità anche dopo «preesist.». | «era:» solo quando il valore cambia, altrimenti «preesist.» senza unità. | — |
| E-DG-3/4 | Variazione del carico sul tiro delle funi g·(Q+P+funi)/taglia; senza la massa delle funi vecchie il «prima» è fatto con i valori «dopo» (variazione nulla o −50 %). | Variazione di T* = P + Q rispetto ai carichi documentati, con le soglie del prospetto 1 (15 %/10 %) e il prospetto 2 per il contrappeso. | UNI 10411-1:2024, 6.1 |
| E-DG-5 | L’aumento di portata (+10 %/+5 %) è solo un avviso; gli avvisi «VERIFICA …» non scelgono nessun componente. | Portata o T* oltre il prospetto 1, contrappeso oltre il prospetto 2, calo dei carichi o rapporto dei carichi variato portano nella relazione funi, guide, ammortizzatori, contrappeso e cabina; la dichiarazione di idoneità dell’edificio è proposta tra gli allegati. | UNI 10411-1:2024, 6.1 |
| E-DG-6/8/9 | Velocità: confronto con la sola velocità «prima», anche vuota (allora ogni velocità è un aumento). | Aumento oltre il 5 % rispetto alla maggiore tra la velocità del libretto e quella dopo il passaggio a 50 Hz (UNI 10411-11: ogni variazione); senza velocità documentata nessun aumento. | UNI 10411-1:2024, 15.1 e 15.16 |
| E-DG-12 | «SOSTITUZIONE PARACADUTE» e «SOSTITUZIONE LIMITATORE» al variare di carico o velocità. | La cabina (paracadute) e il limitatore entrano nella relazione per essere verificati; la sostituzione solo se non adeguati. | UNI 10411-1:2024, 6.6 e 15.13 |
| E-DG-10/14/16/18 | #DIV/0! con dati vuoti; data 0/1/00 con la cella vuota; testi vuoti stampati «0». | Ciò che manca è elencato e blocca l’emissione; la data vuota è quella di oggi; un testo vuoto resta «—». | — |
| E-DG-24 | Totale pagine = ultima pagina + 1, senza contare le pagine «solo inserimento». | Le pagine sono contate dal documento impaginato (copertina esclusa). | — |
| Norma 1994 | Si può scegliere «UNI 10411 : 1994» come norma di riferimento. | La norma è quella in vigore secondo il collaudo del Calcolo argano: UNI 10411-1:2024 o UNI 10411-11:2024. | — |

## Allegati

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| Firme | «Elaborata da» e «Direttore Tecnico» da elenchi di nomi nel file. | «Elaborata da» e «Verificata da» (ingegnere con Ordine, provincia e numero) dalla relazione, come da decisione del titolare. | — |
| E-AL-2 | Righe vuote per i documenti non scelti. | Elenco compatto nell’ordine del modello; i file caricati sono elencati e messi in coda al fascicolo. | — |

## Cabina

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-C1 | Decide sulla tensione delle funi lato cabina T = 9,81·(Q + P + Pfuni)/ct, in valore assoluto, con 15 % (Q ≤ 500 kg) o 10 %, e sulla portata con 10 % o 5 %. | Decide su T* = P + Q (cabina completa vuota e portata, escluse funi e cavi, senza ct) e sulla portata rispetto ai valori documentati: aumenti oltre il prospetto 1; una diminuzione dei carichi porta ammortizzatori e paracadute progressivo, il rapporto dei carichi sospesi variato la D.1 e la D.2. T del modello resta stampata come informazione. | UNI 10411-1:2024, 6.1 (prospetto 1) |
| E-C2 | Numero delle funi preesistenti vuoto = 0 funi (Pfuni preesistente nullo), benché il commento dica «vuoto se invariato». | Funi preesistenti dalla macchina esistente del calcolo; altrimenti il dato scritto; vuoto: come le funi nuove. | — |
| E-C3 | Massa lineica delle funi preesistenti vuota = 0 kg/m. | Dalla macchina esistente del calcolo o scritta; vuota: quella delle funi nuove. | — |
| E-C4 | Portata e massa della cabina «prima» lette senza ricaduta: lasciate vuote (come chiede Dati Generali) valgono 0 e la pagina stampa #DIV/0!. | I valori documentati; non documentati: uguali a quelli dopo la modifica (anche corsa, sospensione e locale macchina). | — |
| E-C5 | Chiede il diametro delle funi preesistenti e non lo usa in nessuna formula. | Il dato non è chiesto. | — |
| E-C6 | Dati Generali prende come carico preesistente, con la massa lineica vuota, i valori nuovi con le funi moltiplicate per ct: variazione 0 % (1:1) o −50 % (1:2), mai una verifica. | Dati Generali e la pagina leggono la stessa variazione documentata dei carichi (contesto, voci E-DG-3 ed E-DG-4). | UNI 10411-1:2024, 6.1 |
| E-C7 | Massa della nuova cabina tra 0,9 e 1,1 volte i vecchi carichi, con le funi moltiplicate per un indice del locale macchina (Pmax) o della sospensione (Pmin). | Massima: (1 + tolleranza di T*)·T* documentato − Q; minima: T* documentato − Q (sotto, un carico diminuito porta verifiche). | UNI 10411-1:2024, 6.1 (prospetto 1) |
| E-C8 | Controllo della portata sullo schermo sempre «OK» (confronta la portata con sé stessa). | Avviso quando la portata cresce oltre il 10 % (fino a 500 kg) o il 5 %, riga più severa a cavallo dei 500 kg. | — |
| E-C9 | Sullo schermo «Non servono verifiche di calcolo» fino al 15 % di T per ogni portata, mentre la pagina stampata usa il 10 % oltre 500 kg. | Lo stesso criterio della pagina (prospetto 1 su T* e portata, diminuzione, rapporto dei carichi). | UNI 10411-1:2024, 6.1 (prospetto 1) |
| E-C10 | Con T fuori tolleranza elenca i punti 6.4, 6.5, 6.6, 6.8, 6.13, 6.14, 6.15. | Con T* o portata oltre il prospetto 1: punti da 6.3 a 6.12 e 6.15. | UNI 10411-1:2024, 6.1 |
| E-C11 | Stampa «UNI 10411.4 : 2024» (Q > 500 kg). | «UNI 10411.1 : 2024». | — |
| E-C12 | Dichiara non significative le forze sulle strutture dell’edificio quando T rientra, anche con la portata oltre la tolleranza. | La dichiarazione solo con T* e portata entro il prospetto 1; altrimenti si allega la dichiarazione di idoneità statica delle strutture. | UNI 10411-1:2024, 6.1 e 6.3 |
| E-C13 | Riga del prospetto scelta con la sola portata nuova. | Con le due portate a cavallo dei 500 kg la riga più severa. | UNI 10411-1:2024, 6.1 (prospetto 1) |
| E-C14 | #DIV/0! stampato con dati vuoti o sospensione vuota. | Valori «—» e i dati mancanti elencati: la relazione non si emette. | — |
| E-C15 | Massa lineica nuova 0 per le funi del catalogo senza dati o «altro»: Pfuni nullo senza avviso. | Massa lineica delle funi del calcolo (le righe senza dati non sono offerte: voci E-F2, E-F3). | — |
| E-C18 | Refusi «realizzata il lamiera», «Superfice»; T stampata con tutte le cifre (formato Generale). | «realizzata in lamiera», «Superficie»; T in N senza decimali. | — |
| E-C20 | Sospensione «prima» lasciata al valore 1:1 anche se l’impianto è 1:2. | Sospensione prima dal primo foglio; vuota: come dopo. | — |
| E-C21 | Dichiara superficie, portata e capienza della nuova cabina conformi senza verificarle. | Cabina nuova di un ascensore per persone: superficie e capienza verificate; cabina che resta con la portata cambiata: superficie oltre la massima = attenzione. | UNI EN 81-20:2020, 5.4.2.1.1 (prospetto 6) e 5.4.2.3.1 (prospetto 8) |
| E-C22 | Descrive sempre «la nuova cabina» (lamiera, rivestimento, conformità), anche quando la cabina resta. | Con la cabina che resta: «La cabina preesistente resta in opera.» e le frasi riferite alla cabina dopo la modifica. | — |
| E-C23 | Tipo di paracadute su un foglio nascosto (valore salvato «Istantaneo a rulli»), con la voce «senza». | Scelta esplicita sulla pagina (stesso dato per la cabina e il limitatore), senza «senza»; paracadute istantaneo verificato fino a 0,63 m/s. | UNI EN 81-20:2020, 5.6.2.1.2.1 |

## Quadro di manovra

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-Q2 | Tensione max. di manovra vuota stampata «0 V». | Dato obbligatorio. | — |
| E-Q3 | Frequenze con una voce vuota (stampa «0 Hz») e una con uno spazio. | Voci «50» e «c.c.» (come la pagina Porte); c.c. stampata senza «Hz». | — |
| E-Q6 | Sesta voce vuota del tipo di manovra (stampa «0»). | Non offerta. | — |
| E-Q7 | Frase troncata: «… dopo la fermata della cabina e dopo la chiusura». | «… e dopo la chiusura delle porte». | — |
| E-Q8 | Tensione e frequenza del motore porte chieste due volte (Quadro e Porte), con valori indipendenti. | Un solo valore per tensione e frequenza dell’operatore, stampato su entrambe le pagine. | — |
| E-Q9 | Nessuna verifica della tensione di manovra. | Con il quadro nuovo, circuiti di comando e di sicurezza non oltre 250 V. | UNI EN 81-20:2020, 5.10.1.3.2 |
| E-Q10 | Dichiara la compatibilità con le serrature esistenti senza verifica. | Quadro nuovo con le porte di piano esistenti: contatti raggiungibili dal dito di prova non oltre 25 V c.a. o 50 V c.c., con la tensione e la corrente dei contatti (non quelle di manovra); corrente non detta: il limite in alternata. | UNI 10411-1:2024, 11.1.2 |
| E-Q11 | Dichiara sempre «il nuovo quadro di manovra» e circuiti «Nuovi». | Con il quadro che resta, frasi del quadro esistente. | — |

## Limitatore di velocità

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-L1 | Limite superiore con presa progressiva oltre 1 m/s = 1,25·(v + 0,25/v); la fascia «<= 1 m/s» o «> 1 m/s» scelta a mano decide la formula. | 1,25·v + 0,25/v oltre 1 m/s, 1,5 m/s fino a 1 m/s, secondo la velocità nominale. | UNI EN 81-20:2020, 5.6.2.2.1.1 a) |
| E-L2 | Stampa «> 300 N» senza verifica; la forza di aderenza dell’«altro» limitatore è chiesta e mai letta. | Forza di trazione verificata almeno pari alla maggiore tra 300 N e 2 volte la forza che fa intervenire il paracadute (dato nuovo); la forza di aderenza non è chiesta. | UNI EN 81-20:2020, 5.6.2.2.1.1 d) |
| E-L3 | «altro» limitatore: diametro di avvolgimento chiesto e mai letto (puleggia 0, sempre «NO»). | Il diametro scritto è quello della puleggia. | — |
| E-L4 | Rapporto dei diametri sul diametro del catalogo (#VALUE! con «altro fornitore»). | Sul diametro della fune usata. | — |
| E-L5 | Fune «diam. 8 - De Biase» senza carico di rottura (coefficiente 0). | Non offerta. | — |
| E-L6 | Verifiche di diametro, coefficiente e rapporto solo sullo schermo; il simbolo «Dmin/dlim» stampa D puleggia/d. | Esiti stampati sulle righe, diametro della puleggia stampato, simbolo «D/d». | UNI EN 81-20:2020, 5.6.2.2.1.3 b) e c) |
| E-L7 | Velocità d’intervento del limitatore non chiesta né verificata. | Dato di targa chiesto e verificato tra 1,15·v e il limite del paracadute. | UNI EN 81-20:2020, 5.6.2.2.1.1 a) |
| E-L14 | Limite della regola all’installazione solo citato in nota. | Con la UNI 10411-1, limitatore nuovo o velocità ridotta: limite e fonte dichiarati dal tecnico, velocità di targa verificata contro di essi. | UNI 10411-1:2024, 18 e 15.17 (nota 9) |
| E-L15 | Fune del limitatore sotto 6 mm «non verificata». | I 6 mm sono della UNI EN 81-1 (9.9.6.3), non della UNI EN 81-20:2020: sotto, «Attenzione». | UNI EN 81-20:2020, 5.6.2.2.1.3 |
| E-L9 | Con il collaudo DM 587/87 stampa «… punti a) b) c) d)» senza la riga che nomina la norma. | Stampa anche «della norma UNI EN 81.20 : 2020». | — |
| E-L10 | Tipo di paracadute da un foglio nascosto, usato anche se mai scelto. | Scelta obbligatoria sulla pagina (voce E-C23). | — |
| E-L11 | Paracadute «senza» stampa 0 m/s; velocità nulla dà #DIV/0!. | «senza» non offerto; senza velocità nominale la pagina non si emette. | — |
| E-L12 | Refuso «Carico di rottutra»; «Preformata» stampata anche per la fune di altro fornitore. | «Carico di rottura»; per la fune di altro fornitore la costruzione è «—». | — |
| E-L13 | Certifica sempre il limitatore «installato» conforme alla UNI EN 81-20 e allega la dichiarazione CE. | Con il limitatore che resta, frase del limitatore esistente e nessuna dichiarazione CE. | — |

## Porte

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-P1 | Tensione dell’operatore: vuota stampa «0», uno spazio stampa «preesistente V 50 Hz.»; con porta manuale stampa la tensione del quadro. | Porta di cabina preesistente: «preesistente»; motorizzata: tensione e frequenza; manuale: nessun motore. | — |
| E-P2 | Frasi su spinta, energia cinetica e collegamento elastico stampate per ogni porta di cabina. | Solo per la porta di cabina motorizzata. | — |
| E-P3 | Frasi e certificati delle serrature stampati anche con porte di piano preesistenti. | Con porte di piano preesistenti: «preesistenti». | — |
| E-P4 | Frequenza dell’operatore indipendente da quella del quadro. | Un solo valore (voce E-Q8). | — |
| E-P5 | Voci vuote negli elenchi (porta di cabina «preesistente/i», protezione al fuoco). | «preesistente/i» con il suo testo; la voce vuota del fuoco non è offerta. | — |
| E-P6 | Nessun confronto con la resistenza al fuoco delle porte esistenti. | Nuove porte di piano: classe non inferiore a quella delle esistenti. | UNI 10411-1:2024, 19.2 |
| E-P7 | Nessuna verifica dell’altezza delle porte. | Nuove porte di piano alte almeno 2000 mm; più basse solo dove l’edificio non lo consente, mai sotto le esistenti né sotto 1800 mm. | UNI 10411-1:2024, 19.1; UNI EN 81-20:2020, 5.3.2.1 |

## Funi di trazione

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-F1/E-F2 | Catalogo Donati: indice 8 ripetuto (la 11-152 dà i dati della 12-152); le funi a 114 fili senza dati valgono 0 (z = 0, peso 0). | Ogni fune ha il suo codice; le righe senza dati non sono offerte. | — |
| E-F3/E-F4 | Fune «altro»: la massa lineica inserita è ignorata; con due cataloghi scelti si sommano le masse. | Diametro, carico di rottura e massa sono quelli del Calcolo argano (una fune sola). | — |
| E-F6 | z > 12 (o > 16) stretto, anche con la pressione specifica non verificata. | z ≥ 12 (≥ 16 con due funi); con la D.2 non verificata vale il coefficiente S_f della UNI EN 81-50 calcolato nel Calcolo argano. | UNI EN 81-20:2020, 5.5.2.2; UNI 10411-1:2024, 14.1 c) e d); UNI EN 81-50:2020, 5.12 |
| E-F8 | Solo la stabilità allo scorrimento statica della D.1. | Con l’argano sostituito sono stampate anche le verifiche di aderenza nelle tre condizioni della UNI EN 81-50 5.11 del Calcolo argano. | UNI 10411-1:2024, 14.1 a); UNI EN 81-50:2020, 5.11 |
| E-F10 | Con la «X» (o oltre 2,5 m/s) a = 0,5 m/s² e C1 = 1,107, sotto il minimo della fascia. | C1 mai sotto il minimo della fascia di velocità; oltre 2,5 m/s C1 calcolato con la decelerazione di frenatura della cabina del Calcolo argano (mai sotto 1,25). | UNI 10411-1:2024, D.1 |
| E-F11/12/13 | Gole semicircolari: f con β fisso a 1,83 rad (aderenza sovrastimata ≈ 1,9 volte) o f = 0; f = 0 con «-». | f della D.1 per la gola: 4μ(1 − sin(β/2))/(π − β − sin β), β = 0 senza intaglio; μ/sin(γ/2) a cuneo. | UNI 10411-1:2024, D.1 |
| E-F14 | Angolo di avvolgimento vuoto = 0 (verifica sempre negativa). | L’angolo è quello del Calcolo argano (geometria o inserito). | — |
| E-F15 | Cavo flessibile 0,8 × corsa/2 sommato in N senza g. | Massa 0,8 kg/m × corsa/2 × g. | — |
| Rapporto | T1/T2 come lato cabina su lato contrappeso anche quando il contrappeso è il più pesante. | Tiro maggiore sul minore in ogni caso. | UNI 10411-1:2024, D.1 |
| D.1/D.2 | D.1 e D.2 sempre con esito «NON VERIFICATO» se non soddisfatte, anche con il rapporto tra i carichi invariato. | Con il rapporto tra i carichi cambiato la D.1 e la D.2 non soddisfatte bloccano (6.1); altrimenti la D.1 è «Attenzione» e la D.2 decide solo tra z e S_f (14.1 c) e d)), il suo esito è un’informazione. Lo stesso nel Calcolo argano. | UNI 10411-1:2024, 6.1, 14.1 c) e d), D.1 e D.2 |
| E-F17 | Limite della pressione × 0,981, non scritto nella formula stampata. | Fattore mantenuto (a favore di sicurezza) e scritto nella formula. | UNI 10411-1:2024, D.2 |
| E-F20 | Sempre «Le funi installate sono conformi…», anche con le funi esistenti. | Con le funi esistenti la pagina lo dice. | — |
| Gole | Limiti dell’angolo di gola solo in un commento (106° per β). | Verificati γ ≥ 35° e β ≤ 105°. | UNI EN 81-50:2020, 5.11.2.3.1 |

## Guide di cabina

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-1 | σ all’intervento del paracadute calcolata come (σm + Fk)/A: anche la flessione σm è divisa per l’area e quasi sparisce (σ ≈ Fk/A; nell’esempio 23,0 invece di 102,6 N/mm²), la verifica passa con la guida sovraccaricata | σ = σm + Fk/A, come la formula stampata | UNI EN 81-50:2020, 5.10.4 |
| E-2 | freccia delle guide di cabina entro 10 mm in marcia e al carico al piano | entro 5 mm in ogni caso: le guide di cabina portano sempre il paracadute | UNI EN 81-20:2020, 5.7.4.6 |
| E-3 | frecce all’intervento del paracadute stampate con il limite ma senza verifica | verificate entro 5 mm con l’esito sulla riga | UNI EN 81-20:2020, 5.7.4.6 |
| E-4 | raggio d’inerzia √(Jy/A): per T125/A, T125/B, T127-2/A e T127-2/B (Jy > Jx) snellezza e ω troppo bassi | raggio d’inerzia minimo √(min(Jx, Jy)/A), anche per il contrappeso | UNI EN 81-50:2020, 5.10.3 |
| E-5 | tensioni ammissibili a gradini 165/205, 195/244, 230/290 N/mm² per σr fino a 370, 440, 520 (σr 330 e 360 con 165/205) | Rm/St con St 2,25 in marcia e al carico e 1,8 all’intervento (A5 oltre 12 %), 3,75 e 3,0 (A5 da 8 a 12 %), sotto 8 % non ammesso; l’allungamento è un dato in più (proposto oltre 12 %); stampate con un decimale | UNI EN 81-20:2020, 5.7.4.5 (prospetto 15) |
| E-6 | flessione della suola 1,85·Fx/c² senza valore assoluto: con Fx negativa la verifica passa sempre | 1,85·\|Fx\|/c² | UNI EN 81-50:2020, 5.10.5 |
| E-7 | XQ = profondità/8 e YQ = larghezza/8 usati come distanze dagli assi delle guide, senza il centro della cabina e in un solo verso | la portata a Xc ± XQ e Yc ± YQ, nel verso più gravoso per ogni forza; stampate come «± XQ» | UNI EN 81-20:2020, 5.7.2.3.4 |
| E-8 | caso «Distribuzione del carico» (K1 rispetto al punto di sospensione, limite di marcia) stampato come verifica | stampato con una nota: caso del modello non previsto dalla norma, il non verificato è un’attenzione | UNI EN 81-50:2020, 5.10 |
| E-9 | le due eccentricità della portata nello stesso caso (la norma le prende una alla volta) | mantenuto: più severo della norma, a favore di sicurezza | UNI EN 81-50:2020, 5.10 |
| E-10 | numero delle guide fisso 2 nel calcolo, mentre «39. Numero guide:» è un dato non usato | n dal dato «39. Numero guide:» (proposto 2); così anche per il contrappeso | — |
| E-11 | paracadute di cabina «senza» selezionabile (K1 = 0: verifiche all’intervento soddisfatte con zeri); dati vuoti come zero | «senza» tolto dalla lista della cabina; un dato vuoto è un dato mancante e nulla si calcola | UNI EN 81-20:2020, 5.6.1 |
| E-λ | snellezza λ arrotondata all’intero prima di ω (ω può risultare più basso) | λ = l/i esatto; stampato arrotondato | UNI EN 81-50:2020, 5.10.3 |
| E-12 | λ sotto 20: ω #N/D; λ oltre 250: errore senza messaggio sulla pagina della cabina | λ sotto 20 come 20; oltre 250 ω non applicabile, verifica a carico di punta non soddisfatta e «VERIFICA GUIDE e/o STAFFE» | UNI EN 81-50:2020, 5.10.3 |
| E-13 | ω per Rm 520 delle guide di cabina con gli intervalli di λ di Rm 370 (fino al 16 % in meno) | ω520 con i suoi intervalli 50, 70, 89, 250 (quelli della colonna del contrappeso, KR.omega520) | UNI EN 81-50:2020, 5.10.3 |
| E-14 | ω estrapolato sotto Rm 370 (σr 330 e 360 del catalogo: ω minore di quello di 370) | ω interpolato solo tra Rm 370 e 520; fuori il metodo omega non si applica e la verifica a carico di punta non è soddisfatta | UNI EN 81-50:2020, 5.10.3 |
| E-16 | massa della colonna guida negativa con corsa, testata o fossa vuote; intestazione «kg/m» per un valore in kg | corsa dal calcolo, testata e fossa richieste; la massa stampata in kg | — |
| E-17 | spinta delle staffe Fp sempre 0 (anche oltre 40 m di corsa) | Fp trascurata fino a 40 m di corsa; oltre, Fp è un dato richiesto e entra in Fk, Fv e σ | UNI EN 81-20:2020, 5.7.2.3.5 |
| E-18 | in marcia e al carico al piano solo flessione, suola e frecce | anche σ = σm + (Mg·g + Fp)/A entro la tensione ammissibile in marcia (cabina e contrappeso) | UNI EN 81-50:2020, 5.10.4 |
| E-19 | carico al piano su un solo accesso (Xi, Yi) | un secondo accesso facoltativo (Xi, Yi del secondo accesso) verificato a parte | UNI EN 81-20:2020, 5.7.2.3.6 |
| E-20 | suggerimento «presa istantanea a rulli» solo sotto 0,63 m/s e non applicato: ogni tipo a ogni velocità | paracadute istantaneo verificato fino a 0,63 m/s compresi | UNI EN 81-20:2020, 5.6.2.1.2.1 |
| E-OPZ | le liste dei profili offrono sia «altra cwt» sia «altra cabina» (la cabina con i dati della guida del contrappeso) | ogni lista offre solo la propria guida inserita a mano | — |

## Contrappeso

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-15 | ω del contrappeso con λ = 20: #N/D (ricerca da λ 21) | ω di λ 20 | UNI EN 81-50:2020, 5.10.3 |
| E-23 | forze delle guide del contrappeso (K·g·P·X/n)/(Mg·g): divise per il peso della guida e mai per h, in mm e non in N | Fx = K·g·Mcwt·XS/(n·h) e Fy = K·g·Mcwt·YS/((n/2)·h) per la flessione; Fv = K1·g·Mcwt/n + Mg·g + Fp per il carico di punta | UNI EN 81-50:2020, 5.10 |
| E-24 | nessuna verifica del contrappeso confronta σ o δ con il limite (solo il messaggio per λ oltre 250) | σm, σF, σ e frecce verificati con l’esito sulla riga | UNI EN 81-50:2020, 5.10 |
| E-25 | con il paracadute del contrappeso nessuna verifica a carico di punta (ω stampato e non usato) | σk = Fv·ω/A, σ = σm + Fv/A e σc = σk + 0,9·σm entro la tensione ammissibile all’intervento | UNI EN 81-50:2020, 5.10.3 e 5.10.4 |
| E-26 | tensioni ammissibili 165/205 solo con σr = 370, altrimenti 195/244 (σr 330 e 360: 195) | Rm/St come per la cabina (E-5) | UNI EN 81-20:2020, 5.7.4.5 (prospetto 15) |
| E-27 | all’intervento del paracadute il limite di marcia; righe 29–30 doppie con una seconda tensione ammissibile | limite all’intervento Rm/1,8 (o Rm/3,0); righe doppie tolte | UNI EN 81-20:2020, 5.7.4.5 |
| E-28 | frecce 10 mm in marcia e 5 mm all’intervento qualunque sia il paracadute; pagina dell’intervento stampata anche «senza» | 10 mm senza paracadute, 5 mm con il paracadute; la pagina dell’intervento solo con il paracadute | UNI EN 81-20:2020, 5.7.4.6 |
| E-29 | eccentricità del contrappeso 2,5 % della larghezza DFG e 5 % della profondità (la metà) | 5 % di DFG (YS) e 10 % della profondità (XS) | UNI EN 81-20:2020, 5.7.2.3.3 |
| E-30 | forza lungo la linea delle guide divisa per n | divisa per n/2, come per la cabina | UNI EN 81-50:2020, 5.10 |
| E-31 | accanto a σy e σx stampato «< = σamm/3,75» senza verifica | tolto (3,75 è uno St, non un divisore di σamm) | — |
| E-33 | «PESO CONTRAPPESO OK» solo con «cwt solo verifica - bordiglioni»: con le altre scelte la pagina stampa «non rientra» anche con il peso nella tolleranza | l’esito dipende solo dalle masse; la scelta è stampata come «Intervento» | UNI 10411-1:2024, 6.1 (prospetto 2) |
| E-34 | limite sul 25 % o 10 % della portata prima, percentuale stampata secondo la portata dopo; la diminuzione non detta | sulla portata minore tra prima e dopo, con la riga più severa se una supera 500 kg (la stessa regola dei carichi documentati); la diminuzione stampa le verifiche che porta; con la UNI 10411-11 ogni aumento | UNI 10411-1:2024, 6.1 (prospetto 2); UNI 10411-11:2024, 6.1 |
| E-35 | pagina della massa del contrappeso con «pag. 10» fisso, fuori dal conteggio delle pagine | numerata con le altre pagine del fascicolo | — |
| E-36 | testi con «UNI 10411.1 : 2021» | l’edizione della relazione («UNI 10411-1 : 2024») | UNI 10411-1:2024, 6.1 |
| E-37 | «VERIFICA CWT» legge lunghezza e freccia sempre dal foglio degli ammortizzatori a molla del contrappeso | «L ammortizzatore» e «Freccia ammortizzatore» sono dati del componente, per ogni tipo di ammortizzatore | — |
| E-38 | etichetta «300 + 3,5 * V^2» per 300 + 35·v² mm | stampata «300 + 35 * V^2» | — |
| E-39 | «VERIFICA CWT» senza un punto di norma, fuori dalle pagine | stampata sulla pagina del contrappeso quando i suoi dati sono dati; il margine insufficiente è un’attenzione, non un esito negativo | — |

## Ammortizzatori di cabina e del contrappeso

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| X1 | Senza velocità nominale la velocità vale 0: la corsa minima è 0 e ogni ammortizzatore con f > 65 mm risulta «OK»; con VVVF e la velocità precedente vuota la molla è verificata a 0 m/s anche con la velocità nuova inserita. | La velocità nominale dopo la modifica viene dal Calcolo argano ed è richiesta (maggiore di 0): senza, le verifiche non sono soddisfatte e la relazione non si emette. | UNI EN 81-20:2020, 5.8.2.1.1.1 e 5.8.2.2.1 |
| X2 | Tre fogli per lato, ognuno con il suo «Numero ammortizzatori» (e due «Freccia massima»); due tipi si possono abilitare insieme per lo stesso lato e sono stampati entrambi. | Un solo tipo e un solo numero di ammortizzatori per lato (il primo campo «tipo»). | — |
| X3 | Nessun limite di velocità per molle e autan: le molle 78.025–78.028, RC01713 e RC01714 passano la verifica della corsa fino a 1,01–1,12 m/s, una molla «altro» a ogni velocità. | Ammortizzatori ad accumulo di energia (molle e autan) solo fino a 1 m/s di velocità nominale; oltre, la verifica non è soddisfatta. | UNI EN 81-20:2020, 5.8.1.5 |
| X5 | La pagina non stampa il modello dell’ammortizzatore né l’esito delle verifiche (fuori dall’area di stampa). | La pagina stampa il modello del catalogo («Modello:») e l’esito di ogni verifica sulla riga del suo valore. | — |
| X6 | Le verifiche senza ramo «altrimenti» danno FALSO invece di «NO!» (molla e idraulici con f < fmin, molla con rapporto ≤ 2,5). | Ogni verifica è soddisfatta o non soddisfatta. | — |
| S1 | Corsa della molla accettata solo con f > 65 mm (estremo escluso); la pagina stampa solo «fmin = 135 v2». | f ≥ 135·v² mm e f ≥ 65 mm, estremi compresi; la pagina aggiunge «e comunque non minore di 65 mm». | UNI EN 81-20:2020, 5.8.2.1.1.1 |
| S2 | Rapporto dei carichi con gli estremi esclusi, stampato «2,5 < Fadm/Fris < 4:». | Estremi compresi, stampato «2,5 ≤ Fadm/Fris ≤ 4:». | UNI EN 81-20:2020, 5.8.2.1.1.2 |
| S4 | Con azionamento VVVF e velocità nuova oltre il 105 % della precedente la molla è verificata con la velocità precedente (gli idraulici con la nuova). | Ogni tipo è verificato con la velocità nominale dopo la modifica, la stessa del Calcolo argano e di tutto il fascicolo. | UNI EN 81-20:2020, 5.8.2.1.1.1 |
| S5 | Due elenchi di molle con una priorità nascosta (dati a mano, poi elenco DONATI / CMM, poi elenco principale); le voci vuote o «-» danno zero e #DIV/0! sulla pagina. | Un solo elenco (elenco principale, DONATI / CMM, «altro»); le righe senza dati non sono offerte; senza scelta la relazione non si emette. | — |
| S6 | La riga «78.026 Centoducati» ha 14,25 spire attive: la formula dà f = 169,9 mm e Fadm = 14037 N, oltre la corsa (153,4 mm) e il carico massimo (11840 N) dello stesso catalogo. | 15,25 spire, il valore che dà la corsa, la costante (7,72 daN/mm) e il carico massimo della riga: f = 153,4 mm, Fadm = 11843 N. | UNI EN 81-20:2020, 5.8.2.1.1.2 |
| H1 | Il «Numero ammortizzatori» degli idraulici è vuoto (Fris = #DIV/0! stampato); quello di molle e autan vale 2 (cabina) o 1 (contrappeso) senza dirlo. | Numero richiesto per ogni tipo, proposto (e mostrato come proposta) 2 per la cabina e 1 per il contrappeso. | — |
| H2 | Rallentamento «CON» come valore iniziale: corsa minima 0,5 × 0,0674·v² fino a 4 m/s e 0,333 × oltre, senza minimo assoluto, su sola dichiarazione. | Proposto «SENZA»; con «CON» la corsa si riduce solo oltre 2,5 m/s, calcolata con la velocità di contatto garantita dal controllo (0,0674·vi²), mai meno di 420 mm né più della corsa piena, con l’avviso di documentare il controllo del rallentamento; 50 %, un terzo e 540 mm sono della UNI EN 81-1:1998 (10.4.3.2), non della UNI EN 81-20:2020. | UNI EN 81-20:2020, 5.8.2.2.2 e 5.12.1.3 |
| H3 | Agli ammortizzatori idraulici si applica anche f > 65 mm, regola delle sole molle. | Solo f ≥ fmin. | UNI EN 81-20:2020, 5.8.2.2.1 |
| H4 | Il catalogo idraulico dà «carico [kg]» minimo e massimo e «v nom», ma il foglio non verifica né le masse né la velocità. | Massa su ogni ammortizzatore (cabina vuota e a pieno carico, o contrappeso) entro il campo del certificato e 1,15·v entro la sua velocità d’urto; per i modelli del catalogo, senza i dati del certificato, 300–2000 kg e 1,15 volte la seconda cifra di «v nom». | UNI EN 81-20:2020, 5.8.2.2.3; UNI EN 81-50:2020, 5.5.4 |
| H5 | Le voci «-» e vuote dell’elenco idraulico danno f = 0 (pagina con 0 mm, esito «NO!» non stampato). | Non sono offerte. | — |
| A1 | Il foglio autan non calcola nulla: i dati inseriti non sono letti, l’esito è sempre «NO!» o FALSO e la pagina dice solo «Caratteristiche ammortizzatori come da certificato allegato». | Velocità nominale fino a 1 m/s, 1,15·v entro la velocità d’urto del certificato e massa su ogni ammortizzatore entro il suo campo; la pagina stampa modello, numero, freccia, carico linearizzato e le verifiche. | UNI EN 81-20:2020, 5.8.1.5 e 5.8.2.1.2.1; UNI EN 81-50:2020, 5.5.4 |
| T1 | Etichetta «Modulo elesatico G:». | «Modulo elastico G:» (refuso). | — |
| T2 | Il passo della molla del contrappeso è stampato in formato «Generale» (quello della cabina con due decimali). | Due decimali per entrambi. | — |
| T3 | Il carico statico risultante degli idraulici («Fris:») è stampato senza unità. | Stampato con «N». | — |

## Macchina

| Id | Nel file | In LiftPilot | Norma |
|---|---|---|---|
| E-M1 | La nota sull’inverter non si stampa mai con dati reali. | Stampata con VVVF quando il motore a 50 Hz cambierebbe la velocità oltre il 5 % e la velocità nominale resta entro il 5 %. | — |
| E-M2 | ±5 % sulla velocità «prima» (anche le riduzioni), con il bordo del 5 % contraddittorio tra schermo e pagina. | Regola della 15.1 (aumento oltre il 5 % rispetto alla maggiore tra libretto e 50 Hz); UNI 10411-11: ogni variazione. | UNI 10411-1:2024, 15.1 e 15.16 |
| E-M3/E-M4 | «preesistente» mai stampato per puleggia e funi; tipo di gola inserito due volte. | Dati della macchina dal Calcolo argano, una volta sola; «preesistente» con la macchina che resta. | — |
| E-M5 | Descrizione fissa dell’argano, nessun dato del freno. | Con l’argano nuovo: modello e verifiche del freno del Calcolo argano. | UNI EN 81-20:2020, 5.9.2 |
| E-M9 | Frequenza VVVF dai «giri per VF» 1000/1500. | Frequenza dai poli del motore del Calcolo argano. | — |
| E-M10 | Dichiarazione sulle strutture portanti sempre stampata. | Con i carichi oltre il prospetto 1 la pagina rimanda alla dichiarazione di idoneità dell’edificio allegata; con il contrappeso oltre il prospetto 2 la dichiarazione è proposta («se pertinente») e, se allegata, la pagina rimanda a essa invece di dichiarare le forze non significative. | UNI 10411-1:2024, 6.1 e appendice C |
