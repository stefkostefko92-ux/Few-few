# Deliverable 1 — Schema elettrico (unifilare di potenza + catena di sicurezza)

Impianto di riferimento: **gearless MRL, 450 kg / 6 persone, v = 1,0 m/s, 5,5 kW,
6 fermate**, controller-inverter integrato **Monarch NICE3000new** (o equivalente
Arkel ADrive). Schema valido come base per nuovo impianto EN 81-20/50 e per
ammodernamento UNI 10411.

Convenzioni: `-Qx` protezioni, `-KMx` contattori, `-KAx` relè, `-Sx` contatti di
sicurezza, `-Ax` apparecchiature elettroniche, `-Tx` alimentatori, `-Xx` morsettiere.

---

## 1. Schema unifilare di POTENZA

```
        L1 L2 L3 N PE  (rete 400/230V 50Hz, TT/TN secondo impianto)
         │  │  │  │  │
        ┌┴──┴──┴┐ │  │
        │ -Q0   │ │  │   Sezionatore generale bloccoporta, 4P, 25A
        │ (IG)  │ │  │   + interruttore di luce/manutenzione separato
        └┬──┬──┬┘ │  │
         │  │  │  │  │
        ┌┴──┴──┴┐ │  │
        │ -Q1   │ │  │   Magnetotermico motore curva D, 16A, Icu>=10kA
        └┬──┬──┬┘ │  │
         │  │  │  │  │
        ┌┴──┴──┴───────┐
        │ -A2 Filtro EMC│  (spesso integrato nel drive)
        └┬──┬──┬───────┘
         │  │  │
        ┌┴──┴──┴──────────────────────┐
        │  -A1  DRIVE VVVF INTEGRATO   │   Monarch NICE3000new
        │  (controller + inverter)     │   - ingresso L1/L2/L3
        │  R  S  T          U  V  W    │   - uscita U/V/W al motore
        │  P  +  -  (bus DC / resist.) │   - PG card encoder gearless
        └──┬───┬───┬──────────┬─┬─┬────┘   - morsetti freno BR1/BR2
           │   │   │          │ │ │        - ingressi safety SF1..SFn
        ┌──┴───┴───┴┐      ┌──┴─┴─┴──┐     - CANbus cabina/piani
        │ -R1 resist.│      │ MOTORE  │     - RS485 Modbus (-> ESP32)
        │ frenatura  │      │ gearless│
        └────────────┘      │ PMSM    │
                            └────┬────┘
                                 │
                            ┌────┴────┐
                            │ FRENO   │  doppio circuito freno con
                            │ -YB1/2  │  monitoraggio (microcontatti)
                            └─────────┘
```

### Note potenza
- **-Q0**: sezionatore con blocco porta quadro (lucchettabile) — sezionamento per
  manutenzione (EN 81-20 §5.10).
- **Freno**: comando a **doppio circuito** con **microcontatti di controllo
  apertura/chiusura** retroazionati al drive → base per la funzione **UCM (A3)**.
- **Resistenza di frenatura -R1**: dimensionata per corse a scendere a pieno carico.
- **PE** continuità di terra verificata su tutte le masse (cabina, guide, quadro,
  motore) — EN 81-20 §5.10.1.

---

## 2. CATENA DI SICUREZZA (circuito di sicurezza in serie)

Tutti i contatti sono **dispositivi elettrici di sicurezza** ad apertura positiva
(EN 81-20 §5.11, Annex A). La catena è **interamente cablata in serie**: l'apertura
di un solo contatto toglie tensione alla bobina dei contattori di marcia/freno.
Il PLC/controller **legge** lo stato ma **non** sostituisce la catena.

```
 +110V AC sicurezza (o 24V DC sicurezza)
   │
  -S1  Arresto emergenza FOSSA (pit stop)           ── apertura positiva
   │
  -S2  Arresto emergenza TETTO CABINA               ──
   │
  -S3  Contatto ISPEZIONE/REVISIONE (commut.)       ──
   │
  -S4  Extracorsa SUPERIORE (final limit alto)      ──
   │
  -S5  Extracorsa INFERIORE (final limit basso)     ──
   │
  -S6  Tensione fune LIMITATORE di velocità         ──
   │
  -S7  Intervento LIMITATORE (overspeed switch)     ──
   │
  -S8  Contatto PARACADUTE (safety gear)            ──
   │
  -S9  Contatto ammortizzatori (se a fluido)        ──
   │
  -S10 Contatto allentamento/rottura funi (se prev.)──
   │
  ┌── PORTE DI PIANO (serrature in serie) ──────────┐
  │ -S11.1  serratura piano 0                        │  ogni serratura:
  │ -S11.2  serratura piano 1                        │  contatto di chiusura
  │  ...                                             │  + contatto di
  │ -S11.6  serratura piano 5                        │  blocco (porta chiusa
  └──────────────────────────────────────────────────┘   e bloccata)
   │
  -S12 Contatto PORTA DI CABINA                     ──
   │
  ▼
  -KA-SIC  RELE DI SICUREZZA CERTIFICATO (Pizzato/Pilz)
   │  - contatti guidati (forced-guided), categoria sicurezza
   │  - feedback al controller
   ▼
  abilita bobine -KM1 (marcia) e -KM-FRENO
```

