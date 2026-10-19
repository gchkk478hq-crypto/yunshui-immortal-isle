"""Plan the dog's route over the zigzag bridge, lake pavilion, arch bridge and mountain landing.

Run after build_scene.py:
    Blender -b asset_sources/yunshui_isle.blend --python asset_sources/scripts/dog_path_v9.py

Ray-casts a 5 cm grid against the real scene, keeps cells whose top surface is
walkable (shore, bridge decks, paving) with nothing within dog height above it,
keeps a clearance margin from rails, posts, trunks, stones and deck edges, and
plans a centred A* path through the stop points. Writes src/dogPath.json in
three.js coordinates (x, y, z) with the exact deck heights.
"""
import heapq
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom_v3 import in_lake  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
X0, X1, Z0, Z1, STEP = -18.2, 3.4, -5.6, -.4, .05
WALK = ('IslandShore', 'ZigzagBridge', 'CentralBridge', 'LakePavilion_Paving', 'LakePavilion_Stone', 'MountainStair_Paving',
        'SteppingStones', 'Boardwalk')
PASS = ('Wildflowers', 'Understory', 'ShoreGrasses')
FOLIAGE = ('Leaf', 'Pine', 'Card', 'Blossom', 'Maple', 'Camphor', 'Poplar', 'Ivy', 'Willow', 'Flower', 'Bamboo')
DOG_H, RADIUS = .5, .075  # hard minimum clearance; the A* cost keeps the dog centred where there is room
# The zigzag bridge's west end is closed by shore boulders, so the walk runs along the connected decks:
# zigzag bridge (dead end, a place to sit and look out) -> lake pavilion -> arch bridge -> mountain landing.
STOPS = [(-15.55, -2.85, 'sit'), (-14.4, -2.6, None), (-12.9, -3.6, None), (-11.4, -2.7, 'sniff'), (-10.25, -3.1, None),
         (-8.0, -3.05, 'bow'), (-5.85, -3.6, None), (-3.38, -3.6, 'sit'), (-1.0, -3.6, None), (-.65, -5.1, 'bow')]

deps = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene


def column(x, z):
    """(ground height or None, obstacle above ground?) for the 3D point column at (x, z)."""
    origin = Vector((x, -z, 8.0))
    hits = []
    for _ in range(60):
        hit, loc, nrm, _i, obj, _m = scene.ray_cast(deps, origin, Vector((0, 0, -1)))
        if not hit:
            break
        hits.append((loc.z, nrm.z, obj.name))
        origin = loc + Vector((0, 0, -.002))
    ground = None
    for y, nz, name in hits:
        if name.startswith(WALK) and abs(nz) > .8:  # some deck slabs have inward-facing tops
            ground = y
            break
    if ground is None:
        return None, True
    if ground < .27 and in_lake(x, z, .05):
        return None, True  # under the lake surface
    for y, nz, name in hits:
        if y <= ground + .02:
            continue
        if name.startswith(PASS):
            continue
        material = name.split('_', 1)[-1]
        if any(material.startswith(f) for f in FOLIAGE) and y > ground + .35:
            continue  # canopy and hanging leaves well above the dog
        if y < ground + DOG_H:
            return ground, True
    return ground, False


nx, nz = int(round((X1 - X0) / STEP)) + 1, int(round((Z1 - Z0) / STEP)) + 1
H = [[None] * nx for _ in range(nz)]
blocked = [[True] * nx for _ in range(nz)]
for j in range(nz):
    for i in range(nx):
        h, b = column(X0 + i * STEP, Z0 + j * STEP)
        H[j][i] = h
        blocked[j][i] = b or h is None

# Clearance: distance (cells) to the nearest blocked cell, or to a sudden rise/drop (rail tops, deck edges).
edge = [[blocked[j][i] for i in range(nx)] for j in range(nz)]
for j in range(nz):
    for i in range(nx):
        if blocked[j][i]:
            continue
        for dj, di in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            jj, ii = j + dj, i + di
            if 0 <= jj < nz and 0 <= ii < nx and H[jj][ii] is not None and abs(H[jj][ii] - H[j][i]) > .27:
                edge[j][i] = True
INF = 10 ** 9
dist = [[0 if edge[j][i] else INF for i in range(nx)] for j in range(nz)]
for _ in range(2):  # two-pass chamfer distance transform
    for j in range(nz):
        for i in range(nx):
            for dj, di, w in ((-1, 0, 1), (0, -1, 1), (-1, -1, 1.414), (-1, 1, 1.414)):
                jj, ii = j + dj, i + di
                if 0 <= jj < nz and 0 <= ii < nx:
                    dist[j][i] = min(dist[j][i], dist[jj][ii] + w)
    for j in range(nz - 1, -1, -1):
        for i in range(nx - 1, -1, -1):
            for dj, di, w in ((1, 0, 1), (0, 1, 1), (1, 1, 1.414), (1, -1, 1.414)):
                jj, ii = j + dj, i + di
                if 0 <= jj < nz and 0 <= ii < nx:
                    dist[j][i] = min(dist[j][i], dist[jj][ii] + w)
need = RADIUS / STEP


def ok(j, i):
    return 0 <= j < nz and 0 <= i < nx and not blocked[j][i] and dist[j][i] >= need


