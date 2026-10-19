"""Shared v3 geometry helpers: noise-carved stone, foliage clumps, placement.

All coordinates are Y-up metres, matching build_scene.add().  Every helper
returns plain vertex / face / colour lists so build_scene can batch them by
semantic name and material.  Colours are linear multipliers baked as COLOR_0
(cavity shading, crown self-shadow, tint variation).
"""
import json
import math
import os
import random

import bmesh
from mathutils import Vector, noise

TAU = math.tau
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
with open(os.path.join(ROOT, 'src/landscape-profile.json')) as _f:
    PROFILE = json.load(_f)

_ICO = {}


def icosphere(level):
    """Cached unit icosphere: level 2=80, 3=320, 4=1280 triangles."""
    if level not in _ICO:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1.0)
        verts = [v.co.copy() for v in bm.verts]
        faces = [tuple(v.index for v in f.verts) for f in bm.faces]
        bm.free()
        _ICO[level] = (verts, faces)
    return _ICO[level]


def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def smoothstep(a, b, v):
    t = clamp((v - a) / (b - a))
    return t * t * (3 - 2 * t)


def fbm(p, octaves=4, lac=2.03, gain=.5):
    amp, total, norm = 1.0, 0.0, 0.0
    for _ in range(octaves):
        total += amp * noise.noise(p)
        norm += amp
        amp *= gain
        p = p * lac
    return total / norm


def ridged(p, octaves=3):
    """0..1 sharp crest lines, used for karst columns and fissures."""
    amp, total, norm = 1.0, 0.0, 0.0
    for _ in range(octaves):
        total += amp * (1 - abs(noise.noise(p)))
        norm += amp
        amp *= .5
        p = p * 2.1
    return total / norm


# --------------------------------------------------------------------------
# Lake / island shape (same profile as src/landscape.ts)
def shore_radius(t):
    return PROFILE['base'] + sum(a * math.sin(n * t + p) for n, a, p in PROFILE['harmonics'])


def lake_point(t, scale=1.0):
    r = shore_radius(t) * scale
    return 18 * r * math.cos(t), 9 * r * math.sin(t)


OUTLETS = ((-12, 11, 1.7), (0, 13, 2.1), (11, 11, 1.9), (21, 3, 1.5))


def outline(t):
    r = 1 + .047 * math.sin(7 * t + .3) + .03 * math.cos(11 * t) + .022 * math.sin(19 * t)
    for x, z, _ in OUTLETS:
        angle = math.atan2(z / 14, x / 24)
        d = abs(math.atan2(math.sin(t - angle), math.cos(t - angle)))
        if d < .18:
            r = min(r, math.hypot(x / 24, z / 14) - .035 + .20 * (d / .11) ** 4)
    return r


def in_lake(x, z, margin=0.0):
    t = math.atan2(z / 9, x / 18)
    rr = math.sqrt((x / 18) ** 2 + (z / 9) ** 2)
    return rr * (1 - margin / 12) < shore_radius(t)


def island_fraction(x, z):
    """<1 inside the rim; 1 is the cliff edge."""
    t = math.atan2(z / 14, x / 24)
    return math.sqrt((x / 24) ** 2 + (z / 14) ** 2) / outline(t)


def near_outlet_stream(x, z, pad=1.4):
    """True on the lake-to-cliff water channels and their spill zones."""
    for ax, az, w in OUTLETS:
        t = math.atan2(az / 9, ax / 18)
        sx, sz = lake_point(t, .88)
        dx, dz = ax - sx, az - sz
        L = math.hypot(dx, dz)
        u = clamp(((x - sx) * dx + (z - sz) * dz) / (L * L), -.1, 1.25)
        px, pz = sx + dx * u, sz + dz * u
        if math.hypot(x - px, z - pz) < w * .75 + pad:
            return True
    return False


def shelf_height(t, a, x, z):
    """Height of the shore shelf; a=0 at the lake edge, 1 at the cliff rim."""
    h = -.34 * (1 - a) + .12 * a + math.sin(a * math.pi) * (.22 + .12 * math.sin(t * 17))
    h += .045 * noise.noise(Vector((x * .55, 3.1, z * .55))) * math.sin(a * math.pi)
    return h


def ground_height(x, z):
    t = math.atan2(z / 9, x / 18)
    sx, sz = lake_point(t)
    o = outline(t)
    rx, rz = 24 * .98 * o * math.cos(t), 14 * .98 * o * math.sin(t)
    dx, dz = rx - sx, rz - sz
    a = clamp(((x - sx) * dx + (z - sz) * dz) / (dx * dx + dz * dz))
    return shelf_height(t, a, x, z)


