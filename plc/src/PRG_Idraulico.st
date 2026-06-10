(*
 ============================================================================
   PRG_Idraulico.st  —  Programma principale ascensore IDRAULICO
 ============================================================================
   SALITA  : avvio pompa (stella-triangolo) + valvola di salita -EV-S.
   DISCESA : per gravita' aprendo la valvola di discesa -EV-D (pompa ferma).
   Livellamento e anti-deriva (re-livellamento) in zona porta.
   Discesa di emergenza a uomo presente: gestione/segnalazione (non-safety).

   La sicurezza e' cablata (vedi schemi/). Questo programma e' solo manovra.
 ============================================================================
*)

PROGRAM PRG_Idraulico
VAR
    fbSic   : FB_CatenaSicurezza;
    fbPorte : FB_GestionePorte;
    fbCall  : FB_GestioneChiamate;

    iTarget    : INT := -1;
    tonStella  : TON;     (* tempo avviamento in stella *)
    tonGong    : TON;
    tonRelivel : TON;     (* ritardo intervento anti-deriva *)
    xPompaOn   : BOOL;
END_VAR

(* ------------------------------------------------------------------ *)
(* 1) MONITORAGGIO SICUREZZA (include pressione minima)                *)
(* ------------------------------------------------------------------ *)
fbSic(
    xCatenaOK       := xCatenaSicurezzaOK,
    xTermica        := xTermicaMotore,
    xPressioneMin   := xPressioneMin,
    xControlloFreno := TRUE,                 (* non applicabile su idraulico *)
    xZonaPorta1     := xZonaPorta1,
    xZonaPorta2     := xZonaPorta2,
    xConsensoFreno  := FALSE);

(* ------------------------------------------------------------------ *)
(* 2) CHIAMATE E TARGET                                                 *)
(* ------------------------------------------------------------------ *)
fbCall(
    wChiamateCabina := wChiamateCabina,
    wChiamatePiaSu  := wChiamatePianoSu,
    wChiamatePiaGiu := wChiamatePianoGiu,
    iPianoCorrente  := iPianoCorrente,
    eDirezione      := eDirezione,
    xResetTarget    := (eStato = ST_APRI_PORTE));

(* ------------------------------------------------------------------ *)
(* 3) PORTE                                                             *)
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

IF eStato = ST_LIVELLA AND fbSic.xInZonaPorta THEN
    iPianoCorrente := iTarget;
END_IF

(* ------------------------------------------------------------------ *)
(* 4) MACCHINA A STATI                                                  *)
(* ------------------------------------------------------------------ *)
IF fbSic.xEmergenza THEN
    eStato := ST_EMERGENZA;
ELSIF fbSic.xGuasto THEN
    eStato := ST_GUASTO;
ELSIF xRevisione THEN
    eStato := ST_REVISIONE;
END_IF

