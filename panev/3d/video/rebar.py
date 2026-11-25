"""Step 10's surprise: a vertical rebar (Ø 12) in the concrete behind the middle bracket's DX holes. The first hole
stops on it (REBAR_COVER of concrete): the wall face opens a 10.4 mm hole there (a mask in its concrete material),
behind it a short bore of drilled concrete ends on the ribbed bar, with a bright scar where the bit ground on the
steel. A spark and its light flash at the moment of the hit. Everything starts hidden; middle.py drives it."""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector
from lib import box, cylinder, bm_object, material, annulus
from hands import REBAR_COVER

R_HOLE = 0.0052


def tube(name, r, y0, y1, mat, parent, at):
    """An open bore from y0 to y1 (wall-local, into the wall), seen from inside."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=r, radius2=r, depth=y1 - y0)
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(-math.pi / 2, 3, "X"))
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    ob = bm_object(name, bm, mat, smooth=True, parent=parent)
    ob.location = (at.x, (y0 + y1) / 2, at.z)
    return ob


def op(nt, kind, operation, *values):
    n = nt.nodes.new(kind)
    n.operation = operation
    for i, v in enumerate(values):
        if v is not None:
            n.inputs[i].default_value = v
    return n


def hole_mask(mat, x, z, r):
    """Opens a round hole (x, z wall-local, radius r) in the wall's concrete when the returned value is 1."""
    nt = mat.node_tree
    out = nt.nodes["Material Output"]
    surf = out.inputs["Surface"].links[0].from_socket
    co = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co.outputs["Object"], sep.inputs["Vector"])
    dx = op(nt, "ShaderNodeMath", "SUBTRACT", None, x)
    nt.links.new(sep.outputs["X"], dx.inputs[0])
    dz = op(nt, "ShaderNodeMath", "SUBTRACT", None, z)
    nt.links.new(sep.outputs["Z"], dz.inputs[0])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(dx.outputs[0], comb.inputs["X"])
    nt.links.new(dz.outputs[0], comb.inputs["Z"])
    dist = op(nt, "ShaderNodeVectorMath", "LENGTH")
    nt.links.new(comb.outputs[0], dist.inputs[0])
    inside = op(nt, "ShaderNodeMath", "LESS_THAN", None, r)
    nt.links.new(dist.outputs["Value"], inside.inputs[0])
    on = nt.nodes.new("ShaderNodeValue")
    on.name = "rebar_hole"
    on.outputs[0].default_value = 0.0
    fac = op(nt, "ShaderNodeMath", "MULTIPLY")
    nt.links.new(inside.outputs[0], fac.inputs[0])
    nt.links.new(on.outputs[0], fac.inputs[1])
    mix = nt.nodes.new("ShaderNodeMixShader")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(fac.outputs[0], mix.inputs["Fac"])
    nt.links.new(surf, mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return on


def build_rebar(M, wall, x, z, depth):
    """x, z: the hole on the wall face (wall-local m); depth(x, z): the face's y there."""
    d = depth(x, z)
    bar_y = d + REBAR_COVER + 0.006
    at = Vector((x, d, z))
    steel = material("rebar", (0.30, 0.285, 0.27), 0.58, 1.0)
    bore = material("bore", (0.24, 0.235, 0.22), 0.95)
    bar = cylinder("rebar-bar", 0.006, 0.2, steel, segs=40, loc=(x + 0.0015, bar_y, z - 0.1), axis="Z", parent=wall)  # inside the wall only
    ribs = [cylinder(f"rebar-rib{i}", 0.0067, 0.0011, steel, segs=40, loc=(x + 0.0015, bar_y, z - 0.024 + i * 0.008),
                     axis="Z", parent=wall) for i in range(7)]
    bore_ob = tube("rebar-bore", R_HOLE, d - 0.0004, bar_y, bore, wall, at)
    cap = cylinder("rebar-cap", R_HOLE + 0.0002, 0.0015, bore, loc=(x, bar_y + 0.004, z), axis="Y", parent=wall)
    scar = cylinder("rebar-scar", 0.0038, 0.0005, M["chrome"], loc=(x, d + REBAR_COVER - 0.0002, z), axis="Y", parent=wall)
    hot = material("spark-hot", (1.0, 0.55, 0.2), 0.4)
    em = hot.node_tree.nodes["Principled BSDF"]
    em.inputs["Emission Color"].default_value = (1.0, 0.5, 0.15, 1.0)
    em.inputs["Emission Strength"].default_value = 60.0
    spark = cylinder("rebar-spark", 0.0016, 0.0016, hot, segs=12, loc=(x, d + REBAR_COVER - 0.002, z), axis="Y", parent=wall)
    L = bpy.data.lights.new("rebar-light", "POINT")
    L.energy, L.shadow_soft_size, L.color = 0.0, 0.002, (1.0, 0.6, 0.3)
    light = bpy.data.objects.new("rebar-light", L)
    bpy.context.scene.collection.objects.link(light)
    light.parent = wall
    light.location = (x, d - 0.006, z)
    # the shaft's light reaching down the bore: a faint lamp just inside it, behind the wall face (it lights nothing the
    # camera sees while the hole is closed, so it stays on and never forces a whole frame)
    G = bpy.data.lights.new("rebar-glow", "SPOT")
    G.energy, G.shadow_soft_size, G.spot_size, G.spot_blend = 0.15, 0.001, math.radians(28), 0.6
    glow = bpy.data.objects.new("rebar-glow", G)
    bpy.context.scene.collection.objects.link(glow)
    glow.parent = wall
    glow.location = (x - 0.0015, d + 0.0012, z + 0.0015)
    glow.rotation_euler = (math.pi / 2, 0, 0)  # the spot looks down its local −z: onto +y, into the wall
    hidden = [bar, *ribs, bore_ob, cap, scar, spark, light]
    for ob in hidden:
        ob.hide_render = True
    dust = annulus("rebar-dust", 0.0115, R_HOLE, 0.0005, M["dust"], n=32, parent=wall)  # a ring: the bore stays open
    dust.rotation_euler = (math.pi / 2, 0, 0)  # its xy plane onto the wall face, facing the shaft (−y)
    dust.location = (x, d - 0.0003, z)
    dust.hide_render = True
    marks = [[box(f"rebar-mark{j}{q}", (0.014 if q == 0 else 0.0011, 0.0004, 0.0011 if q == 0 else 0.014), M["mark"],
                  (x, depth(x, zj) - 0.0002, zj), 0, wall) for q in range(2)] for j, zj in enumerate((z, z_low(z)))]
    for mk in marks:
        for ob in mk:
            ob.hide_render = True
    return {"bar": [bar, *ribs, cap], "bore": bore_ob, "scar": scar, "spark": spark, "light": light, "dust": dust,
            "marks": marks, "mask": hole_mask(M["concrete"], x, z, R_HOLE), "at": at}


def z_low(z):
    """The lower anchor's height on the same B (ANCHORS: 225 and 52 mm)."""
    return z - (225.0 - 52.0) * 0.001
