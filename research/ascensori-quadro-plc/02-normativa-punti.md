# 02 — Normativa: punti e valori che governano il quadro di manovra a PLC

_Data: 2026-10-07 · Fonte: base privata `norme-ascensori` (clonata in sessione; i puntatori `file:riga` sono relativi a quel repository)._

**Regola di questo documento.** La licenza UNI/CEN ammette solo uso interno e questo repository è pubblico: qui compaiono
**soltanto sigla, edizione, numero di punto, termine tecnico e valore**, più il puntatore alla nota privata. Nessuna frase,
tabella o figura delle norme. Per il contenuto leggere la nota indicata. Il giudizio di conformità è del progettista,
dell'installatore (che firma la dichiarazione) e dell'organismo di verifica.

## 0. Quale norma vale (ottobre 2026)

| Caso | Riferimento | Nota |
|---|---|---|
| **Impianto nuovo** (elettrico a funi con argano geared, idraulico) | UNI EN 81-20:2020 + UNI EN 81-50:2020 | `uni-en-81-20-2020.md:10`, `uni-en-81-50-2020.md:10` |
| Nuovo in edificio esistente con testata/fossa ridotte | UNI EN 81-21:2022 in aggiunta | `uni-en-81-21-2022.md:10` |
| **Modernizzazione, elettrico a frizione senza CE** | UNI 10411-1:2024 | `uni-10411-1-2024.md:33` |
| Modernizzazione, idraulico senza CE | UNI 10411-2:2024 | `uni-10411-2-2024.md:26` |
| Modernizzazione, elettrico a frizione con CE | UNI 10411-11:2024 | `uni-10411-11-2024.md:34` |
| Modernizzazione, idraulico con CE | UNI 10411-12:2024 | `uni-10411-12-2024.md:28` |
| Edizione «del tempo» per impianti con CE 1999–2017 | UNI EN 81-1:2008, UNI EN 81-2:2008 (= 1998 + A1 + A2; **senza A3**) | A3 solo da presentazione di settore |
| Successore di EN 81-20/50 | EN ISO 8100-1/-2:2026 | **non appresa**; fino alla fine della transizione vale la 81-20/50:2020 |

Le quattro parti di UNI 10411:2024 si applicano dal 31/10/2024; il periodo transitorio di 12 mesi è scaduto il 31/10/2025
(`uni-10411-1-2024.md:37`). **Lacune dichiarate:** argano a tamburo senza CE (nessuna parte 10411 appresa), EN 81-28:2022,
EN 81-70:2021+A1:2022, EN 81-73:2020, EN 81-71:2022, EN 60204-1, EN 61800-5-2, EN 61508, EN 12015/12016, testo coordinato del
DPR 162/1999, Legge 13/1989 (vedi sezione 12).

## 1. Che cosa può fare il PLC standard e che cosa no

