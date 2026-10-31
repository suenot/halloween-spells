"""Anatomical 3D hands for spell demos. Run headless:

  Blender -b -P tools/blender/hands.py -- --clip peace --out build/gestures [--frame 30] [--size 480]

Units: 1 BU = 1 cm. The hand is built in a right-hand local frame (wrist at origin, +Y toward the fingers,
-Z is the palm side, thumb on -X). The left hand is the same geometry mirrored with S = diag(-1,1,1).
Finger skeletons go through a Skin modifier (organic tubes); palm, thenar, nails and the robe cuff are
separate meshes. Poses are plain joint angles, so every clip is data, not hand-posed keyframes.
"""
import bpy, bmesh, math, sys, os, json
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector, Quaternion

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default

S = Matrix(((-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))
def rx(a): return Matrix.Rotation(math.radians(a), 4, "X")
def ry(a): return Matrix.Rotation(math.radians(a), 4, "Y")
def rz(a): return Matrix.Rotation(math.radians(a), 4, "Z")
def tr(v): return Matrix.Translation(Vector(v))
def lerp(a, b, t): return a + (b - a) * t
def ease(t): return t * t * (3 - 2 * t)

# --------------------------------------------------------------- anatomy (cm, right hand)
FINGERS = [  # base in palm frame, phalanx lengths, radius
    ((-3.0, 9.0, 0.0), (4.3, 2.5, 2.1), 0.95),   # index
    ((-1.0, 9.4, 0.0), (4.7, 2.9, 2.2), 0.98),   # middle
    ((1.0, 9.0, 0.0), (4.3, 2.7, 2.1), 0.92),    # ring
    ((3.0, 8.0, 0.0), (3.5, 2.0, 1.9), 0.82),    # pinky
]
THUMB = ((-3.0, 2.6, -0.6), (5.0, 3.8, 3.0), 1.1)

# pose = 16 finger values (mcp, abd, pip, dip per finger) + 5 thumb (yaw, roll, cmc, mcp, ip)
def pose(fingers, thumb): return [v for f in fingers for v in f] + list(thumb)
CURL = (88, 0, 102, 62)
POSES = {
    "rest": pose([(14, 4, 24, 14), (16, 1, 28, 16), (20, -3, 32, 18), (24, -7, 36, 20)], (34, 0, 12, 12, 10)),
    "open": pose([(0, 7, 0, 0), (0, 1, 0, 0), (0, -5, 0, 0), (0, -11, 0, 0)], (44, 0, 6, 0, 0)),
    "flat": pose([(0, 1, 0, 0), (0, 0, 0, 0), (0, -1, 0, 0), (0, -2, 0, 0)], (22, 0, 4, 0, 0)),
    "fist": pose([CURL, (88, 0, 102, 62), (90, 0, 104, 62), (92, 0, 104, 60)], (-38, 0, 50, 36, 40)),
    "peace": pose([(0, 6, 0, 0), (0, -5, 0, 0), (90, 0, 104, 62), (92, 0, 104, 60)], (-38, 0, 50, 36, 40)),
    "grip": pose([(62, 0, 82, 48), (66, 0, 86, 50), (70, 0, 90, 52), (74, 0, 92, 52)], (-20, 0, 22, 30, 24)),
}

def mat_from_axes(x, y, z):
    m = Matrix(((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2])))
    return m.to_quaternion()

# hand orientations (images of local X, Y, Z in world; Y = toward fingers, Z = back of hand)
Q = {
    "palm_up": mat_from_axes((-1, 0, 0), (0, 0, 1), (0, 1, 0)),      # palm to camera, fingers up
    "back_up": mat_from_axes((1, 0, 0), (0, 0, 1), (0, -1, 0)),      # back of hand to camera, fingers up
    "pray_r": mat_from_axes((0, 1, 0), (0, 0, 1), (1, 0, 0)),        # right hand, palm facing -X
    "pray_l": mat_from_axes((0, -1, 0), (0, 0, 1), (-1, 0, 0)),      # left hand, palm facing +X
    "punch_r": mat_from_axes((0, 1, 0), (-1, 0, 0), (0, 0, 1)),     # right fist driving toward -X
    "palm_left": mat_from_axes((0, 1, 0), (0, 0, 1), (1, 0, 0)),
}

