# 2. Quadro normativo

[← Indice](README.md)

Nessuna fonte ufficiale (EUR-Lex, normattiva.it, Gazzetta Ufficiale, store UNI/ISO) è stata
letta integralmente: la rete dell'ambiente di ricerca bloccava l'apertura delle pagine e i
fatti vengono dagli estratti dei motori di ricerca (capitolo 11). I riferimenti numerici di
articoli e clausole segnati ⚠️ vanno controllati sul testo ufficiale.

## 2.1 Direttiva Ascensori 2014/33/UE

- **Chi risponde**: l'installatore redige la documentazione tecnica ed esegue (o fa eseguire)
  la valutazione della conformità (art. 7 ⚠️ sul numero del paragrafo).
- **Dove finiscono i calcoli**: nel modulo G (verifica di un unico prodotto, Allegato VIII)
  l'organismo notificato scelto dall'installatore esamina la documentazione tecnica e
  l'ascensore; la documentazione contiene i risultati dei calcoli di progetto ⚠️. Il report del
  software è quindi un pezzo del fascicolo tecnico, esaminato da un terzo.
- **Requisiti essenziali (Allegato I)** rilevanti: almeno due funi o catene indipendenti, ciascuna
  con il proprio attacco; stabilità delle funi sulla puleggia di trazione; ascensore per persone
  con macchinario proprio ⚠️ (numeri dei punti non verificati). L'aderenza è quindi un requisito
  essenziale prima ancora che di norma armonizzata.
- **Componenti di sicurezza (Allegato III)**: i dispositivi contro la caduta e i movimenti
  incontrollati della cabina (la direttiva 95/16/CE parlava solo di movimenti incontrollati in
  salita), i limitatori di velocità, gli ammortizzatori a dissipazione di energia, altri. La
  macchina di trazione in sé **non** è in elenco (analisi). Quando il freno della macchina è
  l'elemento di arresto per UCMP o per la velocità eccessiva in salita, fa parte di un componente
  di sicurezza con esame UE del tipo: il software deve registrarne certificato, organismo e
  limiti (capitolo 4.10).

## 2.2 Norme armonizzate e transizione a EN ISO 8100

| Norma | Stato (settembre 2026) | Uso nel software |
|---|---|---|
| EN 81-20:2020 · EN 81-50:2020 | citate nella GUUE (Decisione di esecuzione (UE) 2021/76 e modifiche ⚠️); in Italia UNI EN 81-20:2020 (errata corrige EC 1-2022 ed EC 2-2024) e UNI EN 81-50:2020 | profilo normativo di riferimento oggi |
| EN 81-1 / EN 81-2 | sostituite da EN 81-20/-50 dal 31 agosto 2017 | solo per verificare impianti esistenti progettati con esse |
| ISO 8100-1:2019 · ISO 8100-2:2019 | adozione ISO identica di EN 81-20/-50 (CEN-CENELEC) | — |
| EN ISO 8100-1:2026 · EN ISO 8100-2:2026 | pubblicate (esiste la pagina UNI EN ISO 8100-1:2026); per ELA la citazione in GUUE è attesa nel 2026, dopo la quale **entrambe** le serie danno presunzione di conformità; transizione di 36 mesi dalla pubblicazione secondo Liftinstituut ⚠️ | secondo profilo normativo, in parallelo al primo |
| EN 81-21:2022, EN 81-28:2022, EN 81-70:2021+A1:2022 | aggiunte alla GUUE con la Decisione (UE) 2023/1646 | EN 81-21: impianti nuovi in edifici esistenti |

Conseguenza progettuale: il motore di calcolo deve avere un **profilo normativo versionato**
(`EN81-50:2020`, `EN-ISO-8100-2:2026`) e ogni snapshot deve dire con quale profilo è stato
calcolato. ELA ha pubblicato nel 2026 un confronto tra EN ISO 8100-1/-2 ed EN 81-20/-50: è il
primo documento da leggere per sapere quali formule del capitolo 4 cambiano. Non è stata
trovata una decisione di esecuzione che citi già EN ISO 8100-1/-2:2026 ⚠️.

## 2.3 Altre norme che il software usa