| Funzione | Può farla un PLC **standard**? | Punti |
|---|---|---|
| Manovra normale, chiamate, collettiva, 12→24 fermate, display, gong, voce | **Sì** (nessun limite al numero di fermate nei testi) | 81-20 5.12.1.1.3 `:1099`, 5.12.4.3 `:1153` |
| Comando porte e tempi | **Sì**, con forze/energie nell'operatore | 81-20 5.12.4.1/.2 `:1151`; 81-70 5.2.3 `:144` |
| Blocco per sovraccarico | **Sì** (non è in prosp. A.1) | 81-20 5.12.1.2 `:1101` |
| Limitatore di tempo del motore | **Sì** se toglie energia tramite gli organi di potenza, con riarmo manuale; consigliato cablato | 5.9.2.7 `:873`, 5.9.3.10 `:987` |
| Antideriva elettrico (idraulico), richiamo per sovratemperatura | **Sì** | 5.12.1.10 `:1131`, 5.10.4.3/.4 `:1023` |
| Manovra antincendio | **Sì**, con ingresso a sicurezza intrinseca | 81-73 5.2.1 `:78`, 5.3 `:84–98` |
| Sorveglianza dei contatti dei contattori | Solo se l'analisi dei guasti regge (decide l'organismo) | 5.9.2.6 `:872`, 5.9.3.4.4 `:943` |
| **Lettura** dello stato della catena (diagnosi) | **Sì**, solo con interfaccia di livello «circuito di sicurezza», mai in parallelo | 5.11.2.1.2 `:1071`; 81-50 prosp. 3 r. 2.4 `:1308` |
| **Qualsiasi dispositivo elettrico di sicurezza di prosp. A.1** | **No**: contatti di sicurezza, oppure circuito/PESSRAL con esame di tipo | 5.11.2.1.1 `:1070`, 5.11.2.3.4 `:1087`, 5.11.2.6 `:1091` |
| Ponticellamento porte per livellamento/rilivellamento | **No**: modulo certificato (SIL 2) | 5.12.1.4 `:1105`; A.1 `:1309` |
| UCM completo | **No**: sistema o sottosistemi con esame di tipo | 5.6.7.13 `:762`; 81-50 5.8 `:577` |
| Distacco di motore e freno | **No**: 2 contattori/relè indipendenti, o STO, o circuito certificato | 5.9.2.5.4 `:871`, 5.9.2.2.2.3 `:854` |
| Accesso da remoto | Solo **dati informativi**; il codice di sicurezza non si modifica da remoto | 81-50 B.1 r. 7–8 `:1374`; 81-20 5.12.1.7 `:1125` |

**Architettura scelta (T01):** PLC standard fuori dalla catena; catena cablata a 48 V c.c.; moduli certificati acquistati per
bypass, UCM e limitazione di corsa; distacco con 2 contattori (opzione economica) o STO SIL 3.

## 2. Impianto elettrico generale (EN 81-20:2020)

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 0.4.16 | aria in vano e spazi macchina | +5 °C … +40 °C | `uni-en-81-20-2020.md:48` |
| 5.10.1.1.2 | impianto | EN 60204-1:2006 (punti richiamati) | `:998` |
| 5.10.1.1.3 | EMC | EN 12015:2014 / EN 12016:2013 | `:999` |
| 5.10.1.1.5 | altezza degli organi da regolare | 0,40 … 2,0 m sul piano di lavoro (morsetti consigliati ≥ 0,20 m) | `:1001` |
| 5.10.1.2.2 | grado di protezione | ≥ IP2X; ≥ IP2XD se accessibile a non autorizzati; ≥ IPXXB aperti in soccorso | `:1004` |
| 5.10.1.2.3 | differenziale | ≤ 30 mA su prese e circuiti > 50 V c.a. | `:1005` |
| 5.10.1.3.1 / prosp. 16 | isolamento | SELV/PELV > 100 VA: 250 V c.c. ≥ 0,5 MΩ · ≤ 500 V: 500 V c.c. ≥ 1,0 MΩ · > 500 V: 1000 V c.c. ≥ 1,0 MΩ | `:1007` |
| 5.10.1.3.2 | circuiti di comando e sicurezza | ≤ 250 V | `:1011` |
| 5.10.3.1.1 | contattori principali | EN 60947-4-1, tipo 1, +10 % impulsi, contatti a specchio | `:1016` |
| 5.10.3.1.2/.3 | ausiliari | EN 60947-5-1, relè EN 61810-1, AC-15/DC-13; contatti collegati / EN 50205 | `:1017–1018` |
| 5.10.3.2.2 | distanze | EN 60664-1, inquinamento 3, sovratensione III | `:1020` |
| 5.10.4.2 / 5.10.4.3 | protezione motore / sovratemperatura apparecchi | su ogni motore, anche < 0,5 kW · stop al piano, ripartenza dopo raffreddamento | `:1022–1023` |
| 5.10.5.1 | interruttore generale | su tutti i conduttori attivi; **non** toglie luce/ventilazione cabina, prese, luci vano | `:1028–1029` |
| 5.10.5.1.2 | posizione del generale | quadro nel vano → sul pannello di emergenza e prove | `:1030` |
| 5.10.5.5 | generale aperto | nessun movimento automatico (es. recupero a batteria) | `:1034` |
| 5.10.6.3.5 | morsetti in tensione a generale aperto | etichetta se > 25 V c.a. o > 60 V c.c. | `:1044` |
| 5.10.7.1 | luce cabina/vano/locali | alimentazione separata o a monte del generale | `:1051` |
| 5.10.9 | terra di protezione | HD 60364-4-41, 411.3.1.1 | `:1056` |
| 5.10.10 | marcatura | sigle uguali a quelle degli schemi | `:1057` |
| 6.3.2 | prova impianto | continuità PE, isolamento circuito per circuito con elettronica scollegata | `:1243` |

