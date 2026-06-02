# Icon Photographs — Sources & Attribution

Every icon in this folder is sourced from a free, license-clean
collection. Two sources are used:

1. **The Metropolitan Museum of Art — Open Access programme**
   <https://www.metmuseum.org/art/collection/search>
   Licence: **CC0 1.0 Universal (Public Domain Dedication)**.
   Museum-photographed artefacts (medieval swords, armour, jewellery,
   etc.). Object IDs recorded in `manifest.json`.

2. **Wikimedia Commons — public-domain art**
   <https://commons.wikimedia.org/>
   Licence: **Public Domain** (pre-1928 originals, no copyright in
   EU/US/BG/IT). Used for fictional subjects (dragons, ghosts, etc.)
   where no museum photo exists, and for classical paintings used as
   class portraits and atmospheric icons.

## Why photographs instead of vector silhouettes

The earlier sprite set used hand-authored SVG silhouettes from
game-icons.net (still kept on disk as a graceful fallback when an
authored photo isn't available). They read clean as icons but
homogenise visually — every sword looks like the same flat sword.
A real Met photograph of a 16th-century etched longsword, or
Vasnetsov's *Knight at the Crossroads* for the warrior portrait,
carries texture and history that no vector silhouette can.

## Image processing

Each photo is downloaded at the canonical source resolution (most
Met images are ≥ 2000 px) and re-encoded as **JPEG q82, 512×512,
centre-cropped to a square** with ImageMagick. The original file
order, museum-provided crops, and white balance are preserved.

## Per-slot manifest

The machine-readable list of every slot, its source object/file, the
Met department or Wikimedia title, and the resulting file size lives
in `manifest.json` next to this CREDITS file.
