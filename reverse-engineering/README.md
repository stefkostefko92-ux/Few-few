# Reverse engineering — "Aletta scannerizzata"

Ricostruzione CAD dell'aletta scansionata (`Aletta v1 (1).stl`, ~1,84 M di
triangoli, ingombro ≈ 189 × 61 × 210 mm) con **FreeCAD 1.1**, seguendo il
workflow classico di reverse engineering a sezioni:

1. **Ambiente Mesh** → sezioni trasversali della scansione su piani Z
   (equivalente di *Mesh ▸ Sezionamento / Cross-Sections*);
2. **Curves → Interpolate** → ogni polilinea di sezione viene ricampionata
   (passo ≈ 2,5 mm, per filtrare il rumore di scansione) e interpolata con
   una **BSpline** (nello script è `Part.BSplineCurve.interpolate`, che è
   esattamente ciò che fa lo strumento *Interpolate* del workbench Curves);
3. **Ambiente Surface** → le superfici vengono generate per **skinning
   delle sezioni**: ogni sezione è ricampionata con lo stesso numero di
   punti e la superficie è una `Part.BSplineSurface` interpolata sulla
   griglia risultante. È l'equivalente robusto di *Surface ▸ Sections /
   fill boundary curves* (il loft OCC su queste sezioni di scansione
   produce twist; l'interpolazione di griglia no). I profili chiusi sono
   divisi in due archi ai vertici estremi, così le metà esterna/interna
   restano superfici separate e ben parametrizzate.

## La feritoia d'aria resta APERTA

La scansione mostra che l'aletta ha una **presa d'aria a persiana (louver)**
al centro: la pelle esterna si sovrappone a quella interna lasciando una
fessura verticale (z ≈ −375 … −288 nel sistema della scansione) da cui entra
l'aria.

Per questo motivo nella zona centrale le sezioni **non vengono richiuse**:
ogni piano di sezione produce **due curve aperte** (pelle esterna destra e
pelle interna sinistra) che vengono loftate **separatamente**. Tra le due
superfici rimane quindi la fessura aperta, come richiesto: i fori a metà del
pezzo non vengono tappati.

## Contenuto

| File | Descrizione |
|---|---|
| `build_aletta_re.py` | Script per `freecadcmd` che esegue tutto il workflow |
| `Aletta_RE.FCStd` | Progetto FreeCAD: gruppo **Sezioni** (curve BSpline), gruppo **Superfici** (Sections/loft), mesh decimata di riferimento |
| `Aletta_RE.step` | Esportazione STEP delle superfici ricostruite |
| `preview_*.png` | Anteprime di verifica (scansione vs superfici ricostruite) |

La scansione originale (92 MB) **non** è nel repository: va scaricata dal
link WeTransfer e salvata come `/tmp/aletta.stl` prima di lanciare lo script:

```bash
freecadcmd reverse-engineering/build_aletta_re.py
```

## Struttura del modello

- **Sup_Base_Esterna / Sup_Base_Interna** — guscio sotto la feritoia
  (z −418 … −378), diviso nelle due metà del profilo chiuso;
- **Sup_PelleEsterna_DX** / **Sup_PelleInterna_SX** — le due pelli del
  louver nella zona della feritoia (curve aperte → la fessura resta aperta);
- **Sup_Sommita_Esterna / Sup_Sommita_Interna** — guscio sopra la feritoia
  fino al bordo superiore;
- **Sup_Perno1_A/B, Sup_Perno2_A/B** — i perni/borchie di fissaggio
  superiori, rivestiti dalle loro sezioni.

## Qualità della ricostruzione

Deviazione superfici → scansione (160 000 punti campionati):
**media 0,32 mm, 95° percentile 0,99 mm**. Le deviazioni maggiori sono
localizzate nella fascia superiore (z ≈ −290 … −255), dove la scansione ha
buchi/occlusioni intorno alle borchie e il bordo superiore inclinato fa
ritirare rapidamente le sezioni: è la prima zona da rifinire in GUI.

## Vedere la deviazione dentro FreeCAD

FreeCAD **non ha un comando nativo** di deviazione a colori (la mappa
`preview_deviazione.png` è stata generata con Python/matplotlib). Per vederla
nella vista 3D di FreeCAD usa la macro inclusa:

1. Apri `Aletta_RE.FCStd`
2. **Macro ▸ Macro… ▸** seleziona `deviation_macro.py` ▸ **Esegui**
   (oppure incolla il file nella *Console Python*: Vista ▸ Pannelli ▸ Console Python)

La macro lavora in ambiente **Mesh Design**: tassella ogni superficie, calcola
la distanza dei vertici dalla scansione e colora la mesh
(**verde** = dentro tolleranza, **rosso** = fuori, fondo scala 1 mm regolabile
con `TOL_MM`). Usa la scansione piena se trova `/tmp/aletta.stl`, altrimenti la
mesh decimata salvata nel documento.

In alternativa, senza macro, il confronto visivo nativo è: rendere le
superfici semi-trasparenti sopra la mesh della scansione e controllare gli
scostamenti con le curve di sezione del gruppo *Sezioni* (ambiente Mesh ▸
*Sezioni trasversali*). Per una vera mappa metrologica resta comunque
consigliato **CloudCompare** (gratuito): *Cloud-to-Mesh distance* tra la
scansione STL e lo STEP tassellato.

## Rifinitura consigliata in GUI

Le curve del gruppo *Sezioni* sono già pronte per essere modificate: in GUI
si può sostituire qualunque sezione con *Curves ▸ Interpolate* tracciata a
mano sulla mesh e rigenerare la superficie con *Surface ▸ Sections* o
*Surface ▸ Filling* (fill boundary curves). I raccordi alle estremità della
feritoia (dove la sezione passa da chiusa a doppia-aperta) si chiudono bene
con *Surface ▸ Filling* selezionando i bordi adiacenti — avendo cura di
**non** riempire la fessura della presa d'aria.
