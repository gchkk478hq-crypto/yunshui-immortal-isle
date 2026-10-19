"""Build the two pavilion figures (v8) in Blender and export public/assets/models/characters.glb.

Run:  Blender -b --python asset_sources/scripts/characters_v8.py

Modelled after the two hanfu reference sheets supplied for v8:
  * Woman (standing, holding cinnabar prayer beads): white pleated inner dress,
    open celadon lace outer robe in cascading flounces, very wide layered lace
    sleeves, celadon sash with a gold flower plaque, gold chains, jade and
    tassels, applique white flowers, long hair with a gold-and-flower crown,
    hairpin pendants, ribbons and drop earrings.
  * Man (seated at the guzheng): white robe with gold-outlined landscape
    embroidery (texture painted at runtime), blue-grey under-skirt, white sheer
    over-robe with gold-trimmed flounces, shoulder panels with gold and jade,
    blue-grey belt with gold buckle, jade bi discs with blue tassels, long hair
    and a small gold crown with jade.

Geometry is authored in three.js space (x right, y up, z = the figure's
forward) relative to each figure's feet, then converted to Blender Z-up. Every
animated part sits under a named pivot empty so src/characters.ts can animate
it: FemaleLead/FemaleBody/FemaleHead/FemaleHairBack/FemaleArmR/FemaleArmL/
CinnabarBeads and MaleLead/MaleBody/MaleHead/MaleHairBack/MaleArmR/MaleArmL/
MaleHandR/MaleHandL. Materials are named; the runtime replaces them with
physical silk, lace, hair, gold and jade materials and painted textures.
"""
import bpy
import bmesh
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'models', 'characters.glb')
TAU = 2 * math.pi
rng = np.random.default_rng(20261019)
DOWN = np.array([0., -1., 0.])


def smooth(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def norm(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


def catmull(points, n):
    """Uniform Catmull-Rom through all rows of `points` (any dimension), n samples."""
    P = np.asarray(points, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    segs = len(P) - 3
    out = []
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = P[k:k + 4]
        out.append(.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3))
    return np.array(out)


def grid_normals(P):
    """Outward normals of a (R, C, 3) grid built rows-downward, columns increasing angle."""
    dr = np.gradient(P, axis=0)
    dc = np.gradient(P, axis=1)
    return norm(np.cross(dr, dc))


# ------------------------------------------------------------------ mesh accumulation
class Part:
    def __init__(self):
        self.V, self.F, self.UV = [], [], []

    def grid(self, P, UV=None, wrap=False, flip=False):
        """Quad grid. UV in Blender space (v up); for wrapped grids UV has C+1 columns."""
        P = np.asarray(P, float)
        R, C, _ = P.shape
        if UV is None:
            cu = C if wrap else C - 1
            u, v = np.meshgrid(np.arange(C + (1 if wrap else 0)) / cu, 1 - np.arange(R) / max(1, R - 1))
            UV = np.stack([u, v], -1)
        base = len(self.V)
        self.V.extend(P.reshape(-1, 3).tolist())
        for r in range(R - 1):
            for c in range(C if wrap else C - 1):
                c1 = (c + 1) % C
                idx = [base + r * C + c, base + (r + 1) * C + c, base + (r + 1) * C + c1, base + r * C + c1]
                uv = [UV[r, c], UV[r + 1, c], UV[r + 1, c + 1], UV[r, c + 1]]
                if flip:
                    idx, uv = idx[::-1], uv[::-1]
                self.F.append(idx)
                self.UV.append([tuple(map(float, x)) for x in uv])


parts = {}      # (pivot, material) -> Part
pivots = {}     # name -> (parent, origin in figure space, figure root)


def part(pivot, mat):
    return parts.setdefault((pivot, mat), Part())


# ------------------------------------------------------------------ primitives
def ellipsoid(c, r, rows=10, cols=14, basis=None):
    lat = np.linspace(0, math.pi, rows)[:, None]
    lon = (np.arange(cols) / cols * TAU)[None, :]
    unit = np.stack([np.sin(lat) * np.sin(lon), np.cos(lat) * np.ones_like(lon), np.sin(lat) * np.cos(lon)], -1)
    local = unit * np.asarray(r, float)
    if basis is not None:
        local = local @ np.asarray(basis, float)
    return np.asarray(c, float) + local


def add_ellipsoid(pivot, mat, c, r, rows=10, cols=14, basis=None):
    part(pivot, mat).grid(ellipsoid(c, r, rows, cols, basis), wrap=True)


def frames(C, hint=None):
    T = norm(np.gradient(C, axis=0))
    h = np.array([0., 0., 1.]) if hint is None else np.asarray(hint, float)
    u = h - np.dot(h, T[0]) * T[0]
    if np.linalg.norm(u) < 1e-4:
        u = np.cross(T[0], [1., 0., 0.])
    u = norm(u)
    U = []
    for i in range(len(C)):
        if i:
            u = norm(u - np.dot(u, T[i]) * T[i])
        U.append(u.copy())
    U = np.array(U)
    return T, U, np.cross(T, U)


def tube(points, radii, sides=10, n=None, squash=1., hint=None):
    n = n or max(8, len(points) * 6)
    C = catmull(points, n)
    T, U, S = frames(C, hint)
    r = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(radii)), radii)
    a = np.arange(sides) / sides * TAU
    off = np.cos(a)[None, :, None] * U[:, None, :] + squash * np.sin(a)[None, :, None] * S[:, None, :]
    return C[:, None, :] + r[:, None, None] * off


def add_tube(pivot, mat, points, radii, sides=10, n=None, squash=1., hint=None, uv_len=None):
    P = tube(points, radii, sides, n, squash, hint)
    UV = None
    if uv_len:
        R = P.shape[0]
        seg = np.linalg.norm(np.diff(P[:, 0], axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)]) / uv_len
        u, v = np.meshgrid(np.arange(sides + 1) / sides, s)
        UV = np.stack([u, 1 - v], -1)
    part(pivot, mat).grid(P, UV, wrap=True, flip=True)
    return P


def strip(pivot, mat, C, N, width, lift=.002, uv_len=.2):
    """Flat band along centreline C (n,3) lying on a surface with normals N (n,3)."""
    C = np.asarray(C, float)
    N = norm(N)
    T = norm(np.gradient(C, axis=0))
    side = norm(np.cross(T, N))
    w = np.broadcast_to(np.asarray(width, float), (len(C),))[:, None]
    base = C + N * lift
    P = np.stack([base - side * w / 2, base + side * w / 2], 1)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]) / uv_len
    UV = np.stack(np.meshgrid([0., 1.], s), -1)
    UV[..., 1] = 1 - UV[..., 1]
    part(pivot, mat).grid(P, UV)


def ribbon(pivot, mat, points, widths, facing, n=None, uv_len=.25):
    n = n or max(8, len(points) * 8)
    C = catmull(points, n)
    T = norm(np.gradient(C, axis=0))
    face = np.broadcast_to(norm(np.asarray(facing, float)), C.shape)
    N = norm(face - np.sum(face * T, axis=1, keepdims=True) * T)
    w = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(widths)), widths)
    strip(pivot, mat, C, N, w, lift=0, uv_len=uv_len)


