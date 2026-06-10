# Schemi CAD (DXF) — quadro di manovra ascensore (geared / idraulico)

Export **CAD vero** in formato **DXF R12** (AutoCAD ASCII), apribile in AutoCAD,
LibreCAD, DraftSight, QCAD, BricsCAD. Generati programmaticamente da
[`genera_dxf.py`](genera_dxf.py) (nessuna dipendenza per la generazione).

## File

| Foglio | DXF | Anteprima |
|:------:|-----|-----------|
| 1/4 Potenza geared (2 velocità + variante VVVF) | `potenza-geared.dxf` | `preview-potenza-geared.png` |
| 2/4 Potenza idraulico (Y/Δ + valvole) | `potenza-idraulico.dxf` | `preview-potenza-idraulico.png` |
| 3/4 Catena di sicurezza | `catena-sicurezza.dxf` | `preview-catena-sicurezza.png` |
| 4/4 I/O PLC | `io-plc.dxf` | `preview-io-plc.png` |

Le versioni SVG (più ricche graficamente) restano in [`../schemi/`](../schemi/).

## Rigenerare i DXF

```bash
python3 cad/genera_dxf.py
```

## Rigenerare le anteprime PNG (opzionale, richiede ezdxf + matplotlib)

```bash
pip install ezdxf matplotlib
python3 - <<'PY'
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import matplotlib.pyplot as plt
for f in ["potenza-geared","potenza-idraulico","catena-sicurezza","io-plc"]:
    doc = ezdxf.readfile(f"cad/{f}.dxf")
    fig = plt.figure(figsize=(11.7,8.3)); ax = fig.add_axes([0,0,1,1]); ax.set_axis_off()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(doc.modelspace(), finalize=True)
    fig.savefig(f"cad/preview-{f}.png", dpi=120, facecolor="white"); plt.close(fig)
PY
```

## Layer (DXF)

| Layer | Colore ACI | Uso |
|-------|:----------:|-----|
| POTENZA | 1 (rosso) | circuiti di potenza |
| SICUREZZA | 2 (giallo) | catena di sicurezza, A3 |
| COMP | 4 (ciano) | componenti/contorni |
| TESTO | 7 | etichette e note |
| CARTIGLIO | 3 (verde) | riquadro cartiglio |
| CORNICE | 7 | cornice foglio A4 |

I DXF sono validati con `ezdxf` (entità e layer leggibili correttamente).

> Per produzione in officina (EPLAN / cavi numerati) i DXF sono la base; la lista
> morsetti e cavi è in [`../docs/03-lista-io.md`](../docs/03-lista-io.md) e
> [`../config/lista-io.csv`](../config/lista-io.csv).
