"""Materials of the mounting-video scene: zinc, procedural and photo-scanned concrete (Poly Haven, CC0), dust,
plastics, the level's liquid, the blue ghost outline."""
import os
import bpy
from lib import node, material, noise, maprange, math_op

ASSETS = os.path.dirname(os.path.abspath(__file__)).replace("\\", "/") + "/assets"


# ---------- materials ----------
def zinc(nt, b):
    cloud = maprange(nt, noise(nt, 28.0, 5.0, 0.6), 0.0, 1.0)
    lines = maprange(nt, noise(nt, 90.0, 3.0, 0.5, (1, 1, 60)), 0.0, 1.0)
    mix = math_op(nt, "ADD", math_op(nt, "MULTIPLY", cloud.outputs["Result"], val=0.11).outputs[0],
                  math_op(nt, "MULTIPLY", lines.outputs["Result"], val=0.05).outputs[0])
    nt.links.new(math_op(nt, "ADD", mix.outputs[0], val=0.2).outputs[0], b.inputs["Roughness"])
    tint = nt.nodes.new("ShaderNodeMixRGB")
    tint.inputs["Color1"].default_value, tint.inputs["Color2"].default_value = (0.74, 0.76, 0.79, 1), (0.84, 0.85, 0.87, 1)
    nt.links.new(cloud.outputs["Result"], tint.inputs["Fac"])
    nt.links.new(tint.outputs["Color"], b.inputs["Base Color"])
    bump = node(nt, "ShaderNodeBump", Strength=0.035, Distance=0.0004)
    nt.links.new(noise(nt, 55.0, 8.0, 0.65).outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])


