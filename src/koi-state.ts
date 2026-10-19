import { shorelineRadius } from './landscape';
/** Deterministic, renderer-independent, bounded koi choreography. Units: metres/seconds. */
export type KoiPhase = 'idle' | 'feedDrop' | 'gathering' | 'leaping' | 'returning' | 'settling';
export type Point = {
    x: number;
    z: number;
};
export const FISH_COUNT = 60;
export const WATER_Y = .25;
export const GRAVITY = 9.8;
const TAU = Math.PI * 2;
/** Body centre depth when a leap starts/ends: the fish breaks the surface already moving. */
const LAUNCH_Y = WATER_Y - .2;
// Asset contract footprints include deck edges and low lakeside walkways.
// v4 layout: arch bridge, mountain-foot landing, hexagonal lake pavilion, zigzag bridge, 水榭 and its deck.
export const obstacles = [{ x: -3.38, z: -3.6, rx: 2.5, rz: .9 }, { x: .9, z: -4.55, rx: 2.25, rz: 1.85 }, { x: -8, z: -3, rx: 1.9, rz: 1.9 }, { x: -13.1, z: -3.1, rx: 2.95, rz: .85 }, { x: 13, z: 5.8, rx: 2.65, rz: 2.05 }, { x: 10.1, z: 5.8, rx: .9, rz: 1.3 }];
export function isWater(p: Point, margin = 0) { return Number.isFinite(p.x) && Number.isFinite(p.z) && p.x * p.x / (18 - margin) ** 2 + p.z * p.z / (9 - margin) ** 2 < shorelineRadius(Math.atan2(p.z / (9 - margin), p.x / (18 - margin))) ** 2 && !obstacles.some(o => Math.abs(p.x - o.x) < o.rx + margin && Math.abs(p.z - o.z) < o.rz + margin); }
export function safeWater(p: Point, margin = .45): Point {
    let x = Number.isFinite(p.x) ? p.x : 0, z = Number.isFinite(p.z) ? p.z : 2;
    for (let k = 0; k < 5; k++) {
        const r = Math.sqrt(x * x / (18 - margin) ** 2 + z * z / (9 - margin) ** 2) / shorelineRadius(Math.atan2(z / (9 - margin), x / (18 - margin)));
        if (r > .985) {
            x *= .985 / r;
            z *= .985 / r;
        }
        for (const o of obstacles) {
            const dx = x - o.x, dz = z - o.z, rx = o.rx + margin, rz = o.rz + margin;
            if (Math.abs(dx) < rx && Math.abs(dz) < rz) {
                if (rx - Math.abs(dx) < rz - Math.abs(dz))
                    x = o.x + Math.sign(dx || 1) * (rx + .01);
                else
                    z = o.z + Math.sign(dz || 1) * (rz + .01);
            }
        }
    }
    if (!isWater({ x, z }, margin)) {
        const xs = [x, ...obstacles.flatMap(o => [o.x - o.rx - margin - .025, o.x + o.rx + margin + .025])];
        const zs = [z, ...obstacles.flatMap(o => [o.z - o.rz - margin - .025, o.z + o.rz + margin + .025])];
        let best: Point = { x: 0, z: 2 }, distance = Infinity;
        for (const cx of xs)
            for (const cz of zs) {
                const q = { x: cx, z: cz };
                if (isWater(q, margin)) {
                    const d = (cx - x) ** 2 + (cz - z) ** 2;
                    if (d < distance) {
                        best = q;
                        distance = d;
                    }
                }
            }
        return best;
    }
    return { x, z };
}
export function seededRandom(seed = 7183) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const smooth = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a: number, b: number, k: number) => a + wrap(b - a) * k;
export interface Fish {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    /** Lateral C-curve of the body (radians-ish), positive bends the tail to +x. */
    bend: number;
    roll: number;
    /** Accumulated tail-beat phase and its amplitude (0..1.5). */
    swim: number;
    tailAmp: number;
    fin: number;
    speed: number;
    size: number;
    variant: number;
    seed: number;
    from: Point;
    gather: Point;
    end: Point;
    away: Point;
    dir: Point;
    leapStart: number;
    duration: number;
    height: number;
    vy0: number;
    vh: number;
    landed: boolean;
    surfaced: boolean;
    /** Only the koi nearest the food leap; the rest mill and nibble below. */
    leaps: boolean;
}
export class KoiState {
    readonly fish: Fish[] = [];
    readonly random: () => number;
    phase: KoiPhase = 'idle';
    elapsed = 0;
    time = 0;
    shows = 0;
    pellets = 0;
    target: Point = { x: 0, z: 2 };
    /** Per-update events for the renderer: entries, exits and idle surface kisses. */
    landings: Point[] = [];
    breaches: Point[] = [];
    surfacings: Point[] = [];
    constructor(seed = 7183) { this.random = seededRandom(seed); for (let i = 0; i < FISH_COUNT; i++) {
        const a = this.random() * TAU, r = Math.sqrt(this.random());
        const p = safeWater({ x: Math.cos(a) * 16 * r, z: Math.sin(a) * 7 * r });
        this.fish.push({ ...p, y: -.38 - this.random() * .75, yaw: this.random() * TAU, pitch: 0, bend: 0, roll: 0, swim: this.random() * TAU, tailAmp: .6, fin: 0, speed: .25, size: .62 + this.random() * .3, variant: i % 6, seed: this.random() * TAU, from: { ...p }, gather: { ...p }, end: { ...p }, away: { ...p }, dir: { x: 0, z: 1 }, leapStart: 0, duration: 1, height: 1, vy0: 4, vh: 1, landed: false, surfaced: false, leaps: false });
    } }
    trigger(p: Point) { if (this.phase !== 'idle' || !isWater(p, .1))
        return false; this.target = { ...p }; this.phase = 'feedDrop'; this.elapsed = 0; this.shows++; this.pellets = this.random() < .5 ? 7 : 8;
        const leapers = 18 + Math.floor(this.random() * 8);
        const order = this.fish.map((f, i) => ({ i, d: Math.hypot(f.x - p.x, f.z - p.z) })).sort((a, b) => a.d - b.d);
        order.forEach((o, rank) => { this.fish[o.i].leaps = rank < leapers; });
        for (const f of this.fish) {
        f.from = { x: f.x, z: f.z };
        const a = this.random() * TAU, r = f.leaps ? .45 + this.random() * 2.4 : 1.1 + this.random() * 2.6;
        let gather = safeWater({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r });
        // Koi burst at 2-3.4 m/s; distant fish leap wherever their dash ends.
        const sprint = 2.1 + this.random() * 1.3, maxTravel = sprint * 3.2;
        let dx = gather.x - f.x, dz = gather.z - f.z, d = Math.hypot(dx, dz);
        if (d > maxTravel) {
            gather = safeWater({ x: f.x + dx / d * maxTravel, z: f.z + dz / d * maxTravel });
            dx = gather.x - f.x; dz = gather.z - f.z; d = Math.hypot(dx, dz);
        }
        f.gather = gather;
        f.leapStart = Math.min(5.2, .6 + Math.max(.55, d / sprint) + this.random() * 1.9);
        f.height = .35 + this.random() * .85;
        f.vy0 = Math.sqrt(2 * GRAVITY * f.height);
        f.duration = 2 * f.vy0 / GRAVITY;
        const heading = d > .05 ? Math.atan2(dx, dz) : this.random() * TAU;
        const leapYaw = heading + (this.random() - .5) * 1.2;
        f.vh = .7 + this.random() * .8;
        let end = safeWater({ x: gather.x + Math.sin(leapYaw) * f.vh * f.duration, z: gather.z + Math.cos(leapYaw) * f.vh * f.duration });
        const ex = end.x - gather.x, ez = end.z - gather.z, el = Math.hypot(ex, ez);
        if (el < .2) end = gather;
        f.dir = el < .2 ? { x: Math.sin(leapYaw), z: Math.cos(leapYaw) } : { x: ex / el, z: ez / el };
        f.vh = el / f.duration;
        f.end = end;
        f.away = safeWater({ x: end.x + (end.x - p.x) * 1.35, z: end.z + (end.z - p.z) * 1.35 });
        f.landed = false;
        if (!f.leaps) {
            // Millers arrive more calmly and stay below.
            f.leapStart = 99;
            f.end = gather;
            f.away = safeWater({ x: gather.x + (gather.x - p.x) * 1.2, z: gather.z + (gather.z - p.z) * 1.2 });
        }
    } return true; }
    private idle(f: Fish, dt: number) {
        const t = this.time;
        const turn = Math.sin(t * .37 + f.seed * 3) * .42 + Math.sin(t * .13 + f.seed * 7) * .3;
        let yawRate = turn;
        const look = 1.2 + f.speed * 2;
        const ahead = { x: f.x + Math.sin(f.yaw) * look, z: f.z + Math.cos(f.yaw) * look };
        if (!isWater(ahead, .55)) {
            // Steer smoothly back towards open water instead of flipping around.
            const left = { x: f.x + Math.sin(f.yaw + .9) * look, z: f.z + Math.cos(f.yaw + .9) * look };
            yawRate = isWater(left, .55) ? 1.6 : -1.6;
        }
        f.yaw = wrap(f.yaw + yawRate * dt);
        const cruise = .2 + .16 * (.5 + .5 * Math.sin(t * .5 + f.seed * 2));
        f.speed += (cruise - f.speed) * Math.min(1, dt * 1.5);
        const p = safeWater({ x: f.x + Math.sin(f.yaw) * f.speed * dt, z: f.z + Math.cos(f.yaw) * f.speed * dt });
        f.x = p.x;
        f.z = p.z;
        // Now and then a koi rises to kiss the surface.
        const rise = smooth((Math.sin(t * .09 + f.seed * 5) - .93) / .07);
        const y = -.48 + Math.sin(t * .4 + f.seed) * .12 + rise * .3;
        f.pitch += (Math.atan2(y - f.y, Math.max(.05, f.speed * dt)) * .15 - f.pitch) * Math.min(1, dt * 3);
        f.y = y;
        if (rise > .95 && !f.surfaced) {
            f.surfaced = true;
            this.surfacings.push({ x: f.x + Math.sin(f.yaw) * .35, z: f.z + Math.cos(f.yaw) * .35 });
        }
        if (rise < .5)
            f.surfaced = false;
        f.bend += (yawRate * .22 - f.bend) * Math.min(1, dt * 4);
        f.roll *= Math.max(0, 1 - dt * 3);
        f.tailAmp += (.45 + f.speed * 1.6 - f.tailAmp) * Math.min(1, dt * 3);
        f.swim += dt * (4.5 + f.speed * 11);
        f.fin += dt * 2.4;
    }
    update(dt: number) {
        if (!Number.isFinite(dt) || dt <= 0)
            return;
        this.time += dt;
        this.landings.length = 0;
        this.breaches.length = 0;
        this.surfacings.length = 0;
        if (this.phase !== 'idle') {
            this.elapsed += dt;
            const t = this.elapsed;
            this.phase = t < .6 ? 'feedDrop' : t < 1.8 ? 'gathering' : t < 4.5 ? 'leaping' : t < 6.5 ? 'returning' : t < 8 ? 'settling' : 'idle';
            if (t >= 8) {
                this.pellets = 0;
                this.elapsed = 0;
            }
        }
        for (const f of this.fish) {
            if (this.phase === 'idle') {
                this.idle(f, dt);
                continue;
            }
            const oldX = f.x, oldZ = f.z, oldY = f.y;
            const t = this.elapsed;
            let yawTarget: number | null = null;
            if (t < .6) {
                // Startled attention: turn towards the falling food.
                yawTarget = Math.atan2(f.gather.x - f.x, f.gather.z - f.z);
                f.tailAmp += (1 - f.tailAmp) * Math.min(1, dt * 4);
                f.swim += dt * 9;
            }
            else if (!f.leaps) {
                const arrive = smooth((t - .6) / 2.4);
                const circle = (t - .6) * (.5 + (f.seed % 1) * .4) + f.seed;
                const mill = { x: f.gather.x + Math.cos(circle) * .5, z: f.gather.z + Math.sin(circle) * .5 };
                const leave = smooth((t - 6.2) / 1.8);
                f.x = f.from.x + (mill.x - f.from.x) * arrive;
                f.z = f.from.z + (mill.z - f.from.z) * arrive;
                f.x += (f.away.x - f.x) * leave;
                f.z += (f.away.z - f.z) * leave;
                // Nibbling: rise towards the floating food, then sink back.
                const nibble = smooth((Math.sin(t * 1.7 + f.seed * 3) - .55) / .45) * (1 - leave) * arrive;
                f.y = -.55 + nibble * .42;
                f.pitch += ((nibble > .1 ? .35 : 0) - f.pitch) * Math.min(1, dt * 3);
                if (nibble > .95 && !f.surfaced) {
                    f.surfaced = true;
                    this.surfacings.push({ x: f.x + Math.sin(f.yaw) * .3, z: f.z + Math.cos(f.yaw) * .3 });
                }
                if (nibble < .4)
                    f.surfaced = false;
                f.tailAmp += (.9 - f.tailAmp) * Math.min(1, dt * 3);
                f.swim += dt * 9;
                f.bend += (.25 * Math.sin(circle) - f.bend) * Math.min(1, dt * 2);
            }
            else if (t < f.leapStart) {
                const span = f.leapStart - .6, u = (t - .6) / span;
                const e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
                f.x = f.from.x + (f.gather.x - f.from.x) * e;
                f.z = f.from.z + (f.gather.z - f.from.z) * e;
                // Dive slightly, then drive up to break the surface.
                const runUp = smooth((t - (f.leapStart - .5)) / .5);
                f.y = -.6 + Math.sin(u * Math.PI) * -.08 + (LAUNCH_Y + .6) * runUp * runUp;
                const launch = Math.atan2(f.vy0, f.vh);
                const moving = Math.atan2((f.y - oldY) / dt, Math.max(.2, Math.hypot(f.x - oldX, f.z - oldZ) / dt));
                f.pitch = moving + (launch - moving) * smooth((t - (f.leapStart - .3)) / .3);
                yawTarget = t > f.leapStart - .35 ? Math.atan2(f.dir.x, f.dir.z) : null;
                f.tailAmp += (1.3 + runUp * .4 - f.tailAmp) * Math.min(1, dt * 5);
                f.swim += dt * (10 + runUp * 10);
                f.bend *= Math.max(0, 1 - dt * 4);
            }
            else if (t < f.leapStart + f.duration) {
                const tau = t - f.leapStart, u = tau / f.duration;
                if (oldY < WATER_Y && LAUNCH_Y + f.vy0 * tau - .5 * GRAVITY * tau * tau >= WATER_Y)
                    this.breaches.push({ x: f.gather.x + f.dir.x * f.vh * tau, z: f.gather.z + f.dir.z * f.vh * tau });
                f.x = f.gather.x + f.dir.x * f.vh * tau;
                f.z = f.gather.z + f.dir.z * f.vh * tau;
                f.y = LAUNCH_Y + f.vy0 * tau - .5 * GRAVITY * tau * tau;
                // Nose follows the velocity: steep exit, level apex, steep entry.
                f.pitch = Math.atan2(f.vy0 - GRAVITY * tau, f.vh);
                f.yaw = Math.atan2(f.dir.x, f.dir.z);
                const side = f.seed > Math.PI ? 1 : -1;
                f.bend = side * (.55 * Math.sin(Math.PI * u) + .25 * Math.sin(TAU * u * 1.5) * (1 - u));
                f.roll = side * .35 * Math.sin(Math.PI * u);
                f.tailAmp = 1.4 * (1 - smooth(u * 4)) + 1.1 * smooth((u - .78) * 5);
                f.swim += dt * (6 + 14 * f.tailAmp);
            }
            else {
                if (!f.landed) {
                    this.landings.push({ ...f.end });
                    f.landed = true;
                }
                const ta = t - (f.leapStart + f.duration);
                // Entry momentum carries the koi on and down, then it levels out.
                const v0 = f.vh + 1.1, k = 2.2, glide = v0 / k * (1 - Math.exp(-k * ta));
                const glidePos = safeWater({ x: f.end.x + f.dir.x * glide, z: f.end.z + f.dir.z * glide });
                const u = smooth((t - 6.2) / 1.8);
                f.x = glidePos.x + (f.away.x - glidePos.x) * u;
                f.z = glidePos.z + (f.away.z - glidePos.z) * u;
                f.y = LAUNCH_Y - .62 * (1 - Math.exp(-3 * ta)) + .1 * smooth((ta - 1) / 1.5) - Math.sin(f.seed) * .08 * smooth(ta / 2);
                f.pitch = -Math.atan2(f.vy0, f.vh) * Math.exp(-3.2 * ta);
                f.bend *= Math.max(0, 1 - dt * 3);
                f.roll *= Math.max(0, 1 - dt * 4);
                f.tailAmp += (.7 - f.tailAmp) * Math.min(1, dt * 2);
                f.swim += dt * (6 + 5 * f.tailAmp);
                if (ta > .6)
                    yawTarget = Math.hypot(f.x - oldX, f.z - oldZ) > .0005 ? Math.atan2(f.x - oldX, f.z - oldZ) : null;
            }
            const p = safeWater(f);
            f.x = p.x;
            f.z = p.z;
            if (yawTarget === null && Math.hypot(f.x - oldX, f.z - oldZ) > .002 && (t < f.leapStart || !f.leaps))
                yawTarget = Math.atan2(f.x - oldX, f.z - oldZ);
            if (yawTarget !== null)
                f.yaw = wrap(lerpAngle(f.yaw, yawTarget, Math.min(1, dt * 7)));
            f.speed = Math.hypot(f.x - oldX, f.z - oldZ) / dt;
            f.fin += dt * 6;
        }
    }
    snapshot() { return { phase: this.phase, elapsed: +this.elapsed.toFixed(3), shows: this.shows, pelletCount: this.pellets, fishCount: this.fish.length, airborne: this.fish.filter(f => f.y > WATER_Y).length, leapers: this.fish.filter(f => f.leaps).length, target: { ...this.target }, poolCapacity: FISH_COUNT }; }
}
