"""
VOID WING asset toolkit shared by every asset-family script.

Each family script builds its models inside an isolated scene (see Build), bakes procedural
Cycles materials down to image textures, exports GLB files to public/assets and then deletes
everything it created, so it is safe to run inside a Blender session that is also used for
other work (the Blender MCP shares one Blender instance).

Run a family script either through the Blender MCP:
    exec(compile(open(path).read(), path, 'exec'), {'__name__': '__main__', '__file__': path})
or headless:
    blender --background --python blender_scripts/<family>.py
"""
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "public", "assets")
PREVIEWS = os.path.join(ROOT, "test-output", "asset-previews")

_DATA_KINDS = (
    "objects", "meshes", "materials", "images", "node_groups", "cameras", "lights",
    "collections", "curves", "textures", "worlds",
)


def log(*a):
    print("[vw]", *a)
    sys.stdout.flush()


# --------------------------------------------------------------------------------------
# Isolated build scene
# --------------------------------------------------------------------------------------
class Build:
    """A throwaway scene. Everything created while it is open is removed by close()."""

    def __init__(self, name, samples=24):
        self.name = name
        self.t0 = time.time()
        self.win = bpy.context.window if not bpy.app.background else None
        self.prev_scene = None
        self.owns_scene = self.win is not None
        if self.owns_scene:
            # Interactive session: work in a private scene so nothing else is touched.
            self.before = {k: set(getattr(bpy.data, k)) for k in _DATA_KINDS}
            self.scene = bpy.data.scenes.new("VW_" + name)
            self.prev_scene = self.win.scene
            self.win.scene = self.scene
        else:
            # Background process (the normal path): a fresh factory file, so use its scene
            # after clearing the default cube, camera and light.
            self.scene = bpy.context.scene
            for o in list(self.scene.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            self.before = {k: set(getattr(bpy.data, k)) for k in _DATA_KINDS}
        self.view_layer = self.scene.view_layers[0] if self.owns_scene else bpy.context.view_layer
        sc = self.scene
        sc.render.engine = "CYCLES"
        sc.cycles.samples = samples
        sc.cycles.use_denoising = False
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for dev_type in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
                try:
                    prefs.compute_device_type = dev_type
                    prefs.refresh_devices()
                    if any(d.type == dev_type for d in prefs.devices):
                        for d in prefs.devices:
                            d.use = d.type == dev_type
                        sc.cycles.device = "GPU"
                        break
                except Exception:
                    continue
        except Exception:
            sc.cycles.device = "CPU"
        sc.render.bake.margin = 8
        sc.unit_settings.system = "METRIC"

    # context helpers ------------------------------------------------------------------
    def override(self, active=None, selected=None):
        kw = {}
        if self.owns_scene:
            kw.update(scene=self.scene, view_layer=self.view_layer, window=self.win)
        if active is not None:
            kw["active_object"] = active
            kw["object"] = active
        if selected is not None:
            kw["selected_objects"] = selected
            kw["selected_editable_objects"] = selected
        return bpy.context.temp_override(**kw)

    def select(self, objs, active=None):
        for o in self.scene.objects:
            o.select_set(False, view_layer=self.view_layer)
        for o in objs:
            o.select_set(True, view_layer=self.view_layer)
        if active is not None:
            self.view_layer.objects.active = active
        elif objs:
            self.view_layer.objects.active = objs[0]

    def link(self, obj):
        self.scene.collection.objects.link(obj)
        return obj

    def close(self):
        # Delete everything created during the build, then the scene itself.
        for kind in ("objects", "meshes", "materials", "images", "node_groups", "cameras",
                     "lights", "curves", "textures", "worlds", "collections"):
            coll = getattr(bpy.data, kind)
            for db in list(coll):
                if db not in self.before[kind]:
                    try:
                        coll.remove(db)
                    except Exception:
                        pass
        if self.owns_scene:
            if self.win is not None and self.prev_scene is not None:
                try:
                    self.win.scene = self.prev_scene
                except Exception:
                    pass
            try:
                bpy.data.scenes.remove(self.scene)
            except Exception:
                pass
        log(f"{self.name}: done in {time.time() - self.t0:.1f}s")


# --------------------------------------------------------------------------------------
# Mesh helpers
# --------------------------------------------------------------------------------------
def obj_from_bmesh(build, name, bm, materials=None, smooth=False, auto_smooth=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    build.link(ob)
    for m in materials or []:
        me.materials.append(m)
    if auto_smooth is not None:
        add_smooth_by_angle(build, ob, auto_smooth)
    return ob


def add_smooth_by_angle(build, ob, angle_deg=35.0):
    """Blender 4.1+ removed auto smooth; emulate with sharp edges + smooth shading."""
    me = ob.data
    me.shade_smooth()
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < lim
        else:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    return ob


def bm_box(bm, size, center=(0, 0, 0), mat_index=0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res["verts"]
    sx, sy, sz = size
    for v in verts:
        v.co = Vector((v.co.x * sx + center[0], v.co.y * sy + center[1], v.co.z * sz + center[2]))
    faces = {f for v in verts for f in v.link_faces}
    for f in faces:
        f.material_index = mat_index
    return verts


def bm_cylinder(bm, radius, depth, segments=16, center=(0, 0, 0), axis="Y", mat_index=0, radius2=None, cap=True):
    res = bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth,
    )
    verts = res["verts"]
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(center)) @ rot, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index
    return verts


def bm_transform(bm, verts, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(Vector(loc)) @ Matrix.LocRotScale(None, _euler(rot), Vector(scale))
    bmesh.ops.transform(bm, matrix=m, verts=verts)


def _euler(rot):
    from mathutils import Euler
    return Euler([math.radians(r) for r in rot], "XYZ")


def loft(bm, sections, mat_index=0, cap_start=True, cap_end=True):
    """Bridge a list of closed rings (lists of Vector) with quads. Returns all created faces."""
    rings = []
    for ring in sections:
        rings.append([bm.verts.new(Vector(p)) for p in ring])
    faces = []
    n = len(sections[0])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = mat_index
            faces.append(f)
    if cap_start:
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = mat_index
        faces.append(f)
    if cap_end:
        f = bm.faces.new(rings[-1])
        f.material_index = mat_index
        faces.append(f)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


def ring(cx, cy, cz, rx, rz, n=8, phase=0.0, squash_top=1.0, squash_bottom=1.0, axis="Y"):
    """A ring of n points around an axis (default Y, points in the XZ plane)."""
    pts = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        x = math.cos(a) * rx
        z = math.sin(a) * rz
        z *= squash_top if z > 0 else squash_bottom
        pts.append((cx + x, cy, cz + z))
    return pts


def apply_modifiers(build, ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def bevel(build, ob, width=0.05, segments=2, angle=35.0, harden=True):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.harden_normals = harden
    m.miter_outer = "MITER_ARC"
    apply_modifiers(build, ob)
    return ob


def join(build, objs, name):
    """Join objects into the first one (keeps material slots)."""
    target = objs[0]
    with build.override(active=target, selected=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def apply_transform(build, ob):
    with build.override(active=ob, selected=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def smart_uv(build, ob, angle=66.0, margin=0.01, island_scale=True):
    build.select([ob], ob)
    with build.override(active=ob, selected=[ob]):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        if island_scale:
            try:
                bpy.ops.uv.average_islands_scale()
                bpy.ops.uv.pack_islands(margin=margin, rotate=True)
            except Exception as e:
                log("uv pack skipped:", e)
        bpy.ops.object.mode_set(mode="OBJECT")


def box_project_uv(ob, scale=0.05, offset=(0.0, 0.0)):
    """World-scale box projection (for tiling textures on huge hulls)."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    mw = ob.matrix_world
    for poly in me.polygons:
        n = (mw.to_3x3() @ poly.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv[li].uv = (u * scale + offset[0], v * scale + offset[1])


# --------------------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------------------
def principled(name, base=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, emission=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*base, 1.0)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if emission is not None:
        p.inputs["Emission Color"].default_value = (*emission, 1.0)
        p.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        p.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
    return m


def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(nt, a, b):
    nt.links.new(a, b)


def sock(n, identifier, output=False):
    """Socket by identifier (ShaderNodeMix has float/vector/colour sockets sharing names)."""
    for s in (n.outputs if output else n.inputs):
        if s.identifier == identifier:
            return s
    raise KeyError(identifier)


class Mix:
    """Colour mix node with its sockets resolved: .fac .a .b .out"""

    def __init__(self, nt, blend="MIX", loc=(0, 0), fac=None, b=None):
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        n.blend_type = blend
        n.location = loc
        self.node = n
        self.fac = sock(n, "Factor_Float")
        self.a = sock(n, "A_Color")
        self.b = sock(n, "B_Color")
        self.out = sock(n, "Result_Color", output=True)
        if fac is not None:
            self.fac.default_value = fac
        if b is not None:
            self.b.default_value = (*b, 1.0) if len(b) == 3 else b


def _math(nt, op, a=None, b=None, loc=(0, 0), clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.location = loc
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _grid_seams(nt, coord, normal_abs, size, width, offset, x0=-1600, y0=0):
    """Seam mask (1 on panel lines) from a 3D grid, ignoring grid planes parallel to the surface."""
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (x0, y0)
    mapping.inputs["Scale"].default_value = (1 / size, 1 / size, 1 / size)
    mapping.inputs["Location"].default_value = offset
    nt.links.new(coord, mapping.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (x0 + 200, y0)
    nt.links.new(mapping.outputs["Vector"], sep.inputs["Vector"])
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nsep.location = (x0 + 200, y0 - 250)
    nt.links.new(normal_abs, nsep.inputs["Vector"])
    edge = width / size
    total = None
    for i, axis in enumerate(("X", "Y", "Z")):
        fr = _math(nt, "FRACT", sep.outputs[axis], loc=(x0 + 400, y0 - i * 60))
        d = _math(nt, "SUBTRACT", fr, 0.5, loc=(x0 + 550, y0 - i * 60))
        d = _math(nt, "ABSOLUTE", d, loc=(x0 + 700, y0 - i * 60))
        # 1 near a grid plane
        s = _math(nt, "SUBTRACT", d, 0.5 - edge, loc=(x0 + 850, y0 - i * 60))
        s = _math(nt, "DIVIDE", s, edge, loc=(x0 + 1000, y0 - i * 60), clamp=True)
        # Only planes crossing the surface count: weight by (1 - |n_axis|)^4
        w = _math(nt, "SUBTRACT", 1.0, nsep.outputs[axis], loc=(x0 + 850, y0 - 300 - i * 60))
        w = _math(nt, "POWER", w, 4.0, loc=(x0 + 1000, y0 - 300 - i * 60))
        s = _math(nt, "MULTIPLY", s, w, loc=(x0 + 1150, y0 - i * 60))
        total = s if total is None else _math(nt, "MAXIMUM", total, s, loc=(x0 + 1300, y0 - i * 60))
    return total, mapping


def panel_material(name, paint=(0.78, 0.8, 0.82), metal=0.35, rough=0.45, panel=0.9, seam=0.022,
                   grime=0.3, tint_var=0.06, seed=0, wear=0.25, stripe=None):
    """
    Procedural hull paint for baking: panel seams on two grid scales, per-panel tint,
    grime, worn edges (pointiness) and optional stripe bands. Object-space, so it bakes
    consistently across joined parts.

    stripe: (axis, min, max, colour) band in object space, e.g. ("X", 3.4, 3.9, (0.1, 0.6, 0.8)).
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    tc = node(nt, "ShaderNodeTexCoord", (-2200, 0))
    geo = node(nt, "ShaderNodeNewGeometry", (-2200, -400))
    nabs = node(nt, "ShaderNodeVectorMath", (-2000, -400), operation="ABSOLUTE")
    link(nt, geo.outputs["Normal"], nabs.inputs[0])
    off = (0.37 + seed * 0.13, 0.11 + seed * 0.29, 0.53 + seed * 0.07)
    big, map_big = _grid_seams(nt, tc.outputs["Object"], nabs.outputs[0], panel, seam, off, -1900, 400)
    small, _ = _grid_seams(nt, tc.outputs["Object"], nabs.outputs[0], panel * 0.42, seam * 0.7, (off[1], off[2], off[0]), -1900, -700)
    # Small panels only in some regions.
    region = node(nt, "ShaderNodeTexNoise", (-900, -900))
    region.inputs["Scale"].default_value = 0.35 / panel
    link(nt, tc.outputs["Object"], region.inputs["Vector"])
    rmask = _math(nt, "GREATER_THAN", region.outputs["Fac"], 0.55, loc=(-700, -900))
    small = _math(nt, "MULTIPLY", small, rmask, loc=(-550, -800))
    seams = _math(nt, "MAXIMUM", big, small, loc=(-400, 200))
    # Per-panel tint from the big grid cell id.
    cell = node(nt, "ShaderNodeVectorMath", (-900, 700), operation="FLOOR")
    link(nt, map_big.outputs["Vector"], cell.inputs[0])
    wn = node(nt, "ShaderNodeTexWhiteNoise", (-700, 700), noise_dimensions="3D")
    link(nt, cell.outputs[0], wn.inputs["Vector"])
    tint = _math(nt, "MULTIPLY_ADD", wn.outputs["Value"], tint_var * 2, loc=(-500, 700))
    tint.node.inputs[2].default_value = 1.0 - tint_var
    base = node(nt, "ShaderNodeRGB", (-700, 450))
    base.outputs[0].default_value = (*paint, 1.0)
    tint_rgb = node(nt, "ShaderNodeCombineColor", (-450, 650))
    for ch in ("Red", "Green", "Blue"):
        nt.links.new(tint, tint_rgb.inputs[ch])
    col = Mix(nt, "MULTIPLY", (-300, 500), fac=1.0)
    link(nt, base.outputs[0], col.a)
    link(nt, tint_rgb.outputs["Color"], col.b)
    last = col.out
    if stripe is not None:
        axis, lo, hi, scol = stripe
        sx = node(nt, "ShaderNodeSeparateXYZ", (-700, 1000))
        link(nt, tc.outputs["Object"], sx.inputs["Vector"])
        ax = _math(nt, "ABSOLUTE", sx.outputs[axis], loc=(-550, 1000))
        in1 = _math(nt, "GREATER_THAN", ax, lo, loc=(-400, 1050))
        in2 = _math(nt, "LESS_THAN", ax, hi, loc=(-400, 950))
        band = _math(nt, "MULTIPLY", in1, in2, loc=(-250, 1000))
        smix = Mix(nt, "MIX", (-100, 700), b=scol)
        nt.links.new(band, smix.fac)
        link(nt, last, smix.a)
        last = smix.out
    # Grime patches and darker seams.
    gn = node(nt, "ShaderNodeTexNoise", (-700, 200))
    gn.inputs["Scale"].default_value = 1.6
    gn.inputs["Detail"].default_value = 8.0
    link(nt, tc.outputs["Object"], gn.inputs["Vector"])
    g_amt = _math(nt, "MULTIPLY", gn.outputs["Fac"], grime, loc=(-500, 200))
    dirt = _math(nt, "MAXIMUM", g_amt, _math(nt, "MULTIPLY", seams, 0.6, loc=(-300, 100)), loc=(-150, 150))
    dmix = Mix(nt, "MULTIPLY", (100, 500), b=(0.25, 0.24, 0.23))
    nt.links.new(dirt, dmix.fac)
    link(nt, last, dmix.a)
    last = dmix.out
    # Worn edges: bare metal shows on convex edges.
    wr = node(nt, "ShaderNodeMapRange", (-150, -200))
    wr.inputs["From Min"].default_value = 0.52
    wr.inputs["From Max"].default_value = 0.6
    wr.inputs["To Min"].default_value = 0.0
    wr.inputs["To Max"].default_value = wear
    link(nt, geo.outputs["Pointiness"], wr.inputs["Value"])
    wmix = Mix(nt, "MIX", (300, 400), b=(0.62, 0.62, 0.64))
    link(nt, wr.outputs["Result"], wmix.fac)
    link(nt, last, wmix.a)
    link(nt, wmix.out, p.inputs["Base Color"])
    # Seams are recessed for the normal bake.
    bump = node(nt, "ShaderNodeBump", (300, -300))
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.015
    bump.invert = True
    nt.links.new(seams, bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], p.inputs["Normal"])
    return m


# --------------------------------------------------------------------------------------
# Baking
# --------------------------------------------------------------------------------------
def new_image(name, size, non_color=False, alpha=False):
    img = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def _set_bake_target(materials, img):
    for m in materials:
        nt = m.node_tree
        n = nt.nodes.get("__bake_target")
        if n is None:
            n = nt.nodes.new("ShaderNodeTexImage")
            n.name = "__bake_target"
            n.location = (-800, -600)
        n.image = img
        for other in nt.nodes:
            other.select = False
        n.select = True
        nt.nodes.active = n


def bake(build, target, img, kind, sources=None, materials=None, pass_filter=None, cage=0.08, samples=None):
    """Bake a pass of `target` (or selected-to-active from `sources`) into img."""
    mats = materials if materials is not None else [s.material for s in target.material_slots if s.material]
    _set_bake_target(mats, img)
    sc = build.scene
    if samples:
        sc.cycles.samples = samples
    objs = [target] + (sources or [])
    build.select(objs, target)
    kw = dict(type=kind, margin=8, use_clear=True, target="IMAGE_TEXTURES")
    if sources:
        kw.update(use_selected_to_active=True, cage_extrusion=cage, max_ray_distance=cage * 4)
    if pass_filter:
        kw["pass_filter"] = pass_filter
    if kind == "NORMAL":
        kw["normal_space"] = "TANGENT"
    t = time.time()
    with build.override(active=target, selected=objs):
        bpy.ops.object.bake(**kw)
    log(f"bake {kind} {img.size[0]}px {time.time() - t:.1f}s")


def image_pixels(img):
    arr = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape((img.size[1], img.size[0], 4))


def set_pixels(img, arr):
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.update()


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def baked_material(name, base_img, normal_img=None, orm_img=None, metal=0.0, rough=0.5,
                   emission_img=None, emission_color=(1, 1, 1), emission_strength=0.0):
    """glTF-friendly material from baked images (ORM: G = roughness, B = metallic)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get("Principled BSDF")
    tex = node(nt, "ShaderNodeTexImage", (-500, 300))
    tex.image = base_img
    link(nt, tex.outputs["Color"], p.inputs["Base Color"])
    if normal_img is not None:
        nt_tex = node(nt, "ShaderNodeTexImage", (-700, -250))
        nt_tex.image = normal_img
        nm = node(nt, "ShaderNodeNormalMap", (-300, -250))
        link(nt, nt_tex.outputs["Color"], nm.inputs["Color"])
        link(nt, nm.outputs["Normal"], p.inputs["Normal"])
    if orm_img is not None:
        o = node(nt, "ShaderNodeTexImage", (-700, 0))
        o.image = orm_img
        sep = node(nt, "ShaderNodeSeparateColor", (-400, 0))
        link(nt, o.outputs["Color"], sep.inputs["Color"])
        link(nt, sep.outputs["Green"], p.inputs["Roughness"])
        link(nt, sep.outputs["Blue"], p.inputs["Metallic"])
    else:
        p.inputs["Metallic"].default_value = metal
        p.inputs["Roughness"].default_value = rough
    if emission_img is not None:
        e = node(nt, "ShaderNodeTexImage", (-500, -500))
        e.image = emission_img
        link(nt, e.outputs["Color"], p.inputs["Emission Color"])
        p.inputs["Emission Strength"].default_value = emission_strength
    elif emission_strength > 0:
        p.inputs["Emission Color"].default_value = (*emission_color, 1.0)
        p.inputs["Emission Strength"].default_value = emission_strength
    return m


# --------------------------------------------------------------------------------------
# Export and preview
# --------------------------------------------------------------------------------------
def export_glb(build, objs, filename, image_format="WEBP", quality=90):
    os.makedirs(ASSETS, exist_ok=True)
    path = os.path.join(ASSETS, filename)
    build.select(objs, objs[0])
    with build.override(active=objs[0], selected=objs):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_extras=True,
            export_tangents=False,
            export_image_format=image_format,
            export_image_quality=quality,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_materials="EXPORT",
        )
    log(f"exported {filename} ({os.path.getsize(path) / 1024:.0f} KB)")
    return path


def preview(build, objs, filename, distance=None, elev=18.0, azim=-38.0, size=640, focus=None):
    """Render an Eevee preview of the objects for visual checks."""
    os.makedirs(PREVIEWS, exist_ok=True)
    sc = build.scene
    prev_engine = sc.render.engine
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = size
    sc.render.resolution_y = int(size * 0.66)
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("VW_preview_world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.02, 0.025, 0.04, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world
    # Bounds
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mins = Vector(map(min, mins, w))
            maxs = Vector(map(max, maxs, w))
    center = (mins + maxs) / 2 if focus is None else Vector(focus)
    radius = (maxs - mins).length / 2
    dist = distance or radius * 2.6
    cam_data = bpy.data.cameras.new("VW_prev_cam")
    cam_data.lens = 50
    cam_data.clip_end = dist * 10
    cam = bpy.data.objects.new("VW_prev_cam", cam_data)
    build.link(cam)
    e, a = math.radians(elev), math.radians(azim)
    cam.location = center + Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e))) * dist
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    key = bpy.data.lights.new("VW_key", "SUN")
    key.energy = 3.5
    key_o = bpy.data.objects.new("VW_key", key)
    key_o.rotation_euler = (math.radians(55), math.radians(10), math.radians(-40))
    build.link(key_o)
    rim = bpy.data.lights.new("VW_rim", "SUN")
    rim.energy = 1.5
    rim.color = (0.5, 0.7, 1.0)
    rim_o = bpy.data.objects.new("VW_rim", rim)
    rim_o.rotation_euler = (math.radians(-60), math.radians(0), math.radians(150))
    build.link(rim_o)
    path = os.path.join(PREVIEWS, filename)
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    with build.override():
        bpy.ops.render.render(write_still=True, scene=sc.name)
    sc.render.engine = prev_engine
    log(f"preview {filename}")
    return path


# --------------------------------------------------------------------------------------
# Procedural helpers
# --------------------------------------------------------------------------------------
def fbm(p, octaves=4, lac=2.0, gain=0.5):
    amp, freq, s = 1.0, 1.0, 0.0
    for _ in range(octaves):
        s += amp * noise.noise(p * freq)
        amp *= gain
        freq *= lac
    return s


def seed_all(seed):
    import random
    random.seed(seed)
    np.random.seed(seed)
    noise.seed_set(seed)
