"""The angle grinder of step 11 (125 mm disc), modelled here, no third-party asset: Panev-navy motor housing with a
rubber grip, cast aluminium gear head, steel guard, a cutting disc whose printed label smears into rings while it
spins, side handle and cable. Plus the sparks (a pool of thin emissive streaks) and their warm light.
Local frame of the rig: disc centre at the origin, disc in the XZ plane, spindle and gear head towards +Y, motor
housing along +X at y = HEAD_Y, side handle towards +Z, cable leaving the tail towards -Z."""
import math
import bmesh
import bpy
from mathutils import Matrix
from lib import link, bm_object, empty, box, cylinder, node, material, noise, maprange, math_op
from materials import plastic

R_DISC, HEAD_Y = 0.0625, 0.036
N_SPARKS = 130


def lathe(name, prof, mat, parent, axis="X", segs=64, centre=(0.0, HEAD_Y, 0.0)):
    """Solid of revolution: prof = [(u, r), …] along `axis` through `centre`; r = 0 closes an end."""
    bm = bmesh.new()
    rings = []
    for u, r in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new((u, 0, 0))])
            continue
        rings.append([bm.verts.new((u, r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs))) for k in range(segs)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) > 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(b) == 1 and len(a) > 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        elif len(a) > 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    for ring in (rings[0], rings[-1]):
        if len(ring) > 1:
            bm.faces.new(ring if ring is rings[-1] else ring[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    rot = {"X": Matrix.Identity(3), "Z": Matrix.Rotation(-math.pi / 2, 3, "Y")}[axis]
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=centre)
    return bm_object(name, bm, mat, smooth=True, parent=parent)


def sector(name, r0, r1, a0, a1, y0, y1, mat, parent, segs=48):
    """Solid ring sector in the XZ plane (angle from +X towards +Z) between y0 and y1."""
    bm = bmesh.new()
    loops = []
    for y in (y0, y1):
        inner = [bm.verts.new((r0 * math.cos(a), y, r0 * math.sin(a))) for a in (a0 + (a1 - a0) * k / segs for k in range(segs + 1))]
        outer = [bm.verts.new((r1 * math.cos(a), y, r1 * math.sin(a))) for a in (a0 + (a1 - a0) * k / segs for k in range(segs + 1))]
        loops.append((inner, outer))
    (i0, o0), (i1, o1) = loops
    for k in range(segs):
        bm.faces.new((i0[k], o0[k], o0[k + 1], i0[k + 1]))
        bm.faces.new((i1[k + 1], o1[k + 1], o1[k], i1[k]))
        bm.faces.new((o0[k], o1[k], o1[k + 1], o0[k + 1]))
        bm.faces.new((i0[k + 1], i1[k + 1], i1[k], i0[k]))
    for k in (0, segs):
        bm.faces.new((i0[k], i1[k], o1[k], o0[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_object(name, bm, mat, smooth=False, parent=parent)


def bumpy(scale, strength, dist=0.0003, stretch=(1, 1, 1), rough=None):
    def build(nt, b):
        n = noise(nt, scale, 6.0, 0.6, stretch)
        bp = node(nt, "ShaderNodeBump", Strength=strength, Distance=dist)
        nt.links.new(n.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
        if rough:
            nt.links.new(maprange(nt, noise(nt, scale / 20, 3.0, 0.5), *rough).outputs["Result"], b.inputs["Roughness"])
    return build


def ribs(nt, b):
    """Rubber overmould: rings across the grip and a fine grain."""
    co = nt.nodes.new("ShaderNodeTexCoord")
    wave = node(nt, "ShaderNodeTexWave", Scale=180.0, Distortion=0.0, Detail=0.0)
    wave.bands_direction = "X"
    nt.links.new(co.outputs["Object"], wave.inputs["Vector"])
    grain = noise(nt, 1400.0, 4.0, 0.6)
    h = math_op(nt, "ADD", wave.outputs["Fac"], grain.outputs["Fac"])
    bp = node(nt, "ShaderNodeBump", Strength=0.45, Distance=0.0006)
    nt.links.new(h.outputs[0], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def disc_material():
    """Cutting disc: dark abrasive grain outside, a printed label (white hub ring, blue field, white lettering bands,
    yellow rim). The value node "spin" (0 at rest, 1 running) averages the lettering round the disc."""
    m = material("gr-disc", (0.05, 0.05, 0.052), 0.88)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    co = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(co.outputs["Object"], sep.inputs["Vector"])
    x2 = math_op(nt, "MULTIPLY", sep.outputs["X"], sep.outputs["X"])
    z2 = math_op(nt, "MULTIPLY", sep.outputs["Z"], sep.outputs["Z"])
    r = math_op(nt, "SQRT", math_op(nt, "ADD", x2.outputs[0], z2.outputs[0]).outputs[0])
    ang = nt.nodes.new("ShaderNodeMath")
    ang.operation = "ARCTAN2"
    nt.links.new(sep.outputs["Z"], ang.inputs[0]); nt.links.new(sep.outputs["X"], ang.inputs[1])
    spin = node(nt, "ShaderNodeValue"); spin.name = "spin"; spin.outputs[0].default_value = 0.0
    rn = math_op(nt, "DIVIDE", r.outputs[0], val=R_DISC)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.8, 0.8, 0.78, 1)
    els[1].position, els[1].color = 0.248, (0.012, 0.05, 0.3, 1)
    for pos, col in ((0.688, (0.85, 0.6, 0.04, 1)), (0.712, (0.045, 0.045, 0.048, 1))):
        e = els.new(pos); e.color = col
    nt.links.new(rn.outputs[0], ramp.inputs["Fac"])

    def band(lo, hi):
        a = math_op(nt, "GREATER_THAN", r.outputs[0], val=lo)
        c = math_op(nt, "LESS_THAN", r.outputs[0], val=hi)
        return math_op(nt, "MULTIPLY", a.outputs[0], c.outputs[0])

    def ticks(freq, phase, thr):
        k = math_op(nt, "SINE", math_op(nt, "ADD", math_op(nt, "MULTIPLY", ang.outputs[0], val=freq).outputs[0], val=phase).outputs[0])
        return math_op(nt, "GREATER_THAN", k.outputs[0], val=thr)

    letters = math_op(nt, "MULTIPLY", ticks(95, 0.0, 0.15).outputs[0], ticks(6, 0.7, -0.55).outputs[0])
    t1 = math_op(nt, "MULTIPLY", band(0.025, 0.0335).outputs[0], letters.outputs[0])
    t2 = math_op(nt, "MULTIPLY", band(0.0365, 0.0405).outputs[0], ticks(170, 0.0, 0.4).outputs[0])
    crisp = math_op(nt, "MAXIMUM", t1.outputs[0], t2.outputs[0])
    smear = math_op(nt, "ADD", math_op(nt, "MULTIPLY", band(0.025, 0.0335).outputs[0], val=0.3).outputs[0],
                    math_op(nt, "MULTIPLY", band(0.0365, 0.0405).outputs[0], val=0.25).outputs[0])
    mix_m = nt.nodes.new("ShaderNodeMix")
    mix_m.data_type = "FLOAT"
    nt.links.new(spin.outputs[0], mix_m.inputs["Factor"])
    nt.links.new(crisp.outputs[0], mix_m.inputs["A"]); nt.links.new(smear.outputs[0], mix_m.inputs["B"])
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    nt.links.new(mix_m.outputs["Result"], col.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], col.inputs["A"])
    col.inputs["B"].default_value = (0.82, 0.82, 0.8, 1)
    grain = noise(nt, 3500.0, 3.0, 0.7)
    abr = band(0.0445, 1.0)
    shade = maprange(nt, grain, 0.7, 1.25, 0.3, 0.7)
    tint = math_op(nt, "ADD", math_op(nt, "MULTIPLY", abr.outputs[0], math_op(nt, "SUBTRACT", shade.outputs["Result"], val=1.0).outputs[0]).outputs[0], val=1.0)
    final = nt.nodes.new("ShaderNodeMix")
    final.data_type = "RGBA"; final.blend_type = "MULTIPLY"
    final.inputs["Factor"].default_value = 1.0
    nt.links.new(col.outputs["Result"], final.inputs["A"])
    gray = nt.nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        nt.links.new(tint.outputs[0], gray.inputs[ch])
    nt.links.new(gray.outputs["Color"], final.inputs["B"])
    nt.links.new(final.outputs["Result"], b.inputs["Base Color"])
    rr = math_op(nt, "ADD", math_op(nt, "MULTIPLY", abr.outputs[0], val=0.46).outputs[0], val=0.44)
    nt.links.new(rr.outputs[0], b.inputs["Roughness"])
    bstr = math_op(nt, "MULTIPLY", abr.outputs[0], math_op(nt, "SUBTRACT", math_op(nt, "MULTIPLY", spin.outputs[0], val=-0.25).outputs[0], val=-0.3).outputs[0])
    bp = node(nt, "ShaderNodeBump", Distance=0.0002)
    nt.links.new(bstr.outputs[0], bp.inputs["Strength"])
    nt.links.new(grain.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m, spin


def spark_material():
    m = bpy.data.materials.new("gr-spark")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    em = nt.nodes.new("ShaderNodeEmission")
    bb = node(nt, "ShaderNodeBlackbody", Temperature=1850.0)
    info = nt.nodes.new("ShaderNodeObjectInfo")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(info.outputs["Color"], sep.inputs["Color"])
    nt.links.new(bb.outputs["Color"], em.inputs["Color"])
    nt.links.new(math_op(nt, "MULTIPLY", sep.outputs["Red"], val=90.0).outputs[0], em.inputs["Strength"])
    nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def build_grinder(M):
    mats = {
        "navy": material("gr-navy", (0.01, 0.026, 0.15), 0.4, 0.0, plastic),
        "rubber": material("gr-rubber", (0.016, 0.016, 0.018), 0.7, 0.0, ribs),
        "black": material("gr-black", (0.02, 0.02, 0.022), 0.48, 0.0, plastic),
        "alu": material("gr-alu", (0.6, 0.61, 0.62), 0.48, 1.0, bumpy(900.0, 0.25, 0.0004, rough=(0.38, 0.6))),
        "steel": material("gr-steel", (0.6, 0.62, 0.64), 0.34, 1.0, bumpy(300.0, 0.06, 0.0002, (1, 1, 40), (0.26, 0.46))),
        "vent": material("gr-vent", (0.004, 0.004, 0.005), 0.9),
    }
    disc_mat, spin = disc_material()
    g = empty("grinder")
    disc = cylinder("grinder-disc", R_DISC, 0.0012, disc_mat, segs=128, loc=(0, -0.0006, 0), axis="Y", parent=g)
    cylinder("grinder-nut", 0.0125, 0.0035, mats["steel"], segs=48, loc=(0, -0.0041, 0), axis="Y", bev=0.0006, parent=g)
    for sx in (-1, 1):
        cylinder(f"grinder-pin{sx}", 0.0017, 0.0005, mats["vent"], segs=16, loc=(sx * 0.0075, -0.00445, 0), axis="Y", parent=g)
    cylinder("grinder-thread", 0.0068, 0.0012, mats["steel"], segs=32, loc=(0, -0.0049, 0), axis="Y", parent=g)
    cylinder("grinder-flange", 0.017, 0.003, mats["steel"], segs=48, loc=(0, 0.0006, 0), axis="Y", bev=0.0005, parent=g)
    cylinder("grinder-collar", 0.0115, 0.011, mats["alu"], segs=48, loc=(0, 0.0036, 0), axis="Y", parent=g)
    # cast gear head: round housing on the spindle, a stepped cap with four screws and the lock, an arm to the motor
    cylinder("grinder-head", 0.031, 0.04, mats["alu"], segs=72, loc=(0, 0.0125, 0), axis="Y", bev=0.006, parent=g)
    cylinder("grinder-cap", 0.0265, 0.0065, mats["alu"], segs=72, loc=(0, 0.0525, 0), axis="Y", bev=0.0025, parent=g)
    arm = box("grinder-head-arm", (0.05, 0.036, 0.05), mats["alu"], (0.022, HEAD_Y, 0), 0.008, g)
    arm.modifiers["bevel"].segments = 4
    cylinder("grinder-lock", 0.0062, 0.0035, mats["black"], segs=32, loc=(0, 0.0588, 0), axis="Y", bev=0.0012, parent=g)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cylinder(f"grinder-screw{k}", 0.0021, 0.0009, mats["vent"], segs=16, loc=(0.0195 * math.cos(a), 0.0588, 0.0195 * math.sin(a)), axis="Y", parent=g)
    for sz in (-1, 1):
        cylinder(f"grinder-boss{sz}", 0.0092, 0.008, mats["alu"], segs=32, loc=(0.008, HEAD_Y, 0.027 if sz > 0 else -0.035), axis="Z", parent=g)
    lathe("grinder-neck", [(0.041, 0.0), (0.041, 0.0255), (0.06, 0.0285), (0.076, 0.0312), (0.0762, 0.0)], mats["navy"], g)
    lathe("grinder-body", [(0.075, 0.0), (0.075, 0.0318), (0.1, 0.0326), (0.15, 0.0318), (0.2, 0.0304), (0.24, 0.031),
                           (0.258, 0.0302), (0.268, 0.027), (0.275, 0.021), (0.279, 0.013), (0.28, 0.0)], mats["navy"], g)
    lathe("grinder-grip", [(0.152, 0.0), (0.152, 0.0322), (0.156, 0.0327), (0.2, 0.0313), (0.226, 0.0316), (0.23, 0.0311), (0.23, 0.0)],
          mats["rubber"], g)
    for k in range(14):  # ventilation slots round the front of the housing and the tail
        a = 2 * math.pi * k / 14
        for xc, ln, rr in ((0.093, 0.022, 0.0327), (0.246, 0.014, 0.0311)):
            v = box(f"grinder-vent{xc}-{k}", (ln, 0.0016, 0.0032), mats["vent"], (0, 0, 0), 0.0006, g)
            v.matrix_basis = Matrix.Translation((xc, HEAD_Y, 0)) @ Matrix.Rotation(a, 4, "X") @ Matrix.Translation((0, rr - 0.0006, 0))
    sw = box("grinder-switch", (0.036, 0.007, 0.014), mats["black"], (0.13, HEAD_Y + 0.0318, 0), 0.0025, g)
    sw.modifiers["bevel"].segments = 4
    lathe("grinder-relief", [(0.278, 0.0), (0.278, 0.0098), (0.3, 0.0086), (0.33, 0.0066), (0.352, 0.0049), (0.355, 0.0)], mats["rubber"], g)
    cylinder("grinder-stud", 0.004, 0.012, mats["steel"], segs=24, loc=(0.008, HEAD_Y, 0.035), axis="Z", parent=g)
    lathe("grinder-handle", [(0.046, 0.0), (0.046, 0.0105), (0.052, 0.0128), (0.11, 0.0128), (0.122, 0.0135), (0.13, 0.0125),
                             (0.134, 0.008), (0.135, 0.0)], mats["rubber"], g, axis="Z", centre=(0.008, HEAD_Y, 0.0))
    # guard: half shield over the body side (+X), a 1 mm sheet with a rim curled round the disc edge, and its collar
    sector("grinder-guard", 0.0135, 0.0685, -math.pi / 2, math.pi / 2, 0.0042, 0.0052, mats["steel"], g)
    sector("grinder-guard-rim", 0.0675, 0.0685, -math.pi / 2, math.pi / 2, -0.0045, 0.0052, mats["steel"], g)
    sector("grinder-guard-lip", 0.0645, 0.0685, -math.pi / 2, math.pi / 2, -0.0053, -0.0045, mats["steel"], g)
    sector("grinder-guard-collar", 0.0118, 0.0136, 0.0, 2 * math.pi, 0.0052, 0.0126, mats["steel"], g)
    box("grinder-guard-clamp", (0.008, 0.007, 0.01), mats["steel"], (-0.016, 0.009, 0.0), 0.001, g)
    cable = cable_mesh(mats["rubber"])
    cable.parent = g
    for c in g.children:
        c.visible_shadow = True
    return {"rig": g, "disc": disc, "spin": spin, "sparks": build_sparks(), "light": build_spark_light()}


def cable_mesh(mat):
    cu = bpy.data.curves.new("grinder-cable", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth, cu.bevel_resolution = 0.0036, 4
    sp = cu.splines.new("BEZIER")
    pts = [(0.35, HEAD_Y, 0.0), (0.46, HEAD_Y, -0.04), (0.53, HEAD_Y + 0.02, -0.16), (0.56, HEAD_Y + 0.05, -0.45)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    ob = link(bpy.data.objects.new("grinder-cable-curve", cu))
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    me.materials.clear(); me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new("grinder-cable", me))


def build_sparks():
    """A pool of streaks: unit length along local +Z from the origin, scaled per frame to the distance a spark covers
    in 1/60 s; the object colour (red channel) carries its glow."""
    mat = spark_material()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.00012, radius2=0.00034, depth=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    me = bpy.data.meshes.new("spark")
    bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    out = []
    for k in range(N_SPARKS):
        ob = link(bpy.data.objects.new(f"spark{k:02d}", me))
        ob.visible_shadow = False
        ob.visible_diffuse = False  # their glow on the wall comes from the one spark light, not from 130 emitters
        ob.hide_render = True
        out.append(ob)
    return out


def build_spark_light():
    L = bpy.data.lights.new("spark-light", "POINT")
    L.color = (1.0, 0.52, 0.18)
    L.energy = 0.0
    L.shadow_soft_size = 0.004
    ob = link(bpy.data.objects.new("spark-light", L))
    ob.hide_render = True
    return ob
