"""The parts every mounting video shares: meshes exported from the site's 3-D engine (a .json index + a .bin of
float32 positions and normals, uint32 triangles, one chunk per material), placed as Blender objects, and the studio:
the worlds (the shaft's HDRI, the navy intro backdrop) and the work lights (door film's by default)."""
import json
import math
import bpy
import numpy as np
from mathutils import Vector
from lib import MM, Y_UP, link, mesh_from, node
from materials import ASSETS

DOOR_LIGHTS = (("key", (-0.62, -1.4, 0.9), (0.2, 0, -0.25), 0.32, 0.22, 70.0, (1.0, 0.97, 0.93)),
               ("fill", (1.6, -1.2, 0.2), (0.3, 0, -0.25), 1.0, 1.4, 0.5, (0.88, 0.93, 1.0)),
               ("top", (0.3, -0.5, 1.6), (0.3, 0, -0.2), 1.6, 1.2, 0.6, (1, 1, 1)))


def load_meshes(stem):
    meta = json.load(open(f"{stem}.json"))
    raw = open(f"{stem}.bin", "rb").read()
    out = []
    for m in meta["meshes"]:
        ps, ns, idx, mats, base = [], [], [], [], 0
        for k, (mat, c) in enumerate(m["chunks"].items()):
            p = np.frombuffer(raw, np.float32, c["verts"] * 3, c["p"]).reshape(-1, 3).astype(np.float64)
            n = np.frombuffer(raw, np.float32, c["verts"] * 3, c["n"]).reshape(-1, 3).astype(np.float64)
            i = np.frombuffer(raw, np.uint32, c["tris"] * 3, c["i"]).astype(np.int64)
            ps.append(p); ns.append(n); idx.append(i + base); mats.append((mat, len(i) // 3)); base += len(p)
        out.append({"tag": m["tag"], "kind": m["kind"], "p": np.concatenate(ps), "n": np.concatenate(ns),
                    "i": np.concatenate(idx), "mats": mats})
    return meta, out


def object_from(name, rec, M, origin_mm, parent, scale=1.0):
    """Mesh in metres (Blender axes) with its origin at origin_mm (three.js mm)."""
    p = (rec["p"] - np.asarray(origin_mm)) @ Y_UP.T * scale
    n = rec["n"] @ (Y_UP.T / MM)
    me = mesh_from(name, p, rec["i"], n, [M[m] for m, _ in rec["mats"]])
    # material index per triangle, in chunk order
    mi = np.concatenate([np.full(cnt, k, np.int32) for k, (_, cnt) in enumerate(rec["mats"])])
    me.polygons.foreach_set("material_index", mi)
    ob = link(bpy.data.objects.new(name, me))
    ob.parent = parent
    ob.location = Vector(Y_UP @ np.asarray(origin_mm))
    return ob


def centre_of(rec):
    return (rec["p"].min(0) + rec["p"].max(0)) / 2


def studio(scene, rig=DOOR_LIGHTS):
    worlds = {}
    for name, (lo, hi, k) in {"shaft": ((0.010, 0.011, 0.014), (0.30, 0.31, 0.33), 0.55),
                              "intro": ((0.004, 0.008, 0.03), (0.10, 0.16, 0.42), 0.8)}.items():
        w = bpy.data.worlds.new(name)
        w.use_nodes = True
        nt = w.node_tree
        co = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(co.outputs["Generated"], sep.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].color = (*lo, 1)
        cr.color_ramp.elements[1].color = (*hi, 1)
        mr = node(nt, "ShaderNodeMapRange", **{"From Min": -1.0, "From Max": 1.0})
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], cr.inputs["Fac"])
        nt.links.new(cr.outputs["Color"], nt.nodes["Background"].inputs["Color"])
        nt.nodes["Background"].inputs["Strength"].default_value = k
        if name == "intro":  # the camera sees the navy backdrop, the metal reflects a bright neutral studio
            lp = nt.nodes.new("ShaderNodeLightPath")
            st = nt.nodes.new("ShaderNodeValToRGB")
            st.color_ramp.elements[0].color = (0.04, 0.04, 0.045, 1)
            st.color_ramp.elements[1].color = (1.6, 1.6, 1.6, 1)
            e = st.color_ramp.elements.new(0.52); e.color = (0.35, 0.36, 0.38, 1)
            nt.links.new(mr.outputs["Result"], st.inputs["Fac"])
            mix = nt.nodes.new("ShaderNodeMixRGB")
            nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
            nt.links.new(st.outputs["Color"], mix.inputs["Color1"])
            nt.links.new(cr.outputs["Color"], mix.inputs["Color2"])
            nt.links.new(mix.outputs["Color"], nt.nodes["Background"].inputs["Color"])
        worlds[name] = w
    w = bpy.data.worlds.new("shaft_hdri")
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(f"{ASSETS}/interior_construction_4k.hdr")
    co = nt.nodes.new("ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping", Rotation=(0, 0, math.radians(140)))
    nt.links.new(co.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 0.9
    worlds["shaft"] = w
    lights = {}

    def area(name, loc, target, w, h, radiance, colour=(1, 1, 1)):
        L = bpy.data.lights.new(name, "AREA")
        L.shape, L.size, L.size_y, L.color = "RECTANGLE", w, h, colour
        L.energy = radiance * math.pi * w * h
        ob = link(bpy.data.objects.new(name, L))
        ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        ob.visible_camera = False
        lights[name] = ob
        return ob

    for spec in rig:
        area(*spec)
    # (no rim light: anything behind the wall face is inside the concrete)
    return worlds, lights
