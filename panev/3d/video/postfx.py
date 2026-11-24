"""Camera-like finishing on the rendered frame: highlight bloom, a touch of lateral chromatic aberration,
vignette and fine film grain (different every frame). Input and output: float32 RGB 0..255."""
import numpy as np
from PIL import Image, ImageFilter

_vig = {}


def vignette(h, w):
    if (h, w) not in _vig:
        Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
        r2 = ((X - w / 2) / (w / 2)) ** 2 + ((Y - h / 2) / (h / 2)) ** 2
        _vig[(h, w)] = (1 - 0.14 * r2 ** 1.3).clip(0.72, 1)[..., None]
    return _vig[(h, w)]


def finish(img, frame):
    h, w = img.shape[:2]
    # bloom from the hot highlights (zinc, chrome, the level's vials)
    hot = np.clip(img - 205.0, 0, None)
    if hot.max() > 0:
        glow = np.asarray(Image.fromarray(hot.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16 * w / 1920)), np.float32)
        img = img + glow * 0.45
    # lateral chromatic aberration: red a hair larger, blue a hair smaller, about the centre
    out = img.copy()
    for ch, k in ((0, 1.0007), (2, 0.9993)):
        im = Image.fromarray(img[..., ch].clip(0, 255).astype(np.uint8))
        a = 1 / k
        im = im.transform((w, h), Image.AFFINE, (a, 0, w / 2 * (1 - a), 0, a, h / 2 * (1 - a)), Image.BILINEAR)
        out[..., ch] = np.asarray(im, np.float32)
    img = out * vignette(h, w)
    rng = np.random.default_rng(1000 + frame)
    lum = rng.normal(0, 2.4, (h, w, 1)).astype(np.float32)
    col = rng.normal(0, 0.9, (h, w, 3)).astype(np.float32)
    shade = (0.55 + 0.45 * (1 - img.mean(2, keepdims=True) / 255))  # grain shows more in the shadows
    return (img + (lum + col) * shade).clip(0, 255)
