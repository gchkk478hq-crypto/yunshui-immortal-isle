"""v9 dressing, added after everything else with its own random streams so no
existing object moves:

  * UnderstoryLedge   grass tufts, ferns and small cushion flowers on the
                      palace mountain's bedding ledges and along the stair rock face
  * MountainScree     fallen stones half-buried around the mountain foot
  * WildflowersLawn   flower clusters on the lawns (daisy, buttercup, lilac, pink)
  * WildflowersFallen fallen petals under the magnolias and peaches, fallen
                      leaves under the maples, and a light scatter over the lawns
"""
import math
import random

from geom_v3 import (TAU, clear_of_buildings, ground_height, in_lake, island_fraction, near_outlet_stream, outline,
                     rock)

MOUNTAINS = ((7, -9, 7.6, 4.4, 6.78), (.5, -10.5, 3.9, 2.8, 3.08), (13, -9.7, 3.8, 2.75, 4.17))
MAPLES = ((-12.5, 7.6), (-9.2, -10.2), (14.0, 9.9), (-16.9, -5.6), (6.4, 9.8), (19.6, 1.2))


def in_stair_zone(x, z):
    return -1.8 < x < 12.2 and z > -7.4


def build_dressing(add, spots, taken, B, stair_face):
    rng = random.Random(9019)

    def blade(name, material, base, tip, width, lean=(0.0, 0.0), dark=.55, light=1.05):
        dx, dz = tip[0] - base[0], tip[2] - base[2]
        L = math.hypot(dx, dz) or 1.0
        sx, sz = -dz / L * width, dx / L * width
        if L < 1e-3:
            a = rng.uniform(0, TAU)
            sx, sz = math.cos(a) * width, math.sin(a) * width
        mid = (base[0] + (tip[0] - base[0]) * .45 + lean[0], base[1] + (tip[1] - base[1]) * .55, base[2] + (tip[2] - base[2]) * .45 + lean[1])
        v = [(base[0] - sx, base[1], base[2] - sz), (base[0] + sx, base[1], base[2] + sz), (mid[0] + sx * .6, mid[1], mid[2] + sz * .6),
             tip, (mid[0] - sx * .6, mid[1], mid[2] - sz * .6)]
        add(name, material, v, [(0, 1, 2), (0, 2, 4), (4, 2, 3)],
            [(dark,) * 3, (dark,) * 3, ((dark + light) / 2,) * 3, (light,) * 3, ((dark + light) / 2,) * 3])

    def tuft(name, x, y, z, n, h, mats=('Grass', 'Grass', 'GrassDry', 'LeafLight'), out=(0.0, 0.0)):
        for k in range(n):
            a = rng.uniform(0, TAU)
            hh = h * rng.uniform(.55, 1.1)
            r = hh * rng.uniform(.25, .55)
            base = (x + rng.uniform(-.04, .04), y, z + rng.uniform(-.04, .04))
            tip = (base[0] + math.cos(a) * r + out[0] * hh, y + hh, base[2] + math.sin(a) * r + out[1] * hh)
            blade(name, mats[k % len(mats)], base, tip, rng.uniform(.008, .014))

    def fern(name, x, y, z, size, out=(0.0, 0.0)):
        for frond in range(rng.randint(3, 5)):
            a = rng.uniform(0, TAU)
            ox, oz = math.cos(a) + out[0] * 1.2, math.sin(a) + out[1] * 1.2
            ol = math.hypot(ox, oz) or 1
            ox, oz = ox / ol, oz / ol
            prev = (x, y, z)
            for s in range(1, 6):
                t = s / 5
                p = (x + ox * size * t, y + size * .55 * math.sin(t * 2.4) - size * .15 * t, z + oz * size * t)
                reach = size * .26 * (1 - t * .7)
                for sgn in (-1, 1):
                    end = (p[0] + (-oz * sgn + ox * .4) * reach, p[1] - .01, p[2] + (ox * sgn + oz * .4) * reach)
                    blade(name, 'Leaf' if s % 2 else 'LeafLight', prev, end, reach * .22, dark=.5, light=1.0)
                prev = p

    def flower(name, petal, centre, x, y, z, size, tilt=(0.0, 0.0)):
        petals = 5
        rot = rng.uniform(0, TAU)
        for k in range(petals):
            a = rot + k / petals * TAU
            ca, sa = math.cos(a), math.sin(a)
            tip = (x + ca * size + tilt[0] * size, y + size * .18, z + sa * size + tilt[1] * size)
            w = size * .32
            # One rounded triangle per petal: narrow at the heart, broad at the tip.
            v = [(x, y, z), (tip[0] - sa * w, tip[1], tip[2] + ca * w), (tip[0] + sa * w, tip[1], tip[2] - ca * w)]
            add(name, petal, v, [(0, 1, 2)], [(.82,) * 3, (1.04,) * 3, (1.04,) * 3])
        c = size * .28
        add(name, centre, [(x - c, y + c * .6, z), (x, y + c * .6, z - c), (x + c, y + c * .6, z), (x, y + c * .6, z + c), (x, y + c * 1.2, z)],
            [(0, 4, 1), (1, 4, 2), (2, 4, 3), (3, 4, 0)], [(.9,) * 3] * 4 + [(1.1,) * 3])

    def free(x, z, pad):
        return all(math.hypot(x - a, z - b) > r + pad for a, b, r in taken)

    # ------------------------------------------------ mountain ledges and stair face
    ledges = [p for p in spots.get('ledges', []) if not in_stair_zone(p[0], p[2])]
    rng.shuffle(ledges)
    for i, (x, y, z, t, w) in enumerate(ledges[:520]):
        cx, cz, sx, sz, _h = min(MOUNTAINS, key=lambda m: math.hypot((x - m[0]) / m[2], (z - m[1]) / m[3]))
        ox, oz = math.cos(t) / sx, math.sin(t) / sz
        ol = math.hypot(ox, oz)
        ox, oz = ox / ol * .25, oz / ol * .25
        y -= .02
        if i % 9 == 0:
            fern('UnderstoryLedge', x, y, z, rng.uniform(.18, .3), (ox, oz))
        elif i % 7 == 0:
            for k in range(rng.randint(4, 8)):
                flower('UnderstoryLedge', 'FlowerWhite' if i % 2 else 'FlowerLilac', 'FlowerYellow',
                       x + rng.uniform(-.08, .08), y + rng.uniform(.02, .07), z + rng.uniform(-.08, .08), rng.uniform(.012, .02))
            tuft('UnderstoryLedge', x, y, z, 5, .12, out=(ox, oz))
        else:
            tuft('UnderstoryLedge', x, y, z, rng.randint(5, 10), rng.uniform(.12, .3), out=(ox, oz))
    for i, (x, y, z) in enumerate(stair_face):
        if i % 2:
            tuft('UnderstoryLedge', x + rng.uniform(-.1, .1), y + .02, z + .06, rng.randint(6, 10), rng.uniform(.15, .3), out=(0, .5))
        if i % 3 == 0:
            fern('UnderstoryLedge', x, y - .05, z + .1, rng.uniform(.2, .3), (0, .8))

    # ------------------------------------------------ scree around the mountain foot
    srng = random.Random(9029)
    placed = 0
    for k in range(400):
        if placed >= 60:
            break
        cx, cz, sx, sz, _h = MOUNTAINS[k % 3 if k % 5 else 0]
        t = srng.uniform(0, TAU)
        rr = srng.uniform(1.1, 1.24)
        x, z = cx + sx * rr * math.cos(t), cz + sz * rr * math.sin(t)
        if in_stair_zone(x, z) or island_fraction(x, z) > .93 or near_outlet_stream(x, z, .4):
            continue
        s = srng.uniform(.14, .42)
        gy = ground_height(x, z)
        v, f, c = rock((x, gy + s * .15, z), (s * 1.35, s * .62, s), 9100 + k, level=2, sharp=.9, strata=.08, sink=.55)
        add('MountainScree', 'RockLight' if k % 3 else 'Basalt', v, f, c)
        placed += 1
        if k % 2 == 0:
            tuft('UnderstoryLedge', x + s * .9, gy, z + s * .4, rng.randint(5, 9), rng.uniform(.14, .26))

    # ------------------------------------------------ lawn flower clusters
    frng = random.Random(9039)
    kinds = (('FlowerWhite', 'FlowerYellow'), ('FlowerYellow', 'Gold'), ('FlowerLilac', 'FlowerWhite'), ('FlowerPink', 'FlowerYellow'),
             ('FlowerWhite', 'FlowerYellow'))
    clusters = 0
    for k in range(20000):
        if clusters >= 260:
            break
        t = frng.uniform(0, TAU)
        f = frng.uniform(.42, .92)
        x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        if in_lake(x, z, -.5) or island_fraction(x, z) > .9 or not clear_of_buildings(x, z, .5) or near_outlet_stream(x, z, .6) \
                or not free(x, z, .1):
            continue
        if any(math.hypot((x - m[0]) / m[2], (z - m[1]) / m[3]) < 1.3 for m in MOUNTAINS):
            continue
        petal, centre = kinds[clusters % len(kinds)]
        radius = frng.uniform(.2, .5)
        for j in range(frng.randint(9, 18)):
            a, r = frng.uniform(0, TAU), radius * math.sqrt(frng.random())
            fx, fz = x + math.cos(a) * r, z + math.sin(a) * r
            gy = ground_height(fx, fz)
            h = frng.uniform(.07, .2)
            lean = (frng.uniform(-.03, .03), frng.uniform(-.03, .03))
            blade('WildflowersLawn', 'Grass', (fx, gy, fz), (fx + lean[0], gy + h, fz + lean[1]), .004, dark=.6, light=.9)
            flower('WildflowersLawn', petal, centre, fx + lean[0], gy + h, fz + lean[1], frng.uniform(.016, .028), lean)
            if j % 3 == 0:
                a2 = frng.uniform(0, TAU)
                blade('WildflowersLawn', 'LeafLight', (fx, gy, fz), (fx + math.cos(a2) * .07, gy + .05, fz + math.sin(a2) * .07), .012)
        clusters += 1

    # ------------------------------------------------ fallen petals and leaves
    prng = random.Random(9049)
    trees = {}
    for (name, material), data in B.items():
        if name.startswith(('Magnolia', 'Peach')) and material in ('Bark', 'Wood', 'WoodLight', 'BarkDark'):
            vs = data[0]
            low = min(vs, key=lambda p: p[2])[2]
            base = [p for p in vs if p[2] < low + .15]
            bx = sum(p[0] for p in base) / len(base)
            bz = -sum(p[1] for p in base) / len(base)
            trees[name] = (bx, bz, low)

    def petal(name, material, x, z, size):
        if in_lake(x, z, -.05) or not clear_of_buildings(x, z, .05) or near_outlet_stream(x, z, .1) or island_fraction(x, z) > .95:
            return
        y = ground_height(x, z) + .012
        a = prng.uniform(0, TAU)
        ca, sa = math.cos(a), math.sin(a)
        L, W = size, size * prng.uniform(.5, .7)
        lift = size * .25
        v = [(x - ca * L, y + prng.uniform(0, .004), z - sa * L), (x - sa * W, y + lift, z + ca * W), (x + ca * L, y + prng.uniform(0, .004), z + sa * L),
             (x + sa * W, y + lift, z - ca * W)]
        add(name, material, v, [(0, 1, 2), (0, 2, 3)], [(.92,) * 3, (1.02,) * 3, (.92,) * 3, (1.0,) * 3])

    for name, (bx, bz, _y) in sorted(trees.items()):
        mats = ('Blossom', 'BlossomPink', 'Blossom') if name.startswith('Magnolia') else ('BlossomPink', 'BlossomPink', 'Blossom')
        for k in range(240):
            r = abs(prng.gauss(0, 1.15)) + .2
            a = prng.uniform(0, TAU)
            petal('WildflowersFallen', mats[k % 3], bx + math.cos(a) * r, bz + math.sin(a) * r, prng.uniform(.018, .03))
    for mx, mz in MAPLES:
        for k in range(110):
            r = abs(prng.gauss(0, 1.0)) + .25
            a = prng.uniform(0, TAU)
            petal('WildflowersFallen', 'MapleRed' if k % 3 else 'MapleOrange', mx + math.cos(a) * r, mz + math.sin(a) * r, prng.uniform(.028, .042))
    for k in range(1500):
        t = prng.uniform(0, TAU)
        f = prng.uniform(.45, .92)
        x, z = 24 * f * outline(t) * math.cos(t), 14 * f * outline(t) * math.sin(t)
        petal('WildflowersFallen', ('Blossom', 'BlossomPink', 'FlowerWhite')[k % 3], x, z, prng.uniform(.02, .032))
    return {'ledge_plants': min(len(ledges), 520), 'scree': placed, 'flower_clusters': clusters, 'blossom_trees': len(trees)}
