"""The hero: a lift shaft seen from the pit, looking up.

Cast-concrete walls with formwork joints, the car guide rails on the side walls with their brackets,
the counterweight in its rails on the back wall, the underside of the car with the apron and the
travelling cable, landing doors on the front wall with the light of the landings coming through the
gaps, and the shaft lamps ("luce vano") on every floor.
"""

from __future__ import annotations

import numpy as np

from .common import (Scene, area_light, box, brushed, concrete, matte, painted, panel, perspective,
                     rod, steel)

W, D = 1.9, 2.15  # width (x) and depth (z); +z is the landing side
PIT, FLOOR, FLOORS = 1.4, 3.1, 7
H = PIT + FLOOR * FLOORS + 1.6


def guide_rail(scene: Scene, x: float, z: float, along: str, facing: int, length: float, bsdf: dict,
               foot: float = 0.089, blade: float = 0.062) -> None:
    """A T rail: the foot against the wall, the blade towards the car (`facing` ±1 on `along`)."""
    y = 0.1 + length / 2
    if along == 'x':
        scene.add(box((0.01, length, foot), (x, y, z), bsdf))
        scene.add(box((blade, length, 0.016), (x + facing * (0.005 + blade / 2), y, z), bsdf))
    else:
        scene.add(box((foot, length, 0.01), (x, y, z), bsdf))
        scene.add(box((0.016, length, blade), (x, y, z + facing * (0.005 + blade / 2)), bsdf))


