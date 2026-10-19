"""v3 terrain: karst cliff columns, noise-carved boulders, shaded shore (Y-up).

The island silhouette, lake contour and waterfall outlets are unchanged from
v2 so the runtime water, koi bounds and camera anchors stay valid.
"""
import math
import random

from mathutils import Vector, noise

from geom_v3 import (OUTLETS, TAU, clamp, fbm, lake_point, outline, ridged, rock,
                     shelf_height, smoothstep)
from rockface_v9 import rock_shade, strata

R = random.Random(3812)
# (radius factor, y) of the inverted-mountain underside, from rim to tip.
PROFILE = [(.98, .12), (1.0, -.65), (.995, -1.5), (.97, -2.3), (.955, -3.1), (.915, -4.3),
           (.885, -5.3), (.83, -6.8), (.795, -7.6), (.71, -9.1), (.62, -10.2), (.47, -11.9),
           (.28, -13.2), (.06, -14.0)]


def _profile(v):
    """Smooth monotone interpolation of PROFILE for v in [0, 1]."""
    f = v * (len(PROFILE) - 1)
    i = min(int(f), len(PROFILE) - 2)
    u = f - i
    us = u * u * (3 - 2 * u)
    (r0, y0), (r1, y1) = PROFILE[i], PROFILE[i + 1]
    return r0 + (r1 - r0) * us, y0 + (y1 - y0) * u


def _outlet_weight(t, spread=1.0):
    w = 0.0
    for x, z, width in OUTLETS:
        a = math.atan2(z / 14, x / 24)
        d = abs(math.atan2(math.sin(t - a), math.cos(t - a))) * 19.0
        w = max(w, math.exp(-(d / (width * .85 * spread)) ** 2))
    return w


def _channel(x, z):
    """(lateral distance, along fraction, half width) to the nearest lake-to-lip stream."""
    best = (1e9, 0, 1)
    for ax, az, w in OUTLETS:
        sx, sz = lake_point(math.atan2(az / 9, ax / 18), .86)
        dx, dz = ax - sx, az - sz
        L2 = dx * dx + dz * dz
        u = ((x - sx) * dx + (z - sz) * dz) / L2
        uc = min(1.0, max(0.0, u))
        d = math.hypot(x - (sx + dx * uc), z - (sz + dz * uc))
        if u > 1.0:
            d += (u - 1.0) * math.sqrt(L2) * 3
        if d < best[0]:
            best = (d, u, w)
    return best


def channel_bed(x, z):
    """Stream bed: shallow U-section that rises smoothly into the grassy banks."""
    d, u, w = _channel(x, z)
    if u < -.15:
        return 9.0
    return .03 + .32 * smoothstep(w * .5, w * 1.15, d)


