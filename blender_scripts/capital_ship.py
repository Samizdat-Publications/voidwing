"""
Capital ship family: the Hegemony carrier Leviathan, its shield generators and its turrets.

leviathan.glb
  Leviathan_Bow / Leviathan_Mid / Leviathan_Stern   hull split into three breakable sections that
      share one baked 2048 px panel texture (colour + AO, normal map)
  Leviathan_Lights    emissive window strips, running lights, bridge windows
  Leviathan_Engines   emissive engine discs; Leviathan_Hangar glowing hangar mouth
  empties  HP_Gen_A..D (generator orbs), HP_Turret_1..8 (+Z = mount normal), HP_Hangar (+Y = launch
           direction), Shield (scale = shield ellipsoid radii), HP_Hull_* (explosion points)
generator.glb   base platform, Gen_Ring (the game spins it), Gen_Core (emissive orb)
turret.glb      base + "head" (barrels along +Y) with Muzzle empties

Modelled bow toward +Y, up +Z (glTF lands the bow on -Z). Sizes in metres.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Matrix, Vector

import vw_common as vw

TEX = 2048
PAINT, DARK, ACCENT = 0, 1, 2
SHIELD_RADII = (105.0, 400.0, 125.0)  # x, y (length), z: tall enough to read as a bubble
# The whole carrier is modelled at unit scale and scaled into the mesh data and hardpoints at
# export (so the game can treat section-local units as metres). Keep in step with CAPITAL.scale.
CARRIER_SCALE = 1.35

# Hull stations: y, half-width, top, bottom
PROFILE = [
    (350, 6, 5, -5),
    (300, 36, 18, -20),
    (200, 58, 30, -36),
    (80, 68, 38, -46),
    (-60, 70, 40, -48),
    (-200, 64, 36, -42),
    (-300, 52, 30, -34),
    (-345, 46, 26, -30),
]

GENERATORS = {"HP_Gen_A": (0, 180, 185), "HP_Gen_B": (0, -190, 185), "HP_Gen_C": (-195, -20, 0), "HP_Gen_D": (195, -20, 0)}
TURRETS = [
    ((30, 150, 27.5), (0, 0, 1)), ((-30, 150, 27.5), (0, 0, 1)),
    ((34, -80, 32.5), (0, 0, 1)), ((-34, -80, 32.5), (0, 0, 1)),
    ((0, 60, -47), (0, 0, -1)), ((0, -150, -46.5), (0, 0, -1)),
    ((68.5, 110, 0), (1, 0, 0)), ((-68.5, 110, 0), (-1, 0, 0)),
]
ENGINES = ((0, 0, 17), (-31, -9, 12), (31, -9, 12), (-25, 17, 9), (25, 17, 9))
# Dorsal superstructure tiers: (y_start, y_end, half_width, height above the deck).
TIERS = [(-160, 140, 16, 10), (-130, 95, 11, 8), (-100, 30, 7, 6)]
RED = (1.0, 0.12, 0.08)
WINDOW = (1.0, 0.72, 0.45)
ENGINE = (1.0, 0.45, 0.15)


def hex_ring(y, w, top, bot):
    # Six-point section: keel, lower flanks, upper flanks, ridge (counter-clockwise seen from +Y).
    return [(0, y, bot), (w, y, bot * 0.45), (w * 0.86, y, top * 0.55), (0, y, top), (-w * 0.86, y, top * 0.55), (-w, y, bot * 0.45)]


def surface_z(x, y, top=True):
    """Approximate hull surface height at (x, y) by interpolating the profile."""
    for (y0, w0, t0, b0), (y1, w1, t1, b1) in zip(PROFILE[:-1], PROFILE[1:]):
        if y1 <= y <= y0:
            k = (y - y0) / (y1 - y0)
            w, t, b = w0 + (w1 - w0) * k, t0 + (t1 - t0) * k, b0 + (b1 - b0) * k
            f = min(1.0, abs(x) / max(w, 1))
            if top:
                return t + (t * 0.55 - t) * f
            return b + (b * 0.45 - b) * f
    return 0.0


def hull_half_width(y):
    for (y0, w0, t0, b0), (y1, w1, t1, b1) in zip(PROFILE[:-1], PROFILE[1:]):
        if y1 <= y <= y0:
            return w0 + (w1 - w0) * (y - y0) / (y1 - y0)
    return 0.0


def strut(bm, p0, p1, w, mat):
    """A square beam from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    verts = vw.bm_box(bm, (w, w, d.length), center=(0, 0, 0), mat_index=mat)
    q = d.normalized().to_track_quat("Z", "Y")
    bmesh.ops.transform(bm, matrix=Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(), verts=verts)