def concrete(scale, base=(0.30, 0.295, 0.28), var=0.16, bumpk=0.4):
    """Cast-in-place concrete: blotches, horizontal formwork stains, pores and pale aggregate specks."""
    def build(nt, b):
        co = nt.nodes.new("ShaderNodeTexCoord")
        def tex(kind, vec_scale=(1, 1, 1), **kw):
            mp = node(nt, "ShaderNodeMapping", Scale=vec_scale)
            nt.links.new(co.outputs["Object"], mp.inputs["Vector"])
            t = node(nt, kind, **kw)
            nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
            return t
        blot = maprange(nt, tex("ShaderNodeTexNoise", Scale=1.6, Detail=4.0, Roughness=0.55), 0.0, 1.0, 0.32, 0.68)
        band = maprange(nt, tex("ShaderNodeTexNoise", (0.08, 1, 1.0), Scale=9.0, Detail=3.0, Roughness=0.5), 0.0, 1.0, 0.3, 0.7)
        mott = maprange(nt, tex("ShaderNodeTexNoise", Scale=28.0, Detail=6.0, Roughness=0.65), 0.0, 1.0, 0.25, 0.75)
        f = math_op(nt, "ADD", math_op(nt, "MULTIPLY", blot.outputs["Result"], val=0.5).outputs[0],
                    math_op(nt, "ADD", math_op(nt, "MULTIPLY", band.outputs["Result"], val=0.25).outputs[0],
                            math_op(nt, "MULTIPLY", mott.outputs["Result"], val=0.25).outputs[0]).outputs[0])
        col = nt.nodes.new("ShaderNodeMixRGB")
        col.inputs["Color1"].default_value = (*(c * (1 - var) for c in base), 1)
        col.inputs["Color2"].default_value = (*(min(1, c * (1 + var)) for c in base), 1)
        nt.links.new(f.outputs[0], col.inputs["Fac"])
        pore = tex("ShaderNodeTexVoronoi", Scale=scale)
        pit = maprange(nt, pore, 1.0, 0.0, 0.0, 0.11, out="Distance")
        spk = tex("ShaderNodeTexVoronoi", Scale=scale * 0.55, Randomness=1.0)
        speck = maprange(nt, spk, 1.0, 0.0, 0.0, 0.16, out="Distance")
        dark = nt.nodes.new("ShaderNodeMixRGB")
        dark.blend_type = "MULTIPLY"
        nt.links.new(math_op(nt, "MULTIPLY", pit.outputs["Result"], val=0.75).outputs[0], dark.inputs["Fac"])
        nt.links.new(col.outputs["Color"], dark.inputs["Color1"])
        dark.inputs["Color2"].default_value = (0.12, 0.12, 0.12, 1)
        light = nt.nodes.new("ShaderNodeMixRGB")
        nt.links.new(math_op(nt, "MULTIPLY", speck.outputs["Result"], val=0.35).outputs[0], light.inputs["Fac"])
        nt.links.new(dark.outputs["Color"], light.inputs["Color1"])
        light.inputs["Color2"].default_value = (0.62, 0.6, 0.56, 1)
        nt.links.new(light.outputs["Color"], b.inputs["Base Color"])
        rough = math_op(nt, "ADD", math_op(nt, "MULTIPLY", blot.outputs["Result"], val=0.12).outputs[0], val=0.78)
        nt.links.new(rough.outputs[0], b.inputs["Roughness"])
        h = math_op(nt, "SUBTRACT", tex("ShaderNodeTexNoise", Scale=160.0, Detail=6.0, Roughness=0.7).outputs["Fac"],
                    math_op(nt, "MULTIPLY", pit.outputs["Result"], val=1.6).outputs[0])
        bump = node(nt, "ShaderNodeBump", Strength=bumpk, Distance=0.0012)
        nt.links.new(h.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return build




def scanned(prefix, size, plane="xz", tint=1.0, rough_k=1.0, nstr=1.0):
    """Photo-scanned concrete (Poly Haven, CC0): colour, OpenGL normal and roughness maps, object-space projection
    on `plane`, `size` metres per tile, a large soft colour variation against visible repetition."""
    def build(nt, b):
        co = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(co.outputs["Object"], sep.inputs["Vector"])
        for k, axis in enumerate({"xz": "XZY", "xy": "XYZ", "yz": "YZX"}[plane]):
            nt.links.new(sep.outputs[axis], comb.inputs[k])
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1 / size, 1 / size, 1 / size)
        nt.links.new(comb.outputs["Vector"], mp.inputs["Vector"])
        def img(kind, colour):
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = bpy.data.images.load(f"{ASSETS}/{prefix}_{kind}_4k.jpg", check_existing=True)
            t.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
            t.interpolation = "Cubic" if kind == "nor_gl" else "Linear"
            nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
            return t
        diff, nor, rough = img("diff", True), img("nor_gl", False), img("rough", False)
        var = maprange(nt, noise(nt, 0.9, 3.0, 0.5), 0.0, 1.0, 0.3, 0.7)
        mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = "MULTIPLY"
        nt.links.new(math_op(nt, "MULTIPLY", var.outputs["Result"], val=0.35).outputs[0], mix.inputs["Fac"])
        nt.links.new(diff.outputs["Color"], mix.inputs["Color1"])
        mix.inputs["Color2"].default_value = (0.78, 0.76, 0.72, 1)
        hsv = node(nt, "ShaderNodeHueSaturation", Saturation=0.62, Value=1.0)
        nt.links.new(mix.outputs["Color"], hsv.inputs["Color"])
        bright = nt.nodes.new("ShaderNodeMixRGB"); bright.blend_type = "MULTIPLY"
        bright.inputs["Fac"].default_value = 1.0
        bright.inputs["Color2"].default_value = (tint, tint, tint, 1)
        nt.links.new(hsv.outputs["Color"], bright.inputs["Color1"])
        nt.links.new(bright.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(math_op(nt, "MULTIPLY", rough.outputs["Color"], val=rough_k).outputs[0], b.inputs["Roughness"])
        nm = node(nt, "ShaderNodeNormalMap", Strength=nstr)
        nt.links.new(nor.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return build


def plastic(nt, b):
    """Moulded tool housing: fine spark-eroded grain and a little roughness variation."""
    grain = noise(nt, 900.0, 4.0, 0.6)
    bump = node(nt, "ShaderNodeBump", Strength=0.18, Distance=0.0002)
    nt.links.new(grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    rv = maprange(nt, noise(nt, 12.0, 3.0, 0.5), 0.36, 0.52)
    nt.links.new(rv.outputs["Result"], b.inputs["Roughness"])


def dust(nt, b):
    """Drilling dust: a pale, ragged halo, denser near the hole and fading out."""
    out = nt.nodes["Material Output"]
    co = nt.nodes.new("ShaderNodeTexCoord")
    vl = nt.nodes.new("ShaderNodeVectorMath"); vl.operation = "LENGTH"
    nt.links.new(co.outputs["Object"], vl.inputs[0])
    r = maprange(nt, vl, 1.0, 0.0, 0.004, 0.0105, out="Value")
    n = maprange(nt, noise(nt, 700.0, 3.0, 0.6), 0.2, 1.0)
    a = math_op(nt, "MULTIPLY", r.outputs["Result"], n.outputs["Result"])
    a = math_op(nt, "MULTIPLY", a.outputs[0], val=0.85)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(a.outputs[0], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(b.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def vial_liquid(nt, b):
    b.inputs["Emission Color"].default_value = (0.55, 0.85, 0.08, 1)
    b.inputs["Emission Strength"].default_value = 0.6


def ghost(nt, b):
    out = nt.nodes["Material Output"]
    em = node(nt, "ShaderNodeEmission", Color=(0.35, 0.62, 1.0, 1), Strength=3.0)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = node(nt, "ShaderNodeMixShader", Fac=1.0)
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def make_materials():
    return {
        "zinc": material("zinc", (0.79, 0.81, 0.83), 0.32, 1.0, zinc),
        "edge": material("edge", (0.50, 0.52, 0.55), 0.46, 1.0),
        "hw": material("hw", (0.80, 0.81, 0.83), 0.27, 1.0),
        "forged": material("forged", (0.33, 0.34, 0.36), 0.52, 1.0),
        "concrete": material("concrete", (0.3, 0.3, 0.28), 0.85, 0.0, scanned("concrete", 2.0, "xz", 1.15, 1.0, 1.2)),
        "concrete_box": material("concrete_box", (0.3, 0.3, 0.28), 0.85, 0.0, scanned("concrete", 2.0, "xz", 0.95)),
        "screed": material("screed", (0.22, 0.215, 0.205), 0.7, 0.0, scanned("dirty_concrete", 3.0, "xy", 0.95, 1.0, 1.0)),
        "side": material("side", (0.3, 0.3, 0.28), 0.85, 0.0, scanned("concrete", 2.0, "yz", 1.0, 1.0, 1.2)),
        "hole": material("hole", (0.015, 0.015, 0.015), 0.95),
        "dust": material("dust", (0.55, 0.54, 0.52), 0.95, 0.0, dust),
        "mark": material("mark", (0.03, 0.03, 0.035), 0.6),
        "graphite": material("graphite", (0.035, 0.037, 0.042), 0.42, 0.0, plastic),
        "rubber": material("rubber", (0.012, 0.012, 0.013), 0.78),
        "navy": material("navy", (0.008, 0.022, 0.13), 0.35),
        "steel": material("steel", (0.62, 0.63, 0.65), 0.32, 1.0),
        "chrome": material("chrome", (0.86, 0.87, 0.89), 0.12, 1.0),
        "alu": material("alu", (0.78, 0.79, 0.81), 0.34, 1.0),
        "window": material("window", (0.02, 0.025, 0.03), 0.2),
        "liquid": material("liquid", (0.45, 0.75, 0.06), 0.1, 0.0, vial_liquid),
        "bubble": material("bubble", (0.95, 0.97, 0.9), 0.2),
        "ghost": material("ghost", (0.2, 0.4, 1.0), 0.5, 0.0, ghost),
        "cut": material("cut", (0.9, 0.12, 0.08), 0.5),
    }