| Ambito | Riferimento | Per quale verifica |
|---|---|---|
| Funi | ISO 4344:2022 (3ª edizione, funi per ascensori da 6 a 38 mm); EN 12385-5:2021 (BSI elenca anche +A1:2025) | dati delle funi, D/d ≥ 40 |
| Riduttori a vite | ISO/TS 14521:2020 (capacità di carico, anche temperatura); DIN 3996:2019-09; ANSI/AGMA 6034-C21 | capacità termica e di carico, se il costruttore non la dichiara |
| Motori | IEC 60034-1 (servizi S3, S4, S5; edizione non verificata) | coppia efficace, avviamenti/ora |
| Ecodesign motori | Regolamento (UE) 2019/1781 modificato dal 2021/341: IE3 dal 1° luglio 2021 per 0,75–1000 kW; si applica ai motori per servizio continuo (S1, S3 ≥ 80%, S6 ≥ 80%) e avviamento diretto da rete, con esenzioni per i motori integrati in un prodotto e per quelli con freno integrato non separabile ⚠️ | campo informativo: molti motori per ascensori (S3 < 80%, S5, solo inverter) risultano fuori campo (analisi, nessuna fonte specifica per gli ascensori) |
| Comfort di marcia | ISO 18738-1:2012 (misura della qualità di marcia; non fissa limiti di accettabilità) | accelerazione e jerk sono dati di progetto, non limiti normativi |
| Energia | ISO 25745-1:2023 (misura); ISO 25745-2:2015 + Amd 1:2023 (stima annua e classi A–G, revisione in corso); VDI 4707 fogli 1 e 2 | fase 3: esportare rendimenti diretto/inverso, assorbimenti in standby, rigenerazione |

## 2.4 Italia: DPR 162/1999 e UNI 10411

- **DPR 162/1999 e successive modifiche** (tra cui DPR 8/2015 e DPR 23/2017, che recepisce la
  direttiva 2014/33/UE). Sono “modifiche costruttive non rientranti nell'ordinaria o
  straordinaria manutenzione”, tra le altre: “il cambiamento della velocità”, “il cambiamento
  della portata”, “il cambiamento della corsa”, il cambiamento del tipo di azionamento e **“la
  sostituzione del macchinario”** (testi consolidati non ufficiali; collocazione citata come
  art. 2, comma 1, lettera cc) dopo il DPR 23/2017 ⚠️).
- **Procedura** (fonti secondarie concordi ⚠️): adeguamento dell'impianto per la parte modificata
  o sostituita, comunicazione al Comune e al soggetto incaricato delle verifiche periodiche,
  **verifica straordinaria** ai sensi dell'art. 14 prima di rimettere l'impianto in servizio;
  è vietato mantenere in esercizio impianti senza le comunicazioni previste.
- **UNI 10411-1:2024**: modifiche o sostituzioni di parti di ascensori elettrici a fune non
  conformi alle direttive 95/16/CE o 2014/33/UE (UNI 10411-2:2024 per gli idraulici; UNI
  10411-11 e -12:2024 per gli impianti conformi). La serie richiama UNI EN 81-20:2020 e UNI EN
  81-21:2022. Il rapporto con EN 81-80 non è stato verificato. Gli adeguamenti richiesti per la
  sostituzione del macchinario sono nel capitolo 6.6.

Conseguenza progettuale: il flusso “sostituzione dell'argano su impianto esistente” deve
produrre un report utilizzabile per l'adeguamento secondo UNI 10411-1 e per la verifica
straordinaria, con i dati dell'impianto esistente (basamento, funi, gole, massa della cabina)
chiaramente separati dai dati della nuova macchina.

### 2.4.1 La serie UNI 10411 del 2024 e la norma del collaudo (ricerca del 2 ottobre 2026)

Fonti: schede UNI delle norme (E), schema ICIM per le verifiche (E), sintesi di Telcal, certifico, Anacam,
elevatori magazine (S). **I testi del 2024 non sono stati letti** (a pagamento; anteprime bloccate da qui).

| Parte | Impianti | Sostituisce | In vigore | Grado |
|---|---|---|---|---|
| UNI 10411-1:2024 | elettrici a fune **non conformi** alla 95/16/CE né alla 2014/33/UE | UNI 10411-1:2021 | 31/10/2024 | S (data concorde in più fonti) |
| UNI 10411-2:2024 | idraulici non conformi | UNI 10411-2:2021 | 31/10/2024 | S |
| UNI 10411-11:2024 | elettrici **conformi** alla direttiva (costruiti secondo UNI EN 81-1 o UNI EN 81-20, o con altra valutazione di conformità) | revisione congiunta di UNI 10411-3:2016 e UNI 10411-5:2017 | 31/10/2024 | E (scheda UNI) |
| UNI 10411-12:2024 | idraulici conformi | UNI 10411-6:2017 | 31/10/2024 | S |