def vano(width: int, height: int) -> dict:
    s = Scene()
    def wall(across: float, along: float) -> dict:
        return concrete(seed=21, tone=0.5, boards=4, repeat=(across / 2, along / 2))

    pit_floor = concrete(seed=33, tone=0.42, boards=1)
    rail = steel(alpha=0.22, tone=0.62)
    black = painted(tone=0.08, alpha=0.3, seed=4)
    grey = painted(tone=0.38, alpha=0.2, seed=8)
    door = brushed(seed=12, tone=0.7)
    rope = steel(alpha=0.35, tone=0.45)
    cable = matte(0.04)

    t = 0.25
    s.add(panel((-W / 2, H / 2, 0), (1, 0, 0), (D, H), wall(D, H)))
    s.add(panel((W / 2, H / 2, 0), (-1, 0, 0), (D, H), wall(D, H)))
    s.add(panel((0, H / 2, -D / 2), (0, 0, 1), (W, H), wall(W, H)))
    s.add(panel((0, H, 0), (0, -1, 0), (W, D), wall(W, D), up=(0, 0, 1)))
    s.add(panel((0, 0, 0), (0, 1, 0), (W, D), pit_floor, up=(0, 0, 1)))

    # Front wall with a door per floor; behind each, the light of the landing.
    door_w, door_h, door_x = 0.9, 2.1, 0.15
    z_wall = D / 2
    s.add(panel((0, PIT / 2, z_wall), (0, 0, -1), (W, PIT), wall(W, PIT)))
    for f in range(FLOORS + 1):
        sill = PIT + f * FLOOR
        top = H if f == FLOORS else sill + FLOOR
        left = door_x - door_w / 2 + W / 2
        right = W / 2 - (door_x + door_w / 2)
        s.add(panel((-W / 2 + left / 2, (sill + top) / 2, z_wall), (0, 0, -1), (left, top - sill),
                    wall(left, top - sill)))
        s.add(panel((W / 2 - right / 2, (sill + top) / 2, z_wall), (0, 0, -1), (right, top - sill),
                    wall(right, top - sill)))
        above = top - sill - door_h
        s.add(panel((door_x, sill + door_h + above / 2, z_wall), (0, 0, -1), (door_w, above),
                    wall(door_w, above)))
        # The reveals of the opening (the thickness of the wall).
        for side in (-1, 1):
            s.add(box((0.02, door_h, t), (door_x + side * (door_w / 2 + 0.01), sill + door_h / 2,
                                          D / 2 + t / 2), matte(0.35)))
        leaf = door_w / 2 - 0.006
        for side in (-1, 1):
            s.add(box((leaf, door_h, 0.03), (door_x + side * (door_w / 4 + 0.003), sill + door_h / 2,
                                                D / 2 + 0.06), door))
        s.add(box((door_w + 0.24, 0.05, 0.16), (door_x, sill - 0.025, D / 2 - 0.02), rail))
        s.add(box((door_w + 0.3, 0.22, 0.12), (door_x, sill + door_h + 0.14, D / 2 - 0.02), grey))
        s.add(box((0.12, 0.3, 0.12), (door_x + door_w / 2 + 0.2, sill + door_h + 0.05, D / 2 - 0.04), black))
        s.add(area_light((door_x, sill + door_h / 2, D / 2 + t + 0.2), (door_x, sill + door_h / 2, 0),
                         (door_w + 0.2, door_h + 0.1), 9.0))

    # Car guide rails on the side walls, brackets every 2.5 m.
    for side in (-1, 1):
        x = side * (W / 2 - 0.005)
        guide_rail(s, x, -0.05, 'x', -side, H - 0.2, rail)
        for y in np.arange(1.2, H - 0.5, 2.5):
            s.add(box((0.09, 0.006, 0.16), (side * (W / 2 - 0.045), y, -0.05), black))
            s.add(box((0.006, 0.12, 0.16), (side * (W / 2 - 0.003), y - 0.06, -0.05), black))

    # Counterweight rails, counterweight and its ropes on the back wall.
    for x in (-0.42, 0.42):
        guide_rail(s, x, -D / 2 + 0.005, 'z', 1, H - 0.2, rail, foot=0.07, blade=0.05)
    cw = PIT + FLOOR * 3.2
    s.add(box((0.78, 3.0, 0.08), (0, cw + 1.5, -D / 2 + 0.16), black))
    for i in range(26):
        s.add(box((0.7, 0.092, 0.11), (0, cw + 0.2 + i * 0.1, -D / 2 + 0.16), grey))
    for r in np.arange(-2.5, 3.0, 1.0):
        s.add(rod((r * 0.05, cw + 3.0, -D / 2 + 0.16), (r * 0.05, H - 0.1, -D / 2 + 0.16), 0.005, rope))

    # The car high in the shaft: platform, frame, apron under the door, safety gear at the rails.
    car = PIT + FLOOR * 5.4
    s.add(box((1.5, 0.16, 1.55), (0, car, 0.12), black))
    s.add(box((1.62, 0.2, 0.16), (0, car - 0.12, -0.05), grey))
    for x in (-0.6, 0.6):
        s.add(box((0.12, 0.12, 1.5), (x, car - 0.13, 0.12), grey))
    s.add(box((0.95, 0.75, 0.02), (door_x, car - 0.45, D / 2 - 0.12), door))
    for side in (-1, 1):
        s.add(box((0.16, 0.24, 0.2), (side * (W / 2 - 0.13), car - 0.08, -0.05), black))
    s.add(box((1.5, 2.3, 1.55), (0, car + 1.25, 0.12), black))

    # Travelling cable: a loop from under the car down to the middle of the side wall.
    fix = PIT + FLOOR * 1.9
    points = np.array([(-0.55, car - 0.2, 0.55), (-0.58, (car + fix) / 2, 0.6), (-0.62, fix - 1.2, 0.68),
                       (-0.7, fix - 0.95, 0.8), (-W / 2 + 0.05, fix, 0.8)])
    for a, b in zip(points[:-1], points[1:]):
        s.add(rod(a, b, 0.018, cable))

    # Shaft lamps on the back wall, one per floor, the light at the top, the work lamp in the pit.
    for f in range(FLOORS + 1):
        y = PIT + f * FLOOR + 1.6
        s.add(box((0.14, 0.3, 0.06), (-0.75, y, -D / 2 + 0.03), grey))
        s.add(area_light((-0.75, y, -D / 2 + 0.065), (-0.75, y, 1), (0.1, 0.24), 14.0))
    s.add(area_light((0, H - 0.05, 0), (0, 0, 0), (0.8, 0.8), 18.0, up=(0, 0, 1)))
    s.add(area_light((0.55, 0.15, 0.95), (-0.3, 4, -0.8), (0.35, 0.25), 1.2))

    # The pit: buffers and the ladder.
    for x in (-0.35, 0.35):
        s.add(box((0.16, 0.5, 0.16), (x, 0.25, 0.2), grey))
    for y in np.arange(0.25, PIT + 0.5, 0.28):
        s.add(box((0.4, 0.025, 0.025), (-0.55, y, D / 2 - 0.12), rail))

    portrait = height > width
    camera = perspective((0.05, 0.7, 0.1), (0.0, 20.0, -0.25), 62 if portrait else 46, up=(0, 0, -1))
    return s.to_dict(camera, width, height)


EXPOSURE = 1.0
