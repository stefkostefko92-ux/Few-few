"""cslib — фотореалистичната работилница на Carbon Stealth в Blender 4.2 (Cycles).

Всичко е процедурно и се пресъздава 1:1 на всеки компютър (без външни текстури и HDRI):
  * карбон — истинска плетка 2×2 twill, изчислена с numpy (височина → нормали, посока на влакното,
    отделни нишки), под прозрачен лак с фини драскотини и следи;
  * метали — шлайфан, фрезован (дъги от челна фреза), анодиран, полиран; сапфир; светещ акрил;
  * студио — софтбоксове като светещи плоскости с градиент (виждат се в отраженията, както в истинско
    продуктово студио), лазерен проектор на линия (прожектор с прорез, пада вярно върху геометрията);
  * обектив — дълбочина на рязкост; пост — лек ореол, хроматична аберация, винетка; AgX тонова крива.

Мерна единица: 1 единица в Blender = 10 mm (нишката на карбона е 2 mm → 0.2).
"""
import math
import os

import bpy  # преди bmesh/mathutils: като Python модул те се зареждат заедно с bpy
import bmesh
import numpy as np
from mathutils import Vector

CYAN = (0.0, 0.784, 1.0)  # #00e5ff, линейно
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_MONO = os.path.join(HERE, "fonts", "space-mono-latin-0319ea.ttf")
TOWS = 8  # нишки в една плочка на текстурата (кратно на 4 → безшевно)


# ── сцена и рендер ─────────────────────────────────────────────────────────────────────────────
def reset(samples=256, transparent=False, look="AgX - Medium High Contrast", exposure=0.0, noise=0.01):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    c = sc.cycles
    c.device = "CPU"
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = noise
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    c.denoising_prefilter = "ACCURATE"
    c.max_bounces = 12
    c.diffuse_bounces = 4
    c.glossy_bounces = 8
    c.transmission_bounces = 12
    c.transparent_max_bounces = 12
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 8.0
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = look
    sc.view_settings.exposure = exposure
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.render.image_settings.color_depth = "16"
    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
    sc.world = w
    return sc


def render(path, res, samples=None, border=None):
    """border=(x0, y0, x1, y1) в дялове от кадъра (0..1, от долу-ляво) → рендерира само изрез в пълен размер."""
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    if border:
        sc.render.use_border = sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = border
    if samples:
        sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def post(glare=0.12, threshold=1.2, size=7, dispersion=0.0, vignette=0.0, alpha=False):
    """Пост в компоситора: ореол около силните източници, лека хроматична аберация, винетка.
    alpha=True (икони на прозрачен фон): ореолът разширява и алфа канала, за да не се отреже."""
    sc = bpy.context.scene
    sc.use_nodes = True
    t = sc.node_tree
    for n in list(t.nodes):
        t.nodes.remove(n)
    N, L = t.nodes, t.links
    rl = N.new("CompositorNodeRLayers")
    out = N.new("CompositorNodeComposite")
    out.use_alpha = True
    img = rl.outputs["Image"]
    glow = None
    if glare > 0:
        g = N.new("CompositorNodeGlare")
        g.glare_type = "FOG_GLOW"
        g.quality = "HIGH"
        g.threshold = threshold
        g.size = size
        g.mix = 1.0  # само ореолът
        L.new(img, g.inputs[0])
        add = N.new("CompositorNodeMixRGB")
        add.blend_type = "ADD"
        add.inputs[0].default_value = glare
        L.new(img, add.inputs[1])
        L.new(g.outputs[0], add.inputs[2])
        glow = g.outputs[0]
        img = add.outputs[0]
    if dispersion > 0:
        d = N.new("CompositorNodeLensdist")
        d.use_fit = True
        d.inputs["Dispersion"].default_value = dispersion
        L.new(img, d.inputs["Image"])
        img = d.outputs["Image"]
    if vignette > 0:
        e = N.new("CompositorNodeEllipseMask")
        e.width, e.height = 1.25, 1.35
        b = N.new("CompositorNodeBlur")
        b.use_relative = True
        b.factor_x = b.factor_y = 28
        b.filter_type = "FAST_GAUSS"
        L.new(e.outputs[0], b.inputs[0])
        m = N.new("CompositorNodeMixRGB")
        m.blend_type = "MULTIPLY"
        m.inputs[0].default_value = vignette
        L.new(img, m.inputs[1])
        L.new(b.outputs[0], m.inputs[2])
        img = m.outputs[0]
    if alpha:
        a = rl.outputs["Alpha"]
        if glow is not None:
            bw = N.new("CompositorNodeRGBToBW")
            L.new(glow, bw.inputs[0])
            sc_ = N.new("CompositorNodeMath")
            sc_.operation = "MULTIPLY"
            sc_.inputs[1].default_value = glare * 1.6
            sc_.use_clamp = True
            L.new(bw.outputs[0], sc_.inputs[0])
            mx = N.new("CompositorNodeMath")
            mx.operation = "MAXIMUM"
            L.new(a, mx.inputs[0])
            L.new(sc_.outputs[0], mx.inputs[1])
            a = mx.outputs[0]
        sa = N.new("CompositorNodeSetAlpha")
        sa.mode = "REPLACE_ALPHA"
        L.new(img, sa.inputs["Image"])
        L.new(a, sa.inputs["Alpha"])
        img = sa.outputs[0]
    L.new(img, out.inputs["Image"])


