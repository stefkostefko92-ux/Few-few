# 10. Validazione, aspetti legali, roadmap

[← Indice](README.md)

## 10.1 Come si dimostra che il motore di calcolo è giusto

Un errore di formula in questo software non produce un bug visibile: produce un impianto
sottodimensionato. La validazione è quindi parte del prodotto, non una fase finale.

1. **Trascrizione controllata delle formule.** Si acquistano UNI EN 81-20:2020, UNI EN
   81-50:2020, EN ISO 8100-1/-2:2026 e UNI 10411-1:2024; due persone trascrivono indipendentemente ogni formula e
   ogni tabella usata (capitolo 4, tutti i ⚠️) in una specifica interna; le differenze si
   risolvono sul testo. La specifica è firmata da un ingegnere con esperienza di ascensori.
2. **Test unitari per formula**, con valori attesi calcolati fuori dal codice (foglio di calcolo
   indipendente), comprese le unità.
3. **Casi pubblicati come oracolo**: la relazione liftdesign.it (S_f = 16,69) e il caso di Mellor
   (N_equiv = 7, D/d = 40 → circa 16) sono già riprodotti dal prototipo (capitolo 4.5).
4. **Back-test sui cataloghi**: ogni riga delle tabelle “applicazioni tipiche” di un costruttore
   (es. Montanari M65: 400 kg, 1 m/s, puleggia 480 mm, 4×Ø10, 4 kW) deve risultare ammissibile
   con i dati di quel costruttore. Una riga scartata vuol dire formula sbagliata oppure ipotesi
   diverse (rendimento, bilanciamento): in entrambi i casi va capito prima di andare avanti.
5. **Casi reali di riferimento**: 10–20 impianti con relazione di calcolo firmata o con l'uscita
   del configuratore del costruttore; tolleranza dichiarata sui risultati. Per il caso principale
   servono **sostituzioni già eseguite**, con dati prima e dopo (argano vecchio e nuovo, correnti
   misurate, esito della verifica straordinaria), sia con macchina in alto sia in basso.
6. **Test di proprietà**: aumentare Q non riduce mai la potenza richiesta; aumentare α non
   peggiora mai l'aderenza; aumentare D/d non aumenta mai S_f,calc; nessun risultato NaN o
   infinito per input validi.
7. **Regressione**: ogni cambio di versione del motore o del catalogo riesegue tutti i casi; un
   risultato che cambia richiede una nota di rilascio.
8. **Revisione indipendente** prima del lancio: un ingegnere esterno ripete a mano due o tre casi
   completi; opzionalmente un organismo notificato valuta il report come documento del fascicolo.
9. **Metodo del percorso della fune**: con la macchina in alto senza rinvii deve dare gli stessi
   tiri delle formule dirette del capitolo 4.2; per la macchina in basso si confronta con un
   calcolo a mano indipendente dei due casi di frenatura.

## 10.2 Responsabilità e aspetti legali

Non è consulenza legale: sono i punti da portare a un legale prima del lancio.

