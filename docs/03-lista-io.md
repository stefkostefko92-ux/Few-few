# Deliverable — Lista I/O completa per il cablaggio (geared / idraulico)

Riferimento PLC: **Siemens S7-1200 CPU 1214C** (DI14 / DQ10) + espansione.
Versione machine-readable in [`../config/lista-io.csv`](../config/lista-io.csv)
(separatore `;`, importabile in Excel/LibreOffice/EPLAN).

Convenzioni: tensione di comando **24 Vdc**; uscite a relè per i carichi a 230 V
(bobine contattori) tramite interfaccia; segnali di sicurezza **letti** dal PLC ma
mai sostitutivi della catena cablata. Applicabilità: `both` = geared + idraulico.

---

## A. INGRESSI DIGITALI (DI)

| Tag PLC | Indirizzo | Morsetto | Sigla | V | mm² | Impianto | Descrizione |
|---------|:---------:|:--------:|-------|:--:|:---:|:--------:|-------------|
| xCatenaSicurezzaOK | %I0.0 | X1:11 | -KA-SIC | 24 | 0.75 | both | Feedback relè sicurezza (1 = catena chiusa) |
| xRevisione | %I0.1 | X1:12 | -S-REV | 24 | 0.75 | both | Selettore revisione/ispezione |
| xRevSalita | %I0.2 | X1:13 | -SB-REVU | 24 | 0.75 | both | Revisione salita (uomo presente) |
| xRevDiscesa | %I0.3 | X1:14 | -SB-REVD | 24 | 0.75 | both | Revisione discesa (uomo presente) |
| xZonaPorta1 | %I0.4 | X1:15 | -B-ZP1 | 24 | 0.75 | both | Sensore zona porta 1 |
| xZonaPorta2 | %I0.5 | X1:16 | -B-ZP2 | 24 | 0.75 | both | Sensore zona porta 2 (ridondante) |
| xRallentSalita | %I0.6 | X1:17 | -B-RALL-U | 24 | 0.75 | both | Camma rallentamento salita |
| xRallentDiscesa | %I0.7 | X1:18 | -B-RALL-D | 24 | 0.75 | both | Camma rallentamento discesa |
| xImpulsoPiano | %I1.0 | X1:19 | -B-PIANI | 24 | 0.75 | both | Conteggio piani / encoder |
| xSovraccarico | %I1.1 | X1:20 | -S-SOVR | 24 | 0.75 | both | Sovraccarico cabina |
| xFotocellula | %I1.2 | X1:21 | -S-FOTO | 24 | 0.75 | both | Fotocellula/costa porta (1 = libero) |
| xPortaAperta | %I1.3 | X1:22 | -S-FAP | 24 | 0.75 | both | Finecorsa porta tutta aperta |
| xPortaChiusa | %I1.4 | X1:23 | -S-FCP | 24 | 0.75 | both | Finecorsa porta tutta chiusa |
| xTermicaMotore | %I1.5 | X1:24 | -F-MOT | 24 | 0.75 | both | Termica motore/termostato olio (1 = ok) |
| xPressioneMin | %I1.6 | X1:25 | -S-MINP | 24 | 0.75 | **idraulico** | Pressostato di minima (1 = ok) |
| xControlloFreno | %I1.7 | X1:26 | -S-FRE | 24 | 0.75 | **geared** | Controllo freno (1 = integro) |
| wChiamateCabina | %IW2 | X2:1-6 | -SB-CAB-0..5 | 24 | 0.5 | both | Pulsanti chiamata cabina |
| wChiamatePianoSu | %IW4 | X2:7-12 | -SB-PIA-U | 24 | 0.5 | both | Chiamate piano salita |
| wChiamatePianoGiu | %IW6 | X2:13-18 | -SB-PIA-D | 24 | 0.5 | both | Chiamate piano discesa |

## B. USCITE DIGITALI (DQ)