def flower(pivot, c, n, size, petals=5, petal_mat='Flower', centre_mat='Gold', rot=0.):
    """Small applique flower facing normal n."""
    n = norm(n)
    t = norm(np.cross(n, [0.3, 1, 0.2]))
    b = np.cross(n, t)
    c = np.asarray(c, float) + n * .002
    for k in range(petals):
        a = rot + k / petals * TAU
        d = math.cos(a) * t + math.sin(a) * b
        e = -math.sin(a) * t + math.cos(a) * b
        # Petal: cupped ellipse grid (4 x 7).
        rr = np.linspace(0, 1, 4)[:, None]
        th = np.linspace(-1, 1, 7)[None, :]
        along = rr * size
        across = np.sqrt(np.clip(1 - (2 * rr - 1) ** 2, 0, 1)) * th * size * .38
        lift = (rr ** 2 * .25 + th ** 2 * .12) * size
        P = c + along[..., None] * d + across[..., None] * e + lift[..., None] * n
        part(pivot, petal_mat).grid(P)
    add_ellipsoid(pivot, centre_mat, c + n * size * .12, [size * .22] * 3, 6, 8)


def tassel(pivot, mat, top, length, strands=12, spread=.012, cap_mat='Gold', cap=.008, sway=(0, 0, 0)):
    top = np.asarray(top, float)
    add_ellipsoid(pivot, cap_mat, top, [cap, cap * 1.2, cap], 8, 10)
    for k in range(strands):
        a = k / strands * TAU + rng.uniform(-.2, .2)
        r = spread * (.4 + .6 * ((k * 7) % 5) / 4)
        L = length * rng.uniform(.9, 1.)
        p0 = top + [math.cos(a) * cap * .6, -cap * .8, math.sin(a) * cap * .6]
        p1 = top + [math.cos(a) * r * .6 + sway[0] * .5, -L * .5, math.sin(a) * r * .6 + sway[2] * .5]
        p2 = top + [math.cos(a) * r + sway[0], -L, math.sin(a) * r + sway[2]]
        add_tube(pivot, mat, [p0, p1, p2], [.0016, .0014, .0009], sides=4, n=7)


def chain(pivot, points, step=.007, r=.0024, mat='Gold'):
    C = catmull(points, 80)
    seg = np.linalg.norm(np.diff(C, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    for d in np.arange(0, s[-1], step):
        p = np.array([np.interp(d, s, C[:, i]) for i in range(3)])
        add_ellipsoid(pivot, mat, p, [r, r, r], 5, 6)


def hand(pivot, wrist, fwd, up, curl=.5, thumb=1, scale=1., spread=1., skin='Skin'):
    """Palm + jointed fingers. fwd: finger direction, up: back of hand; thumb=+1/-1 picks the side."""
    f = norm(fwd)
    u = norm(np.asarray(up, float) - np.dot(up, f) * f)
    s = np.cross(u, f) * thumb
    M = np.stack([s, u, f])                      # local (x side, y back, z forward) -> world
    W = np.asarray(wrist, float)

    def L(p):
        return W + (np.asarray(p, float) * scale) @ M
    add_ellipsoid(pivot, skin, L([0, 0, .042]), np.array([.034, .012, .043]) * scale, 10, 14, basis=M)
    add_tube(pivot, skin, [L([0, 0, -.03]), L([0, 0, .0])], [.024 * scale, .026 * scale], 10)
    for i in range(4):
        x = (i - 1.5) * .0165 * spread
        Ln = [.068, .078, .074, .06][i]
        c = curl * (1 + .12 * i)
        p0 = [x, .001, .078]
        p1 = [x, -math.sin(c) * Ln * .42, .078 + math.cos(c) * Ln * .42]
        p2 = [x, p1[1] - math.sin(c * 2.1) * Ln * .33, p1[2] + math.cos(c * 2.1) * Ln * .33]
        p3 = [x, p2[1] - math.sin(c * 2.9) * Ln * .25, p2[2] + math.cos(c * 2.9) * Ln * .25]
        add_tube(pivot, skin, [L(p0), L(p1), L(p2), L(p3)], [.0074 * scale, .0068 * scale, .006 * scale, .0035 * scale], 7, n=12)
    tc = curl * .8
    add_tube(pivot, skin, [L([.026, -.004, .02]), L([.046, -.012, .045]), L([.05 - tc * .02, -.018 - tc * .02, .068]),
                           L([.045 - tc * .03, -.024 - tc * .03, .086])], [.0095 * scale, .0082 * scale, .0068 * scale, .004 * scale], 7, n=12)


def sleeve(pivot, mat, points, radii, droop, sides=44, n=34, ruffle=0., t_end=1., uv_scale=.22, phase=0., back=.35, hem_v=False, snug=None):
    """Wide hanging sleeve along an arm path: cross-sections widen and the lower side droops into a bag."""
    C = catmull(points, n)
    T = norm(np.gradient(C, axis=0))
    pd = DOWN - (T @ DOWN)[:, None] * T
    pb = np.array([0, 0, -1.]) - (T @ np.array([0, 0, -1.]))[:, None] * T
    U = norm(pd + back * pb)
    S = np.cross(T, U)
    t = np.linspace(0, 1, n)
    keep = t <= t_end + 1e-6
    C, T, U, S, t = C[keep], T[keep], U[keep], S[keep], t[keep]
    r = np.interp(t, np.linspace(0, 1, len(radii)), radii)
    a = np.arange(sides) / sides * TAU
    end = smooth(.72, 1., t / t_end)
    rf = 1 + ruffle * end[:, None] * (np.sin(a * 9 + phase)[None, :] * .7 + np.sin(a * 17 + phase * 2)[None, :] * .3)
    fold = 1 + .05 * smooth(.2, 1, t)[:, None] * np.sin(a * 6 + phase)[None, :]
    off = np.cos(a)[None, :, None] * U[:, None, :] + np.sin(a)[None, :, None] * S[:, None, :]
    if snug is not None:
        # Upper side settles onto the arm (radius `snug`), the rest hangs as a bag.
        k = smooth(.12, .45, t)[:, None]
        low = ((1 + np.cos(a)) / 2)[None, :] ** 1.1
        rr = r[:, None] * (1 - k) + k * (snug + (r[:, None] - snug) * low)
    else:
        rr = np.broadcast_to(r[:, None], (len(t), sides))
    P = C[:, None, :] + (rr * rf * fold)[..., None] * off
    dr = droop * smooth(.18, 1., t) ** 1.3
    P = P + (dr[:, None] * np.clip(np.cos(a), 0, 1)[None, :] ** 1.5)[..., None] * DOWN
    seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))])
    u, v = np.meshgrid(np.arange(sides + 1) / sides * (2 * math.pi * r.mean() / uv_scale), seg / uv_scale)
    if hem_v:  # embroidered robe: cuff at the hem band (v=0), shoulder near the plain top
        u = np.broadcast_to(np.arange(sides + 1)[None, :] / sides * 3, u.shape)
        v = -.62 * (1 - seg / seg[-1])[:, None] * np.ones_like(u)
    part(pivot, mat).grid(P, np.stack([u, -v], -1), wrap=True, flip=True)
    return P


