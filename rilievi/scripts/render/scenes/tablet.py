"""The portal on a tablet in the machine room.

The tablet lies on the grey painted top of the control cabinet, its screen showing the new sheet form
of the portal (a real screenshot, assets/schermo.png, made with the dev server), a printed A4 sheet
beside it. Window light from the left, shallow depth of field on the screen.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from .common import (T, Scene, area_light, bitmap, box, concrete, matte, painted, panel, perspective,
                     steel)

SCREEN = Path(__file__).resolve().parent.parent / 'assets' / 'schermo.png'


def screen_radiance(level: float = 0.32) -> np.ndarray:
    """The screenshot as linear luminance (rows flipped: the first row of the array is the bottom)."""
    srgb = np.asarray(Image.open(SCREEN).convert('L'), dtype=np.float32) / 255.0
    linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    return (linear * level)[::-1].copy()


def tablet(width: int, height: int) -> dict:
    s = Scene()
    top = painted(tone=0.46, alpha=0.32, seed=61)  # the grey paint of a control cabinet
    body = steel(alpha=0.32, tone=0.32)
    bezel = {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': 0.03,
             'diffuse_reflectance': {'type': 'uniform', 'value': 0.015}}
    paper = matte(0.82)

    # The cabinet: its top, the front edge, the room behind falling into the dark.
    s.add(panel((0, 0, 0), (0, 1, 0), (1.2, 0.6), top, up=(0, 0, -1)))
    s.add(box((1.2, 0.9, 0.02), (0, -0.45, 0.3), painted(tone=0.32, alpha=0.3)))
    s.add(panel((0, 0.6, -1.6), (0, 0, 1), (5, 3), concrete(seed=71, tone=0.3, boards=3, repeat=(2.5, 1.5))))

    # The tablet, a little turned towards the camera.
    angle = -14
    turn = T().rotate([0, 1, 0], angle)
    w, d = 0.252, 0.178
    s.add({'type': 'cube', 'to_world': turn @ T().translate([0, 0.0045, 0]) @ T().scale([w / 2, 0.0045, d / 2]),
           'bsdf': body})
    s.add({'type': 'rectangle',
           'to_world': turn @ T().translate([0, 0.00905, 0]) @ T().rotate([1, 0, 0], -90)
           @ T().scale([w / 2 - 0.002, d / 2 - 0.002, 1]),
           'bsdf': bezel})
    sw, sd = 0.2365, 0.1645
    s.add({'type': 'rectangle',
           'to_world': turn @ T().translate([0, 0.0091, 0]) @ T().rotate([1, 0, 0], -90) @ T().scale([sw / 2, sd / 2, 1]),
           'emitter': {'type': 'area', 'radiance': bitmap(screen_radiance(), srgb=False)},
           'bsdf': bezel})

    # A printed sheet beside it, slightly askew.
    s.add({'type': 'rectangle',
           'to_world': T().translate([0.27, 0.0005, 0.04]) @ T().rotate([0, 1, 0], 8) @ T().rotate([1, 0, 0], -90)
           @ T().scale([0.105, 0.1485, 1]),
           'bsdf': paper})

    # Window light from the left and a little fill from the room.
    s.add(area_light((-0.95, 0.4, -0.35), (0, 0, 0), (0.9, 0.7), 4.5))
    s.add(area_light((0.8, 1.6, 1.2), (0, 0, 0), (1.0, 1.0), 0.2))

    origin = (0.05, 0.36, 0.38)
    target = (0.0, 0.006, 0.0)
    focus = float(np.linalg.norm(np.subtract(origin, target)))
    portrait = height > width
    camera = perspective(origin, target, 42 if portrait else 34, focus=focus, aperture=0.004)
    return s.to_dict(camera, width, height)
