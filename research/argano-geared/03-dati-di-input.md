# 3. Dati di input

[← Indice](README.md)

Principio: chiedere solo ciò che entra in almeno una verifica del capitolo 4, e dire
all'utente *perché* lo si chiede. Ogni campo ha unità, intervallo ammesso e, se ha un
default, la sua origine. Il wizard (capitolo 7.7) segue questi gruppi.

## 3.1 Impianto

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Tipo di impianto | persone · merci accompagnate | sì | determina casi di carico e area utile della cabina |
| Contesto | impianto nuovo · sostituzione dell'argano su impianto esistente | sì | cambia il percorso normativo (capitolo 2.4) e i vincoli di ingombro |
| Portata Q | kg | sì | > 0; persone = ⌊Q/75⌋; coerenza con l'area utile (EN 81-20 tabella 6: 450 kg → 1,30 m², 630 kg → 1,66 m², 1000 kg → 2,40 m²) ⚠️ |
| Area utile della cabina | m² | per impianti per persone | confronto con la tabella 6 |
| Massa della cabina completa P | kg | sì | > 0; negli impianti esistenti spesso stimata → analisi di sensibilità ±10% (capitolo 6.9) |
| Bilanciamento k *oppure* massa del contrappeso | — / kg | sì | tipicamente vicino a 0,5; valore di progetto, non normativo |
| Velocità nominale v | m/s | sì | > 0; oltre il campo del catalogo nessuna macchina risulta ammissibile |
| Corsa H · numero di fermate | m · — | sì | H > 0; fermate ≥ 2 |
| Ammortizzatori | ad accumulo · a dissipazione · a corsa ridotta | sì | decide la decelerazione di verifica in frenatura (0,5 o 0,8 m/s²) ⚠️ |
| Accelerazione di progetto | m/s² | no | default dichiarato e mostrato come “ipotesi” nel report |

## 3.2 Sospensione e funi

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Taglia r | 1:1 · 2:1 | sì | 4:1 e oltre in una fase successiva |
| Numero di funi n | — | sì | ≥ 2 ⚠️; con 2 funi il minimo del coefficiente di sicurezza passa da 12 a 16 ⚠️ |
| Diametro nominale d | mm | sì | ≥ 8 mm salvo approvazione di un organismo notificato ⚠️ |
| Costruzione e grado | es. 8×19 Seale anima tessile, 1570 o 1370/1770 N/mm² | sì | da elenco (ISO 4344:2022, EN 12385-5:2021) |
| Carico di rottura minimo F_min | kN | sì | dalla scheda del fornitore; mai stimato dal software senza avviso |
| Massa lineare q_f | kg/m | sì | dalla scheda del fornitore |
| Compensazione | nessuna · catene · funi, massa lineare | no | necessaria per corse lunghe; entra nei tiri e nella potenza |
| Cavo flessibile | kg/m, punto di attacco | no | entra nei tiri lato cabina |

## 3.3 Geometria della trazione

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Posizione della macchina | in alto · in basso laterale | sì | cambia lunghezze delle funi, pulegge e flessioni |
| Pulegge di rinvio | numero, diametro, flessione semplice o inversa | sì (anche “nessuna”) | alimentano N_equiv(p); la regola su quando una flessione è “inversa” viene dalla norma ⚠️ |
| Angolo di avvolgimento α | gradi | sì | inserito o calcolato dalle quote (distanza funi cabina–contrappeso, posizione del rinvio); 180° senza rinvio |
| Profilo della gola | semicircolare · con sottosquadro (β, γ) · a V (γ, temprata sì/no) | se la macchina è inserita a mano | per le macchine a catalogo viene dal catalogo |
| Stato delle gole | nuove · usurate (β misurato) | no | negli impianti esistenti l'usura riduce β e quindi l'aderenza |

## 3.4 Servizio e azionamento

| Campo | Unità | Obbligatorio | Validazione / nota |
|---|---|---|---|
| Avviamenti all'ora | 1/h | sì | confronto con i dati del motore e del riduttore |
| Rapporto di intermittenza | % | sì | servizio S3/S4/S5 secondo IEC 60034-1 |
| Alimentazione | V, Hz, fasi | sì | filtra i motori del catalogo |
| Azionamento | VVVF · due velocità (solo verifica di impianti esistenti) | sì | con VVVF la velocità si corregge in frequenza (capitolo 4.3) |
| Temperatura del locale macchina | °C | no | declassamento termico se il costruttore lo prevede |

## 3.5 Sicurezza e soccorso

| Campo | Valori | Nota |
|---|---|---|
| Soluzione UCMP e protezione in salita | freno sull'albero della puleggia · freno sulle funi · paracadute bidirezionale · da proporre | se il freno della macchina agisce sull'albero motore serve un dispositivo esterno (capitolo 4.10) |
| Decelerazione media del paracadute installato | m/s² | limite per la verifica della decelerazione massima del freno |
| Manovra di emergenza | manuale (volantino, raggio) · elettrica | se la forza al volantino supera 400 N serve quella elettrica ⚠️ |

## 3.6 Vincoli e preferenze

- Produttori ammessi; macchine fuori produzione ammesse solo per la verifica di impianti esistenti.
- Ingombri massimi e interasse di fissaggio (sostituzione su basamento esistente).
- Massa massima della macchina (portata del solaio del locale macchina).
- Lato di uscita delle funi, lato della puleggia (destra/sinistra), posizione di montaggio.
- Criterio di ordinamento: margine minimo, costo, rendimento, massa (capitolo 6.6).

## 3.7 Regole di coerenza tra campi

Implementate come `refine` dello schema zod, con messaggio che indica il campo da correggere:

- `k·Q` e massa del contrappeso non possono essere entrambi inseriti in modo incoerente.
- Taglia 2:1 con macchina in basso: sono richieste le pulegge di rinvio in testata.
- Persone = ⌊Q/75⌋ e area utile compatibile con la tabella della norma, se l'impianto è per persone.
- Diametro della fune compatibile con almeno una puleggia del catalogo, altrimenti avviso
  immediato (non un elenco vuoto senza spiegazione).

## 3.8 Che cosa non si chiede all'utente

Tutto ciò che si ricava: contrappeso, masse delle funi per lato, giri della puleggia,
rapporto ideale, tiri, fattori di gola, N_equiv, coppie e potenze. Il report le mostra come
grandezze calcolate, con la formula.
