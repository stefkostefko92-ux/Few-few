# Deliverable — Morsettiera e lista cavi numerata

Schema CAD: [`../cad/morsettiera.dxf`](../cad/morsettiera.dxf) (foglio 5/5).
Lista cavi machine-readable: [`../config/lista-cavi.csv`](../config/lista-cavi.csv).
Riferimenti I/O: [`03-lista-io.md`](03-lista-io.md).

Numerazione: **morsetti** identificati come `-Xn:morsetto`; **cavi** come `Wn`
(multipolari); **fili** numerati = numero del morsetto di attestazione.

---

## A. Schedario cavi (cable schedule)

| Cavo | Da | A | Poli | mm² | Tipo | Funzione |
|:----:|----|---|:----:|:---:|------|----------|
| W1 | Rete edificio | -QS1 | 5 | 6 | FG16OR16 0.6/1kV | Alimentazione 400V trifase + N + PE |
| W2 | -A1/-KM (X3:UVW) | Motore/pompa -M1 | 4 | 2.5 | FG16OR16 | Potenza motore (geared) / pompa (idr.) |
| W3 | -A-FRE | Freno -YB1 | 3 | 1.5 | FG16OR16 | Freno elettromeccanico (geared) |
| W4 | Catena vano/cabina | -X1:11..14 | 4 | 1.0 | FROR 450/750 | Catena di sicurezza (apertura positiva) |
| W5 | COP cabina | -X2:1..6 +24V | 5 | 0.5 | LiYCY schermato | Bus cabina CAN + chiamate + 24V |
| W6 | LOP piani | -X2:7..12 | 6 | 0.5 | LiYCY schermato | Bus piani CAN + chiamate |
| W7 | Sensori vano | -X1:15..26 / -X4 | 8 | 0.75 | LiYCY schermato | Zona porta, rallentamenti, finecorsa, segnalazioni |
| W8 | -A5 ESP32 (RS485) | -A1 PLC Modbus | 2 | 0.5 | 2x0.5 schermato twisted | RS485 Modbus parametri non-safety |
| W9 | -T1 24Vdc | Ausiliari -X4:11-12 | 2 | 1.0 | FROR 450/750 | Alimentazione ausiliaria 24V |
| W10 | -S-FRE microcontatti | -X1 controllo freno | 2 | 0.75 | LiYCY schermato | Controllo freno UCM/A3 (**geared**) |
| W11 | -S-MINP pressostato | -X1 pressione min | 2 | 0.75 | FROR | Pressione minima (**idraulico**) |
| W12 | -EV-S/-EV-D | -X3:9-10 | 3 | 1.0 | FROR | Comando valvole (**idraulico**) |

---

## B. Morsettiere

### -X1 — Sicurezza / segnali di ingresso
| Morsetto | Filo | Segnale | Cavo | Verso |
|:--------:|:----:|---------|:----:|-------|
| X1:11 | 11 | Catena sicurezza (-KA-SIC) | W4 | PLC %I0.0 |
| X1:12 | 12 | Revisione (-S-REV) | W4 | PLC %I0.1 |
| X1:13 | 13 | Revisione salita (-SB-REVU) | W4 | PLC %I0.2 |
| X1:14 | 14 | Revisione discesa (-SB-REVD) | W4 | PLC %I0.3 |
| X1:15 | 15 | Zona porta 1 (-B-ZP1) | W7 | PLC %I0.4 |
| X1:16 | 16 | Zona porta 2 (-B-ZP2) | W7 | PLC %I0.5 |
| X1:17 | 17 | Rallentamento salita (-B-RALL-U) | W7 | PLC %I0.6 |
| X1:18 | 18 | Rallentamento discesa (-B-RALL-D) | W7 | PLC %I0.7 |
| X1:19 | 19 | Impulso piano (-B-PIANI) | W7 | PLC %I1.0 |
| X1:20 | 20 | Sovraccarico (-S-SOVR) | W7 | PLC %I1.1 |
| X1:21 | 21 | Fotocellula (-S-FOTO) | W7 | PLC %I1.2 |
| X1:22 | 22 | Porta aperta (-S-FAP) | W7 | PLC %I1.3 |
| X1:23 | 23 | Porta chiusa (-S-FCP) | W7 | PLC %I1.4 |
| X1:24 | 24 | Termica/termostato (-F-MOT) | W7 | PLC %I1.5 |
| X1:25 | 25 | Pressione min (-S-MINP) **idr.** | W11 | PLC %I1.6 |
| X1:26 | 26 | Controllo freno (-S-FRE) **geared** | W10 | PLC %I1.7 |

### -X2 — Chiamate cabina/piani
| Morsetto | Filo | Segnale | Cavo |
|:--------:|:----:|---------|:----:|
| X2:1..6 | C0..C5 | Chiamate cabina | W5 |
| X2:7..9 | PU0..PU2 | Chiamate piano salita | W6 |
| X2:10..12 | PD3..PD5 | Chiamate piano discesa | W6 |

### -X3 — Uscite comando/potenza
| Morsetto | Filo | Comando | Cavo | Impianto |
|:--------:|:----:|---------|:----:|:--------:|
| X3:1 | S | -KM-S salita | W2 | both |
| X3:2 | D | -KM-D discesa | W2 | both |
| X3:3 | V | -KM-V alta velocità | W2 | geared |
| X3:4 | L | -KM-L bassa velocità | W2 | geared |
| X3:5 | FRE | -KM-FRE freno | W3 | geared |
| X3:6 | P | -KM-P pompa | W2 | idraulico |
| X3:7 | Y | -KM-Y stella | W2 | idraulico |
| X3:8 | TR | -KM-Δ triangolo | W2 | idraulico |
| X3:9 | EVS | -EV-S valvola salita | W12 | idraulico |
| X3:10 | EVD | -EV-D valvola discesa | W12 | idraulico |
| X3:11 | AP | -KM-APRE apertura porte | W5 | both |
| X3:12 | CH | -KM-CHIU chiusura porte | W5 | both |
| X3:13 | GO | -H-GONG gong | W5 | both |
| X3:14 | OOS | -H-OOS fuori servizio | W7 | both |

### -X4 — Segnalazioni
| Morsetto | Filo | Segnale | Cavo |
|:--------:|:----:|---------|:----:|
| X4:1..5 | P0/P1/P2/P4/P8 | Display posizione (BCD) | W7 |
| X4:9 | DU | Freccia salita | W7 |
| X4:10 | DD | Freccia discesa | W7 |
| X4:11 | 0V | Comune 24V | W9 |
| X4:12 | +24 | Alimentazione 24V | W9 |

---

## C. Note di posa (officina)

1. **Schermature** (W5–W8, W10): schermo a terra **da un solo lato** (lato quadro)
   per evitare anelli di massa; continuità su tutto il percorso.
2. **Separazione**: potenza (W1–W3) in canalina distinta dai segnali; incroci a 90°.
3. **Catena di sicurezza (W4)**: cablata in serie e indipendente dalle uscite PLC;
   sezione ≥ 1.0 mm² e morsetti dedicati a colore distinto.
4. **Riserva**: prevedere il 20% di morsetti liberi per espansioni.
5. **Marcatura**: ferrule numerate ai due capi di ogni filo (numero = morsetto).
6. **Lunghezze** in `lista-cavi.csv` sono **stime** da verificare a misura sul vano.
