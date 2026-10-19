"""v3 vegetation: cloud-pad pines, magnolia, bamboo, willow, maple, shrubs, vines.

Each tree is emitted under its own name prefix (Pine07, Willow01 ...) so the
browser can pivot and sway one tree as a unit.  Colours are baked shading
multipliers (darker interiors and bases, lighter tips).
"""
import math
import random

from geom_v3 import (TAU, Placement, clump, ground_height, in_lake, island_fraction, near_outlet_stream,
                     outline, clear_of_buildings)

PINE_LAYOUT = (
    (-22, 0, 7, 3), (-14, 0, 9.5, 3),
    (-8, 0, 11, 2.7), (-3, 0, 11.8, 2.7), (6, 0, 11.5, 3),
    (16, 0, 8.5, 3.6), (21, 0, 5.4, 3.3), (21, 0, -2, 3.2),
    (17, 1.3, -7, 4), (11, 6.2, -12, 3.8), (2, 4.2, -12, 3.7),
    (-5, 0, -11, 3.5), (-17, 0, -8.2, 3.5), (-2, 0, -8.4, 3),
    (16, 0, 2.9, 3), (1.4, 2.5, -7.8, 2.3), (3.1, 4, -6.5, 2.1),
    (10.9, 3.8, -6.6, 2.5), (13, 2.6, -8, 2.2), (5, 5.8, -11.7, 2.1),
)
MAGNOLIA_LAYOUT = (
    (-14, .05, 4.7, 2.8), (-20, .05, -1, 2.8),
    (-9, .05, -5.5, 2.6), (17, .05, 6.7, 3.1),
    (17, .05, -4.8, 2.8), (0, 1.7, -11.4, 2.8),
)
BAMBOO_LAYOUT = ((19, -5), (-20, -6), (19, 7))
EXTRA_MAPLES = ((-16.9, -5.6, 3.2), (6.4, 9.8, 2.9), (19.6, 1.2, 3.4))
WILLOW_LAYOUT = ((4.3, 10.0, 3.7), (-5.6, 9.75, 3.5), (-17.2, -2.6, 3.4))
MAPLE_LAYOUT = ((-12.5, 7.6, 2.6), (-9.2, -10.2, 2.7), (14.0, 9.9, 2.4))


