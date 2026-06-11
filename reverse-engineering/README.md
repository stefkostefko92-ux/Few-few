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
3. **Ambiente Surface** → le curve di contorno vengono riempite con
   **Surface ▸ Sections** (oggetti parametrici `Surface::Sections`, con
   fallback su loft) per generare le superfici.

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

- **Sup_Base** — guscio chiuso sotto la feritoia (z −418 … −378), loft di
  sezioni BSpline periodiche;
- **Sup_PelleEsterna_DX** / **Sup_PelleInterna_SX** — le due pelli del
  louver nella zona della feritoia (curve aperte → la fessura resta aperta);
- **Sup_Sommita** — guscio chiuso sopra la feritoia fino al bordo superiore;
- **Sup_Perno1 / Sup_Perno2** — i perni/borchie di fissaggio superiori,
  loftati dalle loro sezioni.

## Rifinitura consigliata in GUI

Le curve del gruppo *Sezioni* sono già pronte per essere modificate: in GUI
si può sostituire qualunque sezione con *Curves ▸ Interpolate* tracciata a
mano sulla mesh e rigenerare la superficie con *Surface ▸ Sections* o
*Surface ▸ Filling* (fill boundary curves). I raccordi alle estremità della
feritoia (dove la sezione passa da chiusa a doppia-aperta) si chiudono bene
con *Surface ▸ Filling* selezionando i bordi adiacenti — avendo cura di
**non** riempire la fessura della presa d'aria.
