"""The mark of Rilievi Impianti (the owner, 31 October 2026 — a picture, not an SVG; the "targa nera" chosen
from three concepts): a lift data plate path-traced in Mitsuba 3, black and white, transparent background.

The plate is a relief: a height field drawn with numpy and Pillow — a polished steel frame round a satin
black enamel inlay, four slotted screws and the raised letters "RI" in Fira Sans Condensed Bold (OFL,
from @fontsource) — turned into a mesh and lit like a product shot: a graded soft box behind the camera for
the sheen of the flat steel, a key light from the top left and two rims for the edges. The camera is
orthographic and straight on, so the outline is exact at every size.

    cd scripts/render && .venv/bin/python ../logo/logo.py preview   # out/marchio.png, a few seconds
    cd scripts/render && .venv/bin/python ../logo/logo.py final     # the master, 1331 × 1024, some minutes
    npm run brand:logo                                               # (in rilievi/) master → public/img/brand

Uses the venv of scripts/render (mitsuba, numpy, pillow — pinned in its requirements.txt).
"""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import mitsuba as mi
import numpy as np
from PIL import Image, ImageDraw, ImageFont

mi.set_variant('llvm_ad_mono')

HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'
FONT = HERE.parents[1] / 'node_modules/@fontsource/fira-sans-condensed/files/fira-sans-condensed-latin-700-normal.woff'
T = mi.ScalarTransform4f
# The plate is 1.3 : 1; the camera sees half a width of CAM on each side (the plate is 1 wide): 2 % margin.
ASPECT = 1.3
CAM = 0.51


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur, edges clamped."""
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = a.astype(np.float32)
    for axis in (0, 1):
        padded = np.pad(out, [(r, r) if i == axis else (0, 0) for i in range(2)], mode='edge')
        n = out.shape[axis]
        out = sum(w * np.take(padded, np.arange(i, i + n), axis=axis) for i, w in enumerate(k))
    return out.astype(np.float32)


def letters(text: str, w: int, h: int, cx: float, cy: float, cap: float) -> np.ndarray:
    """A 0..1 mask of `text` with a cap height of `cap` px, centred on (cx, cy); drawn 4x and reduced."""
    s = 4
    font = ImageFont.truetype(str(FONT), int(cap * s * 1.42))
    img = Image.new('L', (w * s, h * s), 0)
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
    draw.text((cx * s - (x0 + x1) / 2, cy * s - (y0 + y1) / 2), text, font=font, fill=255)
    return np.asarray(img.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255


def rounded_rect_sdf(xx, yy, cx, cy, hw, hh, r):
    """Signed distance to a rounded rectangle, negative inside."""
    qx = np.abs(xx - cx) - (hw - r)
    qy = np.abs(yy - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def plate(w: int, h: int):
    """The height field (in width units), the steel mask (1 steel, 0 enamel) and the outline (0..1)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy, hw, hh = w / 2, h / 2, w / 2 - 2, h / 2 - 2
    d = rounded_rect_sdf(xx, yy, cx, cy, hw, hh, h * 0.16)
    inside = smoothstep(1.0, -1.0, d)
    depth = -d / w  # distance from the edge, width units
    # The edge rounds over in a quarter circle; the frame is steel; inside it the inlay sits a step lower.
    edge = 0.05 * np.sqrt(np.clip(1 - (1 - np.clip(depth / 0.035, 0, 1)) ** 2, 0, 1))
    frame = 1 - smoothstep(0.048, 0.054, depth)
    step = smoothstep(0.050, 0.056, depth)
    screws = np.zeros_like(xx)
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = cx + sx * (hw - h * 0.2), cy + sy * (hh - h * 0.2)
            r = np.hypot(xx - px, yy - py) / (h * 0.05)
            dome = np.sqrt(np.clip(1 - r * r, 0, 1))
            slot = (np.abs((xx - px) + sy * sx * (yy - py)) < h * 0.011) & (r < 0.85)
            screws = np.maximum(screws, dome * np.where(slot, 0.35, 1.0))
    glyphs = letters('RI', w, h, cx, cy + h * 0.01, h * 0.44)
    bevel = blur(glyphs, h * 0.009)
    # The faces of the letters bulge a little, so they catch the grading of the soft box like polished metal.
    pillow = blur(glyphs, h * 0.05) * bevel
    height = edge - step * 0.006 + screws * 0.016 + bevel * 0.016 + pillow * 0.008
    steel = np.clip(frame + (screws > 0.02) + glyphs, 0, 1)
    return height * inside, steel, inside


