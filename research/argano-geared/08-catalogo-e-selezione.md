# 8. Catalogo delle macchine e algoritmo di selezione

[← Indice](README.md)

## 8.1 Che cosa serve sapere di ogni argano

Il selettore è buono quanto i dati del catalogo. Per ogni modello servono i campi che
alimentano almeno una verifica del capitolo 4; tutto il resto è descrizione commerciale.

| Campo | Unità | Alimenta la verifica | Nota sulla definizione |
|---|---|---|---|
| Carico statico massimo sull'albero | N (catalogo spesso in kg) | carico sull'albero | Va registrato *come lo definisce il costruttore* (solo tiri delle funi? prova al 125%? peso della puleggia incluso?) |
| Coppia massima in uscita | N·m | riduttore | Alcuni cataloghi non la pubblicano: allora il vincolo è solo la tabella portata/velocità del costruttore |
| Rapporti di riduzione disponibili | — (es. 1/49, 2/47) | cinematica, coppie | Salvare principi della vite e denti della corona come interi, non il decimale |
| Rendimento diretto e inverso per rapporto | — | potenza, freno, manovra di emergenza | Nella vite senza fine dipende dal rapporto (angolo d'elica): un valore unico per modello è un'approssimazione |
| Pulegge: diametro primitivo, numero gole, diametro funi | mm | D/d, aderenza, sicurezza funi | Diametro *primitivo* (asse fune), non esterno |
| Profilo gola: tipo, β, γ, tempra | gradi | aderenza, N_equiv(t) | Senza questi angoli l'aderenza non si può calcolare |
| Motore: potenza, poli, giri nominali, corrente, tensione | kW, 1/min, A, V | potenza, coppia, velocità reale | Giri *nominali* (con scorrimento), non sincroni |
| Avviamenti/ora e servizio (S3/S5, ED%) | 1/h, % | verifica termica | Condizioni di riferimento dichiarate dal costruttore |
| Inerzie (rotore, volano, freno, puleggia) | kg·m² | coppia dinamica, freno | Spesso mancanti: default dichiarati e marcati nel report |
| Freno: coppia nominale per ciascun set, numero di set, organo su cui agisce | N·m | freno, UCMP, velocità in salita | “Albero motore” o “albero puleggia” decide la strategia UCMP |
| Certificati (esame UE del tipo) e loro limiti | riferimento | UCMP, velocità in salita | Masse e velocità ammesse dal certificato |
| Massa, ingombri, interassi di fissaggio | kg, mm | vincoli di installazione | Decisivi nella sostituzione su impianto esistente |
| Prezzo, tempi di consegna | centesimi di €, giorni | ordinamento | Dato commerciale, versione separata |
| Fonte | URL, pagina, edizione | tracciabilità | Ogni numero deve poter essere ricondotto al documento del costruttore |

## 8.2 Normalizzazione dei dati dei costruttori

I cataloghi non sono omogenei: stesse parole, definizioni diverse. Regole:

1. **Un valore, una definizione esplicita.** Il carico sull'albero dichiarato “in kg” viene
   salvato in newton *insieme* alla descrizione di cosa include; la verifica confronta
   grandezze omogenee (capitolo 4.6).
2. **Fonte obbligatoria per ogni numero**: URL del documento, pagina, edizione, data di
   consultazione. Un campo senza fonte non passa l'approvazione.
3. **Doppia verifica (quattro occhi).** Chi inserisce non approva. L'approvazione pubblica
   una nuova versione del catalogo; le versioni precedenti restano leggibili per sempre,
   perché i calcoli salvati vi fanno riferimento.
4. **Import strutturato.** Un modello CSV/XLSX per costruttore, validato con lo stesso schema
   zod dell'admin. Niente scraping dei PDF: i dati si ottengono dai costruttori con un
   accordo che ne autorizzi l'uso nel software (capitolo 10).
5. **Validità temporale.** Ogni modello ha date di inizio e fine commercializzazione: la
   selezione per un impianto nuovo esclude i modelli fuori produzione, la verifica di un
   impianto esistente no.

## 8.3 Modello dati (schema Prisma di massima)

```prisma
enum GearType { WORM HELICAL }
enum GrooveProfile { U_PLAIN U_UNDERCUT V_UNHARDENED V_HARDENED }
enum BrakeActsOn { MOTOR_SHAFT SHEAVE_SHAFT }

model CatalogVersion {
  id          String         @id @default(cuid())
  label       String         @unique
  publishedAt DateTime?
  approvedBy  String?
  models      MachineModel[]
}

model Manufacturer {
  id      String         @id @default(cuid())
  name    String         @unique
  country String
  models  MachineModel[]
}

model MachineModel {
  id                  String         @id @default(cuid())
  catalogVersionId    String
  manufacturerId      String
  code                String
  gearType            GearType
  maxShaftLoadN       Int
  shaftLoadDefinition String
  maxOutputTorqueNm   Int?
  massKg              Int
  sourceUrl           String
  sourcePage          String?
  soldFrom            DateTime?
  soldUntil           DateTime?
  ratios              GearRatio[]
  sheaves             SheaveOption[]
  motors              MotorOption[]
  brakes              BrakeOption[]
  catalogVersion      CatalogVersion @relation(fields: [catalogVersionId], references: [id])
  manufacturer        Manufacturer   @relation(fields: [manufacturerId], references: [id])

  @@unique([catalogVersionId, manufacturerId, code])
  @@index([catalogVersionId])
  @@index([manufacturerId])
}

model GearRatio {
  id                 String       @id @default(cuid())
  modelId            String
  wormStarts         Int
  wheelTeeth         Int
  efficiencyForward  Float
  efficiencyBackward Float?
  model              MachineModel @relation(fields: [modelId], references: [id])

  @@index([modelId])
}

model SheaveOption {
  id               String        @id @default(cuid())
  modelId          String
  pitchDiameterMm  Int
  grooves          Int
  ropeDiameterMm   Float
  profile          GrooveProfile
  undercutAngleDeg Float?
  grooveAngleDeg   Float?
  model            MachineModel  @relation(fields: [modelId], references: [id])

  @@index([modelId])
}

model MotorOption {
  id                String       @id @default(cuid())
  modelId           String
  ratedPowerW       Int
  poles             Int
  ratedSpeedRpm     Float
  ratedCurrentA     Float
  voltageV          Int
  inertiaKgm2       Float?
  maxStartsPerHour  Int?
  dutyCyclePercent  Int?
  model             MachineModel @relation(fields: [modelId], references: [id])

  @@index([modelId])
}

model BrakeOption {
  id                   String       @id @default(cuid())
  modelId              String
  torquePerSetNm       Float
  sets                 Int
  actsOn               BrakeActsOn
  typeExaminationRef   String?
  model                MachineModel @relation(fields: [modelId], references: [id])

  @@index([modelId])
}

enum MachinePosition { TOP TOP_DEFLECTOR BOTTOM_HEADROOM BOTTOM_SIDE }

model SiteSurvey {
  id          String          @id @default(cuid())
  projectId   String
  position    MachinePosition
  data        Json
  photoKeys   String[]
  createdById String
  createdAt   DateTime        @default(now())

  @@index([projectId])
  @@index([createdById])
}

model Calculation {
  id               String   @id @default(cuid())
  projectId        String
  surveyId         String?
  engineVersion    String
  normProfile      String
  catalogVersionId String
  input            Json
  result           Json
  sha256           String   @unique
  createdById      String
  createdAt        DateTime @default(now())

  @@index([projectId])
  @@index([surveyId])
  @@index([catalogVersionId])
  @@index([createdById])
}
```

`SiteSurvey.data` contiene i valori del rilievo (capitolo 6.2), ciascuno con unità e origine
(targa, misura, stima, documento), validati con lo stesso schema zod del wizard; le foto delle
targhe sono file nello storage. `Project`, `User`, `Tenant` e `AuditLog` seguono gli schemi già
usati negli altri prodotti. Le tabelle `Calculation` non si aggiornano mai: una correzione è un
nuovo calcolo, e il calcolo dell'argano esistente (baseline) e quello del nuovo sono due
snapshot distinti dello stesso rilievo.

## 8.4 Configurazione candidata

Una **configurazione** è la combinazione *modello × rapporto × puleggia × motore × freno*
compatibile con i dati dell'impianto:

- la puleggia deve avere diametro funi = diametro scelto e almeno *n* gole;
- il motore deve essere offerto con quel modello e con quella tensione di alimentazione;
- il freno deve essere compatibile con il motore e, se agisce sull'albero motore, la
  configurazione eredita l'obbligo di un dispositivo UCMP separato (impianto nuovo, capitolo
  4.10) o gli adeguamenti della UNI 10411-1 (sostituzione, capitolo 6.6).

