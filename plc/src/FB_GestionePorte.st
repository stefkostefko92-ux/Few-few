(*
 ============================================================================
   FB_GestionePorte.st  —  Gestione operatore porte automatiche
 ============================================================================
   Apertura/chiusura porte con fotocellula, tempo di attesa, nudging.
   La richiusura NON parte se la cabina non e' in zona di livellamento.
 ============================================================================
*)

FUNCTION_BLOCK FB_GestionePorte
VAR_INPUT
    xComandoApri    : BOOL;   (* richiesta apertura (arrivo al piano)   *)
    xRichiestaChiudi: BOOL;   (* consenso a richiudere e ripartire      *)
    xPortaAperta    : BOOL;   (* -S-FAP finecorsa porta aperta          *)
    xPortaChiusa    : BOOL;   (* -S-FCP finecorsa porta chiusa          *)
    xFotocellula    : BOOL;   (* -S-FOTO 1 = passaggio libero           *)
    xSovraccarico   : BOOL;   (* -S-SOVR 1 = sovraccarico               *)
    xInZonaPorta    : BOOL;   (* consenso movimento porte solo in zona  *)
    tAttesa         : TIME;   (* Par.TempoPorteAperte                   *)
    xNudging        : BOOL;   (* Par.NudgingAbilitato                   *)
END_VAR
VAR_OUTPUT
    xApri           : BOOL;   (* -> -KM-APRE *)
    xChiudi         : BOOL;   (* -> -KM-CHIU *)
    xPorteChiuse    : BOOL;   (* porte completamente chiuse (consenso marcia) *)
    xPorteAperte    : BOOL;
    xBloccoSovracc  : BOOL;   (* segnalazione sovraccarico: non parte *)
END_VAR
VAR
    tonAttesa : TON;
    xAperturaInCorso : BOOL;
END_VAR

xPorteChiuse := xPortaChiusa;
xPorteAperte := xPortaAperta;
xBloccoSovracc := xSovraccarico;

(* --- richiesta di apertura: prevale sempre (sicurezza utenza) --- *)
IF xComandoApri AND xInZonaPorta THEN
    xAperturaInCorso := TRUE;
END_IF
IF xPortaAperta THEN
    xAperturaInCorso := FALSE;
END_IF

(* --- temporizzazione attesa con porte aperte --- *)
tonAttesa(IN := xPortaAperta, PT := tAttesa);

(* --- decisione apertura/chiusura --- *)
xApri := FALSE;
xChiudi := FALSE;

IF NOT xInZonaPorta THEN
    (* fuori zona: porte ferme chiuse, nessun comando *)
    xApri := FALSE;
    xChiudi := FALSE;

ELSIF xAperturaInCorso OR xComandoApri THEN
    xApri := NOT xPortaAperta;

ELSIF xRichiestaChiudi AND tonAttesa.Q AND NOT xSovraccarico THEN
    (* richiusura solo dopo attesa; la fotocellula riapre *)
    IF xFotocellula OR xNudging THEN
        xChiudi := NOT xPortaChiusa;
        IF NOT xFotocellula THEN
            (* nudging: richiusura lenta a costa attiva (gestita da operatore) *)
            xChiudi := xNudging;
        END_IF
    ELSE
        (* ostacolo rilevato: riapri *)
        xApri := NOT xPortaAperta;
    END_IF
END_IF

END_FUNCTION_BLOCK
