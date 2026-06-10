# Architettura software PLC — manovra ascensore

## Principio fondamentale

Il PLC realizza **esclusivamente la logica di manovra** (chiamate, sequenze, porte,
segnalazioni). Tutte le funzioni di sicurezza sono **cablate** secondo EN 81-20 §5.11
e lette dal PLC solo come stato (feedback del relè di sicurezza `-KA-SIC`).
**I sistemi gearless sono esclusi**: il software copre argano geared e idraulico.

## Ciclo di scansione (ogni programma)

```
1. FB_CatenaSicurezza  → legge sicurezza, zona porta ridondante, protezioni
2. FB_GestioneChiamate → consolida chiamate, calcola prossimo target
3. FB_GestionePorte    → comanda operatore porte
4. Aggiornamento posizione (encoder/camme)
5. Macchina a stati    → pilota contattori/valvole/freno
6. Segnalazioni        → display, frecce, gong, fuori servizio
```

L'ordine garantisce che la sicurezza sia valutata **prima** di qualunque comando di
movimento e che i comandi di marcia siano subordinati a `xConsensoMarcia`.

## Macchina a stati (E_StatoMacchina)

| Stato | Descrizione | Uscite principali |
|-------|-------------|-------------------|
| `ST_RIPOSO` | fermo a piano, porte chiuse | tutto a 0, freno serrato |
| `ST_CHIUDI_PORTE` | richiusura prima della marcia | `-KM-CHIU` |
| `ST_PARTENZA` | sblocco freno / avvio pompa | direzione + bassa velocità |
| `ST_MARCIA` | marcia veloce | alta velocità / valvola |
| `ST_RALLENTA` | avvicinamento al piano | bassa velocità |
| `ST_LIVELLA` | livellamento fine in zona porta | bassa velocità |
| `ST_ARRESTO` | frenatura ordinata | serra freno → toglie marcia |
| `ST_APRI_PORTE` | apertura al piano + gong | `-KM-APRE`, `-H-GONG` |
| `ST_ATTESA` | porte aperte, attesa temporizzata | — |
| `ST_REVISIONE` | ispezione uomo presente, bassa velocità | comandi manuali |
| `ST_GUASTO` | fuori servizio per protezioni | `-H-OOS` |
| `ST_EMERGENZA` | catena aperta (HW ha tolto potenza) | uscite allineate a 0 |

Transizioni prioritarie valutate a inizio scansione:
`EMERGENZA > GUASTO > REVISIONE > stati normali`.

## Sicurezza delle sequenze critiche

- **Geared, arresto**: si serra il freno (`-KM-FRE`=0) e si attende `400 ms`
  prima di togliere i contattori di marcia → evita strappi e usura.
- **Idraulico, salita**: avvio pompa `Y` → `Δ` (1,5 s) → apertura valvola salita;
  in arresto la valvola chiude **prima** della pompa → no colpo d'ariete.
- **Zona porta ridondante**: `xInZonaPorta = ZP1 AND ZP2`; discordanza > 500 ms → guasto.
- **Anti-deriva idraulico**: a fermo, fuori zona porta per > 1 s, re-livellamento in
  salita (se `RelivellAbilitato`). È funzione di comfort, non sostituisce l'A3 cablato.

## Parametri e modulo WiFi

La struttura `ST_Parametri` raccoglie i parametri configurabili. Quelli **non-safety**
(tempi porte, gong, parcheggio) sono modificabili via WiFi/Modbus; quelli
**safety-relevant** (velocità ispezione/livellamento, finestra zona porta) richiedono
la **chiave fisica** in quadro (vedi `../../docs/02-parametri-wifi.md` e
`../../firmware/`). I limiti normativi (es. ispezione ≤ 0,63 m/s) sono enforced sia nel
firmware sia, come ulteriore barriera, nei valori di default qui definiti.

## Portabilità

- **Codesys**: compila direttamente come progetto ST.
- **Siemens TIA (SCL)**: `FUNCTION_BLOCK`→FB+DB istanza, `PROGRAM`→OB1/FC;
  rimappare `%I/%Q` su tag. `TON`, `SHL`, conversioni sono standard.
- Evitato l'uso di costrutti vendor-specifici per massima portabilità.