def build_terrain(add, rod, ell, polyline):
    spots = {'mountain': [], 'rim': []}

    def put_rock(name, material, center, size, seed, **kw):
        v, f, c = rock(center, size, seed, **kw)
        add(name, material, v, f, c)

    # ---------------------------------------------------------------- cliff
    n, K = 512, 60
    verts, cols = [], []
    for k in range(K + 1):
        v = (k / K) ** 1.3
        rr, y = _profile(v)
        for i in range(n):
            t = i * TAU / n
            o = outline(t)
            bx, bz = 24 * o * rr * math.cos(t), 14 * o * rr * math.sin(t)
            nx, nz = math.cos(t) / 24, math.sin(t) / 14
            nl = math.hypot(nx, nz)
            nx, nz = nx / nl, nz / nl
            # Karst columns: ridged noise stretched vertically at two scales.
            # |noise| is zero along thin fissures; sqrt widens the pillar tops.
            pill = math.sqrt(min(1., abs(noise.noise(Vector((bx * .3, y * .022, bz * .3)))) * 1.8))
            pill2 = math.sqrt(min(1., abs(noise.noise(Vector((bx * .85, y * .06, bz * .85)) + Vector((17, 3, 9)))) * 1.8))
            col = .35 + .65 * pill
            col2 = .35 + .65 * pill2
            broad = fbm(Vector((bx * .07, y * .035, bz * .07)), 3)
            bed = math.sin(y * 1.9 + broad * 4.0 + noise.noise(Vector((bx * .2, 0, bz * .2))) * 2)
            fine = noise.noise(Vector((bx * .9, y * .5, bz * .9)))
            depth = smoothstep(0.0, 1.1, .12 - y)
            g = _outlet_weight(t)
            d = depth * (2.2 * (col - .7) + .7 * (col2 - .7) + .8 * broad + .1 * smoothstep(.7, 1., bed) + .1 * fine)
            d += .7 * (col - .5) * smoothstep(.5, 1., v)
            d -= 1.1 * g * depth
            if k == K:
                d = 0
            verts.append((bx + nx * d, y + .12 * fine * depth, bz + nz * d))
            cavity = clamp(.2 + 1.2 * (col - .45) + .5 * (col2 - .45) + .3 * broad)
            streak = .5 + .5 * noise.noise(Vector((bx * 1.1, y * .04, bz * 1.1)))
            shade = (.5 + .5 * cavity) * (.84 + .16 * streak) * (1 - .3 * v) * (1 - .32 * g * depth)
            cols.append((shade * 1.02, shade, shade * .96))
    faces = [(k * n + i, k * n + (i + 1) % n, (k + 1) * n + (i + 1) % n, (k + 1) * n + i)
             for k in range(K) for i in range(n)]
    tip = len(verts)
    verts.append((0, -14.35, 0))
    cols.append((.35, .35, .35))
    faces += [(K * n + (i + 1) % n, K * n + i, tip) for i in range(n)]
    add('IslandCliff', 'Basalt', verts, faces, cols)

    # ---------------------------------------------------------------- shore
    n = 384
    verts, cols = [], []
    for j in range(8):
        a = j / 7
        for i in range(n):
            t = i * TAU / n
            x, z = lake_point(t)
            o = outline(t)
            ox, oz = 24 * .98 * o * math.cos(t), 14 * .98 * o * math.sin(t)
            px, pz = x * (1 - a) + ox * a, z * (1 - a) + oz * a
            h = -.38 if j == 0 else shelf_height(t, a, px, pz)
            h = min(h, channel_bed(px, pz))
            verts.append((px, h, pz))
            wet = 1 - smoothstep(.0, .3, a)
            c = (.62 + .38 * (1 - wet)) * (.9 + .1 * noise.noise(Vector((px * .8, 1.7, pz * .8))))
            cols.append((c, c, c))
    for j in range(7):
        faces = [(j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i) for i in range(n)]
        add('IslandShore', 'WetStone' if j == 0 else 'Earth' if j == 1 else 'Grass', verts, faces, cols)

    # ------------------------------------------------------ rim and outcrops
    for i in range(54):
        t = i * TAU / 54 + R.uniform(-.03, .03)
        if _outlet_weight(t, 1.6) > .25:
            continue
        o = outline(t)
        x, z = 23.0 * o * math.cos(t), 13.35 * o * math.sin(t)
        h = R.uniform(1.4, 3.3)
        put_rock('CliffFracture', 'RockLight' if i % 3 else 'RockDark', (x, -h * .55, z),
                 (R.uniform(.75, 1.35), h, R.uniform(.6, 1.1)), 1000 + i, level=3, sharp=1.0, strata=.05)
        spots['rim'].append((x, .1, z, t))
    # Large shelf outcrops and hanging spires break up the underside silhouette.
    for i in range(22):
        t = i * TAU / 22 + R.uniform(-.08, .08)
        if _outlet_weight(t, 1.4) > .3:
            continue
        v = R.uniform(.12, .55)
        rr, y = _profile(v)
        o = outline(t)
        x, z = 24 * o * rr * math.cos(t) * 1.01, 14 * o * rr * math.sin(t) * 1.01
        s = R.uniform(1.0, 1.9)
        put_rock('CliffLedge', 'Basalt', (x, y, z), (s * 1.3, s * R.uniform(.35, .55), s * .9), 1100 + i,
                 level=3, sharp=1.0, strata=.1)
    for i in range(14):
        t = i * TAU / 14 + R.uniform(-.1, .1)
        v = R.uniform(.55, .82)
        rr, y = _profile(v)
        o = outline(t)
        x, z = 24 * o * rr * math.cos(t) * .93, 14 * o * rr * math.sin(t) * .93
        L = R.uniform(.9, 2.0)
        put_rock('CliffSpires', 'Basalt', (x, y - L * .55, z), (R.uniform(.45, .75), L, R.uniform(.45, .75)), 1200 + i,
                 level=3, sharp=.6, taper=.85)

    # Boulders line both banks of each stream and frame the falls at the lip.
    for oi, (ax, az, w) in enumerate(OUTLETS):
        sx, sz = lake_point(math.atan2(az / 9, ax / 18), .86)
        dx, dz = ax - sx, az - sz
        L = math.hypot(dx, dz)
        nx, nz = -dz / L, dx / L
        for k in range(6):
            u = .12 + k * .17
            for side in (-1, 1):
                if R.random() < .25:
                    continue
                lat = w * R.uniform(.62, .85)
                px, pz = sx + dx * u + nx * lat * side, sz + dz * u + nz * lat * side
                s = R.uniform(.22, .5) * (1.3 if u > .85 else 1)
                put_rock('StreamStones', 'WetStone' if k % 2 else 'RockLight', (px, .08 + s * .25, pz),
                         (s * 1.3, s * .75, s), 5000 + oi * 40 + k * 2 + (side > 0), level=3, sharp=.9, sink=.6)

    # ---------------------------------------------------- shore boulders
    for i in range(96):
        t = R.uniform(0, TAU)
        if math.sin(t * 7 + .4) < -.5:
            continue
        x, z = lake_point(t, R.uniform(1.0, 1.1))
        if any(abs(x - ax) < w + .6 and abs(z - az) < 2.6 for ax, az, w in OUTLETS):
            continue
        s = R.uniform(.25, .7)
        put_rock('ShoreBoulders', 'WetStone' if i % 3 == 0 else 'RockLight', (x, .05 + s * .2, z),
                 (s * 1.35, s * .8, s), 2000 + i, level=3, sharp=.95, sink=.6)
        for k in range(2):
            sx, sz = x + R.uniform(-.8, .8), z + R.uniform(-.55, .55)
            ps = R.uniform(.08, .16)
            put_rock('ShorePebbles', 'WetStone', (sx, -.02, sz), (ps * 1.2, ps * .7, ps), 3000 + i * 4 + k,
                     level=2, sharp=.35, sink=.5)

    # ---------------------------------------------------- palace escarpment
    def ridge(cx, cz, sx, sz, height, seed):
        levels = [(1.12, .0), (1.12, .06), (1.10, .13), (.99, .32), (.92, .42), (.80, .66),
                  (.74, .73), (.61, .96), (.60, 1.0)]

        def surface(t, f, top, bottom):
            """v3 silhouette (unchanged) + v9 bedding ledges and joints. Returns new and v3 positions."""
            a = min(int(f), len(levels) - 2)
            u = f - a
            us = u * u * (3 - 2 * u)
            rr = levels[a][0] + (levels[a + 1][0] - levels[a][0]) * us
            yy = levels[a][1] + (levels[a + 1][1] - levels[a][1]) * u
            r = rr * (1 + .05 * math.sin(t * 7 + seed) + .03 * math.cos(t * 13 + seed))
            x0, z0 = cx + sx * r * math.cos(t), cz + sz * r * math.sin(t)
            y0 = height * yy
            q = Vector((x0 * .3, y0 * .09, z0 * .3))
            col = ridged(q + Vector((seed, 0, 0)), 3)
            broad = fbm(Vector((x0 * .12, y0 * .1, z0 * .12)) + Vector((0, seed, 0)), 3)
            bed = math.sin(y0 * 2.6 + broad * 3)
            ramp = min(1, yy * 6 + .2)
            d_old = 0 if top else (.75 * (col - .55) + .9 * broad + .18 * smoothstep(.6, 1., bed)) * ramp
            off, crack, under, ltop = strata(x0, y0, z0, seed, amp=1.35) if not top else (0, 0, 0, 0)
            d = 0 if top else .8 * d_old + off * ramp * smoothstep(.02, .14, yy)
            if -1.6 < x0 < 12.0 and z0 > -6.9:
                d_old = min(d_old, 0) - .12  # keep the mountain stair clear
                d = min(d, 0) - .12
            nx, nz = math.cos(t) / sx, math.sin(t) / sz
            nl = math.hypot(nx, nz)
            nx, nz = nx / nl, nz / nl
            y = y0 + (0 if top or bottom else .18 * math.sin(t * 3 + seed) * (1 - yy) + .1 * broad)
            cav = clamp(.5 + 1.0 * (col - .55) + .6 * broad)
            colour = rock_shade(cav, crack * ramp, under * ramp, yy, broad * 2)
            return (x0 + nx * d, y, z0 + nz * d), (x0 + nx * d_old, z0 + nz * d_old), colour, (nx, nz), ltop * ramp

        # Planting spots follow the v3 sampling exactly (same count and order), lifted onto the new surface.
        L0, S0 = 22, 180
        for j in range(L0 + 1):
            for i in range(S0):
                if not (3 < j < L0 - 3 and i % 7 == (j * 3) % 7):
                    continue
                t = i * TAU / S0
                p, (xo, zo), _c, (nx, nz), _l = surface(t, j / L0 * (len(levels) - 1), False, j == 0)
                if not (-1.8 < xo < 12.2 and zo > -7.4):
                    # v3 position (drives selection, so every other plant keeps its place) and v9 surface position.
                    spots['mountain'].append((xo, p[1], zo, math.atan2(nz, nx)))
                    spots.setdefault('mountain_v9', []).append((p[0], p[1], p[2], math.atan2(nz, nx)))
        # Finer mesh for the bedding detail.
        segments, L = 264, 46
        v, c = [], []
        for j in range(L + 1):
            for i in range(segments):
                p, _o, colour, _n, ltop = surface(i * TAU / segments, j / L * (len(levels) - 1), j == L, j == 0)
                v.append(p)
                c.append(colour)
                if 0 < j < L - 2 and ltop > .5 and i % 2 == j % 2:
                    spots.setdefault('ledges', []).append((p[0], p[1], p[2], i * TAU / segments, ltop))
        f = [(j * segments + i, (j + 1) * segments + i, (j + 1) * segments + (i + 1) % segments,
              j * segments + (i + 1) % segments) for j in range(L) for i in range(segments)]
        f.append(tuple(range((L + 1) * segments - 1, L * segments - 1, -1)))
        add('PalaceMountain', 'Basalt', v, f, c)
        for k in range(30 if sx > 5 else 14):
            t = k * 2.399963 + seed
            yy = R.uniform(.12, .78)
            rr = 1.12 - .51 * yy
            x, z = cx + sx * rr * math.cos(t), cz + sz * rr * math.sin(t)
            if -1.8 < x < 12.2 and z > -7.3:
                continue
            put_rock('MountainCrags', 'RockLight' if k % 3 else 'RockDark', (x, height * yy, z),
                     (R.uniform(.6, 1.2), R.uniform(.9, 1.8), R.uniform(.65, 1.15)), seed * 100 + k,
                     level=3, sharp=1.25, strata=.2, taper=.35, lean=(.08, -.05))

    ridge(7, -9, 7.6, 4.4, 6.78, 13)
    ridge(.5, -10.5, 3.9, 2.8, 3.08, 17)
    ridge(13, -9.7, 3.8, 2.75, 4.17, 21)
    for i, (x, y, z) in enumerate([(17, 1.3, -7), (11, 6.2, -12), (2, 4.2, -12), (1.4, 2.5, -7.8),
                                   (3.1, 4, -6.5), (10.9, 3.8, -6.6), (13, 2.6, -8), (5, 5.8, -11.7),
                                   (0, 1.7, -11.4)]):
        if -1.8 < x < 12.2 and z > -7.3:
            continue
        put_rock('RootLedges', 'RockLight', (x, y - .42, z), (.8, .6, .75), 4000 + i, level=3, sharp=.5)

    # ---------------------------------------------------- grass tufts
    for i in range(2600):
        t = R.uniform(0, TAU)
        a = R.uniform(.12, .97)
        x, z = lake_point(t)
        o = outline(t)
        ox, oz = 23.5 * o * math.cos(t), 13.6 * o * math.sin(t)
        x, z = x * (1 - a) + ox * a, z * (1 - a) + oz * a
        if channel_bed(x, z) < .3:
            continue
        if (abs(x + 18) < 3.7 and abs(z - 3) < 3) or (abs(x - 13) < 3 and abs(z - 5.8) < 2.2):
            continue
        y = shelf_height(t, a, x, z) + .01
        for k in range(6):
            ang = R.uniform(0, TAU)
            h = R.uniform(.1, .36) * (1.3 if i % 9 == 0 else 1)
            w = .013
            dx, dz = math.cos(ang), math.sin(ang)
            v = [(x - dz * w, y, z + dx * w), (x + dz * w, y, z - dx * w),
                 (x + dx * .06, y + h * .55, z + dz * .06), (x + dx * .16, y + h, z + dz * .16)]
            add('ShoreGrasses', ('GrassDry' if i % 5 == 0 else 'Grass') if (i + k) % 4 else 'LeafLight', v, [(0, 1, 2), (0, 2, 3)],
                [(.55, .6, .5), (.55, .6, .5), (.9, .95, .85), (1.1, 1.1, 1.0)])
    return spots
