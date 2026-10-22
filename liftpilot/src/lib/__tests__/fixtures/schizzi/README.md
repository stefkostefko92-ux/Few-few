# HEIC fixtures of the survey sketches (round 50)

Made here, from pictures drawn with Pillow (no third-party content), with libheif's own encoder (`heif-enc` 1.17,
x265), so the tests read real HEIF files:

- `schizzo.heic` (1105 bytes): a 96 × 64 sketch (a rectangle, a line, «1600») saved as a JPEG with an EXIF
  orientation 6 and an EXIF description standing for personal data (`GPS-45.4642N-9.1900E Mario Rossi`), encoded with
  `heif-enc -q 40 -t 16`: the primary image (item 1, 96 × 64 with `irot` 270° → decoded 64 × 96), a hidden EXIF item,
  a 16 px thumbnail (item 3, `thmb`).
- `due-immagini.heic` (764 bytes): two 40 × 30 top-level images, red (item 1) and blue (item 2), encoded with
  `heif-enc -q 40 red.png blue.png`, then the `pitm` box set to item 2 by hand (two bytes at offset 85): the primary is
  the second top-level image, so heif-convert writes out-1.jpg (red) and out-2.jpg (blue) and the upload keeps the blue.

- `cinque-immagini.heic`: five 16 × 16 plain colours, `heif-enc -q 30 c0.png … c4.png`: five top-level images, one more
  than the upload takes.

To make them again: draw the pictures with Pillow as above, then the same `heif-enc` commands.
