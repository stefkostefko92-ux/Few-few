# 04 — Software del PLC, pagina web per smartphone, parametri

_Data: 2026-10-07 · Progetto di principio. Nessun codice di sicurezza: la sicurezza è cablata o nei moduli certificati (T04/T05)._

## 1. Divisione dei compiti

| Livello | Dove gira | Che cosa fa | Che cosa NON fa |
|---|---|---|---|
| Sicurezza | contatti in serie + moduli CE | catena, bypass porte, UCM, limitazione ai piani estremi (5.12.1.3), limitatore di tempo | non dipende dal software |
| Manovra | PLC standard (IEC 61131-3, ciclo fisso 10 ms) | stati (T13), chiamate, posizione, porte, parametri | non apre mai la catena né la scavalca |
| Comunicazione | stesso PLC o gateway | CAN1 cabina, CAN2 piani, Modbus TCP | non porta segnali di sicurezza |
| Web | gateway (Node 22 + TypeScript) | HTTPS, ruoli, limiti, registro delle modifiche | non scrive su registri fuori lista bianca |
| Remoto | router 5G + VPS | tunnel in uscita, accesso con 2FA | nessun comando di marcia |

## 2. Struttura del programma PLC (POU)

1. `IO_Map` — ingressi/uscite fisiche con nome, polarità, filtro (anti-rimbalzo 20 ms sui contatti di piano).
2. `Catena_Diagnosi` — legge i tratti della catena (T04/T05) e ne ricava «quale» tratto è aperto; **sola lettura**.
3. `Posizione` — contatore veloce dell'encoder, quota di piano, correzione a ogni sensore di zona porta, recupero dopo mancanza rete.
4. `Chiamate` — collettiva selettiva: code di salita/discesa/cabina, direzione, inversione, priorità, parcheggio.
5. `Stati` — macchina a stati di T13, una sola transizione per ciclo, ogni transizione registrata.
6. `Azionamento_Trazione` / `Azionamento_Idraulico` — le sole POU diverse tra i due impianti (rampa S o valvole).
7. `Porte` — apertura/chiusura, tempi, ostacolo, ritentativi, fuori servizio dopo N tentativi.
8. `Bus_CAN` — master, stato nodi, mancanza di un nodo = piano escluso, non arresto della sicurezza.
9. `Parametri` — tabella con minimo, massimo, valore predefinito, livello (L1…L3), CRC; copia in memoria non volatile.
10. `Log` — ultimi 500 eventi con ora, stato, quota, tratto di catena; contatori di corse e avviamenti.
11. `Modbus_Slave` — espone solo i registri della lista bianca (sotto).

## 3. Registri Modbus (lista bianca di principio)

| Gruppo | Accesso gateway | Esempi |
|---|---|---|
| Stato | lettura | piano, direzione, stato porte, fuori servizio, codice guasto, tratti catena |
| Contatori | lettura | corse, avviamenti, ore di moto, ore di olio |
| Parametri L1 | lettura/scrittura (limiti nel PLC) | tempo porte, piano di parcheggio, orario notte, blocchi di piano, volume, luminosità |
| Parametri L2 | lettura/scrittura | soglie di pre-allarme, reset guasti non di sicurezza |
| Parametri L3 | scrittura solo con chiave in quadro attiva | numero fermate, mappa piani, offset, rampe, velocità di livello |
| Sicurezza | **nessun registro** | — |

Regole: ogni scrittura porta un numero di sequenza e un CRC; il PLC controlla minimo/massimo e risponde con eco; il valore
resta provvisorio finché il gateway non conferma con una seconda scrittura (conferma a due fasi).

## 4. Pagina web (smartphone)

- **Accesso:** QR sul quadro (o link per impianto) → login con e-mail e password (Argon2id) e 2FA → il portale assegna il ruolo.
  Cookie di sessione `httpOnly`, `Secure`, `SameSite=Strict`; limite di tentativi; blocco dopo errori ripetuti.
- **Pagine dell'Utente (L1):** stato in tempo reale; tempi porte; parcheggio e modalità notte; blocco piani con orario;
  volume e luminosità; «segnala un problema». Tutto a schermo intero, pulsanti grandi, contrasto alto, uso con una mano.
- **Pagine del Manutentore (L2):** storico guasti, ingressi/uscite e tratti della catena, contatori, soglie, reset non di sicurezza,
  esportazione PDF per il libretto di manutenzione.
- **Pagine dell'Installatore (L3, in loco):** apprendimento del vano, numero fermate, offset, rampe, parametri dell'azionamento,
  aggiornamenti del software; richiede la chiave nel quadro e l'account.
- **Lingue:** italiano (fonte), inglese, bulgaro.
- **Accessibilità:** WCAG 2.1 AA (obbligo EAA dal 28/06/2025 per i servizi coperti; verificare se la pagina rientra nell'ambito).
- Tabella completa di chi può cambiare che cosa: tavola **T14**.

## 5. Aggiornamento del software

- Pacchetto firmato (chiave pubblica nel PLC); si installa solo in loco con la chiave in quadro.
- Versione, CRC e data nel registro; ripristino alla versione precedente se l'autotest fallisce.
- Ogni versione che tocca i limiti normativi (tempi, quote, velocità) richiede la verifica del progettista; se tocca il
  comportamento di un dispositivo di sicurezza non è un aggiornamento ma una **modifica**.

## 6. Test prima della messa in servizio

1. Simulazione del PLC con piano virtuale 12 e 24 fermate (tutte le combinazioni di chiamate).
2. Prova di ogni tratto della catena (aprire ogni contatto: nessuna marcia, tratto giusto nel log).
3. Prova di mancanza del bus CAN, del 5G e della rete elettrica.
4. Prova di scrittura fuori limite dal web (rifiuto), da ruolo sbagliato (rifiuto) e con chiave assente (rifiuto).
5. Prove di norma su ciascun dispositivo (vedi 02-normativa).
