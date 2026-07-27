# Allegato 1 — Listino e offerta

> Търговски документ, не правен. Числата са **предложение** върху стойността за
> клиента, не върху себестойността. Обосновката е в края — тя е за нас, не за
> клиента.

---

## 1. Come si misura

Il corrispettivo è parametrato al numero di **impianti in anagrafica**, non al
numero di utenti.

**Gli utenti sono illimitati.** Un listino a utente punirebbe l'azienda che
mette il gestionale in mano ai tecnici sul campo — che è esattamente l'uso che
lo rende utile. Gli impianti, invece, misurano il portafoglio: il valore che il
gestionale amministra.

## 2. Servizio ospitato (SaaS)

| Fascia | Impianti | Canone mensile | Canone annuale | Avviamento |
|---|---|---|---|---|
| **A** | fino a 200 | € 149 | € 1.788 | € 1.500 |
| **B** | 201 – 600 | € 299 | € 3.588 | € 2.500 |
| **C** | 601 – 1.500 | € 499 | € 5.988 | € 3.500 |
| **D** | oltre 1.500 | da € 749 | a preventivo | da € 5.000 |

Prezzi IVA esclusa. Pagamento anticipato. **Due mensilità in omaggio** con
pagamento annuale anticipato.

**L'avviamento comprende:** installazione e configurazione; importazione delle
anagrafiche esistenti (clienti, condomini, amministratori, impianti, contratti,
articoli di magazzino) da file; configurazione dei livelli di accesso e degli
utenti; generazione delle etichette QR per gli impianti; **mezza giornata di
formazione** in videoconferenza o in sede.

## 3. Installazione presso il Cliente (on-premise)

| Impianti | Licenza perpetua | Manutenzione annua (obbligatoria) |
|---|---|---|
| fino a 600 | € 9.000 | € 1.800 (20 %) |
| fino a 1.500 | € 14.000 | € 2.800 (20 %) |
| oltre 1.500 | a preventivo | 20 % |

