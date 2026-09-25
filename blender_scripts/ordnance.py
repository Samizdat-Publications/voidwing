"""
Ordnance and debris family.

missile.glb  Missile (body, fins, nose, paint band) + Missile_Glow emissive exhaust. Nose toward +Y.
debris.glb   Debris_Metal_0..2 (bent hull shards, hot edges) and Debris_Rock_0..2 (rock chunks) used by
             the explosion and asteroid-break particle systems. Each piece is about 1 m across; the
             game scales them.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector, noise

import vw_common as vw


def build_missile(b):
    bm = bmesh.new()
    BODY, DARK, BAND = 0, 1, 2
    vw.bm_cylinder(bm, 0.2, 2.2, 12, center=(0, 0, 0), axis="Y", mat_index=BODY)
    vw.bm_cylinder(bm, 0.2, 0.55, 12, center=(0, 1.37, 0), axis="Y", mat_index=BODY, radius2=0.02)  # nose cone
    vw.bm_cylinder(bm, 0.205, 0.22, 12, center=(0, 0.55, 0), axis="Y", mat_index=BAND)
    vw.bm_cylinder(bm, 0.16, 0.25, 12, center=(0, -1.2, 0), axis="Y", mat_index=DARK, radius2=0.2, cap=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        fin = vw.bm_box(bm, (0.03, 0.5, 0.34), center=(0, 0, 0), mat_index=DARK)
        vw.bm_transform(bm, fin, rot=(0, math.degrees(a), 0))
        bmesh.ops.translate(bm, verts=fin, vec=(math.cos(a) * 0.3, -0.85, math.sin(a) * 0.3))
        canard = vw.bm_box(bm, (0.02, 0.22, 0.16), center=(0, 0, 0), mat_index=DARK)
        vw.bm_transform(bm, canard, rot=(0, math.degrees(a), 0))
        bmesh.ops.translate(bm, verts=canard, vec=(math.cos(a) * 0.24, 0.9, math.sin(a) * 0.24))
    ob = vw.obj_from_bmesh(b, "Missile", bm)
    ob.data.materials.append(vw.principled("Missile_Body", base=(0.82, 0.82, 0.8), metal=0.4, rough=0.35))
    ob.data.materials.append(vw.principled("Missile_Dark", base=(0.08, 0.08, 0.09), metal=0.7, rough=0.4))
    ob.data.materials.append(vw.principled("Missile_Band", base=(0.75, 0.1, 0.06), metal=0.3, rough=0.4))
    vw.add_smooth_by_angle(b, ob, 40)
    gb = bmesh.new()
    vw.bm_cylinder(gb, 0.14, 0.04, 12, center=(0, -1.3, 0), axis="Y")
    glow = vw.obj_from_bmesh(b, "Missile_Glow", gb)
    glow.data.materials.append(vw.principled("Missile_GlowMat", base=(1, 0.7, 0.4), emission=(1.0, 0.75, 0.4), strength=14.0))
    root = bpy.data.objects.new("MissileRoot", None)
    b.link(root)
    ob.parent = root
    glow.parent = root
    vw.export_glb(b, [root, ob, glow], "missile.glb")
    vw.preview(b, [ob, glow], "missile.png", elev=20, azim=-60, size=500)
    ob.hide_render = glow.hide_render = True


def shard(bm, rng):
    """Irregular bent plate: a random polygon, thickened, with a crease."""
    n = rng.randint(5, 7)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.3, 0.3)
        r = rng.uniform(0.35, 0.6)
        pts.append(Vector((math.cos(a) * r, math.sin(a) * r, 0)))
    top = [bm.verts.new(p + Vector((0, 0, 0.04))) for p in pts]
    bot = [bm.verts.new(p - Vector((0, 0, 0.04))) for p in pts]
    faces = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((top[i], bot[i], bot[j], top[j])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bend = rng.uniform(0.2, 0.5)
    for v in top + bot:
        v.co.z += bend * max(0.0, v.co.x) ** 2  # bend one side up
    return faces


def rock_chunk(bm, rng):
    res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5)
    off = Vector((rng.uniform(-9, 9), rng.uniform(-9, 9), rng.uniform(-9, 9)))
    for v in res["verts"]:
        n = v.co.normalized()
        h = 1 + 0.35 * noise.noise(n * 1.8 + off) + 0.12 * noise.noise(n * 5 + off)
        v.co = n * 0.5 * h
        v.co.z *= 0.7
    return res["verts"]


def build_debris(b):
    rng = random.Random(3)
    objs = []
    hot = vw.principled("Debris_Hot", base=(0.12, 0.11, 0.1), metal=0.7, rough=0.45, emission=(1.0, 0.35, 0.08), strength=1.6)
    rock = vw.principled("Debris_Rock", base=(0.3, 0.27, 0.24), metal=0.0, rough=0.95)
    for i in range(3):
        bm = bmesh.new()
        shard(bm, rng)
        ob = vw.obj_from_bmesh(b, f"Debris_Metal_{i}", bm)
        ob.data.materials.append(hot)
        ob.location = (i * 1.5, 0, 0)
        objs.append(ob)
    for i in range(3):
        bm = bmesh.new()
        rock_chunk(bm, rng)
        ob = vw.obj_from_bmesh(b, f"Debris_Rock_{i}", bm, smooth=True)
        ob.data.materials.append(rock)
        ob.location = (i * 1.5, 2, 0)
        objs.append(ob)
    vw.preview(b, objs, "debris.png", elev=35, azim=-20, size=600)
    for ob in objs:
        ob.location = (0, 0, 0)
    vw.export_glb(b, objs, "debris.glb")


def main():
    b = vw.Build("ordnance", samples=8)
    try:
        build_missile(b)
        build_debris(b)
    finally:
        b.close()


if __name__ == "__main__":
    main()