def ring_surface(levels, R, C, amp, freqs=(14, 23), phase=0., a0=None, wrap=True, hem=0., uv_scale=.22, ruffle=0., rfreq=21):
    """Elliptic lathe through levels (y, rx, rz, cz); optional open front |angle| < a0(t)."""
    Lv = catmull(levels, R)
    t = np.linspace(0, 1, R)[:, None]
    if wrap:
        A = np.broadcast_to((np.arange(C) / C * TAU)[None, :], (R, C))
    else:
        lo = a0(t[:, 0])[:, None]
        A = lo + (TAU - 2 * lo) * np.linspace(0, 1, C)[None, :]
    am = amp(t[:, 0])[:, None]
    f = 1 + am * (.6 * np.sin(A * freqs[0] + phase) + .4 * np.sin(A * freqs[1] + phase * 2 + t * 3))
    f = f + ruffle * t ** 2 * np.sin(A * rfreq + phase)
    x = np.sin(A) * Lv[:, 1:2] * f
    z = Lv[:, 3:4] + np.cos(A) * Lv[:, 2:3] * f
    y = Lv[:, 0:1] + hem * t ** 3 * np.sin(A * 7 + phase) + ruffle * .4 * t ** 3 * np.cos(A * rfreq + phase)
    y = np.maximum(y, .003)
    P = np.stack([x, np.broadcast_to(y, x.shape), z], -1)
    rm = (Lv[:, 1] + Lv[:, 2]).mean() / 2
    if wrap:
        Au = np.arange(C + 1) / C * TAU
        u = np.broadcast_to(Au[None, :] * rm / uv_scale, (R, C + 1))
        v = np.broadcast_to(np.concatenate([y, y[:, :1]], 1), (R, C + 1)) / uv_scale
    else:
        u, v = A * rm / uv_scale, y / uv_scale
    return P, np.stack([u, v], -1)


def head_geo(c, size):
    lat = np.linspace(0, math.pi, 46)[:, None]
    lon = (np.arange(60) / 60 * TAU)[None, :]
    x = np.sin(lat) * np.sin(lon)
    y = np.cos(lat) * np.ones_like(lon)
    z = np.sin(lat) * np.cos(lon)

    def g(dx, dy, sx, sy):
        return np.exp(-((dx / sx) ** 2 + (dy / sy) ** 2))
    k = np.where(y < 0, 1 - .27 * np.abs(np.minimum(y, 0)) ** 1.6, 1)
    x = x * k
    z = z * np.where(y < 0, 1 - .12 * y ** 2, 1)
    z = np.where(y > .2, z * (1 + .06 * (y - .2)), z)
    front = np.maximum(0, z)
    z = np.where(z > .45, .45 + (z - .45) * .62, z)
    x = x * (1 + .05 * g(0, y + .05, 1, .35))
    z = z + front * (.2 * g(x, y + .16, .1, .26) + .08 * g(x, y + .34, .14, .09))
    z = z - front * .07 * (g(x - .33, y - .07, .17, .1) + g(x + .33, y - .07, .17, .1))
    z = z + front * .05 * g(x, y - .3, .6, .08)
    z = z + front * .05 * g(x, y + .56, .26, .07)
    z = z + front * .05 * g(x, y + .86, .22, .12)
    x = x + np.sign(x) * front * .04 * g(np.abs(x) - .55, y + .05, .2, .2)
    P = np.asarray(c) + np.stack([x * size[0], y * size[1], z * size[2]], -1)
    uv = np.stack([.5 + x * .5, .5 + y * .5], -1)
    uv = np.concatenate([uv, uv[:, :1]], 1)
    return P, uv


def hair_cap(c, size, female):
    lat = np.linspace(0, math.pi, 38)[:, None]
    lon = (np.arange(52) / 52 * TAU)[None, :]
    x = np.sin(lat) * np.sin(lon)
    y = np.cos(lat) * np.ones_like(lon)
    z = np.sin(lat) * np.cos(lon)
    k = np.where(y < 0, 1 - .26 * np.abs(np.minimum(y, 0)) ** 1.6, 1)
    hairline = .62 - .38 * x * x
    face_side = smooth(-.15, .25, z) * smooth(.04, -.08, y - hairline) * smooth(1.02, .9, np.abs(x) + .05)
    nape = smooth(-.4 if female else -.6, -.6 if female else -.8, y) * smooth(-.5, -.1, z)
    r = 1.075 - .62 * np.maximum(face_side, nape)
    # Centre part: a faint groove down the middle of the crown.
    r = r - .02 * np.exp(-(x / .05) ** 2) * smooth(.3, .7, y) * smooth(-.2, .3, z)
    P = np.asarray(c) + np.stack([x * k * size[0] * r, y * size[1] * (r * .98 + .02) + .006, z * size[2] * r - .004], -1)
    return P


def hair_bundle(pivot, mat, points, widths, bulge, facing, n=26, cols=6, uv_v=1.):
    """Curved hair card: centreline, width profile, outward bulge across the width."""
    C = catmull(points, n)
    T = norm(np.gradient(C, axis=0))
    face = norm(np.broadcast_to(np.asarray(facing, float), C.shape) if np.asarray(facing).ndim == 1 else np.asarray(facing, float))
    N = norm(face - np.sum(face * T, axis=1, keepdims=True) * T)
    side = norm(np.cross(T, N))
    w = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(widths)), widths)
    s = np.linspace(-1, 1, cols)
    P = C[:, None, :] + side[:, None, :] * (w[:, None] / 2 * s[None, :])[..., None] + N[:, None, :] * (bulge * w[:, None] * (1 - s[None, :] ** 2))[..., None]
    u, v = np.meshgrid(np.linspace(0, 1, cols), np.linspace(uv_v, 0, n))
    part(pivot, mat).grid(P, np.stack([u, v], -1))


def sample_surface(P, count, weight=None):
    N = grid_normals(P)
    R, C, _ = P.shape
    w = np.ones((R, C)) if weight is None else weight
    w = (w / w.sum()).ravel()
    idx = rng.choice(R * C, size=count, replace=False, p=w)
    return P.reshape(-1, 3)[idx], N.reshape(-1, 3)[idx]


# ================================================================== WOMAN (standing)
F = 'FemaleBody'
FH_C, FH_S = np.array([0., 1.51, .005]), (.07, .103, .088)

# Inner bodice and pleated skirt (moon white).
bod_levels = [(1.372, .062, .052, -.006), (1.355, .098, .07, -.004), (1.335, .128, .088, 0), (1.28, .14, .1, .006),
              (1.21, .137, .108, .014), (1.14, .127, .1, .01), (1.07, .117, .09, .004), (1.0, .12, .092, 0)]
