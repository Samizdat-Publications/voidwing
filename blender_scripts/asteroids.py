"""
Asteroid family: four rock variants with baked procedural rock textures.

For each variant a high-poly sculpt (icosphere + fractal lumps + craters with raised rims) is
built in Python, a game mesh is decimated from it, and the procedural Cycles rock material
(colour noise, crater darkening, mineral veins, edge wear) plus the high-poly surface detail
are baked down onto the game mesh:
  base colour (with ambient occlusion multiplied in) + tangent-space normal map.

Outputs: public/assets/asteroid_a.glb .. asteroid_d.glb (unit radius, the game scales them)
         test-output/asset-previews/asteroids.png
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

import vw_common as vw

TEX = 1024
HIGH_SUBDIV = 6
LOW_FACES = 2400

VARIANTS = [
    # name, seed, ellipsoid, lump strength, craters, ridge, facet, base colours (dark, light), vein colour
    dict(name="a", seed=11, shape=(1.0, 0.86, 0.78), lumps=0.2, craters=16, ridge=0.0, facet=0.0,
         dark=(0.16, 0.145, 0.13), light=(0.42, 0.39, 0.35), vein=(0.62, 0.66, 0.7)),
    dict(name="b", seed=23, shape=(1.38, 0.8, 0.72), lumps=0.16, craters=11, ridge=0.08, facet=0.0,
         dark=(0.19, 0.12, 0.09), light=(0.48, 0.33, 0.24), vein=(0.75, 0.55, 0.35)),
    dict(name="c", seed=37, shape=(1.05, 1.0, 0.82), lumps=0.12, craters=6, ridge=0.0, facet=0.22,
         dark=(0.11, 0.115, 0.125), light=(0.3, 0.31, 0.33), vein=(0.45, 0.62, 0.75)),
    dict(name="d", seed=53, shape=(1.12, 0.92, 0.66), lumps=0.26, craters=22, ridge=0.05, facet=0.06,
         dark=(0.2, 0.18, 0.15), light=(0.55, 0.5, 0.42), vein=(0.7, 0.7, 0.62)),
]


def sculpt(v):
    """Return (bmesh, per-vertex cavity) for the high-poly rock."""
    vw.seed_all(v["seed"])
    rng = random.Random(v["seed"])
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=HIGH_SUBDIV, radius=1.0)
    craters = []
    for _ in range(v["craters"]):
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        r = rng.uniform(0.1, 0.42) * (1.0 if rng.random() > 0.2 else 1.5)
        depth = r * rng.uniform(0.25, 0.45)
        craters.append((d, r, depth))
    off = Vector((rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(-50, 50)))
    sx, sy, sz = v["shape"]
    cav = []
    for vert in bm.verts:
        n = vert.co.normalized()
        p = n + off
        h = 1.0
        h += v["lumps"] * vw.fbm(p * 1.3, octaves=4)
        h += 0.05 * vw.fbm(p * 4.0, octaves=3)
        if v["ridge"] > 0:
            h += v["ridge"] * (1.0 - abs(noise.noise(p * 2.2))) ** 3
        if v["facet"] > 0:
            # Cell noise gives flat-ish facets, like a fractured chunk.
            h += v["facet"] * (noise.cell(p * 2.6) - 0.5)
        c_amount = 0.0
        for d, r, depth in craters:
            ang = math.acos(max(-1.0, min(1.0, n.dot(d))))
            t = ang / r
            if t < 1.0:
                bowl = 1.0 - t * t
                h -= depth * bowl
                c_amount = max(c_amount, bowl)
            elif t < 1.6:
                h += depth * 0.35 * math.exp(-((t - 1.0) / 0.22) ** 2)
        h += 0.012 * noise.noise(p * 18.0)
        co = n * h
        vert.co = Vector((co.x * sx, co.y * sy, co.z * sz))
        cav.append(c_amount)
    # Normalise so the largest extent is 1.
    maxr = max(vert.co.length for vert in bm.verts)
    for vert in bm.verts:
        vert.co /= maxr
    return bm, cav


def rock_material(v, name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    tc = vw.node(nt, "ShaderNodeTexCoord", (-1400, 0))
    # Large colour patches.
    n1 = vw.node(nt, "ShaderNodeTexNoise", (-1100, 300))
    n1.inputs["Scale"].default_value = 2.2
    n1.inputs["Detail"].default_value = 6.0
    n1.inputs["Roughness"].default_value = 0.6
    vw.link(nt, tc.outputs["Object"], n1.inputs["Vector"])
    ramp = vw.node(nt, "ShaderNodeValToRGB", (-850, 300))
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*v["dark"], 1)
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (*v["light"], 1)
    vw.link(nt, n1.outputs["Fac"], ramp.inputs["Fac"])
    # Fine grain.
    n2 = vw.node(nt, "ShaderNodeTexNoise", (-1100, 0))
    n2.inputs["Scale"].default_value = 28.0
    n2.inputs["Detail"].default_value = 4.0
    vw.link(nt, tc.outputs["Object"], n2.inputs["Vector"])
    grain = vw.Mix(nt, "MULTIPLY", (-600, 200), fac=0.35)
    vw.link(nt, ramp.outputs["Color"], grain.a)
    vw.link(nt, n2.outputs["Color"], grain.b)
    # Crater cavity darkening from the sculpt attribute.
    attr = vw.node(nt, "ShaderNodeAttribute", (-850, -150), attribute_name="cav")
    cav_mul = vw.Mix(nt, "MULTIPLY", (-400, 150), b=(0.45, 0.43, 0.42))
    vw.link(nt, attr.outputs["Fac"], cav_mul.fac)
    vw.link(nt, grain.out, cav_mul.a)
    # Mineral veins: thin voronoi edges.
    vor = vw.node(nt, "ShaderNodeTexVoronoi", (-1100, -350))
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 3.2
    vw.link(nt, tc.outputs["Object"], vor.inputs["Vector"])
    vein_mask = vw.node(nt, "ShaderNodeMapRange", (-850, -350))
    vein_mask.inputs["From Min"].default_value = 0.0
    vein_mask.inputs["From Max"].default_value = 0.025
    vein_mask.inputs["To Min"].default_value = 0.7
    vein_mask.inputs["To Max"].default_value = 0.0
    vw.link(nt, vor.outputs["Distance"], vein_mask.inputs["Value"])
    veins = vw.Mix(nt, "MIX", (-200, 100), b=v["vein"])
    vw.link(nt, vein_mask.outputs["Result"], veins.fac)
    vw.link(nt, cav_mul.out, veins.a)
    # Edge wear from pointiness (Cycles).
    geo = vw.node(nt, "ShaderNodeNewGeometry", (-850, -600))
    wear = vw.node(nt, "ShaderNodeMapRange", (-600, -600))
    wear.inputs["From Min"].default_value = 0.5
    wear.inputs["From Max"].default_value = 0.56
    wear.inputs["To Min"].default_value = 0.0
    wear.inputs["To Max"].default_value = 0.35
    vw.link(nt, geo.outputs["Pointiness"], wear.inputs["Value"])
    edge = vw.Mix(nt, "SCREEN", (0, 100), b=(0.8, 0.78, 0.74))
    vw.link(nt, wear.outputs["Result"], edge.fac)
    vw.link(nt, veins.out, edge.a)
    vw.link(nt, edge.out, p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.9
    # Micro bump for the normal bake.
    bump = vw.node(nt, "ShaderNodeBump", (-200, -400))
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.02
    n3 = vw.node(nt, "ShaderNodeTexNoise", (-600, -900))
    n3.inputs["Scale"].default_value = 45.0
    n3.inputs["Detail"].default_value = 6.0
    vw.link(nt, tc.outputs["Object"], n3.inputs["Vector"])
    vw.link(nt, n3.outputs["Fac"], bump.inputs["Height"])
    vw.link(nt, bump.outputs["Normal"], p.inputs["Normal"])
    return m


def build_variant(build, v):
    bm, cav = sculpt(v)
    high = vw.obj_from_bmesh(build, f"rock_{v['name']}_high", bm, smooth=True)
    attr = high.data.attributes.new("cav", "FLOAT", "POINT")
    attr.data.foreach_set("value", np.array(cav, dtype=np.float32))
    mat = rock_material(v, f"rock_{v['name']}_proc")
    high.data.materials.append(mat)

    # Game mesh: decimated copy.
    low = high.copy()
    low.data = high.data.copy()
    low.name = f"Asteroid_{v['name'].upper()}"
    low.data.name = low.name
    build.link(low)
    dec = low.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = LOW_FACES / len(high.data.polygons)
    dec.use_collapse_triangulate = True
    vw.apply_modifiers(build, low)
    low.data.materials.clear()
    low.data.shade_smooth()
    if "cav" in low.data.attributes:
        low.data.attributes.remove(low.data.attributes["cav"])
    bake_mat = bpy.data.materials.new(f"rock_{v['name']}_bake")
    bake_mat.use_nodes = True
    low.data.materials.append(bake_mat)
    vw.smart_uv(build, low, angle=60.0, margin=0.006)

    color = vw.new_image(f"rock_{v['name']}_color", TEX)
    normal = vw.new_image(f"rock_{v['name']}_normal", TEX, non_color=True)
    ao = vw.new_image(f"rock_{v['name']}_ao", TEX, non_color=True)
    vw.bake(build, low, color, "DIFFUSE", sources=[high], materials=[bake_mat], pass_filter={"COLOR"}, cage=0.06, samples=8)
    vw.bake(build, low, normal, "NORMAL", sources=[high], materials=[bake_mat], cage=0.06, samples=8)
    vw.bake(build, low, ao, "AO", sources=[high], materials=[bake_mat], cage=0.06, samples=48)
    c = vw.image_pixels(color)
    a = vw.image_pixels(ao)
    c[..., :3] *= (0.35 + 0.65 * a[..., :1])
    vw.set_pixels(color, c)

    final = vw.baked_material(f"Rock_{v['name'].upper()}", color, normal, rough=0.9, metal=0.0)
    low.data.materials.clear()
    low.data.materials.append(final)
    return low, high


def main():
    b = vw.Build("asteroids", samples=16)
    try:
        lows = []
        for v in VARIANTS:
            low, high = build_variant(b, v)
            high.hide_render = True
            high.hide_set(True)
            vw.export_glb(b, [low], f"asteroid_{v['name']}.glb")
            lows.append(low)
            vw.log(f"variant {v['name']}: {len(low.data.polygons)} faces")
        for i, low in enumerate(lows):
            low.location = ((i - 1.5) * 2.6, 0, 0)
        vw.preview(b, lows, "asteroids.png", elev=20, azim=-10, size=900)
    finally:
        b.close()


if __name__ == "__main__":
    main()