## 3. Circuito di sicurezza, guasti, PESSRAL (EN 81-20:2020 e EN 81-50:2020)

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 5.11.1.2 | guasti da considerare | a)…j) (10 voci, inclusa inversione di fase) | `:1064` |
| 5.11.1.4 | dispersione a terra in circuito di sicurezza, freno o valvola di discesa | arresto o blocco; riarmo manuale | `:1066` |
| 5.11.2.1.2 | collegamenti in parallelo / prelievi | vietati salvo 5.12.1.4/.5/.6/.8; prelievi solo informativi con interfaccia 5.11.2.3.2–3 | `:1071` |
| 5.11.2.2.1 | contatto di sicurezza | EN 60947-5-1 App. K, ≥ IP4X, ≥ 10⁶ cicli | `:1077` |
| 5.11.2.2.2 | apertura | positiva (anche con contatti saldati) | `:1078` |
| 5.11.2.2.3/.4 | isolamento e distanze | 250 V (IP4X) / 500 V; aria ≥ 3 mm, fuga ≥ 4 mm, apertura ≥ 4 mm | `:1079–1080` |
| 5.11.2.3.3 | regole 1°/2°/3° guasto; oltre 3: multicanale con confronto prima di ogni partenza | — | `:1085` |
| 5.11.2.3.5 | targa dei dispositivi con elettronica | costruttore, n. certificato di esame di tipo, tipo | `:1088` |
| 5.11.2.4 | azione | diretta sugli organi di potenza | `:1089` |
| 5.11.2.6 | PESSRAL | SIL da prosp. A.1; progetto 81-50 5.16; separazione PCB (5.10.3.2) o tutto PESSRAL; diagnosi sul posto | `:1091` |
| 81-50 5.15 / prosp. 3 | esclusione guasti | circuiti integrati: nessuno escludibile; relè: saldatura non escludibile; PCB fuga 4 mm / aria 3 mm a 250 V | `uni-en-81-50-2020.md:1286–1337` |
| 81-50 5.16, B.1–B.6 | PESSRAL | SIL 1: autotest o 2 canali · SIL 2: autotest + monitor o 2 canali · SIL 3: ≥ 2 canali con confronto | `:1353`, `:1408–1436` |
| 81-50 5.6.3 | prove di tipo | 0 °C e +65 °C, ≥ 4 h; vibrazioni 10–55 Hz | `:494–514` |

