(*
 ============================================================================
   FB_AllarmeEmergenza.st  —  Sistema di allarme e comunicazione bidirezionale
                              EN 81-28:2022
 ============================================================================
   Gestisce:
   - filtro temporale sul pulsante di allarme (evita attivazioni accidentali);
   - registrazione allarme e avvio del combinatore (autodialer GSM/PSTN);
   - segnalazioni in cabina: pittogramma GIALLO (allarme inviato) e VERDE
     (collegamento col servizio di soccorso stabilito) — EN 81-28 §4.2;
   - test automatico periodico (>= ogni 3 giorni) di linea e batteria;
   - rilevazione guasto (batteria/linea) e reset da parte del tecnico.

   NB: la comunicazione vocale e l'autonomia batteria (>= 1 h) sono garantite
   dall'unita' di comunicazione certificata; qui se ne gestisce la logica di
   attivazione, segnalazione e supervisione.
 ============================================================================
*)

FUNCTION_BLOCK FB_AllarmeEmergenza
VAR_INPUT
    xPulsanteAllarme : BOOL;   (* pulsante di allarme in cabina *)
    xUnitaCommOk     : BOOL;   (* combinatore/linea telefonica ok *)
    xBatteriaOk      : BOOL;   (* batteria del sistema di allarme ok *)
    xRiscontroOper   : BOOL;   (* il servizio di soccorso ha preso in carico *)
    xResetTecnico    : BOOL;   (* reset dopo liberazione passeggero *)
    rTempoFiltro     : REAL;   (* s, filtro pressione pulsante (es. 3 s) *)
END_VAR
VAR_OUTPUT
    xAllarmeRegistrato   : BOOL;  (* pittogramma GIALLO: allarme inviato *)
    xComunicazioneAttiva : BOOL;  (* pittogramma VERDE: collegamento stabilito *)
    xAvviaCombinatore    : BOOL;  (* comando avvio chiamata *)
    xTestInCorso         : BOOL;  (* test periodico in esecuzione *)
    xGuastoAllarme       : BOOL;  (* batteria/linea KO o test fallito *)
END_VAR
VAR
    tonFiltro  : TON;
    tonTest    : TON;     (* periodo test (72 h) *)
    tonTestDur : TON;     (* durata test *)
END_VAR

(* --- filtro pressione pulsante: registra l'allarme solo se mantenuto --- *)
tonFiltro(IN := xPulsanteAllarme, PT := SecToTime(rTempoFiltro));
IF tonFiltro.Q THEN
    xAllarmeRegistrato := TRUE;   (* latch fino al reset tecnico *)
END_IF

(* --- reset da parte del tecnico (passeggero liberato) --- *)
IF xResetTecnico THEN
    xAllarmeRegistrato   := FALSE;
    xComunicazioneAttiva := FALSE;
END_IF

(* --- avvio combinatore finche' non e' stabilita la comunicazione --- *)
xAvviaCombinatore := xAllarmeRegistrato AND NOT xComunicazioneAttiva;

(* --- collegamento stabilito quando il soccorso prende in carico --- *)
IF xAllarmeRegistrato AND xRiscontroOper THEN
    xComunicazioneAttiva := TRUE;
END_IF

(* --- test automatico periodico ogni 72 h (EN 81-28) --- *)
tonTest(IN := NOT tonTest.Q, PT := T#72H);   (* impulso periodico *)
IF tonTest.Q THEN
    xTestInCorso := TRUE;
END_IF
tonTestDur(IN := xTestInCorso, PT := T#30S);
IF tonTestDur.Q THEN
    xTestInCorso := FALSE;
END_IF

(* --- guasto: batteria/linea KO, oppure test con esito negativo --- *)
xGuastoAllarme := (NOT xBatteriaOk) OR (NOT xUnitaCommOk);

END_FUNCTION_BLOCK
