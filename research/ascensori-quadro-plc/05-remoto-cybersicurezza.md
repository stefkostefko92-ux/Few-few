# 05 — Collegamento remoto 5G e cybersicurezza

_Data: 2026-10-07 · Fonti: `mercato.md` (ricerca del 2026-10-07; date da riverificare nella Gazzetta Ufficiale UE)._

## 1. Principio

Il collegamento 5G serve a **vedere e a regolare parametri non critici**, non a muovere né a proteggere l'impianto. Il router
fa una connessione **in uscita** verso il nostro server in UE; nessuna porta è aperta da Internet (T12). La catena di sicurezza
non ha alcun collegamento con router, gateway o Wi-Fi (T01, T12).

## 2. Che cosa è consentito da remoto

| Consentito | Vietato |
|---|---|
| leggere stato, guasti, contatori, tratti della catena | comandare la marcia o una chiamata fantasma |
| modificare tempi porte, parcheggio, blocchi di piano (limiti nel PLC) | modificare soglie o tempi dei dispositivi di sicurezza |
| reset di guasti non di sicurezza (ruolo Manutentore) | resettare un arresto di sicurezza |
| scaricare il registro per il libretto | aggiornare il software del PLC (solo in loco) |

Nota: **nessuna linea guida pubblica** sull'accesso remoto ai circuiti di sicurezza è stata trovata; la regola sopra è un
principio di progetto da validare con l'organismo notificato.

## 3. Quadro normativo e date (da riverificare)

| Tema | Stato trovato | Fonte |
|---|---|---|
| EN ISO 8100-1/-2 (sostituiscono EN 81-20/-50) | approvata da CEN il 1/3/2026; citazione armonizzata attesa nel 3° trimestre 2026, poi 36 mesi di transizione; la data di ritiro di EN 81-20:2020 è contraddittoria nelle fonti | https://www.liftinstituut.com/newsroom/129-the-latest-news-on-the-en-iso-8100-development (non aperta; da riverificare in GUUE) |
| Regolamento Macchine (UE) 2023/1230 | si applica dal 20/1/2027; gli ascensori restano sotto la Direttiva 2014/33/UE per la marcatura | https://news.all4pack.com/?p=3784 |
| Direttiva RED 2014/53/UE, atto delegato cybersicurezza | art. 3(3) d, e, f obbligatori dal 1/8/2025; EN 18031-1/-2/-3 citate in GUUE il 30/1/2025 | https://www.tuvsud.com/en-us/services/product-certification/red-cybersecurity-requirements |
| Cyber Resilience Act | in vigore dal 10/12/2024; segnalazioni dal 11/9/2026; applicazione piena dal 11/12/2027 | https://finitestate.io/blog/cyber-resilience-act-timeline-2026-2027 |
| EN 81-28:2022 (teleallarme) | la tecnologia di trasmissione (cellulare, VoIP, linea fissa) è fuori ambito della norma | https://standards.iteh.ai/catalog/standards/sist/0e5acbef-36bf-4202-8f79-bd45d7a2e85f/sist-en-81-28-2022 |
| DPR 162/1999 (mod. DPR 23/2017) | manutenzione a persona abilitata o ditta con personale abilitato; verifica almeno ogni 6 mesi con annotazione sul libretto | https://www.certifico.com/marcatura-ce/documenti-marcatura-ce/documenti-riservati-marcatura-ce/patentino-ascensorista-normativa-e-procedura |
| NIS2, GDPR | non analizzati in questa ricerca | — |

Conseguenze pratiche:
1. Il **router** deve avere dichiarazione di conformità RED con EN 18031 (da verificare per il modello scelto).
2. Con **CRA** dal 11/12/2027, il quadro con modem e web diventa «prodotto con elementi digitali»: previsti aggiornamenti di
   sicurezza, SBOM, gestione delle vulnerabilità e segnalazione. Conviene progettarli subito.
3. Un quadro **nuovo** progettato dopo la citazione di EN ISO 8100 dovrebbe seguire quella; fino ad allora EN 81-20/50:2020.

## 4. Misure (elenco di controllo)

- Router: password uniche, accesso admin solo da VPN, firmware aggiornabile e firmato, SIM-PIN, log remoto.
- VPN: WireGuard, una chiave per impianto, revoca immediata dal portale.
- Portale: 2FA obbligatoria per Manutentore/Installatore, rate limit, audit di ogni accesso, nessun dato personale nei log.
- Gateway: scrive solo registri in lista bianca; coda dei comandi con scadenza; nessun accesso a Internet in uscita salvo NTP e aggiornamenti.
- Wi-Fi locale: spento di default, 10 minuti dopo chiave + pulsante, client isolati, WPA3.
- Dati: server in UE; conservare per l'impianto il registro eventi (retention da fissare: 24 mesi di principio).
- Disaster: se il 5G cade, l'ascensore funziona normalmente; il teleallarme EN 81-28 ha SIM e batteria proprie (T11).