def write_ply(path: Path, height: np.ndarray, inside: np.ndarray, step: int) -> None:
    """The height field as a binary PLY: a vertex every `step` pixels, faces only inside the outline."""
    h, w = height.shape
    gy, gx = np.meshgrid(np.arange(0, h, step), np.arange(0, w, step), indexing='ij')
    z = height[gy, gx]
    ins = inside[gy, gx] > 0.5
    pos = np.stack([(gx - w / 2) / w, -(gy - h / 2) / w, z], axis=-1).reshape(-1, 3)
    uv = np.stack([gx / (w - 1), 1 - gy / (h - 1)], axis=-1).reshape(-1, 2)
    ny, nx = gy.shape
    idx = np.arange(ny * nx).reshape(ny, nx)
    a, b, c, d = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
    keep = (ins[:-1, :-1] & ins[:-1, 1:] & ins[1:, :-1] & ins[1:, 1:]).ravel()
    tris = np.concatenate([np.stack([a, c, b], -1).reshape(-1, 3)[keep],
                           np.stack([b, c, d], -1).reshape(-1, 3)[keep]])
    vert = np.zeros(len(pos), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('u', '<f4'), ('v', '<f4')])
    vert['x'], vert['y'], vert['z'] = pos[:, 0], pos[:, 1], pos[:, 2]
    vert['u'], vert['v'] = uv[:, 0], uv[:, 1]
    face = np.zeros(len(tris), dtype=[('n', 'u1'), ('i', '<i4', (3,))])
    face['n'], face['i'] = 3, tris
    head = (f'ply\nformat binary_little_endian 1.0\nelement vertex {len(vert)}\n'
            'property float x\nproperty float y\nproperty float z\nproperty float u\nproperty float v\n'
            f'element face {len(face)}\nproperty list uchar int vertex_indices\nend_header\n')
    with open(path, 'wb') as f:
        f.write(head.encode('ascii'))
        f.write(vert.tobytes())
        f.write(face.tobytes())


def mask_texture(values: np.ndarray) -> dict:
    data = np.clip(values, 0, 1).astype(np.float32)[::-1].copy()[..., None]
    return {'type': 'bitmap', 'bitmap': mi.Bitmap(data, pixel_format=mi.Bitmap.PixelFormat.Y),
            'raw': True, 'filter_type': 'bilinear', 'wrap_mode': 'clamp'}


def light(at, size, radiance: float) -> dict:
    """A rectangular area light at `at`, facing the plate."""
    return {'type': 'rectangle',
            'to_world': T().look_at(origin=list(at), target=[0, 0, 0], up=[0, 1, 0]) @ T().scale([size[0] / 2, size[1] / 2, 1]),
            'emitter': {'type': 'area', 'radiance': {'type': 'uniform', 'value': radiance}}}