# ── карбонова плетка (numpy) ───────────────────────────────────────────────────────────────────
def _carbon_arrays(res=2048, tows=TOWS, fibers=64, seed=11):
    """2×2 twill: основата (вертикална нишка) е отгоре, когато (ред − колона) mod 4 ∈ {0, 1}; всяка
    нишка „плава“ над две напречни и се гмурка под следващите две, с изместване 1 на ред — оттам
    диагоналът на twill. Връща (нормали RGB, [посока, влакно, височина])."""
    rng = np.random.default_rng(seed)
    n = res
    v, u = np.mgrid[0:n, 0:n].astype(np.float32)
    u = (u + 0.5) / n * tows
    v = (v + 0.5) / n * tows
    i = np.floor(u).astype(np.int32)
    j = np.floor(v).astype(np.int32)
    fu, fv = u - i, v - j
    k = (j - i) % 4
    warp = k < 2
    across = np.where(warp, fu, fv)  # напречно на нишката, 0..1
    along = np.where(warp, k + fv, (3 - k) + fu) / 2.0  # по дължината на плаващия участък, 0..1
    tow = np.where(warp, i % tows, j % tows)
    ty = np.where(warp, 0, 1)
    a = np.abs(2 * across - 1)
    cross = np.clip(1 - a ** 3.2, 0, 1) ** 0.7  # сплесната леща: широк гръб, заоблени рамене
    arc = np.sin(np.pi * along) ** 0.7
    # отделните влакна: случайна яркост на всяко, линейно преливане между съседите
    table = rng.random((2, tows, fibers + 1)).astype(np.float32)
    f = across * fibers
    f0 = np.clip(np.floor(f).astype(np.int32), 0, fibers - 1)
    ft = f - f0
    streak = table[ty, tow, f0] * (1 - ft) + table[ty, tow, f0 + 1] * ft
    # бавно „дишане“ по дължината — нишката не е идеално права лента
    wob = 0.5 + 0.5 * np.sin(along * 9.0 + table[ty, tow, 0] * 40.0)
    streak = np.clip(streak * 0.8 + wob * 0.2, 0, 1)
    height = np.clip(cross * (0.10 + 0.90 * arc) + (streak - 0.5) * 0.05 * cross, 0, 1)
    amp = 0.085  # височина на нишката в ширини на нишка
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * (n / tows) * amp
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * (n / tows) * amp
    nz = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
    one = np.ones_like(nz)
    nrm = np.stack((-gx * nz * 0.5 + 0.5, -gy * nz * 0.5 + 0.5, nz * 0.5 + 0.5, one), -1)
    msk = np.stack((ty.astype(np.float32), streak, height, one), -1)
    return nrm.astype(np.float32), msk.astype(np.float32)