# --------------------------------------------------------------- scene
def new_scene(size):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    try: sc.eevee.taa_render_samples = 24
    except Exception: pass
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.35, 0.3, 0.5, 1); bg.inputs[1].default_value = 0.55
    return sc

def mat(name, color, rough=0.5, sss=0.0, metal=0.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        for k in ("Subsurface Weight", "Subsurface"):
            if k in b.inputs: b.inputs[k].default_value = sss; break
        if "Subsurface Radius" in b.inputs: b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
    if emit:
        for k in ("Emission Color", "Emission"):
            if k in b.inputs: b.inputs[k].default_value = (*emit, 1); break
        if "Emission Strength" in b.inputs: b.inputs["Emission Strength"].default_value = 3.0
    return m

def lights_and_camera(sc, target=(0, 0, 10), width=44.0, yaw=0.0):
    def sun(name, rot, energy, color):
        d = bpy.data.lights.new(name, "SUN"); d.energy = energy; d.color = color
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        o.rotation_euler = [math.radians(a) for a in rot]
    sun("key", (55, 0, -30), 3.2, (1.0, 0.88, 0.75))
    sun("rim", (115, 0, 140), 3.0, (0.65, 0.45, 1.0))
    sun("fill", (70, 0, 60), 0.9, (1.0, 0.7, 0.5))
    cam = bpy.data.cameras.new("cam"); cam.lens = 85; cam.sensor_width = 36; cam.clip_start = 5; cam.clip_end = 600
    dist = width / (2 * math.tan(math.atan(18 / 85)))
    o = bpy.data.objects.new("cam", cam); sc.collection.objects.link(o)
    a = math.radians(yaw)
    o.location = (target[0] + math.sin(a) * dist, target[1] - math.cos(a) * dist, target[2]); o.rotation_euler = (math.radians(90), 0, a)
    sc.camera = o
    return o

def sphere(name, mat_, subs=2):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1)
    o = bpy.context.object; o.name = name; o.data.materials.append(mat_)
    bpy.ops.object.shade_smooth()
    return o

