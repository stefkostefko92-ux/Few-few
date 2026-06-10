# Simulazione e test della logica PLC (geared / idraulico)

Porting in Python della logica Structured Text di [`../plc/src/`](../plc/src/) con un
**modello d'impianto** (`PlantModel`) che chiude l'anello di controllo, così da poter
**eseguire e testare** le sequenze di manovra senza un PLC fisico.

> Strumento di **verifica logica**, non un simulatore fisico di precisione. La
> sicurezza reale resta cablata (vedi `../schemi/`). I sistemi gearless sono esclusi.

## File

| File | Contenuto |
|------|-----------|
| `ascensore_sim.py` | FB (sicurezza/porte/chiamate), macchina a stati geared+idraulico, PlantModel, Simulatore |
| `test_ascensore.py` | Suite `unittest` con scenari di manovra |

## Esecuzione

```bash
# demo rapida (chiamata al piano 3, geared)
python3 sim/ascensore_sim.py

# suite di test
python3 -m unittest -v sim.test_ascensore
```

Nessuna dipendenza esterna (solo libreria standard).

## Scenari coperti dai test

**Geared**
- `test_partenza_e_arrivo` — chiamata al piano 3: arriva e apre le porte
- `test_chiamata_stessa_quota` — chiamata al piano corrente: apre senza muoversi
- `test_emergenza_ferma_la_manovra` — catena aperta in marcia → EMERGENZA, uscite a 0
- `test_recupero_dopo_emergenza` — richiusura catena → ritorno a RIPOSO
- `test_revisione_uomo_presente` — solo bassa velocità, a comando, si ferma al rilascio
- `test_sovraccarico_blocca_partenza` — con sovraccarico non parte
- `test_guasto_termico` — termica intervenuta → GUASTO + fuori servizio
- `test_collettiva_due_chiamate` — chiamate 2 e 4 servite salendo nell'ordine corretto

**Idraulico**
- `test_salita_sequenza_stella_triangolo` — Y → Δ + valvola di salita
- `test_discesa_per_gravita` — discesa con sola valvola, pompa ferma
- `test_emergenza_idraulico` — catena aperta → valvole/pompa a 0

## Bug logici trovati e corretti grazie alla simulazione

La simulazione ha evidenziato (e fatto correggere **anche nel Structured Text**) due
difetti dello schema a stati iniziale:

1. **Richiusura verso il riposo**: da `CHIUDI_PORTE` si entrava in `PARTENZA`→`MARCIA`
   anche senza target valido (cabina "appesa" in marcia a direzione FERMO). Ora, se non
   c'è un target valido, da `CHIUDI_PORTE` si torna a `RIPOSO`.
2. **Sovraccarico a porte già chiuse**: il sovraccarico bloccava solo la richiusura, non
   la partenza; con porte già chiuse la cabina partiva lo stesso. Ora il sovraccarico
   inibisce la partenza in `RIPOSO`/`CHIUDI_PORTE`.

Le correzioni sono allineate tra `sim/ascensore_sim.py` e
`plc/src/PRG_Geared.st` / `plc/src/PRG_Idraulico.st`.

## Rapporto con il software PLC

Il modello riproduce 1:1 stati, transizioni e condizioni dei programmi ST. Resta una
verifica funzionale: i tempi reali (avviamento Y/Δ, rampe, livellamento) vanno tarati in
campo e il collaudo va eseguito secondo **DPR 162/1999 e s.m.i.** da parte abilitata.
