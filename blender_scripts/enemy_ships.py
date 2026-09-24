"""
Enemy ship family (Hegemony): the Razor dogfighter and the Maul bomber.

Shared style: dark gunmetal hulls with baked panel paint, red accent paint, red emissive running
lights and sensor slits, orange-red engine glow. Modelled nose toward +Y, up +Z.

Outputs: public/assets/razor.glb, public/assets/maul.glb (+ previews)
Each GLB: <Name>_Hull (baked), <Name>_Glow (red emissive lights), <Name>_EngineGlow,
          empties Muzzle_*, Exhaust_*.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector

import vw_common as vw

TEX = 1024
PAINT, DARK, ACCENT = 0, 1, 2

RED = (1.0, 0.12, 0.08)
ENGINE = (1.0, 0.42, 0.12)


def slab(bm, pts, thickness, mat):
    """Thicken a roughly planar polygon (list of (x, y, z)) along its own normal into a slab."""
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(pts)):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % len(pts)])
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    n = n.normalized() * (thickness / 2) if n.length > 1e-9 else Vector((0, 0, thickness / 2))
    top = [bm.verts.new(Vector(p) + n) for p in pts]
    bot = [bm.verts.new(Vector(p) - n) for p in pts]
    faces = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((top[i], bot[i], bot[j], top[j])))
    for f in faces:
        f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def mirror_x(pts):
    return [(-x, y, z) for x, y, z in reversed(pts)]


def finish_hull(build, name, bm, paint_rgb, accent_rgb, panel, seed, stripe=None):
    hull = vw.obj_from_bmesh(build, f"{name}_Hull", bm)
    hull.data.materials.append(vw.panel_material(f"{name}_PaintProc", paint=paint_rgb, metal=0.45, rough=0.4,
                                                 panel=panel, seam=0.02, grime=0.35, seed=seed, wear=0.2,
                                                 stripe=stripe))
    hull.data.materials.append(vw.panel_material(f"{name}_DarkProc", paint=(0.07, 0.07, 0.08), metal=0.75,
                                                 rough=0.35, panel=panel * 0.6, seam=0.015, grime=0.15, seed=seed + 1))
    hull.data.materials.append(vw.panel_material(f"{name}_AccentProc", paint=accent_rgb, metal=0.3, rough=0.45,
                                                 panel=panel, seam=0.02, grime=0.3, seed=seed + 2))
    vw.bevel(build, hull, width=0.04, segments=2, angle=32)
    vw.add_smooth_by_angle(build, hull, 34)
    return hull


def bake_hull(build, hull, name):
    vw.smart_uv(build, hull, angle=62.0, margin=0.005)
    color = vw.new_image(f"{name}_Color", TEX)
    normal = vw.new_image(f"{name}_Normal", TEX, non_color=True)
    ao = vw.new_image(f"{name}_AO", TEX, non_color=True)
    mats = [s.material for s in hull.material_slots]
    vw.bake(build, hull, color, "DIFFUSE", materials=mats, pass_filter={"COLOR"}, samples=4)
    vw.bake(build, hull, normal, "NORMAL", materials=mats, samples=4)
    vw.bake(build, hull, ao, "AO", materials=mats, samples=64)
    c = vw.image_pixels(color)
    a = vw.image_pixels(ao)
    c[..., :3] *= 0.3 + 0.7 * a[..., :1]
    vw.set_pixels(color, c)
    hull.data.materials.clear()
    hull.data.materials.append(vw.baked_material(f"{name}_Paint", color, normal, metal=0.45, rough=0.4))
    hull.data.materials.append(vw.baked_material(f"{name}_Metal", color, normal, metal=0.78, rough=0.34))
    hull.data.materials.append(vw.baked_material(f"{name}_Accent", color, normal, metal=0.3, rough=0.45))


def emissive_obj(build, name, bm, rgb, strength):
    ob = vw.obj_from_bmesh(build, name, bm)
    ob.data.materials.append(vw.principled(f"{name}_Mat", base=tuple(c * 0.5 for c in rgb), emission=rgb, strength=strength))
    return ob


def add_empties(build, root, points):
    out = []
    for name, loc in points.items():
        e = bpy.data.objects.new(name, None)
        e.location = loc
        e.empty_display_size = 0.4
        build.link(e)
        e.parent = root
        out.append(e)
    return out


# --------------------------------------------------------------------------------------
# Razor
# --------------------------------------------------------------------------------------
def build_razor(build):
    bm = bmesh.new()
    # Faceted pod: 8-sided loft, pointed nose.
    prof = [(7.0, 0.05, 0.05, 0.0), (5.6, 0.7, 0.5, 0.05), (3.4, 1.35, 0.95, 0.1), (0.5, 1.6, 1.15, 0.1),
            (-2.6, 1.5, 1.05, 0.05), (-4.6, 1.25, 0.9, 0.0), (-5.6, 1.0, 0.75, 0.0)]
    rings = [vw.ring(0, y, cz, rx, rz, n=8, phase=math.pi / 8, squash_bottom=0.8) for y, rx, rz, cz in prof]
    vw.loft(bm, rings, mat_index=PAINT)
    for s in (-1, 1):
        # Forward-swept mandible blade: root at the pod flank, tip far forward and out.
        blade = [(1.2 * s, -2.4, 0.0), (6.4 * s, 4.2, -0.35), (6.9 * s, 6.3, -0.4), (5.2 * s, 5.2, -0.3), (1.3 * s, 1.9, 0.0)]
        if s < 0:
            blade = list(reversed(blade))
        slab(bm, blade, 0.22, ACCENT)
        # Leading-edge armour strip in dark metal.
        vw.bm_box(bm, (0.5, 1.6, 0.3), center=(6.2 * s, 5.3, -0.36), mat_index=DARK)
        # Cannon under the blade root.
        vw.bm_box(bm, (0.42, 2.4, 0.38), center=(1.9 * s, 2.0, -0.45), mat_index=DARK)
        vw.bm_cylinder(bm, 0.1, 1.6, 10, center=(1.9 * s, 3.9, -0.45), axis="Y", mat_index=DARK)
        # Stabiliser fin, raked back.
        fin = [(0.9 * s, -2.8, 0.7), (1.8 * s, -5.9, 2.2), (1.9 * s, -6.6, 2.1), (1.0 * s, -5.6, 0.6)]
        if s < 0:
            fin = list(reversed(fin))
        slab(bm, fin, 0.12, PAINT)
    # Engine block and nozzle.
    vw.bm_box(bm, (2.4, 2.6, 1.8), center=(0, -5.3, 0.0), mat_index=DARK)
    vw.bm_cylinder(bm, 0.95, 1.2, 16, center=(0, -7.0, 0.0), axis="Y", mat_index=DARK, radius2=1.1, cap=False)
    vw.bm_box(bm, (0.5, 3.6, 0.35), center=(0, -1.8, 1.25), mat_index=DARK)  # dorsal spine
    hull = finish_hull(build, "Razor", bm, (0.2, 0.21, 0.24), (0.42, 0.06, 0.06), panel=0.8, seed=11,
                       stripe=("Y", 5.0, 5.6, (0.5, 0.05, 0.05)))

    glow = bmesh.new()
    vw.bm_box(glow, (1.1, 0.25, 0.14), center=(0, 5.3, 0.46))  # sensor slit
    for s in (-1, 1):
        vw.bm_box(glow, (0.1, 2.8, 0.06), center=(3.9 * s, 2.4, 0.1))  # blade edge line
        vw.bm_box(glow, (0.16, 0.5, 0.12), center=(6.6 * s, 6.1, -0.38))  # blade tip lamp
        vw.bm_box(glow, (0.1, 0.9, 0.08), center=(1.85 * s, -6.2, 2.15))  # fin tip
    glow_ob = emissive_obj(build, "Razor_Glow", glow, RED, 7.0)

    eng = bmesh.new()
    vw.bm_cylinder(eng, 0.9, 0.05, 20, center=(0, -7.35, 0.0), axis="Y")
    vw.bm_cylinder(eng, 0.45, 0.05, 16, center=(0, -7.0, 0.0), axis="Y")
    eng_ob = emissive_obj(build, "Razor_EngineGlow", eng, ENGINE, 12.0)
    marks = {"Muzzle_L": (-1.9, 4.8, -0.45), "Muzzle_R": (1.9, 4.8, -0.45), "Exhaust_C": (0, -7.8, 0)}
    return hull, [glow_ob, eng_ob], marks


# --------------------------------------------------------------------------------------
# Maul
# --------------------------------------------------------------------------------------
def build_maul(build):
    bm = bmesh.new()
    prof = [(13.5, 0.4, 0.3, -0.2), (11.5, 2.0, 1.2, -0.1), (7.0, 3.1, 1.8, 0.0), (0.0, 3.4, 2.0, 0.1),
            (-7.0, 3.3, 1.9, 0.1), (-11.0, 2.8, 1.6, 0.0), (-12.4, 2.2, 1.3, 0.0)]
    rings = [vw.ring(0, y, cz, rx, rz, n=6, phase=0.0, squash_top=0.85, squash_bottom=0.7) for y, rx, rz, cz in prof]
    vw.loft(bm, rings, mat_index=PAINT)
    # Armour plates along the back.
    for i, y in enumerate((6.0, 1.5, -3.0, -7.5)):
        vw.bm_box(bm, (3.4 - i * 0.2, 3.2, 0.35), center=(0, y, 1.85), mat_index=ACCENT if i % 2 == 0 else PAINT)
    # Sensor dome.
    dome = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    vw.bm_transform(bm, dome["verts"], loc=(0, 8.8, 1.45), scale=(1.1, 1.5, 0.75))
    for f in {f for v in dome["verts"] for f in v.link_faces}:
        f.material_index = DARK
    for s in (-1, 1):
        x = 6.3 * s
        # Engine pod on a pylon.
        vw.bm_box(bm, (3.4, 5.0, 0.8), center=(4.6 * s, -3.0, -0.2), mat_index=DARK)
        vw.bm_cylinder(bm, 2.0, 16.0, 16, center=(x, -2.5, -0.4), axis="Y", mat_index=PAINT)
        vw.bm_cylinder(bm, 1.5, 1.2, 16, center=(x, 5.9, -0.4), axis="Y", mat_index=DARK, radius2=1.9)  # intake
        vw.bm_cylinder(bm, 1.85, 1.4, 16, center=(x, -11.0, -0.4), axis="Y", mat_index=DARK, radius2=2.1, cap=False)
        for k in range(3):
            vw.bm_box(bm, (0.5, 1.2, 0.3), center=(x + 1.6 * s, -1.5 - k * 3.2, 0.9), mat_index=DARK)
        # Heavy plasma cannon under the nose.
        vw.bm_box(bm, (1.0, 5.5, 0.9), center=(3.6 * s, 7.5, -1.4), mat_index=DARK)
        vw.bm_cylinder(bm, 0.32, 2.4, 12, center=(3.6 * s, 11.2, -1.4), axis="Y", mat_index=DARK)
        vw.bm_cylinder(bm, 0.5, 0.6, 12, center=(3.6 * s, 9.9, -1.4), axis="Y", mat_index=ACCENT)
    # Bomb bay keel.
    vw.bm_box(bm, (2.6, 12.0, 0.7), center=(0, -1.0, -1.75), mat_index=DARK)
    hull = finish_hull(build, "Maul", bm, (0.24, 0.22, 0.2), (0.45, 0.08, 0.06), panel=1.1, seed=21,
                       stripe=("Y", 10.0, 10.9, (0.5, 0.06, 0.05)))

    glow = bmesh.new()
    vw.bm_box(glow, (1.6, 0.4, 0.2), center=(0, 12.0, 0.55))  # cockpit slit
    vw.bm_box(glow, (0.3, 0.3, 0.3), center=(0, 9.6, 2.2))    # dome lamp
    for s in (-1, 1):
        vw.bm_box(glow, (0.12, 9.0, 0.12), center=(6.3 * s + 2.02 * s, -2.5, -0.4))  # pod flank line
        vw.bm_cylinder(glow, 0.36, 0.1, 12, center=(3.6 * s, 12.45, -1.4), axis="Y")   # cannon muzzle glow
    glow_ob = emissive_obj(build, "Maul_Glow", glow, RED, 7.0)

    eng = bmesh.new()
    for s in (-1, 1):
        vw.bm_cylinder(eng, 1.7, 0.05, 20, center=(6.3 * s, -11.6, -0.4), axis="Y")
        vw.bm_cylinder(eng, 0.8, 0.05, 16, center=(6.3 * s, -11.2, -0.4), axis="Y")
    eng_ob = emissive_obj(build, "Maul_EngineGlow", eng, ENGINE, 12.0)
    marks = {"Muzzle_L": (-3.6, 12.6, -1.4), "Muzzle_R": (3.6, 12.6, -1.4),
             "Exhaust_L": (-6.3, -12.3, -0.4), "Exhaust_R": (6.3, -12.3, -0.4)}
    return hull, [glow_ob, eng_ob], marks


def export_ship(build, name, hull, extras, marks, filename):
    bake_hull(build, hull, name)
    root = bpy.data.objects.new(name, None)
    build.link(root)
    parts = [hull, *extras]
    for p in parts:
        p.parent = root
    empties = add_empties(build, root, marks)
    vw.log(f"{name} faces: {sum(len(p.data.polygons) for p in parts)}")
    vw.export_glb(build, [root, *parts, *empties], filename)
    vw.preview(build, parts, f"{name.lower()}.png", elev=22, azim=-35, size=900)
    vw.preview(build, parts, f"{name.lower()}_rear.png", elev=15, azim=150, size=900)
    return parts


def main():
    b = vw.Build("enemies", samples=16)
    try:
        hull, extras, marks = build_razor(b)
        parts = export_ship(b, "Razor", hull, extras, marks, "razor.glb")
        for p in parts:
            p.hide_render = True
        hull, extras, marks = build_maul(b)
        export_ship(b, "Maul", hull, extras, marks, "maul.glb")
    finally:
        b.close()


if __name__ == "__main__":
    main()