- **Transizione**: le edizioni 2024 valgono per le modifiche ordinate dal 01/11/2024; la 2021 era ammessa fino al
  31/10/2025 solo per ordini precedenti (Telcal, S). Per una modifica nuova valgono solo le edizioni 2024.
- Tutte le parti escludono le modifiche che cambiano le misure di protezione contro l'incendio (E per la -11).
- **Modifiche trattate** (anteprime UNI, attribuzione della parte incerta ⚠️): carico sulla struttura, carico
  statico sul tratto delle funi lato cabina, riduzione delle distanze tra organi mobili e difese del vano, spazio
  del macchinario spostato o modificato, quadro di manovra, velocità nominale, aumento della corsa, funi,
  limitatore di velocità e porte di piano (-11), sostituzione del macchinario (-11, parole del motore di ricerca ⚠️).
- **Novità 2024 dichiarate**: carico statico, velocità, sostituzione di funi, porte e quadri di manovra (S, concordi);
  il confronto punto per punto con la 2021 non è stato trovato.
- **Verifica straordinaria** (schema ICIM, E): stesso metodo della verifica periodica, **di norma limitato ai
  controlli relativi alle modifiche**; all'organismo va la documentazione delle modifiche e dei componenti sostituiti.
- **Freno con un elemento escluso**: discesa a velocità nominale con la portata e salita a vuoto, la stessa
  condizione di UNI EN 81-20:2020 (sintesi 2014 e 2021); se la UNI 10411 chieda anche la prova al 125 % non è stato
  trovato.
- **Funi** (estratto aggregato, parte ed edizione non identificate ⚠️): il punto 17.2 si applica anche con funi dello
  stesso diametro, qualunque sia il carico di rottura; coefficiente di sicurezza secondo UNI EN 81-20:2020, 5.5.2.2.
- **Cambio di velocità** (attribuzione incerta, forse dalla parte idraulica ⚠️): dichiarazione della nuova velocità
  confrontata con la vecchia e disegno con gli spazi di testata e fossa (UNI EN 81-20:2020, 5.2.5.7 e 5.2.5.8).
- **Non trovati**: il punto e il testo 2024 sulla sostituzione del macchinario; le prove (aderenza, paracadute,
  ammortizzatori, velocità in salita, UCMP) richieste in una verifica straordinaria; un'affermazione esplicita che le
  parti non modificate restano accettate come sono; il rapporto con EN 81-80; la natura giuridica della UNI 10411.

Conseguenza nel software (LiftPilot, `src/lib/lift/collaudo.ts`, voce di registro `impianto.collaudo`): l'utente
sceglie la norma del collaudo — impianto nuovo UNI EN 81-20/50 (obbligatoria per il nuovo), modifica UNI 10411-1 o
UNI 10411-11 — e le parti sostituite o modificate; entrano nell'esito solo le verifiche che riguardano quelle parti,
le altre sono «esistenti» con il valore calcolato. Quali parti riguardi ciascuna verifica è una lettura del software,
da confermare sul testo.

Documenti che chiuderebbero le lacune: i testi UNI 10411-1:2024 (https://store.uni.com/uni-10411-1-2024) e
10411-11:2024 (https://store.uni.com/uni-10411-11-2024); il corso UNI sulle 10411-1/-2:2024
(https://store.uni.com/c/CORSO10411NE/315900/CORSO10411NE); lo schema ICIM rev. 02 di giugno 2026
(https://icimgroup.com/wp-content/uploads/2026/06/0577CS_02_IT_SCP-Verifiche-ASC-.pdf).

## 2.5 Che cosa implica per il software

1. Profilo normativo versionato e riportato in ogni calcolo.
2. Riferimento di clausola accanto a ogni verifica, **senza** riprodurre il testo della norma
   (capitolo 10.2): l'utente professionale possiede la norma.
3. Doppio flusso: impianto nuovo (EN 81-20/-50 o EN ISO 8100) e sostituzione su impianto
   esistente (DPR 162/1999, UNI 10411-1:2024).
4. Registro dei certificati di esame UE del tipo per i freni e i dispositivi usati come
   elementi di arresto UCMP o in salita, con i loro limiti.
