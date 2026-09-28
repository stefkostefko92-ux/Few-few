# Ricerca: un software web per scegliere l'argano geared

_Data: 2026-09-28 · Metodo: cinque filoni di ricerca paralleli (norme e formule; costruttori e
cataloghi; software esistente e funi; diritto UE e italiano; dimensionamento di motore,
riduttore e freno), più una ricerca mirata sulla sostituzione dell'argano, controlli incrociati
tra le fonti e **riproduzione numerica** delle formule con un prototipo del motore di calcolo.
Marcatori: ✅ confermato da almeno due fonti indipendenti o riprodotto numericamente su un caso
pubblicato; ⚠️ fonte singola o secondaria, da verificare sul testo ufficiale. Limite importante:
la rete dell'ambiente di ricerca bloccava l'apertura delle pagine, quindi i fatti vengono dagli
estratti dei motori di ricerca (capitolo 11)._

## Sintesi

1. **Caso d'uso principale: sostituire argani vecchi con argani nuovi** su impianti esistenti in
   Italia, con macchina **in alto o in basso** (capitoli 5 e 6). L'impianto nuovo è una variante.
2. **Che cosa fa il software.** Parte dal rilievo dell'impianto (targhe, misure, prova di
   bilanciamento), ricostruisce masse e percorso delle funi, calcola l'argano esistente per
   controllare i dati, poi valuta *tutte* le configurazioni di un catalogo multi-marca (modello ×
   rapporto × puleggia × motore × freno) con 19 verifiche (capitolo 4.12). Ordina le ammissibili
   per margine minimo, costo e rendimento, e produce il confronto vecchio/nuovo, gli adeguamenti
   UNI 10411-1 e un report tracciabile per la verifica straordinaria.
3. **Parametri considerati** (capitolo 3.1):
   - angolo di avvolgimento, calcolato dalle quote;
   - potenza, rapporto di riduzione, poli e giri di targa del motore;
   - masse di cabina e contrappeso, anche dal carico di equilibrio misurato;
   - numero, diametro, peso e carico di rottura delle funi;
   - coefficiente di aderenza, cioè μ della norma combinato con il profilo della gola;
   - diametro della puleggia, velocità nominale;
   - percorso delle funi e pulegge di rinvio con le loro inerzie;
   - rendimento del riduttore e del vano, inerzie, avviamenti/ora, massa della macchina e ancoraggi.
4. **Macchina in basso**: il peso dei tratti di fune che scendono dalle pulegge in testata e
   l'inerzia di queste pulegge peggiorano l'aderenza. Nell'esempio, a parità di impianto, il
   rapporto T1/T2 nel caso critico passa da 1,642 a 1,687 e l'utilizzo sale da 0,97 a 0,99. Il
   carico sull'albero si ribalta verso l'alto: circa 2 t di sollevamento netto sugli ancoraggi,
   158 kg in più con la macchina nuova, più leggera (capitolo 7.3).
5. **Il cuore del calcolo** è l'aderenza (EN 81-50 §5.11, tre condizioni con Euler-Eytelwein),
   calcolata con il metodo del percorso della fune (capitolo 5.2), e il coefficiente di sicurezza
   delle funi (EN 81-50 §5.12, riprodotto su due casi pubblicati, uno dei due al centesimo ✅).
   Si aggiungono i requisiti su freno, UCMP e soccorso, più la meccanica di potenza, coppie, inerzie
   e carico sull'albero. I valori di μ e le formule del fattore di gola vengono da fonti secondarie
   ⚠️: vanno trascritti dal testo UNI acquistato prima di scrivere codice.
6. **Perché un selettore e non un foglio di calcolo** (capitolo 7.2): in un caso da 630 kg la
   frenatura d'emergenza a cabina vuota fallisce del 2,9%, e due delle quattro correzioni “ovvie”
   rompono la verifica del carico sull'albero; con un rendimento del vano realistico (60–86%
   secondo Elevator World) il motore da 5,5 kW non basta più.
7. **Sostituzione in Italia**: è una modifica costruttiva (DPR 162/1999) con adeguamento secondo
   UNI 10411-1:2024 e verifica straordinaria ⚠️. Le sintesi dell'edizione 2021 chiedono per la
   sostituzione della macchina: freno a due elementi (uno solo deve fermare la cabina carica in
   discesa e vuota in salita), temporizzatore di corsa, controllo elettrico dell'eccesso di
   velocità in salita, arresto vicino alla macchina (capitolo 6.6). La velocità nominale va
   mantenuta: cambiarla è un'altra modifica costruttiva.