P, UV = ring_surface(bod_levels, 22, 64, lambda t: .006 + 0 * t, phase=.4)
part(F, 'F_Inner').grid(P, UV, wrap=True)
skirt_levels = [(1.08, .118, .09, .004), (.98, .142, .112, .006), (.84, .17, .14, .008), (.6, .205, .172, .01),
                (.36, .24, .205, .012), (.14, .28, .24, .014), (.0, .305, .265, .016)]
P, UV = ring_surface(skirt_levels, 34, 132, lambda t: .006 + .045 * t ** 1.4, freqs=(16, 27), phase=1.1, hem=.006)
part(F, 'F_Inner').grid(P, UV, wrap=True)
skirt_hem = P[-1]


def skirt_front_z(y):
    ys = np.array([l[0] for l in skirt_levels])[::-1]
    zs = np.array([l[2] + l[3] for l in skirt_levels])[::-1]
    return float(np.interp(y, ys, zs))


# Cross collar: outer lapel (wearer's left over right) and inner lapel, white with a trim edge.
for pts, w in [([(.05, 1.382, -.02), (.04, 1.34, .07), (-.02, 1.25, .108), (-.08, 1.14, .11), (-.1, 1.1, .1)], .03),
               ([(-.05, 1.382, -.02), (-.035, 1.335, .075), (-.005, 1.28, .1), (.01, 1.25, .104)], .026)]:
    ribbon(F, 'F_Trim', pts, [w + .007] * len(pts), (0, .2, 1))
    ribbon(F, 'F_Inner', [np.array(p) + [0, 0, .0016] for p in pts], [w] * len(pts), (0, .2, 1))
a = np.linspace(-2.4, 2.4, 30)
add_tube(F, 'F_Inner', np.stack([np.sin(a) * .05, 1.375 + .0 * a, -.006 + np.cos(a) * .046], 1), [.006] * 2, 6, n=36)
# Neck.
add_tube('FemaleHead', 'Skin', [(0, 1.37, -.006), (0, 1.43, -.002), (0, 1.47, .002)], [.035, .031, .03], 16)

# Open celadon lace outer robe with cascading flounces.
robe_levels = [(1.405, .05, .05, -.004), (1.375, .095, .072, -.004), (1.338, .148, .098, 0), (1.28, .157, .113, .004),
               (1.2, .154, .12, .01), (1.06, .146, .114, .006), (.85, .184, .154, .006), (.6, .22, .19, .008),
               (.35, .26, .226, .01), (.12, .298, .258, .012), (.0, .318, .278, .014)]
ROBE_Y = np.array([l[0] for l in robe_levels])


def robe_a0(t):
    y = np.interp(t, np.linspace(0, 1, 46), catmull(robe_levels, 46)[:, 0])
    return np.interp(y, [0, .6, 1.06, 1.22, 1.33, 1.405], [.74, .56, .43, .42, .62, 1.0])


lace_grids = []
P, UV = ring_surface(robe_levels, 46, 120, lambda t: .004 + .035 * t ** 1.3, freqs=(9, 15), phase=2.1, a0=robe_a0, wrap=False, hem=.008)
part(F, 'F_Lace').grid(P, UV)
lace_grids.append(P)
Nr = grid_normals(P)
strip(F, 'F_Trim', P[-1], Nr[-1], .012)
for edge in (0, -1):
    strip(F, 'F_Trim', P[:, edge], Nr[:, edge], .02)


def robe_radius(y):
    Lv = catmull(robe_levels, 80)
    order = np.argsort(Lv[:, 0])
    return [float(np.interp(y, Lv[order, 0], Lv[order, i])) for i in (1, 2, 3)]


for k, (y0, y1) in enumerate([(1.0, .69), (.75, .4), (.47, .035)]):
    rx0, rz0, cz0 = robe_radius(y0)
    rx1, rz1, cz1 = robe_radius(y1)
    flare = .03 + .012 * k
    lv = [(y0, rx0 + .006, rz0 + .006, cz0), ((y0 * 2 + y1) / 3, rx0 + (rx1 - rx0) / 3 + flare * .45, rz0 + (rz1 - rz0) / 3 + flare * .45, cz0),
          ((y0 + y1 * 2) / 3, rx0 + (rx1 - rx0) * 2 / 3 + flare * .8, rz0 + (rz1 - rz0) * 2 / 3 + flare * .8, cz1), (y1, rx1 + flare, rz1 + flare, cz1)]
    P, UV = ring_surface(lv, 12, 240, lambda t: .01 + .02 * t, freqs=(10, 19), phase=k * 1.7, wrap=False,
                         a0=lambda t, k=k: np.full_like(t, .5 + .07 * k), ruffle=.026, rfreq=19 + k * 2)
    part(F, 'F_Lace').grid(P, UV)
    lace_grids.append(P)
    strip(F, 'F_Trim', P[-1], grid_normals(P)[-1], .007)

# Sash: band with gold edge rings, gold flower plaque, ribbons, chains, jade and tassels.
P, UV = ring_surface([(1.108, .123, .096, .006), (1.072, .121, .094, .005), (1.034, .12, .092, .004)], 5, 72, lambda t: 0 * t)
part(F, 'F_Sash').grid(P, UV, wrap=True)
for y, rx, rz, cz in [(1.108, .124, .097, .006), (1.034, .121, .093, .004)]:
    a = np.linspace(0, TAU, 73)
    add_tube(F, 'Gold', np.stack([np.sin(a) * rx, np.full_like(a, y), cz + np.cos(a) * rz], 1), [.0025] * 2, 6, n=96)
SASH_FRONT = np.array([0, 1.07, .102])
for k in range(8):
    a = k / 8 * TAU
    add_ellipsoid(F, 'Gold', SASH_FRONT + [math.cos(a) * .019, math.sin(a) * .019, .002], [.011, .011, .004], 6, 10)
add_ellipsoid(F, 'WhiteJade', SASH_FRONT + [0, 0, .006], [.012, .012, .007], 8, 12)
for x0, x1, yb in [(.03, .055, .6), (.0, -.03, .7)]:
    pts = [(x0, 1.06, skirt_front_z(1.06) + .012)]
    for y in np.linspace(1.0, yb, 4):
        xx = x0 + (x1 - x0) * (1.06 - y) / (1.06 - yb)
        pts.append((xx, y, skirt_front_z(y) + .014 + .01 * math.sin(y * 9)))
    ribbon(F, 'F_Sash', pts, [.028, .03, .03, .028, .024], (0, 0, 1))
# Gold chain pendant: plaque -> white-jade ring -> jade drop -> beige tassel.
cz = lambda y: skirt_front_z(y) + .02
chain(F, [(.012, 1.05, .11), (.015, .98, cz(.98)), (.018, .915, cz(.915))])
ring = np.array([.018, .9, cz(.9)])
a = np.linspace(0, TAU, 33)
add_tube(F, 'WhiteJade', np.stack([ring[0] + np.cos(a) * .014, ring[1] + np.sin(a) * .014, np.full_like(a, ring[2])], 1), [.0045] * 2, 8, n=40)
chain(F, [(.018, .885, cz(.885)), (.02, .83, cz(.83))])
add_ellipsoid(F, 'Jade', (.02, .815, cz(.815)), [.008, .013, .008], 8, 10)
tassel(F, 'TasselBeige', (.02, .797, cz(.797)), .13, 14, .01)
chain(F, [(-.035, 1.04, .108), (-.04, .97, cz(.97)), (-.045, .9, cz(.9))])
add_ellipsoid(F, 'Pearl', (-.045, .89, cz(.89)), [.007] * 3, 8, 10)
tassel(F, 'TasselBeige', (-.045, .878, cz(.878)), .1, 10, .008)