**SIL minimi del prospetto A.1 (EN 81-20:2020) che toccano il quadro** — `uni-en-81-20-2020.md:1269–1319`:
SIL 3: blocco e chiusura porte di piano (5.3.9.1, 5.3.9.4.1), chiusura porta cabina (5.3.13.2), STOP fossa/tetto/ispezione/
macchinario/pannello prove (5.2.1.5.1 a, 5.4.8 b, 5.12.1.11.1), commutatore ispezione (5.12.1.5.1.2 a), commutatore emergenza
(5.12.1.6.1), bypass porte (5.12.1.8.2), verifica rallentamento ai piani estremi (5.12.1.3) ·
SIL 2: blocco porta cabina (5.2.5.3.1 c), zona di livellamento (5.12.1.4 a), sovravelocità (5.6.2.2.1.6 a), rilevamento UCM
(5.6.7.7), teleruttore generale (5.10.5.2) ·
SIL 1: attivazione UCM (5.6.7.8), pulsanti ispezione (5.12.1.5.2.3 b), extracorsa (5.12.2.3.1 b), paracadute (5.6.2.1.5).

## 4. Distacco di energia, freno, limitatore di tempo

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 5.9.2.2.2.3 a) | freno | 2 dispositivi elettromeccanici indipendenti con sorveglianza, oppure circuito certificato | `:854` |
| 5.9.2.2.2.1 | freno | 125 % in discesa; organi meccanici doppi | `:852` |
| 5.9.2.5.2 | motore da rete | 2 contattori in serie | `:868` |
| **5.9.2.5.4** | **motore da inverter** | a) 2 contattori · b) 1 contattore + blocco statico + sorveglianza · c) circuito certificato · **d) STO EN 61800-5-2 SIL 3, HFT ≥ 1** | `:871` |
| 5.9.2.7.2 | limitatore di tempo (trazione) | min(45 s; corsa completa + 10 s; minimo 20 s) | `:874` |
| 5.9.3.4.2 | idraulico, salita | a) ≥ 2 contattori · b) 1 contattore + by-pass su 2 dispositivi · c) circuito certificato · d) STO SIL 3 | `:941` |
| 5.9.3.4.3 | idraulico, discesa | ≥ 2 dispositivi elettromeccanici in serie, o la sicurezza stessa, o circuito certificato | `:942` |
| 5.9.3.10.2 | limitatore di tempo (idraulico) | min(45 s; corsa a pieno carico + 10 s; minimo 20 s) | `:987` |
| 5.9.3.11 / 5.10.4.4 | temperatura olio | sensore **obbligatorio**; sovratemperatura → stop e ritorno al piano più basso | `:991`, `:1024` |
| 5.9.3.5.3.2 | valvola di sovrappressione | ≤ 140 % della pressione statica massima (≤ 170 % con perdite elevate) | `:953` |
| 5.9.3.8.1 | idraulico, velocità | vm, vd ≤ 1,0 m/s (+ 8 %) | `:968` |
| 5.9.3.9.1 | discesa manuale | senza energia, ≤ 0,3 m/s, azione mantenuta | `:973` |
| 5.9.3.9.3 | oltre 2 piani | verifica della zona di sbloccaggio indipendente dall'alimentazione | `:983` |
| 5.12.1.10 | antideriva elettrico | 15 min → piano più basso; avviso ≥ 50 mm | `:1131` |
| 5.12.2.1 | extracorsa | trazione: alto e basso · idraulico: solo alto | `:1138` |
| 5.9.2.4 | velocità trazione | ≤ + 5 % (buona pratica ≥ − 8 %) | `:866` |
| — | **pressostato** | **nessun obbligo** nei testi (solo manometro 5.9.3.6, soglia 5.9.3.9.1.5, + 20 % nei telescopici 5.9.3.2.6.5) | `:961`, `:977`, `:924` |