| Tema | Che cosa dicono le fonti | Cosa fare |
|---|---|---|
| Direttiva 2014/33/UE | la conformità è dell'installatore; il report entra nel fascicolo tecnico esaminato dall'organismo notificato (capitolo 2.1) | report tracciabile: input, metodo, profilo normativo, versioni del motore e del catalogo, hash |
| Responsabilità da prodotto difettoso, Direttiva (UE) 2024/2853 | il software è un prodotto indipendentemente dalla modalità di fornitura (considerando 13 ⚠️); si applica ai prodotti immessi sul mercato dopo il **9 dicembre 2026**; verso il danneggiato la responsabilità non può essere limitata né esclusa per contratto (art. 15 ✅). In Italia il Consiglio dei ministri del 4 agosto 2026 ha approvato in esame preliminare il decreto di recepimento; l'adozione definitiva non è verificata | assicurazione RC prodotto; dossier di validazione (10.1); ruoli chiari nel report (il software propone, il progettista verifica e firma); le clausole contrattuali ripartiscono il rischio solo tra imprese |
| Cyber Resilience Act, Regolamento (UE) 2024/2847 | un SaaS puro usato dal browser è fuori campo; un componente installabile (app desktop o mobile, calcolatore offline) sarebbe un prodotto con elementi digitali; applicazione piena dall'11 dicembre 2027 ⚠️ | restare SaaS nel browser nelle prime fasi |
| Diritto d'autore sulle norme | CEN-CENELEC vieta la copia anche parziale senza accordo; la licenza UNI ammette riproduzioni parziali solo per uso interno; la sentenza CGUE C-588/21 P (5 marzo 2024) riconosce un interesse pubblico prevalente all'**accesso** alle norme armonizzate, non una licenza a riprodurle; metodi e formule in sé non sono protetti dal diritto d'autore (TRIPS art. 9.2) | implementare i metodi nel proprio codice; citare numero di clausola ed edizione; non mostrare testo, figure o tabelle della norma; chiedere a UNI per i valori tabellari; l'utente deve possedere la norma |
| Dati dei costruttori | i cataloghi sono protetti (il catalogo Sassi riporta “riproduzione riservata”) | accordi scritti di uso dei dati nel software, fonte per ogni valore (capitolo 8.2) |
| GDPR | dati personali minimi (account); i progetti sono dati commerciali riservati del cliente | hosting UE, isolamento per tenant, conservazione dichiarata |

## 10.3 Avvertenza e limitazione di responsabilità

Posizione dell'azienda: il software è uno strumento automatico di ausilio al calcolo, che rende il
pre-dimensionamento più facile e veloce; la responsabilità della progettazione, della verifica dei
risultati e della conformità dell'impianto resta sempre dell'installatore e dei tecnici che usano i
risultati. È coerente con il quadro del capitolo 2: la conformità dell'impianto è
dell'installatore, e la sostituzione della macchina passa dalla verifica straordinaria.

Dove va il testo: nell'interfaccia sopra i risultati, in ogni report (anche nel riepilogo copiato)
e nelle condizioni d'uso accettate alla registrazione. Il calcolatore prototipo lo mostra già in
italiano, inglese e bulgaro. È una bozza da far rivedere a un legale; fa fede la versione italiana.

**Testo proposto — Avvertenza e limitazione di responsabilità.** Questo calcolatore è uno strumento
automatico di ausilio al calcolo: rende il pre-dimensionamento più facile e veloce, ma i risultati
sono indicativi e non costituiscono una relazione di calcolo, un progetto o un parere tecnico. La
responsabilità della progettazione, della verifica dei risultati, della scelta dei componenti e
della conformità dell'impianto resta sempre in capo all'installatore e ai tecnici che li
utilizzano.

1. Il software applica formule ricostruite da fonti secondarie (valori marcati ⚠) ai dati inseriti
   dall'utente, senza verificarne la correttezza: dati errati producono risultati errati.
2. Prima di ogni uso i risultati vanno verificati da un tecnico qualificato sui testi vigenti delle
   norme (tra cui UNI EN 81-20, UNI EN 81-50 e UNI 10411-1) e sui dati dei costruttori.
3. La conformità dell'impianto, la documentazione per l'organismo notificato e ogni decisione
   sull'impianto restano a carico dell'installatore e dei tecnici incaricati, secondo la normativa
   vigente (tra cui la Direttiva 2014/33/UE e il DPR 162/1999).
4. Il software è fornito “così com'è”, senza garanzie di esattezza, completezza o idoneità a uno
   scopo specifico.
5. Nei limiti massimi consentiti dalla legge applicabile, Carbon Stealth VCC non risponde di danni
   diretti o indiretti derivanti dall'uso dei risultati o dall'impossibilità di usarli. Restano
   salvi i casi in cui la responsabilità non può essere esclusa o limitata per legge.
6. Usando il calcolatore accetti queste condizioni.

Che cosa l'avvertenza non può fare, e perché servono anche le misure della tabella 10.2:

