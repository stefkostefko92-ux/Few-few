# The sign templates for print

`assets/cartelli/*.jpg` are the five templates the owner sent on 30 October 2026, upscaled for print.
The originals were 794–1518 px on the long side (about 100 dpi on A4); the sign printed soft and showed
the JPEG blocks. `upscale.py` runs Real-ESRGAN x4plus on each one, mixes it 3:1 with a plain Lanczos
enlargement and brings it down with Lanczos to the smallest whole factor (`scala`) that gives at least
3000 px on the long side:

| Template       | Original    | `scala` | Now         |
| -------------- | ----------- | ------- | ----------- |
| rosso          | 1518 × 1094 | 2       | 3036 × 2188 |
| giallo-nero    | 1518 × 1094 | 2       | 3036 × 2188 |
| fuori-servizio | 1216 × 918  | 3       | 3648 × 2754 |
| blu            | 794 × 918   | 4       | 3176 × 3672 |
| grafite-oro    | 930 × 918   | 4       | 3720 × 3672 |

It is the same picture, 1:1: nothing is redrawn or added; the model rebuilds the edges of the letters and
of the photos and drops the compression blocks. Alone, it also smears the fine detail of the photos into
flat strokes (a painted look on the smallest template, "blu", 4×); the quarter of plain enlargement keeps
their texture and costs the letters almost nothing. Every coordinate in the maps (`*.json`) stays in the pixels
of the original; `src/cartelli/modelli.ts` multiplies them by `scala` where it cleans the sample text.
The script also writes the new `sha256` and `scala` into each map.

## Running it again

The model: Real-ESRGAN by Xintao Wang et al., BSD 3-Clause
(https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE), weights
`RealESRGAN_x4plus.pth` from https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth,
SHA-256 `4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1` (the script refuses any other
file). The network is written out in `upscale.py` (no Real-ESRGAN or BasicSR package); the weights are
loaded with `weights_only=True`. Used: Python 3.13, torch 2.15.0 (CPU), numpy 2.5.4, Pillow 13.0.0.

```bash
cd rilievi
python3 -m venv /tmp/sr-venv
/tmp/sr-venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
/tmp/sr-venv/bin/pip install numpy==2.5.4 pillow==13.0.0
mkdir -p /tmp/sr-model /tmp/cartelli-originali
curl -fL -o /tmp/sr-model/RealESRGAN_x4plus.pth \
  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
# The originals are in the history, at the commit that added them:
for id in rosso giallo-nero fuori-servizio blu grafite-oro; do
  git show 498abbbda81bad9791eaf72352604d5e55d1df9c:rilievi/assets/cartelli/$id.jpg > /tmp/cartelli-originali/$id.jpg
done
/tmp/sr-venv/bin/python -I scripts/cartelli/upscale.py /tmp/sr-model/RealESRGAN_x4plus.pth \
  /tmp/cartelli-originali assets/cartelli
```

About 15 minutes on 4 CPU cores. Another CPU or another torch can change a few pixel values and so the
SHA-256: the committed JPEGs are the reference, and the portal checks them by SHA-256 at start.
