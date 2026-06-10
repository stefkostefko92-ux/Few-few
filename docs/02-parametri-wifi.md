# Deliverable 2 — Mappa parametri per app WiFi (safety vs non-safety)

Principio EN 81-20 §5.12: i parametri che influenzano la **sicurezza** non devono
essere alterabili senza **protezione di accesso** e **consenso fisico in macchina**.
Quindi:

- **NON-SAFETY** → modificabili via **WiFi** dopo login (password operatore).
- **SAFETY-RELEVANT** → richiedono **selettore a chiave fisico** in quadro (`-S-EN`,
  ingresso `EN-PAR`) **+** password amministratore. Senza chiave inserita il firmware
  **rifiuta la scrittura** (HTTP 423 Locked).
- **READ-ONLY/SAFETY-CRITICAL** → solo lettura via WiFi; modificabili esclusivamente
  da tastiera locale del controller, in regime protetto (non esposti a scrittura
  remota in nessun caso).

I codici registro Modbus sono **placeholder** da mappare sui tag del PLC realmente
usato (S7-1200 / Codesys). **Sistemi gearless esclusi**: i parametri coprono impianti
geared (argano 2V/VVVF) e idraulici. La mappa machine-readable è in
[`config/parametri.json`](../config/parametri.json), consumata dal firmware ESP32.

---

## Legenda categorie

| Categoria | Sigla | WiFi lettura | WiFi scrittura | Consenso |
|-----------|:-----:|:------------:|:--------------:|----------|
| Non-safety | `NS` | ✅ | ✅ | password operatore |
| Safety-relevant | `SR` | ✅ | ⚠️ condizionata | chiave fisica + password admin |
| Safety-critical | `SC` | ✅ | ❌ | solo tastiera locale |

---

## A. Parametri NON-SAFETY (modificabili via WiFi)

| ID | Parametro | Reg. Modbus | Range | Default | Unità | Cat. |
|----|-----------|:-----------:|-------|:-------:|:-----:|:----:|
| `acc_rate` | Accelerazione | 0x1001 | 0.3–1.2 | 0.7 | m/s² | NS |
| `dec_rate` | Decelerazione | 0x1002 | 0.3–1.2 | 0.7 | m/s² | NS |
| `jerk` | Jerk (comfort) | 0x1003 | 0.5–2.5 | 1.3 | m/s³ | NS |
| `creep_speed` | Velocità di livellamento | 0x1004 | 0.02–0.10 | 0.05 | m/s | NS |
| `door_open_time` | Tempo porte aperte | 0x1010 | 2–20 | 5 | s | NS |
| `door_hold_dwell` | Attesa prima richiusura | 0x1011 | 1–10 | 3 | s | NS |
| `door_nudging` | Richiusura forzata (nudging) | 0x1012 | 0/1 | 1 | bool | NS |
| `fan_light_off` | Spegnimento luce/ventola | 0x1020 | 30–600 | 120 | s | NS |
| `parking_floor` | Piano di parcheggio | 0x1030 | 0–5 | 0 | piano | NS |
| `parking_delay` | Ritardo ritorno parcheggio | 0x1031 | 10–600 | 60 | s | NS |
| `call_priority` | Logica chiamate (selettiva/collettiva) | 0x1032 | 0–2 | 1 | enum | NS |
| `arrival_gong` | Gong di arrivo | 0x1040 | 0/1 | 1 | bool | NS |
| `vip_floor` | Piano prioritario VIP | 0x1041 | 0–5 | 0 | piano | NS |
| `star_delta_time` | Tempo avviamento Y/Δ (idraulico) | 0x104A | 0.5–3.0 | 1.5 | s | NS |
| `descent_valve_delay` | Ritardo valvola discesa (idraulico) | 0x104B | 0.0–2.0 | 0.5 | s | NS |
| `high_speed_ratio` | Rapporto alta velocità (geared 2V) | 0x104C | 0.5–1.0 | 1.0 | p.u. | NS |

---

## B. Parametri SAFETY-RELEVANT (chiave fisica + password admin)