- **Verso il danneggiato** non esclude né limita la responsabilità da prodotto difettoso: la
  Direttiva (UE) 2024/2853, art. 15, chiede agli Stati membri di impedirlo sia per contratto sia per
  legge nazionale ✅.
- **Dolo e colpa grave**: in Italia è nullo ogni patto che esclude o limita preventivamente la
  responsabilità per dolo o colpa grave, o per la violazione di obblighi derivanti da norme di
  ordine pubblico (art. 1229 c.c.) ✅.
- **Condizioni generali di contratto**: le limitazioni di responsabilità a favore di chi le ha
  predisposte hanno effetto solo se approvate specificamente per iscritto (art. 1341, secondo
  comma, c.c.) ✅. Come raccogliere questa approvazione nella registrazione online va deciso con il
  legale ⚠️.

Per questo il testo limita la responsabilità «nei limiti massimi consentiti dalla legge» e fa salvi
i casi inderogabili, invece di escluderla del tutto.

## 10.4 Roadmap

Le durate sono **stime di ordine di grandezza** per un team di una persona full-stack
TypeScript senior più un ingegnere ascensorista a tempo parziale; non sono un preventivo.

| Fase | Contenuto | Uscita | Stima |
|---|---|---|---|
| 0. Fondamenta | acquisto delle norme; specifica firmata delle formule; accordo dati con 1–2 costruttori; 10 casi di riferimento; risposte alle domande aperte (README) | specifica + casi + dati | 2–3 settimane |
| 1. Sostituzione (MVP) | rilievo guidato; motore di calcolo con percorso della fune (macchina in alto e in basso, 1:1 e 2:1, rinvii, gole U e V); calcolo dell'argano esistente e controllo dei dati; verifica di un argano nuovo inserito a mano; confronto vecchio/nuovo; adeguamenti UNI 10411-1; report PDF; IT/EN/BG; account; audit | lo strumento per il lavoro quotidiano di sostituzione | 8–10 settimane |
| 2. Selettore | catalogo multi-marca con approvazione a quattro occhi, enumerazione, ordinamento, scarti spiegati, sensibilità | il selettore vero e proprio | 4–6 settimane |
| 3. Estensioni | impianti nuovi con il profilo EN 81-20 completo (UCMP), compensazione, doppio avvolgimento, 4:1, montacarichi, secondo profilo EN ISO 8100, energia (ISO 25745-2, VDI 4707), vita delle funi (Feyrer), lettura delle targhe da foto, integrazione con preventivi/ERP | prodotto completo | per moduli |

Perché la sostituzione con verifica prima del selettore: è il caso d'uso principale, è utile da
subito anche senza catalogo (l'installatore inserisce l'argano offerto dal fornitore) e produce i
casi di test che servono al selettore.

## 10.5 Rischi principali

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Formula trascritta male o profilo normativo sbagliato | media | molto alto | 10.1 punti 1–9; versioni nel report |
| Dati del catalogo incompleti (rendimento per rapporto, definizione del carico sull'albero, coppia del freno, inerzie) | alta | alto | raccolta dati in fase 0; default dichiarati e marcati; verifica “con dati dell'utente” |
| Costruttori non disposti a dare i dati | media | alto | partire da un costruttore partner; modalità “macchina inserita a mano” |
| Transizione EN 81-50 → EN ISO 8100-2 | certa | medio | profilo normativo versionato dal primo giorno |
| Rilievo impreciso (massa della cabina, bilanciamento, quote) | alta | alto | prova di bilanciamento, origine di ogni dato, controllo con l'argano esistente (capitolo 6.4), sensibilità ±10% |
| Requisiti della UNI 10411-1:2024 diversi dalle sintesi dell'edizione 2021 | media | alto | acquisto e lettura della 2024 in fase 0; lista di adeguamenti come dato versionato, non come codice |
| Adozione: gli installatori usano già i configuratori gratuiti dei costruttori | media | alto | valore che i configuratori non danno: confronto multi-marca, verifiche esposte, flusso per la sostituzione |
| Responsabilità civile (Direttiva 2024/2853) | bassa | molto alto | 10.2 e 10.3 |
