(*
 ============================================================================
   FB_ParametriModbus.st  —  Interfaccia parametri PLC <-> Modbus (web)
 ============================================================================
   Il modulo WiFi (ESP32) e' Modbus MASTER; il PLC e' Modbus SLAVE con un'area
   Holding Register (awHR) mappata su questo blocco. Ogni scansione:

     - NS (reg 0..15)   : applica il valore scritto dal web, con CLAMP ai limiti
                          normativi, e riscrive il valore clampato (feedback).
     - SR (reg 20..27)  : applica SOLO se la chiave fisica -S-EN e' inserita
                          (xAbilitaParam); altrimenti RIFIUTA, riscrivendo nel
                          registro il valore corrente (il web vede il rifiuto).
     - SC/RO (reg 40..57): SOLA LETTURA — il PLC scrive stato/telemetria nei
                          registri; il web non puo' modificarli.

   Doppia barriera di sicurezza: la chiave e' verificata sia dal firmware
   (gate sul GPIO) sia qui dal PLC. I limiti EN 81-20 (es. ispezione <= 0.63
   m/s, rilivellamento <= 0.30 m/s) sono enforced lato PLC come ultima difesa.

   La sicurezza di movimento resta comunque garantita dalla catena cablata.
 ============================================================================
*)

FUNCTION_BLOCK FB_ParametriModbus
VAR_IN_OUT
    Par  : ST_Parametri;            (* parametri usati dalla manovra *)
    awHR : ARRAY[0..63] OF WORD;    (* area Holding Register (Modbus slave) *)
END_VAR
VAR_INPUT
    xAbilitaParam : BOOL;           (* -S-EN chiave abilitazione parametri SR *)
    (* --- telemetria/stato da scrivere nei registri di sola lettura --- *)
    iPosizione_mm : INT;            (* reg 50 *)
    rVelocita     : REAL;           (* reg 51 m/s *)
    rCorrente     : REAL;           (* reg 52 A *)
    iTensioneBus  : INT;            (* reg 53 V *)
    diContatore   : DINT;           (* reg 54 corse *)
    iCodiceGuasto : INT;            (* reg 55 *)
    iTempOlio     : INT;            (* reg 56 degC *)
    rPressione    : REAL;           (* reg 57 bar *)
    wStatoCatena  : WORD;           (* reg 43 bitmask *)
    wFeedbackFreno: WORD;           (* reg 44 bitmask *)
    xUcmAbilitato : BOOL;           (* reg 42 *)
    rVelNominale  : REAL;           (* reg 40 *)
    rSogliaOversp : REAL;           (* reg 41 *)
