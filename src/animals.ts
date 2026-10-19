import * as THREE from 'three';
import map from './heightmap.json';
import dogPath from './dogPath.json';

/**
 * Two sika fawns roaming the three front lawns (wading the two shallow outlet
 * streams between them) and a small shiba playing along the bridges. Bodies,
 * heads and jointed legs are authored meshes; gaits use per-leg stance/swing
 * cycles, and grazing, ear flicks and tail wags are procedural. The fawns plan
 * routes on the walkable heightmap; the dog follows dogPath.json, planned in
 * Blender on a 5 cm grid against the real bridge decks, rails and posts.
 */
type V3 = [number, number, number];
const TAU = Math.PI * 2;
const H = map as { x0: number; z0: number; step: number; nx: number; nz: number; h: number[]; b: string };

function cellIndex(x: number, z: number) {
    const ix = Math.round((x - H.x0) / H.step), iz = Math.round((z - H.z0) / H.step);
    if (ix < 0 || iz < 0 || ix >= H.nx || iz >= H.nz) return -1;
    return iz * H.nx + ix;
}
export function walkable(x: number, z: number) {
    const i = cellIndex(x, z);
    return i >= 0 && H.b[i] === '0' && H.h[i] > -3;  // cells that 'see through' to the cliff underside are not ground
}
/** Bilinear ground height over valid cells; `deck` takes the lowest nearby surface (ignores rails). */
export function groundHeight(x: number, z: number, deck = false) {
    if (deck) {
        let best = Infinity;
        for (const [dx, dz] of [[0, 0], [.22, 0], [-.22, 0], [0, .22], [0, -.22]]) {
            const i = cellIndex(x + dx, z + dz);
            if (i >= 0 && H.h[i] > -50) best = Math.min(best, H.h[i]);
        }
        return Number.isFinite(best) ? best : .3;
    }
    const fx = (x - H.x0) / H.step, fz = (z - H.z0) / H.step;
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    let sum = 0, weight = 0;
    for (const [ox, oz, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
        const cx = ix + ox, cz = iz + oz;
        if (cx < 0 || cz < 0 || cx >= H.nx || cz >= H.nz) continue;
        const h = H.h[cz * H.nx + cx];
        if (h > -50) { sum += h * w; weight += w; }
    }
    return weight > 0 ? sum / weight : .2;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Shallow fords where the fawns wade the outlet streams between the front lawns: [x0, x1, z0, z1].
const FORDS = [[-12.4, -8.2, 9.2, 10.6], [-2.3, 2.3, 9.4, 11.0]];
export function inFord(x: number, z: number) {
    const i = cellIndex(x, z);
    return i >= 0 && H.b[i] === '2' && H.h[i] > -3 && FORDS.some(([a, b, c, d]) => x > a && x < b && z > c && z < d);
}
/** Ground the fawns may use: walkable lawn, or a shallow ford. */
export function deerGround(x: number, z: number) { return walkable(x, z) || inFord(x, z); }
/** Bilinear ground height for the fawns, sampling only lawn and ford cells (never the lake bed beside the shore). */
export function deerHeight(x: number, z: number) {
    const fx = (x - H.x0) / H.step, fz = (z - H.z0) / H.step;
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    let sum = 0, weight = 0;
    for (const [ox, oz, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
        const cx = ix + ox, cz = iz + oz;
        if (cx < 0 || cz < 0 || cx >= H.nx || cz >= H.nz) continue;
        const px = H.x0 + cx * H.step, pz = H.z0 + cz * H.step;
        if (!deerGround(px, pz)) continue;
        sum += H.h[cz * H.nx + cx] * w;
        weight += w;
    }
    return weight > 0 ? sum / weight : groundHeight(x, z);
}
const LAWN_BOX = { x0: -16, x1: 9, z0: 5.5, z1: 13 };
function deerLine(ax: number, az: number, bx: number, bz: number) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / .2));
    for (let i = 1; i <= n; i++) if (!deerGround(ax + (bx - ax) * i / n, az + (bz - az) * i / n)) return false;
    return true;
}
/** A* over the 0.5 m heightmap for the fawns (fords cost more), shortcut by line of sight. */
export function deerRoute(ax: number, az: number, bx: number, bz: number): [number, number][] | null {
    const key = (ix: number, iz: number) => iz * H.nx + ix;
    const ix0 = Math.round((ax - H.x0) / H.step), iz0 = Math.round((az - H.z0) / H.step);
    const ix1 = Math.round((bx - H.x0) / H.step), iz1 = Math.round((bz - H.z0) / H.step);
    const cell = (ix: number, iz: number) => deerGround(H.x0 + ix * H.step, H.z0 + iz * H.step);
    if (!cell(ix1, iz1)) return null;
    const g = new Map<number, number>([[key(ix0, iz0), 0]]), came = new Map<number, number>(), open: [number, number, number][] = [[0, ix0, iz0]];
    while (open.length) {
        let best = 0;
        for (let k = 1; k < open.length; k++) if (open[k][0] < open[best][0]) best = k;
        const [, ix, iz] = open.splice(best, 1)[0];
        if (ix === ix1 && iz === iz1) break;
        const gc = g.get(key(ix, iz))!;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const nx = ix + dx, nz = iz + dz, x = H.x0 + nx * H.step, z = H.z0 + nz * H.step;
            if (x < LAWN_BOX.x0 || x > LAWN_BOX.x1 || z < LAWN_BOX.z0 || z > LAWN_BOX.z1 || !cell(nx, nz)) continue;
            if (dx && dz && (!cell(ix + dx, iz) || !cell(ix, iz + dz))) continue;
            const ng = gc + Math.hypot(dx, dz) * (inFord(x, z) ? 3 : 1);
            if (ng < (g.get(key(nx, nz)) ?? Infinity)) {
                g.set(key(nx, nz), ng);
                came.set(key(nx, nz), key(ix, iz));
                open.push([ng + Math.hypot(nx - ix1, nz - iz1), nx, nz]);
            }
        }
    }
    if (!came.has(key(ix1, iz1)) && !(ix0 === ix1 && iz0 === iz1)) return null;
    const cells: [number, number][] = [];
    for (let k: number | undefined = key(ix1, iz1); k !== undefined; k = came.get(k)) cells.push([H.x0 + (k % H.nx) * H.step, H.z0 + Math.floor(k / H.nx) * H.step]);
    cells.reverse();
    cells[0] = [ax, az];
    cells[cells.length - 1] = [bx, bz];
    const out: [number, number][] = [cells[0]];
    for (let k = 1; k < cells.length; k++) {
        const [px, pz] = out[out.length - 1];
        if (k + 1 < cells.length && deerLine(px, pz, cells[k + 1][0], cells[k + 1][1])) continue;
        out.push(cells[k]);
    }
    return out;
}