Nella sostituzione si aggiungono i vincoli dell'impianto esistente (capitolo 6):

- velocità reale entro la tolleranza della velocità nominale, correggibile in frequenza;
- ingombri, interassi di fissaggio e altezza compatibili con il basamento, o adattatore previsto;
- uscita delle funi (distanza tra le calate) e lato della puleggia compatibili con i rinvii;
- massa compatibile con il solaio (macchina in alto) o con gli ancoraggi (macchina in basso).

## 8.5 Algoritmo

```text
input grezzo
  → schema zod: tipi, intervalli, coerenza tra campi, conversione in SI
  → grandezze indipendenti dalla macchina: masse, contrappeso, percorso delle funi (capitolo 5)
  → sostituzione: calcolo dell'argano esistente (baseline) e controllo di coerenza dei dati
  → per ogni configurazione compatibile del catalogo pubblicato:
       cinematica (giri puleggia, rapporto, velocità reale, frequenza al motore)
       verifiche del capitolo 4 → lista di CheckResult
  → ammissibili  = nessuna verifica "fail"
  → quasi ammissibili = una sola verifica "fail" con utilizzo ≤ 1,10
  → ordinamento degli ammissibili
  → sostituzione: confronto vecchio/nuovo e lista degli adeguamenti
  → snapshot immutabile + hash
```

