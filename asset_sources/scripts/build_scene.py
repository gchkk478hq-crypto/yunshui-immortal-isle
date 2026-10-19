"""Deterministic original Yunshui geometry, v3. Blender 4.1+/5.x, no external assets.

v3: noise-carved karst terrain, cloud-pad pines and new plants, curved tiled
roofs with upturned eaves and brackets, lacquer columns on marble plinths and
a solid white-marble arch bridge.  Baked COLOR_0 carries cavity shading.
"""
import bpy, math, random, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
R = random.Random(812)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
M = {}


def mat(n, c, metal=0, rough=.65, emission=0):
    m = bpy.data.materials.new(n); m.diffuse_color = (*c, 1); m.use_nodes = True; m.node_tree.nodes.clear()
    p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); out = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    out.is_active_output = True; m.node_tree.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*c, 1); p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*c, 1); p.inputs['Emission Strength'].default_value = emission
    M[n] = m


for spec in [
    ('Basalt', (.34, .345, .33)), ('RockLight', (.48, .48, .45)), ('RockDark', (.24, .25, .245)), ('Moss', (.1, .17, .06)),
    ('Grass', (.13, .19, .075)), ('Earth', (.22, .2, .14)), ('WetStone', (.2, .22, .21), 0, .32), ('Taihu', (.5, .5, .48), 0, .8),
    ('Wood', (.12, .075, .05)), ('WoodLight', (.24, .15, .09)), ('Chestnut', (.1, .058, .038), 0, .5),
    ('Gold', (.26, .22, .16), .3, .45), ('Roof', (.06, .063, .067), .05, .5), ('RoofRidge', (.045, .047, .05), .05, .55),
    ('RoofUnder', (.1, .06, .04), 0, .7), ('Plaster', (.8, .79, .75)), ('WallBase', (.33, .33, .32), 0, .8),
    ('Shadow', (.05, .05, .05), 0, .9), ('Paving', (.36, .36, .345), 0, .8), ('Marble', (.58, .575, .54), 0, .6),
    ('Stone', (.4, .4, .385), 0, .75), ('Light', (1, .72, .42), 0, .4, 1.8),
    ('Pine', (.05, .12, .065)), ('PineLight', (.1, .18, .08)), ('Leaf', (.09, .2, .08)), ('LeafLight', (.17, .27, .1)),
    ('WillowLeaf', (.2, .31, .11)), ('Ivy', (.06, .13, .055)), ('Shrub', (.07, .15, .065)), ('ShrubFlower', (.62, .36, .44)),
    ('MapleRed', (.42, .1, .07)), ('MapleOrange', (.55, .27, .1)), ('Camphor', (.1, .17, .08)), ('CamphorLight', (.18, .25, .11)),
    ('Blossom', (.95, .92, .89)), ('BlossomPink', (.86, .7, .72)), ('Bark', (.17, .135, .1)),
    ('BambooStem', (.25, .33, .16), 0, .43), ('BambooNode', (.38, .4, .25)), ('Flower', (.85, .82, .7)), ('GrassDry', (.21, .22, .12)),
    ('PoplarBark', (.6, .6, .56)), ('BarkDark', (.07, .065, .06)), ('PoplarLeaf', (.17, .26, .12)), ('PoplarLeafLight', (.3, .37, .24)),
    # v9 lawn flowers (low-saturation)
    ('FlowerWhite', (.9, .89, .84)), ('FlowerYellow', (.78, .66, .3)), ('FlowerLilac', (.6, .55, .7)), ('FlowerPink', (.84, .62, .64)),
]:
    mat(spec[0], *spec[1:])
CARD_BASES = ('Pine', 'PineLight', 'MapleRed', 'MapleOrange', 'Camphor', 'CamphorLight', 'PoplarLeaf', 'PoplarLeafLight',
              'Shrub', 'ShrubFlower', 'LeafLight', 'Blossom', 'BlossomPink')
for base in CARD_BASES:
    mat(base + 'Card', tuple(M[base].diffuse_color[:3]), 0, .8)

B = {}


