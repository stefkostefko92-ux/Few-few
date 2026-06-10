# Quadro di manovra ascensore — PLC + modulo WiFi (geared / idraulico)

Concept e materiale progettuale per un quadro di manovra ascensore basato su **PLC**
(logica di manovra) + **catena di sicurezza cablata certificata**, con **modulo WiFi**
per la parametrizzazione delle sole funzioni non-safety.

**Tipologie coperte: SOLO argano con riduttore (geared) e idraulico.**
I sistemi **gearless sono esclusi**.

Conforme a **EN 81-20 / EN 81-50** (nuovo) e idoneo a modernizzazioni
**UNI 10411 / EN 81-80**. Budget di mercato obiettivo: **< 1.700 €**.

> ⚠️ **AVVERTENZA DI SICUREZZA E RESPONSABILITÀ**
> Materiale *ingegneristico didattico*. Le funzioni di sicurezza (catena di sicurezza,
> UCM/A3, limitatore, finecorsa, valvola di blocco idraulica) devono essere realizzate
> con **dispositivi elettrici di sicurezza cablati** o sistemi **PESSRAL** dotati di
> **certificato di esame UE del tipo** rilasciato da Organismo Notificato. Nessun
> parametro di sicurezza è modificabile via wireless. Il progetto definitivo, la
> marcatura CE e la messa in servizio devono essere validati da tecnico abilitato e
> verificati secondo **DPR 162/1999 e s.m.i.**

## Contenuto

| Percorso | Deliverable |
|----------|-------------|
| [`schemi/potenza-geared.svg`](schemi/potenza-geared.svg) | Schema di potenza — argano 2 velocità (variante VVVF) |
| [`schemi/potenza-idraulico.svg`](schemi/potenza-idraulico.svg) | Schema di potenza — centralina idraulica (Y/Δ + valvole) |
| [`schemi/catena-sicurezza.svg`](schemi/catena-sicurezza.svg) | Catena di sicurezza cablata (comune) |
| [`schemi/io-plc.svg`](schemi/io-plc.svg) | Schema I/O del PLC di manovra |
| [`cad/`](cad/) | **Export CAD** degli schemi in DXF (AutoCAD/LibreCAD) + anteprime PNG |
| [`plc/`](plc/) | Software PLC IEC 61131-3 ST (geared + idraulico) |
| [`sim/`](sim/) | **Simulazione + test** eseguibili della logica PLC (Python, 11 test) |
| [`docs/01-schema-elettrico.md`](docs/01-schema-elettrico.md) | Descrizione schemi, BOM, conformità |
| [`docs/02-parametri-wifi.md`](docs/02-parametri-wifi.md) | Mappa parametri app WiFi (safety vs non-safety) |
| [`docs/03-lista-io.md`](docs/03-lista-io.md) | **Lista I/O completa** per il cablaggio (morsetti, cavi) |
| [`config/parametri.json`](config/parametri.json) | Mappa parametri machine-readable |
| [`config/lista-io.csv`](config/lista-io.csv) | Lista I/O machine-readable (import EPLAN/Excel) |
| [`firmware/esp32-quadro-wifi/`](firmware/esp32-quadro-wifi/) | Prototipo modulo WiFi: web-server + Modbus |

## Architettura in breve

```
RETE 400V -> Sezionatore/protezioni -> Rele sequenza fase
   |
   |-- GEARED:    -KM-S/-KM-D + 2 velocita' (-KM-V/-KM-L) o VVVF -> motore argano
   |-- IDRAULICO: pompa Y/D (-KM-P/-KM-Y/-KM-D) + valvole -EV-S/-EV-D -> pistone
   |
   Catena di sicurezza CABLATA (serie) --> rele sicurezza + consenso contattori
   |
   PLC (S7-1200 / Codesys) = SOLO logica di manovra
   |
   ESP32 (WiFi AP) --RS485/Modbus--> PLC  (solo parametri NON-safety)
```

## Distinta materiali (BOM) — indicativa, mercato IT 2026

| Componente | Marca q/p | Geared 2V | Idraulico |
|-----------|-----------|:---------:|:---------:|
| PLC S7-1200 CPU 1214C (+espansione) | Siemens | €330 | €330 |
| Contattori (direz./velocità o Y/Δ/linea) | Lovato/LS | €120 | €140 |
| Soft-starter (opz. idraulico) | — | — | €120 |
| Relè di sicurezza certificato | Pizzato/Pilz | €70 | €70 |
| Relè sequenza/mancanza fase | Finder/Lovato | €30 | €30 |
| Dispositivo UCM/A3 (rope brake / valvola blocco) | certif. | €230 | €180 |
| Alimentatore 24V DC 5A | Mean Well | €40 | €40 |
| Modulo WiFi ESP32 + RS485 | — | €30 | €30 |
| Protezioni, sezionatore, MCB | ABB/Lovato | €130 | €150 |
| Morsettiere, cablaggio, minuteria | Phoenix/Weidmüller | €150 | €160 |
| Armadio IP54 + piastra | Gewiss/IBOCO | €100 | €110 |
| **Totale indicativo** | | **≈ €1.230** | **≈ €1.360** |

Entrambe le configurazioni restano **sotto i 1.700 €** con margine per accessori
(COP/LOP, segnalazioni, batteria allarme). I dettagli sono in `docs/` e `plc/`.
