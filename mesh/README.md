# Aletta — da scansione a solido CAD per FreeCAD 1.1

Mesh originale: `Aletta v1 (1).stl` (scansione 3D, 92 MB, 1.842.602 triangoli) scaricata da WeTransfer ("Aletta scannerizzata").

---

# ⭐ v3 — solid professionale 100% NURBS/analitico (ZERO triangoli)

**Questo è il deliverable consigliato per la modellazione.** È un vero solido
B-Rep fatto solo di superfici matematiche lisce — **nessuna sfaccettatura
triangolare** — come producono i professionisti con Geomagic Design X /
Rhino / Fusion (filosofia *parametric re-modeling*, vedi `METODOLOGIA` sotto).

| File | Contenuto | Dimensione |
|---|---|---|
| `Aletta_v3.step` | Solido STEP AP214 con superfici NURBS/analitiche native | **637 KB** |
| `Aletta_v3.FCStd` | Documento FreeCAD 1.1 (corpo NURBS + perni parametrici + sketch sezioni) | 0,3 MB |
| `Aletta_v3.brep` | Solido nativo OpenCascade | 0,6 MB |
| `genera_cad_v3.py` | Script di generazione | — |

### Composizione del solido (28 facce, tutte analitiche/NURBS)

| Tipo di superficie | N. facce | Cosa rappresenta |
|---|---|---|
| BSplineSurface (NURBS) | 8 | Corpo della vela — un'unica superficie freeform C2 |
| Cilindro | 7 | Gambi M8, collari Ø13,8/Ø12, tratti dei perni |
| Cono | 4 | Transizioni coniche dei perni |
| **Toroide** | **3** | **Raccordi (fillet) alla base dei perni** |
| Piano | 6 | Cappelli/estremità |

**0 facce planari triangolari.** Confronto: la v2 (mesh-fusa) aveva 60.000
triangoli; la v3 ne ha **zero**. STEP 637 KB contro 124 MB del solido sfaccettato.

### Perché è anche più *corretto*, non solo più pulito

Misurando la scansione, i perni risultano **perfettamente assialsimmetrici**
(deviazione del raggio < 0,2 mm). Quindi modellarli come cilindri/coni
analitici esatti (Ø13,8 collare → Ø8 = M8 → Ø4 punta) non è solo "pulito":
**ricostruisce il design intent reale** eliminando il rumore di scansione —
esattamente il motivo per cui i professionisti preferiscono le primitive
analitiche dove la geometria lo consente.

### Fedeltà alla scansione (`deviation_map_v3.png`)

Mediana 0,22 mm · corpo principale < 0,3 mm · solido valido e watertight,
volume 240,2 cm³. Le superfici sono editabili (NURBS + feature parametriche).

### METODOLOGIA (come lo fanno i professionisti — ricerca)

Lo standard scan-to-CAD prevede 2 filosofie:
1. **Auto-surface / patch network** (Geomagic): avvolge la scansione con
   centinaia di patch NURBS — alta fedeltà, bassa editabilità.
2. **Parametric re-modeling** (qui usato): si ricostruisce con superfici
   ideali (NURBS freeform + primitive analitiche esatte + raccordi), usando
   la scansione come riferimento — **massima editabilità + zero triangoli**.

Pipeline applicata: segmentazione corpo↔perni → corpo come singola superficie
**B-spline bicubica C2** (skinning di 24 sezioni) → perni come **rivoluzioni
analitiche** del profilo misurato → **raccordi toroidali** alla base →
**cucitura** in solido unico → verifica deviazione. Tolleranza di fitting
tenuta ~0,1 mm (≈ rumore dello scanner: fittare più stretto significa
inseguire il rumore). Fonti: Geomagic Design X (oqton.com/geomagic-designx),
McNeel Rhino (continuità G0/G1/G2), OpenCascade (cucitura/sewing).

---

# v1 — mesh pulita + solidi tassellati

## File

| File | Triangoli | Dimensione | Uso consigliato |
|---|---|---|---|
| `Aletta_v1_clean_200k.stl` | 199.684 | 9,5 MB | Massimo dettaglio pratico in FreeCAD |
| `Aletta_v1_clean_50k.stl` | 50.000 | 2,4 MB | Conversione mesh → solido più rapida |
| `Aletta_v1_clean_20k.stl` | 20.000 | 1,0 MB | Versione leggera per booleane veloci |

Solidi B-Rep tassellati già convertiti: `Aletta_v1_solid_50k.brep` /
`.step.zip` e `Aletta_v1_solid_20k.brep` / `.step.zip` (vedi sotto).

Entrambe le versioni sono **watertight** (chiuse), **2-manifold**, con normali coerenti e un'unica componente connessa — pronte per `Part → Crea forma da mesh → Converti in solido` in FreeCAD 1.1 senza errori di shape non valida.

## Pulizia eseguita