8. **Momento normativo**: EN ISO 8100-1/-2:2026 sono pubblicate e la citazione in GUUE è attesa
   nel 2026. Servono **profili normativi versionati**: EN 81-20/-50, EN ISO 8100 e UNI 10411-1.
9. **Concorrenza**: i configuratori dei costruttori (Sassi ARGA Web, Montanari, SICOR, Ziehl-Abegg
   ZAlift, Wittur WITTEC) propongono solo i propri prodotti. Non è stato trovato un selettore
   multi-marca con verifiche esposte e un flusso per la sostituzione.
10. **La parte difficile sono i dati**: coppia in uscita, rendimento per rapporto, coppia del freno
    e inerzie non risultano pubblicati in forma accessibile; nella sostituzione pesano anche massa
    della cabina e bilanciamento (prova con pinza amperometrica).
11. **Architettura**: lo stack già in produzione nel monorepo (Next.js 15, TypeScript strict, zod,
    Prisma + PostgreSQL, BullMQ + Redis, PDF con font DejaVu, next-intl IT/EN/BG). L'enumerazione
    completa basta: ~29 400 configurazioni in circa 25 ms.
12. **Responsabilità**: dal 9 dicembre 2026 il software è un prodotto ai sensi della Direttiva (UE)
    2024/2853 e la responsabilità verso il danneggiato non si esclude per contratto ⚠️.
13. **Roadmap** (stime di ordine di grandezza):
    - fondamenta: 2–3 settimane;
    - MVP della sostituzione (in alto e in basso, argano inserito a mano): 8–10 settimane;
    - selettore da catalogo: 4–6 settimane;
    - poi estensioni per moduli.

## Indice

1. [Contesto: l'argano geared, i costruttori, gli strumenti esistenti](01-contesto-e-mercato.md)
2. [Quadro normativo](02-normativa.md)
3. [Dati di input](03-dati-di-input.md)
4. [Modello di calcolo](04-modello-di-calcolo.md)
5. [Macchina in alto e macchina in basso](05-macchina-in-alto-e-in-basso.md)
6. [Sostituzione dell'argano: il flusso principale](06-sostituzione-argano.md)
7. [Esempio numerico completo](07-esempio-numerico.md)
8. [Catalogo delle macchine e algoritmo di selezione](08-catalogo-e-selezione.md)
9. [Architettura del software](09-architettura-software.md)
10. [Validazione, aspetti legali, roadmap](10-validazione-legale-roadmap.md)
11. [Fonti](11-fonti.md)

## Decisioni

Già decisa: il perimetro iniziale è la **sostituzione dell'argano su impianti esistenti**, con
macchina in alto e in basso. Restano aperte:

1. **Utente e modello di business**: installatori e manutentori (SaaS B2B, a pagamento o
   gratuito come strumento commerciale) oppure uso interno?
2. **Catalogo iniziale**: quali costruttori, e con quali esiste già un rapporto che permetta di
   ottenere i dati mancanti?
3. **Valore del report**: pre-dimensionamento indicativo o relazione di calcolo per il fascicolo,
   firmata da un ingegnere?
4. **Lingue**: italiano, inglese e bulgaro dal primo giorno (standard aziendale) o solo italiano?
5. **Collocazione**: nuovo prodotto nel monorepo con cartella propria o modulo di un sito esistente?
6. **Casi di riferimento**: ci sono sostituzioni già fatte (dati prima e dopo) da usare per validare
   il motore di calcolo?

## Limiti di questa ricerca

- Le pagine delle fonti non sono state aperte integralmente (rete bloccata): ogni ⚠️ va
  ricontrollato sull'originale.
- Le norme EN/ISO/UNI sono a pagamento: le formule sono state ricostruite da fonti secondarie e,
  dove possibile, riprodotte numericamente. Le sole fonti definitive sono i testi acquistati, in
  particolare UNI EN 81-50:2020 e UNI 10411-1:2024.
- Nessun dato affidabile sulla quota di mercato geared/gearless.
- I dati delle macchine negli esempi del capitolo 7 sono illustrativi.
- Le parti giuridiche non sono consulenza legale.