class Hand:
    def __init__(self, sc, left, M):
        self.left = left; self.M = M
        self.skin_m = M["skin"]
        self.parts = []
        # palm block
        bpy.ops.mesh.primitive_cube_add(size=2)
        palm = bpy.context.object; palm.name = "palm"; palm.data.materials.append(M["skin"])
        for v in palm.data.vertices:
            if v.co.y < 0: v.co.x *= 0.74; v.co.z *= 0.85
        bev = palm.modifiers.new("b", "BEVEL"); bev.width = 0.55; bev.segments = 4
        sub = palm.modifiers.new("s", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
        bpy.ops.object.shade_smooth()
        self.palm = palm
        self.thenar = sphere("thenar", M["skin"]); self.hypo = sphere("hypo", M["skin"])
        # robe cuff
        bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=3.35, radius2=5.6, depth=15)
        cuff = bpy.context.object; cuff.name = "cuff"; cuff.data.materials.append(M["robe"]); bpy.ops.object.shade_smooth()
        self.cuff = cuff
        bpy.ops.mesh.primitive_torus_add(major_radius=3.4, minor_radius=0.34, major_segments=40, minor_segments=12)
        trim = bpy.context.object; trim.name = "trim"; trim.data.materials.append(M["gold"]); bpy.ops.object.shade_smooth()
        self.trim = trim
        # nails
        self.nails = [sphere(f"nail{i}", M["nail"]) for i in range(5)]
        # skin skeleton
        me = bpy.data.meshes.new("skin"); ob = bpy.data.objects.new("skin", me); sc.collection.objects.link(ob)
        verts = [(0, 0, 0)] * 35
        edges = []
        for c in range(5):
            for k in range(6): edges.append((c * 7 + k, c * 7 + k + 1))
        me.from_pydata(verts, edges, [])
        me.materials.append(M["skin"])
        ob.modifiers.new("skin", "SKIN")
        sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
        for c in range(5):
            r = (FINGERS[c][2] if c < 4 else THUMB[2]) * 1.28
            radii = [r * 0.98, r * 0.88, r * 0.98, r * 0.84, r * 0.9, r * 0.78, r * 0.66]
            for k in range(7):
                d = me.skin_vertices[0].data[c * 7 + k]
                d.radius = (radii[k], radii[k] * 0.92)
                d.use_root = (k == 0)
        for p in me.polygons: p.use_smooth = True
        self.skin = ob
        for o in [palm, self.thenar, self.hypo, cuff, trim, *self.nails, ob]:
            for c in list(o.users_collection): c.objects.unlink(o)
            sc.collection.objects.link(o)

    def conj(self, L):
        return (S @ L @ S) if self.left else L

    def apply(self, p, W):
        """p: pose vector (21), W: world matrix of the wrist (4x4)."""
        sw = (W @ S) if self.left else W
        pts = []
        nail_mats = []
        for c in range(5):
            if c < 4:
                base, lens, r = FINGERS[c]
                mcp, abd, pip, dip = p[c * 4: c * 4 + 4]
                Mx = tr(base) @ rz(abd) @ rx(-mcp)
            else:
                base, lens, r = THUMB
                yaw, roll, cmc, mcp, ip = p[16:21]
                Mx = tr(base) @ rz(yaw) @ ry(roll) @ rx(-cmc)
                pip, dip = mcp, ip
            L1, L2, L3 = lens
            P = [Vector(base), Mx @ Vector((0, L1 * 0.5, 0)), Mx @ Vector((0, L1, 0))]
            Mx = Mx @ tr((0, L1, 0)) @ rx(-pip)
            P += [Mx @ Vector((0, L2 * 0.5, 0)), Mx @ Vector((0, L2, 0))]
            Mx2 = Mx @ tr((0, L2, 0)) @ rx(-dip)
            P += [Mx2 @ Vector((0, L3 * 0.55, 0)), Mx2 @ Vector((0, L3 + 0.2, 0))]
            for v in P: pts.append(sw @ v)
            nail_mats.append(Mx2 @ tr((0, L3 * 0.55, r * 1.2)) @ Matrix.Diagonal((r * 0.52, L3 * 0.42, r * 0.17, 1)))
        me = self.skin.data
        for i, v in enumerate(pts): me.vertices[i].co = v
        me.update()
        self.skin.matrix_world = Matrix.Identity(4)
        for o, m in zip(self.nails, nail_mats): o.matrix_world = sw @ m
        def place(o, L): o.matrix_world = W @ self.conj(L)
        place(self.palm, tr((0, 4.7, 0)) @ Matrix.Diagonal((4.7, 5.3, 1.75, 1)))
        place(self.thenar, tr((-2.5, 3.4, -0.9)) @ rz(-16) @ Matrix.Diagonal((1.9, 3.2, 1.2, 1)))
        place(self.hypo, tr((2.7, 4.4, -0.5)) @ rz(8) @ Matrix.Diagonal((1.6, 3.4, 1.05, 1)))
        place(self.cuff, tr((0, -6.8, 0)) @ rx(90) @ Matrix.Diagonal((1.0, 0.8, 1.0, 1)))
        place(self.trim, tr((0, 0.5, 0)) @ rx(90) @ Matrix.Diagonal((1.0, 0.8, 1.0, 1)))

# --------------------------------------------------------------- clips
# state: list per hand of (pose_name|vector, position, orientation quaternion name|Quaternion)
def P(p, pos, q): return (POSES[p] if isinstance(p, str) else p, Vector(pos), Q[q] if isinstance(q, str) else q)

def tilt(q, ax, deg):
    return Quaternion(Vector(ax), math.radians(deg)) @ (Q[q] if isinstance(q, str) else q)