def snap(x, z):
    best, bj, bi = -1, None, None
    cj, ci = int(round((z - Z0) / STEP)), int(round((x - X0) / STEP))
    R = int(1.0 / STEP)
    for j in range(cj - R, cj + R + 1):
        for i in range(ci - R, ci + R + 1):
            if ok(j, i):
                score = min(dist[j][i], 6) - math.hypot(j - cj, i - ci) * .25
                if score > best:
                    best, bj, bi = score, j, i
    if bj is None:
        raise SystemExit(f'no free cell near stop {x},{z}')
    return bj, bi


def astar(a, b):
    openq = [(0, 0, a)]
    came, g = {a: None}, {a: 0}
    while openq:
        _f, gc, cur = heapq.heappop(openq)
        if cur == b:
            break
        if gc > g[cur]:
            continue
        j, i = cur
        for dj in (-1, 0, 1):
            for di in (-1, 0, 1):
                if not dj and not di:
                    continue
                n = (j + dj, i + di)
                moves = []
                if ok(*n) and abs(H[n[0]][n[1]] - H[j][i]) <= .25:  # a dog hops a step, never a rail
                    moves.append((n, math.hypot(dj, di) * (1 + 10 * math.exp(-dist[n[0]][n[1]] / 2.5))))
                if not moves:
                    # Leap a short stretch of open water (never over a rail, rock or post): the run may cross
                    # the clearance margins at both edges, must cross some water, and lands on a free cell.
                    wet = False
                    for L in range(1, 13):
                        m = (j + dj * L, i + di * L)
                        if not (0 <= m[0] < nz and 0 <= m[1] < nx):
                            break
                        if H[m[0]][m[1]] is None:
                            wet = True
                            continue
                        if blocked[m[0]][m[1]]:
                            break  # an obstacle
                        if wet and ok(*m) and abs(H[m[0]][m[1]] - H[j][i]) <= .3:
                            moves.append((m, math.hypot(dj, di) * L * 3))
                            break
                for m, step in moves:
                    ng = gc + step
                    if ng < g.get(m, INF):
                        g[m] = ng
                        came[m] = cur
                        heapq.heappush(openq, (ng + math.hypot(m[0] - b[0], m[1] - b[1]), ng, m))
    if b not in came:
        for j in range(nz - 1, -1, -1):
            print(''.join('A' if (j, i) == a else 'B' if (j, i) == b else ('o' if ok(j, i) else ('-' if not blocked[j][i] else '#')) for i in range(max(0, min(a[1], b[1]) - 40), min(nx, max(a[1], b[1]) + 60))))
        raise SystemExit(f'no path between {a} and {b}')
    out, cur = [], b
    while cur is not None:
        out.append(cur)
        cur = came[cur]
    return out[::-1]


cells, stops = [], []
snapped = [snap(x, z) for x, z, _s in STOPS]
for k in range(len(snapped) - 1):
    seg = astar(snapped[k], snapped[k + 1])
    if k == 0:
        stops.append({'i': 0, 'state': STOPS[0][2]})
    cells.extend(seg if k == 0 else seg[1:])
    stops.append({'i': len(cells) - 1, 'state': STOPS[k + 1][2]})

# Expand leaps into airborne points (flag 1), then smooth (moving average) on the ground only.
expanded, air = [], []
for k, (j, i) in enumerate(cells):
    if k:
        pj, pi = cells[k - 1]
        L = max(abs(j - pj), abs(i - pi))
        for m in range(1, L):
            expanded.append((pj + (j - pj) * m / L, pi + (i - pi) * m / L, H[pj][pi] + (H[j][i] - H[pj][pi]) * m / L))
            air.append(1)
        if L > 1:
            for s_ in stops:
                if s_['i'] >= k:
                    s_['i'] += L - 1
    expanded.append((j, i, H[j][i]))
    air.append(0)
cells = [(int(round(j)), int(round(i))) for j, i, _h in expanded]
pts = [(X0 + i * STEP, Z0 + j * STEP) for j, i, _h in expanded]
smooth = []
for k in range(len(pts)):
    w = [pts[m] for m in range(max(0, k - 6), min(len(pts), k + 7))]
    p = (sum(q[0] for q in w) / len(w), sum(q[1] for q in w) / len(w))
    cj, ci = int(round((p[1] - Z0) / STEP)), int(round((p[0] - X0) / STEP))
    near_air = any(air[m] for m in range(max(0, k - 6), min(len(pts), k + 7)))
    smooth.append(p if ok(cj, ci) and not near_air else pts[k])
path = []
for k, (x, z) in enumerate(smooth):
    h, _b = (None, True) if air[k] else column(x, z)
    if h is None:
        h = expanded[k][2]
    path.append([round(x, 3), round(h, 3), round(z, 3), air[k]])
clear = min(dist[j][i] for (j, i), a in zip(cells, air) if not a) * STEP
data = {'note': 'Generated by asset_sources/scripts/dog_path_v9.py from the Blender scene (three.js coordinates).',
        'clearance': round(clear, 3), 'points': path, 'stops': stops}
with open(os.path.join(ROOT, 'src', 'dogPath.json'), 'w') as f:
    json.dump(data, f, separators=(',', ':'))
length = sum(math.dist(path[k], path[k + 1]) for k in range(len(path) - 1))
print('DOG_PATH', json.dumps({'points': len(path), 'length': round(length, 2), 'min_clearance_m': round(clear, 3), 'stops': len(stops),
                             'leaps': sum(1 for k in range(1, len(air)) if air[k] and not air[k - 1])}))