def add(name, ma, vs, fs, cols=None, uvs=None, nrms=None):
    key = (name, ma)
    if key not in B:
        B[key] = [[], [], [], [], []]
    v, f, c, uv, nr = B[key]; k = len(v)
    v.extend((x, -z, y) for x, y, z in vs)
    f.extend(tuple(k + i for i in face) for face in fs)
    c.extend(cols if cols else [(1.0, 1.0, 1.0)] * len(vs))
    uv.extend(uvs if uvs else [None] * len(vs))
    nr.extend([(x, -z, y) for x, y, z in nrms] if nrms else [None] * len(vs))


def box(n, m, p, s, cols=None):
    x, y, z = p; a, b, c = [i / 2 for i in s]
    v = [(x + i * a, y + j * b, z + k * c) for i, j, k in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    add(n, m, v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)], cols)


def slab(n, m, a, b, h, thick, cols=None):
    """Sloped box whose bottom edge runs from a to b (Y-up), height h, depth thick (along z/x normal)."""
    a = Vector(a); b = Vector(b); d = (b - a); d.y = 0; d.normalize(); side = Vector((-d.z, 0, d.x)) * (thick / 2)
    v = [a - side, b - side, b + side, a + side]
    v = v + [p + Vector((0, h, 0)) for p in v]
    add(n, m, [tuple(p) for p in v], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)], cols)


def rod(n, m, a, b, r, r2=None, seg=7):
    a = Vector(a); b = Vector(b); d = (b - a).normalized(); u = d.cross(Vector((0, 1, 0)))
    if u.length < .1:
        u = d.cross(Vector((1, 0, 0)))
    u.normalize(); w = d.cross(u); v = []
    for p, rr in [(a, r), (b, r if r2 is None else r2)]:
        for i in range(seg):
            v.append(tuple(p + rr * (u * math.cos(i * math.tau / seg) + w * math.sin(i * math.tau / seg))))
    f = [tuple(range(seg - 1, -1, -1)), tuple(range(seg, 2 * seg))] + [(i, (i + 1) % seg, (i + 1) % seg + seg, i + seg) for i in range(seg)]
    add(n, m, v, f)


def ell(n, m, p, s, seg=8, rings=5, noise=0):
    v = []
    for j in range(rings + 1):
        phi = math.pi * j / rings
        for i in range(seg):
            th = math.tau * i / seg; rr = 1 + R.uniform(-noise, noise)
            v.append((p[0] + s[0] * math.sin(phi) * math.cos(th) * rr, p[1] + s[1] * math.cos(phi) * rr, p[2] + s[2] * math.sin(phi) * math.sin(th) * rr))
    f = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i) for j in range(rings) for i in range(seg)]
    add(n, m, v, f)


def polyline(n, m, pts, r, seg=7):
    for a, b in zip(pts, pts[1:]):
        rod(n, m, a, b, r, seg=seg)


def band(n, m, pts, w, h, cols=None):
    """Square-section ribbon following pts (Y-up), used for ridges and arch rings."""
    v, f = [], []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)]); b = Vector(pts[min(len(pts) - 1, i + 1)]); t = (b - a).normalized()
        s = t.cross(Vector((0, 1, 0)))
        if s.length < .1:
            s = t.cross(Vector((1, 0, 0)))
        s.normalize(); u = s.cross(t).normalized(); p = Vector(p)
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append(tuple(p + s * dx * w / 2 + u * dy * h / 2))
    for i in range(len(pts) - 1):
        for k in range(4):
            a = i * 4 + k; b = i * 4 + (k + 1) % 4
            f.append((a, b, b + 4, a + 4))
    f += [(3, 2, 1, 0), tuple(range(len(v) - 4, len(v)))]
    add(n, m, v, f, cols)


from terrain_v3 import build_terrain
SPOTS = build_terrain(add, rod, ell, polyline)


from architecture_v4 import build_architecture
build_architecture(add, box, slab, rod, ell, polyline, band)

from taihu_v4 import build_taihu
build_taihu(add)
from vegetation_v3 import build_vegetation
TAKEN = build_vegetation(add, rod, ell, polyline, SPOTS)
from architecture_v4 import STAIR_FACE
from dressing_v9 import build_dressing
print('DRESSING', build_dressing(add, SPOTS, TAKEN, B, STAIR_FACE))

