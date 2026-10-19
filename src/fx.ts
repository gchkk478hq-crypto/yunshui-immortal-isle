import * as THREE from 'three';
import { KoiState, WATER_Y, isWater, safeWater, seededRandom } from './koi-state';
import { createLakeSurface } from './lake';
import { createKoiMesh } from './koi';
import { createWaterfalls } from './waterfall';
import { natureUniforms } from './materials';
type Quality = 'high' | 'balanced' | 'low';
const TAU = Math.PI * 2;
/** Particle kinds: 0 magnolia petal, 1 green leaf, 2 maple leaf, 3 willow leaf, 4 peach petal. */
type Kind = 0 | 1 | 2 | 3 | 4;

function petalGeometry() {
    // Cupped oval petal, ~0.1 m long.
    const g = new THREE.BufferGeometry(), pos: number[] = [], idx: number[] = [];
    const rows = 4, cols = 4;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const v = j / rows, u = i / cols - .5, w = Math.sin(Math.PI * Math.min(1, v * 1.1 + .05)) * .5;
        const x = u * w * .09, z = (v - .35) * .11;
        pos.push(x, (x * x) * 18 + v * v * .012, z);
        if (i < cols && j < rows) { const k = j * (cols + 1) + i; idx.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

function leafGeometry() {
    // Lanceolate leaf folded along the midrib.
    const g = new THREE.BufferGeometry();
    const p = [0, 0, -.05, -.022, .006, -.012, 0, -.004, -.01, .022, .006, -.012, -.016, .004, .022, 0, -.003, .02, .016, .004, .022, 0, 0, .06];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 5, 4, 2, 3, 5, 3, 6, 5, 4, 5, 7, 5, 6, 7]);
    g.computeVertexNormals();
    return g;
}