## 5. Livellamento, porte, ponticellamento

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 5.12.1.1.4 | precisione di fermata | ± 10 mm (± 20 mm in carico/scarico poi riportata a ± 10 mm) | `:1100` |
| 5.12.1.4 | porte aperte in zona di sbloccaggio | livellamento ≤ 0,80 m/s · rilivellamento ≤ 0,30 m/s · operazioni preliminari entro 20 mm | `:1105` |
| 5.12.1.8.3 | bypass di manutenzione | scritta BYPASS; mai porta cabina + porta piano insieme; solo ispezione/emergenza; segnale ≥ 55 dB(A) a 1 m + luce lampeggiante | `:1128` |
| 5.12.1.9 | contatti porta guasti | sorveglianza in zona di sbloccaggio; guasto → niente servizio normale | `:1130` |
| 5.12.1.2.2 | sovraccarico | soglia al più tardi + 10 %, minimo 75 kg | `:1102` |
| 5.3.8.1 | zona di sbloccaggio | ≤ 0,20 m (≤ 0,35 m con porte motorizzate accoppiate) | `:386` |
| 5.3.9.1.2 | elementi di blocco | impegno ≥ 7 mm | `:392` |
| 5.3.6.2.2.1 | porte automatiche | energia ≤ 10 J · forza di arresto ≤ 150 N · riapertura 25–1 600 mm | `:351`, `:366` |
| 81-70:2005 5.2.3 | tempo porte aperte | regolabile (tipico 2–20 s), **non accessibile all'utente** | `uni-en-81-70-2005.md:144` |
| DM 236/1989 8.1.12 | tempi porte | aperte ≥ 8 s, chiusura ≥ 4 s | `research/norme-ascensori/leggi/dm-236-1989.md:411` |

## 6. Ispezione, emergenza, manutenzione

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 5.12.1.5.2.1 | velocità in ispezione | ≤ 0,63 m/s (≤ 0,30 m/s con ≤ 2,0 m di spazio libero) | `:1112` |
| 5.12.1.5.2.3 | pulsanti ispezione | AC-15 / DC-13, ≥ 10⁶ cicli; direzione + MARCIA | `:1114` |
| 5.12.1.5.1.3, 5.12.1.6.2 | protezione | ≥ IPXXD | `:1111`, `:1124` |
| 5.12.1.6.1 | emergenza elettrica | uomo presente; ≤ 0,30 m/s | `:1123` |
| 5.9.2.3.1 b) | energia di emergenza | portare la cabina al piano entro 1 h | `:861` |
| 5.9.2.3.3 | obbligo emergenza elettrica | forza di sollevamento > 400 N | `:863` |
| **5.12.1.7** | manutenzione | **esclusione di chiamate e comandi remoti dal quadro**, porte ferme, invio ai piani estremi | `:1125` |
| 5.12.1.11 | STOP | bistabile, EN 60947-5-5; **vietato in cabina** (5.12.1.11.3) | `:1132–1134` |

## 7. UCM (movimento incontrollato)

5.6.7.1…5.6.7.14 `uni-en-81-20-2020.md:749–762`: arresto ≤ 1,20 m · grembiule ≤ 200 mm · luce verticale ≥ 1,0 m · decelerazione ≤ 1 gn ·
rilevamento al più tardi all'uscita dalla zona di sbloccaggio (SIL 2) · attivazione (SIL 1) · componente di sicurezza con esame
di tipo (81-50 5.8 `:577`) · idraulico: 2 valvole in serie provate una per una a cabina vuota · prova in sito 6.3.13 `:1254`.
Nella modernizzazione senza UCM: 10411-1 11.1.4 `:197` (freno con elementi doppi, corrente permanente, reset manuale) e
10411-2 / -12 11.1.4 `uni-10411-2-2024.md:121` (2 elettrovalvole in serie con autocontrollo).

