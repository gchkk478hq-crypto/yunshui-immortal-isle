"""v4 architecture in the Suzhou garden manner (Y-up metres).

White plaster walls with grey skirting, dark grey tiles on hip-and-gable
roofs with plastered gables and steeply upswept corners, slender chestnut
columns, lattice friezes (挂落) and curved-back benches (美人靠) in open
pavilions, lattice doors and leak windows in halls, granite bridges, a
landing at the mountain foot, a stair cut across the mountain face, and a
white cloud wall with a moon gate.
"""
import math

from mathutils import Vector

from geom_v3 import ground_height, rock, smoothstep
from mathutils import noise
from rockface_v9 import rock_shade, strata

STAIR_FACE = []  # (x, y, z) along the top of the v9 stair rock face, for planting

# Circulation: west shore -> zigzag bridge -> lake pavilion -> arch bridge ->
# landing -> stair across the mountain face -> palace terrace.
ZIGZAG = [(-15.9, -3.5), (-14.4, -2.6), (-12.9, -3.6), (-11.4, -2.7), (-10.25, -3.1)]
ARCH_X0, ARCH_X1, ARCH_Z = -5.75, -1.0, -3.6
LANDING = (-1.2, 3.0, -6.3, -2.8, .5)          # x0, x1, z0, z1, top y
STAIR_Z, STAIR_W = -5.0, 1.3
STAIR_X0, STAIR_X1, STAIR_Y0, STAIR_Y1 = -0.2, 10.6, .5, 7.0


