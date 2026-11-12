"""The car operating panel close up.

A brushed stainless strip in the car wall, round push buttons with the floor numbers, the door buttons
and the alarm bell, a small display above. Shallow depth of field on the button of the third floor,
light from the car ceiling.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .common import (T, Scene, area_light, bitmap, box, brushed, matte, panel, perspective, rod,
                     steel)

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def glyph(text: str, size: int = 512, ink: float = 0.08, paper: float = 0.82,
          scale: float = 0.5) -> np.ndarray:
    """A square texture: the glyph centred on a light face (values 0..1)."""
    image = Image.new('L', (size, size), int(paper * 255))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, int(size * scale))
    box_ = draw.textbbox((0, 0), text, font=font)
    w, h = box_[2] - box_[0], box_[3] - box_[1]
    draw.text(((size - w) / 2 - box_[0], (size - h) / 2 - box_[1]), text, fill=int(ink * 255), font=font)
    return np.asarray(image, dtype=np.float32)[::-1] / 255.0


def bell(size: int = 512, ink: float = 0.08, paper: float = 0.82) -> np.ndarray:
    """The alarm bell drawn as a shape (the font has no bell)."""
    image = Image.new('L', (size, size), int(paper * 255))
    draw = ImageDraw.Draw(image)
    c, u = size / 2, size / 100
    fill = int(ink * 255)
    draw.chord((c - 18 * u, 28 * u, c + 18 * u, 64 * u), 180, 360, fill=fill)
    draw.polygon([(c - 18 * u, 46 * u), (c + 18 * u, 46 * u), (c + 24 * u, 66 * u), (c - 24 * u, 66 * u)],
                 fill=fill)
    draw.rectangle((c - 26 * u, 66 * u, c + 26 * u, 70 * u), fill=fill)
    draw.ellipse((c - 5 * u, 70 * u, c + 5 * u, 78 * u), fill=fill)
    draw.ellipse((c - 3 * u, 22 * u, c + 3 * u, 29 * u), fill=fill)
    return np.asarray(image, dtype=np.float32)[::-1] / 255.0


def disc_mask(size: int = 512) -> np.ndarray:
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(xx - size / 2 + 0.5, yy - size / 2 + 0.5) / (size / 2)
    return np.clip((1.0 - r) * size / 4, 0, 1).astype(np.float32)


def button(s: Scene, x: float, y: float, z: float, label: str, ring: dict, r: float = 0.019,
           lit: bool = False) -> None:
    """A round push button: a steel ring standing out of the panel, the face with its engraved glyph."""
    s.add(rod((x, y, z), (x, y, z + 0.0045), r + 0.005, ring))
    s.add({'type': 'disk', 'to_world': T().translate([x, y, z + 0.0045]) @ T().scale([r + 0.005] * 3),
           'bsdf': ring})
    face = {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': 0.12,
            'diffuse_reflectance': bitmap(bell() if label == 'bell' else glyph(label), srgb=True)}
    s.add({'type': 'rectangle',
           'to_world': T().translate([x, y, z + 0.0058]) @ T().scale([r, r, 1]),
           'bsdf': {'type': 'mask', 'opacity': bitmap(disc_mask(), srgb=False), 'bsdf': face}})
    if lit:
        # The call is registered: a thin glowing ring around the face.
        s.add(area_light((x, y - r - 0.0025, z + 0.005), (x, y - r - 0.0025, 1), (r * 1.4, 0.0012), 30.0))


def bottoniera(width: int, height: int) -> dict:
    s = Scene()
    wall_steel = brushed(seed=41, tone=0.5, alpha=0.22, repeat=(1, 4))
    panel_steel = brushed(seed=43, tone=0.86, alpha=0.1, repeat=(1, 5))
    chrome = steel(alpha=0.04, tone=0.92)
    glass = {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': 0.03,
             'diffuse_reflectance': {'type': 'uniform', 'value': 0.02}}

    # Car wall: three brushed panels with dark joints; the operating panel in the middle one.
    for x in (-0.62, 0.0, 0.62):
        s.add(panel((x, 1.15, 0.0), (0, 0, 1), (0.594, 2.3), wall_steel))
    s.add(panel((0, 1.15, -0.004), (0, 0, 1), (1.9, 2.3), matte(0.02)))
    s.add(panel((0, 1.2, 0.012), (0, 0, 1), (0.26, 1.3), panel_steel))
    for x in (-0.13, 0.13):
        s.add(panel((x, 1.2, 0.006), (1 if x > 0 else -1, 0, 0), (0.012, 1.3), panel_steel))
    z = 0.012

    # Display with the floor the car is at.
    s.add(box((0.11, 0.08, 0.004), (0, 1.72, z + 0.002), glass))
    digit = glyph('3', ink=1.0, paper=0.0, scale=0.7)
    s.add({'type': 'rectangle', 'to_world': T().translate([0, 1.72, z + 0.0042]) @ T().scale([0.03, 0.03, 1]),
           'emitter': {'type': 'area', 'radiance': {**bitmap(digit * 6.0, srgb=False)}},
           'bsdf': matte(0.0)})

    floors = ['6', '7', '4', '5', '2', '3', '0', '1']
    for i, label in enumerate(floors):
        x = -0.045 if i % 2 == 0 else 0.045
        y = 1.56 - (i // 2) * 0.085
        button(s, x, y, z, label, chrome, lit=(label == '3'))
    for label, x, y, r in (('◀▶', -0.045, 1.13, 0.019), ('▶◀', 0.045, 1.13, 0.019), ('bell', 0.0, 1.03, 0.022)):
        button(s, x, y, z, label, chrome, r=r)

    # The car around the camera: the ceiling light, a handrail, the floor, the wall behind the camera.
    s.add(area_light((0.2, 2.28, 0.7), (0.2, 0, 0.7), (1.4, 0.9), 3.0, up=(0, 0, 1)))
    s.add(panel((0, 0, 0.7), (0, 1, 0), (1.9, 1.6), matte(0.1), up=(0, 0, 1)))
    s.add(panel((0, 1.15, 1.5), (0, 0, -1), (1.9, 2.3), matte(0.55)))
    s.add(rod((-1.0, 0.92, 0.07), (0.9, 0.92, 0.07), 0.018, chrome))

    target = (0.045, 1.39, 0.012)
    origin = (0.46, 1.52, 0.44)
    focus = float(np.linalg.norm(np.subtract(origin, target)))
    portrait = height > width
    camera = perspective(origin, (0.0, 1.43, 0.0), 40 if portrait else 34, focus=focus, aperture=0.005)
    return s.to_dict(camera, width, height)
