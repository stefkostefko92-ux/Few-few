# 1. Contesto: l'argano geared, i costruttori, gli strumenti esistenti

[← Indice](README.md)

## 1.1 Che cos'è

Un argano geared è una macchina di trazione in cui un riduttore sta tra il motore e la
puleggia di trazione: il motore gira veloce, la puleggia lenta. Nei cataloghi europei il
riduttore è quasi sempre **a vite senza fine e corona** (così Sassi descrive le proprie
macchine nel catalogo 2023). Esistono anche riduttori ad assi paralleli: un brevetto
statunitense osserva che la vite senza fine era preferita per il suo basso rendimento inverso
e che con ingranaggi paralleli la sicurezza del freno richiede molta più attenzione. Non sono
stati trovati argani per ascensori con riduttore epicicloidale.

Elementi che entrano nella selezione:

| Elemento | Che cosa conta per il calcolo |
|---|---|
| Riduttore | rapporto (es. Sassi MODY 1/37, 1/49, 1/60, 2/47, 3/41; Montanari M105 da 1/71 a 4/67), rendimento diretto e inverso, capacità termica |
| Puleggia di trazione | diametro primitivo, numero e profilo delle gole; SICOR offre gole lavorate su specifica del cliente |
| Motore | asincrono a due velocità (impianti esistenti) o con inverter VVVF; Torin Drive Europe elenca anche motori sincroni con riduttore ⚠️ |
| Freno | di norma a tamburo sull'albero motore; alcuni modelli hanno un secondo freno sull'albero lento (capitolo 4.10) |
| Soccorso | leva di sblocco del freno e volantino per la manovra manuale |
| Lubrificazione | a olio; per Sassi MODY il riduttore è sigillato a vita con olio sintetico |

## 1.2 Dove si usa ancora

I dati di mercato affidabili sulla quota geared/gearless **non sono stati trovati**: le cifre dei
siti di ricerche di mercato sono contraddittorie (una fonte dà il gearless al 62,5%, un'altra il
geared al 58%, entrambe per il 2023) e non vengono riportate come fatti. Quello che i
costruttori dichiarano sui propri prodotti è invece coerente:

- **Modernizzazione**: Sassi propone MODY per modernizzare impianti esistenti; Imperial
  Electric propone la serie TM per modernizzazioni o nuove costruzioni con locale macchina in alto.
- **Montacarichi e grandi portate**: Montanari M109 per “ascensori merci e cargo”, Montanari
  M105B con carico statico fino a 9 800 kg, SICOR fino a 5 500 kg in taglia 1:1 e 4 m/s.
- **Pulegge grandi**: Ziehl-Abegg indica gli azionamenti con riduttore come adatti a pulegge
  di grande diametro (400–3 000 kg, fino a 2,5 m/s, puleggia fino a 800 mm) ⚠️.

Italia: un rapporto di mercato stima **12 300 nuove installazioni nel 2023** e 13 000 nel 2029
(Arizton) ⚠️. Il peso degli argani geared nella sostituzione su impianti esistenti è plausibile ma
non quantificato dalle fonti trovate.

## 1.3 Costruttori e gamme

| Costruttore | Paese | Serie geared | Dati pubblicati trovati |
|---|---|---|---|
| Alberto Sassi S.p.A. | Italia | MODY, LEO, MF (MF48, MF84, MF94), TORO, MB | MODY: carico statico 2 300 kg (corretto il 1° ottobre 2026: prima 2 250 kg), 480 kg in 1:1 e 630 kg in 2:1, rapporti 1/37, 1/49, 1/60, 2/47, 3/41 (capitolo 12); MF48: 630 kg in 1:1, 1 000 kg in 2:1 (listino di un rivenditore) ⚠️; MF84: 6 000 kg statici; MF94: 8 000 kg statici, puleggia fino a Ø1000, fino a 5,62 m/s; TORO: 1 000 kg in 1:1, 2 000 kg in 2:1 |
| Montanari Giulio & C. | Italia | M65, M83–M85, M93–M95, M98–M98H, M105, M109 | M65: puleggia 480 mm; 320 kg a 0,7 m/s con 3×Ø10 e 3 kW; 400 kg a 1,0 m/s con 4×Ø10 e 4 kW |
| SICOR | Italia | MR12C, MR21 (SSB), MR26 (SSB), SH130, SH140 SSB, SH160 SSB | MR12C: 25,5 kN (2 600 kg) statici, fino a 550 kg; MR21 SSB: 55 kN ⚠️; MR26: 64,7 kN ⚠️; pulegge 320–885 mm |
| Torin Drive | Cina | YJ/FYJ, TGD1 | fino a 2,5 m/s (sito europeo) ⚠️ |
| Imperial Electric (Nidec) | USA | TM21, TM26, TM35 | 900–2 700 kg, 0,5–2,0 m/s |
| Hollister-Whitney | USA | GT (vite senza fine) | fino a 500 ft/min (circa 2,5 m/s) ⚠️ |
| Ziehl-Abegg | Germania | azionamenti con riduttore | vedi 1.2 ⚠️ |