CLIPS = {
    "dbg": {"cam": (6, 40), "hands": ["R", "L"], "key": [
        (0, [P("fist", (8, 0, 0), "palm_up"), P("fist", (-8, 0, 0), tilt("back_up", (1, 0, 0), 40))]),
        (1, [P("fist", (8, 0, 0), "palm_up"), P("fist", (-8, 0, 0), tilt("back_up", (1, 0, 0), 40))])]},
    "peace": {"cam": (7, 32), "hands": ["R"], "key": [
        (0, [P("rest", (8, 0, -6), tilt("palm_up", (0, 1, 0), 20))]),
        (14, [P("peace", (0, 0, 2), tilt("palm_up", (0, 1, 0), -12))]),
        (30, [P("peace", (0, 0, 2.5), tilt("palm_up", (0, 1, 0), 12))]),
        (48, [P("peace", (0, 0, 2), tilt("palm_up", (0, 1, 0), -12))]),
        (62, [P("rest", (8, 0, -6), tilt("palm_up", (0, 1, 0), 20))])]},
    "open_hands": {"cam": (7, 50), "hands": ["R", "L"], "key": [
        (0, [P("rest", (7, 0, -8), "palm_up"), P("rest", (-7, 0, -8), "palm_up")]),
        (16, [P("open", (11, 0, 0), tilt("palm_up", (0, 1, 0), -8)), P("open", (-11, 0, 0), tilt("palm_up", (0, 1, 0), 8))]),
        (50, [P("open", (11, 0, 1.5), tilt("palm_up", (0, 1, 0), -8)), P("open", (-11, 0, 1.5), tilt("palm_up", (0, 1, 0), 8))]),
        (62, [P("rest", (7, 0, -8), "palm_up"), P("rest", (-7, 0, -8), "palm_up")])]},
    "prayer": {"cam": (7, 36, 38), "hands": ["R", "L"], "key": [
        (0, [P("rest", (14, 0, -8), tilt("pray_r", (0, 0, 1), 20)), P("rest", (-14, 0, -8), tilt("pray_l", (0, 0, 1), -20))]),
        (18, [P("flat", (1.0, 0, -2), "pray_r"), P("flat", (-1.0, 0, -2), "pray_l")]),
        (50, [P("flat", (1.0, 0, -1.4), "pray_r"), P("flat", (-1.0, 0, -1.4), "pray_l")]),
        (62, [P("rest", (14, 0, -8), tilt("pray_r", (0, 0, 1), 20)), P("rest", (-14, 0, -8), tilt("pray_l", (0, 0, 1), -20))])]},
    "fist_palm": {"cam": (6, 40), "hands": ["R", "L"], "key": [
        (0, [P("rest", (14, 4, -6), tilt("punch_r", (0, 0, 1), 35)), P("rest", (-5, 0, -9), tilt("palm_up", (0, 0, 1), -12))]),
        (14, [P("fist", (13, 6, 3.5), tilt("punch_r", (0, 0, 1), 35)), P("flat", (-4, 0, -3), tilt("palm_up", (0, 0, 1), -12))]),
        (24, [P("fist", (4.2, 2.4, 3.5), tilt("punch_r", (0, 0, 1), 35)), P("flat", (-4, 0, -3), tilt("palm_up", (0, 0, 1), -12))]),
        (30, [P("fist", (13, 6, 3.5), tilt("punch_r", (0, 0, 1), 35)), P("flat", (-4, 0, -3), tilt("palm_up", (0, 0, 1), -12))]),
        (38, [P("fist", (4.2, 2.4, 3.5), tilt("punch_r", (0, 0, 1), 35)), P("flat", (-4, 0, -3), tilt("palm_up", (0, 0, 1), -12))]),
        (56, [P("fist", (4.2, 2.4, 3.5), tilt("punch_r", (0, 0, 1), 35)), P("flat", (-4, 0, -3), tilt("palm_up", (0, 0, 1), -12))]),
        (68, [P("rest", (14, 4, -6), tilt("punch_r", (0, 0, 1), 35)), P("rest", (-5, 0, -9), tilt("palm_up", (0, 0, 1), -12))])]},
    "double_fist": {"cam": (6, 34), "hands": ["R", "L"], "key": [
        (0, [P("rest", (10, 0, -8), "palm_up"), P("rest", (-10, 0, -8), "palm_up")]),
        (16, [P("fist", (4.6, 0, 0), tilt("palm_up", (1, 0, 0), 12)), P("fist", (-4.6, 0, 0), tilt("palm_up", (1, 0, 0), 12))]),
        (50, [P("fist", (4.6, 0, 1), tilt("palm_up", (1, 0, 0), 8)), P("fist", (-4.6, 0, 1), tilt("palm_up", (1, 0, 0), 8))]),
        (62, [P("rest", (10, 0, -8), "palm_up"), P("rest", (-10, 0, -8), "palm_up")])]},
    "fist_up": {"cam": (8, 40), "hands": ["R"], "key": [
        (0, [P("rest", (0, 0, -9), "palm_up")]),
        (16, [P("fist", (0, 0, 10), "palm_up")]),
        (50, [P("fist", (0, 0, 11), tilt("palm_up", (0, 1, 0), 10))]),
        (62, [P("rest", (0, 0, -9), "palm_up")])]},
}


