"""The sign templates for print: the owner's JPEGs (about 100 dpi on A4) upscaled 4x with Real-ESRGAN x4plus,
mixed 3:1 with a plain Lanczos 4x (the model alone smears fine photo detail into flat strokes; a quarter of
the plain enlargement keeps the texture of the photos), then brought down (Lanczos) to the smallest whole
factor that gives 3000 px or more on the long side (about 260-310 dpi on A4). Same picture, 1:1 — no
redrawing. Writes assets/cartelli/<id>.jpg and updates "scala" and "sha256" in its map; every coordinate
of the map stays in the pixels of the original. See README.md next to this file.

Usage: python -I upscale.py <RealESRGAN_x4plus.pth> <dir with the originals> <assets/cartelli>
"""
import hashlib
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional as F

# The owner's originals (30 October 2026), as pinned before the upscale.
ORIGINALS = {
    'rosso': '4145b35af6108ec2191ff47708f2675bf6f74f8109ecfc9c43e858058cd3e149',
    'giallo-nero': '2207f39dcf066026202d3d8de958d1346f29ee31de5a6abd9205f56bf0406f95',
    'fuori-servizio': '0613dac1fbf9e46f83fa64cea7738b68f2b6d373c9ada29ef112d2a9275359fb',
    'blu': 'e41799dcaf3cf0ba8e2aba52244228111bd984a7266a799c98aa7c4f4e5d6f0f',
    'grafite-oro': '968a5a8bd4b0d5ee0bc89296e186c454b247fe925d4708741743c12f9336246d',
}
WEIGHTS_SHA256 = '4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1'
LONG_SIDE = 3000
QUALITY = 90
# The share of Real-ESRGAN in the mix; the rest is Lanczos.
MODEL_SHARE = 0.75


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    """The generator of Real-ESRGAN x4plus (23 RRDB blocks), with the parameter names of its weights."""

    def __init__(self, nf=64, nb=23, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def upscale4(model, img, tile=192, pad=16):
    """4x in tiles (the CPU memory stays small); each tile sees `pad` pixels around it, so no seams."""
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0)
    _, _, h, w = x.shape
    out = torch.zeros(1, 3, h * 4, w * 4)
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
            py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
            py1, px1 = min(y1 + pad, h), min(x1 + pad, w)
            with torch.inference_mode():
                o = model(x[:, :, py0:py1, px0:px1])
            oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
            out[:, :, y0 * 4 : y1 * 4, x0 * 4 : x1 * 4] = o[
                :, :, oy : oy + (y1 - y0) * 4, ox : ox + (x1 - x0) * 4
            ]
    arr = (out.squeeze(0).permute(1, 2, 0).clamp(0, 1).numpy() * 255.0).round().astype(np.uint8)
    return Image.fromarray(arr)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    weights, originals, assets = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    if sha256(weights) != WEIGHTS_SHA256:
        sys.exit(f'{weights}: not RealESRGAN_x4plus.pth (sha256)')
    torch.set_num_threads(4)
    model = RRDBNet()
    state = torch.load(weights, map_location='cpu', weights_only=True)
    model.load_state_dict(state.get('params_ema', state), strict=True)
    model.eval()
    for name, expected in ORIGINALS.items():
        source = originals / f'{name}.jpg'
        if sha256(source) != expected:
            sys.exit(f'{source}: not the original (sha256)')
        started = time.time()
        img = Image.open(source).convert('RGB')
        w, h = img.size
        k = -(-LONG_SIDE // max(w, h))
        if not 1 <= k <= 4:
            sys.exit(f'{source}: factor {k}')
        model4 = np.asarray(upscale4(model, img), dtype=np.float32)
        plain4 = np.asarray(img.resize((w * 4, h * 4), Image.LANCZOS), dtype=np.float32)
        mixed = MODEL_SHARE * model4 + (1 - MODEL_SHARE) * plain4
        big = Image.fromarray(np.clip(mixed, 0, 255).round().astype(np.uint8))
        if k < 4:
            big = big.resize((w * k, h * k), Image.LANCZOS)
        target = assets / f'{name}.jpg'
        big.save(target, quality=QUALITY, subsampling=0, optimize=True)
        digest = sha256(target)
        # Only "scala" and "sha256" change; the rest of the map is written by hand and stays as it is.
        mappa = assets / f'{name}.json'
        text = mappa.read_text()
        text = re.sub(r'"sha256": "[0-9a-f]{64}"', f'"sha256": "{digest}"', text, count=1)
        text = re.sub(r'"scala": \d+', f'"scala": {k}', text, count=1)
        json.loads(text)
        mappa.write_text(text)
        print(f'{name}: {w}x{h} -> {w * k}x{h * k} (x{k}), {target.stat().st_size // 1024} KB, '
              f'{time.time() - started:.0f} s', flush=True)


main()
