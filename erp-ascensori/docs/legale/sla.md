# Allegato 2 — Livelli di servizio (SLA)

> **ЧЕРНОВА ЗА ЮРИСТ.** Числата долу са **обещания**, които струват пари, ако
> не се спазят. Преди подпис сверявай всяко от тях с реалната инфраструктура:
> един VPS без резервен възел не носи 99,9 % с чиста съвест.

Allegato al contratto di licenza e servizio. Si applica alla sola **modalità
ospitata**; nell'installazione presso il Cliente si applicano gli artt. 4 e 5
(assistenza e ripristino), non l'art. 1 (disponibilità).

---

## 1. Disponibilità

| Voce | Valore |
|---|---|
| Disponibilità mensile garantita | **99,5 %** |
| Finestra di misurazione | mese solare |
| Metodo | sonda esterna su `GET /api/readyz`, intervallo 60 s |

1.1 **Esclusi dal calcolo:** le finestre di manutenzione programmata (art. 2);
i fermi imputabili al Cliente, alla sua rete o a sue configurazioni; gli eventi
di forza maggiore; i fermi del fornitore di connettività del Cliente.

1.2 **99,5 % mensile** equivale a circa 3 ore e 39 minuti di indisponibilità al
mese. Il valore è scelto per essere **mantenibile**: il Servizio gira su un
singolo nodo, senza replica automatica. Un impegno superiore richiede
un'architettura diversa ed è oggetto di offerta separata.

## 2. Manutenzione programmata

2.1 Finestra ordinaria: **domenica 02:00–06:00** (ora italiana).

2.2 Preavviso: **5 giorni lavorativi** per interventi che comportano
indisponibilità superiore a 15 minuti; **24 ore** per gli aggiornamenti di
sicurezza urgenti.

2.3 Gli aggiornamenti correttivi che non comportano indisponibilità sono
applicati senza preavviso.

## 3. Continuità e ripristino

| Voce | Valore | Come è garantito |
|---|---|---|
| **RPO** (dato massimo perdibile) | **24 ore** | backup giornaliero automatico alle 03:00 |
| **RTO** (tempo massimo di ripristino) | **8 ore lavorative** | ripristino da backup su infrastruttura equivalente |
| Conservazione dei backup | **31 giorni** | rotazione automatica |
| Cifratura dei backup | sì, se il Cliente fornisce la chiave pubblica `age` | — |
| Verifica dei backup | **ripristino reale periodico** con confronto del numero di righe | procedura `verifica:backup` |

3.1 La verifica non è dichiarativa: il backup viene **effettivamente
ripristinato** su un'istanza separata e il contenuto confrontato con l'origine.
Un backup mai ripristinato non è un backup.

3.2 Gli allegati (certificati, verbali, fotografie) sono inclusi nel backup
giornaliero.

## 4. Assistenza — tempi di presa in carico

| Gravità | Definizione | Presa in carico | Aggiornamenti |
|---|---|---|---|
| **1 — Bloccante** | il Servizio è inutilizzabile per tutti gli utenti; perdita o corruzione di dati | **4 ore lavorative** | ogni 4 ore lavorative |
| **2 — Grave** | una funzione essenziale è inutilizzabile senza alternativa (emissione documenti, rapportini, scadenzario) | **1 giorno lavorativo** | giornalieri |
| **3 — Ordinaria** | malfunzionamento con alternativa praticabile | **3 giorni lavorativi** | settimanali |
| **4 — Richiesta** | domanda d'uso, richiesta di funzionalità | **5 giorni lavorativi** | — |

4.1 **Orario lavorativo:** lunedì–venerdì 09:00–18:00, esclusi i festivi
italiani.

4.2 I tempi indicati sono di **presa in carico**, non di risoluzione. Il tempo
di risoluzione non è garantito perché dipende dalla natura del difetto; il
Fornitore si obbliga a lavorare senza interruzione sui casi di gravità 1 fino al
ripristino o a una soluzione temporanea praticabile.

4.3 La gravità è proposta dal Cliente e confermata dal Fornitore. In caso di
disaccordo prevale, fino a chiarimento, **la valutazione più grave**.

4.4 Canale: «e-mail / portale». Le segnalazioni pervenute fuori orario si
considerano ricevute all'apertura successiva.

## 5. Penali

5.1 Al mancato raggiungimento della disponibilità mensile garantita, su
richiesta scritta del Cliente entro 30 giorni, è riconosciuto un **credito sul
canone**:

| Disponibilità del mese | Credito |
|---|---|
| da 99,0 % a 99,5 % | 5 % del canone mensile |
| da 95,0 % a 99,0 % | 10 % del canone mensile |
| inferiore al 95,0 % | 25 % del canone mensile |

5.2 Il credito è l'**unico rimedio** per il mancato rispetto della
disponibilità, salvi i casi di dolo e colpa grave e salvo il diritto di recesso
di cui al comma seguente.

5.3 Se la disponibilità mensile risulta inferiore al 95 % per **tre mesi anche
non consecutivi** nell'arco di dodici, il Cliente può recedere senza penali con
preavviso di 30 giorni, con diritto al rimborso pro rata del canone anticipato.

## 6. Monitoraggio e trasparenza

6.1 Il Fornitore mantiene un sistema di monitoraggio con allarmi su: raggiungibilità,
tasso di errore, esecuzione degli automatismi (scadenze, contratti, conservazione,
notifiche), esito dei backup, effettiva attivazione dell'isolamento tra aziende.

6.2 Su richiesta scritta, il Fornitore fornisce al Cliente il rapporto mensile di
disponibilità.

6.3 Il Cliente può verificare autonomamente lo stato del Servizio su
`GET /api/readyz`, che restituisce **soltanto** «pronto/non pronto» senza
credenziali.
