"""Original, deterministic vegetation geometry for the Yunshui island.

The public entry point accepts build_scene.py's Y-up geometry helpers.  All
foliage is an actual folded mesh, never a texture card or an ellipsoid crown.
The local RNG does not change the mountain or architecture random sequences.
"""

import math
import random


PINE_LAYOUT = (
    (-22, 0, -3, 3.2), (-22, 0, 7, 3), (-14, 0, 9.5, 3),
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


def build_vegetation(add, rod, ell, polyline):
    """Append the complete replacement vegetation to the caller's mesh batches.

    Usage: remove the old pine/magnolia/bamboo block, then call this function
    before build_scene.py material/mesh assembly.  Required new material names
    are Bark, LeafLight, BambooStem and BambooNode.  Set foliage materials to
    double sided in the browser.  ``ell``/``polyline`` are accepted for a stable
    helper contract; the new leaves and flowers deliberately do not use them.
    """
    rng = random.Random(8123)
    up = (0.0, 1.0, 0.0)

    def plus(a, b):
        return tuple(a[i] + b[i] for i in range(3))

    def minus(a, b):
        return tuple(a[i] - b[i] for i in range(3))

    def scale(a, s):
        return tuple(c * s for c in a)

    def length(a):
        return math.sqrt(sum(c * c for c in a))

    def unit(a):
        return scale(a, 1.0 / max(length(a), 1e-8))

    def cross(a, b):
        return (a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0])

    def mix(a, b, t):
        return plus(scale(a, 1 - t), scale(b, t))

    def offset(p, x=0, y=0, z=0):
        return (p[0] + x, p[1] + y, p[2] + z)

    def frame(direction):
        side = cross(direction, up)
        if length(side) < .05:
            side = cross(direction, (1, 0, 0))
        side = unit(side)
        # This handedness matches outward winding of the continuous tube.
        return side, unit(cross(direction, side))

    def tube(name, material, points, radii, sides=6, flutes=0, caps=True):
        """One tapered continuous tube, without internal caps at every bend."""
        vertices = []
        for j, (p, radius) in enumerate(zip(points, radii)):
            tangent = unit(minus(points[min(j + 1, len(points) - 1)],
                                 points[max(0, j - 1)]))
            side, normal = frame(tangent)
            for k in range(sides):
                angle = math.tau * k / sides
                ripple = 1 + flutes * math.sin(k * 2.31 + j * .57)
                delta = plus(scale(side, math.cos(angle)),
                             scale(normal, math.sin(angle)))
                vertices.append(plus(p, scale(delta, radius * ripple)))
        faces = []
        for j in range(len(points) - 1):
            for k in range(sides):
                a = j * sides + k
                b = j * sides + (k + 1) % sides
                faces.append((a, b, b + sides, a + sides))
        if caps:
            faces.extend((tuple(range(sides - 1, -1, -1)),
                          tuple(range((len(points) - 1) * sides, len(points) * sides))))
        add(name, material, vertices, faces)

    def blade(name, material, base, tip, width, curl=0, roll=0, long=False):
        """Folded lanceolate leaf: 4 triangles, or 6 for long bamboo leaves."""
        direction = unit(minus(tip, base))
        side, normal = frame(direction)
        rotated = plus(scale(side, math.cos(roll)), scale(normal, math.sin(roll)))
        normal = unit(cross(rotated, direction))
        center = plus(mix(base, tip, .48), scale(normal, width * .28 + curl))
        if long:
            upper = plus(mix(base, tip, .78), scale(normal, curl * .6))
            vertices = [base, plus(center, scale(rotated, width)),
                        plus(center, scale(rotated, -width)),
                        plus(center, scale(normal, width * .30)),
                        plus(upper, scale(rotated, width * .55)),
                        plus(upper, scale(rotated, -width * .55)), tip]
            faces = [(0, 1, 3), (0, 3, 2), (1, 4, 3),
                     (4, 6, 3), (3, 6, 5), (3, 5, 2)]
        else:
            vertices = [base, plus(center, scale(rotated, width)),
                        plus(center, scale(rotated, -width)),
                        plus(center, scale(normal, width * .42)), tip]
            faces = [(0, 1, 3), (0, 3, 2), (1, 4, 3), (3, 4, 2)]
        add(name, material, vertices, faces)

    def needle_spray(name, p, axis, size, color_index):
        """A loose radial tuft; individual tapered needles leave visible gaps."""
        axis = unit(axis)
        side, normal = frame(axis)
        for j in range(10):
            theta = j * 2.399963 + rng.uniform(-.18, .18)
            radial = plus(scale(side, math.cos(theta)), scale(normal, math.sin(theta)))
            outward = unit(plus(scale(axis, rng.uniform(.35, .9)),
                                scale(radial, rng.uniform(.65, 1.0))))
            base = plus(p, scale(axis, rng.uniform(-.045, .045) * size))
            # Stylized needle bundles retain coverage at the panorama distance;
            # the former botanical-scale blades disappeared below one pixel.
            tip = plus(base, scale(outward, size * 2.0 * rng.uniform(.73, 1.12)))
            material = 'PineLight' if (j + color_index) % 5 == 0 else 'Pine'
            blade(name, material, base, tip, size * 3.1 * rng.uniform(.031, .053),
                  curl=size * .085, roll=theta)

    def pine(index, x, y, z, h):
        name = 'Pine%02d' % index
        azimuth = index * 2.399963 + rng.uniform(-.35, .35)
        lean = .115 * h
        bend_x, bend_z = math.cos(azimuth) * lean, math.sin(azimuth) * lean

        def trunk(t):
            curve = math.sin(t * math.pi * .82)
            return (x + bend_x * t + .035 * h * curve,
                    y + h * t,
                    z + bend_z * t - .028 * h * math.sin(t * math.tau))

        trunk_points = [trunk(j / 10) for j in range(11)]
        trunk_radii = [h * (.052 * (1 - j / 10) ** .8 + .009) for j in range(11)]
        tube(name, 'Bark', trunk_points, trunk_radii, 9, .13)
        # Small buttress roots and pale broken bark ribs add near-view texture.
        for j in range(4):
            a = azimuth + j * 1.58
            root = (x + math.cos(a) * h * .18, y + .025,
                    z + math.sin(a) * h * .18)
            tube(name, 'Bark', [root, mix(root, trunk(.09), .48), trunk(.18)],
                 [h * .014, h * .035, h * .034], 5)
        for j in range(3):
            angle = azimuth + j * 2.03
            rib = []
            for k in range(6):
                t = .05 + k * .105
                radius = h * (.052 * (1 - t) ** .8 + .009)
                rib.append(offset(trunk(t), math.cos(angle) * radius,
                                  0, math.sin(angle) * radius))
            tube(name, 'WoodLight', rib, [h * .0045] * 6, 3)

        # Seven asymmetric limbs; alternating azimuth prevents stacked disks.
        for level in range(7):
            t = .32 + level * .087
            angle = azimuth + level * 2.48 + rng.uniform(-.18, .18)
            reach = h * (.43 - level * .030) * rng.uniform(.9, 1.12)
            origin = trunk(t)
            direction = (math.cos(angle), 0, math.sin(angle))
            branch = [origin]
            for k in range(1, 5):
                u = k / 4
                branch.append(plus(origin,
                                   (direction[0] * reach * u,
                                    h * (-.042 * math.sin(u * math.pi) + .105 * u ** 2),
                                    direction[2] * reach * u)))
            tube(name, 'Bark', branch,
                 [h * v for v in (.027, .024, .018, .011, .0045)], 6, .08)
            # Each branch ends in three parted fans, each carrying four tufts.
            for fork in range(3):
                departure = branch[2 if fork < 2 else 3]
                spread = (fork - 1) * .56
                fork_angle = angle + spread
                extent = h * rng.uniform(.15, .215)
                endpoint = offset(branch[-1], math.cos(fork_angle) * extent,
                                  h * rng.uniform(.025, .095),
                                  math.sin(fork_angle) * extent)
                elbow = plus(mix(departure, endpoint, .52), (0, -.02 * h, 0))
                tube(name, 'Wood', [departure, elbow, endpoint],
                     [h * .009, h * .005, h * .0018], 4)
                axis = unit(minus(endpoint, departure))
                side = (-math.sin(fork_angle), .35, math.cos(fork_angle))
                for tuft in range(4):
                    # Carry foliage back along the fork, filling its silhouette
                    # while the seven main limbs remain separated by air.
                    u = .22 + tuft * .24
                    stem = mix(departure, endpoint, u)
                    sway = (-1 if tuft % 2 else 1) * h * (.028 + tuft * .007)
                    tip = plus(stem, plus(scale(side, sway), (0, h * .023, 0)))
                    rod(name, 'Wood', stem, tip, h * .0021, h * .0009, seg=3)
                    needle_spray(name, tip, plus(scale(axis, .48), (0, .8, 0)),
                                 h * rng.uniform(.058, .081), level + tuft)
        for j in range(12):
            a = j * 2.399963
            t = .84 + j / 12 * .14
            reach = h * (.13 - (t - .84) * .46)
            stem = trunk(t)
            tip = offset(stem, math.cos(a) * reach, h * .018, math.sin(a) * reach)
            rod(name, 'Wood', stem, tip, h * .004, h * .0013, seg=3)
            needle_spray(name, tip, (math.cos(a) * .4, .85, math.sin(a) * .4),
                         h * .068, j)

    def blossom(name, center, size, yaw, opening):
        """Six individually cupped petals with visible open center and stamens."""
        size *= 1.25
        for petal in range(6):
            angle = yaw + petal * math.tau / 6
            radial = (math.cos(angle), 0, math.sin(angle))
            tangent = (-math.sin(angle), 0, math.cos(angle))
            vertices = []
            for row, (radius, height, width) in enumerate(
                    ((.045, 0, .035), (.49 * opening, .43, .29),
                     (.77 * opening, .87, .11))):
                for side in (-1, 0, 1):
                    p = plus(center, plus(scale(radial, radius * size),
                                          scale(tangent, side * width * size)))
                    vertices.append(offset(p, y=size * (height - abs(side) * .055)))
            faces = [(0, 3, 4, 1), (1, 4, 5, 2),
                     (3, 6, 7, 4), (4, 7, 8, 5)]
            add(name, 'BlossomPink' if petal == 0 and opening < .8 else 'Blossom',
                vertices, faces)
        # A tiny warm central filament separates the petals in close views.
        rod(name, 'WoodLight', center, offset(center, y=size * .39),
            size * .045, size * .025, seg=4)

    def magnolia(index, x, y, z, h):
        name = 'Magnolia%02d' % index
        trunk = [(x, y, z), (x - .025 * h, y + .20 * h, z),
                 (x + .018 * h, y + .39 * h, z + .035 * h),
                 (x + .055 * h, y + .66 * h, z - .015 * h)]
        tube(name, 'Bark', trunk, [h * .042, h * .031, h * .025, h * .012], 7, .08)
        for limb in range(7):
            angle = limb * 2.399963 + index * .8
            reach = h * rng.uniform(.27, .43)
            origin = trunk[1 if limb < 3 else 2]
            target = (x + reach * math.cos(angle),
                      y + h * rng.uniform(.72, .88),
                      z + reach * math.sin(angle))
            elbow = plus(mix(origin, target, .56), (0, -.075 * h, 0))
            tube(name, 'Bark', [origin, elbow, target],
                 [h * .022, h * .012, h * .0035], 5)
            for twig in range(4):
                a = angle + (twig - 1.5) * .36
                base = mix(elbow, target, .28 + twig * .19)
                tip = offset(target, math.cos(a) * h * rng.uniform(.035, .11),
                             h * rng.uniform(.035, .105),
                             math.sin(a) * h * rng.uniform(.035, .11))
                bend = plus(mix(base, tip, .55), (0, -.018 * h, 0))
                tube(name, 'Wood', [base, bend, tip],
                     [h * .005, h * .003, h * .0015], 4)
                blossom(name, tip, h * rng.uniform(.069, .095), a,
                        rng.uniform(.68, 1.0))
                if twig % 2 == 0:
                    side = offset(mix(bend, tip, .47), -.035 * h * math.sin(a),
                                  .016 * h, .035 * h * math.cos(a))
                    rod(name, 'Wood', mix(bend, tip, .47), side, h * .0017,
                        h * .001, seg=4)
                    blossom(name, side, h * .064, a + 1.3, .55)
            # Sparse young foliage; flowers remain readable above open branches.
            for j in range(3):
                base = mix(elbow, target, .35 + j * .22)
                a = angle + (-.8 if j % 2 else .8)
                tip = offset(base, math.cos(a) * h * .12,
                             -h * .015, math.sin(a) * h * .12)
                blade(name, 'LeafLight' if j == 0 else 'Leaf', base, tip,
                      h * .025, curl=h * .012, roll=a, long=True)

    def bamboo(index, x, z):
        name = 'Bamboo%02d' % index
        # Distinct clumps, mixing slender young culms and tall mature ones.
        for culm in range(17):
            theta = culm * 2.399963 + index
            radius = .14 + .75 * math.sqrt(culm / 17)
            xx = x + math.cos(theta) * radius
            zz = z + math.sin(theta) * radius
            h = rng.uniform(2.55, 3.85) * (.80 if culm % 6 == 0 else 1)
            lean = rng.uniform(.18, .48)
            lean_angle = theta + rng.uniform(-.4, .4)
            thickness = rng.uniform(.026, .046)

            def point(t):
                return (xx + math.cos(lean_angle) * lean * t ** 1.7,
                        .015 + h * t,
                        zz + math.sin(lean_angle) * lean * t ** 1.7)

            nodes = 10
            points = [point(j / nodes) for j in range(nodes + 1)]
            radii = [thickness * (1 - .65 * j / nodes) for j in range(nodes + 1)]
            tube(name, 'BambooStem', points, radii, 6)
            for j in range(1, nodes):
                t = j / nodes
                node = point(t)
                tangent = unit(minus(point(min(1, t + .01)), point(t - .01)))
                radius_at_node = thickness * (1 - .65 * t)
                # Narrow raised rings, rather than painted segment stripes.
                tube(name, 'BambooNode', [plus(node, scale(tangent, -.014)),
                                         plus(node, scale(tangent, .014))],
                     [radius_at_node * 1.16] * 2, 6, caps=False)
                if j < 4 or j > 9:
                    continue
                angle = theta + j * 2.4 + rng.uniform(-.3, .3)
                reach = rng.uniform(.35, .67) * (1.10 - .45 * t)
                tip = offset(node, math.cos(angle) * reach,
                             .11 - reach * .26, math.sin(angle) * reach)
                arch = plus(mix(node, tip, .55), (0, .11, 0))
                tube(name, 'BambooStem', [node, arch, tip],
                     [thickness * .25, .006, .0025], 4)
                for leaf in range(7):
                    t_leaf = .30 + leaf * .10
                    base = mix(arch, tip, t_leaf)
                    a = angle + (-1 if leaf % 2 else 1) * rng.uniform(.35, .80)
                    size = rng.uniform(.22, .38)
                    leaf_tip = offset(base, math.cos(a) * size * 1.25,
                                      (-.09 - size * .32) * 1.25,
                                      math.sin(a) * size * 1.25)
                    blade(name, 'LeafLight' if (leaf + culm) % 5 == 0 else 'Leaf',
                          base, leaf_tip, size * .095 * 1.6, curl=.028,
                          roll=rng.uniform(-.4, .4), long=True)

    def safe_understory(x, z):
        # Open water, architecture footprints and all four spillways stay clear.
        if (x / 18.5) ** 2 + (z / 9.5) ** 2 < 1.03:
            return False
        for cx, cz, rx, rz in ((-18, 3, 4, 3.8), (-13, -7.3, 3.5, 2.8),
                                (13, 5.8, 3.4, 2.6), (7, -9, 8.5, 5.2)):
            if abs(x - cx) < rx and abs(z - cz) < rz:
                return False
        for cx, cz in ((-12, 11), (0, 13), (11, 11), (21, 3)):
            if abs(x - cx) < 2.5 and abs(z - cz) < 2.8:
                return False
        return True

    for index, values in enumerate(PINE_LAYOUT):
        pine(index, *values)
    for index, values in enumerate(MAGNOLIA_LAYOUT):
        magnolia(index, *values)
    for index, values in enumerate(BAMBOO_LAYOUT):
        bamboo(index, *values)

    # Low, sparse reed grass and ferns break the bare shoreline in safe pockets.
    for patch in range(78):
        angle = patch * 2.399963
        x = math.cos(angle) * rng.uniform(20.2, 22.7)
        z = math.sin(angle) * rng.uniform(10.3, 12.3)
        if not safe_understory(x, z):
            continue
        name = 'UnderstoryGrass'
        for j in range(11):
            a = j * 2.399963 + angle
            base = (x + rng.uniform(-.18, .18), .12, z + rng.uniform(-.18, .18))
            h = rng.uniform(.16, .42)
            tip = offset(base, math.cos(a) * h * .52, h, math.sin(a) * h * .52)
            blade(name, 'Grass' if j % 3 else 'LeafLight', base, tip,
                  rng.uniform(.013, .023), curl=.026, roll=a)
        if patch % 3 == 0:
            for frond in range(3):
                a = angle + frond * 2.10
                start = (x, .14, z)
                tip = offset(start, math.cos(a) * .53, .24, math.sin(a) * .53)
                crest = plus(mix(start, tip, .55), (0, .17, 0))
                tube('UnderstoryFern', 'Leaf', [start, crest, tip], [.009, .006, .002], 4)
                for j in range(6):
                    t = .14 + j * .145
                    base = mix(crest, tip, t)
                    for sign in (-1, 1):
                        reach = .18 * (1 - t * .65)
                        end = offset(base, math.cos(a + sign * .95) * reach,
                                     -.025, math.sin(a + sign * .95) * reach)
                        blade('UnderstoryFern', 'Leaf' if j % 2 else 'LeafLight',
                              base, end, reach * .17, curl=.018)