## 8. Allarme, luce di emergenza, accessibilità, antincendio

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 81-20 5.4.10.4 | luce di emergenza | ≥ 5 lx per 1 h (DM 236/1989 8.1.12: autonomia ≥ 3 h) | `:583`; `dm-236-1989.md:419` |
| 81-20 5.12.3.1 | teleallarme | EN 81-28, fonia bidirezionale permanente | `:1149` |
| 81-20 5.12.3.2 | citofono | se corsa > 30 m o voce non udibile | `:1150` |
| 81-28:2004 4.1.3 | batteria | avviso sotto 1 h di autonomia | `uni-en-81-28-2004.md:74` |
| 81-28:2004 4.2.1 | autotest | almeno ogni 3 giorni | `:84` |
| 81-28:2004 4.2.5 | parametri | modificabili solo con protezione | `:91` |
| 81-70:2005 prosp. 2 | pulsanti | parte attiva ≥ 490 mm² · forza 2,5–5,0 N · baricentro ≥ 900 mm · più alto ≤ 1 100 mm al piano, ≤ 1 200 mm in cabina | `:225–249` |
| 81-70:2005 5.4.4.2, 5.4.3.5 | voce e segnali | 35–65 dB(A), regolazione non accessibile all'utente | `:285`, `:275` |
| 81-73:2005 5.1–5.4 | antincendio | richiamo, chiamate cancellate, ritorno al piano designato | `uni-en-81-73-2005.md:72–101` |
| DM 236/1989 8.1.12 | bottoniere / citofono | 1,10–1,40 m / 1,10–1,30 m; autolivellamento ± 2 cm | `:414`, `:419` |

## 9. Remoto e cybersicurezza (punti di norma)

81-50:2020 B.1 r. 7–8 `uni-en-81-50-2020.md:1374` (solo dati informativi da remoto; codice non modificabile da remoto) ·
B.2 r. 13–14 `:1391` (modo prova blocca il servizio normale; stato sicuro su perdita del bus) · 81-20 5.12.1.7 `:1125` ·
81-28:2004 4.2.5 `:91`. **Nessun testo appreso sulla cybersicurezza**: vedi 05-remoto-cybersicurezza.md (RED, EN 18031, CRA).

## 10. Modernizzazione secondo UNI 10411:2024 (il quadro nuovo su un impianto esistente)

| Punto | Termine | Valore | Nota |
|---|---|---|---|
| 10411-1 / -2 11.1.1 | campo del quadro nuovo | EN 81-20 da 5.10 a 5.12.4 + 5.4.10.4 c) + (T) 5.9.2.5/.6/.7 oppure (H) 5.9.3.4, 5.9.3.9.3, 5.9.3.10 | `uni-10411-1-2024.md:160`, `uni-10411-2-2024.md:102` |
| 10411-11 / -12 11.1.1 | idem, con CE | stesso campo | `uni-10411-11-2024.md:159`, `uni-10411-12-2024.md:111` |
| 10411-1 21.1 | «modifica sostanziale» | quadro + macchina + ≥ 1 porta di piano + cabina con telaio → EN 81-20 intera; **il solo quadro non lo è** | `uni-10411-1-2024.md:393` |
| 10411-1 11.1.2 | serrature senza esame di tipo | contatti raggiungibili dal dito di prova ≤ 25 V c.a. / ≤ 50 V c.c. (**la catena a 48 V c.c. rientra**) | `:168` |
| 10411-1 11.1.3 a)–o) | deroghe (se la funzione mancava prima) | carico, ≤ 0,30 m/s agli estremi, bypass, ispezione in fossa, §5.12.1.9, protezione termica, livellamento in carico, ripristino esterno, allarme (solo cose), riapertura, RCD, contatti/segnalazioni d'epoca | `:174–196` |
| 10411-11 / -12 11.1.2 | deroghe con CE | **più severe**: ammesse solo su impianti EN 81-1/-2; il **controllo del carico NON è derogabile** | `uni-10411-11-2024.md:161`, `uni-10411-12-2024.md:112` |
| 10411-1 11.2.1 | regolazione di velocità | **vietato aggiungerla** dove non c'era (sostituzione di soli componenti) | `:221` |
| 10411-1 11.1.4 | senza UCM | freno con elementi doppi; apertura a corrente permanente; reset manuale | `:197–200` |
| 10411-2 / -12 11.1.4 | senza UCM (idraulico) | 2 elettrovalvole di discesa in serie con autocontrollo | `uni-10411-2-2024.md:121` |
| 10411-1 11.1.7 | fossa/testata < 0,5 m | col quadro nuovo, adeguamento a EN 81-21:2022 | `:210` |
| 10411 25.1 / App. C (o A) | documenti | App. C/A al proprietario per la verifica straordinaria (art. 14 DPR 162); DdC alla regola dell'arte (DM 37/2008) | `uni-10411-1-2024.md:476–482` |
| PLC su impianto CE 1999–2005 | PESSRAL | EN 81-1/-2:1999 non lo prevedevano; il quadro nuovo segue comunque 81-20 5.11.2.6 | `uni-en-81-1-1999-differenze.md:413` |
| 10411 punti non coperti | argano a tamburo senza CE | nessuna parte appresa | `uni-10411-1-2024.md:11` |