# Architecture footprints (x, z, half-x, half-z) and the palace stair.
FOOTPRINTS = (
    (-18, 3, 4.2, 3.6), (13, 5.8, 3.2, 2.4), (-8, -3, 2.6, 2.4), (-13, -7.3, 3.0, 2.6),
    (7, -9, 4.6, 3.6), (1, -10.5, 3.1, 2.5), (13, -9.7, 3.1, 2.5), (5.2, -5.0, 6.4, 1.1),
    (.9, -4.55, 2.4, 1.9), (-3.4, -3.6, 2.6, 1.0), (-13.1, -3.1, 3.1, .9), (10.1, 5.8, 1.0, 1.4),
    (-21.4, -2.1, 1.1, 2.1), (-16.6, -1.9, .7, 1.8),
)


def clear_of_buildings(x, z, pad=0.3):
    return not any(abs(x - cx) < hx + pad and abs(z - cz) < hz + pad for cx, cz, hx, hz in FOOTPRINTS)


class Placement:
    """Rejection sampler that keeps plants apart from each other and from water."""

    def __init__(self):
        self.taken = []

    def reserve(self, x, z, r):
        self.taken.append((x, z, r))

    def free(self, x, z, r):
        return all(math.hypot(x - a, z - b) > r + c for a, b, c in self.taken)

    def ok_ground(self, x, z, r, lake_margin=.6, rim=.93):
        return (not in_lake(x, z, -lake_margin) and island_fraction(x, z) < rim
                and clear_of_buildings(x, z, r * .6) and not near_outlet_stream(x, z, r * .5)
                and self.free(x, z, r))


# --------------------------------------------------------------------------
def rock(center, size, seed, level=3, sharp=.9, strata=.0, sink=.0, lean=(0.0, 0.0), taper=0.0):
    """Noise-carved boulder with planar fracture facets and cavity shading.

    Returns (vertices, faces, colours).  ``sharp`` controls how strongly the
    random fracture planes cut the noisy blob; ``strata`` adds horizontal
    bedding grooves; ``sink`` flattens the buried base.
    """
    rng = random.Random(seed)
    base_v, faces = icosphere(level)
    off = Vector((rng.uniform(-90, 90), rng.uniform(-90, 90), rng.uniform(-90, 90)))
    planes = []
    for _ in range(rng.randint(6, 9)):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-.45, 1), rng.uniform(-1, 1))).normalized()
        planes.append((n, rng.uniform(.55, .85)))
    verts, cols = [], []
    cx, cy, cz = center
    sx, sy, sz = size
    for p0 in base_v:
        p = p0.copy()
        broad = noise.noise(p * .85 + off)
        mid = noise.noise(p * 2.2 + off * 1.31)
        fine = noise.noise(p * 5.3 + off * .73)
        r = 1 + .26 * broad + .11 * mid + .045 * fine
        q = p * r
        cut = 0.0
        for n, dist in planes:
            d = q.dot(n)
            if d > dist:
                q -= n * (d - dist) * sharp
                cut += d - dist
        if strata:
            band = math.sin(q.y * 9.0 + broad * 2.5)
            q *= 1 - strata * smoothstep(.55, 1.0, band)
        y = q.y
        if sink and y < -.25:
            y = -.25 + (y + .25) * (1 - sink)
        cavity = clamp(.5 + 1.6 * (r - 1) + .8 * cut)
        shade = (.58 + .42 * cavity) * (.78 + .22 * clamp(.5 + y))
        tint = 1 + .06 * noise.noise(p * 1.7 + off * 2.0)
        tp = 1 - taper * clamp((1 - y) / 2) ** 1.3
        verts.append((cx + (q.x * tp + lean[0] * y) * sx, cy + y * sy, cz + (q.z * tp + lean[1] * y) * sz))
        cols.append((shade * tint, shade, shade * (2 - tint)))
    return verts, faces, cols


def clump(center, radii, seed, level=3, lumpy=.28, flat_base=.35, light=(1.0, 1.0, 1.0),
          dark=(.42, .46, .40)):
    """Foliage mass: lumpy flattened sphere with top-lit, interior-dark colours."""
    rng = random.Random(seed)
    base_v, faces = icosphere(level)
    off = Vector((rng.uniform(-90, 90), rng.uniform(-90, 90), rng.uniform(-90, 90)))
    verts, cols = [], []
    for p0 in base_v:
        p = p0.copy()
        lump = noise.noise(p * 1.9 + off) * .65 + noise.noise(p * 4.4 + off * 1.7) * .35
        r = 1 + lumpy * lump
        q = p * r
        if q.y < -flat_base:
            q.y = -flat_base + (q.y + flat_base) * .25
        up = clamp(.5 + .5 * q.y / max(.2, r))
        k = clamp(.25 + .75 * up + .35 * lump)
        jitter = 1 + .08 * noise.noise(p * 7.0 + off)
        cols.append(tuple((dark[i] + (light[i] - dark[i]) * k) * jitter for i in range(3)))
        verts.append((center[0] + q.x * radii[0], center[1] + q.y * radii[1], center[2] + q.z * radii[2]))
    return verts, faces, cols
