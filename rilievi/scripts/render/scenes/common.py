"""Shared pieces of the landing renders (Mitsuba 3, monochrome).

Procedural textures drawn with numpy (cast concrete with formwork joints, brushed and painted steel),
so nothing comes from a third party; boxes, cylinders and area lights placed in metres; the materials
of a lift. The renders are black and white: materials carry only lightness and roughness.
"""

from __future__ import annotations

import numpy as np
import mitsuba as mi

T = mi.ScalarTransform4f
TEX = 1024


def fbm(size: int, seed: int, octaves: int = 5, base: int = 8, gain: float = 0.5,
        stretch: tuple[float, float] = (1, 1)) -> np.ndarray:
    """Tileable value noise with octaves, values 0..1, shape (size, size)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    coords = np.arange(size, dtype=np.float32) / size
    for o in range(octaves):
        cx = max(1, round(base * stretch[0] * 2 ** o))
        cy = max(1, round(base * stretch[1] * 2 ** o))
        grid = rng.random((cy, cx), dtype=np.float32)
        gx, gy = coords * cx, coords * cy
        x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
        fx, fy = gx - x0, gy - y0
        sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a = grid[np.ix_(y0 % cy, x0 % cx)]
        b = grid[np.ix_(y0 % cy, (x0 + 1) % cx)]
        c = grid[np.ix_((y0 + 1) % cy, x0 % cx)]
        d = grid[np.ix_((y0 + 1) % cy, (x0 + 1) % cx)]
        top = a + (b - a) * sx[None, :]
        bottom = c + (d - c) * sx[None, :]
        out += amp * (top + (bottom - top) * sy[:, None])
        total += amp
        amp *= gain
    return out / total


def bitmap(values: np.ndarray, *, srgb: bool, repeat: tuple[float, float] = (1, 1)) -> dict:
    """A single-channel texture; `srgb` for albedo, linear for roughness and heights."""
    data = np.clip(values, 0, 1).astype(np.float32)[..., None]
    return {
        'type': 'bitmap',
        'bitmap': mi.Bitmap(data, pixel_format=mi.Bitmap.PixelFormat.Y),
        'raw': not srgb,
        'filter_type': 'bilinear',
        'wrap_mode': 'repeat',
        'to_uv': T().scale([repeat[0], repeat[1], 1]),
    }


_CONCRETE: dict[tuple, tuple[np.ndarray, np.ndarray]] = {}


def _concrete_fields(seed: int, tone: float, boards: int) -> tuple[np.ndarray, np.ndarray]:
    key = (seed, tone, boards)
    if key in _CONCRETE:
        return _CONCRETE[key]
    size = TEX
    rng = np.random.default_rng(seed)
    large = fbm(size, seed, octaves=6, base=3)
    fine = fbm(size, seed + 7, octaves=3, base=64)
    albedo = tone + (large - 0.5) * 0.14 + (fine - 0.5) * 0.06
    height = large * 0.75 + fine * 0.25
    pores = rng.random((size, size)) < 0.0012
    albedo[pores] -= 0.12
    height[pores] -= 0.5
    rows = np.arange(size) % (size // boards)
    joint = np.minimum(rows, size // boards - rows)
    depth = np.clip((3 - joint) / 3, 0, 1)[:, None]
    albedo -= depth * 0.16
    height -= depth * 0.9
    height = (height - height.min()) / (np.ptp(height) + 1e-6)
    # Rows of the array run along v (the `up` of a panel): the board joints are horizontal.
    _CONCRETE[key] = (albedo, height)
    return albedo, height


def concrete(seed: int = 3, tone: float = 0.5, boards: int = 4, repeat=(1, 1)) -> dict:
    """Cast concrete: mottled grey, pores, the joints of the formwork boards; bump from the same field.
    One texture tile is 2 m: `repeat` is the size of the surface in tiles."""
    albedo, height = _concrete_fields(seed, tone, boards)
    surface = {
        'type': 'diffuse',
        'reflectance': bitmap(albedo, srgb=True, repeat=repeat),
    }
    return {
        'type': 'bumpmap',
        'arbitrary': bitmap(height, srgb=False, repeat=repeat),
        'scale': 0.1,
        'bsdf': surface,
    }


def brushed(seed: int = 5, alpha: float = 0.12, tone: float = 0.85, repeat=(1, 1)) -> dict:
    """Brushed stainless: rough metal with a faint relief of fine streaks along u (use on a panel)."""
    streaks = fbm(TEX, seed, octaves=3, base=4, stretch=(1, 64))
    return {
        'type': 'bumpmap',
        'arbitrary': bitmap(streaks, srgb=False, repeat=repeat),
        'scale': 0.004,
        'bsdf': {
            'type': 'roughconductor',
            'distribution': 'ggx',
            'alpha': alpha,
            'specular_reflectance': {'type': 'uniform', 'value': tone},
        },
    }


def steel(alpha: float = 0.18, tone: float = 0.7) -> dict:
    return {'type': 'roughconductor', 'distribution': 'ggx', 'alpha': alpha,
            'specular_reflectance': {'type': 'uniform', 'value': tone}}


def painted(tone: float = 0.3, alpha: float = 0.25, seed: int = 9) -> dict:
    """Painted steel: diffuse paint under a rough clear layer, a little wear in the colour."""
    wear = fbm(TEX // 2, seed, octaves=5, base=6)
    return {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': alpha,
            'diffuse_reflectance': bitmap(tone + (wear - 0.5) * 0.06, srgb=True)}


def matte(tone: float) -> dict:
    return {'type': 'diffuse', 'reflectance': {'type': 'uniform', 'value': tone}}


def box(size, at, bsdf, rotate=None) -> dict:
    """An axis-aligned box of `size` (w, h, d) centred at `at`; optional (axis, degrees) rotation."""
    to_world = T().translate(list(at))
    if rotate:
        to_world = to_world @ T().rotate(list(rotate[0]), rotate[1])
    to_world = to_world @ T().scale([size[0] / 2, size[1] / 2, size[2] / 2])
    return {'type': 'cube', 'to_world': to_world, 'bsdf': bsdf}


def panel(center, normal, size, bsdf, up=(0, 1, 0)) -> dict:
    """A one-sided rectangle (a wall seen from one side) of `size` (across, along `up`), facing `normal`.
    Its texture runs across (u) and along `up` (v) — unlike the faces of a cube, the orientation is known."""
    target = [center[i] + normal[i] for i in range(3)]
    to_world = T().look_at(origin=list(center), target=target, up=list(up)) @ T().scale(
        [size[0] / 2, size[1] / 2, 1])
    return {'type': 'rectangle', 'to_world': to_world, 'bsdf': bsdf}


def rod(p0, p1, radius, bsdf) -> dict:
    return {'type': 'cylinder', 'p0': list(p0), 'p1': list(p1), 'radius': radius, 'bsdf': bsdf}


def area_light(at, target, size, radiance, up=(0, 1, 0)) -> dict:
    """A one-sided rectangular light at `at`, facing `target`."""
    to_world = T().look_at(origin=list(at), target=list(target), up=list(up)) @ T().scale(
        [size[0] / 2, size[1] / 2, 1])
    return {'type': 'rectangle', 'to_world': to_world,
            'emitter': {'type': 'area', 'radiance': {'type': 'uniform', 'value': radiance}},
            'bsdf': matte(0.0)}


class Scene:
    """Collects named shapes; `to_dict` adds the camera, film and integrator."""

    def __init__(self) -> None:
        self.items: dict[str, dict] = {}

    def add(self, item: dict) -> None:
        self.items[f'i{len(self.items):04d}'] = item

    def to_dict(self, camera: dict, width: int, height: int, max_depth: int = 8) -> dict:
        sensor = dict(camera)
        sensor['film'] = {'type': 'hdrfilm', 'width': width, 'height': height,
                          'rfilter': {'type': 'gaussian'}, 'pixel_format': 'luminance'}
        sensor['sampler'] = {'type': 'multijitter', 'sample_count': 16}
        return {'type': 'scene', 'integrator': {'type': 'path', 'max_depth': max_depth},
                'sensor': sensor, **self.items}


def perspective(origin, target, fov: float, up=(0, 1, 0), focus: float | None = None,
                aperture: float = 0.0) -> dict:
    """A pinhole camera, or a thin lens with depth of field when `aperture` is set."""
    to_world = T().look_at(origin=list(origin), target=list(target), up=list(up))
    if aperture > 0:
        return {'type': 'thinlens', 'to_world': to_world, 'fov': fov, 'fov_axis': 'y',
                'aperture_radius': aperture, 'focus_distance': focus}
    return {'type': 'perspective', 'to_world': to_world, 'fov': fov, 'fov_axis': 'y'}