def _np_image(name, arr):
    img = bpy.data.images.new(name, arr.shape[1], arr.shape[0], alpha=False, float_buffer=True, is_data=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.pack()  # без update(): той пресъздава „генерираното“ изображение и нулира пикселите
    return img


def carbon_images(res=2048):
    if "cs_carbon_n" in bpy.data.images:
        return bpy.data.images["cs_carbon_n"], bpy.data.images["cs_carbon_m"]
    nrm, msk = _carbon_arrays(res)
    return _np_image("cs_carbon_n", nrm), _np_image("cs_carbon_m", msk)


# ── помощни за нодове ──────────────────────────────────────────────────────────────────────────
def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes["Principled BSDF"], m.node_tree


class _G:
    """Малък строител на нодове, за да се четат материалите като формули."""

    def __init__(self, tree):
        self.t, self.n, self.L = tree, tree.nodes, tree.links

    def link(self, a, b):
        self.L.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        x = self.n.new("ShaderNodeMath")
        x.operation = op
        x.use_clamp = clamp
        for idx, val in enumerate((a, b)):
            if val is None:
                continue
            if isinstance(val, (int, float)):
                x.inputs[idx].default_value = val
            else:
                self.L.new(val, x.inputs[idx])
        return x.outputs[0]

    def ramp(self, v, lo, hi, out_lo=0.0, out_hi=1.0, smooth=True):
        x = self.n.new("ShaderNodeMapRange")
        x.interpolation_type = "SMOOTHSTEP" if smooth else "LINEAR"
        self.L.new(v, x.inputs[0])
        for idx, val in zip((1, 2, 3, 4), (lo, hi, out_lo, out_hi)):
            x.inputs[idx].default_value = val
        return x.outputs[0]

    def mixc(self, fac, a, b):
        x = self.n.new("ShaderNodeMix")
        x.data_type = "RGBA"
        for sock, val in ((x.inputs[0], fac), (x.inputs[6], a), (x.inputs[7], b)):
            if hasattr(val, "is_linked"):
                self.L.new(val, sock)
            elif isinstance(val, (int, float)):
                sock.default_value = val
            else:
                sock.default_value = (*val, 1)
        return x.outputs[2]

    def coords(self, scale=(1, 1, 1), rot_z=0.0, loc=(0, 0, 0)):
        tc = self.n.new("ShaderNodeTexCoord")
        mp = self.n.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        mp.inputs["Rotation"].default_value = (0, 0, rot_z)
        mp.inputs["Location"].default_value = loc
        self.L.new(tc.outputs["Object"], mp.inputs["Vector"])
        return mp.outputs["Vector"]

    def noise(self, vec, scale=5.0, detail=2.0, rough=0.5):
        x = self.n.new("ShaderNodeTexNoise")
        if vec.type == "VALUE":
            x.noise_dimensions = "1D"
            self.L.new(vec, x.inputs["W"])
            vec = None
        x.inputs["Scale"].default_value = scale
        x.inputs["Detail"].default_value = detail
        x.inputs["Roughness"].default_value = rough
        if vec is not None:
            self.L.new(vec, x.inputs["Vector"])
        return x.outputs["Fac"]

    def bump(self, height, strength, distance=0.01, normal=None):
        x = self.n.new("ShaderNodeBump")
        x.inputs["Strength"].default_value = strength
        x.inputs["Distance"].default_value = distance
        self.L.new(height, x.inputs["Height"])
        if normal is not None:
            self.L.new(normal, x.inputs["Normal"])
        return x.outputs["Normal"]

    def axis(self, v=(1, 0, 0)):
        """Ос на обекта като световен вектор — постоянна тангента за анизотропията."""
        x = self.n.new("ShaderNodeVectorTransform")
        x.vector_type = "VECTOR"
        x.convert_from = "OBJECT"
        x.convert_to = "WORLD"
        x.inputs[0].default_value = v
        return x.outputs[0]

    def scratches(self, density=1.0):
        """Фини драскотини в три посоки: силно разтегнат шум, от който остават само върховете."""
        acc = None
        for k, ang in enumerate((0.31, 1.42, 2.47)):
            vec = self.coords(scale=(0.9, 520.0, 1.0), rot_z=ang, loc=(k * 3.7, k * 1.3, 0))
            nz = self.noise(vec, scale=1.0, detail=1.0, rough=0.6)
            ln = self.ramp(nz, 0.70 - 0.03 * density, 0.74, 0.0, 1.0)
            acc = ln if acc is None else self.math("MAXIMUM", acc, ln)
        return acc

    def smudge(self, scale=0.7):
        return self.ramp(self.noise(self.coords(), scale=scale, detail=5.0, rough=0.65), 0.42, 0.75)


# ── материали ──────────────────────────────────────────────────────────────────────────────────
def mat_carbon(name="Carbon", tow=0.2, res=2048, wear=1.0, metallic=0.88, warp=1.0, gain=1.0):
    """Карбон под лак. Обектът трябва да е равнина с нормала +Z (нормалите са в обектни координати);
    плетката се върти, като се завърти самият обект около Z."""
    img_n, img_m = carbon_images(res)
    m, p, t = _principled(name)
    g = _G(t)
    s = 1.0 / (tow * TOWS)
    vec = g.coords(scale=(s, s, s))
    if warp:
        # истинската тъкан не е идеална решетка: нишките леко „плуват“ (до ~12% от ширината си) на
        # разстояние от няколко сантиметра — без това плетката издава, че е смятана
        nz = g.n.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 0.55
        nz.inputs["Detail"].default_value = 1.0
        g.link(g.coords(scale=(s * TOWS, s * TOWS, 1.0)), nz.inputs["Vector"])
        off = g.n.new("ShaderNodeVectorMath")
        off.operation = "SCALE"
        ctr = g.n.new("ShaderNodeVectorMath")
        ctr.operation = "SUBTRACT"
        ctr.inputs[1].default_value = (0.5, 0.5, 0.5)
        g.link(nz.outputs["Color"], ctr.inputs[0])
        g.link(ctr.outputs[0], off.inputs[0])
        off.inputs["Scale"].default_value = 0.030 * warp
        add = g.n.new("ShaderNodeVectorMath")
        add.operation = "ADD"
        g.link(vec, add.inputs[0])
        g.link(off.outputs[0], add.inputs[1])
        vec = add.outputs[0]
    tn = g.n.new("ShaderNodeTexImage")
    tn.image, tn.interpolation = img_n, "Cubic"
    tm = g.n.new("ShaderNodeTexImage")
    tm.image, tm.interpolation = img_m, "Cubic"
    g.link(vec, tn.inputs["Vector"])
    g.link(vec, tm.inputs["Vector"])
    nm = g.n.new("ShaderNodeNormalMap")
    nm.space = "OBJECT"
    g.link(tn.outputs["Color"], nm.inputs["Color"])
    g.link(nm.outputs["Normal"], p.inputs["Normal"])
    sep = g.n.new("ShaderNodeSeparateColor")
    g.link(tm.outputs["Color"], sep.inputs["Color"])
    kind, streak, height = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    # влакното: тъмен графит с метален отблясък, силно анизотропен; двете посоки са на 90°
    col = g.mixc(streak, tuple(c * gain for c in (0.030, 0.031, 0.033)), tuple(c * gain for c in (0.115, 0.118, 0.124)))
    gap = g.ramp(height, 0.02, 0.30)  # между нишките е смола — почти черно
    col = g.mixc(gap, (0.004, 0.004, 0.005), col)
    g.link(col, p.inputs["Base Color"])
    p.inputs["Metallic"].default_value = metallic  # остатъкът е слабо разсейване в смолата — по него се вижда лазерът
    g.link(g.math("ADD", g.math("MULTIPLY", streak, 0.14), 0.30), p.inputs["Roughness"])
    p.inputs["Anisotropic"].default_value = 0.88
    g.link(g.math("MULTIPLY", kind, 0.25), p.inputs["Anisotropic Rotation"])
    g.link(g.axis((1, 0, 0)), p.inputs["Tangent"])
    # лакът: гладък, с едва загатнат релеф на плетката отдолу, следи от пръсти и драскотини
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat IOR"].default_value = 1.52
    cr = g.math("ADD", 0.018, g.math("MULTIPLY", g.smudge(), 0.035 * wear))
    cr = g.math("ADD", cr, g.math("MULTIPLY", g.scratches(), 0.20 * wear))
    g.link(cr, p.inputs["Coat Roughness"])
    cn = g.bump(height, 0.035, 0.01)
    cn = g.bump(g.noise(g.coords(), scale=22.0, detail=1.0), 0.012, 0.01, cn)  # „портокалова кора“
    g.link(cn, p.inputs["Coat Normal"])
    return m


def mat_metal(name="Steel", color=(0.62, 0.63, 0.64), rough=0.22, brush=0.0, axis=(1, 0, 0), aniso=0.0,
              wear=1.0, streak=320.0, metallic=1.0):
    """Метал. brush > 0 → шлайф по оста `axis` (ивици в грапавостта и микрорелеф, анизотропен отблясък)."""
    m, p, t = _principled(name)
    g = _G(t)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    r = g.math("ADD", rough, g.math("MULTIPLY", g.smudge(0.9), 0.05 * wear))
    if brush > 0:
        sc = tuple(0.6 if a else streak for a in axis)
        nz = g.noise(g.coords(scale=sc), scale=1.0, detail=3.0, rough=0.7)
        r = g.math("ADD", r, g.math("MULTIPLY", g.math("SUBTRACT", nz, 0.5), 0.22 * brush))
        g.link(g.bump(nz, 0.06 * brush, 0.002), p.inputs["Normal"])
        p.inputs["Anisotropic"].default_value = aniso or 0.7
        g.link(g.axis(axis), p.inputs["Tangent"])
    r = g.math("ADD", r, g.math("MULTIPLY", g.scratches(0.6), 0.10 * wear))
    g.link(g.math("MAXIMUM", r, 0.02), p.inputs["Roughness"])
    return m


def mat_machined(name="Machined", color=(0.80, 0.81, 0.83), center=(6.0, -3.0), pitch=0.035, rough=0.16, metallic=1.0):
    """Челно фрезована повърхност: концентрични дъги от инструмента около `center` (в обектни координати).
    Отблясъкът се разтяга по дъгите — характерният „ветрилообразен“ блясък на фрезован алуминий."""
    m, p, t = _principled(name)
    g = _G(t)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    vec = g.coords(loc=(-center[0], -center[1], 0))
    sx = g.n.new("ShaderNodeSeparateXYZ")
    g.link(vec, sx.inputs[0])
    rad = g.math("SQRT", g.math("ADD", g.math("POWER", sx.outputs[0], 2.0), g.math("POWER", sx.outputs[1], 2.0)))
    ring = g.math("FRACT", g.math("DIVIDE", rad, pitch))  # зъб от всяко завъртане на фрезата
    tri = g.math("ABSOLUTE", g.math("SUBTRACT", g.math("MULTIPLY", ring, 2.0), 1.0))
    # всяко завъртане на фрезата оставя малко по-различна следа: случайна стойност на пръстен
    wob = g.noise(g.math("MULTIPLY", g.math("FLOOR", g.math("DIVIDE", rad, pitch)), 7.31), scale=1.0, detail=0.0)
    r = g.math("ADD", rough, g.math("MULTIPLY", tri, 0.07))
    r = g.math("ADD", r, g.math("MULTIPLY", g.math("SUBTRACT", wob, 0.5), 0.10))
    r = g.math("ADD", r, g.math("MULTIPLY", g.smudge(0.8), 0.04))
    g.link(r, p.inputs["Roughness"])
    g.link(g.bump(tri, 0.09, 0.002), p.inputs["Normal"])
    p.inputs["Anisotropic"].default_value = 0.75
    # тангента по дъгата = перпендикулярно на радиуса
    cmb = g.n.new("ShaderNodeCombineXYZ")
    g.link(g.math("MULTIPLY", sx.outputs[1], -1.0), cmb.inputs[0])
    g.link(sx.outputs[0], cmb.inputs[1])
    vt = g.n.new("ShaderNodeVectorTransform")
    vt.vector_type, vt.convert_from, vt.convert_to = "VECTOR", "OBJECT", "WORLD"
    g.link(cmb.outputs[0], vt.inputs[0])
    g.link(vt.outputs[0], p.inputs["Tangent"])
    return m


def mat_polished(name="Polished", color=(0.86, 0.87, 0.88), rough=0.05):
    return mat_metal(name, color, rough, wear=0.5)


def mat_anodized(name="Anodized", color=(0.014, 0.015, 0.017), rough=0.40):
    """Анодиран алуминий: цветен метален слой със сатенен блясък и фина бластирана микроструктура."""
    m, p, t = _principled(name)
    g = _G(t)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = 1.0
    r = g.math("ADD", rough, g.math("MULTIPLY", g.smudge(1.1), 0.06))
    g.link(r, p.inputs["Roughness"])
    grain = g.noise(g.coords(scale=(260, 260, 260)), scale=1.0, detail=2.0)
    g.link(g.bump(grain, 0.035, 0.001), p.inputs["Normal"])
    p.inputs["Coat Weight"].default_value = 0.25
    p.inputs["Coat Roughness"].default_value = 0.22
    return m


def mat_black_oxide(name="BlackOxide"):
    return mat_metal(name, (0.045, 0.045, 0.048), 0.34, wear=0.8)


def mat_sapphire(name="Sapphire", color=(0.0, 0.86, 1.0), density=5.5):
    """Синтетичен корунд (като рубинените върхове на сондите, но в цвета на марката): прозрачен,
    n = 1.77, огледално полиран; цветът идва от поглъщането в обема — затова е по-наситен там, където
    лъчът минава през повече материал, а ръбът и отблясъците остават светли. Не свети сам."""
    m, p, t = _principled(name)
    p.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1)
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.0
    p.inputs["IOR"].default_value = 1.77
    va = t.nodes.new("ShaderNodeVolumeAbsorption")
    va.inputs["Color"].default_value = (*color, 1)
    va.inputs["Density"].default_value = density
    t.links.new(va.outputs[0], t.nodes["Material Output"].inputs["Volume"])
    return m