# --------------------------------------------------------------- wand clips
WAND_D = Vector((-0.5, 0.87, 0)).normalized()       # wand axis in the hand frame (right-hand local)
WAND_C = Vector((0, 6.0, -2.6))                      # where the fist grips it
WAND_LEN = 17.0
WAND_TIP_LOCAL = WAND_C + WAND_D * WAND_LEN
WAND_Q = Q["palm_up"]

def circle(t):
    a = math.radians(90) - t * math.radians(360)
    return (7.5 * math.cos(a), 11 + 7.5 * math.sin(a))
def line(a, b):
    return lambda t: (lerp(a[0], b[0], t), lerp(a[1], b[1], t))
def poly(pts):
    def f(t):
        n = len(pts) - 1
        k = min(n - 1, int(t * n)); u = t * n - k
        return (lerp(pts[k][0], pts[k + 1][0], u), lerp(pts[k][1], pts[k + 1][1], u))
    return f
WAND_PATHS = {
    "w_circle": (circle, ease),
    "w_swipe_right": (line((-9, 11), (9, 11)), ease),
    "w_swipe_left": (line((9, 11), (-9, 11)), ease),
    "w_up": (line((0, 3), (0, 19)), ease),
    "w_down": (line((0, 19), (0, 3)), lambda t: t * t),
    "w_zigzag": (poly([(-8, 18), (8, 13), (-8, 8), (8, 3)]), lambda t: t),
}
T_RAISE, T_START, T_END, T_HOLD, T_TOTAL = 10, 16, 40, 52, 64

def wand_tip_at(clip, f):
    path, easing = WAND_PATHS[clip]
    p0, p1 = path(0.0), path(1.0)
    rest = (p0[0] + 12, p0[1] - 14)
    if f <= T_RAISE: a = rest
    elif f < T_START: u = ease((f - T_RAISE) / (T_START - T_RAISE)); a = (lerp(rest[0], p0[0], u), lerp(rest[1], p0[1], u))
    elif f <= T_END: a = path(min(1.0, easing((f - T_START) / (T_END - T_START))))
    elif f <= T_HOLD: a = p1
    else: u = ease((f - T_HOLD) / (T_TOTAL - T_HOLD)); a = (lerp(p1[0], rest[0], u), lerp(p1[1], rest[1], u))
    return a

