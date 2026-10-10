# 6. Sostituzione dell'argano: il flusso principale

[← Indice](README.md)

L'uso principale del software è sostituire un argano vecchio con uno nuovo su un impianto
esistente. Rispetto a un impianto nuovo cambiano tre cose: molti dati sono misurati o stimati,
non di progetto; restano in servizio componenti di sicurezza e strutture esistenti; il percorso
normativo è quello del DPR 162/1999 e della UNI 10411-1:2024 (capitolo 2.4). L'obiettivo è
mantenere ciò che si può mantenere, a partire da velocità e portata, e dimostrare che la nuova
macchina è adeguata.

## 6.1 Il flusso in sette passi

1. **Rilievo in cantiere** con una lista guidata nel wizard, foto delle targhe allegate (6.2).
2. **Ricostruzione dell'impianto**: masse, bilanciamento, disposizione in alto o in basso,
   percorso delle funi, geometria e angolo di avvolgimento (capitolo 5).
3. **Calcolo dell'argano esistente** con lo stesso motore: velocità reale, aderenza, funi,
   potenza. Serve come controllo dei dati (6.4).
4. **Selezione del nuovo argano** (capitolo 8) con i vincoli dell'impianto: stessa velocità
   nominale, stesso numero e diametro delle funi, ingombri e fissaggi, uscita delle funi, lato
   della puleggia, massa e ancoraggio.
5. **Confronto vecchio/nuovo** in una tabella (esempio nel capitolo 7.3).
6. **Adeguamenti richiesti** dalla UNI 10411-1 per la sostituzione del macchinario (6.6).
7. **Report** per l'adeguamento e per la verifica straordinaria, con ogni dato marcato come
   “da targa”, “misurato” o “stimato”.

## 6.2 Rilievo: che cosa serve e come si ottiene

| Dato | Come si ottiene | Affidabilità | Entra in |
|---|---|---|---|
| Portata, numero di persone | targa in cabina, libretto | alta | tutto |
| Massa della cabina P | libretto o documentazione; altrimenti stima | spesso bassa | aderenza, albero, potenza; sensibilità ±10% |
| Massa del contrappeso | numero e peso dei blocchi più telaio, oppure P + carico di equilibrio (6.3) | media | aderenza, albero, potenza |
| Velocità nominale | targa; misura con tachimetro; calcolo dai dati dell'argano | alta | cinematica (6.5) |
| Motore esistente | targa: kW, poli (anche doppia polarità, es. 4/16), giri, tensione, corrente | alta | velocità reale, confronto |
| Rapporto di riduzione | targa del riduttore, o conteggio di principi della vite e denti della corona | alta | velocità reale |
| Puleggia esistente | diametro primitivo misurato, numero e profilo delle gole, usura | media | baseline, confronto |
| Funi | numero, diametro misurato, costruzione, stato | media | baseline; di norma si sostituiscono con l'argano con funi nuove dello stesso numero e diametro, che diventano un vincolo della selezione |
| Disposizione e rinvii | schizzo quotato: posizione della macchina, diametri e posizioni delle pulegge, altezze | media | capitolo 5 |
| Corsa, fermate, testata, fossa | libretto e misura | alta | masse delle funi, lunghezze |
| Freno esistente | tipo, numero di elementi meccanici, volano | alta | confronto, adeguamenti |
| Componenti di sicurezza | limitatore (velocità di intervento), paracadute, ammortizzatori: targhe e certificati | alta | compatibilità (6.5) |
| Locale macchina | spazio, accessi, basamento e interassi di fissaggio, ancoraggi; portata del solaio se in alto | media | vincoli di selezione, sollevamento netto se in basso |
| Quadro e azionamento | esistente o nuovo, presenza di inverter | alta | adeguamenti UNI 10411-1 (6.6) |

## 6.3 Masse e bilanciamento: il punto debole del rilievo

- La **prova di bilanciamento** con pinza amperometrica stima indirettamente il bilanciamento:
  si carica la cabina e si confrontano le correnti assorbite in salita e in discesa (SAMA Tools)
  ⚠️. Il carico con cui le due correnti si equivalgono, misurato a metà corsa dove le funi si
  bilanciano, è il **carico di equilibrio** Q_eq; con un inverter si legge la corrente o la coppia
  sul drive.
- La prova dà la **differenza** tra contrappeso e cabina (M_cw ≈ P + Q_eq), non le masse assolute.
  L'aderenza dipende anche da P in assoluto: la massa della cabina resta un dato da documentare
  o stimare, con l'analisi di sensibilità del capitolo 8.9.

## 6.4 L'argano esistente come controllo dei dati

L'impianto funziona da anni con l'argano vecchio. Se il modello, con i dati rilevati, dice che
l'argano vecchio non ha aderenza o che il motore esistente è molto sottodimensionato, è più
probabile un dato sbagliato (massa della cabina, bilanciamento, rapporto) che un impianto
impossibile. Il software lo segnala come **incoerenza da risolvere prima della selezione**. Non è
una prova: un impianto vecchio può anche essere fuori norma, e allora la segnalazione diventa un
adeguamento.

