# Software PLC — manovra ascensore (geared / idraulico)

Logica di manovra in **IEC 61131-3 Structured Text**, portabile su
**Siemens S7-1200** (linguaggio SCL) o **Codesys** (Wago, ABB AC500-eco, ecc.).

> ⚠️ **Solo logica di manovra.** La catena di sicurezza, l'UCM/A3, il limitatore e
> i finecorsa sono **cablati e indipendenti** dal PLC (vedi `../schemi/`). Nessuna
> funzione di sicurezza è demandata a questo software.
>
> **Esclusi i sistemi gearless**: il progetto copre solo argano con riduttore
> (geared) e idraulico.

## File

| File | Contenuto |
|------|-----------|
| `src/DT_Tipi.st` | Tipi, enumerazioni stati/direzione, struttura parametri |
| `src/GVL_IO.st` | Mappatura I/O fisica (%I/%Q) e variabili globali |
| `src/FB_CatenaSicurezza.st` | Monitoraggio (lettura) sicurezza, zona porta ridondante, coerenza freno |
| `src/FB_GestionePorte.st` | Operatore porte: apertura/chiusura, fotocellula, nudging, attesa |
| `src/FB_GestioneChiamate.st` | Registro chiamate + selezione prossimo piano (collettiva selettiva) |
| `src/FB_ParametriModbus.st` | **Parametri modificabili da web**: mappa Modbus ↔ `ST_Parametri`, clamp + gate chiave |
| `src/FB_AllarmeEmergenza.st` | **EN 81-28:2022**: allarme + comunicazione bidirezionale di emergenza |
| `src/FC_Util.st` | Funzioni di conversione registro/scala/TIME |
| `src/PRG_Geared.st` | Programma principale **geared** (2 velocità / VVVF) |
| `src/PRG_Idraulico.st` | Programma principale **idraulico** (Y/Δ + valvole, anti-deriva) |
| `docs/architettura-sw.md` | Macchina a stati, ciclo di scansione, note di portabilità |

## Scelta dell'unità (qualità/prezzo, budget < 1.700 €)

- **PLC Siemens S7-1200 CPU 1214C** (DI14/DQ10) — robusto, diffuso, ~€280.
  In alternativa Codesys (Wago 750, ABB AC500-eco).
- WiFi per i parametri non-safety tramite **modulo ESP32** su RS485/Modbus
  (vedi `../firmware/`).

## Macchina a stati (sintesi)

```
RIPOSO → CHIUDI_PORTE → PARTENZA → MARCIA → RALLENTA → LIVELLA → ARRESTO
   ↑                                                                  │
   └──────────────── ATTESA ← APRI_PORTE ←───────────────────────────┘
Modi prioritari: REVISIONE (uomo presente) · GUASTO · EMERGENZA (catena aperta)
```

## Differenze geared vs idraulico

| Aspetto | Geared | Idraulico |
|--------|--------|-----------|
| Trazione | -KM-S/-KM-D + 2 velocità (-KM-V/-KM-L) o VVVF | pompa Y/Δ + valvole -EV-S/-EV-D |
| Discesa | motorizzata | per gravità (valvola, pompa ferma) |
| Freno | elettromeccanico doppio circuito (-KM-FRE) | non presente (tenuta idraulica) |
| Sequenza arresto | serra freno poi toglie marcia | chiude valvola poi ferma pompa |
| Protezioni extra | controllo freno (-S-FRE) | pressione minima (-S-MINP), termostato olio |
| Anti-deriva | — | re-livellamento in zona porta |

## Adattamento a Siemens TIA Portal (SCL)

- ST → SCL: sintassi quasi identica. Convertire i `PROGRAM` in `OB`/`FC`,
  i `FUNCTION_BLOCK` in `FB` con DB di istanza.
- Sostituire l'accesso diretto `%I/%Q` con tag del PLC mappati.
- `TON`, `SHL`, conversioni `INT_TO_WORD` sono disponibili nella libreria standard.

## Verifica consigliata prima della messa in servizio

1. Simulazione I/O (Codesys Simulation / PLCSIM).
2. Prova a vuoto della sequenza porte e dei modi REVISIONE/GUASTO/EMERGENZA.
3. Validazione tempi (avviamento Y/Δ, ritardo freno) sul campo.
4. Collaudo secondo **DPR 162/1999 e s.m.i.** da parte abilitata.