def build_architecture(add, box, slab, rod, ell, polyline, band):
    def grey(v):
        return [(v, v, v)] * 8

    # ------------------------------------------------------------ roofs
    def roof(n, x, y, z, w, d, rise, gable=.55):
        rings, side_seg = 16, 16
        seg = side_seg * 4
        top, under = [], []

        def hx(t):
            tt = min(t, gable)
            return w / 2 * ((1 - tt) + .3 * tt)

        def ry(t):
            return y + rise * t ** 1.6

        for j in range(rings + 1):
            t = j / rings
            for i in range(seg):
                a = i / side_seg
                side = int(a)
                u = (a - side) * 2 - 1
                if side == 0: xx, zz = 1, u
                elif side == 1: xx, zz = -u, 1
                elif side == 2: xx, zz = -1, -u
                else: xx, zz = u, -1
                c = abs(u) ** 5
                ext = 1 + .13 * c * (1 - t) ** 2
                X = xx * hx(t) * ext
                Z = zz * d / 2 * (1 - t) * ext
                yy = ry(t) + rise * .55 * c * (1 - t) ** 2.6
                top.append((x + X, yy, z + Z))
                under.append((x + X * .992, yy - (.13 * (1 - t) + .07), z + Z * .992))
        q = [(j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i)
             for j in range(rings) for i in range(seg)]
        add(n, 'Roof', top, q, [(.78 + .22 * j / rings,) * 3 for j in range(rings + 1) for i in range(seg)])
        add(n, 'RoofUnder', under, q, [(.55 + .45 * j / rings,) * 3 for j in range(rings + 1) for i in range(seg)])
        fascia = top[:seg] + under[:seg]
        add(n, 'RoofRidge', fascia, [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)])
        band(n, 'RoofRidge', [top[i] for i in range(seg)] + [top[0]], .07, .05)
        # Plastered gables (山花) where the hip turns vertical.
        hg, zg, yg, yt = hx(gable), d / 2 * (1 - gable), ry(gable), ry(1)
        for s in (-1, 1):
            add(n, 'Plaster', [(x + s * (hg + .015), yg + .02, z - zg * .92), (x + s * (hg + .015), yg + .02, z + zg * .92),
                               (x + s * (hg + .015), yt - .02, z)], [(0, 1, 2)], [(.8, .8, .78)] * 3)
            band(n, 'RoofRidge', [(x + s * (hg + .03), yg, z - zg), (x + s * (hg + .03), yt + .04, z), (x + s * (hg + .03), yg, z + zg)], .07, .1)
        # Hip ridges sweep out and up into slender 嫩戗 tips.
        gj = int(round(gable * rings))
        for ci in (0, side_seg, side_seg * 2, side_seg * 3):
            pts = [(top[j * seg + ci][0], top[j * seg + ci][1] + .05, top[j * seg + ci][2]) for j in range(gj + 1)]
            e, o = Vector(pts[0]), Vector(pts[1])
            out = e - o
            out.y = 0
            out.normalize()
            tip = [tuple(e + out * .25 + Vector((0, .16, 0))), tuple(e + out * .42 + Vector((0, .45, 0))),
                   tuple(e + out * .47 + Vector((0, .68, 0)))]
            band(n, 'RoofRidge', list(reversed(pts)) + tip, .08, .1)
        band(n, 'RoofRidge', [(x - hg - .05, yt + .08, z), (x + hg + .05, yt + .08, z)], .13, .2)
        for s in (-1, 1):
            polyline(n, 'RoofRidge', [(x + s * (hg + .04), yt + .1, z), (x + s * (hg + .2), yt + .25, z),
                                      (x + s * (hg + .26), yt + .5, z), (x + s * (hg + .2), yt + .62, z)], .045, seg=5)

    def round_roof(n, x, y, z, r, rise):
        """Pyramidal (攒尖) roof for the small hexagonal lake pavilion."""
        sides, rings = 6, 14
        top, under = [], []
        per = 8
        for j in range(rings + 1):
            t = j / rings
            for i in range(sides * per):
                a = i / (sides * per) * math.tau
                k = (i % per) / per
                c = abs(k * 2 - 1) ** 5
                rr = r * (1 - t) * (1 + .12 * c * (1 - t) ** 2) / math.cos(math.pi / sides * (k * 2 - 1))
                yy = y + rise * t ** 1.5 + rise * .5 * c * (1 - t) ** 2.6
                top.append((x + math.cos(a) * rr, yy, z + math.sin(a) * rr))
                under.append((x + math.cos(a) * rr * .99, yy - (.11 * (1 - t) + .05), z + math.sin(a) * rr * .99))
        m = sides * per
        q = [(j * m + i, j * m + (i + 1) % m, (j + 1) * m + (i + 1) % m, (j + 1) * m + i) for j in range(rings) for i in range(m)]
        add(n, 'Roof', top, q)
        add(n, 'RoofUnder', under, q)
        band(n, 'RoofRidge', [top[i] for i in range(m)] + [top[0]], .07, .05)
        for s in range(sides):
            ci = s * per
            pts = [(top[j * m + ci][0], top[j * m + ci][1] + .04, top[j * m + ci][2]) for j in range(rings + 1)]
            e, o = Vector(pts[0]), Vector(pts[1])
            out = e - o
            out.y = 0
            out.normalize()
            tip = [tuple(e + out * .22 + Vector((0, .15, 0))), tuple(e + out * .36 + Vector((0, .42, 0))), tuple(e + out * .4 + Vector((0, .6, 0)))]
            band(n, 'RoofRidge', list(reversed(pts)) + tip, .07, .09)
        rod(n, 'RoofRidge', (x, y + rise, z), (x, y + rise + .35, z), .07, .03, seg=8)
        ell(n, 'RoofRidge', (x, y + rise + .28, z), (.1, .08, .1), 8, 5)

    # ------------------------------------------------------- carpentry
    def guaiuo(n, a, b, y, depth=.32):
        """挂落: lattice frieze hanging under the beam between two columns."""
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        d = (b - a).normalized()
        box_frame = [(a + d * .02, b - d * .02)]
        for p, q in box_frame:
            slab(n, 'Chestnut', (p.x, y - depth, p.z), (q.x, y - depth, q.z), .035, .05)
            slab(n, 'Chestnut', (p.x, y - .04, p.z), (q.x, y - .04, q.z), .04, .05)
        steps = max(4, int(L / .13))
        for i in range(1, steps):
            p = a + d * (L * i / steps)
            hgt = depth * (.55 if i % 2 else 1.0)
            box(n, 'Chestnut', (p.x, y - hgt / 2 - .02, p.z), (.022 if abs(d.x) > .5 else .04, hgt - .04, .04 if abs(d.x) > .5 else .022))
        mid = depth * .55
        slab(n, 'Chestnut', (a.x, y - mid, a.z), (b.x, y - mid, b.z), .022, .04)
        for e, s in ((a, 1), (b, -1)):
            # 雀替: small corner brace at each column.
            p0 = e + d * s * .02
            polyline(n, 'Chestnut', [tuple(p0 + Vector((0, -depth - .02, 0))), tuple(p0 + d * s * .22 + Vector((0, -depth - .02, 0))),
                                     tuple(p0 + Vector((0, -depth - .2, 0)))], .02, seg=4)

    def meirenkao(n, a, b, y, outward):
        """美人靠: bench with a curved back of slender balusters leaning outwards."""
        a, b = Vector(a), Vector(b)
        o = Vector(outward).normalized()
        L = (b - a).length
        d = (b - a).normalized()
        slab(n, 'Chestnut', (a.x, y + .42, a.z), (b.x, y + .42, b.z), .05, .34)
        for i in range(max(2, int(L / .6)) + 1):
            p = a + d * (L * i / max(2, int(L / .6)))
            box(n, 'Chestnut', (p.x, y + .21, p.z), (.06, .42, .06))
        slab(n, 'Chestnut', (a.x, y + .05, a.z), (b.x, y + .05, b.z), .06, .26)
        count = max(4, int(L / .11))
        tops = []
        for i in range(count + 1):
            p = a + d * (L * i / count) + o * .14
            p0 = p + Vector((0, y + .47, 0))
            p1 = p + o * .12 + Vector((0, y + .7, 0))
            p2 = p + o * .26 + Vector((0, y + .88, 0))
            polyline(n, 'Chestnut', [tuple(p0), tuple(p1), tuple(p2)], .012, seg=4)
            tops.append(tuple(p2))
        polyline(n, 'Chestnut', tops[::max(1, len(tops) // 8)] + [tops[-1]], .028, seg=6)

    def lantern(x, y, z):
        nm = 'LanternGroup'
        rod(nm, 'Chestnut', (x, y + .45, z), (x, y + .05, z), .018, seg=4)
        ell(nm, 'Light', (x, y - .16, z), (.14, .22, .14), 10, 6)
        for hh in [-.36, .06]:
            ell(nm, 'Chestnut', (x, y + hh, z), (.15, .035, .15), 8, 3)
        rod(nm, 'Chestnut', (x, y - .38, z), (x, y - .58, z), .012, seg=4)

    def lattice_door(n, x0, x1, y0, y1, z, side, axis='x'):
        """长窗 panel: chestnut frame, paper lattice above, solid board below."""
        def P(u, v, off=0):
            return (u, v, z + side * off) if axis == 'x' else (z + side * off, v, u)
        cx, w, h = (x0 + x1) / 2, x1 - x0, y1 - y0
        sz = lambda a, b, c: (a, b, c) if axis == 'x' else (c, b, a)
        box(n, 'Chestnut', P(cx, y0 + h / 2, .0), sz(w, h, .05))
        box(n, 'Light', P(cx, y0 + h * .64, .03), sz(w * .8, h * .5, .02))
        box(n, 'Chestnut', P(cx, y0 + h * .2, .035), sz(w * .78, h * .24, .02))
        for k in range(5):
            box(n, 'Chestnut', P(x0 + w * (k + 1) / 6, y0 + h * .64, .045), sz(.014, h * .5, .015))
        for k in range(7):
            box(n, 'Chestnut', P(cx, y0 + h * (.4 + .48 * (k + 1) / 8), .045), sz(w * .8, .014, .015))

    def leak_window(n, x, y, z, side, axis, r=.36):
        """漏窗: grey framed opening with lattice, set into the white wall."""
        pts = []
        for k in range(25):
            a = k / 24 * math.tau
            u, v = math.cos(a) * r, math.sin(a) * r
            pts.append((x + u, y + v, z + side * .03) if axis == 'x' else (z + side * .03, y + v, x + u))
        band(n, 'WallBase', pts, .07, .05)
        if axis == 'x':
            box(n, 'Shadow', (x, y, z + side * .01), (r * 1.6, r * 1.6, .02))
        else:
            box(n, 'Shadow', (z + side * .01, y, x), (.02, r * 1.6, r * 1.6))
        for k in range(-3, 4):
            for diag in (1, -1):
                p0 = (x + k * .1 - r * .55, y - r * .55 * diag)
                p1 = (x + k * .1 + r * .55, y + r * .55 * diag)
                if abs(k) > 2:
                    continue
                if axis == 'x':
                    rod(n, 'WallBase', (p0[0], p0[1], z + side * .035), (p1[0], p1[1], z + side * .035), .012, seg=4)
                else:
                    rod(n, 'WallBase', (z + side * .035, p0[1], p0[0]), (z + side * .035, p1[1], p1[0]), .012, seg=4)

    # ------------------------------------------------------- buildings
    def plinth(n, x, y, z, w, d, tiers=2):
        box(n, 'Stone', (x, y - .3, z), (w + .9, .22, d + .9), grey(.72))
        if tiers > 1:
            box(n, 'Stone', (x, y - .1, z), (w + .6, .2, d + .6))
        box(n, 'Paving', (x, y + .01, z), (w + .5, .03, d + .5))

    def pavilion(n, x, y, z, w, d, h, closed=False, levels=1, base=True, benches=(), friezes=True, roof_scale=1.0):
        if base:
            plinth(n, x, y, z, w, d)
        else:
            box(n, 'Chestnut', (x, y + .03, z), (w + .3, .08, d + .3))
        xs = [-w / 2 + .18, w / 2 - .18]
        if w > 3.8:
            xs = [-w / 2 + .18, -w / 6, w / 6, w / 2 - .18]
        zs = [-d / 2 + .18, d / 2 - .18]
        for xx in xs:
            for zz in zs:
                rod(n, 'Chestnut', (x + xx, y, z + zz), (x + xx, y + h, z + zz), .1, .09, seg=10)
                rod(n, 'Stone', (x + xx, y, z + zz), (x + xx, y + .12, z + zz), .15, .13, seg=10)
        beam_y = y + h - .18
        for zz in zs:
            box(n, 'Chestnut', (x, beam_y, z + zz), (w, .2, .14))
        for xx in (xs[0], xs[-1]):
            box(n, 'Chestnut', (x + xx, beam_y, z), (.14, .2, d))
        # Simplified bracket row: plain chestnut blocks, no paint.
        for zz in zs:
            for k in range(int(w / .5) + 1):
                box(n, 'Chestnut', (x - w / 2 + k * w / int(w / .5), y + h - .03, z + zz), (.12, .1, .2))
        if closed:
            box(n, 'WallBase', (x, y + .22, z), (w - .3, .44, d - .3))
            box(n, 'Plaster', (x, y + .44 + (h - .44) * .47, z), (w - .34, (h - .44) * .94, d - .34),
                [(.86, .86, .84)] * 4 + [(1, 1, 1)] * 4)
            # Front and back: rows of lattice doors between the columns.
            for side in (-1, 1):
                zz = z + side * (d / 2 - .16)
                bays = [(xs[i], xs[i + 1]) for i in range(len(xs) - 1)]
                for a0, a1 in bays:
                    panels = 4 if a1 - a0 > 1.2 else 2
                    for p in range(panels):
                        u0 = x + a0 + .1 + (a1 - a0 - .2) * p / panels
                        u1 = x + a0 + .1 + (a1 - a0 - .2) * (p + 1) / panels
                        lattice_door(n, u0 + .01, u1 - .01, y + .02, y + h - .32, zz, side, 'x')
            for side in (-1, 1):
                leak_window(n, z, y + h * .55, x + side * (w / 2 - .16), side, 'z', r=min(.42, d * .14))
        if friezes and not closed:
            for zz in zs:
                for i in range(len(xs) - 1):
                    guaiuo(n, (x + xs[i] + .1, 0, z + zz), (x + xs[i + 1] - .1, 0, z + zz), beam_y - .1)
            for xx in (xs[0], xs[-1]):
                guaiuo(n, (x + xx, 0, z + zs[0] + .1), (x + xx, 0, z + zs[1] - .1), beam_y - .1)
        for (a, b, outward) in benches:
            meirenkao(n, (x + a[0], 0, z + a[1]), (x + b[0], 0, z + b[1]), y, outward)
        for zz in zs[1:]:
            for xx in (-w * .28, w * .28):
                lantern(x + xx, y + h - .45, z + zz)
        roof(n, x, y + h + .08, z, (w + 1.6) * roof_scale, (d + 1.5) * roof_scale, .3 * (w + 1.6) * roof_scale)
        if levels > 1:
            pavilion(n, x, y + h + 1.05, z, w * .7, d * .7, h * .78, True, levels - 1, base=False)

    def hex_pavilion(n, x, y, z, r, h):
        """Small hexagonal water pavilion (亭) with benches on the open sides."""
        plinth(n, x, y, z, r * 1.7, r * 1.7, tiers=1)
        cols = []
        for k in range(6):
            a = k / 6 * math.tau
            p = (x + math.cos(a) * r, z + math.sin(a) * r)
            cols.append(p)
            rod(n, 'Chestnut', (p[0], y, p[1]), (p[0], y + h, p[1]), .085, .075, seg=10)
            rod(n, 'Stone', (p[0], y, p[1]), (p[0], y + .1, p[1]), .13, .12, seg=10)
        for k in range(6):
            a, b = cols[k], cols[(k + 1) % 6]
            slab(n, 'Chestnut', (a[0], y + h - .25, a[1]), (b[0], y + h - .25, b[1]), .2, .12)
            guaiuo(n, (a[0], 0, a[1]), (b[0], 0, b[1]), y + h - .27, .28)
            mid = ((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - z)
            # Benches on the four sides that do not face a bridge (east/west open).
            if abs(mid[0]) < r * .6:
                ml = math.hypot(*mid)
                meirenkao(n, (a[0], 0, a[1]), (b[0], 0, b[1]), y, (mid[0] / ml, 0, mid[1] / ml))
        round_roof(n, x, y + h + .02, z, r + .75, 1.45)
        for k in (1, 4):
            a = cols[k]
            lantern((a[0] + x) / 2 + (a[0] - x) * .3, y + h - .5, (a[1] + z) / 2 + (a[1] - z) * .3)

    def balustrade(n, pts, h=.7, post=.13):
        for a, b in zip(pts, pts[1:]):
            slab(n, 'Marble', a, b, .1, .22)
            a2 = (a[0], a[1] + .1, a[2]); b2 = (b[0], b[1] + .1, b[2])
            slab(n, 'Marble', a2, b2, h * .5, .07)
            rod(n, 'Marble', (a2[0], a2[1] + h * .74, a2[2]), (b2[0], b2[1] + h * .74, b2[2]), .042, seg=6)
        for p in pts:
            box(n, 'Marble', (p[0], p[1] + .1 + h * .47, p[2]), (post, h * .94, post))
            ell(n, 'Marble', (p[0], p[1] + .1 + h + .03, p[2]), (post * .6, post * .8, post * .6), 7, 4)

    def subdivide(a, b, step=.6):
        a, b = Vector(a), Vector(b)
        count = max(1, int((b - a).length / step))
        return [tuple(a + (b - a) * i / count) for i in range(count + 1)]

    # Music pavilion: open 亭 with benches on three sides; front (lake side) open for the view.
    pavilion('MusicPavilion', -18, .7, 3, 6.3, 5.2, 4.65, False,
             benches=[((-3.0, -2.45), (3.0, -2.45), (0, 0, -1)), ((-3.0, -2.3), (-3.0, 2.3), (-1, 0, 0)),
                      ((-3.0, 2.45), (-1.0, 2.45), (0, 0, 1)), ((1.1, 2.45), (3.0, 2.45), (0, 0, 1))])
    # 水榭 half over the water, with a small deck towards the lake.
    pavilion('LakesidePavilion', 13, .45, 5.8, 4.4, 3.2, 2.5, True)
    box('Boardwalk', 'Paving', (10.1, .44, 5.8), (1.6, .12, 2.4))
    for zz in (4.65, 6.95):
        for xx in (9.35, 10.85):
            rod('Boardwalk', 'Stone', (xx, .4, zz), (xx, -.6, zz), .12, seg=8)
    balustrade('Boardwalk', [(10.85, .5, 4.6), (9.3, .5, 4.6), (9.3, .5, 7.0), (10.85, .5, 7.0)], .55, .1)
    hex_pavilion('LakePavilion', -8, .48, -3, 1.55, 2.35)
    pavilion('WestGardenHall', -13, .6, -7.3, 4.2, 3.5, 2.6, True, 2)

    terraces = [(7, 7, -9, 7, 5.5), (1, 3.3, -10.5, 4.7, 3.6), (13, 4.4, -9.7, 4.5, 3.6)]
    for x, y, z, w, d in terraces:
        box('PalaceTerraces', 'Stone', (x, y - .3, z), (w + 1.1, .6, d + .9), [(.7, .7, .68)] * 4 + [(1, 1, 1)] * 4)
        hx, hz = w / 2 + .5, d / 2 + .4
        front = subdivide((x - hx, y, z + hz), (x + hx, y, z + hz), .62)
        if x == 7:
            # Opening where the mountain stair arrives on the terrace.
            front = subdivide((x - hx, y, z + hz), (STAIR_X1 - .62, y, z + hz), .62)
        balustrade('PalaceTerraces', front)
        balustrade('PalaceTerraces', subdivide((x - hx, y, z - hz), (x + hx, y, z - hz), .62))
        balustrade('PalaceTerraces', subdivide((x - hx, y, z - hz), (x - hx, y, z + hz), .62))
        balustrade('PalaceTerraces', subdivide((x + hx, y, z - hz), (x + hx, y, z + hz), .62))
        pavilion('Palace', x, y, z, w, d, 3.1 if x == 7 else 2.7, True, 3 if x == 7 else 2)

    # ------------------------------------------------ landing and stair
    x0, x1, z0, z1, ly = LANDING
    box('MountainStair', 'Stone', ((x0 + x1) / 2, ly - .55, (z0 + z1) / 2), (x1 - x0, 1.1, z1 - z0), [(.55, .55, .53)] * 4 + [(.9, .9, .88)] * 4)
    box('MountainStair', 'Paving', ((x0 + x1) / 2, ly + .01, (z0 + z1) / 2), (x1 - x0 - .1, .03, z1 - z0 - .1))
    for k in range(2):
        box('MountainStair', 'Stone', ((x0 + x1) / 2 + .6, ly - .2 - k * .2, z1 + .2 + k * .3), (2.4, .2, .3))
    balustrade('MountainStair', [(x0 + .1, ly, z1 - .1), (x0 + .1, ly, ARCH_Z + 1.0)], .5, .1)
    balustrade('MountainStair', [(x0 + .1, ly, ARCH_Z - 1.0), (x0 + .1, ly, z0 + .1)], .5, .1)

    # One straight flight with two rest landings, cut across the mountain face.
    rise = STAIR_Y1 - STAIR_Y0
    steps = int(round(rise / .2))
    land_at = (steps // 3, 2 * steps // 3)
    run = STAIR_X1 - STAIR_X0
    tread = (run - 2 * .8) / steps
    xcur, ycur = STAIR_X0, STAIR_Y0
    profile = [(xcur, ycur)]
    for k in range(steps):
        ycur += rise / steps
        x_next = xcur + tread
        # Deep blocks: their undersides stay buried in the rock or below the water.
        box('MountainStair', 'Stone', ((xcur + x_next) / 2, ycur - 1.6, STAIR_Z - .5),
            (tread + .005, 3.2, STAIR_W + 1.0), [(.5, .5, .48)] * 4 + [(1, 1, 1)] * 4)
        xcur = x_next
        profile.append((xcur, ycur))
        if k + 1 in land_at:
            box('MountainStair', 'Stone', (xcur + .4, ycur - 1.6, STAIR_Z - .5), (.8, 3.2, STAIR_W + 1.0), [(.5, .5, .48)] * 4 + [(1, 1, 1)] * 4)
            xcur += .8
            profile.append((xcur, ycur))
    box('MountainStair', 'Stone', (STAIR_X1 + .1, STAIR_Y1 - 1.6, -5.25), (1.2, 3.2, 1.7))
    # v9: a natural bedded rock face below the outer parapet (replaces the row of round boulders).
    # It hides the stepped stair blocks and flares out at the foot so the stair reads as cut into the mountain.
    face_z = STAIR_Z + STAIR_W / 2 + .03
    xs = [STAIR_X0 - .35 + k * .06 for k in range(int((STAIR_X1 - STAIR_X0 + .7) / .06) + 1)]

    def stair_top(x):
        px = [p[0] for p in profile]
        py = [p[1] for p in profile]
        if x <= px[0]:
            return py[0]
        for (xa, ya), (xb, yb) in zip(profile, profile[1:]):
            if xa <= x <= xb:
                return ya + (yb - ya) * (x - xa) / max(1e-6, xb - xa)
        return py[-1]
    rows = 112
    fv, fc = [], []
    for j in range(rows + 1):
        v = j / rows
        for x in xs:
            top = stair_top(x) - .14
            depth = max(3.4, top + .5)  # reach down to the water so no stepped block shows
            y = top - v * depth
            off, crack, under, _lt = strata(x, y, face_z, 31, amp=.6)
            flare = .05 + .55 * smoothstep(.25, 1.0, v) ** 1.5
            ends = smoothstep(STAIR_X0 - .4, STAIR_X0 + .5, x) * (1 - smoothstep(STAIR_X1 - .2, STAIR_X1 + .4, x))
            z = face_z + max(0.0, off + .1) * (.35 + .65 * smoothstep(.0, .12, v)) + flare * ends
            fv.append((x, y, z))
            fc.append(rock_shade(.55 + .4 * noise.noise(Vector((x * .5, y * .5, 1.3))), crack, under, 1 - v, 0))
    n = len(xs)
    ff = [(j * n + i, (j + 1) * n + i, (j + 1) * n + i + 1, j * n + i + 1) for j in range(rows) for i in range(n - 1)]  # faces +z
    add('MountainStair', 'Basalt', fv, ff, fc)
    STAIR_FACE.extend((x, stair_top(x) - .14, face_z) for x in xs[::5])
    # Low outer parapet following the stair.
    para = [(px, py, STAIR_Z + STAIR_W / 2 + .02) for px, py in profile[::3]] + [(profile[-1][0], profile[-1][1], STAIR_Z + STAIR_W / 2 + .02)]
    for a, b in zip(para, para[1:]):
        slab('MountainStair', 'Stone', (a[0], a[1] - .1, a[2]), (b[0], b[1] - .1, b[2]), .55, .18)
        slab('MountainStair', 'Stone', (a[0], a[1] + .45, a[2]), (b[0], b[1] + .45, b[2]), .06, .24)

    # --------------------------------------------------- arch bridge
    BW = 1.5
    XC = (ARCH_X0 + ARCH_X1) / 2
    H = (ARCH_X1 - ARCH_X0) / 2
    A, B, AY = 1.3, 1.08, .02

    def deck(lx):
        u = (lx + H) / (2 * H)
        return .52 + 1.12 * math.sin(math.pi * u) ** 1.2

    def arch(lx):
        return AY + B * math.sqrt(max(0, 1 - (lx / A) ** 2))

    n = 'CentralBridge'
    xs = sorted(set([-H + 2 * H * i / 44 for i in range(45)] + [A * math.cos(math.pi * i / 24) for i in range(25)]))
    for side in (-1, 1):
        zf = ARCH_Z + side * BW / 2
        v, f, c = [], [], []
        for lx in xs:
            bot = arch(lx) if abs(lx) < A - 1e-6 else (AY if abs(abs(lx) - A) < 1e-6 else -.6)
            v += [(XC + lx, bot, zf), (XC + lx, deck(lx) - .02, zf)]
            c += [(.6, .62, .6) if bot < .5 else (.82, .82, .8), (1, 1, 1)]
        for i in range(len(xs) - 1):
            f.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
        add(n, 'Marble', v, f, c)
    v, c = [], []
    inner = [A * math.cos(math.pi * i / 30) for i in range(31)]
    for lx in inner:
        yv = arch(lx)
        v += [(XC + lx, yv, ARCH_Z - BW / 2), (XC + lx, yv, ARCH_Z + BW / 2)]
        c += [(.52, .55, .53)] * 2
    add(n, 'Marble', v, [(2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2) for i in range(len(inner) - 1)], c)
    for s in (-1, 1):
        lo, hi = sorted((s * A, s * H))
        box(n, 'Marble', (XC + (lo + hi) / 2, -.3, ARCH_Z), (hi - lo, .6, BW - .01), grey(.55))
    steps_b = 26
    for k in range(steps_b):
        la, lb = -H + 2 * H * k / steps_b, -H + 2 * H * (k + 1) / steps_b
        box(n, 'Marble', (XC + (la + lb) / 2, deck((la + lb) / 2) - .06, ARCH_Z), (lb - la + .005, .12, BW - .22))
    for side in (-1, 1):
        ring = [(XC + A * 1.05 * math.cos(math.pi * i / 26), AY + B * 1.06 * math.sin(math.pi * i / 26), ARCH_Z + side * (BW / 2 + .03)) for i in range(27)]
        band(n, 'Marble', ring, .06, .17)
        box(n, 'Marble', (XC, AY + B * 1.07, ARCH_Z + side * (BW / 2 + .035)), (.24, .3, .07))
    count = 12
    for side in (-1, 1):
        zz = ARCH_Z + side * (BW / 2 - .09)
        pts = [(XC - H + 2 * H * i / count, deck(-H + 2 * H * i / count), zz) for i in range(count + 1)]
        balustrade(n, pts, .6, .12)
        for e in (0, -1):
            p = pts[e]
            o = -1 if e == 0 else 1
            rod(n, 'Marble', (p[0] + o * .26, p[1] + .22, zz - .06), (p[0] + o * .26, p[1] + .22, zz + .06), .2, seg=12)

    # --------------------------------------------------- zigzag bridge
    for (ax, az), (bx, bz) in zip(ZIGZAG, ZIGZAG[1:]):
        slab('ZigzagBridge', 'Marble', (ax, .3, az), (bx, .3, bz), .14, 1.0)
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz)
        nx, nz = -dz / L * .46, dx / L * .46
        for s in (-1, 1):
            pts = subdivide((ax + s * nx, .44, az + s * nz), (bx + s * nx, .44, bz + s * nz), .7)
            for a, b in zip(pts, pts[1:]):
                rod('ZigzagBridge', 'Marble', (a[0], a[1] + .4, a[2]), (b[0], b[1] + .4, b[2]), .035, seg=6)
            for p in pts:
                box('ZigzagBridge', 'Marble', (p[0], p[1] + .22, p[2]), (.1, .44, .1))
    for (px, pz) in ZIGZAG[1:-1]:
        box('ZigzagBridge', 'Stone', (px, -.15, pz), (1.1, .9, 1.1), grey(.6))
    for k in range(len(ZIGZAG) - 1):
        mx = (ZIGZAG[k][0] + ZIGZAG[k + 1][0]) / 2
        mz = (ZIGZAG[k][1] + ZIGZAG[k + 1][1]) / 2
        box('ZigzagBridge', 'Stone', (mx, -.2, mz), (.5, .8, .9), grey(.6))

    # Stepping stones from the bridge head to the music pavilion.
    path = [(-15.9, -3.5), (-16.4, -2.7), (-16.8, -1.9), (-17.0, -1.1), (-17.2, -.4)]
    for i in range(len(path) - 1):
        for k in range(2):
            t = k / 2
            px = path[i][0] + (path[i + 1][0] - path[i][0]) * t
            pz = path[i][1] + (path[i + 1][1] - path[i][1]) * t
            gy = ground_height(px, pz)
            ell('SteppingStones', 'Stone', (px + .05 * math.sin(i * 3 + k), gy + .02, pz), (.26 + .04 * math.sin(i + k), .045, .2), 9, 3, .08)

    # --------------------------------------------- cloud wall + moon gate
    wall_pts = [(-22.1, -.3), (-21.6, -2.4), (-20.6, -3.9)]
    samples = []
    total = 0.0
    for (ax, az), (bx, bz) in zip(wall_pts, wall_pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        k = int(L / .1)
        for i in range(k):
            t = i / k
            samples.append((ax + (bx - ax) * t, az + (bz - az) * t, total + L * t, (bx - ax) / L, (bz - az) / L))
        total += L
    bx, bz = wall_pts[-1]
    samples.append((bx, bz, total, samples[-1][3], samples[-1][4]))
    gate_s, gate_r = total * .48, .82
    base = min(ground_height(x, z) for x, z, *_ in samples) - .15
    th = .28

    def spans(s):
        top = 2.25 + .22 * math.sin(s * 1.4) + .1 * math.sin(s * 3.1)
        dz = s - gate_s
        if abs(dz) < gate_r:
            dy = math.sqrt(gate_r * gate_r - dz * dz)
            yc = .15 + gate_r
            lo, hi = max(0.0, yc - dy), yc + dy
            res = []
            if lo > .02:
                res.append((0.0, lo))
            res.append((hi, top))
            return res
        return [(0.0, top)]

    v, f, c = [], [], []
    for i in range(len(samples) - 1):
        a, b = samples[i], samples[i + 1]
        sa, sb = spans(a[2]), spans(b[2])
        if len(sa) != len(sb):
            sa = sb = spans((a[2] + b[2]) / 2)
        for (alo, ahi), (blo, bhi) in zip(sa, sb):
            for side in (-1, 1):
                na = (-a[4] * side * th / 2, a[3] * side * th / 2)
                nb = (-b[4] * side * th / 2, b[3] * side * th / 2)
                k = len(v)
                v += [(a[0] + na[0], base + alo, a[1] + na[1]), (b[0] + nb[0], base + blo, b[1] + nb[1]),
                      (b[0] + nb[0], base + bhi, b[1] + nb[1]), (a[0] + na[0], base + ahi, a[1] + na[1])]
                c += [(.62, .62, .6), (.62, .62, .6), (1, 1, 1), (1, 1, 1)]
                f.append((k, k + 1, k + 2, k + 3))
            # Caps on top of each span and under the gate arch.
            for ya, yb in ((ahi, bhi), (alo, blo)):
                if ya < .01:
                    continue
                k = len(v)
                pa1 = (a[0] - a[4] * th / 2, a[1] + a[3] * th / 2); pa2 = (a[0] + a[4] * th / 2, a[1] - a[3] * th / 2)
                pb1 = (b[0] - b[4] * th / 2, b[1] + b[3] * th / 2); pb2 = (b[0] + b[4] * th / 2, b[1] - b[3] * th / 2)
                v += [(pa1[0], base + ya, pa1[1]), (pb1[0], base + yb, pb1[1]), (pb2[0], base + yb, pb2[1]), (pa2[0], base + ya, pa2[1])]
                c += [(.85, .85, .83)] * 4
                f.append((k, k + 1, k + 2, k + 3))
    add('CloudWall', 'Plaster', v, f, c)
    box_pts = [(s[0], base + .22, s[1]) for s in samples[::4]] + [(samples[-1][0], base + .22, samples[-1][1])]
    band('CloudWall', 'WallBase', box_pts, th + .04, .44)
    coping = [(s[0], base + spans(s[2])[-1][1] + .05, s[1]) for s in samples[::3]] + [(samples[-1][0], base + spans(samples[-1][2])[-1][1] + .05, samples[-1][1])]
    band('CloudWall', 'Roof', coping, th + .3, .08)
    band('CloudWall', 'RoofRidge', [(p[0], p[1] + .08, p[2]) for p in coping], .1, .1)
    # Grey brick ring around the moon gate, both faces.
    gi = min(range(len(samples)), key=lambda i: abs(samples[i][2] - gate_s))
    gx, gz, _, tx, tz = samples[gi]
    for side in (-1, 1):
        ring = []
        for k in range(33):
            a = k / 32 * math.tau
            u, yy = math.cos(a) * (gate_r + .04), .15 + gate_r + math.sin(a) * (gate_r + .04)
            if yy < 0:
                continue
            ring.append((gx + tx * u - tz * side * (th / 2 + .01), base + yy, gz + tz * u + tx * side * (th / 2 + .01)))
        band('CloudWall', 'WallBase', ring, .09, .03)
    for s_win in (total * .15, total * .82):
        wi = min(range(len(samples)), key=lambda i: abs(samples[i][2] - s_win))
        wx, wz, _, tx, tz = samples[wi]
        for side in (-1, 1):
            cx, cz = wx - tz * side * (th / 2 + .005), wz + tx * side * (th / 2 + .005)
            pts = [(cx + tx * math.cos(k / 6 * math.tau) * .34, base + 1.35 + math.sin(k / 6 * math.tau) * .34, cz + tz * math.cos(k / 6 * math.tau) * .34) for k in range(7)]
            band('CloudWall', 'WallBase', pts, .06, .04)
            for k in range(-2, 3):
                rod('CloudWall', 'WallBase', (cx + tx * (k * .1 - .2), base + 1.35 - .25, cz + tz * (k * .1 - .2)),
                    (cx + tx * (k * .1 + .2), base + 1.35 + .25, cz + tz * (k * .1 + .2)), .011, seg=4)
                rod('CloudWall', 'WallBase', (cx + tx * (k * .1 + .2), base + 1.35 - .25, cz + tz * (k * .1 + .2)),
                    (cx + tx * (k * .1 - .2), base + 1.35 + .25, cz + tz * (k * .1 - .2)), .011, seg=4)