CASE eStato OF

    ST_RIPOSO:
        xKM_Pompa := FALSE; xKM_Stella := FALSE; xKM_Triangolo := FALSE;
        xEV_Salita := FALSE; xEV_Discesa := FALSE;
        eDirezione := DIR_FERMO;
        (* anti-deriva: se la cabina lascia la zona porta a fermo, re-livella *)
        tonRelivel(IN := (NOT fbSic.xInZonaPorta) AND Par.RelivellAbilitato
                          AND fbPorte.xPorteChiuse, PT := T#1S);
        IF tonRelivel.Q AND fbSic.xConsensoMarcia THEN
            iTarget := iPianoCorrente;
            eDirezione := DIR_SALITA;     (* recupero livello solo in salita *)
            eStato := ST_PARTENZA;
        ELSIF fbCall.Richiesta.Valida AND fbSic.xConsensoMarcia THEN
            iTarget := fbCall.Richiesta.PianoTarget;
            IF iTarget = iPianoCorrente THEN
                eStato := ST_APRI_PORTE;
            ELSIF NOT xSovraccarico THEN
                eStato := ST_CHIUDI_PORTE;
            END_IF
        END_IF

    ST_CHIUDI_PORTE:
        xKM_ChiudiPorte := TRUE;
        IF fbPorte.xPorteChiuse THEN
            IF fbCall.Richiesta.Valida AND NOT xSovraccarico THEN
                iTarget := fbCall.Richiesta.PianoTarget;
                eDirezione := fbCall.Richiesta.Direzione;
                eStato := ST_PARTENZA;
            ELSE
                eStato := ST_RIPOSO;
            END_IF
        END_IF

    ST_PARTENZA:
        IF NOT (fbSic.xConsensoMarcia AND fbPorte.xPorteChiuse) THEN
            eStato := ST_ARRESTO;
        ELSIF eDirezione = DIR_SALITA THEN
            (* avvio pompa in stella, poi triangolo, poi apri valvola salita *)
            xKM_Pompa := TRUE;
            xKM_Stella := TRUE;
            tonStella(IN := TRUE, PT := T#1S500MS);
            IF tonStella.Q THEN
                xKM_Stella := FALSE;
                xKM_Triangolo := TRUE;
                xEV_Salita := TRUE;
                tonStella(IN := FALSE);
                eStato := ST_MARCIA;
            END_IF
        ELSE
            (* discesa: solo valvola, pompa ferma *)
            xKM_Pompa := FALSE; xKM_Stella := FALSE; xKM_Triangolo := FALSE;
            xEV_Discesa := TRUE;
            eStato := ST_MARCIA;
        END_IF

    ST_MARCIA:
        (* in idraulico la velocita' e' regolata dalle valvole;
           rallenta all'arrivo della camma del piano target *)
        IF (eDirezione = DIR_SALITA AND xRallentSalita)
           OR (eDirezione = DIR_DISCESA AND xRallentDiscesa) THEN
            eStato := ST_RALLENTA;
        END_IF
        IF NOT fbSic.xConsensoMarcia THEN eStato := ST_ARRESTO; END_IF

    ST_RALLENTA:
        (* la valvola riduce la portata -> avvicinamento lento *)
        IF fbSic.xInZonaPorta THEN
            eStato := ST_LIVELLA;
        END_IF
        IF NOT fbSic.xConsensoMarcia THEN eStato := ST_ARRESTO; END_IF

    ST_LIVELLA:
        IF fbSic.xInZonaPorta THEN
            eStato := ST_ARRESTO;
        END_IF

    ST_ARRESTO:
        (* chiudi valvole e ferma pompa; in salita la valvola chiude prima
           della pompa per evitare colpi d'ariete *)
        xEV_Salita := FALSE; xEV_Discesa := FALSE;
        xKM_Triangolo := FALSE; xKM_Stella := FALSE; xKM_Pompa := FALSE;
        eStato := ST_APRI_PORTE;

    ST_APRI_PORTE:
        tonGong(IN := TRUE, PT := T#300MS);
        xGong := Par.GongAbilitato AND tonGong.Q;
        IF fbPorte.xPorteAperte THEN
            tonGong(IN := FALSE);
            eStato := ST_ATTESA;
        END_IF

    ST_ATTESA:
        IF fbCall.xChiamateAttive THEN
            eStato := ST_CHIUDI_PORTE;
        ELSIF fbPorte.xPorteChiuse THEN
            eStato := ST_RIPOSO;
        ELSE
            eStato := ST_CHIUDI_PORTE;
        END_IF

    ST_REVISIONE:
        xKM_ApriPorte := FALSE; xKM_ChiudiPorte := FALSE;
        IF xRevSalita AND NOT xRevDiscesa AND fbSic.xConsensoMarcia THEN
            xKM_Pompa := TRUE; xKM_Triangolo := TRUE; xEV_Salita := TRUE;
        ELSIF xRevDiscesa AND NOT xRevSalita AND fbSic.xConsensoMarcia THEN
            xEV_Discesa := TRUE; xKM_Pompa := FALSE;
        ELSE
            xKM_Pompa := FALSE; xKM_Stella := FALSE; xKM_Triangolo := FALSE;
            xEV_Salita := FALSE; xEV_Discesa := FALSE;
        END_IF
        IF NOT xRevisione THEN eStato := ST_RIPOSO; END_IF

    ST_GUASTO:
        xKM_Pompa := FALSE; xKM_Stella := FALSE; xKM_Triangolo := FALSE;
        xEV_Salita := FALSE; xEV_Discesa := FALSE;
        xFuoriServizio := TRUE;
        IF NOT fbSic.xGuasto AND NOT xRevisione THEN
            xFuoriServizio := FALSE;
            eStato := ST_RIPOSO;
        END_IF

    ST_EMERGENZA:
        xKM_Pompa := FALSE; xKM_Stella := FALSE; xKM_Triangolo := FALSE;
        xEV_Salita := FALSE; xEV_Discesa := FALSE;
        xFuoriServizio := TRUE;
        IF NOT fbSic.xEmergenza THEN
            xFuoriServizio := FALSE;
            eStato := ST_RIPOSO;
        END_IF

END_CASE

wDisplayPos := INT_TO_WORD(iPianoCorrente);
CASE eDirezione OF
    DIR_SALITA:  wFrecceDir := 1;
    DIR_DISCESA: wFrecceDir := 2;
ELSE
    wFrecceDir := 0;
END_CASE

END_PROGRAM
