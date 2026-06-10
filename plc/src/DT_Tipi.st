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

(* Parametri configurabili (mappati su Modbus per il modulo WiFi/PLC).
   I valori safety-relevant (SR) restano protetti da chiave fisica.
   Mappa registri: vedi FB_ParametriModbus.st e config/parametri.json. *)
TYPE ST_Parametri :
STRUCT
    (* ---------- NON-SAFETY (NS) — registri HR 0..15 ---------- *)
    Accelerazione        : REAL := 0.7;    (* reg 0  m/s2  *)
    Decelerazione        : REAL := 0.7;    (* reg 1  m/s2  *)
    Jerk                 : REAL := 1.3;    (* reg 2  m/s3  *)
    VelocitaLivell       : REAL := 0.05;   (* reg 3  m/s   *)
    TempoPorteAperte     : TIME := T#5S;   (* reg 4  s     *)
    TempoRichiusura      : TIME := T#3S;   (* reg 5  s     *)
    NudgingAbilitato     : BOOL := TRUE;   (* reg 6        *)
    TempoLuceOff         : TIME := T#120S; (* reg 7  s     *)
    PianoParcheggio      : INT  := 0;      (* reg 8        *)
    RitardoParcheggio    : TIME := T#60S;  (* reg 9  s     *)
    LogicaChiamate       : INT  := 1;      (* reg 10 enum  *)
    GongAbilitato        : BOOL := TRUE;   (* reg 11       *)
    PianoVip             : INT  := 0;      (* reg 12       *)
    TempoStellaTriangolo : REAL := 1.5;    (* reg 13 s (idraulico) *)
    RitardoValvolaDiscesa: REAL := 0.5;    (* reg 14 s (idraulico) *)
    RapportoAltaVelocita : REAL := 1.0;    (* reg 15 p.u. (geared) *)
    TempoFiltroAllarme   : REAL := 3.0;    (* reg 16 s  — EN 81-28 filtro pulsante *)
    TempoPorteAccessibile: TIME := T#10S;  (* reg 17 s  — EN 81-70 sosta porte accessibile *)

    (* ---------- SAFETY-RELEVANT (SR) — registri HR 20..27 ---------- *)
    (* Modificabili SOLO con chiave fisica -S-EN (xAbilitaParam). *)
    RelivellAbilitato    : BOOL := TRUE;   (* reg 20       *)
    FinestraZonaPorta    : INT  := 35;     (* reg 21 mm    *)
    VelocitaIspezione    : REAL := 0.30;   (* reg 22 m/s, <= 0.63 EN 81-20 *)
    VelocitaRelivell     : REAL := 0.05;   (* reg 23 m/s, <= 0.30 *)
    VelocitaAro          : REAL := 0.10;   (* reg 24 m/s, <= 0.30 *)
    SogliaSovracorrente  : INT  := 150;    (* reg 25 %In   *)
    RitardoFreno         : REAL := 0.40;   (* reg 26 s (geared) *)
    SogliaTempOlio       : INT  := 70;     (* reg 27 degC (idraulico) *)
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