def scene(mesh: Path, steel_mask: np.ndarray, width: int, height: int) -> dict:
    steel = {'type': 'roughconductor', 'distribution': 'ggx', 'alpha': 0.12,
             'specular_reflectance': {'type': 'uniform', 'value': 0.92}}
    # Satin black enamel: a weak, wide reflection, so the flat stays black under the soft box.
    enamel = {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': 0.22,
              'specular_reflectance': {'type': 'uniform', 'value': 0.35},
              'diffuse_reflectance': {'type': 'uniform', 'value': 0.02}}
    # The soft box behind the camera, graded from the top down: the sheen on the flat steel.
    ramp = (np.linspace(1.0, 0.0, 256, dtype=np.float32) ** 1.6 * 2.6 + 0.12)[:, None].repeat(8, 1)
    softbox = {'type': 'rectangle',
               'to_world': T().look_at(origin=[0, 0.25, 3.5], target=[0, 0, 0], up=[0, 1, 0]) @ T().scale([2.2, 2.2, 1]),
               'emitter': {'type': 'area', 'radiance': {'type': 'bitmap', 'raw': True,
                           'bitmap': mi.Bitmap(ramp[..., None], pixel_format=mi.Bitmap.PixelFormat.Y)}}}
    return {
        'type': 'scene',
        'integrator': {'type': 'path', 'max_depth': 8, 'hide_emitters': True},
        'sensor': {
            'type': 'orthographic',
            # In front of the soft box (z = 3.5), which must not hide the plate.
            'to_world': T().look_at(origin=[0, 0, 2], target=[0, 0, 0], up=[0, 1, 0]) @ T().scale([CAM, CAM, 1]),
            'film': {'type': 'hdrfilm', 'width': width, 'height': height, 'pixel_format': 'luminance_alpha',
                     'rfilter': {'type': 'gaussian'}},
            'sampler': {'type': 'multijitter', 'sample_count': 16},
        },
        'plate': {'type': 'ply', 'filename': str(mesh),
                  'bsdf': {'type': 'blendbsdf', 'weight': mask_texture(steel_mask), 'bsdf_0': enamel, 'bsdf_1': steel}},
        'softbox': softbox,
        'key': light([-2.2, 2.4, 1.6], (1.6, 1.6), 9.0),
        'rim_right': light([2.6, -0.6, 0.8], (0.4, 2.4), 7.0),
        'rim_top': light([0.4, 2.8, 0.5], (2.4, 0.3), 6.0),
        'fill': {'type': 'constant', 'radiance': {'type': 'uniform', 'value': 0.06}},
    }


def render(out_height: int, spp: int, field_height: int) -> Path:
    fw, fh = round(field_height * ASPECT), field_height
    height_field, steel_mask, inside = plate(fw, fh)
    out_w = round(out_height * ASPECT)
    with tempfile.TemporaryDirectory() as tmp:
        mesh = Path(tmp) / 'plate.ply'
        write_ply(mesh, height_field, inside, step=2)
        sc = mi.load_dict(scene(mesh, steel_mask, out_w, out_height))
        started = time.time()
        acc = np.zeros((out_height, out_w, 2), np.float64)
        passes = max(1, spp // 16)
        for i in range(passes):
            acc += np.array(mi.render(sc, spp=16, seed=i), dtype=np.float64)
        print(f'marchio: {out_w}×{out_height}, {spp} spp, {time.time() - started:.0f} s', flush=True)
    img = acc / passes
    lum, alpha = img[..., 0], np.clip(img[..., 1], 0, 1)
    # Linear → display: unpremultiplied by alpha, a filmic shoulder, then the sRGB curve.
    lum = np.where(alpha > 1e-4, lum / np.maximum(alpha, 1e-4), 0)
    v = np.clip((lum * (2.51 * lum + 0.03)) / (lum * (2.43 * lum + 0.59) + 0.14), 0, 1)
    v = np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    OUT.mkdir(exist_ok=True)
    path = OUT / 'marchio.png'
    # Grey + alpha, 8 bits: the page shows it at most 150 px tall, the reduction smooths every step.
    Image.fromarray(np.clip(np.stack([v, alpha], -1) * 255 + 0.5, 0, 255).astype(np.uint8)).save(path)
    return path


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        print(render(out_height=360, spp=64, field_height=1000))
    elif mode == 'final':
        print(render(out_height=1024, spp=1024, field_height=2000))
    else:
        raise SystemExit('usage: logo.py preview|final')


if __name__ == '__main__':
    main()