# Shoes peeking under the hem.
for s in (-1, 1):
    add_ellipsoid(F, 'Shoe', (s * .065, .022, .285), [.03, .022, .055], 10, 14)
    add_tube(F, 'Gold', [(s * .065 - .025, .03, .3), (s * .065, .042, .325), (s * .065 + .025, .03, .3)], [.0022] * 3, 5)

# --- arms: right arm (-x) bent, hand at the waist holding beads; left arm (+x) hangs.
FAR = 'FemaleArmR'
FAL = 'FemaleArmL'
arm_r = [(-.12, 1.355, -.006), (-.185, 1.305, 0), (-.215, 1.08, -.012), (-.12, .965, .12)]
arm_l = [(.12, 1.355, -.006), (.185, 1.305, 0), (.215, 1.07, -.01), (.228, .86, .075)]
for pv, path, ph in [(FAR, arm_r, .3), (FAL, arm_l, 1.9)]:
    sleeve(pv, 'F_Inner', path, [.052, .058, .058, .05], 0., sides=24, n=24, phase=ph)
    s1 = sleeve(pv, 'F_Lace', path, [.064, .084, .12, .165], .3, ruffle=.05, phase=ph, snug=.062)
    s2 = sleeve(pv, 'F_Lace', path, [.07, .094, .134, .185], .22, ruffle=.06, t_end=.86, phase=ph + 1.3, snug=.07)
    lace_grids.extend([s1, s2])
    for S_ in (s1, s2):
        ring_pts = np.vstack([S_[-1], S_[-1][:1]])
        Nn = norm(ring_pts - ring_pts.mean(0))
        strip(pv, 'F_Trim', ring_pts, Nn, .008)
hand(FAR, (-.115, .962, .128), fwd=(.55, -.18, .72), up=(-.2, .9, .3), curl=1.05, thumb=-1, scale=.93)
hand(FAL, (.229, .852, .08), fwd=(.05, -.95, .25), up=(.95, 0, -.2), curl=.32, thumb=-1, scale=.93, spread=.9)

# Cinnabar beads hanging from the right fist, jade bead and red tassel.
FB = 'CinnabarBeads'
B0 = np.array([-.075, .935, .17])
nb = 26
for i in range(nb):
    s = i / nb
    p = B0 + [.024 * math.sin(TAU * s), -.135 * (1 - math.cos(TAU * s)) / 2, .01 * math.sin(TAU * s)]
    add_ellipsoid(FB, 'Cinnabar', p, [.0088] * 3, 8, 10)
add_ellipsoid(FB, 'WhiteJade', B0 + [0, -.15, 0], [.0095, .012, .0095], 8, 10)
tassel(FB, 'TasselRed', B0 + [0, -.166, 0], .1, 16, .011, cap_mat='Gold', cap=.006)

