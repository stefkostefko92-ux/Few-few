# The sign templates for print

`assets/cartelli/*.jpg` are the five templates of the stop sign "Avviso di fermo impianto", drawn from scratch
by `disegna.py` (owner's decision of 28 November 2026: the earlier pictures were copies of someone else's signs
and are gone). Nothing in them comes from outside:

- the shapes (bands, rules, hazard stripes, the "forbidden" sign with the lift) are drawn by the code;
- the lettering is Fira Sans / Fira Sans Condensed (SIL OFL 1.1, `node_modules/@fontsource`);
- the only photographs are our own 3D renders in `public/img/site/` (`vano-*.webp`, `bottoniera-*.webp`),
  toned to the colours of each template.

No sample data is printed: the places for date, address, city, place and the message to the people are empty,
so every `copri` in the maps is `[]` (the portal then uses the JPEG as it is).

| Template       | Map         | `scala` | Picture     | Photo              |
| -------------- | ----------- | ------- | ----------- | ------------------ |
| rosso          | 1750 × 1220 | 2       | 3500 × 2440 | vano-2400          |
| giallo-nero    | 1750 × 1220 | 2       | 3500 × 2440 | vano-2400          |
| fuori-servizio | 1750 × 1220 | 2       | 3500 × 2440 | bottoniera-1600    |
| blu            | 1220 × 1750 | 2       | 2440 × 3500 | vano-2400          |
| grafite-oro    | 1220 × 1750 | 2       | 2440 × 3500 | vano-portrait-1200 |

The picture is `scala` times the map (about 300 dpi on A4); every coordinate in the maps (`*.json`) is in map
pixels, and `src/cartelli/modelli.ts` multiplies by `scala` where it needs picture pixels. The map is also what
`src/cartelli/pdf.ts` draws on: logo and company data on top, the four values under the captions
DATA / INDIRIZZO / CITTÀ / UBICAZIONE IMPIANTO, then the message to the people.

## Running it again

```bash
cd rilievi
python3 -I scripts/cartelli/disegna.py          # writes assets/cartelli/*.jpg and *.json
npx prettier --write assets/cartelli/*.json     # the maps are kept in the format of the repo
```

Needs Python 3 with Pillow 13 (used: 13.0.0) and `npm ci` done (the fonts). Deterministic: the same bytes at
every run on the same Pillow/FreeType; another build can change a few pixel values and so the SHA-256. The
committed JPEGs are the reference, and the portal checks them by SHA-256 at start. The script writes the new
`sha256` into each map; run it, look at the five PDFs (`src/cartelli/pdf.ts`), then commit both.
