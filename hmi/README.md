# HMI / Pannello operatore — quadro di manovra ascensore

Interfaccia operatore **touch** di diagnostica e supervisione, in **sola lettura**,
per impianti **geared / idraulico**. Mockup del pannello fisico:
[`../schemi/pannello-operatore.svg`](../schemi/pannello-operatore.svg).

> ⚠️ L'HMI **non** comanda funzioni di sicurezza e non muove la cabina: legge lo stato
> dal PLC via Modbus (endpoint `/api/hmi` del modulo WiFi). I comandi di movimento in
> ispezione restano sulla **stazione fisica a uomo presente** (selettore + pulsanti).

## File

| File | Contenuto |
|------|-----------|
| `index.html` | HMI touch (4 schermate) — self-contained, nessuna dipendenza |
| `../schemi/pannello-operatore.svg` | Layout pannello fisico + HMI (foglio 6/6) |

## Schermate

1. **STATO** — piano corrente, direzione, stato macchina, porte, velocità, corrente
   motore; per idraulico anche temperatura olio e pressione.
2. **I/O** — monitor live di ingressi (DI) e uscite (DQ) con LED di stato.
3. **ALLARMI** — codice guasto attivo con descrizione (mappa `fault_code`).
4. **MANUTENZIONE** — contatore corse, ore di servizio, stato chiave parametri, uptime.

## Deployment

L'HMI può girare in tre modi, tutti contro lo stesso endpoint `/api/hmi`:

- **Su ESP32**: copiare `index.html` in `firmware/esp32-quadro-wifi/data/hmi.html`
  e ricaricare il filesystem (`pio run -t uploadfs`). Accesso da
  `http://192.168.4.1/hmi.html`.
- **Su tablet / pannello** (kiosk browser): puntare all'IP del modulo WiFi.
- **Su HMI industriale** (es. Siemens KTP700 Basic): replicare le schermate in TIA
  Portal WinCC leggendo gli stessi tag PLC. Questo HTML serve da specifica di layout.

## Endpoint dati: `GET /api/hmi`

Implementato nel firmware (`firmware/esp32-quadro-wifi/src/main.cpp`, `handleHmi`).
Esempio di risposta:

```json
{
  "tipo_impianto": "geared", "piano": 3, "stato": 4, "direzione": 1,
  "porte": "CHIUSE", "car_speed": 1.0, "motor_current": 6.2,
  "oil_temp": -1, "line_pressure": -1,
  "trip_counter": 1287, "fault_code": 0, "key_inserted": false, "uptime_s": 5400,
  "di": { "catena": 1, "zp": 1, "foto": 1 },
  "dq": { "km_s": 1, "km_v": 1 }
}
```

Codici `stato`: 0 RIPOSO · 2 CHIUSURA · 3 PARTENZA · 4 MARCIA · 5 RALLENTA ·
6 LIVELLA · 7 ARRESTO · 8 APERTURA · 9 ATTESA · 20 REVISIONE · 90 GUASTO · 91 EMERGENZA
(coerenti con `plc/src/DT_Tipi.st` e `sim/ascensore_sim.py`).

## Modalità DEMO

Aprendo `index.html` senza un backend raggiungibile, l'HMI entra in **DEMO** e simula
un ciclo di corsa completo (utile per anteprima/validazione layout senza hardware).

## Sicurezza informatica

Stesse regole del modulo parametri: Access Point locale, niente cloud, sola lettura
sull'HMI. Eventuale scrittura parametri resta sulla pagina dedicata con gate a chiave
fisica per la categoria safety-relevant.