def lattice_pylon(bm, gx, gy, base_z, top_z):
    """Tapered four-leg lattice pylon with cross bracing and a collar for the generator."""
    legs = []
    for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
        p0 = Vector((gx + sx * 10, gy + sy * 12, base_z))
        p1 = Vector((gx + sx * 3.5, gy + sy * 3.5, top_z))
        legs.append((p0, p1))
        strut(bm, p0, p1, 1.8, DARK)
    for k in range(1, 6):
        t = k / 6
        pts = [a.lerp(b, t) for a, b in legs]
        for i in range(4):
            strut(bm, pts[i], pts[(i + 1) % 4], 0.9, PAINT)
        if k % 2:
            strut(bm, pts[0], pts[2], 0.7, DARK)
    vw.bm_box(bm, (26, 30, 6), center=(gx, gy, base_z + 1), mat_index=DARK)  # footing
    vw.bm_cylinder(bm, 9, 3, 16, center=(gx, gy, top_z + 1), axis="Z", mat_index=ACCENT)  # collar


def truss_arm(bm, s, x0, x1, gy):
    """Lateral truss from the hull flank out to a side generator: two chords with diagonals."""
    top, bot = 5.0, -9.0
    strut(bm, (x0 * s, gy, top), (x1 * s, gy, top), 2.4, DARK)
    strut(bm, (x0 * s, gy, bot), (x1 * s, gy, bot), 2.4, DARK)
    n = 5
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n
        strut(bm, (x * s, gy, bot), (x * s, gy, top), 1.2, PAINT)
        if k < n:
            xn = x0 + (x1 - x0) * (k + 1) / n
            strut(bm, (x * s, gy, bot if k % 2 else top), (xn * s, gy, top if k % 2 else bot), 1.0, PAINT)