### Punti normativi chiave della catena
- **Apertura positiva** di tutti i contatti di sicurezza (EN 81-20 §5.11.2).
- **Relè di sicurezza a contatti guidati** con auto-monitoraggio; un guasto non deve
  impedire l'arresto né consentire il riavvio.
- **Porte**: combinazione contatto di **chiusura** + dispositivo di **blocco**
  (serratura) per ogni accesso (EN 81-20 §5.3.9).
- **Bypass porte** (per ispezione/livellamento a porte aperte): consentito solo
  tramite **dispositivo di bypass dedicato e monitorato** (EN 81-20 §5.12.1.4), mai
  via software/WiFi.

---

## 3. Funzione A3 — UCM (Unintended Car Movement)

Obbligatoria su nuovo (EN 81-20 §5.6.7.1) e nella maggior parte degli ammodernamenti
UNI 10411. Concept:

```
 Rilevazione movimento incontrollato a porte aperte:
   - segnale zona porta (ZP) da sensori magnetici ridondanti -B1/-B2
   - encoder motore (PG card) per velocità/posizione
        │
        ▼
   Logica UCM certificata (modulo dedicato o funzione PESSRAL del drive)
        │
        ▼
   Elemento di arresto:  DOPPIO FRENO MOTORE con monitoraggio microcontatti
   (entrambi i circuiti capaci di arrestare la cabina) -> conforme se i freni
   sono "validati come elemento di sicurezza" o, in alternativa, dispositivo
   esterno (rope brake / safety gear bidirezionale).
```

> Il modulo UCM e i freni usati come elemento di arresto devono avere
> **certificato di esame UE del tipo**.

---

## 4. ARO — Automatic Rescue Operation (riporto al piano in emergenza)

```
 Rete presente ─┐
                ├─► -KA-RETE rileva mancanza rete
 Mancanza rete ─┘            │
                             ▼
                  -A3 Modulo ARO / mini-UPS
                  (alimenta drive in bassa potenza)
                             │
                             ▼
        Riporto cabina al piano piu vicino a bassa velocita
        + apertura porte, poi messa fuori servizio controllata.
```

Funzione **non-safety** (comfort/disponibilità): l'arresto resta garantito dalla
catena di sicurezza anche in assenza di ARO.

---

## 5. Circuiti ausiliari 24 V DC e segnali

```
 230V ─► -T1 Alimentatore 24Vdc 5A (Mean Well)
            │
            ├─► -A1 logica drive / I/O
            ├─► CANbus cabina-piani (COP/LOP)
            ├─► sensori zona porta -B1/-B2
            ├─► -A4 ESP32 (modulo WiFi) via convertitore/uscita 5V
            └─► segnalazioni, illuminazione cabina (circuito separato)
```

---

## 6. Modulo WiFi (ESP32) — interfaccia FISICA con il quadro

Il modulo WiFi **non** entra nella catena di sicurezza. Dialoga col controller solo
in **lettura/scrittura parametri non-safety** via RS485/Modbus RTU.

```
   ESP32  ──TX/RX/DE──►  -A5 MAX485 (RS485 transceiver)
                              │  A/B differenziale schermato
                              ▼
                         -A1 Controller (porta Modbus RTU)

   GPIO ESP32  ◄── -S-EN  SELETTORE A CHIAVE "ABILITAZIONE PARAMETRI"
                          (contatto fisico in quadro). Senza chiave inserita,
                          il firmware RIFIUTA qualsiasi scrittura ai parametri
                          marcati come safety-relevant. Vedi docs/02.
```

---

## 7. Morsettiera principale -X1 (estratto)

| Morsetto | Segnale | Tipo | Note |
|---------:|---------|------|------|
| X1:1-3 | L1/L2/L3 ingresso | Potenza | da -Q1 |
| X1:4-6 | U/V/W motore | Potenza | a motore gearless |
| X1:7-8 | BR+/BR- freno | Potenza | doppio circuito |
| X1:9-10 | PG A/B encoder | Segnale | schermato |
| X1:11 | SC+ catena sicurezza | Sicurezza | 110V/24V |
| X1:12 | SC- ritorno catena | Sicurezza | da -KA-SIC |
| X1:13-14 | ZP1/ZP2 zona porta | Segnale | -B1/-B2 ridondanti |
| X1:15-16 | CAN-H / CAN-L | Bus | cabina+piani |
| X1:17-18 | RS485 A / B | Bus | verso ESP32 (-A5) |
| X1:19 | EN-PAR (chiave) | Ingresso | -S-EN abilitazione param |
| X1:20-21 | 24V+ / 0V | Aux | da -T1 |
| X1:22 | PE | Terra | barra equipotenziale |

---

## 8. Distinta materiali (BOM) e budget

Vedi tabella nel README principale. Totale indicativo **≈ 1.675 €** (versione
gearless VVVF completa). Per impianti idraulici / a 2 velocità si elimina l'inverter
integrato (controller in versione contattori) scendendo **< 1.300 €**.

## 9. Iter di conformità (sintesi)

1. Analisi del rischio (EN 81-20/50 nuovo; UNI 10411 + EN 81-80 esistente).
2. Componenti di sicurezza con certificato esame UE del tipo + DoC.
3. Fascicolo tecnico + marcatura CE del quadro.
4. Verifica/collaudo: Organismo Notificato o, su esistente, **DPR 162/1999 e s.m.i.**
5. Schema as-built, manuale uso/manutenzione, dichiarazione del progettista.