Modificabili **solo** con `-S-EN` inserita (ingresso `EN-PAR` attivo) e login admin.
Ogni scrittura è registrata nel log eventi.

| ID | Parametro | Reg. Modbus | Range | Default | Unità | Cat. |
|----|-----------|:-----------:|-------|:-------:|:-----:|:----:|
| `releveling_enable` | Abilitazione rilivellamento a porte aperte | 0x2001 | 0/1 | 1 | bool | SR |
| `door_zone_window` | Finestra zona porta (ZP) | 0x2002 | 10–80 | 35 | mm | SR |
| `inspection_speed` | Velocità di ispezione | 0x2003 | 0.10–0.63 | 0.30 | m/s | SR |
| `relevel_speed` | Velocità di rilivellamento | 0x2004 | 0.02–0.30 | 0.05 | m/s | SR |
| `aro_speed` | Velocità riporto emergenza (ARO) | 0x2005 | 0.05–0.30 | 0.10 | m/s | SR |
| `motor_overcurrent` | Soglia sovracorrente motore | 0x2006 | 100–200 | 150 | % In | SR |
| `brake_release_delay` | Ritardo serraggio freno (geared) | 0x2007 | 0.20–0.80 | 0.40 | s | SR |
| `oil_temp_max` | Soglia max temperatura olio (idraulico) | 0x2008 | 50–80 | 70 | °C | SR |

> Vincolo EN 81-20: la **velocità di ispezione ≤ 0,63 m/s** e quella di
> **rilivellamento ≤ 0,30 m/s** (§5.12.1.4 / §5.12.1.1.3). Il firmware
> **clampa e rifiuta** valori fuori range anche con chiave inserita.

---

## C. Parametri SAFETY-CRITICAL (sola lettura via WiFi)

Mai scrivibili da remoto. Visualizzati per diagnostica.

| ID | Parametro | Reg. Modbus | Unità | Cat. |
|----|-----------|:-----------:|:-----:|:----:|
| `rated_speed` | Velocità nominale impianto | 0x3001 | m/s | SC |
| `overspeed_trip` | Soglia intervento limitatore | 0x3002 | m/s | SC |
| `ucm_enable` | Abilitazione funzione UCM (A3) | 0x3003 | bool | SC |
| `final_limit_pos` | Posizioni extracorsa | 0x3004 | mm | SC |
| `safety_chain_state` | Stato catena di sicurezza | 0x3005 | bitmask | SC |
| `brake_feedback` | Feedback microcontatti freno | 0x3006 | bitmask | SC |

---

## D. Diagnostica / telemetria (sola lettura)

| ID | Grandezza | Reg. Modbus | Unità |
|----|-----------|:-----------:|:-----:|
| `car_position` | Posizione cabina | 0x3100 | mm |
| `car_speed` | Velocità istantanea | 0x3101 | m/s |
| `motor_current` | Corrente motore | 0x3102 | A |
| `dcbus_voltage` | Tensione bus DC | 0x3103 | V |
| `trip_counter` | Contatore corse | 0x3104 | n |
| `fault_code` | Codice guasto attivo | 0x3105 | enum |
| `last_10_faults` | Storico ultimi 10 guasti | 0x3106.. | enum[] |
| `oil_temperature` | Temperatura olio (idraulico) | 0x3110 | °C |
| `line_pressure` | Pressione impianto (idraulico) | 0x3111 | bar |

---

## E. Regole di sicurezza informatica del modulo WiFi

1. **Access Point locale** (no esposizione Internet/cloud), SSID nascosto opzionale,
   **WPA2/WPA3**, password lunga, rotazione consigliata.
2. **Due livelli utente**: `operator` (solo categoria NS) e `admin` (anche SR con
   chiave fisica).
3. **Gate hardware**: scrittura SR consentita solo con ingresso `EN-PAR` attivo.
4. **Range enforcement** lato firmware: clamp + rifiuto valori fuori norma.
5. **Audit log** persistente di ogni scrittura (utente, parametro, valore, timestamp).
6. **Timeout sessione** e blocco dopo N tentativi falliti.
7. Categoria **SC** mai scrivibile via API, in nessuna condizione.
