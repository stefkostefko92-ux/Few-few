(*
 ============================================================================
   FB_CatenaSicurezza.st  —  Monitoraggio (NON sostituzione) della sicurezza
 ============================================================================
   Il PLC LEGGE lo stato della catena di sicurezza cablata e delle protezioni
   macchina per gestire la manovra in modo coerente. L'ARRESTO di sicurezza e'
   garantito dall'hardware (relè -KA-SIC + contattori), non da questo codice.
 ============================================================================
*)

FUNCTION_BLOCK FB_CatenaSicurezza
VAR_INPUT
    xCatenaOK       : BOOL;   (* feedback relè sicurezza -KA-SIC *)
    xTermica        : BOOL;   (* -F-MOT 1 = ok *)
    xPressioneMin   : BOOL;   (* idraulico: 1 = ok; geared: forzare TRUE *)
    xControlloFreno : BOOL;   (* geared: 1 = freno integro; idraulico: TRUE *)
    xZonaPorta1     : BOOL;
    xZonaPorta2     : BOOL;
    xConsensoFreno  : BOOL;   (* il freno e' attualmente comandato? *)
END_VAR
VAR_OUTPUT
    xConsensoMarcia : BOOL;   (* TRUE = condizioni ok per muovere la cabina *)
    xEmergenza      : BOOL;   (* catena aperta -> fermo immediato manovra *)
    xGuasto         : BOOL;   (* guasto protezioni -> fuori servizio *)
    xInZonaPorta    : BOOL;   (* zona di livellamento valida (ridondante) *)
    xDiscordanzaZP  : BOOL;   (* discordanza sensori zona porta *)
END_VAR
VAR
    tonDiscordanza : TON;     (* tolleranza temporale discordanza ZP *)
    tonFreno       : TON;     (* controllo coerenza freno *)
END_VAR

(* --- catena di sicurezza --- *)
xEmergenza := NOT xCatenaOK;

(* --- guasto protezioni macchina (termica / pressione) --- *)
xGuasto := (NOT xTermica) OR (NOT xPressioneMin);

(* --- zona porta ridondante: validi solo se concordi --- *)
xInZonaPorta := xZonaPorta1 AND xZonaPorta2;

(* discordanza tollerata per breve transitorio, poi guasto *)
tonDiscordanza(IN := (xZonaPorta1 XOR xZonaPorta2), PT := T#500MS);
xDiscordanzaZP := tonDiscordanza.Q;
IF xDiscordanzaZP THEN
    xGuasto := TRUE;
END_IF

(* --- coerenza freno (solo geared): se comandato chiuso ma il contatto
       segnala non integro entro 1s -> guasto --- *)
tonFreno(IN := (xConsensoFreno AND NOT xControlloFreno), PT := T#1S);
IF tonFreno.Q THEN
    xGuasto := TRUE;
END_IF

(* --- consenso marcia complessivo --- *)
xConsensoMarcia := xCatenaOK AND xTermica AND xPressioneMin
                   AND NOT xGuasto AND NOT xEmergenza;

END_FUNCTION_BLOCK
