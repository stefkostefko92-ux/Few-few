# Ricerca: un software web per scegliere l'argano geared

_Data: 2026-09-28 · Metodo: cinque filoni di ricerca paralleli (norme e formule; costruttori e
cataloghi; software esistente e funi; diritto UE e italiano; dimensionamento di motore,
riduttore e freno), controlli incrociati tra le fonti e **riproduzione numerica** delle formule
con un prototipo del motore di calcolo. Marcatori: ✅ confermato da almeno due fonti
indipendenti o riprodotto numericamente su un caso pubblicato; ⚠️ fonte singola o secondaria,
da verificare sul testo ufficiale. Limite importante: la rete dell'ambiente di ricerca bloccava
l'apertura delle pagine, quindi i fatti vengono dagli estratti dei motori di ricerca (capitolo 9)._

## Sintesi

1. **Che cosa fa il software.** Dai dati dell'impianto (portata, massa della cabina,
   bilanciamento, velocità, corsa, taglia, funi, geometria della trazione, servizio) valuta
   *tutte* le configurazioni di un catalogo multi-marca (modello × rapporto × puleggia × motore
   × freno), applica 17 verifiche (capitolo 4.12), ordina le ammissibili per margine minimo,
   costo e rendimento, spiega perché le altre sono scartate e produce un report PDF tracciabile.
2. **I “parametri giusti” in uscita**: modello e rapporto di riduzione; diametro della puleggia,
   profilo e angoli della gola; numero e diametro delle funi; motore (kW, poli, giri) e
   frequenza dell'inverter per la velocità nominale; coppia del freno e soluzione UCMP; tipo di
   manovra di emergenza; e per ognuno il margine rispetto al limite.
3. **Il cuore del calcolo** è l'aderenza (EN 81-50 §5.11, tre condizioni con Euler-Eytelwein), il
   coefficiente di sicurezza delle funi (EN 81-50 §5.12, riprodotto su due casi pubblicati, uno
   dei due al centesimo ✅), i requisiti di EN 81-20 su freno, UCMP e soccorso, più la meccanica di potenza,
   coppie, inerzie e carico sull'albero. I valori di μ e le formule del fattore di gola vengono da
   fonti secondarie ⚠️: vanno trascritti dal testo UNI acquistato prima di scrivere codice.
4. **Perché serve un selettore e non un foglio di calcolo** (capitolo 5): in un caso realistico
   da 630 kg la frenatura d'emergenza a cabina vuota fallisce del 2,7%, e due delle quattro
   correzioni “ovvie” (togliere il rinvio, zavorrare la cabina) rompono la verifica del carico
   sull'albero. Solo una valutazione simultanea di tutte le verifiche lo vede.
5. **Momento normativo**: EN ISO 8100-1/-2:2026 sono pubblicate e la citazione in GUUE è attesa
   nel 2026; per un periodo di transizione (36 mesi secondo Liftinstituut ⚠️) varranno entrambe
   le serie. Il motore di calcolo deve avere un **profilo normativo versionato** dal primo giorno.
6. **Italia**: la sostituzione del macchinario è una modifica costruttiva (DPR 162/1999):
   adeguamento secondo UNI 10411-1:2024, comunicazione e verifica straordinaria prima della
   rimessa in servizio ⚠️. Un flusso dedicato alla sostituzione è il principale elemento di
   differenziazione.
7. **Concorrenza**: esistono configuratori dei costruttori (Sassi ARGA Web, Montanari, SICOR,
   Ziehl-Abegg ZAlift, Wittur WITTEC) ma ognuno propone solo i propri prodotti; Elevator Portal
   calcola ma non seleziona da catalogo; DigiPara ha ritirato i calcoli EN 81. Manca un selettore
   **multi-marca, trasparente sulle verifiche, in italiano**, con il flusso di sostituzione.
8. **La parte difficile sono i dati, non il codice.** Coppia massima in uscita, rendimento per
   rapporto, coppia del freno, inerzie e avviamenti/ora non risultano pubblicati in forma
   accessibile: servono accordi con i costruttori già nella fase 0.
9. **Architettura**: lo stack già in produzione nel monorepo (Next.js 15, TypeScript strict,
   zod, Prisma + PostgreSQL, BullMQ + Redis, PDF con font DejaVu, next-intl IT/EN/BG). L'enumerazione
   completa basta: ~29 400 configurazioni in circa 25 ms su Node 22.
10. **Responsabilità**: la conformità è dell'installatore, ma dal 9 dicembre 2026 il software è
    un prodotto ai sensi della Direttiva (UE) 2024/2853 e la responsabilità verso il danneggiato
    non si esclude per contratto ⚠️. Servono dossier di validazione, tracciabilità e assicurazione.
    Le formule si implementano; il testo e le tabelle delle norme non si riproducono.
11. **Roadmap** (stime di ordine di grandezza): fondamenta 2–3 settimane, verifica (MVP) 6–8,
    selettore 4–6, poi estensioni per moduli.

## Indice

1. [Contesto: l'argano geared, i costruttori, gli strumenti esistenti](01-contesto-e-mercato.md)
2. [Quadro normativo](02-normativa.md)
3. [Dati di input](03-dati-di-input.md)
4. [Modello di calcolo](04-modello-di-calcolo.md)
5. [Esempio numerico completo](05-esempio-numerico.md)
6. [Catalogo delle macchine e algoritmo di selezione](06-catalogo-e-selezione.md)
7. [Architettura del software](07-architettura-software.md)
8. [Validazione, aspetti legali, roadmap](08-validazione-legale-roadmap.md)
9. [Fonti](09-fonti.md)

## Decisioni aperte prima di costruire

1. **Utente e modello di business**: installatori e manutentori (SaaS B2B, a pagamento o
   gratuito come strumento commerciale) oppure uso interno?
2. **Perimetro iniziale**: solo sostituzione dell'argano su impianti esistenti in Italia, o
   anche impianti nuovi?
3. **Catalogo iniziale**: quali costruttori, e con quali di loro esiste già un rapporto che
   permetta di ottenere i dati mancanti?
4. **Valore del report**: pre-dimensionamento indicativo o relazione di calcolo per il fascicolo
   tecnico, firmata da un ingegnere?
5. **Lingue**: italiano, inglese e bulgaro dal primo giorno (standard aziendale) o solo italiano?
6. **Collocazione**: nuovo prodotto nel monorepo con cartella propria o modulo di un sito
   esistente?

## Limiti di questa ricerca

- Le pagine delle fonti non sono state aperte integralmente (rete bloccata): ogni ⚠️ va
  ricontrollato sull'originale.
- Le norme EN/ISO sono a pagamento: le formule sono state ricostruite da fonti secondarie e,
  dove possibile, riprodotte numericamente. L'unica fonte definitiva è il testo acquistato.
- Nessun dato affidabile sulla quota di mercato geared/gearless.
- I dati della macchina nell'esempio del capitolo 5 sono illustrativi.
- Le parti giuridiche non sono consulenza legale.