# One object per semantic/material combination. No textures or image planes.
SMOOTH = {'Pine', 'PineLight', 'Blossom', 'BlossomPink', 'Light', 'Leaf', 'LeafLight', 'WillowLeaf', 'Ivy', 'Shrub', 'ShrubFlower',
          'MapleRed', 'MapleOrange', 'Camphor', 'CamphorLight', 'Bark', 'BambooStem', 'BambooNode', 'Moss', 'Grass', 'Earth', 'WetStone',
          'Gold', 'Taihu', 'Flower', 'GrassDry', 'PoplarBark', 'BarkDark', 'PoplarLeaf', 'PoplarLeafLight'}
ROCKY = {'Basalt', 'RockLight', 'RockDark'}
for (n, ma), (vs, fs, cs, uvs, nrs) in B.items():
    mesh = bpy.data.meshes.new(n + '_' + ma); mesh.from_pydata(vs, [], fs); mesh.materials.append(M[ma]); mesh.update()
    if any(u is not None for u in uvs):
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index] or (0.0, 0.0)
    col = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    flat = [ch for c in cs for ch in (min(1, c[0]), min(1, c[1]), min(1, c[2]), 1.0)]
    col.data.foreach_set('color', flat)
    mesh.color_attributes.active_color = col
    mesh.shade_smooth()
    if all(nv is not None for nv in nrs):
        # Leaf cards carry sphere-like normals so crowns shade softly as one volume.
        mesh.normals_split_custom_set([nrs[loop.vertex_index] for loop in mesh.loops])
    elif ma in ROCKY:
        mesh.set_sharp_from_angle(angle=math.radians(52))
    elif ma == 'Roof' or ma == 'RoofUnder':
        mesh.set_sharp_from_angle(angle=math.radians(40))
    elif ma not in SMOOTH:
        mesh.set_sharp_from_angle(angle=math.radians(32))
    obj = bpy.data.objects.new(n + '_' + ma, mesh); bpy.context.collection.objects.link(obj)
    event = ('flora.magnolia' if n.startswith(('Magnolia', 'Peach')) else 'flora.leaves' if n.startswith(('Pine', 'Bamboo', 'Willow', 'Maple', 'Camphor', 'Poplar'))
             else 'pavilion.lantern' if n.startswith('Lantern') else 'camera.bridge' if n.startswith(('CentralBridge', 'ZigzagBridge'))
             else 'camera.palace' if n.startswith('Palace') and not n.startswith('PalaceMountain') else '')
    if event:
        obj['event'] = event
# Walkable heightmap for the animals: ray-cast every 0.5 m, keep the first walkable surface,
# and block cells under buildings, rocks, shrubs and trunks.
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
WALK = ('IslandShore', 'IslandCliff', 'CentralBridge', 'ZigzagBridge', 'MountainStair', 'SteppingStones', 'Boardwalk')
SOLID = ('Palace', 'WestGardenHall', 'LakesidePavilion', 'MusicPavilion', 'LakePavilion', 'CloudWall', 'Taihu', 'Shore', 'Cliff',
         'Mountain', 'Stream', 'Root', 'Shrubs', 'Lantern')
HX0, HZ0, HSTEP, HNX, HNZ = -24.5, -14.5, .5, 99, 59
heights, blocked = [], []
for iz in range(HNZ):
    for ix in range(HNX):
        x, z = HX0 + ix * HSTEP, HZ0 + iz * HSTEP
        origin = Vector((x, -z, 40.0))
        ground, near = None, []
        for _ in range(80):
            hit, loc, nrm, idx, obj, _m = bpy.context.scene.ray_cast(deps, origin, Vector((0, 0, -1)))
            if not hit:
                break
            if obj.name.startswith(('Wildflowers', 'Understory', 'ShoreGrasses')):
                origin = loc + Vector((0, 0, -.003))  # thin ground cover: animals walk through it
                continue
            if obj.name.startswith(WALK) or obj.name.endswith('_Paving'):
                ground = loc.z
                break
            near.append((loc.z, obj.name))
            origin = loc + Vector((0, 0, -.003))
        if ground is None:
            heights.append(-99); blocked.append(1)
            continue
        b = 0
        for yy, name in near:
            gap = yy - ground
            if (name.startswith(SOLID) and gap < 4.0 and not name.endswith(('_Roof', '_RoofUnder', '_RoofRidge'))) or gap < .9:
                b = 1
        heights.append(round(ground, 2)); blocked.append(b)
