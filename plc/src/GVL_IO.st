(*
 ============================================================================
   GVL_IO.st  —  Lista variabili globali / mappatura I/O fisica
   Software PLC manovra ascensore (geared / idraulico) — IEC 61131-3 ST
 ============================================================================
   Indirizzi %I / %Q indicativi per CPU Siemens S7-1200 1214C (DI14/DQ10)
   + moduli di espansione. Adattare alla configurazione reale.
   N. fermate di riferimento: 6 (piani 0..5).
 ============================================================================
*)

VAR_GLOBAL CONSTANT
    N_PIANI : INT := 6;   (* piani 0..5 *)
END_VAR

(* -------------------------- INGRESSI DIGITALI -------------------------- *)
VAR_GLOBAL
    (* sicurezza e modi *)
    xCatenaSicurezzaOK : BOOL AT %I0.0;   (* -KA-SIC feedback (1 = catena chiusa) *)
    xRevisione         : BOOL AT %I0.1;   (* -S-REV selettore revisione *)
    xRevSalita         : BOOL AT %I0.2;   (* -SB-REVU uomo presente su *)
    xRevDiscesa        : BOOL AT %I0.3;   (* -SB-REVD uomo presente giu *)

    (* posizione *)
    xZonaPorta1        : BOOL AT %I0.4;   (* -B-ZP1 *)
    xZonaPorta2        : BOOL AT %I0.5;   (* -B-ZP2 (ridondante) *)
    xRallentSalita     : BOOL AT %I0.6;   (* -B-RALL-U camma rallentamento su *)
    xRallentDiscesa    : BOOL AT %I0.7;   (* -B-RALL-D camma rallentamento giu *)
    xImpulsoPiano      : BOOL AT %I1.0;   (* -B-PIANI conteggio piani / encoder *)

    (* porte e carico *)
    xSovraccarico      : BOOL AT %I1.1;   (* -S-SOVR *)
    xFotocellula       : BOOL AT %I1.2;   (* -S-FOTO costa/barriera (1 = libero) *)
    xPortaAperta       : BOOL AT %I1.3;   (* -S-FAP finecorsa porta aperta *)
    xPortaChiusa       : BOOL AT %I1.4;   (* -S-FCP finecorsa porta chiusa *)

    (* protezioni macchina *)
    xTermicaMotore     : BOOL AT %I1.5;   (* -F-MOT 1 = ok *)
    xPressioneMin      : BOOL AT %I1.6;   (* -S-MINP solo idraulico, 1 = ok *)
    xControlloFreno    : BOOL AT %I1.7;   (* -S-FRE solo geared, 1 = freno integro *)

    (* chiamate cabina (parola, bit per piano) e chiamate piano *)
    wChiamateCabina    : WORD AT %IW2;    (* -SB-CAB-0..5 *)
    wChiamatePianoSu   : WORD AT %IW4;    (* -SB-PIA up   *)
    wChiamatePianoGiu  : WORD AT %IW6;    (* -SB-PIA down *)
END_VAR

(* --------------------------- USCITE DIGITALI -------------------------- *)
VAR_GLOBAL
    (* trazione geared *)
    xKM_Salita   : BOOL AT %Q0.0;   (* -KM-S *)
    xKM_Discesa  : BOOL AT %Q0.1;   (* -KM-D *)
    xKM_Veloce   : BOOL AT %Q0.2;   (* -KM-V alta velocita' (2V) *)
    xKM_Lento    : BOOL AT %Q0.3;   (* -KM-L bassa velocita' (2V) *)
    xKM_Freno    : BOOL AT %Q0.4;   (* -KM-FRE comando freno *)

    (* idraulico *)
    xKM_Pompa    : BOOL AT %Q0.5;   (* -KM-P linea pompa *)
    xKM_Stella   : BOOL AT %Q0.6;   (* -KM-Y *)
    xKM_Triangolo: BOOL AT %Q0.7;   (* -KM-Δ *)
    xEV_Salita   : BOOL AT %Q1.0;   (* -EV-S valvola salita *)
    xEV_Discesa  : BOOL AT %Q1.1;   (* -EV-D valvola discesa *)

    (* porte e segnalazioni *)
    xKM_ApriPorte  : BOOL AT %Q1.2; (* -KM-APRE *)
    xKM_ChiudiPorte: BOOL AT %Q1.3; (* -KM-CHIU *)
    xGong          : BOOL AT %Q1.4; (* -H-GONG *)
    xFuoriServizio : BOOL AT %Q1.5; (* -H-OOS *)
    wDisplayPos    : WORD AT %QW2;  (* -H-POS posizione cabina *)
    wFrecceDir     : WORD AT %QW4;  (* -H-DIR direzione *)
END_VAR

(* ------------------- PARAMETRI / INTERFACCIA WEB ---------------------- *)
VAR_GLOBAL
    (* Chiave fisica -S-EN: abilita la scrittura dei parametri SAFETY (SR)
       dall'interfaccia web. Cablata anche al modulo WiFi (gate doppio). *)
    xAbilitaParam : BOOL AT %I8.0;

    (* Area Holding Register mappata sul Modbus Slave del PLC.
       Indici = registri usati dal modulo WiFi (config/parametri.json):
         0..15  parametri NS (scrivibili)
         20..27 parametri SR (scrivibili solo con chiave)
         40..57 sola lettura (SC/telemetria) *)
    awModbusHR : ARRAY[0..63] OF WORD;

    diContatoreCorse : DINT := 0;        (* contatore corse (telemetria) *)
END_VAR

(* ------------- ALLARME EMERGENZA EN 81-28 / ACCESSIBILITA EN 81-70 ----- *)
VAR_GLOBAL
    (* Ingressi *)
    xPulsanteAllarme   : BOOL AT %I8.1;  (* pulsante allarme cabina *)
    xUnitaCommOk       : BOOL AT %I8.2;  (* combinatore/linea ok *)
    xBatteriaAllarmeOk : BOOL AT %I8.3;  (* batteria allarme ok *)
    xRiscontroOper     : BOOL AT %I8.4;  (* soccorso ha preso in carico *)
    xResetAllarme      : BOOL AT %I8.5;  (* reset tecnico *)
    xChiamataAccessibile : BOOL AT %I8.6;(* chiamata da pulsante accessibile (EN 81-70) *)

    (* Uscite *)
    xAllarmeRegistrato   : BOOL AT %Q6.0; (* pittogramma GIALLO *)
    xComunicazioneAttiva : BOOL AT %Q6.1; (* pittogramma VERDE *)
    xAvviaCombinatore    : BOOL AT %Q6.2; (* avvio autodialer *)
    xGuastoAllarme       : BOOL AT %Q6.3; (* guasto sistema allarme *)
END_VAR

(* ------------------------- VARIABILI INTERNE -------------------------- *)
VAR_GLOBAL
    Par           : ST_Parametri;        (* parametri (anche via Modbus/WiFi) *)
    iPianoCorrente: INT := 0;            (* piano corrente stimato *)
    eDirezione    : E_Direzione := DIR_FERMO;
    eStato        : E_StatoMacchina := ST_RIPOSO;
    awChiamate    : ARRAY[0..5] OF BOOL; (* registro chiamate consolidato *)
END_VAR