## 6.5 Velocità, poli e componenti che restano

- **Velocità**: il DPR 162/1999 elenca “il cambiamento della velocità” tra le modifiche
  costruttive, e limitatore, paracadute e ammortizzatori esistenti sono scelti per la velocità
  nominale. Il selettore mantiene quindi la velocità nominale dell'impianto: la velocità reale
  del nuovo argano è confrontata con quella nominale, e l'inverter corregge la differenza residua
  in frequenza (capitolo 4.3).
- **Poli**: i vecchi motori a due velocità hanno doppia polarità (per esempio 4/16 poli,
  opzione che compare in una pagina storica Sassi ⚠️); nel calcolo della velocità conta
  l'avvolgimento veloce con i suoi giri di targa. Il nuovo motore con inverter è per esempio a
  4 poli (Sassi MODY). Velocità sincrona:
  `n_s = 120 · f / poli` (1500 giri/min per 4 poli a 50 Hz); i giri di targa sono inferiori per
  lo scorrimento.
- **Componenti che restano**: se la velocità nominale non cambia, limitatore, paracadute e
  ammortizzatori restano nel loro campo; il software lo verifica comunque contro i dati di targa
  inseriti. Le pulegge di rinvio esistenti devono essere compatibili con il diametro delle funi
  nuove (rapporto D/d) e in buono stato.
- **Funi**: nella sostituzione si scelgono di norma funi nuove con lo stesso numero e lo stesso
  diametro di quelle montate (indicazione di Panev Ascensori). Attacchi e pulegge di rinvio
  restano così compatibili, e il rapporto D/d dei rinvii non cambia; cambiano invece D/d e
  aderenza sulla puleggia nuova, che il software verifica con quelle funi. Il calcolatore le
  tiene fisse anche nella proposta, con una riga per ogni diametro di puleggia che passa; con il
  catalogo servono pulegge con gole per quel diametro e almeno quel numero di gole (8.4). Se con
  le funi esistenti nessuna configurazione passa lo dice, e solo togliendo la spunta mostra
  proposte con funi diverse (esempio nel capitolo 7.3).
- **Calate con tiro diretto**: attacchi di cabina e contrappeso e fori nella soletta restano; se
  la puleggia nuova ha un diametro diverso le calate si spostano e le funi si inclinano. Il
  software calcola lo spostamento e l'angolo di avvolgimento che ne risulta (5.3).

## 6.6 Adeguamenti per la sostituzione del macchinario (UNI 10411-1)

Dalle sintesi pubblicate della UNI 10411-1:2021 ⚠️ (edizione superata dalla 2024, che introduce
novità anche su carico statico, velocità e sostituzione di componenti: da verificare sul testo
in vigore). Per la sostituzione della macchina sono richiesti:

- freno con tutti gli elementi meccanici che agiscono sulla superficie frenante installati in
  almeno due esemplari; se uno non agisce, l'altro deve rallentare, arrestare e tenere ferma la
  cabina **in discesa a velocità nominale con la portata e in salita a vuoto**;
- un temporizzatore di corsa massima;
- un dispositivo elettrico di sicurezza che controlla l'eccesso di velocità in salita;
- un dispositivo di arresto in prossimità della macchina (entro 1 m);
- un dispositivo che interrompe l'alimentazione del macchinario se entrambi gli elementi del freno
  non si aprono, richiesto solo in assenza di protezione contro i movimenti incontrollati della
  cabina a porte aperte e quando l'impianto ha un dispositivo che controlla il rallentamento.

Ricerca del 2 ottobre 2026 (capitolo 2.4.1): il testo 2024 sul macchinario non è stato trovato; la lista qui sopra
resta quella della 2021. Un estratto non attribuito aggiunge che anche un nuovo inverter senza protezione UCMP
richiede il freno in due elementi ⚠️. Per un impianto **conforme** alla direttiva vale la UNI 10411-11:2024, i cui
requisiti per la sostituzione del macchinario non sono stati trovati: il software lo dichiara nella relazione.

Conseguenza per il software: nella sostituzione il **profilo normativo è la UNI 10411-1** con i
suoi rimandi a EN 81-20, non l'intero EN 81-20 degli impianti nuovi; la regola del capitolo 4.10
(freno sull'albero motore ammesso solo con dispositivo esterno per UCMP) vale per gli impianti
nuovi e va sostituita, nella sostituzione, dalla lista di adeguamenti qui sopra. Il report elenca
per ciascun adeguamento se è già presente, se arriva con il nuovo argano o se va aggiunto.

## 6.7 Che cosa esce dal flusso

- tabella di confronto vecchio/nuovo (velocità, aderenza, funi, potenza, freno, soccorso, albero e
  ancoraggio);
- elenco degli adeguamenti con il loro stato;
- report tracciabile per l'adeguamento secondo UNI 10411-1 e per la verifica straordinaria, con i
  dati del rilievo separati da quelli della nuova macchina.
