# Deliverable — Distinta materiali (BOM) con codici fornitore e prezzi

Versione machine-readable: [`../config/distinta-materiali.csv`](../config/distinta-materiali.csv).
Riferimenti elettrici come da [`01-schema-elettrico.md`](01-schema-elettrico.md) e
[`03-lista-io.md`](03-lista-io.md). **Sistemi gearless esclusi.**

> 💶 **Prezzi indicativi netti, mercato IT 2026, IVA esclusa.** I codici sono di
> riferimento (linee prodotto reali); verificare disponibilità, revisione e listino
> col distributore (es. RS, Distrelec, Rexel, Sonepar) prima dell'ordine. I dispositivi
> di sicurezza vanno acquistati con **certificato di esame UE del tipo** e DoC.

## Totali (configurazione base)

| Configurazione | Totale quadro | Note |
|----------------|:-------------:|------|
| **Geared 2 velocità** | **≈ €1.353** | sotto budget 1.700 € |
| **Idraulico Y/Δ** | **≈ €1.317** | sotto budget 1.700 € |

Voci **opzionali/accessori escluse** dal totale quadro:
- Inverter VVVF (variante geared, sostituisce -KM-V/-KM-L): **€320**
- Soft-starter (variante idraulico, alternativa a Y/Δ): **€130**
- Bottoniere COP/LOP (set base cabina/piani): **€180**

---

## A. Distinta — quadro GEARED (2 velocità)

| Rif | Descrizione | Produttore | Codice | Q.tà | €/cad | € tot |
|-----|-------------|-----------|--------|:----:|:-----:|:-----:|
| -A1 | CPU S7-1200 1214C DC/DC/DC | Siemens | 6ES7214-1AG40-0XB0 | 1 | 270 | 270 |
| -A1.1 | Espansione SM1223 16DI/16DQ | Siemens | 6ES7223-1BL32-0XB0 | 1 | 150 | 150 |
| -KA-SIC | Relè sicurezza contatti guidati | Pizzato | CS AR-05V024 | 1 | 85 | 85 |
| -KA-SEQ | Relè sequenza/mancanza fase | Lovato | PMV50A440 | 1 | 35 | 35 |
| -KM-S/D/V/L | Contattore 18A 24Vdc | Lovato | BF1801A024 | 4 | 25 | 100 |
| -A-FRE | Raddrizzatore freno + sovreccitazione | Lovato | — | 1 | 40 | 40 |
| -A3 | Dispositivo UCM/A3 (rope brake/doppio freno) | — | UCM-A3 | 1 | 230 | 230 |
| -T1 | Alimentatore DIN 24Vdc 2.5A | Mean Well | DR-60-24 | 1 | 40 | 40 |
| -A5 | Scheda ESP32 DevKit | Espressif | ESP32-DevKitC | 1 | 12 | 12 |
| -A5.1 | Transceiver RS485 (MAX485) | — | MAX485-MOD | 1 | 6 | 6 |
| -QS1 | Sezionatore 4P 25A bloccoporta | ABB | OT25F4N2 | 1 | 40 | 40 |
| -Q1 | Magnetotermico 4P D16A | ABB | S204-D16 | 1 | 45 | 45 |
| -X1..X4 | Morsetti componibili + accessori | Phoenix | UT 2.5 / UT 4 | 1 | 130 | 130 |
| misc | Guida DIN, canaline, ferrule, etichette | — | — | 1 | 60 | 60 |
| armadio | Armadio IP55 600x400x200 + piastra | Gewiss | GW46004 | 1 | 110 | 110 |
| | | | | | **Totale** | **€1.353** |

## B. Distinta — quadro IDRAULICO (Y/Δ)

| Rif | Descrizione | Produttore | Codice | Q.tà | €/cad | € tot |
|-----|-------------|-----------|--------|:----:|:-----:|:-----:|
| -A1 | CPU S7-1200 1214C DC/DC/DC | Siemens | 6ES7214-1AG40-0XB0 | 1 | 270 | 270 |
| -A1.1 | Espansione SM1223 16DI/16DQ | Siemens | 6ES7223-1BL32-0XB0 | 1 | 150 | 150 |
| -KA-SIC | Relè sicurezza contatti guidati | Pizzato | CS AR-05V024 | 1 | 85 | 85 |
| -KA-SEQ | Relè sequenza/mancanza fase | Lovato | PMV50A440 | 1 | 35 | 35 |
| -KM-P/Y/Δ | Contattore 25A 24Vdc | Lovato | BF2510A024 | 3 | 35 | 105 |
| -EV | Interfaccia relè elettrovalvole | Finder | relè 24V 2P | 2 | 12 | 24 |
| -A3 | UCM/A3 idraulico (valvola blocco + anti-deriva) | — | UCM-A3-IDR | 1 | 180 | 180 |
| -T1 | Alimentatore DIN 24Vdc 2.5A | Mean Well | DR-60-24 | 1 | 40 | 40 |
| -A5 | Scheda ESP32 DevKit | Espressif | ESP32-DevKitC | 1 | 12 | 12 |
| -A5.1 | Transceiver RS485 (MAX485) | — | MAX485-MOD | 1 | 6 | 6 |
| -QS1 | Sezionatore 4P 32A bloccoporta | ABB | OT40F4N2 | 1 | 55 | 55 |
| -Q1 | Magnetotermico 4P D25A | ABB | S204-D25 | 1 | 55 | 55 |
| -X1..X4 | Morsetti componibili + accessori | Phoenix | UT 2.5 / UT 4 | 1 | 130 | 130 |
| misc | Guida DIN, canaline, ferrule, etichette | — | — | 1 | 60 | 60 |
| armadio | Armadio IP55 600x400x200 + piastra | Gewiss | GW46004 | 1 | 110 | 110 |
| | | | | | **Totale** | **€1.317** |

---

## C. Note di acquisto e margini

1. **Sicurezza certificata**: -KA-SIC e -A3 (UCM) devono avere certificato di esame UE
   del tipo. Se si usa il **doppio freno motore validato** come elemento di arresto
   (geared), verificare la validazione del costruttore dell'argano.
2. **Espansione PLC**: la CPU 1214C ha 14 DI/10 DQ; con ~19 DI e ~16 DQ serve la SM1223.
   In impianti a poche fermate (4) si può valutare la sola CPU risparmiando ~€150.
3. **VVVF vs 2 velocità** (geared): la variante VVVF (+€320) migliora comfort e
   livellamento; resta sotto i 1.700 € (≈ €1.673 togliendo -KM-V/-KM-L).
4. **Manodopera e collaudo NON inclusi**: la distinta è il solo materiale di quadro.
5. **Prezzi**: oscillano con i listini; richiedere offerta per quantità.