def build_vegetation(add, rod, ell, polyline, spots=None):
    rng = random.Random(8123)
    spots = spots or {'mountain': [], 'rim': []}
    place = Placement()
    up = (0.0, 1.0, 0.0)

    def plus(a, b):
        return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

    def minus(a, b):
        return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

    def scale(a, s):
        return (a[0] * s, a[1] * s, a[2] * s)

    def length(a):
        return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])

    def unit(a):
        return scale(a, 1.0 / max(length(a), 1e-8))

    def cross(a, b):
        return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

    def mix(a, b, t):
        return plus(scale(a, 1 - t), scale(b, t))

    def offset(p, x=0, y=0, z=0):
        return (p[0] + x, p[1] + y, p[2] + z)

    def frame(direction):
        side = cross(direction, up)
        if length(side) < .05:
            side = cross(direction, (1, 0, 0))
        side = unit(side)
        return side, unit(cross(direction, side))

    def grey(v):
        return (v, v, v)

    def tube(name, material, points, radii, sides=6, flutes=0, caps=True, shade=None):
        vertices, cols = [], []
        for j, (p, radius) in enumerate(zip(points, radii)):
            tangent = unit(minus(points[min(j + 1, len(points) - 1)], points[max(0, j - 1)]))
            side, normal = frame(tangent)
            s = shade[j] if shade else 1.0
            for k in range(sides):
                angle = math.tau * k / sides
                ripple = 1 + flutes * math.sin(k * 2.31 + j * .57)
                delta = plus(scale(side, math.cos(angle)), scale(normal, math.sin(angle)))
                vertices.append(plus(p, scale(delta, radius * ripple)))
                cols.append(grey(s * (.9 + .1 * math.sin(k * 1.7 + j))))
        faces = []
        for j in range(len(points) - 1):
            for k in range(sides):
                a = j * sides + k
                b = j * sides + (k + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        if caps:
            faces.extend((tuple(range(sides - 1, -1, -1)),
                          tuple(range((len(points) - 1) * sides, len(points) * sides))))
        add(name, material, vertices, faces, cols)

    def blade(name, material, base, tip, width, curl=0, roll=0, long=False, dark=.55, light=1.05):
        direction = unit(minus(tip, base))
        side, normal = frame(direction)
        rotated = plus(scale(side, math.cos(roll)), scale(normal, math.sin(roll)))
        normal = unit(cross(rotated, direction))
        center = plus(mix(base, tip, .48), scale(normal, width * .28 + curl))
        mid = (dark + light) / 2
        if long:
            upper = plus(mix(base, tip, .78), scale(normal, curl * .6))
            vertices = [base, plus(center, scale(rotated, width)), plus(center, scale(rotated, -width)),
                        plus(center, scale(normal, width * .30)), plus(upper, scale(rotated, width * .55)),
                        plus(upper, scale(rotated, -width * .55)), tip]
            faces = [(0, 1, 3), (0, 3, 2), (1, 4, 3), (4, 6, 3), (3, 6, 5), (3, 5, 2)]
            cols = [grey(dark), grey(mid), grey(mid), grey(mid), grey(light), grey(light), grey(light)]
        else:
            vertices = [base, plus(center, scale(rotated, width)), plus(center, scale(rotated, -width)),
                        plus(center, scale(normal, width * .42)), tip]
            faces = [(0, 1, 3), (0, 3, 2), (1, 4, 3), (3, 4, 2)]
            cols = [grey(dark), grey(mid), grey(mid), grey(mid), grey(light)]
        add(name, material, vertices, faces, cols)

    def mass(name, material, center, radii, seed, level=3, lumpy=.28, flat=.35, light=(1, 1, 1),
             dark=(.4, .45, .38), cards=0):
        if cards:
            # Small dark core for density, alpha-cut leaf cards for a feathered silhouette.
            v, f, c = clump(center, tuple(r * .56 for r in radii), seed, 2, lumpy, flat, light, dark)
            add(name, material, v, f, [tuple(ch * .55 for ch in col) for col in c])
            cardset(name, material, center, radii, seed, int(cards * 1.6), light, dark)
            return
        v, f, c = clump(center, radii, seed, level, lumpy, flat, light, dark)
        add(name, material, v, f, c)

    def cardset(name, material, center, radii, seed, count, light, dark):
        crng = random.Random(seed * 3 + 1)
        vs, fs, cs, uvs, ns = [], [], [], [], []
        rmean = sum(radii) / 3
        for k in range(count):
            th = crng.uniform(0, TAU)
            yy = crng.uniform(-.35, 1.0)
            ring = math.sqrt(max(0.0, 1 - yy * yy))
            d = (math.cos(th) * ring, yy, math.sin(th) * ring)
            rr = crng.uniform(.3, .92)
            p = (center[0] + d[0] * radii[0] * rr, center[1] + d[1] * radii[1] * rr, center[2] + d[2] * radii[2] * rr)
            size = rmean * crng.uniform(.6, .95)
            nrm = unit(plus(d, (crng.uniform(-.6, .6), crng.uniform(-.3, .6), crng.uniform(-.6, .6))))
            u = unit(cross(nrm, (0, 1, 0))) if abs(nrm[1]) < .95 else (1.0, 0.0, 0.0)
            v = unit(cross(nrm, u))
            roll = crng.uniform(0, TAU)
            u2 = plus(scale(u, math.cos(roll)), scale(v, math.sin(roll)))
            v2 = unit(cross(nrm, u2))
            b0 = len(vs)
            for (a, b), uvp in zip(((-1, -1), (1, -1), (1, 1), (-1, 1)), ((0, 0), (1, 0), (1, 1), (0, 1))):
                q = plus(p, plus(scale(u2, a * size), scale(v2, b * size)))
                vs.append(q)
                uvs.append(uvp)
                out = unit(plus(minus(q, center), (0, rmean * .35, 0)))
                ns.append(out)
                up = min(1.0, max(0.0, .5 + .5 * out[1]))
                cs.append(tuple(dark[i] + (light[i] - dark[i]) * (.35 + .65 * up) for i in range(3)))
            fs.append((b0, b0 + 1, b0 + 2, b0 + 3))
        add(name, material + 'Card', vs, fs, cs, uvs, ns)

    def ground(x, z, y=None):
        return ground_height(x, z) - .04 if not y else y

    # ------------------------------------------------------------- pine
    def pad(name, c, rx, ry, seed, material):
        mass(name, material, c, (rx, ry * 1.25, rx * .88), seed, lumpy=.4, flat=.22,
             light=(1.05, 1.05, 1.0), dark=(.34, .4, .33), cards=10)

    def pine(index, x, y, z, h, small=False, reserve_at=None):
        name = ('Pine%02d' % index)
        prng = random.Random(9000 + index)
        y = ground(x, z, y)
        place.reserve(*(reserve_at or (x, z)), .9 if small else 1.3)
        lean_angle = math.atan2(z, x) + prng.uniform(-.6, .6)
        if small:
            lean_angle = math.atan2(z + 9, x - 7) + prng.uniform(-.4, .4)
        lean = h * prng.uniform(.1, .22)
        lx, lz = math.cos(lean_angle), math.sin(lean_angle)
        px, pz = -lz, lx
        wig = prng.uniform(0, TAU)

        def trunk(t):
            s = .07 * h * math.sin(t * TAU * .75 + wig)
            return (x + lx * lean * t ** 1.4 + px * s, y + h * t, z + lz * lean * t ** 1.4 + pz * s)

        pts = [trunk(j / 12) for j in range(13)]
        radii = [h * (.05 * (1 - j / 12) ** .9 + .008) * (1.5 if j == 0 else 1.15 if j == 1 else 1) for j in range(13)]
        tube(name, 'Bark', pts, radii, 9, .14, shade=[.55 + .45 * j / 12 for j in range(13)])
        for j in range(4):
            a = lean_angle + j * 1.6 + .4
            root = (x + math.cos(a) * h * .16, y + .02, z + math.sin(a) * h * .16)
            tube(name, 'Bark', [root, mix(root, trunk(.06), .5), trunk(.13)], [h * .012, h * .03, h * .035], 5,
                 shade=[.5, .6, .7])
        count = 5 if small else prng.randint(7, 9)
        for b in range(count):
            t = .36 + b / max(1, count - 1) * .52 + prng.uniform(-.03, .03)
            side_bias = 1.0 if b % 3 else -1.0
            angle = lean_angle + side_bias * prng.uniform(.3, 1.9) + (b * 2.399963 if b % 4 == 3 else 0)
            L = h * (.46 - .28 * (t - .36)) * prng.uniform(.82, 1.15)
            origin = trunk(t)
            d = (math.cos(angle), 0, math.sin(angle))
            branch = [plus(origin, (d[0] * L * u, h * (-.05 * math.sin(u * math.pi) + .07 * u * u), d[2] * L * u))
                      for u in (0, .25, .5, .75, 1)]
            tube(name, 'Bark', branch, [h * v for v in (.022, .018, .013, .008, .004)], 6, .06,
                 shade=[.65, .7, .78, .85, .9])
            rx = L * .38 + h * .07
            pad(name, offset(branch[-1], 0, h * .045, 0), rx, rx * .28, 9100 + index * 20 + b,
                'PineLight' if (b + index) % 4 == 0 else 'Pine')
            # Secondary sprays on both sides fill the crown between the main pads.
            for side_k, sgn in enumerate((1, -1)):
                if small and side_k:
                    continue
                a2 = angle + sgn * (.75 + .15 * side_k)
                stem = branch[2 + side_k]
                reach = L * (.3 - .08 * side_k)
                tip = offset(stem, math.cos(a2) * reach, h * .05, math.sin(a2) * reach)
                tube(name, 'Bark', [stem, tip], [h * .007, h * .003], 4, caps=False, shade=[.75, .85])
                pad(name, offset(tip, 0, h * .03, 0), rx * (.7 - .1 * side_k), rx * .22, 9150 + index * 20 + b * 2 + side_k,
                    'PineLight' if (b + side_k + index) % 5 == 0 else 'Pine')
        top = trunk(1.0)
        for k in range(2 if small else 4):
            a = lean_angle + k * 2.2
            r = h * (.2 - k * .03)
            pad(name, offset(top, math.cos(a) * r * .45, -k * h * .05 + h * .02, math.sin(a) * r * .45),
                r, r * .4, 9190 + index * 7 + k, 'Pine' if k else 'PineLight')

    # --------------------------------------------------------- magnolia
    def blossom(name, center, size, yaw, opening):
        size *= 1.25
        for petal in range(6):
            angle = yaw + petal * math.tau / 6
            radial = (math.cos(angle), 0, math.sin(angle))
            tangent = (-math.sin(angle), 0, math.cos(angle))
            vertices, cols = [], []
            for row, (radius, height, width) in enumerate(((.045, 0, .035), (.49 * opening, .43, .29),
                                                           (.77 * opening, .87, .11))):
                for side in (-1, 0, 1):
                    p = plus(center, plus(scale(radial, radius * size), scale(tangent, side * width * size)))
                    vertices.append(offset(p, y=size * (height - abs(side) * .055)))
                    k = row / 2
                    cols.append((1.0, .62 + .38 * k, .74 + .26 * k))
            faces = [(0, 3, 4, 1), (1, 4, 5, 2), (3, 6, 7, 4), (4, 7, 8, 5)]
            add(name, 'BlossomPink' if petal == 0 and opening < .8 else 'Blossom', vertices, faces, cols)
        rod(name, 'WoodLight', center, offset(center, y=size * .39), size * .045, size * .025, seg=4)

    def magnolia(index, x, y, z, h):
        name = 'Magnolia%02d' % index
        y = ground(x, z, y if y > .5 else None)
        place.reserve(x, z, 1.3)
        trunk = [(x, y, z), (x - .025 * h, y + .20 * h, z), (x + .018 * h, y + .39 * h, z + .035 * h),
                 (x + .055 * h, y + .66 * h, z - .015 * h)]
        tube(name, 'Bark', trunk, [h * .045, h * .031, h * .025, h * .012], 8, .08, shade=[.55, .7, .82, .9])
        for limb in range(9):
            angle = limb * 2.399963 + index * .8
            reach = h * rng.uniform(.27, .45)
            origin = trunk[1 if limb < 3 else 2]
            target = (x + reach * math.cos(angle), y + h * rng.uniform(.72, .92), z + reach * math.sin(angle))
            elbow = plus(mix(origin, target, .56), (0, -.075 * h, 0))
            tube(name, 'Bark', [origin, elbow, target], [h * .022, h * .012, h * .0035], 5, shade=[.7, .8, .9])
            for twig in range(7):
                a = angle + (twig - 3) * .28
                base = mix(elbow, target, .15 + twig * .13)
                tip = offset(target, math.cos(a) * h * rng.uniform(.035, .12), h * rng.uniform(.035, .11),
                             math.sin(a) * h * rng.uniform(.035, .12))
                bend = plus(mix(base, tip, .55), (0, -.018 * h, 0))
                tube(name, 'Wood', [base, bend, tip], [h * .005, h * .003, h * .0015], 4)
                blossom(name, tip, h * rng.uniform(.066, .092), a, rng.uniform(.62, 1.0))
                side = offset(mix(bend, tip, .47), -.035 * h * math.sin(a), .016 * h, .035 * h * math.cos(a))
                blossom(name, side, h * .058, a + 1.3, .5)
            # Soft blossom masses read as a full flowering crown from a distance.
            for k in range(3):
                c = offset(mix(elbow, target, .55 + k * .2), rng.uniform(-.06, .06) * h, h * .04, rng.uniform(-.06, .06) * h)
                mass(name, 'Blossom', c, (h * .075, h * .055, h * .075), 8800 + index * 40 + limb * 3 + k, level=2, lumpy=.45,
                     flat=.3, light=(1.05, 1.02, 1.02), dark=(.82, .7, .74), cards=5)
            for j in range(3):
                base = mix(elbow, target, .35 + j * .22)
                a = angle + (-.8 if j % 2 else .8)
                tip = offset(base, math.cos(a) * h * .12, -h * .015, math.sin(a) * h * .12)
                blade(name, 'LeafLight' if j == 0 else 'Leaf', base, tip, h * .025, curl=h * .012, roll=a, long=True)

    # ----------------------------------------------------------- bamboo
    def bamboo(index, x, z):
        name = 'Bamboo%02d' % index
        place.reserve(x, z, 1.4)
        y0 = ground(x, z)
        for culm in range(28):
            theta = culm * 2.399963 + index
            radius = .12 + .9 * math.sqrt(culm / 28)
            xx, zz = x + math.cos(theta) * radius, z + math.sin(theta) * radius
            h = rng.uniform(2.6, 4.0) * (.78 if culm % 6 == 0 else 1)
            lean = rng.uniform(.18, .5)
            la = theta + rng.uniform(-.4, .4)
            th = rng.uniform(.026, .046)

            def point(t):
                return (xx + math.cos(la) * lean * t ** 1.7, y0 + h * t, zz + math.sin(la) * lean * t ** 1.7)

            nodes = 10
            pts = [point(j / nodes) for j in range(nodes + 1)]
            tube(name, 'BambooStem', pts, [th * (1 - .65 * j / nodes) for j in range(nodes + 1)], 6,
                 shade=[.7 + .3 * j / nodes for j in range(nodes + 1)])
            for j in range(1, nodes):
                t = j / nodes
                node = point(t)
                tangent = unit(minus(point(min(1, t + .01)), point(t - .01)))
                rn = th * (1 - .65 * t)
                tube(name, 'BambooNode', [plus(node, scale(tangent, -.014)), plus(node, scale(tangent, .014))],
                     [rn * 1.16] * 2, 6, caps=False)
                if j < 4:
                    continue
                angle = theta + j * 2.4 + rng.uniform(-.3, .3)
                reach = rng.uniform(.35, .7) * (1.10 - .45 * t)
                tip = offset(node, math.cos(angle) * reach, .11 - reach * .26, math.sin(angle) * reach)
                arch = plus(mix(node, tip, .55), (0, .11, 0))
                tube(name, 'BambooStem', [node, arch, tip], [th * .25, .006, .0025], 4)
                for leaf in range(9):
                    base = mix(arch, tip, .22 + leaf * .085)
                    a = angle + (-1 if leaf % 2 else 1) * rng.uniform(.35, .8)
                    size = rng.uniform(.22, .38) * 1.25
                    leaf_tip = offset(base, math.cos(a) * size, -.11 - size * .32, math.sin(a) * size)
                    blade(name, 'LeafLight' if (leaf + culm) % 5 == 0 else 'Leaf', base, leaf_tip, size * .12,
                          curl=.028, roll=rng.uniform(-.4, .4), long=True, dark=.6, light=1.1)

    # ----------------------------------------------------------- willow
    def willow(index, x, z, h):
        name = 'Willow%02d' % index
        place.reserve(x, z, 1.6)
        y = ground(x, z)
        to_lake = unit((-x, 0, -z))
        side = (-to_lake[2], 0, to_lake[0])
        wrng = random.Random(7700 + index)

        def trunk(t):
            bend = .55 * t ** 1.6
            return (x + to_lake[0] * bend * h * .35 + side[0] * .1 * math.sin(t * 5),
                    y + h * .62 * t, z + to_lake[2] * bend * h * .35 + side[2] * .1 * math.sin(t * 5))

        pts = [trunk(j / 9) for j in range(10)]
        tube(name, 'Bark', pts, [h * (.055 - .03 * j / 9) * (1.4 if j == 0 else 1) for j in range(10)], 9, .16,
             shade=[.5 + .4 * j / 9 for j in range(10)])
        crown = trunk(1.0)
        for limb in range(7):
            a = math.atan2(to_lake[2], to_lake[0]) + (limb - 3) * .62 + wrng.uniform(-.2, .2)
            origin = trunk(.65 + limb % 3 * .12)
            reach = h * wrng.uniform(.32, .48)
            tip = (crown[0] + math.cos(a) * reach, y + h * wrng.uniform(.8, .95), crown[2] + math.sin(a) * reach)
            mid = plus(mix(origin, tip, .5), (0, h * .1, 0))
            tube(name, 'Bark', [origin, mid, tip], [h * .02, h * .012, h * .004], 5, shade=[.6, .75, .9])
            for s in range(20):
                u = .15 + s / 20 * .85
                start = mix(mix(origin, mid, u), mix(mid, tip, u), u)
                drop = h * wrng.uniform(.38, .72)
                drop = min(drop, start[1] - .45)
                sa = a + wrng.uniform(-.6, .6)
                strand = []
                for k in range(11):
                    v = k / 10
                    strand.append(offset(start, math.cos(sa) * .22 * math.sin(v * 1.6), -drop * v ** 1.15 + .12 * math.sin(v * 2.6),
                                         math.sin(sa) * .22 * math.sin(v * 1.6)))
                for k in range(1, 11):
                    for sgn in (-1, 0, 1):
                        base = strand[k - 1]
                        la = sa + sgn * 1.1 + (2.4 if sgn == 0 else 0) + wrng.uniform(-.35, .35)
                        tipl = offset(strand[k], math.cos(la) * .05, -.07, math.sin(la) * .05)
                        blade(name, 'WillowLeaf' if (k + s) % 4 else 'LeafLight', base, tipl, .016, curl=.008,
                              roll=la, long=False, dark=.6, light=1.08)

    # ------------------------------------------------------------ maple
    def maple(index, x, z, h):
        name = 'Maple%02d' % index
        place.reserve(x, z, 1.4)
        y = ground(x, z)
        mrng = random.Random(6600 + index)
        trunk = [(x, y, z), (x + .02 * h, y + .25 * h, z), (x - .03 * h, y + .45 * h, z + .02 * h)]
        tube(name, 'Bark', trunk, [h * .05, h * .035, h * .026], 8, .1, shade=[.5, .7, .82])
        top = trunk[-1]
        for limb in range(6):
            a = limb * 2.399963 + index
            tip = (x + math.cos(a) * h * .34, y + h * mrng.uniform(.74, .9), z + math.sin(a) * h * .34)
            tube(name, 'Bark', [top, mix(top, tip, .5), tip], [h * .02, h * .012, h * .005], 5, shade=[.7, .8, .9])
        # Open, layered crown of small leaf clusters on a raised dome.
        for k in range(22):
            a = k * 2.399963 + index
            f = math.sqrt((k + 1) / 22)
            rr = h * .42 * f
            c = (x + math.cos(a) * rr, y + h * (1.0 - .32 * f * f + mrng.uniform(-.05, .05)), z + math.sin(a) * rr)
            s = h * mrng.uniform(.11, .16)
            material = 'MapleRed' if k % 3 else 'MapleOrange'
            mass(name, material, c, (s * 1.1, s * .75, s * 1.1), 6700 + index * 30 + k, lumpy=.42, flat=.35,
                 light=(1.1, 1.02, .96), dark=(.4, .34, .34), cards=11)

    def star(name, material, c, size, yaw, tilt):
        """Five-lobed maple leaf, slightly cupped."""
        ax, az = math.cos(yaw), math.sin(yaw)
        vs, cs = [offset(c, 0, size * .12, 0)], [(.7, .7, .7)]
        for k in range(10):
            a = k / 10 * TAU
            r = size if k % 2 == 0 else size * .42
            u, v = math.cos(a) * r, math.sin(a) * r
            vs.append(offset(c, u * ax - v * az * math.cos(tilt), v * math.sin(tilt) - size * .05, u * az + v * ax * math.cos(tilt)))
            cs.append((1.05, 1.05, 1.05) if k % 2 == 0 else (.85, .85, .85))
        add(name, material, vs, [(0, 1 + k, 1 + (k + 1) % 10) for k in range(10)], cs)

    # ----------------------------------------------------------- poplar
    def poplar(index, x, z, h):
        name = 'Poplar%02d' % index
        place.reserve(x, z, 1.0)
        y = ground(x, z)
        prng = random.Random(4400 + index)
        pts = [(x + .02 * h * math.sin(j * .7), y + h * .97 * j / 10, z + .015 * h * math.cos(j * .9)) for j in range(11)]
        tube(name, 'PoplarBark', pts, [h * (.03 * (1 - j / 10) + .005) * (1.4 if j == 0 else 1) for j in range(11)], 9,
             shade=[.7 + .3 * j / 10 for j in range(11)])
        for k in range(9):
            t = prng.uniform(.08, .6)
            p = mix(pts[int(t * 10)], pts[int(t * 10) + 1], t * 10 % 1)
            a = prng.uniform(0, TAU)
            r = h * (.03 * (1 - t) + .005)
            mass(name, 'BarkDark', offset(p, math.cos(a) * r * .92, 0, math.sin(a) * r * .92), (r * .45, r * .22, r * .45),
                 4500 + index * 20 + k, level=2, lumpy=.2, flat=1, light=(1, 1, 1), dark=(.8, .8, .8))
        for k in range(14):
            t = .3 + k / 13 * .62
            p = mix(pts[int(t * 10)], pts[min(10, int(t * 10) + 1)], t * 10 % 1)
            a = k * 2.399963 + index
            tube(name, 'PoplarBark', [p, offset(p, math.cos(a) * h * .08, h * .12, math.sin(a) * h * .08)], [h * .006, h * .002], 4,
                 caps=False, shade=[.8, .9])
        for k in range(18):
            t = .28 + k / 17 * .7
            p = mix(pts[int(t * 10)], pts[min(10, int(t * 10) + 1)], t * 10 % 1)
            r = h * (.12 * math.sin(math.pi * min(1, (t - .2) / .8) ** .8) + .025)
            a = k * 2.399963 + index
            c = offset(p, math.cos(a) * r * .35, 0, math.sin(a) * r * .35)
            material = 'PoplarLeafLight' if k % 3 == 0 else 'PoplarLeaf'
            mass(name, material, c, (r, r * 1.1, r), 4600 + index * 30 + k, lumpy=.4, flat=.6,
                 light=(1.08, 1.08, 1.04), dark=(.42, .46, .4), cards=9)

    # ------------------------------------------------------------ peach
    def peach(index, x, z, h):
        name = 'Peach%02d' % index
        place.reserve(x, z, 1.4)
        y = ground(x, z)
        prng = random.Random(3300 + index)
        trunk = [(x, y, z), (x + .05 * h, y + .22 * h, z - .03 * h), (x - .03 * h, y + .42 * h, z + .04 * h)]
        tube(name, 'Bark', trunk, [h * .05, h * .035, h * .026], 8, .14, shade=[.45, .6, .75])
        for limb in range(7):
            a = limb * 2.399963 + index * .9
            reach = h * prng.uniform(.3, .46)
            tip = (x + math.cos(a) * reach, y + h * prng.uniform(.68, .92), z + math.sin(a) * reach)
            elbow = plus(mix(trunk[2], tip, .5), (0, -.05 * h, 0))
            tube(name, 'Bark', [trunk[2], elbow, tip], [h * .02, h * .011, h * .004], 5, shade=[.6, .75, .85])
            for k in range(4):
                c = offset(mix(elbow, tip, .3 + k * .23), prng.uniform(-.08, .08) * h, h * .03, prng.uniform(-.08, .08) * h)
                s = h * prng.uniform(.09, .13)
                mass(name, 'BlossomPink' if (k + limb) % 4 else 'Blossom', c, (s * 1.1, s * .8, s * 1.1), 3400 + index * 60 + limb * 4 + k,
                     lumpy=.42, flat=.35, light=(1.06, 1.02, 1.03), dark=(.72, .58, .62), cards=10)

    # ---------------------------------------------------------- camphor
    def camphor(index, x, z, h):
        name = 'Camphor%02d' % index
        place.reserve(x, z, 1.8)
        y = ground(x, z)
        crng = random.Random(5500 + index)
        trunk = [(x, y, z), (x + .03 * h, y + .3 * h, z), (x - .02 * h, y + .5 * h, z + .03 * h)]
        tube(name, 'Bark', trunk, [h * .055, h * .04, h * .03], 9, .12, shade=[.5, .7, .82])
        for limb in range(5):
            a = limb * 2.399963 + index
            tip = (x + math.cos(a) * h * .36, y + h * crng.uniform(.62, .8), z + math.sin(a) * h * .36)
            tube(name, 'Bark', [trunk[2], mix(trunk[2], tip, .5), tip], [h * .022, h * .013, h * .006], 5, shade=[.7, .8, .9])
        for k in range(18):
            a = k * 2.399963 + index * .7
            f = math.sqrt((k + 1) / 18)
            rr = h * .46 * f
            c = (x + math.cos(a) * rr, y + h * (.98 - .3 * f * f + crng.uniform(-.04, .04)), z + math.sin(a) * rr)
            s = h * crng.uniform(.15, .21)
            material = 'CamphorLight' if k % 4 == 0 else 'Camphor'
            mass(name, material, c, (s * 1.05, s * .75, s * 1.05), 5600 + index * 30 + k, lumpy=.38, flat=.38,
                 light=(1.08, 1.06, 1.0), dark=(.36, .4, .34), cards=11)

    # ----------------------------------------------------------- shrubs
    def shrub(x, y, z, s, seed, flowering=False):
        srng = random.Random(seed)
        name = 'Shrubs'
        for k in range(srng.randint(2, 4)):
            a = k * 2.3 + srng.uniform(0, 1)
            r = s * (.9 - k * .14)
            c = (x + math.cos(a) * s * .5 * (k > 0), y + r * .45, z + math.sin(a) * s * .5 * (k > 0))
            material = 'ShrubFlower' if flowering and k % 2 == 0 else ('Shrub' if (k + seed) % 3 else 'LeafLight')
            mass(name, material, c, (r, r * .75, r), seed * 7 + k, lumpy=.32, flat=.45,
                 light=(1.06, 1.06, 1.0), dark=(.4, .44, .38), cards=8)

    # ---------------------------------------------------------- emit
    for index, values in enumerate(PINE_LAYOUT):
        pine(index, *values)
    for index, values in enumerate(MAGNOLIA_LAYOUT):
        magnolia(index, *values)
    for index, values in enumerate(BAMBOO_LAYOUT):
        bamboo(index, *values)
    for index, values in enumerate(WILLOW_LAYOUT):
        willow(index, *values)
    for index, values in enumerate(MAPLE_LAYOUT):
        maple(index, *values)

    def scatter(fn, count, radius, seed, sectors, hrange, margin=1.8):
        grng = random.Random(seed)
        n = tries_ = 0
        while n < count and tries_ < 4000:
            tries_ += 1
            t = grng.uniform(0, TAU)
            if not any(a0 <= (t % TAU) <= a1 for a0, a1 in sectors):
                continue
            f = grng.uniform(.55, .9)
            x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
            if not place.ok_ground(x, z, radius, lake_margin=margin, rim=.92) or ground_height(x, z) < .05:
                continue
            fn(n, x, z, grng.uniform(*hrange))
            n += 1

    # Peach blossoms by the water first, then three more red maples, then poplars.
    scatter(peach, 2, 1.3, 23, [(math.pi * .15, math.pi * .85), (math.pi * .9, math.pi * 1.15)], (2.6, 3.1))
    scatter(lambda n, x, z, h: maple(len(MAPLE_LAYOUT) + n, x, z, h), 3, .95, 29,
            [(0, math.pi * 1.25), (math.pi * 1.75, math.tau)], (2.8, 3.4), margin=1.3)
    # White poplars rise behind the woods; peach blossoms by the water.
    scatter(poplar, 4, .85, 21, [(math.pi * .95, math.pi * 2.05)], (5.2, 6.4), margin=1.4)

    brng = random.Random(77)
    extra_bamboo = 0
    for _ in range(3000):
        if extra_bamboo >= 2:
            break
        t = brng.uniform(math.pi * 1.0, math.pi * 2.0)
        f = brng.uniform(.65, .9)
        bx, bz = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        if place.ok_ground(bx, bz, 1.5, lake_margin=1.8, rim=.92) and ground_height(bx, bz) > .05:
            bamboo(len(BAMBOO_LAYOUT) + extra_bamboo, bx, bz)
            extra_bamboo += 1

    # A band of camphor woodland along the back and sides of the island.
    wrng = random.Random(313)
    tries = planted_c = 0
    while planted_c < 9 and tries < 3000:
        tries += 1
        t = wrng.uniform(0, TAU)
        if math.sin(t) > .5 and wrng.random() < .7:
            continue  # keep the lake-front view open
        f = wrng.uniform(.58, .9)
        x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        if not place.ok_ground(x, z, 1.5, lake_margin=.9, rim=.92):
            continue
        camphor(planted_c, x, z, wrng.uniform(3.2, 4.2))
        planted_c += 1

    # Small slope pines and shrubs bring the palace mountain to life.
    # Selection runs on the v3 spots (same order and tests as before); plants sit on the v9 rock surface.
    mountain = list(spots['mountain'])
    surface = list(spots.get('mountain_v9', mountain))
    order = list(range(len(mountain)))
    random.Random(41).shuffle(order)
    idx = len(PINE_LAYOUT)
    planted = 0
    for k in order:
        x, y, z, a = mountain[k]
        if planted >= 12:
            break
        if not place.free(x, z, 1.0) or not clear_of_buildings(x, z, .4):
            continue
        sx, sy, sz, _a = surface[k]
        pine(idx, sx - math.cos(a) * .2, sy - .1, sz - math.sin(a) * .2, rng.uniform(1.4, 2.2), small=True,
             reserve_at=(x - math.cos(a) * .2, z - math.sin(a) * .2))
        idx += 1
        planted += 1
    shrubs = 0
    for k in order:
        x, y, z, a = mountain[k]
        if shrubs >= 34:
            break
        if not place.free(x, z, .45) or not clear_of_buildings(x, z, .2):
            continue
        place.reserve(x, z, .45)
        sx, sy, sz, _a = surface[k]
        shrub(sx - math.cos(a) * .15, sy - .12, sz - math.sin(a) * .15, rng.uniform(.35, .6), 500 + shrubs,
              flowering=shrubs % 5 == 0)
        shrubs += 1

    # Shore and garden shrubs, layered in front of the trees.
    srng = random.Random(77)
    tries = 0
    count = 0
    while count < 110 and tries < 6000:
        tries += 1
        t = srng.uniform(0, TAU)
        f = srng.uniform(.5, .9)
        x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        s = srng.uniform(.3, .62)
        if not place.ok_ground(x, z, s + .2, lake_margin=.5, rim=.92):
            continue
        place.reserve(x, z, s + .1)
        shrub(x, ground_height(x, z) - .05, z, s, 900 + count, flowering=count % 4 == 0)
        count += 1

    # Small cream and lilac wildflowers scattered through the grass.
    frng = random.Random(55)
    for i in range(320):
        t = frng.uniform(0, TAU)
        f = frng.uniform(.55, .92)
        x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        if in_lake(x, z, -.4) or not clear_of_buildings(x, z, .1) or near_outlet_stream(x, z, .3):
            continue
        gy = ground_height(x, z)
        hgt = frng.uniform(.08, .2)
        tube('Wildflowers', 'Grass', [(x, gy, z), (x + .01, gy + hgt, z)], [.004, .003], 3, caps=False)
        for p in range(5):
            a = p / 5 * TAU + i
            c = (x + .01, gy + hgt, z)
            blade('Wildflowers', 'Flower' if i % 3 else 'ShrubFlower', c,
                  offset(c, math.cos(a) * .028, .008, math.sin(a) * .028), .012, curl=.003, roll=a, dark=.85, light=1.05)

    # Ivy curtains spill over the cliff lip (never across a waterfall).
    vrng = random.Random(99)
    for i in range(46):
        t = i * TAU / 46 + vrng.uniform(-.04, .04)
        x0, z0 = 24 * .985 * outline(t), 14 * .985 * outline(t)
        x, z = x0 * math.cos(t), z0 * math.sin(t)
        if near_outlet_stream(x, z, 1.5):
            continue
        nx, nz = math.cos(t) / 24, math.sin(t) / 14
        nl = math.hypot(nx, nz)
        nx, nz = nx / nl, nz / nl
        for s in range(vrng.randint(3, 6)):
            sx, sz = x + -nz * vrng.uniform(-.9, .9), z + nx * vrng.uniform(-.9, .9)
            L = vrng.uniform(.9, 3.2)
            strand = []
            for k in range(8):
                v = k / 7
                out = .38 + .25 * math.sin(v * 2.2) + .15 * v
                strand.append((sx + nx * out, .12 - L * v, sz + nz * out))
            tube('CliffIvy', 'Ivy', strand, [.012] * 8, 3, caps=False, shade=[.5] * 8)
            for k in range(1, 8):
                for sgn in (-1, 0, 1):
                    la = math.atan2(nz, nx) + sgn * 1.3 + vrng.uniform(-.4, .4)
                    base = mix(strand[k - 1], strand[k], vrng.uniform(.2, .9))
                    blade('CliffIvy', 'Ivy' if (k + s + sgn) % 3 else 'LeafLight', base,
                          offset(base, math.cos(la) * .17 + nx * .08, -.08, math.sin(la) * .17 + nz * .08), .085,
                          curl=.025, roll=la, dark=.5, light=1.0)

    # Reed grass and ferns in safe pockets near the rim.
    for patch in range(90):
        angle = patch * 2.399963
        x = math.cos(angle) * rng.uniform(19.8, 22.6)
        z = math.sin(angle) * rng.uniform(10.2, 12.3)
        if in_lake(x, z, -.5) or island_fraction(x, z) > .95 or not clear_of_buildings(x, z, .3) \
                or near_outlet_stream(x, z, .8):
            continue
        gy = ground_height(x, z)
        for j in range(11):
            a = j * 2.399963 + angle
            base = (x + rng.uniform(-.18, .18), gy, z + rng.uniform(-.18, .18))
            h = rng.uniform(.16, .42)
            tip = offset(base, math.cos(a) * h * .52, h, math.sin(a) * h * .52)
            blade('UnderstoryGrass', 'Grass' if j % 3 else 'LeafLight', base, tip, rng.uniform(.013, .023),
                  curl=.026, roll=a)
        if patch % 3 == 0:
            for frond in range(3):
                a = angle + frond * 2.10
                start = (x, gy + .02, z)
                tip = offset(start, math.cos(a) * .53, .24, math.sin(a) * .53)
                crest = plus(mix(start, tip, .55), (0, .17, 0))
                tube('UnderstoryFern', 'Leaf', [start, crest, tip], [.009, .006, .002], 4)
                for j in range(6):
                    t = .14 + j * .145
                    base = mix(crest, tip, t)
                    for sign in (-1, 1):
                        reach = .18 * (1 - t * .65)
                        end = offset(base, math.cos(a + sign * .95) * reach, -.025, math.sin(a + sign * .95) * reach)
                        blade('UnderstoryFern', 'Leaf' if j % 2 else 'LeafLight', base, end, reach * .17, curl=.018)
    return place.taken