L'enumerazione è completa (capitolo 9.5: ~29 400 configurazioni in circa 25 ms), quindi
nessuna euristica può “perdere” la soluzione migliore.

## 8.6 Ordinamento

Default lessicografico, modificabile dall'utente:

1. **Margine minimo** su tutte le verifiche di sicurezza (aderenza, funi, freno, albero):
   una configurazione con utilizzo 0,99 su un vincolo è fragile rispetto agli errori
   sulla massa della cabina.
2. **Costo** (prezzo di listino o prezzo cliente, se presente).
3. **Rendimento** del riduttore (energia e riscaldamento).
4. **Massa e ingombro** (decisivi nelle sostituzioni).

In alternativa: fronte di Pareto costo/margine, con le configurazioni dominate nascoste.

## 8.7 Spiegare gli scarti

Per ogni configurazione quasi ammissibile il sistema mostra la verifica che fallisce e la
leva più piccola che la renderebbe ammissibile, calcolata dal motore e non indovinata:

- aderenza insufficiente → angolo β maggiore, gola a V temprata, angolo di avvolgimento
  maggiore, bilanciamento diverso;
- coefficiente di sicurezza delle funi insufficiente → più funi, diametro maggiore,
  puleggia più grande, meno pulegge di rinvio;
- carico sull'albero superato → taglia 2:1 o modello superiore;
- forza al volantino oltre il limite → manovra di emergenza elettrica.

## 8.8 Verifica di una macchina fuori catalogo

Nella sostituzione dell'argano su un impianto esistente capita spesso di dover verificare
una macchina specifica (offerta di un costruttore non a catalogo, macchina ricondizionata).
Lo stesso motore di calcolo accetta una configurazione inserita a mano; il report la
marca come “dati forniti dall'utente” invece di “catalogo versione X”.

## 8.9 Sensibilità

Negli impianti esistenti la massa della cabina è spesso stimata. Il sistema ricalcola le
configurazioni ammissibili con la massa della cabina a −10% e +10% (e, a scelta, con il
bilanciamento a ±5 punti) e segnala quelle che cambiano esito. È un calcolo di pochi
millisecondi e protegge dal caso più comune di errore in cantiere.

Il calcolatore prototipo lo fa per l'argano verificato: massa della cabina ±10% a bilanciamento
costante e bilanciamento ±0,05. Se è inserito il carico di equilibrio misurato, varia solo la
massa della cabina, e con lei il contrappeso. Per ogni variante mostra aderenza (norma e
decelerazione reale), S_f, potenza, carico sull'albero ed esito, e dice quali verifiche cambiano.
Nel caso B del capitolo 7 l'esito cambia:
- con la cabina più leggera del 10% la frenatura a vuoto in salita diventa KO;
- con la cabina più pesante del 10% supera il carico sull'albero;
- con k + 0,05 la frenatura a vuoto in salita diventa KO.

Prima di decidere vanno misurati massa della cabina e bilanciamento.
