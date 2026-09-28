# 8. Validazione, aspetti legali, roadmap

[← Indice](README.md)

## 8.1 Come si dimostra che il motore di calcolo è giusto

Un errore di formula in questo software non produce un bug visibile: produce un impianto
sottodimensionato. La validazione è quindi parte del prodotto, non una fase finale.

1. **Trascrizione controllata delle formule.** Si acquistano UNI EN 81-20:2020, UNI EN
   81-50:2020 ed EN ISO 8100-1/-2:2026; due persone trascrivono indipendentemente ogni formula e
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
   del configuratore del costruttore; tolleranza dichiarata sui risultati.
6. **Test di proprietà**: aumentare Q non riduce mai la potenza richiesta; aumentare α non
   peggiora mai l'aderenza; aumentare D/d non aumenta mai S_f,calc; nessun risultato NaN o
   infinito per input validi.
7. **Regressione**: ogni cambio di versione del motore o del catalogo riesegue tutti i casi; un
   risultato che cambia richiede una nota di rilascio.
8. **Revisione indipendente** prima del lancio: un ingegnere esterno ripete a mano due o tre casi
   completi; opzionalmente un organismo notificato valuta il report come documento del fascicolo.

## 8.2 Responsabilità e aspetti legali

Non è consulenza legale: sono i punti da portare a un legale prima del lancio.

| Tema | Che cosa dicono le fonti | Cosa fare |
|---|---|---|
| Direttiva 2014/33/UE | la conformità è dell'installatore; il report entra nel fascicolo tecnico esaminato dall'organismo notificato (capitolo 2.1) | report tracciabile: input, metodo, profilo normativo, versioni del motore e del catalogo, hash |
| Responsabilità da prodotto difettoso, Direttiva (UE) 2024/2853 | il software è un prodotto indipendentemente dalla modalità di fornitura (considerando 13 ⚠️); si applica ai prodotti immessi sul mercato dopo il **9 dicembre 2026**; verso il danneggiato la responsabilità non può essere limitata né esclusa per contratto (art. 15 ⚠️). In Italia il Consiglio dei ministri del 4 agosto 2026 ha approvato in esame preliminare il decreto di recepimento; l'adozione definitiva non è verificata | assicurazione RC prodotto; dossier di validazione (8.1); ruoli chiari nel report (il software propone, il progettista verifica e firma); le clausole contrattuali ripartiscono il rischio solo tra imprese |
| Cyber Resilience Act, Regolamento (UE) 2024/2847 | un SaaS puro usato dal browser è fuori campo; un componente installabile (app desktop o mobile, calcolatore offline) sarebbe un prodotto con elementi digitali; applicazione piena dall'11 dicembre 2027 ⚠️ | restare SaaS nel browser nelle prime fasi |
| Diritto d'autore sulle norme | CEN-CENELEC vieta la copia anche parziale senza accordo; la licenza UNI ammette riproduzioni parziali solo per uso interno; la sentenza CGUE C-588/21 P (5 marzo 2024) riconosce un interesse pubblico prevalente all'**accesso** alle norme armonizzate, non una licenza a riprodurle; metodi e formule in sé non sono protetti dal diritto d'autore (TRIPS art. 9.2) | implementare i metodi nel proprio codice; citare numero di clausola ed edizione; non mostrare testo, figure o tabelle della norma; chiedere a UNI per i valori tabellari; l'utente deve possedere la norma |
| Dati dei costruttori | i cataloghi sono protetti (il catalogo Sassi riporta “riproduzione riservata”) | accordi scritti di uso dei dati nel software, fonte per ogni valore (capitolo 6.2) |
| GDPR | dati personali minimi (account); i progetti sono dati commerciali riservati del cliente | hosting UE, isolamento per tenant, conservazione dichiarata |

## 8.3 Roadmap

Le durate sono **stime di ordine di grandezza** per un team di una persona full-stack
TypeScript senior più un ingegnere ascensorista a tempo parziale; non sono un preventivo.

| Fase | Contenuto | Uscita | Stima |
|---|---|---|---|
| 0. Fondamenta | acquisto delle norme; specifica firmata delle formule; accordo dati con 1–2 costruttori; 10 casi di riferimento; risposte alle domande aperte (README) | specifica + casi + dati | 2–3 settimane |
| 1. Verifica (MVP) | motore di calcolo (1:1, 2:1, rinvio, gole U e V), verifica di una macchina inserita a mano, report PDF, IT/EN/BG, account, audit | uno strumento già utile per le sostituzioni | 6–8 settimane |
| 2. Selettore | catalogo multi-marca con approvazione a quattro occhi, enumerazione, ordinamento, scarti spiegati, sensibilità | il selettore vero e proprio | 4–6 settimane |
| 3. Estensioni | flusso DPR 162/1999 + UNI 10411-1 completo, compensazione, doppio avvolgimento, 4:1, montacarichi, secondo profilo EN ISO 8100, energia (ISO 25745-2, VDI 4707), vita delle funi (Feyrer), integrazione con preventivi/ERP | prodotto completo | per moduli |

Perché la verifica prima del selettore: è utile da subito (anche senza catalogo), richiede solo
le formule e produce i casi di test che servono al selettore.

## 8.4 Rischi principali

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Formula trascritta male o profilo normativo sbagliato | media | molto alto | 8.1 punti 1–8; versioni nel report |
| Dati del catalogo incompleti (rendimento per rapporto, definizione del carico sull'albero, coppia del freno, inerzie) | alta | alto | raccolta dati in fase 0; default dichiarati e marcati; verifica “con dati dell'utente” |
| Costruttori non disposti a dare i dati | media | alto | partire da un costruttore partner; modalità “macchina inserita a mano” |
| Transizione EN 81-50 → EN ISO 8100-2 | certa | medio | profilo normativo versionato dal primo giorno |
| Adozione: gli installatori usano già i configuratori gratuiti dei costruttori | media | alto | valore che i configuratori non danno: confronto multi-marca, verifiche esposte, flusso per la sostituzione |
| Responsabilità civile (Direttiva 2024/2853) | bassa | molto alto | 8.2 |