// The dog's planned walk: points [x, y, z, airborne], cumulative length, stops and leap spans.
const DOG = dogPath as { points: number[][]; stops: { i: number; state: string | null }[] };
const dogLen: number[] = [0];
for (let k = 1; k < DOG.points.length; k++) {
    const [ax, ay, az] = DOG.points[k - 1], [bx, by, bz] = DOG.points[k];
    dogLen.push(dogLen[k - 1] + Math.hypot(bx - ax, by - ay, bz - az));
}
const dogLeaps: [number, number][] = [];
for (let k = 1; k < DOG.points.length; k++) if (DOG.points[k][3] && !DOG.points[k - 1][3]) {
    let e = k;
    while (e < DOG.points.length - 1 && DOG.points[e][3]) e++;
    dogLeaps.push([dogLen[k - 1], dogLen[e]]);
}
/** Position on the dog path at arc length s, plus heading and slope. */
export function dogAt(s: number) {
    s = Math.max(0, Math.min(dogLen[dogLen.length - 1], s));
    let k = 1;
    while (k < dogLen.length - 1 && dogLen[k] < s) k++;
    const a = DOG.points[k - 1], b = DOG.points[k], t = (s - dogLen[k - 1]) / Math.max(1e-6, dogLen[k] - dogLen[k - 1]);
    const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    let hop = 0;
    for (const [s0, s1] of dogLeaps) if (s > s0 && s < s1) { const u = (s - s0) / (s1 - s0); hop = Math.sin(u * Math.PI) * (.16 + (s1 - s0) * .25); }
    const ahead = Math.min(dogLen[dogLen.length - 1], s + .15), behind = Math.max(0, s - .15);
    return { p, hop, airborne: hop > 0, ahead, behind };
}
export const dogPathLength = dogLen[dogLen.length - 1];
export const dogStops = DOG.stops.map(st => ({ s: dogLen[st.i], state: st.state }));

