# Deliverable 1 — Schemi elettrici (geared / idraulico)

Gli schemi professionali sono nei file SVG in [`../schemi/`](../schemi/) (formato A4
con cartiglio). **Sistemi gearless esclusi**: si coprono solo argano con riduttore
(geared) e idraulico.

| Foglio | File | Contenuto |
|:------:|------|-----------|
| 1/4 | [`schemi/potenza-geared.svg`](../schemi/potenza-geared.svg) | Potenza argano 2 velocità (Dahlander), variante VVVF, freno, UCM/A3 |
| 2/4 | [`schemi/potenza-idraulico.svg`](../schemi/potenza-idraulico.svg) | Potenza centralina, Y/Δ o soft-starter, blocco valvole, rupture valve, A3 |
| 3/4 | [`schemi/catena-sicurezza.svg`](../schemi/catena-sicurezza.svg) | Catena di sicurezza cablata (comune ai due impianti) |
| 4/4 | [`schemi/io-plc.svg`](../schemi/io-plc.svg) | I/O del PLC di manovra + interfaccia modulo WiFi |

Convenzioni sigle: `-Qx` protezioni, `-KMx` contattori, `-KAx` relè, `-Sx` contatti
sicurezza, `-Bx` sensori, `-EVx` elettrovalvole, `-Tx` alimentatori, `-Xx` morsettiere.

---

## 1. Impianto GEARED (argano con riduttore)

- **Motore a 2 velocità (Dahlander)**: avvolgimento ALTA per la marcia, BASSA per
  avvicinamento e livellamento. Contattori `-KM-S/-KM-D` (direzione, interbloccati) +
  `-KM-V/-KM-L` (velocità).
- **Variante VVVF**: inverter a monte del motore asincrono; si eliminano `-KM-V/-KM-L`
  (velocità gestita dall'inverter), restano i contattori di direzione/abilitazione e
  la resistenza di frenatura sul bus DC.
- **Freno** elettromeccanico a **doppio circuito** con microcontatti `-S-FRE`
  retroazionati → base della funzione **UCM/A3**.
- **UCM/A3**: doppio freno validato come elemento di arresto **oppure** dispositivo
  esterno (rope brake), con certificato di esame UE del tipo.

## 2. Impianto IDRAULICO

- **Salita**: pompa avviata in **stella-triangolo** (`-KM-P/-KM-Y/-KM-Δ`) o
  **soft-starter** + apertura **valvola di salita** `-EV-S`.
- **Discesa**: per **gravità** aprendo la **valvola di discesa** `-EV-D`, pompa ferma.
- **Sicurezze idrauliche**: **valvola di blocco** (rupture valve) contro la caduta per
  rottura tubo; **termostato olio** e **pressostato di minima** `-S-MINP`.
- **A3 idraulico**: protezione discesa (valvola di blocco / pawl device) +
  **anti-deriva elettrico** (re-livellamento) per cedimento olio a porte aperte.
- **Discesa di emergenza**: valvola manuale a uomo presente per riporto al piano in
  mancanza rete (non richiede UPS di trazione).

## 3. CATENA DI SICUREZZA (comune)

Vedi foglio 3/4. Tutti i contatti ad **apertura positiva** in serie (EN 81-20 §5.11):
arresti di emergenza fossa/tetto, ispezione, extracorsa, limitatore, paracadute
(geared) / valvola di blocco (idraulico), serrature di piano + porta cabina. La serie
termina su **relè di sicurezza a contatti guidati certificato** (`-KA-SIC`), che
abilita le bobine di marcia. Il **PLC legge** lo stato ma **non** sostituisce la catena.

## 4. Logica di manovra (PLC)

La logica è nel software [`../plc/`](../plc/) (IEC 61131-3 ST, portabile S7-1200/
Codesys). I/O secondo foglio 4/4 e `plc/src/GVL_IO.st`. Il PLC gestisce **solo** la
manovra; nessuna funzione di sicurezza è demandata al software.

## 5. Distinta materiali e budget

BOM nelle tabelle del [README principale](../README.md): **≈ 1.230 €** (geared 2V) e
**≈ 1.360 €** (idraulico), entrambe sotto i 1.700 €.

## 6. Iter di conformità

1. Analisi del rischio (EN 81-20/50 nuovo; UNI 10411 + EN 81-80 esistente).
2. Componenti di sicurezza con certificato esame UE del tipo + DoC.
3. Fascicolo tecnico + marcatura CE del quadro.
4. Verifica/collaudo: Organismo Notificato o, su esistente, **DPR 162/1999 e s.m.i.**
5. Schema as-built, manuale uso/manutenzione, dichiarazione del progettista.
