# Deliverable — Sistema di allarme e comunicazione di emergenza (EN 81-28:2022)

Implementazione della funzione di **allarme bidirezionale** richiesta dalla
**EN 81-28:2022** (sistemi di telesoccorso per ascensori). È un requisito di
sicurezza obbligatorio: il passeggero intrappolato deve poter comunicare con un
servizio di soccorso operativo 24/7.

> ⚠️ La **comunicazione vocale** e l'**autonomia batteria (≥ 1 h)** sono fornite
> dall'**unità di comunicazione/combinatore certificata** (GSM/PSTN). Il PLC ne
> gestisce **attivazione, segnalazione e supervisione**. Il combinatore deve essere
> conforme a EN 81-28 e collegato a un centro di soccorso.

## Componenti

| Funzione | Realizzazione |
|----------|---------------|
| Logica allarme | [`../plc/src/FB_AllarmeEmergenza.st`](../plc/src/FB_AllarmeEmergenza.st) |
| I/O | `xPulsanteAllarme`, `xUnitaCommOk`, `xBatteriaAllarmeOk`, `xRiscontroOper`, `xResetAllarme` → vedi [`03-lista-io.md`](03-lista-io.md) (X5/X6) |
| Parametro filtro | `alarm_filter_time` (reg 16, NS, 1–10 s) modificabile da web |
| Verifica | [`../sim/test_ascensore.py`](../sim/test_ascensore.py) `TestAllarmeEN8128` |

## Comportamento (EN 81-28)

1. **Filtro pulsante** (§4.1): l'allarme si registra solo se il pulsante è mantenuto
   premuto per ≥ `TempoFiltroAllarme` (default 3 s) → evita attivazioni accidentali.
2. **Registrazione e chiamata**: registrato l'allarme, si avvia il **combinatore**
   (`xAvviaCombinatore`) e si accende il **pittogramma giallo** (`xAllarmeRegistrato`,
   §4.2): "allarme inviato".
3. **Collegamento stabilito**: quando il servizio di soccorso prende in carico la
   chiamata (`xRiscontroOper`), si accende il **pittogramma verde**
   (`xComunicazioneAttiva`) e si chiude il comando di avvio.
4. **Test automatico periodico** (§4.4): ogni **72 h** il sistema verifica linea e
   batteria (`xTestInCorso`); l'esito negativo genera `xGuastoAllarme`.
5. **Supervisione**: `xGuastoAllarme` se batteria o linea KO.
6. **Reset**: dopo la liberazione del passeggero, il tecnico resetta (`xResetAllarme`).

```
   pulsante ──[filtro 3s]──► ALLARME REGISTRATO (giallo) ──► avvio combinatore
                                       │
                       riscontro soccorso ▼
                                COMUNICAZIONE ATTIVA (verde)
                                       │
                            reset tecnico ▼
                                    a riposo
```

## Test eseguiti (sim)

| Test | Verifica |
|------|----------|
| `test_filtro_pressione_breve_non_attiva` | pressione < filtro → nessun allarme |
| `test_pressione_prolungata_registra_e_chiama` | pressione ≥ filtro → allarme + combinatore |
| `test_comunicazione_e_reset` | riscontro → verde; reset → spento |
| `test_guasto_batteria_o_linea` | batteria/linea KO → guasto |

## Note di conformità

- Il combinatore deve garantire comunicazione **bidirezionale** e collegamento a un
  servizio sempre raggiungibile (EN 81-28 §4.3).
- Alimentazione di emergenza: ≥ **1 ora** di conversazione dopo la mancanza rete.
- Le segnalazioni gialla/verde devono essere **visibili e comprensibili** in cabina,
  anche per utenza con disabilità (coordinamento con EN 81-70).