def build_hull(bm, rng):
    vw.loft(bm, [hex_ring(*p) for p in PROFILE], mat_index=PAINT)
    # Flight-deck wings amidships.
    for s in (-1, 1):
        pts = [(66 * s, 125, -6), (92 * s, 60, -8), (92 * s, -70, -8), (68 * s, -95, -6)]
        top = [bm.verts.new((x, y, z + 4)) for x, y, z in pts]
        bot = [bm.verts.new((x, y, z - 4)) for x, y, z in pts]
        faces = [bm.faces.new(top), bm.faces.new(list(reversed(bot)))]
        for i in range(4):
            j = (i + 1) % 4
            faces.append(bm.faces.new((top[i], bot[i], bot[j], top[j])))
        for f in faces:
            f.material_index = DARK
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        # Side generator on a truss arm, with a collar under the orb.
        gx, gy, gz = GENERATORS["HP_Gen_D" if s > 0 else "HP_Gen_C"]
        truss_arm(bm, s, 90, abs(gx) - 8, gy)
        vw.bm_cylinder(bm, 9, 3, 16, center=(gx, gy, -19), axis="Z", mat_index=ACCENT)
        strut(bm, (gx - 8 * s, gy, -9), (gx, gy, -18), 2.0, DARK)
        # Hangar slots along the flight-deck edge: dark recesses (their glow is in lights()).
        for y in (95, 35, -25):
            vw.bm_box(bm, (3, 40, 6), center=(s * 92.5, y, -8), mat_index=DARK)
    # Dorsal generator pylons.
    for key in ("HP_Gen_A", "HP_Gen_B"):
        gx, gy, gz = GENERATORS[key]
        lattice_pylon(bm, 0, gy, surface_z(0, gy) + 1, gz - 20)
    # Stepped dorsal superstructure: the carrier's spine.
    for (y0, y1, hw, h) in TIERS:
        base = min(surface_z(0, y0), surface_z(0, y1), surface_z(0, (y0 + y1) / 2))
        prev = 0 if hw == TIERS[0][2] else sum(t[3] for t in TIERS[: TIERS.index((y0, y1, hw, h))])
        z0 = base + prev
        vw.bm_box(bm, (hw * 2, y1 - y0, h + 6), center=(0, (y0 + y1) / 2, z0 + (h - 6) / 2 + 3), mat_index=PAINT if hw > 8 else DARK)
        # A cap plate with a lip on each tier.
        vw.bm_box(bm, (hw * 2 + 3, y1 - y0 - 6, 1.2), center=(0, (y0 + y1) / 2, z0 + h + 0.6), mat_index=DARK)
    # Command tower and bridge: the silhouette landmark, three tiers up at the stern.
    tz = surface_z(0, -250)
    vw.bm_box(bm, (52, 62, 20), center=(0, -250, tz + 8), mat_index=PAINT)
    vw.bm_box(bm, (40, 48, 16), center=(0, -254, tz + 26), mat_index=PAINT)
    vw.bm_box(bm, (30, 32, 12), center=(0, -258, tz + 40), mat_index=DARK)
    vw.bm_box(bm, (86, 18, 9), center=(0, -252, tz + 50), mat_index=PAINT)  # bridge wing
    vw.bm_box(bm, (22, 14, 8), center=(0, -260, tz + 58), mat_index=ACCENT)
    vw.bm_cylinder(bm, 1.5, 30, 8, center=(0, -266, tz + 76), axis="Z", mat_index=DARK)  # mast
    vw.bm_cylinder(bm, 1.0, 18, 8, center=(14, -260, tz + 68), axis="Z", mat_index=DARK)
    vw.bm_cylinder(bm, 7, 3, 18, center=(-20, -262, tz + 64), axis="Z", mat_index=DARK, radius2=2)  # sensor dish
    # Flank sponsons (weapon blisters) and vertical ribs break up the long sides.
    for y in (220, 40, -130):
        w = hull_half_width(y)
        for s in (-1, 1):
            vw.bm_box(bm, (16, 46, 16), center=(s * (w + 4), y, 2), mat_index=PAINT)
            vw.bm_box(bm, (6, 30, 6), center=(s * (w + 13), y, 2), mat_index=DARK)
    for y in range(-300, 300, 30):
        w = hull_half_width(y)
        for s in (-1, 1):
            vw.bm_box(bm, (2.5, 3, 30), center=(s * (w * 0.93), y, -2), mat_index=DARK)
    # Deck detail in orderly rows: trenches, vent plates and point-defence blisters.
    for s in (-1, 1):
        for y in range(-290, 300, 20):
            x = s * 24 * (1 - abs(y) / 520)
            vw.bm_box(bm, (3.5, 16, 1.4), center=(x, y, surface_z(x, y) + 0.2), mat_index=DARK)
        for y in range(-275, 280, 50):
            x = s * 38 * (1 - abs(y) / 520)
            vw.bm_box(bm, (9, 14, 1.0), center=(x, y, surface_z(x, y) + 0.2), mat_index=ACCENT if (y // 50) % 3 == 0 else DARK)
        for y in range(-240, 260, 45):
            x = s * 48 * (1 - abs(y) / 480)
            z = surface_z(x, y)
            vw.bm_cylinder(bm, 3.6, 2.4, 12, center=(x, y, z + 1), axis="Z", mat_index=PAINT, radius2=2.2)
            vw.bm_cylinder(bm, 0.5, 6, 6, center=(x, y + 3, z + 2.4), axis="Y", mat_index=DARK)
    # Dorsal spine ribs fore and aft of the superstructure.
    for y in list(range(150, 290, 20)) + list(range(-230, -170, 20)):
        z = surface_z(0, y)
        vw.bm_box(bm, (12, 8, 5), center=(0, y, z + 2), mat_index=DARK)
    # Hangar frame around the bow mouth.
    vw.bm_box(bm, (50, 8, 26), center=(0, 305, -6), mat_index=DARK)
    # Engine block: five nozzles in a housing.
    vw.bm_box(bm, (100, 26, 58), center=(0, -335, -2), mat_index=DARK)
    for x, z, r in ENGINES:
        vw.bm_cylinder(bm, r, 18, 20, center=(x, -352, z), axis="Y", mat_index=DARK, radius2=r * 1.15, cap=False)
        vw.bm_cylinder(bm, r * 1.12, 4, 20, center=(x, -346, z), axis="Y", mat_index=ACCENT)
    # Keel fin and dorsal ridge stripe.
    vw.bm_box(bm, (4, 160, 18), center=(0, -150, -44), mat_index=DARK)
    vw.bm_box(bm, (8, 120, 3), center=(0, 220, surface_z(0, 220) + 1), mat_index=ACCENT)
    # Underside: two tidy rows of tanks.
    for s in (-1, 1):
        for y in range(-270, 260, 40):
            x = s * 22 * (1 - abs(y) / 520)
            z = surface_z(x, y, top=False) + 0.5
            vw.bm_cylinder(bm, 3.2, 26, 10, center=(x, y, z - 2), axis="Y", mat_index=DARK)


def lights(build, rng):
    bm = bmesh.new()
    # Window strips along both flanks.
    for s in (-1, 1):
        for row, zfrac in enumerate((0.25, 0.05)):
            for y in range(-320, 300, 14):
                if rng.random() < 0.28:
                    continue
                zt = surface_z(0, y)
                w = next(w0 + (w1 - w0) * (y - y0) / (y1 - y0) for (y0, w0, t0, b0), (y1, w1, t1, b1) in zip(PROFILE[:-1], PROFILE[1:]) if y1 <= y <= y0)
                x = s * (w * 0.93 + 0.4)
                vw.bm_box(bm, (0.6, rng.uniform(5, 11), 1.1), center=(x, y, zt * zfrac + row))
    # Superstructure window rows.
    for (y0, y1, hw, h) in TIERS:
        base = min(surface_z(0, y0), surface_z(0, y1), surface_z(0, (y0 + y1) / 2))
        prev = 0 if hw == TIERS[0][2] else sum(t[3] for t in TIERS[: TIERS.index((y0, y1, hw, h))])
        z = base + prev + h * 0.55
        for s in (-1, 1):
            for y in range(int(y0) + 6, int(y1) - 6, 9):
                if rng.random() < 0.25:
                    continue
                vw.bm_box(bm, (0.6, 5, 1.2), center=(s * (hw + 0.4), y, z))
    # Bridge windows: a band across the bridge wing and the tiers below it.
    tz = surface_z(0, -250)
    vw.bm_box(bm, (82, 0.6, 2.2), center=(0, -242.8, tz + 50))
    vw.bm_box(bm, (36, 0.6, 1.4), center=(0, -229.8, tz + 26))
    win = vw.obj_from_bmesh(build, "Leviathan_Windows", bm)
    win.data.materials.append(vw.principled("Leviathan_WindowGlow", base=(0.3, 0.2, 0.1), emission=WINDOW, strength=4.0))

    bm = bmesh.new()
    for y in range(-330, 340, 30):  # red running lights on the ridge and flanks
        z = surface_z(0, y)
        vw.bm_box(bm, (1.6, 1.6, 1.6), center=(0, y, z + 3.5))
    for key in ("HP_Gen_A", "HP_Gen_B"):
        gx, gy, gz = GENERATORS[key]
        for k in range(1, 5):
            vw.bm_box(bm, (1.4, 1.4, 1.4), center=(6.6, gy, surface_z(0, gy) + (gz - 16 - surface_z(0, gy)) * k / 5))
    for s in (-1, 1):
        vw.bm_box(bm, (2, 2, 2), center=(92 * s, 60, -8))
        vw.bm_box(bm, (2, 2, 2), center=(92 * s, -70, -8))
    red = vw.obj_from_bmesh(build, "Leviathan_Running", bm)
    red.data.materials.append(vw.principled("Leviathan_RedGlow", base=(0.4, 0.05, 0.05), emission=RED, strength=8.0))

    bm = bmesh.new()
    for x, z, r in ENGINES:
        vw.bm_cylinder(bm, r * 0.92, 0.5, 24, center=(x, -356, z), axis="Y")
        vw.bm_cylinder(bm, r * 0.45, 0.5, 20, center=(x, -353, z), axis="Y")
    eng = vw.obj_from_bmesh(build, "Leviathan_Engines", bm)
    eng.data.materials.append(vw.principled("Leviathan_EngineGlow", base=(0.5, 0.2, 0.05), emission=ENGINE, strength=10.0))

    bm = bmesh.new()
    vw.bm_box(bm, (44, 1.0, 18), center=(0, 309.2, -6))
    for s in (-1, 1):
        for y in (95, 35, -25):
            vw.bm_box(bm, (0.8, 34, 3), center=(s * 94.3, y, -8))
    hang = vw.obj_from_bmesh(build, "Leviathan_Hangar", bm)
    hang.data.materials.append(vw.principled("Leviathan_HangarGlow", base=(0.5, 0.25, 0.1), emission=(1.0, 0.55, 0.25), strength=5.0))
    return [win, red, eng, hang]


def split_sections(build, hull):
    """Separate the baked hull into bow / mid / stern objects sharing the same material."""
    out = []
    for name, lo, hi in (("Leviathan_Bow", 120, 1e9), ("Leviathan_Mid", -130, 120), ("Leviathan_Stern", -1e9, -130)):
        ob = hull.copy()
        ob.data = hull.data.copy()
        ob.name = name
        ob.data.name = name
        build.link(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [f for f in bm.faces if not (lo <= f.calc_center_median().y < hi)]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
        out.append(ob)
    bpy.data.objects.remove(hull, do_unlink=True)
    return out


def bake(build, ob, name, tex):
    vw.smart_uv(build, ob, angle=60.0, margin=0.002)
    color = vw.new_image(f"{name}_Color", tex)
    normal = vw.new_image(f"{name}_Normal", tex, non_color=True)
    ao = vw.new_image(f"{name}_AO", tex, non_color=True)
    mats = [s.material for s in ob.material_slots]
    vw.bake(build, ob, color, "DIFFUSE", materials=mats, pass_filter={"COLOR"}, samples=4)
    vw.bake(build, ob, normal, "NORMAL", materials=mats, samples=4)
    vw.bake(build, ob, ao, "AO", materials=mats, samples=32)
    c = vw.image_pixels(color)
    a = vw.image_pixels(ao)
    c[..., :3] *= 0.3 + 0.7 * a[..., :1]
    vw.set_pixels(color, c)
    ob.data.materials.clear()
    ob.data.materials.append(vw.baked_material(f"{name}_Paint", color, normal, metal=0.45, rough=0.5))
    ob.data.materials.append(vw.baked_material(f"{name}_Metal", color, normal, metal=0.7, rough=0.42))
    ob.data.materials.append(vw.baked_material(f"{name}_Accent", color, normal, metal=0.35, rough=0.5))


def empty(build, name, loc, root, rot_dir=None, scale=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = 4
    if rot_dir is not None:
        # Point the empty's +Z along rot_dir.
        e.rotation_euler = Vector(rot_dir).to_track_quat("Z", "Y").to_euler()
    if scale is not None:
        e.scale = scale
    build.link(e)
    e.parent = root
    return e


def scale_carrier(objs, s):
    """Scale the carrier about its origin into mesh data, hardpoint positions and the shield radii."""
    m = Matrix.Scale(s, 4)
    for ob in objs:
        if ob.type == "MESH":
            ob.data.transform(m)
        ob.location = ob.location * s
        if ob.name == "Shield":
            ob.scale = ob.scale * s


def build_leviathan(b):
    rng = random.Random(7)
    bm = bmesh.new()
    build_hull(bm, rng)
    hull = vw.obj_from_bmesh(b, "Leviathan_Hull", bm)
    hull.data.materials.append(vw.panel_material("Lev_PaintProc", paint=(0.26, 0.27, 0.3), metal=0.45, rough=0.5,
                                                 panel=6.0, seam=0.35, grime=0.4, seed=5, wear=0.12,
                                                 stripe=("X", 28.0, 34.0, (0.4, 0.06, 0.05))))
    hull.data.materials.append(vw.panel_material("Lev_DarkProc", paint=(0.1, 0.1, 0.11), metal=0.7, rough=0.42,
                                                 panel=4.0, seam=0.25, grime=0.2, seed=6))
    hull.data.materials.append(vw.panel_material("Lev_AccentProc", paint=(0.42, 0.08, 0.06), metal=0.35, rough=0.5,
                                                 panel=6.0, seam=0.3, grime=0.3, seed=7))
    vw.add_smooth_by_angle(b, hull, 30)
    bake(b, hull, "Leviathan", TEX)
    sections = split_sections(b, hull)
    glow = lights(b, rng)
    root = bpy.data.objects.new("Leviathan", None)
    b.link(root)
    for p in sections + glow:
        p.parent = root
    marks = []
    for name, loc in GENERATORS.items():
        marks.append(empty(b, name, loc, root))
    for i, (loc, nrm) in enumerate(TURRETS):
        marks.append(empty(b, f"HP_Turret_{i + 1}", loc, root, rot_dir=nrm))
    hang = empty(b, "HP_Hangar", (0, 362, -8), root)
    marks.append(hang)
    marks.append(empty(b, "Shield", (0, 0, 0), root, scale=SHIELD_RADII))
    for i, y in enumerate(range(-320, 330, 55)):
        for j, (x, zf) in enumerate(((0, 1), (40, 0.2), (-40, 0.2))):
            z = surface_z(x, y) * zf if zf < 1 else surface_z(0, y)
            marks.append(empty(b, f"HP_Hull_{i}_{j}", (x * (1 - abs(y) / 450), y, z), root))
    faces = sum(len(p.data.polygons) for p in sections + glow)
    vw.log(f"leviathan faces: {faces}")
    scale_carrier([*sections, *glow, *marks], CARRIER_SCALE)
    vw.export_glb(b, [root, *sections, *glow, *marks], "leviathan.glb", quality=85)
    vw.preview(b, sections + glow, "leviathan.png", elev=28, azim=-55, size=1200)
    vw.preview(b, sections + glow, "leviathan_rear.png", elev=18, azim=150, size=1200)
    for p in sections + glow:
        p.hide_render = True


def build_generator(b):
    bm = bmesh.new()
    vw.bm_cylinder(bm, 13, 5, 12, center=(0, 0, -17), axis="Z", mat_index=DARK)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        vw.bm_box(bm, (4, 4, 18), center=(math.cos(a) * 12, math.sin(a) * 12, -8), mat_index=PAINT)
    base_ob = vw.obj_from_bmesh(b, "Gen_Base", bm)
    ring = bmesh.new()
    for tilt in (0, 60, 120):
        v = vw.bm_cylinder(ring, 20, 2.2, 40, center=(0, 0, 0), axis="Z", cap=False)
        inner = vw.bm_cylinder(ring, 18.6, 2.2, 40, center=(0, 0, 0), axis="Z", cap=False)
        vw.bm_transform(ring, v + inner, rot=(tilt, 0, tilt * 0.5))
    ring_ob = vw.obj_from_bmesh(b, "Gen_Ring", ring)
    for ob in (base_ob, ring_ob):
        ob.data.materials.append(vw.panel_material(f"{ob.name}_Proc", paint=(0.2, 0.2, 0.22), metal=0.6, rough=0.4, panel=2.0, seam=0.12, seed=9))
        ob.data.materials.append(vw.panel_material(f"{ob.name}_Proc2", paint=(0.45, 0.1, 0.07), metal=0.4, rough=0.45, panel=2.0, seam=0.12, seed=10))
    core = bmesh.new()
    bmesh.ops.create_icosphere(core, subdivisions=3, radius=12.0)
    core_ob = vw.obj_from_bmesh(b, "Gen_Core", core, smooth=True)
    core_ob.data.materials.append(vw.principled("Gen_CoreGlow", base=(1.0, 0.5, 0.2), emission=(1.0, 0.55, 0.18), strength=6.0))
    # Bake base and ring together into one small texture.
    for ob in (base_ob, ring_ob):
        vw.smart_uv(b, ob, angle=60, margin=0.01)
        img = vw.new_image(f"{ob.name}_Color", 512)
        nimg = vw.new_image(f"{ob.name}_Normal", 512, non_color=True)
        mats = [s.material for s in ob.material_slots]
        vw.bake(b, ob, img, "DIFFUSE", materials=mats, pass_filter={"COLOR"}, samples=4)
        vw.bake(b, ob, nimg, "NORMAL", materials=mats, samples=4)
        ob.data.materials.clear()
        ob.data.materials.append(vw.baked_material(f"{ob.name}_Mat", img, nimg, metal=0.6, rough=0.4))
    root = bpy.data.objects.new("Generator", None)
    b.link(root)
    for p in (base_ob, ring_ob, core_ob):
        p.parent = root
    vw.export_glb(b, [root, base_ob, ring_ob, core_ob], "generator.glb")
    vw.preview(b, [base_ob, ring_ob, core_ob], "generator.png", elev=25, azim=-30, size=700)
    for p in (base_ob, ring_ob, core_ob):
        p.hide_render = True


def build_turret(b):
    bm = bmesh.new()
    vw.bm_cylinder(bm, 6.5, 3, 8, center=(0, 0, 1.5), axis="Z", mat_index=DARK)
    vw.bm_cylinder(bm, 5, 2, 8, center=(0, 0, 4), axis="Z", mat_index=PAINT)
    base = vw.obj_from_bmesh(b, "Turret_Base", bm)
    hb = bmesh.new()
    vw.bm_box(hb, (7, 7, 4.5), center=(0, 0, 0), mat_index=PAINT)
    vw.bm_box(hb, (5, 3, 3), center=(0, -4.5, 0.5), mat_index=DARK)
    for s in (-1, 1):
        vw.bm_cylinder(hb, 0.55, 9, 8, center=(1.5 * s, 7.5, 0.2), axis="Y", mat_index=DARK)
        vw.bm_cylinder(hb, 0.8, 1.5, 8, center=(1.5 * s, 11.5, 0.2), axis="Y", mat_index=ACCENT)
    head = vw.obj_from_bmesh(b, "head", hb)
    head.location = (0, 0, 7)
    for ob in (base, head):
        ob.data.materials.append(vw.panel_material(f"{ob.name}_P", paint=(0.24, 0.24, 0.27), metal=0.55, rough=0.42, panel=1.5, seam=0.08, seed=12))
        ob.data.materials.append(vw.panel_material(f"{ob.name}_D", paint=(0.08, 0.08, 0.09), metal=0.7, rough=0.38, panel=1.0, seam=0.06, seed=13))
        ob.data.materials.append(vw.panel_material(f"{ob.name}_A", paint=(0.5, 0.1, 0.06), metal=0.35, rough=0.45, panel=1.5, seam=0.08, seed=14))
        vw.smart_uv(b, ob, angle=60, margin=0.01)
        img = vw.new_image(f"{ob.name}_Color", 512)
        nimg = vw.new_image(f"{ob.name}_Normal", 512, non_color=True)
        mats = [s.material for s in ob.material_slots]
        vw.bake(b, ob, img, "DIFFUSE", materials=mats, pass_filter={"COLOR"}, samples=4)
        vw.bake(b, ob, nimg, "NORMAL", materials=mats, samples=4)
        ob.data.materials.clear()
        ob.data.materials.append(vw.baked_material(f"{ob.name}_Mat", img, nimg, metal=0.6, rough=0.4))
    root = bpy.data.objects.new("Turret", None)
    b.link(root)
    base.parent = root
    head.parent = root
    muzzles = [empty(b, f"Muzzle_{i}", (1.5 * s, 12.4, 0.2), head) for i, s in enumerate((-1, 1))]
    vw.export_glb(b, [root, base, head, *muzzles], "turret.glb")
    vw.preview(b, [base, head], "turret.png", elev=20, azim=-40, size=600)


def main():
    b = vw.Build("capital", samples=16)
    try:
        build_leviathan(b)
        build_generator(b)
        build_turret(b)
    finally:
        b.close()


if __name__ == "__main__":
    main()