function ringMaterial(foam: boolean) {
    return new THREE.ShaderMaterial({
        uniforms: { uAge: { value: 1 }, uStrength: { value: 1 }, uNight: natureUniforms.uSunGlow },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: foam ? /* glsl */`
 uniform float uAge; uniform float uStrength; uniform float uNight; varying vec2 vUv;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=vUv*2.-1.;float r=length(p);float bub=n(p*9.+uAge*3.)*.6+n(p*23.)*.4;
  float a=smoothstep(1.,.2,r)*smoothstep(.3+uAge*.5,.75,bub)*pow(1.-uAge,1.5)*uStrength;
  gl_FragColor=vec4(vec3(.92,.96,.95)*mix(.45,1.,uNight),a*.42);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }` : /* glsl */`
 uniform float uAge; uniform float uStrength; uniform float uNight; varying vec2 vUv;
 void main(){vec2 p=vUv*2.-1.;float r=length(p);float rings=0.;
  // A wavelet is a thin bright crest followed by a soft trough: light and shadow, not a white ring.
  float crest=0.,trough=0.;
  for(int k=0;k<3;k++){float rk=uAge-float(k)*.14;if(rk>0.){float w=.014+.02*uAge;float d=(r-rk)/w;float d2=(r-rk+w*1.8)/(w*1.6);float f=(1.-float(k)*.35);crest+=exp(-d*d)*f;trough+=exp(-d2*d2)*f;}}
  float fade=pow(1.-uAge,1.6)*uStrength*smoothstep(1.,.8,r);
  vec3 c=mix(vec3(.04,.1,.1),vec3(.8,.9,.88)*mix(.45,1.,uNight),crest/(crest+trough+.001));
  float a=(crest*.3+trough*.16)*fade;
  gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
}

export function createFX(scene: THREE.Scene, quality: Quality = 'balanced') {
    const root = new THREE.Group();
    root.name = 'LivingWaterAndNature';
    scene.add(root);
    const rand = seededRandom(4128), koi = new KoiState();
    let disposed = false, elapsed = 0, nightValue = 0, glintUntil = 0, reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), vel = new THREE.Vector3();
    const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
    const lakeSurface = createLakeSurface(quality), lake = lakeSurface.mesh;
    root.add(lake, lakeSurface.bed);
    const falls = createWaterfalls(root, uniforms, natureUniforms.uSunDir.value, lake);
    falls.setQuality(quality);
    function instances(name: string, geo: THREE.BufferGeometry, mat: THREE.Material, count: number) { const m = new THREE.InstancedMesh(geo, mat, count); m.name = name; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; root.add(m); return m; }
    function hide(mesh: THREE.InstancedMesh, index: number) { dummy.position.set(0, -100, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); }

    // ------------------------------------------------------------------ koi
    const school = createKoiMesh(60);
    root.add(school.mesh);
    const pellet = instances('FeedPellets', new THREE.SphereGeometry(.035, 8, 5), new THREE.MeshStandardMaterial({ color: '#b98d48', roughness: .7 }), 8);
    const pelletOffsets = Array.from({ length: 8 }, (_, i) => ({ x: (rand() - .5) * 1.7, z: (rand() - .5) * 1.5, start: rand() * .12, eaten: 1.9 + i * .28 + rand() * .5, landed: false, gone: false }));

    // -------------------------------------------------------------- ripples
    const ripplePool = Array.from({ length: 36 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMaterial(false)); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; root.add(m); return { m, age: 10, duration: 2.2, size: 1 }; });
    const foamPool = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMaterial(true)); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; root.add(m); return { m, age: 10, duration: 1, size: 1 }; });
    let rippleCursor = 0, foamCursor = 0;
    const pendingRipples: { at: number; x: number; z: number; size: number }[] = [];
    function ripple(x: number, z: number, size = 1) { const r = ripplePool[rippleCursor++ % ripplePool.length]; r.age = 0; r.duration = 1.5 + size * .9; r.size = .5 + size * 1.7; r.m.position.set(x, WATER_Y + .03 + (rippleCursor % 7) * .001, z); r.m.visible = true; (r.m.material as THREE.ShaderMaterial).uniforms.uStrength.value = Math.min(1, .45 + size * .6); }
    function foam(x: number, z: number, size = 1) { const f = foamPool[foamCursor++ % foamPool.length]; f.age = 0; f.duration = .7 + size * .5; f.size = .16 + size * .3; f.m.position.set(x, WATER_Y + .04, z); f.m.visible = true; }

    // ------------------------------------------------------- splash droplets
    const dropMat = new THREE.MeshStandardMaterial({ color: '#eaf8f6', roughness: .08, metalness: 0, transparent: true, opacity: .82, depthWrite: false });
    const splash = instances('KoiSplashDroplets', new THREE.SphereGeometry(1, 6, 4), dropMat, 160);
    const splashes = Array.from({ length: 160 }, () => ({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, r: .02 }));
    let splashCursor = 0;
    function droplet(x: number, z: number, vx: number, vy: number, vz: number, r: number, life: number) {
        const d = splashes[splashCursor++ % splashes.length];
        d.life = life; d.age = 0; d.x = x; d.y = WATER_Y + .04; d.z = z; d.vx = vx; d.vy = vy; d.vz = vz; d.r = r;
    }
    function burst(p: { x: number; z: number }, size: number) {
        ripple(p.x, p.z, size);
        pendingRipples.push({ at: elapsed + .25, x: p.x, z: p.z, size: size * .6 });
        foam(p.x, p.z, size);
        const crown = Math.round((reduced ? 4 : 10) * size);
        for (let i = 0; i < crown; i++) {
            const a = i / crown * TAU + rand() * .4, s = (.6 + rand() * .9) * size;
            droplet(p.x + Math.cos(a) * .08, p.z + Math.sin(a) * .08, Math.cos(a) * s, (1.4 + rand() * 1.6) * Math.sqrt(size), Math.sin(a) * s, .009 + rand() * .01, 1);
        }
        if (size > .6 && !reduced) for (let i = 0; i < 3; i++) droplet(p.x, p.z, (rand() - .5) * .3, 2.2 + rand() * 1.2, (rand() - .5) * .3, .02 - i * .004, 1);
    }

    // --------------------------------------------- falling petals & leaves
    const particles = Array.from({ length: 120 }, () => ({ life: 0, age: 0, x: 0, y: 0, z: 0, vy: 0, wx: 0, wz: 0, phase: 0, freq: 2, amp: .3, spin: 0, seed: 0, kind: 0 as Kind, floating: false }));
    const petalMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .65, side: THREE.DoubleSide });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7, side: THREE.DoubleSide });
    const petals = instances('MagnoliaPetalPool', petalGeometry(), petalMat, 120);
    const leaves = instances('GreenLeafPool', leafGeometry(), leafMat, 120);
    const tint = new THREE.Color();
    const cooldown = new Map<string, number>();
    const tremors: { age: number; point: THREE.Vector3; count: number; kind: Kind; released: boolean }[] = [];
    function spawn(point: THREE.Vector3, count: number, kind: Kind) { for (let j = 0; j < count; j++) {
        const index = particles.findIndex(p => p.life <= 0);
        if (index < 0)
            break;
        const p = particles[index];
        p.life = 5.5 + rand() * 3;
        p.age = 0;
        p.x = point.x + (rand() - .5) * 2.2;
        p.y = Math.max(point.y, .9) + rand() * .9;
        p.z = point.z + (rand() - .5) * 2.2;
        p.vy = -(.32 + rand() * .22) * (kind === 0 ? .85 : 1);
        p.wx = .18 + rand() * .2;
        p.wz = (rand() - .5) * .16;
        p.phase = rand() * TAU;
        p.freq = 1.7 + rand() * 1.2;
        p.amp = .22 + rand() * .3;
        p.spin = (rand() - .5) * 1.6;
        p.seed = rand() * TAU;
        p.kind = kind;
        p.floating = false;
        if (kind === 0) tint.setRGB(1, .9 + rand() * .1, .9 + rand() * .08);
        else if (kind === 4) tint.setRGB(.98, .7 + rand() * .1, .76 + rand() * .08);
        else if (kind === 1) tint.setHSL(.24 + rand() * .06, .55, .32 + rand() * .12);
        else if (kind === 2) tint.setHSL(.01 + rand() * .07, .85, .42 + rand() * .1);
        else tint.setHSL(.2 + rand() * .04, .6, .45 + rand() * .1);
        (kind === 0 || kind === 4 ? petals : leaves).setColorAt(index, tint);
    } petals.instanceColor && (petals.instanceColor.needsUpdate = true); leaves.instanceColor && (leaves.instanceColor.needsUpdate = true); }
    for (let i = 0; i < 120; i++) { petals.setColorAt(i, tint.set('#fff6ee')); leaves.setColorAt(i, tint.set('#6b984d')); }

    const musicRipples: { at: number; x: number; z: number }[] = [];
    let nextNatural = 9 + rand() * 7;
    function update(dt: number, time: number, night: number) {
        if (disposed)
            return;
        dt = Math.max(0, Math.min(dt, .1));
        elapsed += dt;
        nightValue = night;
        uniforms.uTime.value = time;
        uniforms.uNight.value = night;
        lakeSurface.update(time, night);
        school.uniforms.uGlint.value = Math.max(0, Math.min(1, (glintUntil - elapsed) / 3));
        for (let i = musicRipples.length - 1; i >= 0; i--)
            if (musicRipples[i].at <= elapsed) {
                const p = musicRipples.splice(i, 1)[0];
                ripple(p.x, p.z, .35);
            }
        for (let i = pendingRipples.length - 1; i >= 0; i--)
            if (pendingRipples[i].at <= elapsed) {
                const p = pendingRipples.splice(i, 1)[0];
                ripple(p.x, p.z, p.size);
            }
        koi.update(dt);
        const fishCount = quality === 'low' ? 30 : 60;
        school.mesh.count = fishCount;
        for (let i = 0; i < fishCount; i++) {
            const f = koi.fish[i];
            const y = reduced && f.y > WATER_Y ? WATER_Y + (f.y - WATER_Y) * .5 : f.y;
            dummy.position.set(f.x, y, f.z);
            dummy.rotation.set(-f.pitch, f.yaw, f.roll, 'YXZ');
            dummy.scale.setScalar(f.size);
            dummy.updateMatrix();
            school.mesh.setMatrixAt(i, dummy.matrix);
            school.motion.setXYZW(i, f.swim, f.bend, reduced ? f.tailAmp * .5 : f.tailAmp, f.fin);
        }
        school.mesh.instanceMatrix.needsUpdate = true;
        school.motion.needsUpdate = true;
        for (const p of koi.surfacings)
            ripple(p.x, p.z, .25);
        for (const p of koi.breaches)
            burst(p, .45);
        for (const p of koi.landings)
            burst(p, .85);
        // Food: falls in, floats and bobs, then is taken from below.
        for (let i = 0; i < 8; i++) {
            const p = pelletOffsets[i];
            if (koi.phase === 'idle' || i >= koi.pellets) {
                p.landed = false;
                p.gone = false;
                hide(pellet, i);
                continue;
            }
            const t = Math.max(0, koi.elapsed - p.start), height = Math.max(0, 1.6 - 4.9 * t * t);
            const x = koi.target.x + p.x, z = koi.target.z + p.z;
            if (height === 0 && !p.landed) {
                p.landed = true;
                ripple(x, z, .12);
            }
            if (koi.elapsed > p.eaten && !p.gone) {
                p.gone = true;
                ripple(x, z, .3);
                droplet(x, z, 0, .9, 0, .012, .5);
            }
            if (p.gone) {
                hide(pellet, i);
                continue;
            }
            dummy.position.set(x + Math.sin(time * 1.3 + i) * .02, WATER_Y + .015 + height + (p.landed ? Math.sin(time * 3 + i * 1.7) * .006 : 0), z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(1);
            dummy.updateMatrix();
            pellet.setMatrixAt(i, dummy.matrix);
        }
        pellet.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < splashes.length; i++) {
            const d = splashes[i];
            if (d.life <= 0) {
                hide(splash, i);
                continue;
            }
            d.age += dt;
            d.vy -= 9.8 * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
            if (d.y < WATER_Y || d.age > d.life) {
                if (d.r > .017 && d.y < WATER_Y && isWater(d))
                    ripple(d.x, d.z, .1);
                d.life = 0;
                hide(splash, i);
                continue;
            }
            vel.set(d.vx, d.vy, d.vz);
            const speed = vel.length();
            dummy.position.set(d.x, d.y, d.z);
            dummy.quaternion.setFromUnitVectors(up, vel.multiplyScalar(1 / Math.max(speed, 1e-4)));
            dummy.scale.set(d.r, d.r * (1 + speed * .45), d.r);
            dummy.updateMatrix();
            dummy.rotation.set(0, 0, 0);
            splash.setMatrixAt(i, dummy.matrix);
        }
        splash.instanceMatrix.needsUpdate = true;
        for (const [key, until] of cooldown)
            if (until < elapsed)
                cooldown.delete(key);
        for (const r of ripplePool) {
            if (!r.m.visible)
                continue;
            r.age += dt;
            if (r.age >= r.duration) {
                r.m.visible = false;
                continue;
            }
            const u = r.age / r.duration;
            r.m.scale.setScalar(r.size);
            (r.m.material as THREE.ShaderMaterial).uniforms.uAge.value = u;
        }
        for (const f of foamPool) {
            if (!f.m.visible)
                continue;
            f.age += dt;
            if (f.age >= f.duration) {
                f.m.visible = false;
                continue;
            }
            const u = f.age / f.duration;
            f.m.scale.setScalar(f.size * (1 + u * .8));
            (f.m.material as THREE.ShaderMaterial).uniforms.uAge.value = u;
        }
        for (let j = tremors.length - 1; j >= 0; j--) {
            const t = tremors[j];
            t.age += dt;
            if (t.age > .28 && !t.released) {
                spawn(t.point, t.count, t.kind);
                t.released = true;
            }
            if (t.age > .7)
                tremors.splice(j, 1);
        }
        const wind = natureUniforms.uWind.value;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (p.life <= 0) {
                hide(petals, i);
                hide(leaves, i);
                continue;
            }
            p.age += dt;
            const mesh = p.kind === 0 || p.kind === 4 ? petals : leaves;
            if (!p.floating) {
                // Falling-leaf pendulum: sideways swing with matching tilt, faster drop through the swing's bottom.
                p.phase += p.freq * dt;
                const swing = Math.cos(p.phase), sx = Math.cos(p.seed), sz = Math.sin(p.seed);
                p.x += dt * (p.wx * wind + sx * swing * p.amp * p.freq * .5);
                p.z += dt * (p.wz * wind + sz * swing * p.amp * p.freq * .5);
                p.y += dt * p.vy * (.55 + .9 * Math.abs(Math.sin(p.phase)));
                dummy.position.set(p.x, p.y, p.z);
                dummy.rotation.set(Math.sin(p.phase) * .9 * sz, p.seed + p.age * p.spin, -Math.sin(p.phase) * .9 * sx, 'YXZ');
                if (p.y <= WATER_Y + .012) {
                    if (isWater(p)) {
                        p.floating = true;
                        p.y = WATER_Y + .012;
                        p.life = Math.min(p.age + 3.5, 9.6);
                        ripple(p.x, p.z, .14);
                    }
                    else if (p.y < .18) {
                        p.life = 0;
                    }
                }
            }
            else {
                // Floating petals drift on the lake surface and slowly fade.
                p.x += dt * .05 * wind;
                p.z += dt * .02 * Math.sin(p.seed + p.age * .3);
                dummy.position.set(p.x, WATER_Y + .012 + Math.sin(time * 1.6 + p.seed) * .004, p.z);
                dummy.rotation.set(Math.sin(time + p.seed) * .06, p.seed + p.age * .05, Math.cos(time * 1.2 + p.seed) * .06, 'YXZ');
            }
            if (p.age >= p.life || p.life <= 0) {
                p.life = 0;
                hide(petals, i);
                hide(leaves, i);
                continue;
            }
            const fade = Math.min(1, (p.life - p.age) * 1.2, p.age * 6);
            dummy.scale.setScalar((p.kind === 0 ? 1.6 : p.kind === 4 ? 1.1 : p.kind === 2 ? 1.7 : 1.45) * fade);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            hide(p.kind === 0 || p.kind === 4 ? leaves : petals, i);
        }
        petals.instanceMatrix.needsUpdate = true;
        leaves.instanceMatrix.needsUpdate = true;
        if (elapsed > nextNatural) {
            nextNatural = elapsed + 8 + rand() * 13;
            const trees: THREE.Object3D[] = [];
            scene.traverse(o => { if (o.userData.event === 'flora.magnolia' && o instanceof THREE.Mesh)
                trees.push(o); });
            if (trees.length) {
                const tree = trees[Math.floor(rand() * trees.length)], p = new THREE.Vector3();
                new THREE.Box3().setFromObject(tree).getCenter(p);
                if (p.y < 1)
                    p.y += 3;
                spawn(p, reduced ? 1 : 2, 0);
            }
        }
    }
    function kindFor(event: string, object?: THREE.Object3D): Kind {
        if (event === 'flora.magnolia')
            return (object?.name ?? '').startsWith('Peach') ? 4 : 0;
        const name = object?.name ?? '';
        return name.startsWith('Maple') ? 2 : name.startsWith('Willow') ? 3 : 1;
    }
    function trigger(event: string, point: THREE.Vector3, object?: THREE.Object3D) { if (disposed)
        return false; if (event === 'character.guzheng') {
        const p = safeWater(point);
        ripple(p.x, p.z, .35);
        if (musicRipples.length < 6) {
            musicRipples.push({ at: elapsed + .8, ...p }, { at: elapsed + 1.6, ...p });
        }
        return true;
    } if (event === 'secret.musicKoi' || event === 'musicKoi') {
        glintUntil = elapsed + 3;
        return true;
    } if (event === 'lake.feed') {
        if (!isWater(point, .1))
            return false;
        if (!koi.trigger(point))
            return false;
        ripple(point.x, point.z, .5);
        pelletOffsets.forEach(p => { p.landed = false; p.gone = false; });
        return true;
    } if (event === 'flora.magnolia' || event === 'flora.leaves') {
        const key = object?.userData.tree?.name ?? object?.uuid ?? `${event}:${Math.round(point.x)}:${Math.round(point.z)}`;
        if ((cooldown.get(key) ?? -10) > elapsed)
            return false;
        cooldown.set(key, elapsed + 2.5);
        const kind = kindFor(event, object), count = reduced ? (kind ? 8 : 15) : (kind ? 14 : 20);
        if (object)
            tremors.push({ age: 0, point: point.clone(), count, kind, released: false });
        else
            spawn(point, count, kind);
        return true;
    } return false; }
    update(0, 0, 0);
    return { lake, update, trigger, setQuality(value: Quality) { quality = value; lakeSurface.setQuality(value); falls.setQuality(value); }, setReducedMotion(value: boolean) { reduced = value; }, getState() { return { ...koi.snapshot(), quality, night: nightValue, activePetals: particles.filter(p => p.life > 0 && (p.kind === 0 || p.kind === 4)).length, activeLeaves: particles.filter(p => p.life > 0 && p.kind !== 0 && p.kind !== 4).length, activeRipples: ripplePool.filter(r => r.m.visible).length, particleCapacity: particles.length, activeSplash: splashes.filter(p => p.life > 0).length, splashCapacity: splashes.length, waterfallCount: falls.count, disposed }; }, dispose() { if (disposed)
            return; disposed = true; root.removeFromParent(); lakeSurface.dispose(); const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); root.traverse(o => { if (o instanceof THREE.Mesh) {
            geometries.add(o.geometry);
            for (const m of Array.isArray(o.material) ? o.material : [o.material])
                materials.add(m);
        } }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); cooldown.clear(); tremors.length = 0; } };
}
