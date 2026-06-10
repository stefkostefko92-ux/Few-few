(*
 ============================================================================
   FB_GestioneChiamate.st  —  Registro chiamate + selezione prossimo piano
 ============================================================================
   Logica a raccolta semplice (collettiva selettiva). Memorizza le chiamate
   di cabina e di piano e calcola il prossimo target nel senso di marcia.
 ============================================================================
*)

FUNCTION_BLOCK FB_GestioneChiamate
VAR_INPUT
    wChiamateCabina : WORD;    (* bit per piano *)
    wChiamatePiaSu  : WORD;
    wChiamatePiaGiu : WORD;
    iPianoCorrente  : INT;
    eDirezione      : E_Direzione;
    xResetTarget    : BOOL;    (* azzera target raggiunto *)
END_VAR
VAR_OUTPUT
    Richiesta       : ST_RichiestaCorsa;
    awRegistro      : ARRAY[0..5] OF BOOL;  (* chiamate attive consolidate *)
    xChiamateAttive : BOOL;
END_VAR
VAR
    i        : INT;
    iTarget  : INT := -1;
    bCabina  : ARRAY[0..5] OF BOOL;
    bSu      : ARRAY[0..5] OF BOOL;
    bGiu     : ARRAY[0..5] OF BOOL;
END_VAR

(* --- esplode le word in bit e consolida le chiamate --- *)
xChiamateAttive := FALSE;
FOR i := 0 TO 5 DO
    bCabina[i] := (wChiamateCabina AND SHL(WORD#1, INT_TO_USINT(i))) <> 0;
    bSu[i]     := (wChiamatePiaSu  AND SHL(WORD#1, INT_TO_USINT(i))) <> 0;
    bGiu[i]    := (wChiamatePiaGiu AND SHL(WORD#1, INT_TO_USINT(i))) <> 0;
    awRegistro[i] := awRegistro[i] OR bCabina[i] OR bSu[i] OR bGiu[i];
    IF awRegistro[i] THEN
        xChiamateAttive := TRUE;
    END_IF
END_FOR

(* --- cancella la chiamata del piano corrente quando vi si arriva --- *)
IF xResetTarget AND (iPianoCorrente >= 0) AND (iPianoCorrente <= 5) THEN
    awRegistro[iPianoCorrente] := FALSE;
END_IF

(* --- selezione prossimo target ---
   Priorita': prosegui nel senso di marcia finche' ci sono chiamate avanti,
   poi inverti. *)
iTarget := -1;

IF eDirezione = DIR_SALITA THEN
    FOR i := iPianoCorrente + 1 TO 5 DO
        IF awRegistro[i] AND iTarget = -1 THEN iTarget := i; END_IF
    END_FOR
    IF iTarget = -1 THEN
        FOR i := iPianoCorrente - 1 TO 0 BY -1 DO
            IF awRegistro[i] AND iTarget = -1 THEN iTarget := i; END_IF
        END_FOR
    END_IF
ELSIF eDirezione = DIR_DISCESA THEN
    FOR i := iPianoCorrente - 1 TO 0 BY -1 DO
        IF awRegistro[i] AND iTarget = -1 THEN iTarget := i; END_IF
    END_FOR
    IF iTarget = -1 THEN
        FOR i := iPianoCorrente + 1 TO 5 DO
            IF awRegistro[i] AND iTarget = -1 THEN iTarget := i; END_IF
        END_FOR
    END_IF
ELSE
    (* fermo: cerca la chiamata piu' vicina *)
    FOR i := 0 TO 5 DO
        IF awRegistro[i] AND iTarget = -1 THEN iTarget := i; END_IF
    END_FOR
END_IF

(* --- compone l'uscita --- *)
Richiesta.PianoTarget := iTarget;
Richiesta.Valida := (iTarget >= 0);
IF iTarget > iPianoCorrente THEN
    Richiesta.Direzione := DIR_SALITA;
ELSIF iTarget < iPianoCorrente AND iTarget >= 0 THEN
    Richiesta.Direzione := DIR_DISCESA;
ELSE
    Richiesta.Direzione := DIR_FERMO;
END_IF

END_FUNCTION_BLOCK