La manutenzione annua comprende aggiornamenti (incluso l'adeguamento normativo),
correzioni e assistenza secondo l'SLA. **Non è facoltativa**: senza di essa il
gestionale resta alla versione del giorno dell'acquisto, mentre la normativa no.

L'infrastruttura, i backup e la loro verifica restano a carico del Cliente.

## 4. Voci opzionali

| Voce | Prezzo |
|---|---|
| Giornata di formazione aggiuntiva (in sede) | € 600 + trasferta |
| Importazione da gestionale esistente con mappatura personalizzata | a preventivo, da € 800 |
| Compilazione assistita da modello linguistico | nessun sovrapprezzo — chiave del Cliente, vedi § 5 |
| Sviluppo su misura | € 90/ora |
| Ripristino su richiesta del Cliente (errore proprio) | € 250 a intervento |

## 5. Funzione di compilazione assistita

Disattivata per impostazione predefinita. **La chiave è sempre del Cliente**: è
lui a stipulare il contratto con il fornitore del modello e a inserire la
propria chiave nella configurazione della sua installazione. **Nessun
sovrapprezzo da parte nostra.**

Perché così e non a consumo: con la nostra chiave il fornitore del modello
diventerebbe nostro sub-responsabile senza l'autorizzazione di alcun titolare
(art. 28 par. 2 GDPR), e la scelta della finalità e dei mezzi ci renderebbe
**titolari** ai sensi dell'art. 28 par. 10 — con responsabilità diretta su un
trattamento che è del Cliente.

**Costo indicativo per il Cliente**, con il modello predefinito
(Claude Haiku 4.5, $1 / $5 per milione di token in ingresso / in uscita):
circa **0,4 centesimi di euro per documento** letto — una foto della targhetta,
un verbale scansionato. Mille documenti al mese costano al Cliente meno di
4 euro. L'attivazione richiede accordo scritto e l'aggiornamento del DPA.

## 6. Che cosa è compreso — e che cosa non lo è

**Compreso:** anagrafiche complete; ordini di lavoro con flusso a stati;
rapportini di intervento con firma del referente sul posto; verifiche periodiche
e scadenzario normativo; contratti di manutenzione con generazione automatica di
visite e fatture; magazzino con movimenti; preventivi, ordini, DDT, fatture,
pagamenti, solleciti con calcolo degli interessi di mora; **predisposizione del
file XML FatturaPA 1.2.2**; pacchetto ordinato per il conservatore; redditività
per contratto e per impianto; cruscotto configurabile; accesso da telefono per i
tecnici con etichetta QR sull'impianto; registro immodificabile delle
operazioni; API pubblica e webhook.

**Non compreso — e va detto prima della firma:**

- **la trasmissione allo SdI**: il gestionale prepara il file, il Cliente lo
  trasmette con il proprio canale (PEC, intermediario, portale Fatture e
  Corrispettivi) e registra l'esito;
- **la firma digitale** dei documenti;
- **la conservazione a norma**: è un servizio del conservatore, sotto la
  responsabilità del responsabile della conservazione;
- la contabilità generale e le dichiarazioni fiscali;
- la gestione delle paghe.

## 7. Offerta di lancio — primi tre clienti

**Canone gratuito per 12 mesi**, avviamento € 1.500, a fronte di:

- referenza scritta utilizzabile in ambito commerciale;
- autorizzazione all'uso del nome e del marchio come cliente;
- disponibilità a una chiamata di riscontro al mese per i primi sei mesi.

Al termine dei 12 mesi si applica il listino della fascia corrispondente, con
**sconto del 25 % a vita** sul canone.

---

# Modello di offerta

**Spett.le «Ragione sociale»** — «indirizzo» · P.IVA «…»
Offerta n. «…» del «data» · Validità: **30 giorni**

| Voce | Q.tà | Prezzo unitario | Totale |
|---|---|---|---|
| ERP Ascensori Enterprise — canone annuo, fascia «X» («N» impianti) | 1 | € «…» | € «…» |
| Avviamento: installazione, importazione anagrafiche, formazione | 1 | € «…» | € «…» |
| «voce opzionale» | | | |
| **Imponibile** | | | **€ «…»** |
| IVA 22 % | | | € «…» |
| **Totale** | | | **€ «…»** |

**Modalità di pagamento:** avviamento alla sottoscrizione; canone anticipato
annuale a 30 giorni data fattura.
**Tempi di attivazione:** «N» giorni lavorativi dalla consegna dei dati.
**Documenti allegati:** contratto di licenza e servizio, SLA, condizioni di
assistenza, accordo sul trattamento dei dati (art. 28 GDPR).

**Precisazione, resa espressamente prima della sottoscrizione:** il gestionale
**predispone** il file XML della fattura elettronica e ne verifica i requisiti;
**non emette, non firma, non trasmette allo SdI e non effettua la conservazione
a norma.** Tali attività restano a carico del Cliente o del suo intermediario.

---

## Nota interna — perché questi numeri

Non è materiale da consegnare al cliente.

**Ancoraggio al valore, non al costo.** Un'azienda con 500 impianti fattura
€ 100–150 mila l'anno di soli canoni di manutenzione. Il gestionale toglie
all'ufficio circa mezza persona di lavoro (€ 12–15 mila di costo aziendale) e
abbassa il rischio di una verifica periodica scaduta — che non è una multa, è
una responsabilità. € 3.588 l'anno sono il 2–3 % di ciò che risparmia: una
conversazione facile.

**Perché non di più.** Manca la trasmissione allo SdI e la conservazione a
norma. Non è un difetto — è dichiarato — ma è una differenza di prezzo rispetto
a chi le ha. Quando entra un canale reale di trasmissione, il listino sale del
**30 %**: è il modo più economico di aumentare il prezzo di questo prodotto.

**Perché non di meno.** Un canone sotto i € 100 al mese attrae il cliente che
tratta il gestionale come un abbonamento da disdire, non come lo strumento su
cui gira l'azienda. E rende l'avviamento — che è lavoro vero — una perdita.

**Perché l'avviamento si paga sempre.** L'importazione delle anagrafiche è la
parte che determina se il cliente resterà. Regalata, viene fatta male da
entrambe le parti.

**Sulla fascia D.** Sopra i 1.500 impianti cambia il profilo tecnico: numero di
utenti simultanei, dimensione dei backup, tempi di ripristino. Prima di
proporre, verificare che l'SLA sia mantenibile.
