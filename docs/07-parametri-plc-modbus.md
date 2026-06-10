# Deliverable — Parametri PLC modificabili da interfaccia web (mappa Modbus)

Alcuni parametri del PLC sono modificabili dall'**interfaccia web** del modulo WiFi.
Questo documento descrive il flusso dati e la **mappa registri Modbus** che collega
l'interfaccia web ai parametri del PLC.

## Flusso dati

```
  Browser/HMI ──HTTP──► ESP32 (Modbus MASTER) ──RS485 Modbus RTU──► PLC (SLAVE)
   (UI parametri)        firmware/esp32-quadro-wifi          FB_ParametriModbus
        │                       │                                   │
        │  POST /api/param      │  write/read Holding Register      │  awModbusHR[]
        │  {id,value}           │  (config/parametri.json)          │  <-> ST_Parametri
        ▼                       ▼                                   ▼
   validazione UI         validazione firmware              validazione PLC (clamp+chiave)
                                                             -> Par usato dalla manovra
```

**Tripla barriera** sul medesimo vincolo:
1. **UI**: mostra range e categoria, disabilita i campi non scrivibili.
2. **Firmware** (`handleSetParam`): rifiuta SC/RO, richiede login e **chiave fisica**
   per SR, applica clamp e `HTTP 422/423` sui rifiuti.
3. **PLC** (`FB_ParametriModbus`): **ultima difesa** — riapplica il clamp ai limiti
   normativi e accetta i parametri SR solo se la chiave `-S-EN` (`xAbilitaParam`) è
   inserita; in caso contrario riscrive nel registro il valore corrente (rifiuto).

> La sicurezza di movimento resta garantita dalla **catena cablata**, indipendente dai
> parametri. Nessun parametro safety è modificabile senza consenso fisico in macchina.

## Mappa Holding Register (Modbus, 0-based)

PLC come **Modbus RTU slave** (slave id 1, 19200 8E1). Area `awModbusHR[0..63]`.

### Scrivibili — NON-SAFETY (NS), reg 0..15
| Reg | Parametro | Scala | Campo `ST_Parametri` |
|:---:|-----------|:-----:|----------------------|
| 0 | Accelerazione | ×100 | Accelerazione |
| 1 | Decelerazione | ×100 | Decelerazione |
| 2 | Jerk | ×100 | Jerk |
| 3 | Velocità livellamento | ×1000 | VelocitaLivell |
| 4 | Tempo porte aperte | ×1 | TempoPorteAperte |
| 5 | Attesa richiusura | ×1 | TempoRichiusura |
| 6 | Richiusura forzata (nudging) | ×1 | NudgingAbilitato |
| 7 | Spegnimento luce/ventola | ×1 | TempoLuceOff |
| 8 | Piano di parcheggio | ×1 | PianoParcheggio |
| 9 | Ritardo ritorno parcheggio | ×1 | RitardoParcheggio |
| 10 | Logica chiamate | ×1 | LogicaChiamate |
| 11 | Gong di arrivo | ×1 | GongAbilitato |
| 12 | Piano VIP | ×1 | PianoVip |
| 13 | Tempo avviamento Y/Δ (idr.) | ×100 | TempoStellaTriangolo |
| 14 | Ritardo valvola discesa (idr.) | ×100 | RitardoValvolaDiscesa |
| 15 | Rapporto alta velocità (geared) | ×100 | RapportoAltaVelocita |
| 16 | Filtro pulsante allarme (EN 81-28) | ×10 | TempoFiltroAllarme |
| 17 | Sosta porte accessibilità (EN 81-70) | ×1 | TempoPorteAccessibile |

### Scrivibili — SAFETY-RELEVANT (SR), reg 20..27 — **richiede chiave -S-EN**
| Reg | Parametro | Scala | Limite normativo |
|:---:|-----------|:-----:|------------------|
| 20 | Rilivellamento porte aperte | ×1 | — |
| 21 | Finestra zona porta | ×1 | 10..80 mm |
| 22 | Velocità ispezione | ×100 | **≤ 0,63 m/s** (EN 81-20 §5.12.1.4) |
| 23 | Velocità rilivellamento | ×1000 | **≤ 0,30 m/s** |
| 24 | Velocità riporto ARO | ×100 | ≤ 0,30 m/s |
| 25 | Soglia sovracorrente | ×1 | 100..200 %In |
| 26 | Ritardo serraggio freno (geared) | ×1000 | 0,20..0,80 s |
| 27 | Soglia max temp olio (idr.) | ×1 | 50..80 °C |

### Sola lettura — SC/telemetria (RO), reg 40..57
| Reg | Grandezza | Scala |
|:---:|-----------|:-----:|
| 40 | Velocità nominale | ×100 |
| 41 | Soglia limitatore | ×100 |
| 42 | UCM abilitato | ×1 |
| 43 | Stato catena sicurezza (bitmask) | ×1 |
| 44 | Feedback freno (bitmask) | ×1 |
| 50 | Posizione cabina (mm) | ×1 |
| 51 | Velocità istantanea | ×100 |
| 52 | Corrente motore | ×10 |
| 53 | Tensione bus DC | ×1 |
| 54 | Contatore corse | ×1 |
| 55 | Codice guasto | ×1 |
| 56 | Temperatura olio (idr.) | ×1 |
| 57 | Pressione impianto (idr.) | ×10 |

I numeri di registro coincidono con il campo `reg` di
[`../config/parametri.json`](../config/parametri.json), usato dal firmware.

## Implementazione

| Componente | File |
|-----------|------|
| Mappa registri ↔ `ST_Parametri` + clamp + gate chiave | [`../plc/src/FB_ParametriModbus.st`](../plc/src/FB_ParametriModbus.st) |
| Funzioni di conversione registro/scala/TIME | [`../plc/src/FC_Util.st`](../plc/src/FC_Util.st) |
| Area `awModbusHR` + ingresso chiave `xAbilitaParam` | [`../plc/src/GVL_IO.st`](../plc/src/GVL_IO.st) |
| Chiamata del FB + telemetria | `PRG_Geared.st` / `PRG_Idraulico.st` |
| Interfaccia web (UI + API) | [`../firmware/esp32-quadro-wifi/`](../firmware/esp32-quadro-wifi/) |
| Verifica end-to-end (clamp/chiave/influenza manovra) | [`../sim/test_ascensore.py`](../sim/test_ascensore.py) `TestParametriWeb` |

## Configurazione Modbus slave sul PLC

- **Siemens S7-1200**: scheda comunicazione **CB1241 RS485** + istruzione
  `Modbus_Comm_Load` e `MB_SLAVE` con `MB_HOLD_REG` puntato al DB che contiene
  `awModbusHR`. Slave id 1.
- **Codesys**: aggiungere un *Modbus Serial Device* (slave), mappare l'area Holding
  Register su `awModbusHR`.

## Esempio (cosa fa l'utente)

1. Si collega all'AP `QUADRO-ASC-MANUT`, apre l'interfaccia parametri.
2. Login `operator` → modifica **Tempo porte aperte** da 5 a 8 s → applicato subito.
3. Per i parametri **safety** (es. velocità ispezione) serve login `admin` **e** la
   **chiave -S-EN** inserita in quadro; senza chiave il PLC rifiuta (valore invariato).
4. Valori fuori range vengono **clampati** ai limiti normativi (es. ispezione a 0,63).