def mat_glass(name="Glass", color=(1.0, 1.0, 1.0), ior=1.5, rough=0.0):
    m, p, t = _principled(name)
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["Roughness"].default_value = rough
    p.inputs["IOR"].default_value = ior
    return m


def mat_screen(name="ScreenGlass"):
    """Черно стъкло на екран: гладък диелектрик върху почти черна основа."""
    m, p, t = _principled(name)
    p.inputs["Base Color"].default_value = (0.004, 0.005, 0.006, 1)
    p.inputs["Roughness"].default_value = 0.04
    p.inputs["IOR"].default_value = 1.52
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat Roughness"].default_value = 0.02
    return m


def mat_glow(name="CyanLight", strength=6.0, color=CYAN):
    """Светещ акрил (светловод): матова повърхност, която свети отвътре."""
    m, p, t = _principled(name)
    p.inputs["Base Color"].default_value = (0.02, 0.10, 0.12, 1)
    p.inputs["Roughness"].default_value = 0.35
    p.inputs["Emission Color"].default_value = (*color, 1)
    p.inputs["Emission Strength"].default_value = strength
    return m


def mat_ink(name="Ink"):
    m, p, t = _principled(name)
    p.inputs["Base Color"].default_value = (0.006, 0.006, 0.007, 1)
    p.inputs["Roughness"].default_value = 0.6
    return m