// ------------------------------------------------------------- geometry
function tube(points: V3[], radii: number[], sides = 10) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const n = Math.max(6, points.length * 5), pos: number[] = [], idx: number[] = [];
    const frames = curve.computeFrenetFrames(n, false);
    for (let j = 0; j <= n; j++) {
        const t = j / n, p = curve.getPointAt(t), f = t * (radii.length - 1), i0 = Math.min(radii.length - 2, Math.floor(f));
        const r = radii[i0] + (radii[i0 + 1] - radii[i0]) * (f - i0);
        for (let k = 0; k < sides; k++) {
            const a = k / sides * TAU;
            const d = frames.normals[j].clone().multiplyScalar(Math.cos(a) * r).add(frames.binormals[j].clone().multiplyScalar(Math.sin(a) * r));
            pos.push(p.x + d.x, p.y + d.y, p.z + d.z);
            if (j) { const a0 = (j - 1) * sides + k, b0 = (j - 1) * sides + (k + 1) % sides; idx.push(a0, b0, a0 + sides, b0, b0 + sides, a0 + sides); }
        }
    }
    // Rounded caps.
    for (const [j, dir] of [[0, -1], [n, 1]] as [number, number][]) {
        const c = pos.length / 3, p = curve.getPointAt(j / n), tg = curve.getTangentAt(j / n).multiplyScalar(dir * radii[j ? radii.length - 1 : 0] * .6);
        pos.push(p.x + tg.x, p.y + tg.y, p.z + tg.z);
        for (let k = 0; k < sides; k++) {
            const a = j * sides + k, b = j * sides + (k + 1) % sides;
            if (dir > 0) idx.push(a, b, c); else idx.push(b, a, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
/** Body along +Z: levels [z, half-width, half-height, centre y]; the lower half sags slightly. */
function bodyLathe(levels: number[][], seg = 24) {
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j < levels.length; j++) {
        const [z, rx, ry, cy] = levels[j];
        for (let i = 0; i < seg; i++) {
            const a = i / seg * TAU, s = Math.sin(a), c = Math.cos(a);
            pos.push(c * rx, cy + s * ry * (s < 0 ? 1.12 : 1), z);
            if (j) { const k = j * seg + i, l = j * seg + (i + 1) % seg; idx.push(k - seg, l - seg, k, l - seg, l, k); }
        }
    }
    for (const [j, z] of [[0, levels[0][0] - .02], [levels.length - 1, levels[levels.length - 1][0] + .02]]) {
        const c = pos.length / 3;
        pos.push(0, levels[j][3], z);
        for (let i = 0; i < seg; i++) {
            const a = j * seg + i, b = j * seg + (i + 1) % seg;
            if (j) idx.push(a, b, c); else idx.push(b, a, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}
function ellipsoid(r: V3, p: V3 = [0, 0, 0], seg = 16) { const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg * .7 | 0)); g.scale(...r); g.translate(...p); return g; }

/** Fur: darker back, cream underside from the local normal; optional sika spots and white rump. */
function furMaterial(back: number, belly: number, spotted: boolean, rump = false) {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .85, sheen: .7, sheenRoughness: .6, sheenColor: new THREE.Color(0xfff0dc) });
    const uniforms = { uBack: { value: new THREE.Color(back) }, uBelly: { value: new THREE.Color(belly) } };
    m.onBeforeCompile = s => {
        Object.assign(s.uniforms, uniforms);
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFurP; varying vec3 vFurN;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP=position; vFurN=normal;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
 uniform vec3 uBack; uniform vec3 uBelly; varying vec3 vFurP; varying vec3 vFurN;
 float fh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
 {
  float under=smoothstep(.15,-.55,normalize(vFurN).y);
  vec3 c=mix(uBack,uBelly,under);
  float streak=fh(floor(vFurP.xz*vec2(90.,40.)));
  c*=.93+.1*streak;
  ${spotted ? `
  vec2 q=vec2(vFurP.z*15.,vFurP.y*15.+sign(vFurP.x)*.5);
  vec2 cellp=floor(q), fp=fract(q)-.5;
  vec2 o=vec2(fh(cellp),fh(cellp+3.1))-.5;
  float d=length(fp-o*.6);
  float side=smoothstep(.0,.6,normalize(vFurN).y+.3)*(1.-under);
  c=mix(c,uBelly*1.05,smoothstep(.2,.14,d)*side*step(.5,fh(cellp+7.)));` : ''}
  ${rump ? `c=mix(c,uBelly*.98,smoothstep(-.385,-.42,vFurP.z)*smoothstep(.52,.6,vFurP.y)*(1.-step(.68,vFurP.y))*.85);` : ''}
  diffuseColor.rgb=c;
 }`);
    };
    m.customProgramCacheKey = () => `ys5-fur-${spotted}-${rump}`;
    return m;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; offset: number; hind: boolean }
interface Rig { root: THREE.Group; body: THREE.Group; neck: THREE.Group; head: THREE.Group; ears: THREE.Object3D[]; tail: THREE.Group; legs: Leg[] }

export function createAnimals(scene: THREE.Scene) {
    const root = new THREE.Group();
    root.name = 'Animals';
    scene.add(root);
    const geometries = new Set<THREE.BufferGeometry>(), materials: THREE.Material[] = [];
    function mat<M extends THREE.Material>(m: M) { materials.push(m); return m; }
    function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material) {
        geometries.add(g);
        const mesh = new THREE.Mesh(g, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
    const dark = mat(new THREE.MeshPhysicalMaterial({ color: 0x15110f, roughness: .3, clearcoat: .6 }));
    const eyeMat = mat(new THREE.MeshPhysicalMaterial({ color: 0x0b0806, roughness: .08, clearcoat: 1 }));
    const innerEar = mat(new THREE.MeshPhysicalMaterial({ color: 0xc9a998, roughness: .8 }));

    function leg(parent: THREE.Object3D, at: V3, upper: V3, lower: V3, r: number[], m: THREE.Material, hoof: THREE.Material, offset: number, hind: boolean, paw = false): Leg {
        const hip = new THREE.Group();
        hip.position.set(...at);
        parent.add(hip);
        add(hip, tube([[0, .02, 0], [upper[0] * .5, upper[1] * .5, upper[2] * .6], upper], [r[0], r[1], r[2]], 9), m);
        const knee = new THREE.Group();
        knee.position.set(...upper);
        hip.add(knee);
        add(knee, tube([[0, 0, 0], [lower[0] * .5, lower[1] * .5, lower[2] * .5], lower], [r[2], r[3], r[3] * .9], 8), m);
        add(knee, paw ? ellipsoid([r[3] * 1.5, r[3] * 1.0, r[3] * 2.0], [lower[0], lower[1] + r[3] * .4, lower[2] + r[3] * .7], 10)
            : tube([[lower[0], lower[1] + .03, lower[2]], [lower[0], lower[1] + .004, lower[2] + .008]], [r[3] * 1.05, r[3] * 1.2], 8), hoof);
        return { hip, knee, offset, hind };
    }

    // ----------------------------------------------------------- deer
    function makeDeer(name: string, scale: number): Rig {
        const g = new THREE.Group();
        g.name = name;
        g.userData.event = 'animal.deer';
        g.scale.setScalar(scale);
        root.add(g);
        const body = new THREE.Group();
        g.add(body);
        const coat = mat(furMaterial(0x8a6243, 0xe6dccb, true, true)), plainCoat = mat(furMaterial(0x8a6243, 0xe6dccb, false));
        add(body, bodyLathe([[-.42, .05, .05, .6], [-.38, .1, .12, .6], [-.28, .125, .145, .6], [-.12, .12, .15, .585], [.05, .118, .15, .58],
            [.2, .125, .16, .59], [.3, .11, .14, .61], [.37, .07, .09, .65]]), coat);
        // Neck and head pivot at the shoulders for grazing.
        const neck = new THREE.Group();
        neck.position.set(0, .66, .3);
        body.add(neck);
        add(neck, tube([[0, -.03, -.03], [0, .1, .06], [0, .24, .12], [0, .3, .14]], [.075, .06, .048, .045], 12), plainCoat);
        add(neck, ellipsoid([.045, .05, .03], [0, .14, .12], 10), mat(furMaterial(0xe8e0d2, 0xe8e0d2, false)));
        const head = new THREE.Group();
        head.position.set(0, .31, .15);
        neck.add(head);
        add(head, ellipsoid([.058, .062, .085], [0, .01, .02], 18), plainCoat);
        add(head, tube([[0, -.005, .07], [0, -.018, .14], [0, -.03, .19]], [.045, .034, .024], 12), plainCoat);
        add(head, ellipsoid([.02, .014, .012], [0, -.025, .205], 10), dark);
        for (const s of [-1, 1]) {
            add(head, ellipsoid([.012, .013, .011], [s * .045, .025, .065], 10), eyeMat);
            const ear = new THREE.Group();
            ear.position.set(s * .045, .06, -.01);
            ear.rotation.set(-.2, 0, s * -.65);
            head.add(ear);
            add(ear, ellipsoid([.026, .065, .01], [0, .055, 0], 12), plainCoat);
            add(ear, ellipsoid([.018, .05, .006], [0, .055, .006], 10), innerEar);
        }
        const ears = head.children.filter(c => c instanceof THREE.Group);
        const tail = new THREE.Group();
        tail.position.set(0, .66, -.41);
        body.add(tail);
        add(tail, tube([[0, 0, 0], [0, -.03, -.04], [0, -.09, -.05]], [.025, .03, .018], 8), mat(furMaterial(0xece6da, 0xece6da, false)));
        const legs: Leg[] = [];
        // Lateral-sequence walk: LH 0, LF .25, RH .5, RF .75.
        for (const s of [-1, 1]) {
            legs.push(leg(body, [s * .07, .52, .27], [0, -.25, .01], [0, -.26, -.01], [.035, .028, .02, .013], plainCoat, dark, s < 0 ? .25 : .75, false));
            legs.push(leg(body, [s * .075, .58, -.3], [0, -.25, -.07], [0, -.32, .05], [.06, .045, .022, .013], plainCoat, dark, s < 0 ? 0 : .5, true));
        }
        return { root: g, body, neck, head, ears, tail, legs };
    }

    // ------------------------------------------------------------- dog
    function makeDog(): Rig {
        const g = new THREE.Group();
        g.name = 'PlayfulDog';
        g.userData.event = 'animal.dog';
        root.add(g);
        const body = new THREE.Group();
        g.add(body);
        const coat = mat(furMaterial(0xb9875a, 0xeae0cf, false)), cream = mat(furMaterial(0xeae0cf, 0xeae0cf, false));
        add(body, bodyLathe([[-.24, .045, .045, .3], [-.2, .08, .085, .3], [-.08, .085, .085, .295], [.06, .09, .09, .3], [.16, .085, .095, .31], [.22, .06, .07, .33]]), coat);
        add(body, ellipsoid([.06, .07, .05], [0, .27, .18], 12), cream);
        const neck = new THREE.Group();
        neck.position.set(0, .34, .18);
        body.add(neck);
        add(neck, tube([[0, -.02, -.02], [0, .05, .03], [0, .1, .05]], [.055, .048, .045], 10), coat);
        const head = new THREE.Group();
        head.position.set(0, .12, .06);
        neck.add(head);
        add(head, ellipsoid([.062, .058, .062], [0, .0, 0], 18), coat);
        add(head, ellipsoid([.05, .035, .04], [0, -.025, .045], 14), cream);
        add(head, tube([[0, -.012, .04], [0, -.02, .09], [0, -.026, .118]], [.032, .025, .02], 10), cream);
        add(head, ellipsoid([.014, .011, .01], [0, -.018, .13], 10), dark);
        for (const s of [-1, 1]) {
            add(head, ellipsoid([.01, .011, .009], [s * .03, .015, .05], 10), eyeMat);
            const ear = new THREE.Group();
            ear.position.set(s * .035, .045, -.005);
            ear.rotation.set(-.15, 0, s * -.3);
            head.add(ear);
            const cone = new THREE.ConeGeometry(.024, .055, 8);
            cone.translate(0, .027, 0);
            cone.scale(1, 1, .45);
            add(ear, cone, coat);
            const inner = new THREE.ConeGeometry(.016, .04, 8);
            inner.translate(0, .022, .006);
            inner.scale(1, 1, .3);
            add(ear, inner, innerEar);
        }
        const ears = head.children.filter(c => c instanceof THREE.Group);
        // Curled shiba tail over the back.
        const tail = new THREE.Group();
        tail.position.set(0, .34, -.22);
        body.add(tail);
        const curl: V3[] = [];
        for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI * 1.35; curl.push([Math.sin(a * .6) * .02, Math.sin(a) * .1 + .01, -Math.cos(a) * .07 + .03 - k * .004]); }
        add(tail, tube(curl, [.03, .034, .03, .022, .014], 9), coat);
        const legs: Leg[] = [];
        for (const s of [-1, 1]) {
            legs.push(leg(body, [s * .05, .26, .15], [0, -.12, .005], [0, -.12, .0], [.028, .022, .018, .015], coat, cream, s < 0 ? .25 : .75, false, true));
            legs.push(leg(body, [s * .055, .28, -.17], [0, -.12, -.04], [0, -.14, .03], [.045, .032, .018, .015], coat, cream, s < 0 ? 0 : .5, true, true));
        }
        return { root: g, body, neck, head, ears, tail, legs };
    }

    // --------------------------------------------------------- behaviour
    type State = 'graze' | 'look' | 'walk' | 'trot' | 'frolic' | 'run' | 'sit' | 'sniff' | 'bow' | 'spin';
    type Gait = 'walk' | 'trot' | 'gallop' | 'stand';
    interface Agent {
        rig: Rig; x: number; z: number; y: number; yaw: number; speed: number; phase: number; state: State; timer: number; tx: number; tz: number;
        neckPitch: number; hop: number; earT: number; wag: number; route: [number, number][]; leg: number; yawRate: number; gaitBlend: number;
    }
    let seed = 991;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // Lawn cells the fawns can aim for (not fords), across the west, centre and east front lawns.
    const lawnCells: [number, number][] = [];
    for (let iz = 0; iz < H.nz; iz++) for (let ix = 0; ix < H.nx; ix++) {
        const x = H.x0 + ix * H.step, z = H.z0 + iz * H.step;
        if (x > LAWN_BOX.x0 && x < LAWN_BOX.x1 && z > LAWN_BOX.z0 && z < LAWN_BOX.z1 && walkable(x, z)) lawnCells.push([x, z]);
    }
    function pickTarget(ag: Agent, near: number, far: number) {
        for (let k = 0; k < 40; k++) {
            const [x, z] = lawnCells[Math.floor(rand() * lawnCells.length)];
            const d = Math.hypot(x - ag.x, z - ag.z);
            if (d < near || d > far) continue;
            const route = deerRoute(ag.x, ag.z, x + (rand() - .5) * .3, z + (rand() - .5) * .3);
            if (route) return route;
        }
        return null;
    }
    const deerA = makeDeer('SikaFawnA', 1.0), deerB = makeDeer('SikaFawnB', .82);
    const agent = (rig: Rig, x: number, z: number, state: State): Agent => ({ rig, x, z, y: deerHeight(x, z), yaw: rand() * TAU, speed: 0, phase: rand() * TAU, state,
        timer: 2 + rand() * 3, tx: x, tz: z, neckPitch: 0, hop: 0, earT: 0, wag: 0, route: [], leg: 0, yawRate: 0, gaitBlend: 0 });
    const start = lawnCells.reduce((best, c) => Math.hypot(c[0] + 6, c[1] - 10.2) < Math.hypot(best[0] + 6, best[1] - 10.2) ? c : best, lawnCells[0]);
    const startB = lawnCells.find(c => Math.hypot(c[0] - start[0], c[1] - start[1]) > .9 && Math.hypot(c[0] - start[0], c[1] - start[1]) < 1.6 && deerLine(start[0], start[1], c[0], c[1])) ?? start;
    const a = agent(deerA, start[0], start[1], 'graze'), b = agent(deerB, startB[0], startB[1], 'look');

    const dogRig = makeDog();
    const dog = agent(dogRig, DOG.points[0][0], DOG.points[0][2], 'sit');
    let dogS = 0, dogDir = 1, dogStop = 0, dogSpin = 0, startle = 0;
    dogRig.root.rotation.order = 'YXZ';
    for (const r of [deerA, deerB]) r.root.rotation.order = 'YXZ';

    /** Follow ag.route (polyline) with eased speed and a capped turn rate. Returns true at the end. */
    function follow(ag: Agent, dt: number, cruise: number, turnRate: number) {
        while (ag.leg < ag.route.length && Math.hypot(ag.route[ag.leg][0] - ag.x, ag.route[ag.leg][1] - ag.z) < (ag.leg === ag.route.length - 1 ? .15 : .45)) ag.leg++;
        if (ag.leg >= ag.route.length) { ag.speed += (0 - ag.speed) * Math.min(1, dt * 5); return ag.speed < .08; }
        const [tx, tz] = ag.route[ag.leg];
        const remaining = Math.hypot(tx - ag.x, tz - ag.z) + (ag.leg < ag.route.length - 1 ? 1 : 0);
        const want = Math.atan2(tx - ag.x, tz - ag.z), err = wrap(want - ag.yaw);
        const turn = Math.max(-turnRate * dt, Math.min(turnRate * dt, err));
        ag.yaw = wrap(ag.yaw + turn);
        ag.yawRate += (turn / Math.max(dt, 1e-4) - ag.yawRate) * Math.min(1, dt * 6);
        const wading = inFord(ag.x, ag.z);
        const v = (wading ? Math.min(cruise, .55) : cruise) * Math.max(.2, Math.cos(err)) * Math.min(1, remaining / 1.2 + .25);
        ag.speed += (v - ag.speed) * Math.min(1, dt * (v > ag.speed ? 2.2 : 4));
        const nx = ag.x + Math.sin(ag.yaw) * ag.speed * dt, nz = ag.z + Math.cos(ag.yaw) * ag.speed * dt;
        if (deerGround(nx, nz)) { ag.x = nx; ag.z = nz; } else { ag.speed *= .5; ag.yaw = wrap(ag.yaw + Math.sign(err || 1) * dt * 2); }
        return false;
    }

    /** Leg cycle with stance and swing phases; diagonal pairs trot, rotary gallop. */
    function pose(ag: Agent, dt: number, time: number, gait: Gait, stride: number) {
        const r = ag.rig;
        if (gait !== 'stand') ag.phase += dt * TAU * Math.max(.35, ag.speed / stride);
        ag.gaitBlend += ((gait === 'stand' ? 0 : 1) - ag.gaitBlend) * Math.min(1, dt * 5);
        const amp = (gait === 'gallop' ? .62 : gait === 'trot' ? .46 : .32) * ag.gaitBlend, duty = gait === 'gallop' ? .4 : gait === 'trot' ? .5 : .64;
        for (const l of r.legs) {
            const left = l.hind ? l.offset === 0 : l.offset === .25;
            const off = gait === 'trot' ? (l.hind === left ? 0 : .5) : gait === 'gallop' ? (l.hind ? (left ? 0 : .1) : (left ? .55 : .45)) : l.offset;
            const u = ((ag.phase / TAU + off) % 1 + 1) % 1;
            let hip: number, knee: number;
            if (u < duty) { hip = amp * (1 - 2 * u / duty); knee = .08 * amp; }  // foot planted, body passes over it
            else { const v = (u - duty) / (1 - duty); hip = -amp + 2 * amp * (1 - Math.cos(Math.PI * v)) / 2; knee = Math.sin(Math.PI * v) * (gait === 'walk' ? .75 : 1.0) * (amp + .15); }
            const sitFold = ag.state === 'sit' && l.hind ? 1 : 0, bowFold = ag.state === 'bow' && !l.hind ? 1 : 0;
            const grazeSplay = ag.state === 'graze' && !l.hind ? .12 : 0;
            const hipT = (l.hind ? -hip : hip) + sitFold * -1.05 + bowFold * .9 + grazeSplay;
            const kneeT = (l.hind ? -1 : 1) * knee + sitFold * 2.0 + bowFold * -1.3;
            l.hip.rotation.x += (hipT - l.hip.rotation.x) * Math.min(1, dt * 18);
            l.knee.rotation.x += (kneeT - l.knee.rotation.x) * Math.min(1, dt * 18);
        }
        const cyc = ag.phase;
        const bob = gait === 'stand' ? 0 : gait === 'gallop' ? Math.abs(Math.sin(cyc)) * .045 : gait === 'trot' ? Math.abs(Math.sin(cyc)) * .022 : (1 - Math.cos(cyc * 2)) * .006;
        const sitPitch = ag.state === 'sit' ? -.45 : ag.state === 'bow' ? .38 : ag.state === 'graze' ? .08 : 0;
        r.body.position.y += (bob * ag.gaitBlend + (ag.state === 'sit' ? -.07 : ag.state === 'bow' ? -.06 : 0) - r.body.position.y) * Math.min(1, dt * 12);
        r.body.rotation.x += (sitPitch + (gait === 'gallop' ? Math.sin(cyc) * .09 : gait === 'trot' ? Math.sin(cyc * 2) * .015 : 0) - r.body.rotation.x) * Math.min(1, dt * 9);
        // Lean into turns; the head nods with each step (stronger in the walk, as deer do).
        r.root.rotation.z += (-ag.yawRate * ag.speed * .05 - r.root.rotation.z) * Math.min(1, dt * 4);
        const nod = gait === 'walk' ? Math.sin(cyc * 2 + .6) * .07 : gait === 'trot' ? Math.sin(cyc * 2) * .04 : 0;
        r.neck.rotation.x += (ag.neckPitch + nod * ag.gaitBlend - r.neck.rotation.x) * Math.min(1, dt * (ag.state === 'graze' ? 2.5 : 6));
        ag.earT -= dt;
        if (ag.earT < 0) ag.earT = 1.2 + rand() * 3.5;
        const flick = ag.earT < .18 ? Math.sin(ag.earT / .18 * Math.PI) * .5 : 0;
        r.ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * flick + (ag.state === 'look' ? Math.sin(time * .9 + i) * .25 : 0); });
        r.tail.rotation.y = Math.sin(time * (ag.wag > 0 ? 18 : 2.2)) * (ag.wag > 0 ? .55 : .12);
        r.tail.rotation.x = ag.wag > 0 ? -.15 : gait === 'trot' || gait === 'gallop' ? -.35 : 0;
        ag.wag = Math.max(0, ag.wag - dt);
    }

    function placeDeer(ag: Agent, dt: number) {
        const target = deerHeight(ag.x, ag.z);
        ag.y += (target - ag.y) * Math.min(1, dt * 10);
        ag.rig.root.position.set(ag.x, ag.y + ag.hop, ag.z);
        ag.rig.root.rotation.y = ag.yaw;
        // Pitch with the ground slope under the body.
        const ahead = deerHeight(ag.x + Math.sin(ag.yaw) * .35, ag.z + Math.cos(ag.yaw) * .35), behind = deerHeight(ag.x - Math.sin(ag.yaw) * .35, ag.z - Math.cos(ag.yaw) * .35);
        ag.rig.root.rotation.x += (-Math.atan2(ahead - behind, .7) * .8 - ag.rig.root.rotation.x) * Math.min(1, dt * 5);
    }

    function setGoal(ag: Agent, state: State, other: Agent, leader: boolean) {
        ag.state = state;
        ag.leg = 0;
        if (state === 'walk' || state === 'trot') {
            const route = leader ? pickTarget(ag, state === 'trot' ? 4 : 2.5, state === 'trot' ? 14 : 9)
                : deerRoute(ag.x, ag.z, other.x - Math.sin(other.yaw) * 1.1 + Math.cos(other.yaw) * .6, other.z - Math.cos(other.yaw) * 1.1 - Math.sin(other.yaw) * .6)
                ?? deerRoute(ag.x, ag.z, other.x, other.z);
            ag.route = route ?? [];
            ag.timer = 25;
            if (!route) { ag.state = 'look'; ag.timer = 1.5; }
        } else ag.timer = state === 'graze' ? 3 + rand() * 4 : state === 'look' ? 1.4 + rand() * 1.8 : state === 'frolic' ? 1.8 : 2;
    }

    function updateDeer(ag: Agent, other: Agent, dt: number, time: number, leader: boolean) {
        ag.timer -= dt;
        let gait: Gait = 'stand';
        if (ag.state === 'walk' || ag.state === 'trot') {
            // The follower keeps re-aiming at a spot just behind and beside the leader.
            if (!leader && ag.state === 'walk' && ag.timer % 1.5 < dt) {
                const r = deerRoute(ag.x, ag.z, other.x - Math.sin(other.yaw) * 1.1 + Math.cos(other.yaw) * .6, other.z - Math.cos(other.yaw) * 1.1 - Math.sin(other.yaw) * .6);
                if (r) { ag.route = r; ag.leg = 0; }
            }
            const far = !leader && Math.hypot(other.x - ag.x, other.z - ag.z) > 3.5;
            const cruise = ag.state === 'trot' ? 1.9 : far ? 1.5 : 1.0;
            const done = follow(ag, dt, cruise, ag.state === 'trot' ? 3.2 : 2.2);
            gait = ag.speed > 1.25 ? 'trot' : ag.speed > .05 ? 'walk' : 'stand';
            ag.neckPitch = gait === 'trot' ? -.2 : inFord(ag.x, ag.z) ? .35 : .02;
            ag.rig.head.rotation.y *= Math.max(0, 1 - dt * 3);
            if (done || ag.timer < 0) setGoal(ag, rand() < .55 ? 'graze' : 'look', other, leader);
        } else {
            ag.speed *= Math.max(0, 1 - dt * 6);
            ag.yawRate *= Math.max(0, 1 - dt * 6);
            if (ag.state === 'graze') {
                // Head down in the grass, chewing in bursts; now and then a step forward to fresh grass.
                ag.neckPitch = 2.05 + Math.sin(time * 6) * .04 * (Math.sin(time * .9 + (leader ? 0 : 1)) > 0 ? 1 : 0);
                if (Math.sin(time * .5 + (leader ? 0 : 2)) > .97) {
                    const nx = ag.x + Math.sin(ag.yaw) * .25 * dt, nz = ag.z + Math.cos(ag.yaw) * .25 * dt;
                    if (walkable(nx, nz)) { ag.x = nx; ag.z = nz; ag.speed = .25; gait = 'walk'; }
                }
            } else if (ag.state === 'look') {
                ag.neckPitch = -.18;
                ag.rig.head.rotation.y += (Math.sin(time * .7 + (leader ? 0 : 2)) * .6 - ag.rig.head.rotation.y) * Math.min(1, dt * 2);
            } else if (ag.state === 'frolic') {
                // Playful pronking: springy hops on all four legs while spinning towards the companion.
                const t = 1.8 - ag.timer;
                ag.hop = Math.max(0, Math.sin(t / .45 * Math.PI)) * .2;
                const toward = Math.atan2(other.x - ag.x, other.z - ag.z);
                ag.yaw = wrap(ag.yaw + Math.max(-dt * 3, Math.min(dt * 3, wrap(toward - ag.yaw))));
                ag.neckPitch = -.25;
                gait = 'trot';
            }
            if (ag.state !== 'look') ag.rig.head.rotation.y *= Math.max(0, 1 - dt * 3);
            ag.rig.head.rotation.x += ((ag.state === 'graze' ? .4 : 0) - ag.rig.head.rotation.x) * Math.min(1, dt * 3);
            if (ag.timer < 0) {
                const r = rand(), apart = Math.hypot(other.x - ag.x, other.z - ag.z);
                if (leader) setGoal(ag, r < .5 ? 'walk' : r < .62 ? 'trot' : r < .82 ? 'graze' : r < .9 ? 'look' : 'frolic', other, leader);
                else setGoal(ag, apart > 1.8 ? 'walk' : r < .45 ? 'graze' : r < .7 ? 'look' : r < .85 ? 'frolic' : 'walk', other, leader);
            }
        }
        if (ag.state !== 'frolic') ag.hop *= Math.max(0, 1 - dt * 8);
        pose(ag, dt, time, ag.state === 'frolic' ? 'trot' : gait, gait === 'trot' ? 1.15 : .75);
        placeDeer(ag, dt);
    }

    function updateDog(dt: number, time: number) {
        const ag = dog;
        ag.timer -= dt;
        let gait: Gait = 'stand';
        const goal = dogStops[dogStop].s, dist = (goal - dogS) * dogDir;
        if (ag.state === 'run') {
            const here = dogAt(dogS);
            const cruise = here.airborne ? 2.3 : dist < 1.4 ? Math.max(.7, dist * 1.4) : 2.1;
            ag.speed += (cruise - ag.speed) * Math.min(1, dt * (cruise > ag.speed ? 2.5 : 5));
            dogS += dogDir * ag.speed * dt;
            gait = here.airborne || ag.speed > 1.25 ? 'gallop' : 'trot';
            ag.neckPitch = -.1;
            if ((goal - dogS) * dogDir <= 0) {
                dogS = goal;
                const stop = dogStops[dogStop].state as State | null;
                if (stop && rand() < .75) { ag.state = stop; ag.timer = stop === 'sit' ? 2.5 + rand() * 2 : stop === 'bow' ? 1.6 : 1.8; ag.wag = stop === 'sniff' ? 0 : ag.timer; ag.speed = 0; }
                else nextStop();
            }
        } else {
            ag.speed *= Math.max(0, 1 - dt * 8);
            if (ag.state === 'sniff') ag.neckPitch = .75 + Math.sin(time * 9) * .05;
            else if (ag.state === 'sit') ag.neckPitch = -.25;
            else if (ag.state === 'bow') ag.neckPitch = -.4;
            else if (ag.state === 'spin') {
                const t = 1.2 - ag.timer;
                dogSpin = wrap(dogSpin + dt * TAU / 1.2);
                ag.hop = Math.max(0, Math.sin(t / 1.2 * Math.PI * 2)) * .14;
                ag.neckPitch = -.3;
                gait = 'trot';
            }
            if (ag.timer < 0) { ag.hop = 0; dogSpin = 0; nextStop(); }
        }
        if (ag.state !== 'spin') ag.hop *= Math.max(0, 1 - dt * 8);
        const at = dogAt(dogS), fwd = dogAt(dogDir > 0 ? at.ahead : at.behind).p, back = dogAt(dogDir > 0 ? at.behind : at.ahead).p;
        const heading = Math.atan2(fwd.x - back.x, fwd.z - back.z);
        const prevYaw = ag.yaw;
        ag.yaw = wrap(ag.yaw + wrap(heading + dogSpin - ag.yaw) * Math.min(1, dt * (ag.state === 'spin' ? 30 : 10)));
        ag.yawRate = wrap(ag.yaw - prevYaw) / Math.max(dt, 1e-4);
        ag.x = at.p.x;
        ag.z = at.p.z;
        ag.y = at.p.y;
        pose(ag, dt, time, gait, gait === 'gallop' ? .8 : .45);
        dogRig.root.position.set(ag.x, ag.y + at.hop + ag.hop, ag.z);
        dogRig.root.rotation.y = ag.yaw;
        const slope = Math.atan2(fwd.y - back.y, Math.hypot(fwd.x - back.x, fwd.z - back.z));
        dogRig.root.rotation.x += (-slope * .9 - dogRig.root.rotation.x) * Math.min(1, dt * 8);
    }
    function nextStop() {
        let i = dogStop + dogDir;
        if (i < 0 || i >= dogStops.length) { dogDir = -dogDir; i = dogStop + dogDir; }
        dogStop = i;
        dog.state = 'run';
        dog.timer = 30;
    }
    let disposed = false;
    return {
        root,
        positions() { return { deer: new THREE.Vector3(a.x, a.y, a.z), fawn: new THREE.Vector3(b.x, b.y, b.z), dog: new THREE.Vector3(dog.x, dog.y, dog.z) }; },
        update(dt: number, time: number) {
            if (disposed) return;
            dt = Math.min(dt, .05);
            startle = Math.max(0, startle - dt);
            updateDeer(a, b, dt, time, true);
            updateDeer(b, a, dt, time, false);
            updateDog(dt, time);
        },
        /** Tap reactions: the fawns look up and trot off; the dog spins and wags. */
        trigger(event: string, from?: THREE.Vector3) {
            if (disposed) return false;
            if (event === 'animal.dog') {
                if (dog.state === 'spin') return false;
                dog.state = 'spin';
                dog.timer = 1.2;
                dog.wag = 3;
                return true;
            }
            if (event === 'animal.deer') {
                if (startle > 0) return false;  // still fleeing from the last tap
                startle = 3;
                for (const ag of [a, b]) {
                    const away = from ? Math.atan2(ag.x - from.x, ag.z - from.z) : rand() * TAU;
                    let route: [number, number][] | null = null;
                    for (let k = 0; k < 12 && !route; k++) {
                        const ang = away + (rand() - .5) * 1.4, d = 2.5 + rand() * 3;
                        const tx = ag.x + Math.sin(ang) * d, tz = ag.z + Math.cos(ang) * d;
                        if (walkable(tx, tz)) route = deerRoute(ag.x, ag.z, tx, tz);
                    }
                    ag.state = 'trot';
                    ag.leg = 0;
                    ag.route = route ?? pickTarget(ag, 2, 6) ?? [];
                    ag.timer = 8;
                }
                return true;
            }
            return false;
        },
        getState() { return { deer: [a.state, b.state], dog: dog.state, dogStop, dogProgress: dogS / dogPathLength }; },
        dispose() { disposed = true; root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
    };
}