from terrain_v3 import channel_bed
from geom_v3 import in_lake as _in_lake, island_fraction as _frac
for iz in range(HNZ):
    for ix in range(HNX):
        x, z = HX0 + ix * HSTEP, HZ0 + iz * HSTEP
        if heights[iz * HNX + ix] > -50 and _frac(x, z) > .88 and blocked[iz * HNX + ix] == 0:
            blocked[iz * HNX + ix] = 1  # keep animals back from the cliff edge
        if heights[iz * HNX + ix] > -50 and (channel_bed(x, z) < .25 or _in_lake(x, z, -.15)):
            # Water: lake (slightly widened) and the outlet streams; decks over it stay walkable.
            if heights[iz * HNX + ix] < .3:
                blocked[iz * HNX + ix] = 2
for tx, tz, tr in TAKEN:
    r = tr * .45
    for iz in range(max(0, int((tz - r - HZ0) / HSTEP)), min(HNZ, int((tz + r - HZ0) / HSTEP) + 2)):
        for ix in range(max(0, int((tx - r - HX0) / HSTEP)), min(HNX, int((tx + r - HX0) / HSTEP) + 2)):
            if math.hypot(HX0 + ix * HSTEP - tx, HZ0 + iz * HSTEP - tz) < r and blocked[iz * HNX + ix] == 0:
                blocked[iz * HNX + ix] = 1
with open(os.path.join(ROOT, 'src', 'heightmap.json'), 'w') as f:
    json.dump({'x0': HX0, 'z0': HZ0, 'step': HSTEP, 'nx': HNX, 'nz': HNZ, 'h': heights, 'b': ''.join(str(v) for v in blocked)}, f, separators=(',', ':'))
print('HEIGHTMAP', sum(1 for v in blocked if v == 0), 'walkable,', sum(1 for v in blocked if v == 1), 'blocked,', sum(1 for v in blocked if v == 2), 'water')
world = bpy.context.scene.world; world.use_nodes = True; world.node_tree.nodes.clear()
bg = world.node_tree.nodes.new('ShaderNodeBackground'); out = world.node_tree.nodes.new('ShaderNodeOutputWorld'); out.is_active_output = True
world.node_tree.links.new(bg.outputs[0], out.inputs[0]); bg.inputs[0].default_value = (.34, .56, .78, 1); bg.inputs[1].default_value = .7
bpy.ops.object.light_add(type='SUN', location=(20, -20, 40)); bpy.context.object.rotation_euler = (.45, -.5, -.4); bpy.context.object.data.energy = 3
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'asset_sources', 'yunshui_isle.blend'))
mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in mesh_objs:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'public/assets/models/island.glb'), export_format='GLB', use_selection=True,
                          export_extras=True, export_yup=True, export_apply=True, export_vertex_color='ACTIVE')
tri = 0
groups = {}
for o in mesh_objs:
    o.data.calc_loop_triangles(); k = len(o.data.loop_triangles); tri += k
    g = ''.join(ch for ch in o.name.split('_')[0] if not ch.isdigit()); groups[g] = groups.get(g, 0) + k
stats = {'objects': len(mesh_objs), 'materials': len(M), 'triangles': tri, 'vertices': sum(len(o.data.vertices) for o in mesh_objs), 'seed': 812,
         'revision': 'landscape-v9-mountain-lawns', 'groups': dict(sorted(groups.items(), key=lambda kv: -kv[1])),
         'source': 'Original deterministic Blender geometry; no third-party media', 'bounds': 'x [-25,25], y [-14.4,20], z [-15,15]'}
with open(os.path.join(ROOT, 'asset_sources', 'stats.json'), 'w') as f:
    json.dump(stats, f, indent=2)
print('ASSET_STATS', json.dumps(stats))