| Tag PLC | Indirizzo | Morsetto | Sigla | V | mm² | Impianto | Descrizione |
|---------|:---------:|:--------:|-------|:--:|:---:|:--------:|-------------|
| xKM_Salita | %Q0.0 | X3:1 | -KM-S | 24/rele | 1.0 | both | Contattore salita |
| xKM_Discesa | %Q0.1 | X3:2 | -KM-D | 24/rele | 1.0 | both | Contattore discesa |
| xKM_Veloce | %Q0.2 | X3:3 | -KM-V | 24/rele | 1.0 | **geared** | Contattore alta velocità |
| xKM_Lento | %Q0.3 | X3:4 | -KM-L | 24/rele | 1.0 | **geared** | Contattore bassa velocità |
| xKM_Freno | %Q0.4 | X3:5 | -KM-FRE | 24/rele | 1.0 | **geared** | Comando freno |
| xKM_Pompa | %Q0.5 | X3:6 | -KM-P | 24/rele | 1.0 | **idraulico** | Contattore linea pompa |
| xKM_Stella | %Q0.6 | X3:7 | -KM-Y | 24/rele | 1.0 | **idraulico** | Contattore stella |
| xKM_Triangolo | %Q0.7 | X3:8 | -KM-Δ | 24/rele | 1.0 | **idraulico** | Contattore triangolo |
| xEV_Salita | %Q1.0 | X3:9 | -EV-S | 24 | 1.0 | **idraulico** | Elettrovalvola salita |
| xEV_Discesa | %Q1.1 | X3:10 | -EV-D | 24 | 1.0 | **idraulico** | Elettrovalvola discesa |
| xKM_ApriPorte | %Q1.2 | X3:11 | -KM-APRE | 24/rele | 0.75 | both | Apertura porte |
| xKM_ChiudiPorte | %Q1.3 | X3:12 | -KM-CHIU | 24/rele | 0.75 | both | Chiusura porte |
| xGong | %Q1.4 | X3:13 | -H-GONG | 24 | 0.5 | both | Gong di arrivo |
| xFuoriServizio | %Q1.5 | X3:14 | -H-OOS | 24 | 0.5 | both | Fuori servizio/allarme |
| wDisplayPos | %QW2 | X4:1-8 | -H-POS | 24 | 0.5 | both | Display posizione |
| wFrecceDir | %QW4 | X4:9-12 | -H-DIR | 24 | 0.5 | both | Frecce direzione |

## C. Conteggio punti e dimensionamento

| Tipo | Geared | Idraulico | Note |
|------|:------:|:---------:|------|
| DI usati | 19 | 19 | -S-FRE solo geared, -S-MINP solo idraulico |
| DQ usati | ~14 | ~16 | Y/Δ + valvole su idraulico |
| Riserva consigliata | +20% | +20% | prevedere 1 modulo SM 1223 di espansione |

## C-bis. I/O aggiuntivi — allarme EN 81-28 e accessibilità EN 81-70

Morsettiere dedicate **-X5** (ingressi) e **-X6** (uscite). Dettaglio in
[`../config/lista-io.csv`](../config/lista-io.csv).

| Tag | Indirizzo | Morsetto | Sigla | Norma | Descrizione |
|-----|:---------:|:--------:|-------|:-----:|-------------|
| xAbilitaParam | %I8.0 | X1:27 | -S-EN | EN 81-20 | Chiave abilitazione parametri safety (web) |
| xPulsanteAllarme | %I8.1 | X5:1 | -SB-ALL | EN 81-28 | Pulsante allarme cabina |
| xUnitaCommOk | %I8.2 | X5:2 | -A-COMB | EN 81-28 | Combinatore/linea ok |
| xBatteriaAllarmeOk | %I8.3 | X5:3 | -G-BATT | EN 81-28 | Batteria allarme ok |
| xRiscontroOper | %I8.4 | X5:4 | -A-COMB | EN 81-28 | Chiamata presa in carico |
| xResetAllarme | %I8.5 | X5:5 | -SB-RST | EN 81-28 | Reset tecnico allarme |
| xChiamataAccessibile | %I8.6 | X5:6 | -SB-ACC | EN 81-70 | Pulsante chiamata accessibile |
| xAllarmeRegistrato | %Q6.0 | X6:1 | -H-ALL-Y | EN 81-28 | Pittogramma giallo (allarme inviato) |
| xComunicazioneAttiva | %Q6.1 | X6:2 | -H-ALL-G | EN 81-28 | Pittogramma verde (collegamento) |
| xAvviaCombinatore | %Q6.2 | X6:3 | -A-COMB | EN 81-28 | Avvio autodialer |
| xGuastoAllarme | %Q6.3 | X6:4 | -H-ALL-F | EN 81-28 | Guasto sistema allarme |

## D. Note di cablaggio (officina)

1. **Separazione**: cavi di potenza e segnali 24 V in canaline distinte; segnali
   encoder/zona porta **schermati** con schermo a terra da un solo lato.
2. **Sicurezza**: i contatti della catena (foglio 3) sono cablati in serie e **non**
   passano dalle uscite PLC. Il PLC ne legge solo lo stato (`-KA-SIC`).
3. **Interblocchi hardware**: `-KM-S/-KM-D` e `-KM-Y/-KM-Δ` interbloccati anche
   meccanicamente, oltre che da software.
4. **Uscite a relè** per le bobine 230 V; verificare potere di interruzione e
   protezione delle bobine (diodo/RC di smorzamento).
5. **Messa a terra** equipotenziale di quadro, motore, guide, cabina (EN 81-20 §5.10.1).
6. **Morsettiera** numerata secondo le colonne `morsetto`; vedi anche
   `docs/01-schema-elettrico.md` §7 per la morsettiera principale -X1.
