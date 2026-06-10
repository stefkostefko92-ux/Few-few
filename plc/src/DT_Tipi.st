(*
 ============================================================================
   DT_Tipi.st  —  Tipi e enumerazioni comuni
   Software PLC manovra ascensore (geared / idraulico) — IEC 61131-3 ST
 ============================================================================
   NOTA DI SICUREZZA: questo software gestisce SOLO la logica di manovra.
   La catena di sicurezza e' cablata e indipendente (vedi schemi/).
 ============================================================================
*)

TYPE E_StatoMacchina :
(
    ST_RIPOSO       := 0,   (* cabina ferma a piano, porte chiuse *)
    ST_PRENOTATO    := 1,   (* chiamata acquisita, valuta partenza *)
    ST_CHIUDI_PORTE := 2,   (* chiusura porte prima della marcia   *)
    ST_PARTENZA     := 3,   (* sblocco freno / apertura valvola    *)
    ST_MARCIA       := 4,   (* marcia ad alta velocita'            *)
    ST_RALLENTA     := 5,   (* rallentamento verso il piano        *)
    ST_LIVELLA      := 6,   (* livellamento a bassa velocita'      *)
    ST_ARRESTO      := 7,   (* arresto e frenatura                 *)
    ST_APRI_PORTE   := 8,   (* apertura porte al piano             *)
    ST_ATTESA       := 9,   (* attesa con porte aperte             *)
    ST_REVISIONE    := 20,  (* modo ispezione uomo presente        *)
    ST_GUASTO       := 90,  (* fuori servizio per guasto           *)
    ST_EMERGENZA    := 91   (* catena sicurezza aperta             *)
) E_StatoMacchina;
END_TYPE

TYPE E_Direzione :
(
    DIR_FERMO  := 0,
    DIR_SALITA := 1,
    DIR_DISCESA := 2
) E_Direzione;
END_TYPE

(* Parametri configurabili (mappati su Modbus per il modulo WiFi).
   I valori safety-relevant (SR) restano protetti da chiave fisica. *)
TYPE ST_Parametri :
STRUCT
    (* --- non-safety (NS) --- *)
    TempoPorteAperte   : TIME := T#5S;    (* attesa porte aperte        *)
    TempoRichiusura    : TIME := T#3S;    (* dwell prima richiusura     *)
    NudgingAbilitato   : BOOL := TRUE;    (* richiusura forzata         *)
    TempoLuceOff       : TIME := T#120S;  (* spegnimento luce cabina    *)
    PianoParcheggio    : INT  := 0;       (* piano di sosta             *)
    RitardoParcheggio  : TIME := T#60S;
    GongAbilitato      : BOOL := TRUE;
    (* --- safety-relevant (SR) — modificabili solo con chiave fisica --- *)
    VelocitaIspezione  : REAL := 0.30;    (* m/s, <= 0.63 EN 81-20      *)
    VelocitaLivell     : REAL := 0.05;    (* m/s, <= 0.30               *)
    FinestraZonaPorta  : INT  := 35;      (* mm                         *)
    RelivellAbilitato  : BOOL := TRUE;
END_STRUCT
END_TYPE

(* Comandi calcolati dalla logica di posizionamento *)
TYPE ST_RichiestaCorsa :
STRUCT
    PianoTarget : INT := -1;     (* -1 = nessuna richiesta *)
    Direzione   : E_Direzione := DIR_FERMO;
    Valida      : BOOL := FALSE;
END_STRUCT
END_TYPE