class Wand:
    def __init__(self, sc, M):
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.62, radius2=0.2, depth=1.0)
        o = bpy.context.object; o.name = "wand"; o.data.materials.append(M["wood"]); bpy.ops.object.shade_smooth()
        self.o = o
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, segments=16, ring_count=10)
        g = bpy.context.object; g.name = "wand_glow"; g.data.materials.append(M["glow"]); self.glow = g
        for ob in (o, g):
            for c in list(ob.users_collection): c.objects.unlink(ob)
            sc.collection.objects.link(ob)
    def apply(self, W):
        length = WAND_LEN + 4
        center = WAND_C + WAND_D * (length / 2 - 4)
        R = WAND_D.to_track_quat("Z", "Y").to_matrix().to_4x4()
        self.o.matrix_world = W @ tr(center) @ R @ Matrix.Diagonal((1, 1, length, 1))
        self.glow.matrix_world = W @ tr(WAND_TIP_LOCAL + WAND_D * 0.3)

def sample(clip, f):
    keys = clip["key"]
    f = max(keys[0][0], min(keys[-1][0], f))
    for (f0, s0), (f1, s1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            t = ease((f - f0) / max(1, f1 - f0))
            out = []
            for a, b in zip(s0, s1):
                out.append(([lerp(x, y, t) for x, y in zip(a[0], b[0])], a[1].lerp(b[1], t), a[2].slerp(b[2], t)))
            return out
    return keys[-1][1]

def main():
    cid = arg("--clip", "peace"); out = arg("--out", "build/gestures"); size = int(arg("--size", 480))
    only = arg("--frame")
    sc = new_scene(size)
    M = {"skin": mat("skin", (0.88, 0.62, 0.5), 0.55, sss=0.25), "nail": mat("nail", (0.95, 0.75, 0.72), 0.25),
         "robe": mat("robe", (0.2, 0.08, 0.38), 0.7), "gold": mat("gold", (1.0, 0.72, 0.2), 0.3, metal=1.0),
         "wood": mat("wood", (0.16, 0.08, 0.05), 0.45), "glow": mat("glow", (1, 0.9, 0.5), 0.2, emit=(1, 0.85, 0.35))}
    is_wand = cid in WAND_PATHS
    clip = {"cam": (2, 50), "hands": ["R"], "key": [(0, []), (T_TOTAL, [])]} if is_wand else CLIPS[cid]
    cam = clip.get("cam", (5, 34, 0))
    camo = lights_and_camera(sc, target=(0, 0, cam[0]), width=cam[1], yaw=cam[2] if len(cam) > 2 else 0)
    hands = [Hand(sc, h == "L", M) for h in clip["hands"]]
    wand = Wand(sc, M) if is_wand else None
    os.makedirs(os.path.join(out, cid), exist_ok=True)
    last = clip["key"][-1][0]
    frames = [int(only)] if only is not None else range(0, last)
    tips = []
    tip_off = (WAND_Q.to_matrix() @ Vector((-WAND_TIP_LOCAL.x, WAND_TIP_LOCAL.z * 0 + WAND_TIP_LOCAL.y, 0)))
    for f in frames:
        if is_wand:
            tx, tz = wand_tip_at(cid, f)
            R = WAND_Q.to_matrix().to_4x4()
            tip_world_off = (R @ WAND_TIP_LOCAL.to_4d()).to_3d() if False else (R @ WAND_TIP_LOCAL)
            wrist = Vector((tx, 0, tz)) - tip_world_off
            wob = math.radians((tx) * 0.8)
            W = Matrix.Translation(wrist) @ R
            hands[0].apply(POSES["grip"], W)
            wand.apply(W)
            tipw = W @ (WAND_TIP_LOCAL + WAND_D * 0.3)
            ndc = world_to_camera_view(sc, camo, tipw)
            tips.append([round(ndc.x, 4), round(1 - ndc.y, 4)])
        else:
            st = sample(clip, f)
            for hnd, (pv, pos, q) in zip(hands, st):
                hnd.apply(pv, Matrix.Translation(pos) @ q.to_matrix().to_4x4())
        sc.render.filepath = os.path.join(out, cid, f"{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    if is_wand and only is None:
        with open(os.path.join(out, cid + ".json"), "w") as fh:
            json.dump({"fps": 24, "trace": [T_START, T_END], "hold": T_HOLD, "frames": len(tips), "tip": tips}, fh)
    print("DONE", cid, len(list(frames)))

main()
