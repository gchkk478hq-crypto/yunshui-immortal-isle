"""v9 rock-face detail for the palace mountain: sedimentary bedding ledges,
vertical joints and fine roughness, plus matching cavity shading.

`strata(x, y, z, seed)` returns (offset, crack, under, ledge_top):
  offset    outward displacement in metres (ledges protrude, joints recede)
  crack     0..1, 1 inside a vertical joint
  under     0..1, 1 in the shadowed undercut just below a ledge lip
  ledge_top 0..1, 1 on the flat top of a bed (where moss and grass settle)
"""
import math

from mathutils import Vector, noise

from geom_v3 import clamp, smoothstep


def strata(x, y, z, seed, amp=1.0):
    broad = noise.noise(Vector((x * .11, y * .07, z * .11)) + Vector((seed * 1.7, 3.3, 0)))
    spacing = .6 + .22 * broad
    u = y / spacing + 1.6 * broad + .55 * noise.noise(Vector((x * .19, 5.3 + seed, z * .19)))
    bed = math.floor(u)
    s = u - bed
    # Each bed leans out towards its top, then the next bed starts recessed: a stepped face of ledges.
    lip = .15 + .13 * clamp(.5 + .9 * noise.noise(Vector((x * .42, bed * 1.73 + seed, z * .42))))
    # Beds come and go along the face so the ledges break up instead of running as stripes.
    present = smoothstep(-.15, .4, noise.noise(Vector((x * .23 + bed * 3.1, bed * 2.07 + seed, z * .23))))
    ledge = lip * present * s ** 1.35 * (1 - smoothstep(.8, 1.0, s))
    # Vertical joints: thin zero-crossings of stretched noise, broken up along their length.
    j = abs(noise.noise(Vector((x * .62 + seed, y * .085, z * .62))))
    breaks = smoothstep(-.2, .3, noise.noise(Vector((x * .3, y * .45 + seed, z * .3))))
    crack = (1 - smoothstep(.0, .11, j)) * breaks
    fine = noise.noise(Vector((x * 2.3, y * 1.6, z * 2.3)) + Vector((seed, 0, 0)))
    offset = amp * (ledge - .09 * present - .3 * crack) + .035 * fine
    under = (1 - smoothstep(.0, .12, s)) * present
    ledge_top = smoothstep(.7, .82, s) * (1 - smoothstep(.88, 1.0, s)) * present
    return offset, crack, under, ledge_top


def rock_shade(cav, crack, under, height_frac, tint):
    """Vertex colour for a rock face: crevices and undercuts darker, warm/cool drift with `tint` (-1..1)."""
    s = (.46 + .44 * cav) * (.78 + .18 * height_frac)
    s *= 1 - .5 * crack
    s *= 1 - .3 * under
    return (s * (1 + .05 * tint), s * (1 + .01 * tint), s * (.97 - .04 * tint))