def mat_rubber(name="Rubber"):
    m, p, t = _principled(name)
    g = _G(t)
    p.inputs["Base Color"].default_value = (0.012, 0.012, 0.013, 1)
    p.inputs["Roughness"].default_value = 0.62
    g.link(g.bump(g.noise(g.coords(scale=(180, 180, 180))), 0.05, 0.002), p.inputs["Normal"])
    return m


# ── геометрия ──────────────────────────────────────────────────────────────────────────────────
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def assign(ob, *mats):
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    return ob


def from_bmesh(name, bm):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def rounded_rect(sx, sy, r, seg=12):
    pts = []
    for cx, cy, a0 in ((sx / 2 - r, sy / 2 - r, 0), (-sx / 2 + r, sy / 2 - r, 90),
                       (-sx / 2 + r, -sy / 2 + r, 180), (sx / 2 - r, -sy / 2 + r, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def prism(name, pts, h, z0=0.0, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Изтегля плосък контур (списък от (x, y), обратно на часовниковата стрелка) на височина h."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
    bm.normal_update()
    if f.normal.z > 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = from_bmesh(name, bm)
    ob.location, ob.rotation_euler = loc, rot
    return ob


def rbox(name, sx, sy, h, r, z0=0.0, loc=(0, 0, 0), rot=(0, 0, 0), seg=12):
    return prism(name, rounded_rect(sx, sy, r, seg), h, z0, loc, rot)


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return ob


def plane(name, sx, sy, loc=(0, 0, 0), rot_z=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(0, 0, rot_z))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (sx, sy, 1)
    bpy.ops.object.transform_apply(scale=True)
    return ob


def cyl(name, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=128, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object
    ob.name = name
    return ob


def sphere(name, r, loc=(0, 0, 0), seg=96, rings=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=rings)
    ob = bpy.context.active_object
    ob.name = name
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), seg=128, mseg=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=seg, minor_segments=mseg)
    ob = bpy.context.active_object
    ob.name = name
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def text(name, body, size=1.0, extrude=0.02, loc=(0, 0, 0), rot=(0, 0, 0), font=FONT_MONO, bev=0.0, align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bev
    cu.bevel_resolution = 4
    cu.resolution_u = 24
    cu.align_x = align
    cu.align_y = "CENTER"
    if font and os.path.exists(font):
        cu.font = bpy.data.fonts.load(font, check_existing=True)
    ob = bpy.data.objects.new(name, cu)
    ob.location, ob.rotation_euler = loc, rot
    return link(ob)


def cut(ob, cutter, transfer=False):
    """Булево изваждане (остава като модификатор; режещото тяло не се рендерира)."""
    md = ob.modifiers.new("Cut", "BOOLEAN")
    md.operation = "DIFFERENCE"
    md.solver = "EXACT"
    md.object = cutter
    if transfer:
        md.material_mode = "TRANSFER"
    cutter.hide_render = True
    cutter.display_type = "WIRE"
    return ob


def finish(ob, width=0.02, seg=3, mat_index=-1, angle=32.0, chamfer=0.0, chamfer_mat=-1):
    """Довършване на твърдо тяло: (по желание) плоска „диамантена“ фаска, заоблени ръбове, претеглени
    нормали. Без това ръбовете са безкрайно остри и не хващат светлина — първият белег на CG."""
    for poly in ob.data.polygons:
        poly.use_smooth = True
    if chamfer > 0:
        c = ob.modifiers.new("Chamfer", "BEVEL")
        c.width, c.segments = chamfer, 1
        c.limit_method, c.angle_limit = "ANGLE", math.radians(angle)
        if chamfer_mat >= 0:
            c.material = chamfer_mat
        angle = min(angle, 20.0)
    b = ob.modifiers.new("Bevel", "BEVEL")
    b.width, b.segments = width, seg
    b.limit_method, b.angle_limit = "ANGLE", math.radians(angle)
    if mat_index >= 0:
        b.material = mat_index
    wn = ob.modifiers.new("WN", "WEIGHTED_NORMAL")
    wn.keep_sharp = False
    wn.weight = 80
    return ob


def aim(ob, target, track="-Z", up="Y"):
    d = Vector(target) - Vector(ob.location)
    ob.rotation_euler = d.to_track_quat(track, up).to_euler()
    return ob


# ── светлина и камера ──────────────────────────────────────────────────────────────────────────
def softbox(name, loc, look_at, size=(6.0, 3.0), strength=10.0, color=(1.0, 1.0, 1.0), edge=0.5, camera=False,
            grad=(0.0, 0.0), through=False):
    """Софтбокс: светеща плоскост с мек спад към краищата (така изглежда в отражението). grad=(gx, gy)
    добавя линеен спад по ширина/височина — за отражения, които избледняват към едната страна.
    through=True: плоскостта свети, но е прозрачна за лъчите — не закрива софтбоксовете зад себе си.
    Така се правят подвижните лампи на „живите“ слоеве: иначе лампа пред основния софтбокс му отнема
    светлината и базовият слой излиза без блясъка по плетката (хванато на 13.11.2026 при сверка с одобрения кадър)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0], size[1], 1)
    aim(ob, look_at, "Z", "Y")
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    t = m.node_tree
    for nd in list(t.nodes):
        t.nodes.remove(nd)
    g = _G(t)
    tc = g.n.new("ShaderNodeTexCoord")
    sx = g.n.new("ShaderNodeSeparateXYZ")
    g.link(tc.outputs["UV"], sx.inputs[0])
    dx = g.math("ABSOLUTE", g.math("SUBTRACT", g.math("MULTIPLY", sx.outputs[0], 2.0), 1.0))
    dy = g.math("ABSOLUTE", g.math("SUBTRACT", g.math("MULTIPLY", sx.outputs[1], 2.0), 1.0))
    fall = g.math("MULTIPLY", g.ramp(dx, 1.0 - edge, 1.0, 1.0, 0.0), g.ramp(dy, 1.0 - edge, 1.0, 1.0, 0.0))
    if grad[0]:
        fall = g.math("MULTIPLY", fall, g.ramp(sx.outputs[0], 0.0, 1.0, 1.0 - max(grad[0], 0), 1.0 + min(grad[0], 0)))
    if grad[1]:
        fall = g.math("MULTIPLY", fall, g.ramp(sx.outputs[1], 0.0, 1.0, 1.0 - max(grad[1], 0), 1.0 + min(grad[1], 0)))
    em = g.n.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    g.link(g.math("MULTIPLY", fall, strength), em.inputs["Strength"])
    out = g.n.new("ShaderNodeOutputMaterial")
    if through:
        tr = g.n.new("ShaderNodeBsdfTransparent")
        add = g.n.new("ShaderNodeAddShader")
        g.link(em.outputs[0], add.inputs[0])
        g.link(tr.outputs[0], add.inputs[1])
        g.link(add.outputs[0], out.inputs["Surface"])
    else:
        g.link(em.outputs[0], out.inputs["Surface"])
    assign(ob, m)
    ob.visible_camera = camera
    ob.visible_shadow = False
    return ob


def laser_line(name, loc, look_at, power=3000.0, width=0.0016, color=CYAN, roll=0.0, spread=150.0, blend=0.3, speckle=0.0):
    """Лазерен проектор на линия: прожектор, чиято светлина минава през тесен гаусов прорез. Линията
    пада върху всичко по пътя си (плочата, детайла, линийката) с вярна перспектива и засенчване."""
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = power
    ld.color = color
    ld.spot_size = math.radians(spread)  # дължината на линията
    ld.spot_blend = blend  # 1.0 → линията избледнява плавно от средата към краищата (гаусово ветрило)
    ld.shadow_soft_size = 0.0
    ld.use_nodes = True
    t = ld.node_tree
    for nd in list(t.nodes):
        t.nodes.remove(nd)
    g = _G(t)
    tc = g.n.new("ShaderNodeTexCoord")
    sx = g.n.new("ShaderNodeSeparateXYZ")
    g.link(tc.outputs["Normal"], sx.inputs[0])
    ratio = g.math("DIVIDE", sx.outputs[0], g.math("ABSOLUTE", sx.outputs[2]))
    band = g.math("EXPONENT", g.math("MULTIPLY", g.math("POWER", g.math("DIVIDE", ratio, width), 2.0), -1.0))
    if speckle:
        # лазерен спекъл: зърнеста неравномерност по дължината на линията
        along = g.math("DIVIDE", sx.outputs[1], g.math("ABSOLUTE", sx.outputs[2]))
        sp = g.noise(g.math("MULTIPLY", along, 2600.0), scale=1.0, detail=2.0, rough=0.8)
        band = g.math("MULTIPLY", band, g.math("ADD", 1.0 - speckle, g.math("MULTIPLY", sp, 2.0 * speckle)))
    em = g.n.new("ShaderNodeEmission")
    g.link(band, em.inputs["Strength"])
    out = g.n.new("ShaderNodeOutputLight")
    g.link(em.outputs[0], out.inputs["Surface"])
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    aim(ob, look_at)
    ob.rotation_euler.rotate_axis("Z", roll)
    return link(ob)


def camera(loc, look_at, lens=85.0, fstop=None, focus=None, blades=0):
    cd = bpy.data.cameras.new("Cam")
    cd.lens = lens
    cd.sensor_width = 36.0
    cd.clip_start, cd.clip_end = 0.1, 2000.0
    ob = bpy.data.objects.new("Cam", cd)
    ob.location = loc
    aim(ob, look_at)
    link(ob)
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.aperture_blades = blades
        if focus is None:
            focus = look_at
        if isinstance(focus, bpy.types.Object):
            cd.dof.focus_object = focus
        else:
            cd.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    bpy.context.scene.camera = ob
    return ob


def shadow_catcher(z=0.0, size=40.0):
    ob = plane("Catcher", size, size, (0, 0, z))
    ob.is_shadow_catcher = True
    m, p, _ = _principled("CatcherMat")
    p.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
    p.inputs["Roughness"].default_value = 0.9
    assign(ob, m)
    return ob


# ── „живи“ слоеве ──────────────────────────────────────────────────────────────────────────────
# Сайтът не върти видео: Blender рендерира ЕДИН кадър, но разделен на светлинни групи (база, подвижни
# софтбоксове, лазерен „потоп“), плюс карта на позицията. Браузърът ги смесва в реално време
# (public/js/cs-live.js): светлината се плъзга по карбона, а лазерната линия отива там, където сочиш —
# и изкачва стените и хлътва в отворите вярно, защото позицията на всеки пиксел идва от самата сцена.
def group(ob, name):
    """Слага обекта (лампа, светеща плоскост) в светлинна група; създава я, ако я няма."""
    vl = bpy.context.view_layer
    if name not in [g.name for g in vl.lightgroups]:
        vl.lightgroups.add(name=name)
    ob.lightgroup = name
    return ob


def sun(name, direction, strength=30.0, color=(1.0, 1.0, 1.0)):
    """Успоредна светлина по `direction` — „потопът“ на лазера: показва как всяка точка отговаря на
    светлина от посоката на проектора, заедно със сенките. Линията = потоп × тясна лента по позиция."""
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy, ld.color, ld.angle = strength, color, 0.0
    ob = bpy.data.objects.new(name, ld)
    ob.location = (0, 0, 60)
    aim(ob, Vector(ob.location) + Vector(direction))
    return link(ob)


def live_passes(outdir, poster, passes, glare=0.14, threshold=1.8, size=7, dispersion=0.008, vignette=0.5, denoise=True, raw=False):
    """Компоситор за слоевете. poster: списък групи, които заедно са неподвижният кадър.
    passes: {име: (списък групи, с_ореол)}. Всеки слой минава през денойзър и същата винетка, и се
    записва през тоновата крива на сцената като <име>_0001.png (16 бита)."""
    sc = bpy.context.scene
    bpy.context.view_layer.cycles.denoising_store_passes = True
    sc.use_nodes = True
    t = sc.node_tree
    for n in list(t.nodes):
        t.nodes.remove(n)
    N, L = t.nodes, t.links
    rl = N.new("CompositorNodeRLayers")
    mask = None
    if vignette > 0:
        e = N.new("CompositorNodeEllipseMask")
        e.width, e.height = 1.25, 1.35
        b = N.new("CompositorNodeBlur")
        b.use_relative = True
        b.factor_x = b.factor_y = 28
        b.filter_type = "FAST_GAUSS"
        L.new(e.outputs[0], b.inputs[0])
        mask = b.outputs[0]

    def den(g):
        if not denoise:
            return rl.outputs[f"Combined_{g}"]
        d = N.new("CompositorNodeDenoise")
        d.prefilter = "ACCURATE"
        L.new(rl.outputs[f"Combined_{g}"], d.inputs["Image"])
        L.new(rl.outputs["Denoising Normal"], d.inputs["Normal"])
        L.new(rl.outputs["Denoising Albedo"], d.inputs["Albedo"])
        return d.outputs[0]

    def total(groups):
        img = den(groups[0])
        for g in groups[1:]:
            a = N.new("CompositorNodeMixRGB")
            a.blend_type = "ADD"
            a.inputs[0].default_value = 1.0
            L.new(img, a.inputs[1])
            L.new(den(g), a.inputs[2])
            img = a.outputs[0]
        return img

    def fin(img, glow):
        if glow and glare > 0:
            g = N.new("CompositorNodeGlare")
            g.glare_type, g.quality, g.threshold, g.size, g.mix = "FOG_GLOW", "HIGH", threshold, size, 1.0
            L.new(img, g.inputs[0])
            a = N.new("CompositorNodeMixRGB")
            a.blend_type = "ADD"
            a.inputs[0].default_value = glare
            L.new(img, a.inputs[1])
            L.new(g.outputs[0], a.inputs[2])
            img = a.outputs[0]
            if dispersion > 0:
                d = N.new("CompositorNodeLensdist")
                d.use_fit = True
                d.inputs["Dispersion"].default_value = dispersion
                L.new(img, d.inputs["Image"])
                img = d.outputs["Image"]
        if mask is not None:
            m = N.new("CompositorNodeMixRGB")
            m.blend_type = "MULTIPLY"
            m.inputs[0].default_value = vignette
            L.new(img, m.inputs[1])
            L.new(mask, m.inputs[2])
            img = m.outputs[0]
        return img

    out = N.new("CompositorNodeOutputFile")
    out.base_path = outdir
    out.format.file_format, out.format.color_mode, out.format.color_depth = "PNG", "RGB", "16"
    out.file_slots.clear()
    post_img = fin(total(poster), True)
    out.file_slots.new("poster_")
    L.new(post_img, out.inputs["poster_"])
    for name, (groups, glow) in passes.items():
        out.file_slots.new(name + "_")
        L.new(fin(total(groups), glow), out.inputs[name + "_"])
    if raw:  # за диагностика: същите слоеве без денойзър
        for name, (groups, glow) in passes.items():
            out.file_slots.new("raw" + name + "_")
            img = rl.outputs[f"Combined_{groups[0]}"]
            L.new(fin(img, False), out.inputs["raw" + name + "_"])
    comp = N.new("CompositorNodeComposite")
    L.new(post_img, comp.inputs["Image"])


def render_position(outdir, res, normal, clip=None, name="pos"):
    """Карта на позицията за лазера: втори, мигновен рендер (1 лъч на пиксел, без разфокусиране).
    Записва <name>.png: R·256+G = s (позицията на точката по нормалата на лазерния лист, 16 бита,
    разтегната до обхвата на кадъра), B = размерът на кръга на разсейване (за да се размива линията там,
    където и снимката е извън фокус). Връща (s_min, s_max) в единиците на сцената."""
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    cam = sc.camera
    c = sc.cycles
    keep = (c.samples, c.use_denoising, c.use_adaptive_sampling, cam.data.dof.use_dof, sc.use_nodes, sc.render.filepath)
    vl.use_pass_position = True
    c.samples, c.use_denoising, c.use_adaptive_sampling = 1, False, False
    cam.data.dof.use_dof = False
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.use_nodes = True
    t = sc.node_tree
    for n in list(t.nodes):
        t.nodes.remove(n)
    rl = t.nodes.new("CompositorNodeRLayers")
    fo = t.nodes.new("CompositorNodeOutputFile")
    fo.base_path = outdir
    fo.format.file_format, fo.format.color_mode, fo.format.color_depth = "OPEN_EXR", "RGBA", "32"
    fo.file_slots.clear()
    fo.file_slots.new("posraw_")
    fo.file_slots["posraw_"].save_as_render = False
    t.links.new(rl.outputs["Position"], fo.inputs["posraw_"])
    cp = t.nodes.new("CompositorNodeComposite")
    t.links.new(rl.outputs["Image"], cp.inputs["Image"])
    sc.render.filepath = os.path.join(outdir, "_posdummy.png")
    bpy.ops.render.render(write_still=False)
    raw = bpy.data.images.load(os.path.join(outdir, "posraw_0001.exr"))
    w, h = raw.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    raw.pixels.foreach_get(arr)
    P = arr.reshape(h, w, 4)[..., :3].astype(np.float64)
    hit = np.abs(P).sum(-1) > 1e-6  # фонът (без геометрия) е (0,0,0)
    n = np.array(normal, dtype=np.float64)
    n /= np.linalg.norm(n)
    s = P @ n
    s_min, s_max = float(s[hit].min()), float(s[hit].max())
    if clip:  # 16-те бита отиват за обхвата, в който лазерът наистина се движи (подът стига до хоризонта)
        s_min, s_max = max(s_min, clip[0]), min(s_max, clip[1])
    q = np.clip((s - s_min) / (s_max - s_min), 0, 1)
    q16 = np.round(q * 65535).astype(np.int64)
    # кръг на разсейване в пиксели (диаметър), от дълбочината по оста на камерата
    M = cam.matrix_world
    C = np.array(M.translation)
    fwd = -np.array(M.to_3x3().col[2])
    d = np.maximum((P - C) @ fwd, 1e-3)
    lens = cam.data.lens / 1000.0
    F = cam.data.dof.focus_distance
    if cam.data.dof.focus_object is not None:
        F = float((np.array(cam.data.dof.focus_object.matrix_world.translation) - C) @ fwd)
    coc = (lens / cam.data.dof.aperture_fstop) * lens * np.abs(d - F) / (d * (F - lens)) / (cam.data.sensor_width / 1000.0) * w
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., 0] = (q16 // 256) / 255.0
    out[..., 1] = (q16 % 256) / 255.0
    out[..., 2] = np.clip(coc / 64.0, 0, 1)
    out[..., 3] = 1.0
    out[~hit, :3] = 0.0
    img = bpy.data.images.new("cs_pos", w, h, alpha=False, is_data=True)
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw = os.path.join(outdir, name + ".png")
    img.file_format = "PNG"
    img.save()
    c.samples, c.use_denoising, c.use_adaptive_sampling, cam.data.dof.use_dof, sc.use_nodes, sc.render.filepath = keep
    os.remove(os.path.join(outdir, "posraw_0001.exr"))
    return s_min, s_max
