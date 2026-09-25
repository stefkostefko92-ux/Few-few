# Source data provenance

- **Origin:** WeTransfer transfer "Aletta scannerizzata"
  (sender: niccolo.baldi@bilcotech.it)
- **File:** `Aletta v1 (1).stl` — 92,130,184 bytes, binary STL
- **Downloaded:** 2026-06-09
- **Transfer id:** `3c5644fa6d4378dc55166edccfd348bf20260609122148`

The raw STL is **not committed** (≈ 92 MB scan data). Re-download it from the
original WeTransfer link, place it next to the scripts, then run:

```
python3 scan_to_cad.py "Aletta v1 (1).stl" output --faces 14000
```