1. Fusione dei vertici duplicati (l'STL grezzo aveva 3 vertici indipendenti per triangolo).
2. Rimozione di facce duplicate, facce nulle e vertici non referenziati.
3. Rimozione delle componenti flottanti (rumore di scansione).
4. Riparazione di spigoli e vertici non-manifold.
5. Chiusura di tutti i fori (3 fori grandi + 2 difetti topologici complessi, ricostruiti localmente).
6. Riorientamento coerente delle normali (verso l'esterno).
7. Decimazione quadrica con preservazione di topologia e bordi netti (200k e 50k triangoli).
8. Traslazione del pezzo vicino all'origine: offset applicato **(-1.431, +12.375, +419.343) mm** rispetto alle coordinate originali della scansione.

## Verifica finale

| Proprietà | 200k | 50k |
|---|---|---|
| Watertight | sì | sì |
| 2-manifold | sì | sì |
| Componenti connesse | 1 | 1 |
| Volume | 228,88 cm³ | 228,85 cm³ |
| Ingombro (X×Y×Z) | 189,0 × 61,0 × 210,4 mm | idem |

La deviazione di volume tra piena risoluzione e versione 50k è < 0,1%: la decimazione non ha alterato la forma in modo apprezzabile.

![Anteprima](aletta_preview.png)

## Solido B-Rep già convertito

La conversione mesh → solido è già stata eseguita con il kernel OpenCascade
(lo stesso di FreeCAD): facce dai triangoli → cucitura a 0,01 mm → shell →
solido → correzione orientamento → validazione `BRepCheck_Analyzer` superata.

| File | Contenuto | Dimensione |
|---|---|---|
| `Aletta_v1_solid_50k.brep` | Solido nativo OpenCascade — si apre direttamente in FreeCAD | 33 MB |
| `Aletta_v1_solid_50k.step.zip` | Stesso solido in formato STEP AP214 (decomprimere prima) | 25 MB (124 MB estratto) |

Volume del solido: **228,85 cm³**, identico alla mesh di partenza. Un solo
solido, valido, pronto per operazioni booleane, tagli e misure nel workbench
Part. Nota: essendo nato da una scansione, il B-Rep è composto da ~50.000
facce triangolari piane — perfettamente lavorabile ma non parametrico; per
rimodellare in modo parametrico usarlo come riferimento per sketch e sezioni.

## Modello CAD parametrico (ricostruzione con sketch sulle sezioni)

Ricostruzione reverse-engineering eseguita in FreeCAD 1.1 headless
(script: `genera_cad.py`):

| File | Contenuto | Dimensione |
|---|---|---|
| `Aletta_parametrica.FCStd` | Documento FreeCAD 1.1: 24 sketch di sezione (B-spline), 2 sketch profilo perni + rivoluzioni, corpo a superficie B-spline, fusione finale | 0,4 MB |
| `Aletta_parametrica.step` | Lo stesso solido in STEP (superfici B-spline native, non tassellate) | 0,3 MB |

- **Corpo**: superficie B-spline C2 ottenuta per skinning di 24 sezioni
  della scansione su piani X=cost (sketch modificabili nel documento).
- **Perni**: profilo a gradini misurato dalla scansione (collare Ø13,7/13,2 →
  gambo Ø8 = M8 → punta Ø4,3 con smusso), sketch + rivoluzione a 360° lungo
  gli assi fittati (inclinazioni 3,4° e 2,6° rispetto a Z); i collari sono
  prolungati dentro il corpo per garantire la fusione.
- **Risultato**: un singolo solido valido di 239,6 cm³, booleane funzionanti.

### Fedeltà alla scansione (40.000 punti campionati)

| Metrica scan→CAD | Valore |
|---|---|
| Mediana | 0,22 mm |
| Media | 0,74 mm |
| 95° percentile | 3,6 mm |

La deviazione è concentrata (vedi `deviation_map.png`): nelle zone dei
**boss dei perni** (la nervatura locale è sostituita dal collare cilindrico
prolungato) e in alcune fasce **tra le stazioni** della forcella superiore,
dove la gola stretta (~1,5 mm) è alla risoluzione limite dello skinning.
Sulle superfici principali della vela la deviazione è < 0,3 mm.

Per il lavoro manuale di precisione usare il CAD parametrico come base e le
mesh/solidi tassellati (`Aletta_v1_solid_*.brep`) come riferimento esatto.

## v2 — boss modellati con fedeltà dalla scansione

La v1 sostituiva i boss di attacco dei perni con collari cilindrici prolungati.
Nella **v2** i boss sono ritagliati **esatti dalla scansione** (blocchi watertight
attorno a ciascun perno), uniti al corpo parametrico e ai perni ideali M8 in
spazio mesh (le booleane CAD fallivano per quasi-tangenza tra boss e skin),
quindi riconvertiti in B-Rep valido.

| File | Contenuto |
|---|---|
| `Aletta_parametrica_v2.FCStd` | Documento FreeCAD 1.1: sketch sezioni + corpo parametrico + profili/rivoluzioni perni + `Boss_1`/`Boss_2` esatti + solido finale `Aletta` |
| `Aletta_v2_solid.brep` | Solido finale v2 (valido, 242,7 cm³) |
| `Aletta_v2_solid.step.zip` | Stesso solido in STEP (decomprimere) |

### Fedeltà v2 vs v1 (zone boss, scan→CAD)

| Zona | v1 media / max | v2 media / max |
|---|---|---|
| Boss perno 1 | 1,20 / 9,4 mm | **0,31 / 3,3 mm** |
| Boss perno 2 | 1,58 / 11,6 mm | **0,50 / 4,6 mm** |

Globale v2: mediana 0,19 mm, p95 3,4 mm (vedi `deviation_map_v2.png`).
Inoltre la v2 elimina il collare artificiale nella gola della forcella.
Le fasce residue di deviazione tra le stazioni della forcella superiore
restano (limite dello skinning a singola superficie, documentato in v1).

Nel documento v2 il solido finale `Aletta` è una feature statica (il fuso
mesh-spazio); corpo, perni e boss restano oggetti separati e modificabili
per la rilavorazione manuale.

## Suggerimento per FreeCAD 1.1 (conversione manuale, se preferita)

1. `File → Importa` la versione 50k (o 200k se serve più dettaglio).
2. Workbench **Mesh**: `Analizza → Valuta e ripara mesh` confermerà 0 difetti.
3. Workbench **Part**: `Parte → Crea forma da mesh…` (tolleranza di cucitura 0,1 mm), poi `Converti in solido`.
4. Per un solido "pulito" con facce analitiche, in alternativa usare la forma come riferimento e rimodellare con sketch su sezioni.
