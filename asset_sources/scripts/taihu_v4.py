"""太湖石: tall, perforated garden stones made with voxel remeshing and boolean holes.

Each stone starts as a twisted stack of blobs, is fused by a voxel remesh,
pierced by a few tunnels (透 and 漏), remeshed again to round the edges,
roughened with a noise displacement, decimated, and finally handed to
build_scene.add() as plain vertex/face/colour lists.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

import geom_v3
from geom_v3 import ground_height

STONES = (  # x, z, height, seed, base y (None: ground)
    (-13.6, 6.9, 2.2, 1, None), (-15.2, -4.2, 1.7, 2, None), (-.8, -5.9, 2.0, 3, .5), (17.6, 5.2, 1.9, 4, None),
    (-19.8, -3.0, 1.6, 5, None), (11.0, 8.1, 1.5, 7, None), (-10.5, 7.3, 1.3, 8, None),
)


def _object_from_bmesh(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def _apply(ob, mod):
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def taihu_stone(height, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    blobs = 7
    twist = rng.uniform(-1.2, 1.2)
    for k in range(blobs):
        t = k / (blobs - 1)
        r = height * (.2 + .13 * math.sin(t * math.pi * 1.3 + rng.uniform(0, 1))) * (1.15 - .35 * t)
        ang = twist * t + rng.uniform(-.4, .4)
        off = height * .16 * math.sin(t * 3 + seed)
        c = Vector((math.cos(ang) * off, height * (.08 + .85 * t), math.sin(ang) * off * .7))
        m = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        for v in m['verts']:
            v.co = Vector((v.co.x * r * rng.uniform(.7, 1.05), v.co.y * r * rng.uniform(.9, 1.3), v.co.z * r * rng.uniform(.4, .6))) + c
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # bmesh coordinates are taken as Y-up here and converted when emitted.
    ob = _object_from_bmesh(bm, 'TaihuTmp')
    rem = ob.modifiers.new('r1', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = height * .035
    _apply(ob, rem)
    print('TAIHU stage remesh', len(ob.data.vertices))
    # Tunnels: one cylinder at a time through the body in random directions.
    for k in range(rng.randint(7, 9)):
        cut_bm = bmesh.new()
        cy = height * rng.uniform(.2, .9)
        d = Vector((rng.uniform(-.4, .4), rng.uniform(-.5, .5), 1.0)).normalized()
        rr = height * rng.uniform(.04, .085)
        res = bmesh.ops.create_cone(cut_bm, cap_ends=True, segments=12, radius1=rr, radius2=rr * rng.uniform(.6, 1.2), depth=height * 1.4)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        shift = Vector((rng.uniform(-.1, .1) * height, cy, rng.uniform(-.06, .06) * height))
        for v in res['verts']:
            v.co = rot @ v.co + shift
        bmesh.ops.recalc_face_normals(cut_bm, faces=cut_bm.faces)
        cutter = _object_from_bmesh(cut_bm, 'TaihuCut')
        boo = ob.modifiers.new('b', 'BOOLEAN')
        boo.operation = 'DIFFERENCE'
        boo.object = cutter
        boo.solver = 'EXACT'
        _apply(ob, boo)
        bpy.data.objects.remove(cutter, do_unlink=True)
    print('TAIHU stage boolean', len(ob.data.vertices))
    rem2 = ob.modifiers.new('r2', 'REMESH')
    rem2.mode = 'VOXEL'
    rem2.voxel_size = height * .028
    _apply(ob, rem2)
    sm = ob.modifiers.new('s', 'SMOOTH')
    sm.factor = .6
    sm.iterations = 4
    _apply(ob, sm)
    dec = ob.modifiers.new('d', 'DECIMATE')
    dec.ratio = min(1.0, 3600 / max(1, len(ob.data.polygons)))
    _apply(ob, dec)
    me = ob.data
    me.calc_loop_triangles()
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    verts, cols = [], []
    for v in me.vertices:
        p = v.co.copy()
        n = v.normal
        # Fine pitting and ridges, pushed along the normal.
        pit = noise.noise(p * (6 / height) + off) * .5 + noise.noise(p * (14 / height) + off) * .3 + (1 - abs(noise.noise(Vector((p.x, p.y * .35, p.z)) * (9 / height) + off))) * .35
        p += n * pit * height * .04
        verts.append((p.x, p.y, p.z))
        # Cavity: faces turned towards the stone's axis are inner surfaces of tunnels.
        axis = Vector((0, p.y, 0))
        inward = max(0.0, -(n.dot((p - axis).normalized())))
        shade = (.45 + .55 * (1 - inward)) * (.82 + .18 * min(1, p.y / height + .2)) * (.9 + .1 * pit)
        cols.append((shade, shade, shade * .97))
    faces = [tuple(t.vertices) for t in me.loop_triangles]
    bpy.data.objects.remove(ob, do_unlink=True)
    return verts, faces, cols


def build_taihu(add):
    geom_v3.FOOTPRINTS = geom_v3.FOOTPRINTS + tuple((x, z, h * .32, h * .32) for x, z, h, _, _ in STONES)
    for x, z, h, seed, base in STONES:
        v, f, c = taihu_stone(h, seed)
        gy = base - .05 if base is not None else ground_height(x, z) - .12
        rot = seed * 1.7
        cr, sr = math.cos(rot), math.sin(rot)
        placed = [(x + px * cr - pz * sr, gy + py, z + px * sr + pz * cr) for px, py, pz in v]
        add('TaihuStones', 'Taihu', placed, f, c)