END_VAR
VAR_OUTPUT
    xSrRifiutato  : BOOL;           (* TRUE se un SR e' stato rifiutato (no chiave) *)
END_VAR

(* ====================== NON-SAFETY (clamp + feedback) ====================== *)
Par.Accelerazione   := LIMIT(0.3, RegToReal(awHR[0], 100.0), 1.2);
Par.Decelerazione   := LIMIT(0.3, RegToReal(awHR[1], 100.0), 1.2);
Par.Jerk            := LIMIT(0.5, RegToReal(awHR[2], 100.0), 2.5);
Par.VelocitaLivell  := LIMIT(0.02, RegToReal(awHR[3], 1000.0), 0.10);
Par.TempoPorteAperte:= SecToTime(LIMIT(2.0, RegToReal(awHR[4], 1.0), 20.0));
Par.TempoRichiusura := SecToTime(LIMIT(1.0, RegToReal(awHR[5], 1.0), 10.0));
Par.NudgingAbilitato:= (awHR[6] <> 0);
Par.TempoLuceOff    := SecToTime(LIMIT(30.0, RegToReal(awHR[7], 1.0), 600.0));
Par.PianoParcheggio := WORD_TO_INT(LIMIT(0, WORD_TO_INT(awHR[8]), 5));
Par.RitardoParcheggio := SecToTime(LIMIT(10.0, RegToReal(awHR[9], 1.0), 600.0));
Par.LogicaChiamate  := WORD_TO_INT(LIMIT(0, WORD_TO_INT(awHR[10]), 2));
Par.GongAbilitato   := (awHR[11] <> 0);
Par.PianoVip        := WORD_TO_INT(LIMIT(0, WORD_TO_INT(awHR[12]), 5));
Par.TempoStellaTriangolo := LIMIT(0.5, RegToReal(awHR[13], 100.0), 3.0);
Par.RitardoValvolaDiscesa:= LIMIT(0.0, RegToReal(awHR[14], 100.0), 2.0);
Par.RapportoAltaVelocita := LIMIT(0.5, RegToReal(awHR[15], 100.0), 1.0);
Par.TempoFiltroAllarme   := LIMIT(1.0, RegToReal(awHR[16], 10.0), 10.0);   (* EN 81-28 *)
Par.TempoPorteAccessibile:= SecToTime(LIMIT(5.0, RegToReal(awHR[17], 1.0), 30.0)); (* EN 81-70 *)

(* feedback del valore effettivamente applicato (clampato) *)
awHR[0]  := RealToReg(Par.Accelerazione, 100.0);
awHR[1]  := RealToReg(Par.Decelerazione, 100.0);
awHR[2]  := RealToReg(Par.Jerk, 100.0);
awHR[3]  := RealToReg(Par.VelocitaLivell, 1000.0);
awHR[4]  := RealToReg(TimeToSec(Par.TempoPorteAperte), 1.0);
awHR[5]  := RealToReg(TimeToSec(Par.TempoRichiusura), 1.0);
awHR[6]  := BOOL_TO_WORD(Par.NudgingAbilitato);
awHR[7]  := RealToReg(TimeToSec(Par.TempoLuceOff), 1.0);
awHR[8]  := INT_TO_WORD(Par.PianoParcheggio);
awHR[9]  := RealToReg(TimeToSec(Par.RitardoParcheggio), 1.0);
awHR[10] := INT_TO_WORD(Par.LogicaChiamate);
awHR[11] := BOOL_TO_WORD(Par.GongAbilitato);
awHR[12] := INT_TO_WORD(Par.PianoVip);
awHR[13] := RealToReg(Par.TempoStellaTriangolo, 100.0);
awHR[14] := RealToReg(Par.RitardoValvolaDiscesa, 100.0);
awHR[15] := RealToReg(Par.RapportoAltaVelocita, 100.0);
awHR[16] := RealToReg(Par.TempoFiltroAllarme, 10.0);
awHR[17] := RealToReg(TimeToSec(Par.TempoPorteAccessibile), 1.0);

(* ===================== SAFETY-RELEVANT (gate chiave) ====================== *)
xSrRifiutato := FALSE;
IF xAbilitaParam THEN
    (* chiave inserita: accetta con clamp ai limiti normativi *)
    Par.RelivellAbilitato   := (awHR[20] <> 0);
    Par.FinestraZonaPorta   := WORD_TO_INT(LIMIT(10, WORD_TO_INT(awHR[21]), 80));
    Par.VelocitaIspezione   := LIMIT(0.10, RegToReal(awHR[22], 100.0), 0.63);
    Par.VelocitaRelivell    := LIMIT(0.02, RegToReal(awHR[23], 1000.0), 0.30);
    Par.VelocitaAro         := LIMIT(0.05, RegToReal(awHR[24], 100.0), 0.30);
    Par.SogliaSovracorrente := WORD_TO_INT(LIMIT(100, WORD_TO_INT(awHR[25]), 200));
    Par.RitardoFreno        := LIMIT(0.20, RegToReal(awHR[26], 1000.0), 0.80);
    Par.SogliaTempOlio      := WORD_TO_INT(LIMIT(50, WORD_TO_INT(awHR[27]), 80));
ELSE
    (* chiave assente: rifiuta qualunque scrittura SR *)
    IF (awHR[20] <> BOOL_TO_WORD(Par.RelivellAbilitato))
        OR (WORD_TO_INT(awHR[21]) <> Par.FinestraZonaPorta)
        OR (awHR[22] <> RealToReg(Par.VelocitaIspezione, 100.0))
        OR (awHR[23] <> RealToReg(Par.VelocitaRelivell, 1000.0))
        OR (awHR[24] <> RealToReg(Par.VelocitaAro, 100.0))
        OR (WORD_TO_INT(awHR[25]) <> Par.SogliaSovracorrente)
        OR (awHR[26] <> RealToReg(Par.RitardoFreno, 1000.0))
        OR (WORD_TO_INT(awHR[27]) <> Par.SogliaTempOlio) THEN
        xSrRifiutato := TRUE;
    END_IF
END_IF

(* feedback SR: riscrive sempre il valore corrente (web vede lo stato reale) *)
awHR[20] := BOOL_TO_WORD(Par.RelivellAbilitato);
awHR[21] := INT_TO_WORD(Par.FinestraZonaPorta);
awHR[22] := RealToReg(Par.VelocitaIspezione, 100.0);
awHR[23] := RealToReg(Par.VelocitaRelivell, 1000.0);
awHR[24] := RealToReg(Par.VelocitaAro, 100.0);
awHR[25] := INT_TO_WORD(Par.SogliaSovracorrente);
awHR[26] := RealToReg(Par.RitardoFreno, 1000.0);
awHR[27] := INT_TO_WORD(Par.SogliaTempOlio);

(* ===================== SOLA LETTURA (SC) e TELEMETRIA (RO) ================ *)
awHR[40] := RealToReg(rVelNominale, 100.0);
awHR[41] := RealToReg(rSogliaOversp, 100.0);
awHR[42] := BOOL_TO_WORD(xUcmAbilitato);
awHR[43] := wStatoCatena;
awHR[44] := wFeedbackFreno;

awHR[50] := INT_TO_WORD(iPosizione_mm);
awHR[51] := RealToReg(rVelocita, 100.0);
awHR[52] := RealToReg(rCorrente, 10.0);
awHR[53] := INT_TO_WORD(iTensioneBus);
awHR[54] := DINT_TO_WORD(diContatore);
awHR[55] := INT_TO_WORD(iCodiceGuasto);
awHR[56] := INT_TO_WORD(iTempOlio);
awHR[57] := RealToReg(rPressione, 10.0);

END_FUNCTION_BLOCK
