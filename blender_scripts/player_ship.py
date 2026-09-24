"""
Player ship family: the KV-9 Kestrel interceptor (also flown by the AI wingmen).

Modelled nose toward +Y, up +Z (the glTF export lands the nose on -Z, the game's forward).
Parts:
  Kestrel_Hull        lofted fuselage, swept wings with winglets, laser cannons, engine nacelles,
                      canted tail fins, dorsal spine, intakes and greebles. Baked panel paint:
                      base colour (+AO) and normal map, two material slots (paint / dark metal).
  Kestrel_Canopy      tinted glass canopy
  Kestrel_Trim        emissive cyan trim strips (wing leading edges, spine, nacelle rings)
  Kestrel_NavLights   red (port) / green (starboard) wingtip lights
  Kestrel_EngineGlow  emissive nozzle discs (the game drives their brightness with throttle)
  Muzzle_L/R, Exhaust_L/R  empties for gun flashes and engine trails

Output: public/assets/kestrel.glb, test-output/asset-previews/kestrel*.png
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector

import vw_common as vw

TEX = 2048
PAINT, DARK = 0, 1

# Fuselage stations: y, half-width, half-height, centre z
FUSELAGE = [
    (7.3, 0.03, 0.03, -0.06),
    (6.5, 0.28, 0.22, -0.04),
    (5.2, 0.56, 0.42, -0.02),
    (3.6, 0.86, 0.6, 0.02),
    (1.6, 1.06, 0.72, 0.05),
    (-0.8, 1.14, 0.76, 0.05),
    (-3.2, 1.1, 0.72, 0.02),
    (-4.9, 0.94, 0.62, 0.0),
    (-5.5, 0.66, 0.46, 0.0),
]

ENGINE_X = 1.4
ENGINE_Z = -0.04
ENGINE_R = 0.62
NOZZLE_Y = -5.6


def fuselage(bm):
    rings = [vw.ring(0, y, cz, rx, rz, n=14, phase=math.pi / 14, squash_bottom=0.78) for y, rx, rz, cz in FUSELAGE]
    vw.loft(bm, rings, mat_index=PAINT)


def wing(bm, s):
    """Swept wing with slight anhedral; s = -1 port, +1 starboard."""
    rle, rte = (1.0 * s, 1.3, 0.02), (1.0 * s, -4.2, 0.02)
    tle, tte = (5.4 * s, -2.4, -0.3), (5.4 * s, -4.4, -0.3)
    t_root, t_tip = 0.14, 0.06
    top = [bm.verts.new((x, y, z + t)) for (x, y, z), t in ((rle, t_root), (tle, t_tip), (tte, t_tip), (rte, t_root))]
    bot = [bm.verts.new((x, y, z - t)) for (x, y, z), t in ((rle, t_root), (tle, t_tip), (tte, t_tip), (rte, t_root))]
    faces = [
        bm.faces.new(top),
        bm.faces.new(list(reversed(bot))),
    ]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((top[i], bot[i], bot[j], top[j])))
    for f in faces:
        f.material_index = PAINT
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # Winglet angled down and out at the tip.
    wl = vw.bm_box(bm, (0.08, 1.7, 0.75), center=(5.45 * s, -3.45, -0.62), mat_index=DARK)
    vw.bm_transform(bm, wl, rot=(0, -22 * s, 0))
    # Keep the winglet anchored at the tip after rotating about its own centre.
    bmesh.ops.translate(bm, verts=wl, vec=(5.45 * s - sum(v.co.x for v in wl) / len(wl), 0, 0))


def cannon(bm, s):
    x, z = 2.45 * s, -0.3
    vw.bm_box(bm, (0.36, 3.4, 0.3), center=(x, 0.0, z), mat_index=DARK)       # housing
    vw.bm_box(bm, (0.26, 0.6, 0.12), center=(x, -0.9, z + 0.2), mat_index=DARK)  # pylon to the wing
    vw.bm_cylinder(bm, 0.09, 1.9, 10, center=(x, 2.55, z), axis="Y", mat_index=DARK)  # barrel
    vw.bm_cylinder(bm, 0.14, 0.3, 10, center=(x, 3.35, z), axis="Y", mat_index=DARK)  # muzzle brake
    vw.bm_cylinder(bm, 0.2, 0.5, 10, center=(x, 1.75, z), axis="Y", mat_index=DARK)   # emitter coil


def nacelle(bm, s):
    x = ENGINE_X * s
    # Main can, slightly tapered toward the intake.
    vw.bm_cylinder(bm, ENGINE_R, 3.4, 18, center=(x, -3.8, ENGINE_Z), axis="Y", mat_index=PAINT, radius2=ENGINE_R * 0.86)
    # Intake lip.
    vw.bm_cylinder(bm, ENGINE_R * 0.78, 0.35, 18, center=(x, -1.95, ENGINE_Z), axis="Y", mat_index=DARK, cap=True)
    # Flared nozzle (open), dark metal.
    vw.bm_cylinder(bm, ENGINE_R * 0.98, 0.7, 18, center=(x, NOZZLE_Y - 0.1, ENGINE_Z), axis="Y", mat_index=DARK, radius2=ENGINE_R * 1.08, cap=False)
    # Nozzle petals (greeble ring).
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        px, pz = math.cos(a) * ENGINE_R * 1.05, math.sin(a) * ENGINE_R * 1.05
        v = vw.bm_box(bm, (0.12, 0.8, 0.06), center=(x + px, NOZZLE_Y + 0.05, ENGINE_Z + pz), mat_index=DARK)
        vw.bm_transform(bm, v, rot=(0, math.degrees(a) + 90, 0))
        bmesh.ops.translate(bm, verts=v, vec=(x + px - sum(q.co.x for q in v) / len(v), 0, ENGINE_Z + pz - sum(q.co.z for q in v) / len(v)))
    # Cooling vents on top of the can.
    for i in range(3):
        vw.bm_box(bm, (0.5, 0.18, 0.08), center=(x, -3.0 - i * 0.45, ENGINE_Z + ENGINE_R * 0.93), mat_index=DARK)


def fins(bm, s):
    root = [(0.72 * s, -2.7, 0.62), (0.72 * s, -5.3, 0.55)]
    tip = [(1.25 * s, -4.3, 1.95), (1.25 * s, -5.6, 1.9)]
    t = 0.06
    pts = [root[0], tip[0], tip[1], root[1]]
    a = [bm.verts.new((px - t, py, pz)) for px, py, pz in pts]
    b = [bm.verts.new((px + t, py, pz)) for px, py, pz in pts]
    faces = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    for f in faces:
        f.material_index = PAINT
    bmesh.ops.recalc_face_normals(bm, faces=faces)


def details(bm):
    vw.bm_box(bm, (0.42, 5.6, 0.26), center=(0, -1.9, 0.78), mat_index=PAINT)     # dorsal spine
    vw.bm_box(bm, (0.5, 0.9, 0.3), center=(0, 4.2, -0.5), mat_index=DARK)        # sensor pod under nose
    vw.bm_cylinder(bm, 0.035, 1.1, 6, center=(0, -3.8, 1.35), axis="Z", mat_index=DARK)  # antenna
    for s in (-1, 1):
        vw.bm_box(bm, (0.4, 1.8, 0.42), center=(0.95 * s, 0.9, -0.2), mat_index=DARK)   # side intakes
        vw.bm_box(bm, (0.12, 1.2, 0.18), center=(0.62 * s, 3.1, 0.52), mat_index=DARK)  # canopy rails


def emissive_parts(build):
    trim = bmesh.new()
    for s in (-1, 1):
        # Wing leading-edge strip, just proud of the edge.
        a, b = Vector((1.1 * s, 1.18, 0.1)), Vector((5.3 * s, -2.45, -0.18))
        mid = (a + b) / 2
        length = (b - a).length
        v = vw.bm_box(trim, (0.07, length, 0.05), center=(0, 0, 0))
        ang = math.atan2(b.x - a.x, b.y - a.y)
        vw.bm_transform(trim, v, rot=(0, 0, -math.degrees(ang)))
        bmesh.ops.translate(trim, verts=v, vec=mid)
        # Nacelle glow ring.
        vw.bm_cylinder(trim, ENGINE_R * 1.02, 0.12, 18, center=(ENGINE_X * s, -5.15, ENGINE_Z), axis="Y", cap=False)
        # Fin tip light.
        vw.bm_box(trim, (0.1, 0.9, 0.06), center=(1.25 * s, -4.95, 1.95))
    vw.bm_box(trim, (0.08, 4.8, 0.04), center=(0, -2.0, 0.92))  # spine strip
    trim_ob = vw.obj_from_bmesh(build, "Kestrel_Trim", trim)
    trim_ob.data.materials.append(vw.principled("Kestrel_TrimGlow", base=(0.1, 0.5, 0.6), emission=(0.25, 0.85, 1.0), strength=6.0))

    nav = bmesh.new()
    vw.bm_box(nav, (0.12, 0.3, 0.12), center=(-5.47, -2.55, -0.28), mat_index=0)
    vw.bm_box(nav, (0.12, 0.3, 0.12), center=(5.47, -2.55, -0.28), mat_index=1)
    nav_ob = vw.obj_from_bmesh(build, "Kestrel_NavLights", nav)
    nav_ob.data.materials.append(vw.principled("Kestrel_NavRed", base=(0.5, 0.05, 0.05), emission=(1.0, 0.1, 0.08), strength=8.0))
    nav_ob.data.materials.append(vw.principled("Kestrel_NavGreen", base=(0.05, 0.5, 0.1), emission=(0.1, 1.0, 0.3), strength=8.0))

    glow = bmesh.new()
    for s in (-1, 1):
        vw.bm_cylinder(glow, ENGINE_R * 0.84, 0.04, 20, center=(ENGINE_X * s, NOZZLE_Y + 0.05, ENGINE_Z), axis="Y")
        vw.bm_cylinder(glow, ENGINE_R * 0.4, 0.04, 16, center=(ENGINE_X * s, NOZZLE_Y - 0.25, ENGINE_Z), axis="Y")
    glow_ob = vw.obj_from_bmesh(build, "Kestrel_EngineGlow", glow)
    glow_ob.data.materials.append(vw.principled("Kestrel_EngineGlow", base=(0.2, 0.6, 0.8), emission=(0.35, 0.85, 1.0), strength=12.0))
    return trim_ob, nav_ob, glow_ob


def canopy(build):
    bm = bmesh.new()
    res = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    vw.bm_transform(bm, res["verts"], loc=(0, 2.85, 0.62), scale=(0.52, 1.5, 0.44))
    # Frame hoops.
    frame = bmesh.new()
    for y, sx, sz in ((2.1, 0.5, 0.36), (3.6, 0.42, 0.3)):
        v = vw.bm_cylinder(frame, 1.0, 0.08, 16, center=(0, 0, 0), axis="Y", cap=False)
        vw.bm_transform(frame, v, loc=(0, y, 0.62), scale=(sx * 1.02, 1, sz * 1.1))
    ob = vw.obj_from_bmesh(build, "Kestrel_Canopy", bm, smooth=True)
    ob.data.materials.append(vw.principled("Kestrel_Glass", base=(0.02, 0.05, 0.08), metal=0.9, rough=0.06,
                                           emission=(0.05, 0.25, 0.4), strength=0.6))
    fr = vw.obj_from_bmesh(build, "Kestrel_CanopyFrame", frame)
    return ob, fr


def build_ship(build):
    bm = bmesh.new()
    fuselage(bm)
    for s in (-1, 1):
        wing(bm, s)
        cannon(bm, s)
        nacelle(bm, s)
        fins(bm, s)
    details(bm)
    hull = vw.obj_from_bmesh(build, "Kestrel_Hull", bm)
    paint = vw.panel_material("Kestrel_PaintProc", paint=(0.8, 0.82, 0.84), metal=0.3, rough=0.42,
                              panel=0.85, seam=0.02, grime=0.22, seed=1,
                              stripe=("X", 3.55, 4.05, (0.06, 0.42, 0.55)))
    dark = vw.panel_material("Kestrel_DarkProc", paint=(0.13, 0.14, 0.16), metal=0.7, rough=0.38,
                             panel=0.5, seam=0.015, grime=0.1, seed=2, wear=0.35)
    hull.data.materials.append(paint)
    hull.data.materials.append(dark)
    vw.bevel(build, hull, width=0.035, segments=2, angle=32)
    vw.add_smooth_by_angle(build, hull, 34)
    return hull


def bake_hull(build, hull):
    vw.smart_uv(build, hull, angle=62.0, margin=0.004)
    color = vw.new_image("Kestrel_Color", TEX)
    normal = vw.new_image("Kestrel_Normal", TEX, non_color=True)
    ao = vw.new_image("Kestrel_AO", TEX, non_color=True)
    mats = [s.material for s in hull.material_slots]
    vw.bake(build, hull, color, "DIFFUSE", materials=mats, pass_filter={"COLOR"}, samples=4)
    vw.bake(build, hull, normal, "NORMAL", materials=mats, samples=4)
    vw.bake(build, hull, ao, "AO", materials=mats, samples=64)
    c = vw.image_pixels(color)
    a = vw.image_pixels(ao)
    c[..., :3] *= 0.3 + 0.7 * a[..., :1]
    vw.set_pixels(color, c)
    paint = vw.baked_material("Kestrel_Paint", color, normal, metal=0.3, rough=0.42)
    dark = vw.baked_material("Kestrel_Metal", color, normal, metal=0.72, rough=0.36)
    hull.data.materials.clear()
    hull.data.materials.append(paint)
    hull.data.materials.append(dark)


def empties(build, root):
    points = {
        "Muzzle_L": (-2.45, 3.55, -0.3), "Muzzle_R": (2.45, 3.55, -0.3),
        "Exhaust_L": (-ENGINE_X, NOZZLE_Y - 0.4, ENGINE_Z), "Exhaust_R": (ENGINE_X, NOZZLE_Y - 0.4, ENGINE_Z),
    }
    out = []
    for name, loc in points.items():
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.3
        e.location = loc
        build.link(e)
        e.parent = root
        out.append(e)
    return out


def main():
    b = vw.Build("kestrel", samples=16)
    try:
        hull = build_ship(b)
        bake_hull(b, hull)
        glass, frame = canopy(b)
        frame.data.materials.append(bpy.data.materials["Kestrel_Metal"])
        trim, nav, glow = emissive_parts(b)
        root = bpy.data.objects.new("Kestrel", None)
        b.link(root)
        parts = [hull, glass, frame, trim, nav, glow]
        for p in parts:
            p.parent = root
        marks = empties(b, root)
        tris = sum(len(p.data.polygons) for p in parts)
        vw.log(f"kestrel faces: {tris}")
        vw.export_glb(b, [root, *parts, *marks], "kestrel.glb")
        vw.preview(b, parts, "kestrel.png", elev=24, azim=-35, size=1000)
        vw.preview(b, parts, "kestrel_rear.png", elev=12, azim=160, size=1000)
        vw.preview(b, parts, "kestrel_top.png", elev=80, azim=0, size=1000)
    finally:
        b.close()


if __name__ == "__main__":
    main()
