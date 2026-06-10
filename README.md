# Aletta in fibra di carbonio — da scansione a FreeCAD 1.1

Conversione della scansione 3D `Aletta v1.stl` (1.84M triangoli) in un file
FreeCAD 1.1 lavorabile con gli ambienti **Surface / Curves / Part / Part Design**,
con le **barriere per lo stampo in 5 semistampi femmina** già preparate.

## File principali

| File | Contenuto |
|---|---|
| `output/Aletta_stampo.FCStd` | Documento FreeCAD 1.1 completo (vedi struttura sotto) |
| `output/Aletta_stampo.step` | Export STEP di tutte le curve/superfici/solidi |
| `output/Barriera_*.stl` | Barriere solide (3 mm) pronte per stampa 3D |
| `scansione/Aletta_v1_decimata_150k.stl` | Scansione decimata a 150k facce (riferimento) |
| `scripts/` | Pipeline Python per rigenerare tutto con parametri diversi |

## Sistema di riferimento

Coordinate originali della scansione, con **Z traslata di +212 mm**: il piano
superiore del boss del perno anteriore è circa a Z=0, la lama scende verso
Z negativo (punta a Z≈-207). X = corda (bordo d'entrata ≈ x piccole),
Y = trasversale (lato concavo Y-, lato convesso Y+).

## Struttura del documento FreeCAD

- **Scansione_riferimento** — mesh decimata (150k facce): è il riferimento
  fedele, da usare per verifiche e per la zona radice/fessura.
- **Sezioni** — 14 sezioni B-spline della lama (riferimento/redesign).
- **Superfici**
  - `Lama_superficie` — NURBS unica della lama (z −206.5 … −50), lisciata ma
    fedele. Fedeltà rispetto alla scansione: zona centrale (z −180…−90)
    media 0.04 mm / p95 0.15 mm; punta 0.26/0.91 mm; zona alta collare
    0.45/1.7 mm (lì la scansione ha fori grandi, fare fede alla mesh).
  - `Punta_cappuccio` — chiusura dell'ultimo mm in punta.
  - `Scafo_riferimento` — superficie del piano scafo (faccia superiore della
    flangia estesa), su cui giace la barriera radice. È il piano di
    divisione del tassello radice.
- **Curve_giunzione**
  - `Giunzione_fianco_concavo` / `_convesso` — linee di giunzione
    fianco↔tasselli bordo, a **15 mm** dal bordo d'entrata/uscita/punta,
    misurati sulla superficie. Curve continue radice→punta→radice.
  - `Silhouette_bordo_entrata` / `_uscita` — silhouette dei bordi.
  - `Perimetro_livello_scafo` — perimetro del pezzo al livello scafo
    (bordo interno della barriera radice).
  - `Perimetro_barriera_radice_esterno` — idem +40 mm.
- **Barriere_superfici** (rigate, larghezza **40 mm**)
  - `Barriera_fianco_concavo` — parete perpendicolare alla superficie lungo
    la giunzione lato concavo (delimita il semistampo fianco concavo dai
    tasselli bordo).
  - `Barriera_fianco_convesso` — idem lato convesso.
  - `Barriera_radice` — anello sul piano scafo attorno al perimetro del
    pezzo (chiusura superiore dello stampo / battuta del tassello radice).
  - `Piastra_giunzione_punta` — piastra piana all'apice della punta, per la
    giunzione tra tassello bordo entrata e bordo uscita.
- **Barriere_solide_3mm** — le stesse barriere ispessite 3 mm
  (`makeOffsetShape`), esportate anche come STL per stampa 3D.

## Schema stampo (5 semistampi femmina)

1. **Fianco concavo** — delimitato da: barriera radice + barriera fianco concavo.
2. **Fianco convesso** — speculare.
3. **Tassello bordo d'entrata** — copre LE + punta fino alla piastra di giunzione.
4. **Tassello bordo d'uscita** — copre il bordo svettato posteriore + TE.
5. **Tassello radice** — forma la faccia superiore della flangia (piano scafo)
   e la **fessura** tra flangia e lama (lingua dedicata).

Sequenza consigliata: laminare i fianchi per primi (barriere fianco + anello
radice), poi i tasselli bordo contro le flange dei fianchi (piastra punta come
divisorio), infine il tassello radice.

## Scelte concordate

- Stampo in 5 semistampi femmina: 2 fianchi + radice + 2 bordi.
- Barriere larghe 40 mm (solidi spessi 3 mm).
- Perni di fissaggio **esclusi** (inserti da annegare/forare dopo).
- Piede sopra la flangia **fuori stampo**: lo stampo si ferma al piano scafo.
- Fessura flangia/lama **da riprodurre**: ⚠ la scansione non vede il fondo
  (visibile fino a z≈−79); confermare la profondità reale prima di costruire
  la lingua del tassello radice.
- Superficie "lisciata ma fedele": rumore di scansione rimosso, fori grandi
  della scansione ponteggiati con continuità.

## Avvertenze da stampista

- Lo **stampo si lamina sul pezzo fisico**: le barriere qui fornite sono
  i pezzi da produrre (stampa 3D / fresatura) e da adattare in opera
  (plastilina/cera per gli ultimi decimi, normale prassi).
- Le barriere fianco terminano poco sotto la flangia (lato entrata z≈−52
  concavo / −66 convesso, lato uscita z≈−76): il raccordo con l'anello
  radice si chiude in opera.
- Il bordo d'uscita ricostruito è leggermente raddolcito dallo smoothing
  (<0.3 mm): per un TE a spigolo rifinire i tasselli bordo.
- La zona della fessura e il sottoflangia hanno fori di scansione:
  lì fa fede la mesh `Scansione_riferimento`.

## Rigenerare con parametri diversi

```bash
pip install numpy scipy trimesh shapely fast-simplification
# 1. sezioni:        python3 scripts/build_sections.py
# 2. curve/strisce:  python3 scripts/build_strips.py   (OFFSET=15, WIDTH=40 in testa al file)
# 3. documento:      freecadcmd scripts/build_freecad.py
```