Tutti i numeri della tabella vengono da pagine o schede dei costruttori lette tramite estratti
dei motori di ricerca (capitolo 11): vanno ricontrollati sul catalogo in vigore prima di entrare
nel database. Parametri **non** trovati in nessun estratto: coppia massima in uscita, corrente del
motore, avviamenti/ora, rapporto di intermittenza, rendimento per rapporto, coppia del freno,
inerzie, masse. Sono proprio i dati che servono alle verifiche del capitolo 4: la raccolta dati
presso i costruttori è quindi un lavoro della fase 0 (capitolo 10.4), non un dettaglio.

## 1.4 Strumenti che esistono già

| Strumento | Di chi | Che cosa fa | Limite per il nostro scopo |
|---|---|---|---|
| ARGA Web | Sassi | supporto passo passo all'acquisto, specifiche tecniche e prezzi, tracciamento ordini | solo prodotti Sassi, area riservata |
| Montanari Configurator | Montanari | guida passo passo alla macchina più adatta | solo clienti registrati, solo Montanari |
| Configuratore online | SICOR | geared e gearless: dai parametri dell'impianto indica la macchina più adatta | registrazione; risultato verificato dall'ufficio tecnico SICOR |
| ZAlift | Ziehl-Abegg | sceglie motore e inverter, verifica l'aderenza EN 81, lo spazio di arresto EN 81-20 e la classe VDI 4707; include macchine con riduttore | solo prodotti Ziehl-Abegg |
| WITTEC | Wittur | progettazione di impianti nuovi e modernizzazioni | accesso su richiesta; copertura geared non verificata |
| Elevator Portal / CompuLift | LiWeTec | calcoli web secondo EN 81-20/-50 ed EN 81-1/-2/-77 (guide, funi, pulegge, vita delle funi); ISO 8100 annunciata come prossimo aggiornamento | calcolo di verifica, non selezione multi-marca da catalogo |
| DigiPara Liftdesigner | DigiPara | progettazione e disegno dell'impianto | i calcoli EN 81 sono stati ritirati nel 2018, senza piani di aggiornamento |
| Elevate | Peters Research | analisi del traffico e simulazione | non fa dimensionamento meccanico |
| CalcoLift | software italiano | manuale online con calcolo della velocità dell'argano | stato e contenuti non verificati ⚠️ |

## 1.5 Il vuoto da riempire (analisi)

1. **Nessuno strumento pubblico confronta più marche.** I configuratori dei costruttori
   propongono solo i propri prodotti, dietro registrazione, e in un caso il risultato passa
   dall'ufficio tecnico.
2. **Chi fa i calcoli non seleziona tra marche diverse.** Elevator Portal verifica secondo
   EN 81-50 ma non sceglie da un catalogo; i configuratori scelgono solo tra i propri prodotti e,
   essendo dietro registrazione, non è stato possibile verificare quanto mostrino di verifiche e
   margini.
3. **Non è stato trovato uno strumento dedicato alla modernizzazione italiana**: la sostituzione
   dell'argano è una modifica costruttiva ai sensi del DPR 162/1999 (capitolo 2.4), con vincoli
   di ingombro, basamento esistente e massa della cabina incerta.
4. **Transizione normativa in corso**: con EN ISO 8100-1/-2:2026 gli strumenti dovranno gestire
   due riferimenti in parallelo per anni (capitolo 2.2); Elevator Portal annuncia ISO 8100 come
   prossimo aggiornamento.

Il prodotto che ne deriva: un selettore **multi-marca, trasparente sulle verifiche, in italiano
(e inglese/bulgaro)**, con un flusso specifico per la sostituzione dell'argano.
