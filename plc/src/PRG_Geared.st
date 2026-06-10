(*
 ============================================================================
   PRG_Geared.st  —  Programma principale ascensore A FUNE CON ARGANO (GEARED)
 ============================================================================
   Motore a 2 velocita' (Dahlander): ALTA per la marcia, BASSA per
   avvicinamento e livellamento. Freno elettromeccanico a doppio circuito.
   Variante VVVF: sostituire la gestione -KM-V/-KM-L con i consensi inverter.

   La sicurezza e' cablata (vedi schemi/). Questo programma e' solo manovra.
 ============================================================================
*)

PROGRAM PRG_Geared
VAR
    fbSic   : FB_CatenaSicurezza;
    fbPorte : FB_GestionePorte;
    fbCall  : FB_GestioneChiamate;

    iTarget   : INT := -1;
    tonArresto: TON;
    tonGong   : TON;
    xVeloce   : BOOL;     (* richiesta alta velocita' *)
END_VAR

(* ------------------------------------------------------------------ *)
(* 1) MONITORAGGIO SICUREZZA                                           *)
(* ------------------------------------------------------------------ *)
fbSic(
    xCatenaOK       := xCatenaSicurezzaOK,
    xTermica        := xTermicaMotore,
    xPressioneMin   := TRUE,                 (* non applicabile su geared *)
    xControlloFreno := xControlloFreno,
    xZonaPorta1     := xZonaPorta1,
    xZonaPorta2     := xZonaPorta2,
    xConsensoFreno  := xKM_Freno);

(* ------------------------------------------------------------------ *)
(* 2) CHIAMATE E SELEZIONE TARGET                                      *)
(* ------------------------------------------------------------------ *)
fbCall(
    wChiamateCabina := wChiamateCabina,
    wChiamatePiaSu  := wChiamatePianoSu,
    wChiamatePiaGiu := wChiamatePianoGiu,
    iPianoCorrente  := iPianoCorrente,
    eDirezione      := eDirezione,
    xResetTarget    := (eStato = ST_APRI_PORTE));

(* ------------------------------------------------------------------ *)
(* 3) GESTIONE PORTE                                                   *)
(* ------------------------------------------------------------------ *)
fbPorte(
    xComandoApri     := (eStato = ST_APRI_PORTE) OR (eStato = ST_ATTESA),
    xRichiestaChiudi := (eStato = ST_CHIUDI_PORTE),
    xPortaAperta     := xPortaAperta,
    xPortaChiusa     := xPortaChiusa,
    xFotocellula     := xFotocellula,
    xSovraccarico    := xSovraccarico,
    xInZonaPorta     := fbSic.xInZonaPorta,
    tAttesa          := Par.TempoPorteAperte,
    xNudging         := Par.NudgingAbilitato);

xKM_ApriPorte   := fbPorte.xApri;
xKM_ChiudiPorte := fbPorte.xChiudi;

(* ------------------------------------------------------------------ *)
(* 4) CONTEGGIO PIANI (semplificato a impulsi di camma)                *)
(* ------------------------------------------------------------------ *)
(* In impianto reale: usare encoder assoluto o conteggio impulsi con
   reset ai piani estremi. Qui aggiornato all'arresto in zona porta. *)
IF eStato = ST_LIVELLA AND fbSic.xInZonaPorta THEN
    iPianoCorrente := iTarget;
END_IF

(* ------------------------------------------------------------------ *)
(* 5) MACCHINA A STATI                                                 *)
(* ------------------------------------------------------------------ *)

(* --- gestione modi prioritari --- *)
IF fbSic.xEmergenza THEN
    eStato := ST_EMERGENZA;
ELSIF fbSic.xGuasto THEN
    eStato := ST_GUASTO;
ELSIF xRevisione THEN
    eStato := ST_REVISIONE;
END_IF

