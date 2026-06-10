# Deliverable — Fascicolo tecnico e checklist di conformità (EN 81-20/50)

Guida alla documentazione e alle verifiche per portare a conformità il quadro di
manovra (geared / idraulico). Checklist machine-readable in
[`../config/checklist-collaudo.csv`](../config/checklist-collaudo.csv).

> ⚠️ Documento di supporto **didattico**. La conformità formale, la marcatura CE e la
> messa in servizio competono al **fabbricante/installatore** e devono essere validate
> da **tecnico abilitato** e verificate secondo **DPR 162/1999 e s.m.i.**. Le funzioni
> di sicurezza richiedono componenti con **certificato di esame UE del tipo**.

---

## 1. Quadro normativo applicabile

| Norma / disposizione | Ambito |
|----------------------|--------|
| **Direttiva 2014/33/UE** (Ascensori) | recepita in Italia con D.Lgs. 17/2010 |
| **EN 81-20:2020** | requisiti di sicurezza costruzione/installazione |
| **EN 81-50:2020** | regole di progetto, calcoli, esami e prove dei componenti |
| **EN 81-80** (SNEL) | analisi del rischio su impianti esistenti |
| **UNI 10411-1/-2** | modifiche ad ascensori esistenti (modernizzazione) |
| **EN 12015 / EN 12016** | EMC (emissione / immunità) per ascensori |
| **DPR 162/1999 e s.m.i.** | messa in esercizio e verifiche periodiche in Italia |

---

## 2. Indice del FASCICOLO TECNICO (technical file)

1. Descrizione generale dell'impianto e del quadro (tipologia geared/idraulico).
2. **Analisi del rischio** (EN 81-20/50 per nuovo; EN 81-80 + UNI 10411 per esistente).
3. **Schemi**: potenza, catena di sicurezza, I/O PLC, morsettiera/cavi
   (vedi `../schemi/` e `../cad/`).
4. **Distinta materiali** con codici e certificati (vedi `05-distinta-materiali.md`).
5. **Certificati di esame UE del tipo** dei componenti di sicurezza:
   - relè di sicurezza -KA-SIC
   - dispositivo UCM/A3 (rope brake o valvola di blocco)
   - limitatore di velocità, paracadute / valvola di blocco rottura tubo
   - serrature porte
6. **Software PLC**: listati ST (`../plc/`), descrizione macchina a stati
   (`../plc/docs/architettura-sw.md`), evidenza che il PLC gestisce **solo** manovra.
7. **Report di simulazione/test** della logica (`../sim/`, 11 test superati).
8. **Calcoli**: protezioni, sezioni cavi, dimensionamento freno/valvole.
9. **Dichiarazione di conformità EMC** (EN 12015/12016).
10. **Manuale di uso e manutenzione** + istruzioni parametri (safety/non-safety).
11. **Verbali di prova e collaudo** (checklist §4).
12. **Dichiarazione di conformità UE** + documentazione marcatura **CE**.

---

## 3. Procedura di valutazione della conformità

Per il quadro come **componente di sicurezza** (relè/UCM) e per l'ascensore completo,
selezionare uno dei moduli previsti dalla Dir. 2014/33/UE, es.:
- **Modulo B** (esame UE del tipo) + **Modulo D/E/F** (garanzia qualità/verifica), o
- **Modulo H** (garanzia qualità totale) per il fabbricante strutturato.
Per impianto esistente modernizzato: applicare **UNI 10411** e verifica ex DPR 162/99.

---

## 4. Checklist di collaudo (estratto)

Esito da compilare: `OK` / `NC` (non conforme) / `NA`. Lista completa nel CSV.

### Sicurezza
- [ ] **C01–C03** Catena di sicurezza in serie, apertura positiva, relè a contatti
  guidati con auto-monitoraggio (prova guasto singolo).
- [ ] **C04** UCM/A3: arresto a porte aperte fuori zona di livellamento.
- [ ] **C05–C06** Limitatore di velocità e paracadute (geared) / valvola di blocco
  rottura tubo (idraulico): intervento alla soglia.
- [ ] **C07–C08** Velocità ispezione ≤ 0,63 m/s e rilivellamento ≤ 0,30 m/s.
- [ ] **C09–C10** Serrature porte (chiusura + blocco) e bypass solo con dispositivo
  monitorato dedicato.
- [ ] **C11–C12** Continuità di terra (< 0,5 Ω) e rigidità dielettrica.
- [ ] **C13** Extracorsa superiore/inferiore.

### Funzionale (logica PLC — riscontrabile anche in `../sim/`)
- [ ] **C14** Partenza/arresto al piano con livellamento.
- [ ] **C15** Porte: apertura/chiusura, fotocellula, tempo di attesa.
- [ ] **C16** Sovraccarico: blocco partenza + segnalazione.
- [ ] **C17** Revisione a uomo presente, bassa velocità.
- [ ] **C18** Chiamate collettiva selettiva nell'ordine corretto.
- [ ] **C19–C20** Idraulico: avviamento Y/Δ; discesa per gravità a pompa ferma.
- [ ] **C21** Mancanza rete: riporto/discesa di emergenza al piano.
- [ ] **C22** Allarme bidirezionale e comunicazione cabina.

### EMC, documentazione, cybersecurity
- [ ] **C23** EMC EN 12015/12016.
- [ ] **C24–C25** Dichiarazione UE + marcatura CE; verbale verifica DPR 162/99.
- [ ] **C26–C27** Parametri safety non modificabili via wireless (gate chiave); WiFi in
  AP locale WPA2/WPA3 senza esposizione a internet.

---

## 5. Tracciabilità test funzionali ↔ simulazione

Diversi punti funzionali sono pre-verificati nella suite `../sim/test_ascensore.py`:

| Checklist | Test di simulazione |
|-----------|---------------------|
| C14 | `test_partenza_e_arrivo` |
| C15 | (sequenza porte nei test di corsa) |
| C16 | `test_sovraccarico_blocca_partenza` |
| C17 | `test_revisione_uomo_presente` |
| C18 | `test_collettiva_due_chiamate` |
| C19 | `test_salita_sequenza_stella_triangolo` |
| C20 | `test_discesa_per_gravita` |
| C04/C13 (parziale) | `test_emergenza_ferma_la_manovra`, `test_guasto_termico` |

> La simulazione è verifica **logica** preliminare; non sostituisce le prove fisiche
> sull'impianto previste dalla checklist.

---

## 6. Modello di Dichiarazione di Conformità UE (sintesi)

```
DICHIARAZIONE DI CONFORMITA' UE
Il fabbricante: ........................................
dichiara sotto la propria responsabilita' che il quadro di manovra
modello: ............  matricola: ............  anno: ............
e' conforme alla Direttiva 2014/33/UE e alle norme EN 81-20:2020,
EN 81-50:2020, EN 12015, EN 12016.
Componenti di sicurezza con esame UE del tipo: rif. certificati allegati.
Organismo Notificato (se applicabile): n. ........  modulo: ........
Luogo, data .........        Firma del responsabile .........
```

---

## 7. Esito

Il fascicolo è completo quando: tutti gli `NC` della checklist sono chiusi, i
certificati dei componenti di sicurezza sono allegati, la marcatura CE è apposta e
il verbale di verifica (DPR 162/99) è positivo.
