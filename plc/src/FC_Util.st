(*
 ============================================================================
   FC_Util.st  —  Funzioni di utilita' per la mappatura Modbus dei parametri
 ============================================================================
   Conversioni registro<->valore scalato e secondi<->TIME.
   Usate da FB_ParametriModbus.st.
 ============================================================================
*)

(* Registro WORD (intero scalato) -> valore reale fisico *)
FUNCTION RegToReal : REAL
VAR_INPUT
    w     : WORD;
    scale : REAL;
END_VAR
    RegToReal := INT_TO_REAL(WORD_TO_INT(w)) / scale;
END_FUNCTION

(* Valore reale fisico -> registro WORD (intero scalato, arrotondato) *)
FUNCTION RealToReg : WORD
VAR_INPUT
    v     : REAL;
    scale : REAL;
END_VAR
    RealToReg := INT_TO_WORD(REAL_TO_INT(v * scale));
END_FUNCTION

(* Secondi (REAL) -> TIME *)
FUNCTION SecToTime : TIME
VAR_INPUT
    s : REAL;
END_VAR
    SecToTime := DINT_TO_TIME(REAL_TO_DINT(s * 1000.0));
END_FUNCTION

(* TIME -> secondi (REAL) *)
FUNCTION TimeToSec : REAL
VAR_INPUT
    t : TIME;
END_VAR
    TimeToSec := DINT_TO_REAL(TIME_TO_DINT(t)) / 1000.0;
END_FUNCTION
