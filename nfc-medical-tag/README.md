# Medical Info – NFC Tag (pronto da stampare)

Portachiavi tondo per **tag NFC** con scritta **MEDICAL INFO** in rilievo,
**croce rossa** centrale e **"NFC" inciso dentro la croce**. Pensato per
stampanti **Creality** (Ender 3 / K1 / serie CR), in singolo estrusore con
un solo **cambio colore**.

![Fronte](preview/01-front.png)
![Vista 3/4](preview/03-angled.png)

## File nella cartella

| File | Cosa è |
|------|--------|
| `medical-info-nfc-tag.stl` | **Il modello da stampare.** Caricalo in Creality Print. |
| `medical-info-nfc-tag.scad` | Sorgente OpenSCAD parametrico (per modificare testo, misure, ecc.) |
| `preview-colored.scad` | Solo anteprima a colori (non si stampa) |
| `preview/` | Immagini di anteprima |

## Misure

- Diametro disco: **40 mm** (≈ 49,5 mm con l'anello)
- Spessore totale: **4,6 mm** (corpo 3,6 mm + rilievo 1,0 mm)
- Foro portachiavi: **5 mm**
- Tasca sul retro per il tag NFC: **Ø 26 mm × 1,2 mm** (vedi sotto)
- Materiale: ~**5,5 g** di PLA

## Il tag NFC

Sul **retro** c'è una tasca tonda da **26 mm** profonda **1,2 mm**: ci entra
un classico tag NFC adesivo **rotondo da 25 mm** (tipo **NTAG213 / NTAG215**,
quelli "coin" o gli sticker). Si stampa, poi si incolla il tag dentro la
tasca (una goccia di colla o il suo adesivo) e si programma con un'app
NFC dal telefono.

> Se il tuo tag è da 22 o 30 mm cambia `nfc_d` nel file `.scad` e ri-esporta,
> oppure scrivimelo e te lo rigenero.

## Come stamparlo (Creality Print)

1. **Apri** `medical-info-nfc-tag.stl` in Creality Print.
2. **Orientamento – importante:** ruota il pezzo di **180°** in modo che la
   **faccia con la scritta sia rivolta verso il piatto** (testo in giù).
   Così:
   - la **tasca NFC resta rivolta verso l'alto** → si stampa senza supporti;
   - le lettere e la croce, essendo i primi strati, vengono **nitidissime**.
3. **Impostazioni consigliate** (come il modello di riferimento):
   - Altezza layer: **0,2 mm**
   - Perimetri / pareti: **2–3**
   - Riempimento: **15 %**
   - Brim: **consigliato** (5 mm) – aiuta l'adesione delle lettere sul piatto.
   - Supporti: **non servono**.

### Due colori con un solo estrusore (croce e scritta in rosso)

Tutta la parte in rilievo (scritta + croce + bordo) è alta **1,0 mm** e parte
dal piatto. Per farla rossa e il corpo bianco:

1. Carica il **filamento rosso** per primo.
2. In Creality Print aggiungi un **cambio colore / pausa a quota Z = 1,0 mm**
   (in Ender: opzione *"Add Pause / Change Filament"* al layer ≈ 5 con layer
   da 0,2 mm; su K1 usa l'inserimento *Color Change* alla stessa altezza).
3. Quando la stampante si ferma, **cambia in filamento bianco** (o il colore
   che vuoi per il corpo) e riprendi.

Risultato: croce e lettere **rosse** in rilievo, disco del colore del corpo.
Se vuoi tutto monocolore, salta semplicemente il cambio colore.

## Personalizzazione (file `.scad`)

Apri `medical-info-nfc-tag.scad` con [OpenSCAD](https://openscad.org) e
modifica i parametri in alto, poi *Esporta → STL*:

```scad
top_text     = "MEDICAL";   // scritta arco superiore
bottom_text  = "INFO";      // scritta arco inferiore
center_text  = "NFC";       // inciso dentro la croce ("" per toglierlo)
disc_d       = 40;          // diametro
nfc_d        = 26;          // diametro tasca NFC
relief_h     = 1.0;         // altezza rilievo = quota del cambio colore
```

Da riga di comando:

```bash
openscad -o medical-info-nfc-tag.stl medical-info-nfc-tag.scad
```