CASE eStato OF

    ST_RIPOSO:
        (* tutto fermo, freno chiuso, porte chiuse *)
        xKM_Salita := FALSE; xKM_Discesa := FALSE;
        xKM_Veloce := FALSE; xKM_Lento := FALSE;
        xKM_Freno  := FALSE;   (* freno serrato *)
        eDirezione := DIR_FERMO;
        IF fbCall.Richiesta.Valida AND fbSic.xConsensoMarcia THEN
            iTarget := fbCall.Richiesta.PianoTarget;
            IF iTarget = iPianoCorrente THEN
                eStato := ST_APRI_PORTE;   (* gia' al piano: apri *)
            ELSE
                eStato := ST_CHIUDI_PORTE;
            END_IF
        END_IF

    ST_CHIUDI_PORTE:
        xKM_ChiudiPorte := TRUE;
        IF fbPorte.xPorteChiuse THEN
            eDirezione := fbCall.Richiesta.Direzione;
            eStato := ST_PARTENZA;
        END_IF

    ST_PARTENZA:
        IF fbSic.xConsensoMarcia AND fbPorte.xPorteChiuse THEN
            (* applica direzione + bassa velocita', poi sblocca freno *)
            xKM_Salita  := (eDirezione = DIR_SALITA);
            xKM_Discesa := (eDirezione = DIR_DISCESA);
            xKM_Lento   := TRUE;
            xKM_Freno   := TRUE;   (* sblocca freno *)
            eStato := ST_MARCIA;
        ELSE
            eStato := ST_ARRESTO;
        END_IF

    ST_MARCIA:
        (* passa ad alta velocita' se distanza sufficiente *)
        xVeloce := (ABS(iTarget - iPianoCorrente) >= 1)
                   AND NOT xRallentSalita AND NOT xRallentDiscesa;
        xKM_Veloce := xVeloce;
        xKM_Lento  := NOT xVeloce;
        (* rilevazione camma di rallentamento del piano target *)
        IF (eDirezione = DIR_SALITA AND xRallentSalita)
           OR (eDirezione = DIR_DISCESA AND xRallentDiscesa) THEN
            eStato := ST_RALLENTA;
        END_IF
        IF NOT fbSic.xConsensoMarcia THEN eStato := ST_ARRESTO; END_IF

    ST_RALLENTA:
        xKM_Veloce := FALSE;
        xKM_Lento  := TRUE;       (* bassa velocita' di avvicinamento *)
        IF fbSic.xInZonaPorta THEN
            eStato := ST_LIVELLA;
        END_IF
        IF NOT fbSic.xConsensoMarcia THEN eStato := ST_ARRESTO; END_IF

    ST_LIVELLA:
        xKM_Lento := TRUE;        (* livellamento fine in zona porta *)
        IF fbSic.xInZonaPorta THEN
            eStato := ST_ARRESTO;
        END_IF

    ST_ARRESTO:
        (* serra il freno PRIMA di togliere i contattori di marcia *)
        xKM_Freno  := FALSE;
        tonArresto(IN := TRUE, PT := T#400MS);
        IF tonArresto.Q THEN
            xKM_Salita := FALSE; xKM_Discesa := FALSE;
            xKM_Veloce := FALSE; xKM_Lento := FALSE;
            tonArresto(IN := FALSE);
            eStato := ST_APRI_PORTE;
        END_IF

    ST_APRI_PORTE:
        tonGong(IN := TRUE, PT := T#300MS);
        xGong := Par.GongAbilitato AND tonGong.Q;
        IF fbPorte.xPorteAperte THEN
            tonGong(IN := FALSE);
            eStato := ST_ATTESA;
        END_IF

    ST_ATTESA:
        (* attende temporizzazione porte; poi se altre chiamate richiude *)
        IF fbCall.xChiamateAttive THEN
            eStato := ST_CHIUDI_PORTE;
        ELSE
            (* nessuna chiamata: resta a riposo a porte chiuse *)
            IF fbPorte.xPorteChiuse THEN
                eStato := ST_RIPOSO;
            ELSE
                eStato := ST_CHIUDI_PORTE;
            END_IF
        END_IF

    ST_REVISIONE:
        (* uomo presente, solo bassa velocita', porte non automatiche *)
        xKM_Veloce := FALSE;
        xKM_ApriPorte := FALSE; xKM_ChiudiPorte := FALSE;
        xKM_Salita  := xRevSalita AND NOT xRevDiscesa AND fbSic.xConsensoMarcia;
        xKM_Discesa := xRevDiscesa AND NOT xRevSalita AND fbSic.xConsensoMarcia;
        xKM_Lento   := xKM_Salita OR xKM_Discesa;
        xKM_Freno   := xKM_Lento;
        IF NOT xRevisione THEN eStato := ST_RIPOSO; END_IF

    ST_GUASTO:
        xKM_Salita := FALSE; xKM_Discesa := FALSE;
        xKM_Veloce := FALSE; xKM_Lento := FALSE;
        xKM_Freno  := FALSE;
        xFuoriServizio := TRUE;
        IF NOT fbSic.xGuasto AND NOT xRevisione THEN
            xFuoriServizio := FALSE;
            eStato := ST_RIPOSO;
        END_IF

    ST_EMERGENZA:
        (* catena aperta: l'hardware ha gia' tolto potenza. Allinea uscite. *)
        xKM_Salita := FALSE; xKM_Discesa := FALSE;
        xKM_Veloce := FALSE; xKM_Lento := FALSE;
        xKM_Freno  := FALSE;
        xFuoriServizio := TRUE;
        IF NOT fbSic.xEmergenza THEN
            xFuoriServizio := FALSE;
            eStato := ST_RIPOSO;
        END_IF

END_CASE

(* uscite di segnalazione comuni *)
wDisplayPos := INT_TO_WORD(iPianoCorrente);
CASE eDirezione OF
    DIR_SALITA:  wFrecceDir := 1;
    DIR_DISCESA: wFrecceDir := 2;
ELSE
    wFrecceDir := 0;
END_CASE

END_PROGRAM
