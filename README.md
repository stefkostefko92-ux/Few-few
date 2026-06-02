# Quadro di manovra ascensore — PLC/controller + modulo WiFi

Concept e materiale progettuale per un quadro di manovra ascensore basato su
**controller-inverter integrato** (logica di manovra) + **catena di sicurezza cablata
certificata**, con **modulo WiFi** per la parametrizzazione delle sole funzioni
non-safety.

Target: impianto **gearless MRL ~450 kg / 6 persone / 5,5 kW**, conforme a
**EN 81-20 / EN 81-50** (nuovo) e idoneo a modernizzazioni **UNI 10411 / EN 81-80**.
Budget di mercato obiettivo: **< 1.700 €**.

> ⚠️ **AVVERTENZA DI SICUREZZA E RESPONSABILITÀ**
> Questo materiale è un *concept ingegneristico didattico*. Le funzioni di sicurezza
> di un ascensore (catena di sicurezza, UCM/A3, limitatore, finecorsa) devono essere
> realizzate con **dispositivi elettrici di sicurezza cablati** o sistemi **PESSRAL**
> dotati di **certificato di esame UE del tipo** rilasciato da Organismo Notificato.
> Nessun parametro di sicurezza deve essere modificabile via wireless. Il progetto
> definitivo, la marcatura CE e la messa in servizio devono essere validati da tecnico
> abilitato e verificati secondo **DPR 162/1999 e s.m.i.**

## Contenuto

| File | Deliverable |
|------|-------------|
| [`docs/01-schema-elettrico.md`](docs/01-schema-elettrico.md) | Schema unifilare di potenza + catena di sicurezza + morsettiere |
| [`docs/02-parametri-wifi.md`](docs/02-parametri-wifi.md) | Lista parametri mappata per app WiFi (safety vs non-safety) |
| [`config/parametri.json`](config/parametri.json) | Mappa parametri machine-readable (usata dal firmware) |
| [`firmware/esp32-quadro-wifi/`](firmware/esp32-quadro-wifi/) | Prototipo firmware ESP32: web-server + Modbus verso il controller |

## Architettura in breve

```
RETE 400V -> Sezionatore/protezioni -> Rele sequenza fase -> Drive VVVF integrato
                                                             (Monarch NICE3000new)
                                                                  |
   Catena di sicurezza CABLATA (serie) --> ingresso safety + rele sicurezza
                                                                  |
                            CANbus cabina/piani <-----------------+
                                                                  |
   ESP32 (WiFi AP) --RS485/Modbus--> controller  (solo parametri NON-safety)
```

I dettagli, la distinta materiali (BOM ~ 1.675 EUR) e l'iter di conformita sono nei
documenti in `docs/`.