# Applique flowers on the lace (more on shoulders, sleeves and flounce hems).
for P in lace_grids:
    R, C, _ = P.shape
    rows = np.linspace(0, 1, R)[:, None] * np.ones((1, C))
    w = .25 + rows ** 2
    pts, nrm = sample_surface(P, max(6, R * C // 220), w)
    for p, n in zip(pts, nrm):
        pv = F if P is lace_grids[0] or any(P is g for g in lace_grids[1:4]) else None
        flower_pivot = pv or (FAR if p[0] < 0 else FAL)
        flower(flower_pivot, p, n, rng.uniform(.009, .017), rot=rng.uniform(0, TAU))

# --- head, hair and ornaments.
FHD = 'FemaleHead'
P, UV = head_geo(FH_C, FH_S)
part(FHD, 'F_Face').grid(P, UV, wrap=True)
for s in (-1, 1):
    add_ellipsoid(FHD, 'Skin', FH_C + [s * FH_S[0] * .98, -.012, -.006], [.011, .024, .015], 8, 10)
part(FHD, 'Hair').grid(hair_cap(FH_C, FH_S, True), wrap=True)
top = FH_C + [0, FH_S[1], -.03]
add_ellipsoid(FHD, 'Hair', top + [0, .022, -.005], [.05, .036, .046], 12, 18)
for s in (-1, 1):
    a = np.linspace(0, TAU, 25)
    ctr = top + [s * .03, .05, -.01]
    loop = np.stack([ctr[0] + s * np.cos(a) * .028, ctr[1] + np.sin(a) * .03, ctr[2] + np.cos(a) * .01], 1)
    add_tube(FHD, 'Hair', loop, [.014] * 2, 10, n=30)
# Flower crown: gold ring, white flowers with gold hearts, gold sprigs.
a = np.linspace(0, TAU, 49)
crown_c = top + [0, .03, -.005]
add_tube(FHD, 'Gold', np.stack([crown_c[0] + np.sin(a) * .055, crown_c[1] + .004 * np.sin(a * 6), crown_c[2] + np.cos(a) * .05], 1), [.0022] * 2, 6, n=60)
for k in range(11):
    ang = k / 11 * TAU
    p = crown_c + [math.sin(ang) * .056, .006, math.cos(ang) * .051]
    nrm = norm(np.array([math.sin(ang), .9, math.cos(ang)]))
    flower(FHD, p, nrm, .013 if k % 2 else .017, rot=ang)
    tip = p + nrm * .03 + [0, .012, 0]
    add_tube(FHD, 'Gold', [p, p + nrm * .016 + [0, .01, 0], tip], [.0016, .0014, .001], 5)
    add_ellipsoid(FHD, 'Pearl', tip, [.0035] * 3, 6, 8)
# Side hairpins with dangling pearl strands (步摇) and white jade drops.
for s in (-1, 1):
    base = FH_C + [s * .062, .085, -.02]
    end = base + [s * .045, -.012, .02]
    add_tube(FHD, 'Gold', [base - [s * .03, -.008, .01], base, end], [.0022, .0022, .0018], 6)
    flower(FHD, end, (s, .3, .5), .014, rot=s)
    for j in range(3):
        st = end + [s * .004 * j, -.006, .004 * (j - 1)]
        pts = [st + [0, -.016 * i, 0] for i in range(5)]
        for q in pts[1:]:
            add_ellipsoid(FHD, 'Pearl', q, [.0028] * 3, 5, 6)
        add_ellipsoid(FHD, 'WhiteJade', pts[-1] + [0, -.012, 0], [.0045, .008, .0045], 6, 8)
    # Earrings.
    lobe = FH_C + [s * FH_S[0] * 1.0, -.04, -.002]
    add_ellipsoid(FHD, 'Gold', lobe, [.0035] * 3, 6, 8)
    for i in range(2):
        add_ellipsoid(FHD, 'Pearl', lobe + [0, -.008 - .007 * i, 0], [.0028] * 3, 5, 6)
    add_ellipsoid(FHD, 'WhiteJade', lobe + [0, -.03, 0], [.005, .009, .005], 6, 8)
# Celadon ribbons from the back of the crown.
for s in (-1, 1):
    ribbon(FHD, 'F_Ribbon', [top + [s * .03, .01, -.04], top + [s * .05, -.08, -.07], (s * .075, 1.28, -.14), (s * .085, 1.05, -.15), (s * .08, .82, -.145)],
           [.014, .016, .017, .016, .012], (0, 0, -1))
# Face-framing locks and long front strands over the shoulders.
for s in (-1, 1):
    hair_bundle(FHD, 'HairCard', [FH_C + [s * .05, .07, .07], FH_C + [s * .078, .0, .045], FH_C + [s * .072, -.07, .03], FH_C + [s * .07, -.12, .03]],
                [.02, .026, .018, .006], .3, (s, 0, 1), n=16, cols=4)
    hair_bundle(FHD, 'HairCard', [FH_C + [s * .072, .02, -.02], FH_C + [s * .088, -.08, .0], (s * .125, 1.34, .045), (s * .13, 1.22, .095),
                                  (s * .125, 1.08, .112), (s * .115, .95, .12)], [.018, .024, .024, .02, .014, .004], .25, (s * .4, .2, 1), n=30, cols=5)
# Long hair down the back, as overlapping curved bundles.
FHB = 'FemaleHairBack'
for k in range(9):
    th = math.pi + (k - 4) / 4 * 1.15
    sx = math.sin(th)
    start = FH_C + [sx * FH_S[0] * 1.02, .05 - abs(k - 4) * .02, math.cos(th) * FH_S[2] * 1.02]
    pts = [start, FH_C + [sx * .07, -.06, -.095], (sx * .1, 1.33, -.128 + abs(sx) * .03), (sx * .1, 1.15, -.138 + abs(sx) * .03),
           (sx * .08, .95, -.15), (sx * .05 + rng.uniform(-.01, .01), .8 - abs(k - 4) * .02, -.15)]
    hair_bundle(FHB, 'HairCard', pts, [.06, .075, .085, .08, .062, .02], .1, (sx, 0, -1), n=32, cols=7)

# ================================================================== MAN (seated at the guzheng)
M = 'MaleBody'
MH_C, MH_S = np.array([0., 1.17, 0.]), (.077, .11, .094)
add_tube('MaleHead', 'Skin', [(0, .99, -.006), (0, 1.05, -.002), (0, 1.1, .002)], [.044, .041, .04], 16)
torso_levels = [(1.035, .05, .05, -.005), (1.0, .1, .075, -.005), (.965, .17, .1, 0), (.9, .19, .12, .004), (.8, .178, .124, .008),
                (.7, .17, .125, .008), (.62, .172, .13, .006), (.56, .18, .135, 0)]
P, UV = ring_surface(torso_levels, 22, 64, lambda t: .008 + 0 * t, phase=.7)
UV[..., 1] = 1.0  # torso: plain silk (top of the embroidery texture)
UV[..., 1] -= np.linspace(0, .12, UV.shape[0])[:, None]
part(M, 'M_Robe').grid(P, UV, wrap=True)
# Shoulder panels with scalloped, gold-trimmed hems.
P, UV = ring_surface([(1.004, .105, .08, -.005), (.975, .18, .112, 0), (.925, .206, .132, .004), (.865, .214, .138, .006)], 8, 96,
                     lambda t: .01 + 0 * t, a0=lambda t: np.full_like(t, .42), wrap=False, hem=.0)
P[-1, :, 1] -= .012 * (1 + np.cos(np.linspace(.42, TAU - .42, P.shape[1]) * 10)) / 2
UV[..., 1] = 1 - .02 * np.arange(P.shape[0])[:, None] / P.shape[0]
part(M, 'M_Robe').grid(P, UV)
strip(M, 'Gold', P[-1], grid_normals(P)[-1], .007)
for s in (-1, 1):
    orn = np.array([s * .13, .95, .1])
    flower(M, orn, (s * .3, .5, 1), .016, petals=6, petal_mat='Gold', centre_mat='Jade')
    for j in range(2):
        st = orn + [s * (.01 + .012 * j), -.01, .005]
        chain(M, [st, st + [s * .006, -.03, .012], st + [s * .01, -.06, .02]], step=.006, r=.002)
        add_ellipsoid(M, 'Jade', st + [s * .01, -.068, .021], [.005, .007, .005], 6, 8)
# Cross collar: gold under-band, white band on top; inner white collar.
for pts, w in [([(.052, 1.03, -.012), (.03, .97, .1), (-.04, .84, .128), (-.1, .72, .128)], .046),
               ([(-.052, 1.03, -.012), (-.03, .985, .085), (-.005, .95, .11)], .036)]:
    ribbon(M, 'Gold', pts, [w] * len(pts), (0, .2, 1))
    ribbon(M, 'M_Robe', [np.array(p) + [0, 0, .0016] for p in pts], [w - .008] * len(pts), (0, .2, 1))
# Belt with gold buckle and draped chains.
P, UV = ring_surface([(.715, .179, .133, .008), (.678, .177, .134, .007), (.64, .176, .136, .006)], 5, 72, lambda t: 0 * t)
part(M, 'M_Belt').grid(P, UV, wrap=True)
for y, rz in [(.715, .134), (.64, .137)]:
    a = np.linspace(0, TAU, 73)
    add_tube(M, 'Gold', np.stack([np.sin(a) * .18, np.full_like(a, y), .007 + np.cos(a) * rz], 1), [.0022] * 2, 6, n=96)
BUCKLE = np.array([0, .678, .145])
add_ellipsoid(M, 'Gold', BUCKLE, [.032, .024, .006], 8, 14)
add_ellipsoid(M, 'Jade', BUCKLE + [0, 0, .006], [.013, .013, .006], 8, 12)
for s in (-1, 1):
    chain(M, [BUCKLE + [s * .03, -.01, 0], (s * .07, .64, .14), (s * .12, .655, .115)], step=.0065, r=.0021)


# Lower robe over the knees: per-angle cubic Bezier from waist to floor.
def lower_robe(scale=1., a_gap=None, R=34, C=128, extra=0., amp=.028, phase=0., ruffle=0.):
    t = np.linspace(0, 1, R)[:, None]
    if a_gap is None:
        A = np.broadcast_to((np.arange(C) / C * TAU)[None, :], (R, C))
    else:
        lo = a_gap(t[:, 0])[:, None]
        A = lo + (TAU - 2 * lo) * np.linspace(0, 1, C)[None, :]
    s, c = np.sin(A), np.cos(A)
    f = np.clip(c, 0, 1) ** 1.2
    P0 = np.stack([.174 * s, np.full_like(s, .62), .006 + .135 * c], -1)
    P1 = np.stack([.27 * s, .585 - .07 * (1 - f), .17 * c + .25 * f], -1)
    P2 = np.stack([.31 * s, .3 + 0 * s, .24 * c + .25 * f], -1)
    P3 = np.stack([(.37 + extra) * s, .01 + 0 * s, (.34 + extra) * c + .14], -1)
    P0 = P0 * [scale, 1, scale]
    P1 = P1 * [scale, 1, scale] + [0, .006 * (scale - 1) * 100, 0]
    P2 = P2 * [scale, 1, scale]
    P3 = P3 * [scale, 1, scale]
    tt = t[..., None]
    B = (1 - tt) ** 3 * P0 + 3 * (1 - tt) ** 2 * tt * P1 + 3 * (1 - tt) * tt ** 2 * P2 + tt ** 3 * P3
    radial = norm(np.stack([s, 0 * s, c], -1))
    k = amp * t ** 1.3 * (.6 * np.sin(A * 11 + phase) + .4 * np.sin(A * 19 + phase * 2 + t * 4))
    k = k + ruffle * t ** 3 * np.sin(A * 23 + phase)
    B = B + radial * k[..., None]
    B[..., 1] = np.maximum(B[..., 1] + ruffle * .5 * t ** 3 * np.cos(A * 23 + phase), .004)
    seg = np.concatenate([np.zeros((1, C)), np.cumsum(np.linalg.norm(np.diff(B, axis=0), axis=2), axis=0)], 0)
    return B, A, seg


# Blue-grey under-skirt, white embroidered robe (opening at the lower front), sheer over-robe.
P, A, seg = lower_robe(.985, None, amp=.02, phase=.5)
UVu = np.concatenate([A, A[:, :1] + TAU], 1) * .3 / .22
UVv = np.concatenate([seg, seg[:, :1]], 1) / .22
part(M, 'M_Skirt').grid(P, np.stack([UVu, -UVv], -1), wrap=True)
P, A, seg = lower_robe(1.0, lambda t: .02 + .34 * smooth(.3, 1, t), amp=.026, phase=1.3)
v = 1 - .12 - seg / seg[-1:].clip(1e-6) * .88
part(M, 'M_Robe').grid(P, np.stack([(A - A[:, :1]) / TAU * 4, v], -1))
Nr = grid_normals(P)
strip(M, 'Gold', P[-1], Nr[-1], .008)
for edge in (0, -1):
    strip(M, 'Gold', P[:, edge], Nr[:, edge], .007)
robe_grid = P
P, A, seg = lower_robe(1.03, lambda t: .55 + .25 * t, amp=.034, phase=2.4, extra=.05, ruffle=.012)
part(M, 'M_Sheer').grid(P, np.stack([A * .35 / .22, -seg / .22], -1))
strip(M, 'Gold', P[-1], grid_normals(P)[-1], .006)
P, A, seg = lower_robe(1.045, lambda t: .7 + .2 * t, R=20, amp=.03, phase=3.1, extra=.0, ruffle=.016)
P = P[:14]
part(M, 'M_Sheer').grid(P, np.stack([A[:14] * .35 / .22, -seg[:14] / .22], -1))
strip(M, 'Gold', P[-1], grid_normals(P)[-1], .005)
# Sheer over-robe on the torso/back (open front) to the waist.
P, UV = ring_surface([(1.0, .104, .08, -.006), (.962, .176, .108, 0), (.89, .197, .127, .004), (.76, .184, .131, .008), (.63, .186, .14, .006)], 14, 96,
                     lambda t: .012 + 0 * t, a0=lambda t: .5 + .3 * t, wrap=False)
part(M, 'M_Sheer').grid(P, UV)
# Pendants over the lap: jade bi discs and blue tassels, gold tassel.
for xs, ang, mat in [(-.05, -.22, 'TasselBlue'), (.05, .2, 'TasselBlue'), (.0, .02, 'TasselBeige')]:
    col = np.argmin(np.abs((np.linspace(.02, TAU - .02, robe_grid.shape[1]) + math.pi) % TAU - math.pi - ang))
    path = robe_grid[:, col].copy()
    nrm = grid_normals(robe_grid)[:, col]
    path = path + nrm * .016
    path[:, 0] = xs + path[:, 0] * .2
    cut = 20 if mat != 'TasselBeige' else 16
    chain(M, list(path[:cut:3]), step=.0068, r=.0021)
    if mat == 'TasselBlue':
        d = path[7]
        n = nrm[7]
        tb = norm(np.cross(n, [1, 0, 0]))
        ring_pts = np.array([d + .027 * (math.cos(q) * np.array([1., 0, 0]) + math.sin(q) * tb) for q in np.linspace(0, TAU, 33)])
        add_tube(M, 'Jade', ring_pts, [.0085] * 2, 10, n=40, hint=n)
    tassel(M, mat, path[cut - 1], .14 if mat == 'TasselBlue' else .11, 16, .012)
# Boots.
for s in (-1, 1):
    add_ellipsoid(M, 'Shoe', (s * .1, .02, .47), [.033, .02, .075], 10, 14)
    add_tube(M, 'Gold', [(s * .1 - .029, .026, .5), (s * .1, .036, .535), (s * .1 + .029, .026, .5)], [.002] * 3, 5)

# --- arms and hands (pivots match src/characters.ts animation).
MAR, MAL = 'MaleArmR', 'MaleArmL'
for pv, s, ph in [(MAR, -1, .2), (MAL, 1, 1.4)]:
    path = [(s * .12, .965, -.006), (s * .2, .925, 0), (s * .26, .72, .12), (s * .16, .815, .4)]
    sleeve(pv, 'M_Robe', path, [.05, .05, .046, .038], 0., sides=16, n=18, hem_v=True)
    s1 = sleeve(pv, 'M_Robe', path, [.06, .07, .105, .14], .2, ruffle=.02, phase=ph, hem_v=True, snug=.058)
    ring_pts = np.vstack([s1[-1], s1[-1][:1]])
    strip(pv, 'Gold', ring_pts, norm(ring_pts - ring_pts.mean(0)), .012)
    s2 = sleeve(pv, 'M_Sheer', path, [.066, .078, .125, .18], .3, ruffle=.05, phase=ph + .8, snug=.066)
    ring_pts = np.vstack([s2[-1], s2[-1][:1]])
    strip(pv, 'Gold', ring_pts, norm(ring_pts - ring_pts.mean(0)), .006)
    hp = 'MaleHandR' if s < 0 else 'MaleHandL'
    hand(hp, (s * .155, .808, .418), fwd=(-s * .1, -.42, .9), up=(0, .9, .42), curl=.6, thumb=-s, scale=1.05)

# --- head, hair, crown.
MHD = 'MaleHead'
P, UV = head_geo(MH_C, MH_S)
part(MHD, 'M_Face').grid(P, UV, wrap=True)
for s in (-1, 1):
    add_ellipsoid(MHD, 'Skin', MH_C + [s * MH_S[0] * .98, -.012, -.006], [.012, .026, .016], 8, 10)
part(MHD, 'Hair').grid(hair_cap(MH_C, MH_S, False), wrap=True)
kt = MH_C + [0, MH_S[1] + .005, -.02]
add_tube(MHD, 'Hair', [kt, kt + [0, .045, .002]], [.026, .022], 14)
add_ellipsoid(MHD, 'Hair', kt + [0, .045, .002], [.022, .012, .022], 8, 12)
# Gold crown: band, flame plates, jade stones, cross pin.
a = np.linspace(0, TAU, 41)
for yy, rr in [(.018, .03), (.034, .028)]:
    add_tube(MHD, 'Gold', np.stack([kt[0] + np.sin(a) * rr, kt[1] + yy + 0 * a, kt[2] + np.cos(a) * rr * .9], 1), [.0028] * 2, 6, n=48)
for k in range(5):
    ang = (k - 2) * .55
    b = kt + [math.sin(ang) * .03, .036, math.cos(ang) * .027]
    up = norm(np.array([math.sin(ang) * .4, 1, math.cos(ang) * .4]))
    add_tube(MHD, 'Gold', [b, b + up * .02 + [math.sin(ang) * .006, 0, 0], b + up * .034], [.0045, .0032, .0012], 6, n=10)
for k, ang in enumerate((-.6, 0, .6)):
    add_ellipsoid(MHD, 'Jade', kt + [math.sin(ang) * .031, .026, math.cos(ang) * .028], [.0055, .0055, .0035], 6, 8,
                  basis=None)
add_tube(MHD, 'Gold', [kt + [-.075, .03, 0], kt + [.075, .032, 0]], [.0026, .0026], 6)
for s in (-1, 1):
    add_ellipsoid(MHD, 'Jade', kt + [s * .078, .031, 0], [.006, .006, .006], 6, 8)
    ribbon(MHD, 'M_Sheer', [kt + [s * .02, .02, -.025], kt + [s * .04, -.08, -.07], (s * .05, .98, -.15), (s * .06, .82, -.16)], [.012, .016, .016, .012], (0, 0, -1))
# Front strands and long back hair.
for s in (-1, 1):
    hair_bundle(MHD, 'HairCard', [MH_C + [s * .068, .06, .055], MH_C + [s * .088, -.02, .035], MH_C + [s * .09, -.1, .03], (s * .12, .98, .08),
                                  (s * .13, .86, .125), (s * .125, .76, .14)], [.015, .018, .018, .016, .011, .004], .22, (s * .3, .1, 1), n=28, cols=4)
MHB = 'MaleHairBack'
for k in range(9):
    th = math.pi + (k - 4) / 4 * 1.15
    sx = math.sin(th)
    start = MH_C + [sx * MH_S[0] * 1.03, .04 - abs(k - 4) * .02, math.cos(th) * MH_S[2] * 1.03]
    pts = [start, MH_C + [sx * .075, -.08, -.1], (sx * .11, .98, -.132 + abs(sx) * .03), (sx * .1, .85, -.14), (sx * .07, .72, -.15)]
    hair_bundle(MHB, 'HairCard', pts, [.065, .078, .084, .07, .02], .1, (sx, 0, -1), n=28, cols=7)

# ================================================================== pivots and export
PIVOTS = {
    'FemaleLead': (None, (0, 0, 0)), 'FemaleBody': ('FemaleLead', (0, 0, 0)),
    'FemaleHead': ('FemaleLead', (0, 1.43, 0)), 'FemaleHairBack': ('FemaleHead', (0, 1.55, -.07)),
    'FemaleArmR': ('FemaleLead', (-.185, 1.31, 0)), 'FemaleArmL': ('FemaleLead', (.185, 1.31, 0)),
    'CinnabarBeads': ('FemaleArmR', tuple(B0)),
    'MaleLead': (None, (0, 0, 0)), 'MaleBody': ('MaleLead', (0, 0, 0)),
    'MaleHead': ('MaleLead', (0, 1.07, -.005)), 'MaleHairBack': ('MaleHead', (0, 1.2, -.08)),
    'MaleArmR': ('MaleLead', (-.18, .93, 0)), 'MaleArmL': ('MaleLead', (.18, .93, 0)),
    'MaleHandR': ('MaleArmR', (-.155, .808, .418)), 'MaleHandL': ('MaleArmL', (.155, .808, .418)),
}
COLORS = {
    'Skin': (.84, .7, .62, 1), 'F_Face': (.86, .72, .64, 1), 'M_Face': (.84, .7, .62, 1), 'Hair': (.05, .045, .04, 1), 'HairCard': (.06, .05, .045, 1),
    'F_Inner': (.93, .92, .89, 1), 'F_Lace': (.72, .83, .82, .55), 'F_Trim': (.82, .74, .55, 1), 'F_Sash': (.6, .72, .72, 1), 'F_Ribbon': (.66, .8, .8, .6),
    'Gold': (.83, .66, .38, 1), 'Jade': (.7, .84, .76, 1), 'WhiteJade': (.92, .93, .88, 1), 'Pearl': (.95, .94, .9, 1), 'Cinnabar': (.62, .08, .06, 1),
    'TasselRed': (.66, .1, .08, 1), 'TasselBeige': (.75, .66, .52, 1), 'TasselBlue': (.42, .55, .68, 1), 'Flower': (.97, .95, .9, 1),
    'M_Robe': (.93, .93, .9, 1), 'M_Skirt': (.55, .62, .72, 1), 'M_Sheer': (.94, .95, .96, .45), 'M_Belt': (.45, .52, .6, 1), 'Shoe': (.94, .93, .9, 1),
}


def to_blender(p):
    p = np.asarray(p, float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], -1)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
materials = {}
for name, col in COLORS.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = .6
    if col[3] < 1:
        bsdf.inputs['Alpha'].default_value = col[3]
    materials[name] = m

empties, world = {}, {}
for name, (parent, origin) in PIVOTS.items():
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    world[name] = np.asarray(origin, float)
    if parent:
        e.parent = empties[parent]
        e.location = to_blender(world[name] - world[parent]).tolist()
    empties[name] = e

stats = {}
for (pv, mat), pt in sorted(parts.items()):
    V = to_blender(np.asarray(pt.V) - world[pv])
    me = bpy.data.meshes.new(f'{pv}_{mat}')
    me.from_pydata(V.tolist(), [], pt.F)
    uvl = me.uv_layers.new(name='UVMap')
    flat = [c for face in pt.UV for c in face]
    uvl.data.foreach_set('uv', [x for uv in flat for x in uv])
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(materials[mat])
    me.shade_smooth()
    ob = bpy.data.objects.new(f'{pv}_{mat}', me)
    scene.collection.objects.link(ob)
    ob.parent = empties[pv]
    me.calc_loop_triangles()
    stats[f'{pv}_{mat}'] = len(me.loop_triangles)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False, export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'asset_sources', 'characters_v8.blend'))
total = sum(stats.values())
print('CHAR_STATS', json.dumps({'triangles': total, 'objects': len(stats), 'female': sum(v for k, v in stats.items() if k.startswith(('Female', 'Cinnabar'))),
                                'male': sum(v for k, v in stats.items() if k.startswith('Male')), 'bytes': os.path.getsize(OUT)}))