## 11. Obblighi di legge (testi pubblici in `research/norme-ascensori/leggi/`)

| Atto | Valore | Nota |
|---|---|---|
| DPR 162/1999 art. 2 c. 1 lett. i) (testo 1999) | sostituzione del quadro elettrico = **modifica costruttiva** (numerazione attuale «cc)» da verificare su Normattiva) | `dpr-162-1999.md:67` |
| art. 12 c. 4–5 | dopo modifica: comunicazione aggiornata a comune e verificatore; vietato esercire senza | `:240–243` |
| art. 14 c. 3 | **verifica straordinaria** dopo modifica costruttiva | `:278` |
| art. 13 c. 1 | soggetti: ASL/ARPA, organismi notificati; verifica periodica ogni 2 anni | `:253` |
| art. 15 c. 4 | manutentore: isolamento e terra ogni 6 mesi, sul libretto | `:296` |
| all. IV voce 6 | componenti di sicurezza: dispositivi elettrici con elettronica → esame di tipo (CET) + DdC | `:525` |
| DM 23/07/2009 art. 3 | tabelle A (5 anni), B (10 anni), **C alla modernizzazione significativa (quadro nuovo)** | `dm-23-07-2009.md:61` |
| DM 23/07/2009 Tab. C voci 55, 59–65 | protezione idraulici, limitatore di tempo, protezione motore, generali bloccabili, inversione di fase, comunicazione cabina, controllo carico, istruzioni | `:188–201` |
| DM 23/07/2009 Tab. B voci 20, 21, 24, 26, 27, 29 | luce cabina, luce emergenza, UCM, manovra emergenza, contattori indipendenti, IP2X | `:134` |
| DM 23/07/2009 art. 5 c. 2 | adeguamenti non fatti → impianto non esercibile | `:82` |

Le note tra puntatori sono quelle della base privata; i file `research/norme-ascensori/leggi/` sono nel repository pubblico.

## 12. Che cosa non sappiamo (da procurare prima del progetto esecutivo)

1. **EN ISO 8100-1/-2:2026** (successore di EN 81-20/50): acquistare; il quadro nuovo dopo la citazione dovrà seguirla.
2. EN 81-28:2022, EN 81-70:2021+A1:2022, EN 81-73:2020, EN 81-71:2022 (le 10411:2024 richiamano la :2022 di 81-28 e 81-70).
3. EN 60204-1, EN 60947-4-1/-5-1/-5-5, EN 61508, **EN 61800-5-2 (STO)**, EN 12015/12016, HD 60364.
4. Testo coordinato del DPR 162/1999 (DPR 214/2010, 8/2015, 23/2017) e Legge 13/1989.
5. EN 81-21:2022 per i casi 10411-1 11.1.7 (testata/fossa ridotta): presente nella base ma non estratto per questo studio.
6. Nessun requisito su: pressostato, ventilazione del quadro oltre +5/+40 °C, tipo e capacità di batterie, cybersicurezza.
7. Il file `research/argano-geared/16-quadro-normativo-completo.md` richiamato dall'agente non esiste nel repository.
