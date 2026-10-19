import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintCharacterTexture, type CharacterTexture } from './characterTextures';

/**
 * The two pavilion figures and the guzheng. v8: the man and the woman are
 * Blender-built models (public/assets/models/characters.glb, from
 * asset_sources/scripts/characters_v8.py) after the two hanfu reference sheets;
 * the guzheng, its table and the stool stay authored here. The GLB arrives
 * asynchronously and is attached with `attach(model)`; animation drives the
 * named pivots inside it. Coordinates are local to the music pavilion floor.
 */
type V3 = [number, number, number];

export function createCharacters(scene: THREE.Scene, model?: THREE.Object3D | null) {
    const root = new THREE.Group();
    root.name = 'MusicPavilionCharacters';
    root.position.set(-18, 0.7, 3);
    scene.add(root);
    const materials: THREE.Material[] = [];
    const geometries = new Set<THREE.BufferGeometry>();
    const textures: THREE.Texture[] = [];

    function plain(color: number, roughness = .6, metalness = 0, extra: THREE.MeshPhysicalMaterialParameters = {}) {
        const m = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
        materials.push(m);
        return m;
    }
    const darkWood = plain(0x2e2018, .55, 0, { clearcoat: .6, clearcoatRoughness: .35 });
    const paulownia = plain(0x7a5a3e, .5, 0, { clearcoat: .9, clearcoatRoughness: .2 });
    const ivoryBone = plain(0xcfc3a8, .45);
    const stringMat = plain(0xcfc4a6, .3, .55);

    function keep(g: THREE.BufferGeometry) { geometries.add(g); return g; }
    function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: V3 = [0, 0, 0]) {
        const mesh = new THREE.Mesh(keep(g), m);
        mesh.position.set(...p);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }
    /** Smooth tapered tube along a polyline. */
    function tube(points: V3[], radii: number[], sides = 10) {
        const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
        const n = Math.max(8, points.length * 6), pos: number[] = [], idx: number[] = [];
        const frames = curve.computeFrenetFrames(n, false);
        for (let j = 0; j <= n; j++) {
            const t = j / n, p = curve.getPointAt(t), f = t * (radii.length - 1), i0 = Math.min(radii.length - 2, Math.floor(f));
            const r = radii[i0] + (radii[i0 + 1] - radii[i0]) * (f - i0);
            for (let k = 0; k < sides; k++) {
                const a = k / sides * Math.PI * 2;
                const d = frames.normals[j].clone().multiplyScalar(Math.cos(a) * r).add(frames.binormals[j].clone().multiplyScalar(Math.sin(a) * r));
                pos.push(p.x + d.x, p.y + d.y, p.z + d.z);
                if (j) { const a0 = (j - 1) * sides + k, b0 = (j - 1) * sides + (k + 1) % sides; idx.push(a0, b0, a0 + sides, b0, b0 + sides, a0 + sides); }
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    }
    function placed(g: THREE.BufferGeometry, p: V3, rot: V3 = [0, 0, 0]) {
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
        return g;
    }
    /** Merge all static meshes of a group per material to keep draw calls low. */
    function bake(group: THREE.Group) {
        const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
        for (const child of [...group.children]) {
            if (!(child instanceof THREE.Mesh)) continue;
            child.updateMatrix();
            const g = child.geometry.clone().applyMatrix4(child.matrix);
            for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
            const flat = g.index ? g.toNonIndexed() : g;
            if (flat !== g) g.dispose();
            const list = buckets.get(child.material as THREE.Material) ?? [];
            list.push(flat);
            buckets.set(child.material as THREE.Material, list);
            group.remove(child);
            geometries.delete(child.geometry);
            child.geometry.dispose();
        }
        for (const [m, list] of buckets) {
            const g = mergeGeometries(list);
            list.forEach(x => x.dispose());
            if (g) add(group, g, m);
        }
    }

    // ------------------------------------------------------------- guzheng
    const zheng = new THREE.Group();
    zheng.name = 'Guzheng';
    zheng.userData.event = 'character.guzheng';
    zheng.position.set(-.62, 0, .32);
    root.add(zheng);
    const zhengStatic = new THREE.Group();
    zheng.add(zhengStatic);
    const L = 1.63, TOP = .7;
    {
        // Arched soundboard rising slightly at the head end, closed box with tapered tail.
        const nx = 48, nz = 10, pos: number[] = [], idx: number[] = [];
        const width = (u: number) => .18 - .035 * u;
        const height = (u: number) => TOP + .04 * (1 - u) ** 2;
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
            const u = i / nx, v = j / nz * 2 - 1, w = width(u);
            pos.push(-L / 2 + L * u, height(u) + .028 * (1 - v * v), v * w);
            if (i < nx && j < nz) { const k = i * (nz + 1) + j; idx.push(k, k + 1, k + nz + 1, k + 1, k + nz + 2, k + nz + 1); }
        }
        const base = pos.length / 3;
        for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) { const u = i / nx; pos.push(-L / 2 + L * u, height(u) - .07, s * width(u)); }
        for (let i = 0; i < nx; i++) for (const [sj, sb] of [[0, 0], [nz, 1]]) {
            const a = i * (nz + 1) + sj, b = (i + 1) * (nz + 1) + sj, c = base + i * 2 + sb, d = base + (i + 1) * 2 + sb;
            idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        add(zhengStatic, g, paulownia);
        add(zhengStatic, placed(new THREE.BoxGeometry(L, .012, .35), [0, TOP - .07, 0]), darkWood);
        for (const [x, w] of [[-L / 2 + .06, .38], [L / 2 - .05, .31]] as [number, number][]) {
            add(zhengStatic, placed(new THREE.BoxGeometry(.1, .1, w), [x, TOP + .01, 0]), darkWood);
            add(zhengStatic, placed(new THREE.BoxGeometry(.018, .025, w * .92), [x + (x < 0 ? .06 : -.05), TOP + .072, 0]), ivoryBone);
        }
        // Table with carved spandrels.
        add(zhengStatic, placed(new THREE.BoxGeometry(1.75, .035, .46), [0, TOP - .095, 0]), darkWood);
        for (const x of [-.78, .78]) for (const z of [-.19, .19]) add(zhengStatic, placed(new THREE.CylinderGeometry(.018, .022, TOP - .11, 10), [x, (TOP - .11) / 2, z]), darkWood);
        for (const x of [-.78, .78]) add(zhengStatic, placed(new THREE.BoxGeometry(.03, .025, .4), [x, .12, 0]), darkWood);
        add(zhengStatic, placed(new THREE.BoxGeometry(1.5, .05, .012), [0, TOP - .14, .2]), darkWood);
    }
    const strings = new THREE.Group();
    strings.name = 'TwentyOneStrings';
    zheng.add(strings);
    for (let i = 0; i < 21; i++) {
        const z = -.15 + i * .015, bx = -.38 + i * .034 + .04 * Math.sin(i * .3), lift = TOP + .07;
        add(strings, tube([[-L / 2 + .11, TOP + .086, z], [bx, lift + .028, z], [L / 2 - .1, TOP + .086, z]], [.0012, .0012, .0012], 4), stringMat);
        // 雁柱: inverted-V bridges.
        const b = new THREE.BufferGeometry();
        const yb = TOP + .02 + .028 * (1 - (z / .17) ** 2);
        b.setAttribute('position', new THREE.Float32BufferAttribute([bx - .011, yb, z - .0025, bx + .011, yb, z - .0025, bx, lift + .03, z - .0012, bx - .011, yb, z + .0025, bx + .011, yb, z + .0025, bx, lift + .03, z + .0012], 3));
        b.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 3, 3, 2, 5, 1, 4, 2, 4, 5, 2]);
        b.computeVertexNormals();
        add(zhengStatic, b, ivoryBone);
    }
    bake(zhengStatic);
    bake(strings);

    // ------------------------------------------------------------- figures
    const male = new THREE.Group();
    male.name = 'MaleLead';
    male.userData.event = 'character.guzheng';
    male.position.set(-.62, 0, -.22);
    root.add(male);
    const stool = new THREE.Group();
    male.add(stool);
    const SEAT = .44;
    add(stool, placed(new THREE.BoxGeometry(.5, .05, .4), [0, SEAT - .025, -.05]), darkWood);
    for (const x of [-.21, .21]) for (const z of [-.22, .12]) add(stool, placed(new THREE.CylinderGeometry(.018, .02, SEAT - .05, 8), [x, (SEAT - .05) / 2, z]), darkWood);
    bake(stool);

    const female = new THREE.Group();
    female.name = 'FemaleLead';
    female.userData.event = 'character.cinnabar';
    female.position.set(1.06, 0, -.45);
    // Three-quarter view towards the visitor, turned towards the player.
    female.rotation.y = -.75;
    root.add(female);

    // ------------------------------------------------------------- materials for the GLB
    const painted = new Map<CharacterTexture, THREE.Texture | null>();
    function tex(kind: CharacterTexture) {
        if (!painted.has(kind)) {
            const t = paintCharacterTexture(kind);
            if (t) textures.push(t);
            painted.set(kind, t);
        }
        return painted.get(kind) ?? null;
    }
    function silk(color: number, sheen: number, roughness = .72, extra: THREE.MeshPhysicalMaterialParameters = {}) {
        return plain(color, roughness, 0, { sheen: 1, sheenRoughness: .45, sheenColor: new THREE.Color(sheen), side: THREE.DoubleSide, ...extra });
    }
    function sheerMat(kind: CharacterTexture, fallback: number, sheen: number) {
        const map = tex(kind);
        return plain(map ? 0xffffff : fallback, .7, 0, { map, transparent: true, opacity: map ? 1 : .45, depthWrite: false, side: THREE.DoubleSide, sheen: 1, sheenRoughness: .5, sheenColor: new THREE.Color(sheen) });
    }
    const byName = new Map<string, THREE.Material>();
    function materialFor(name: string): THREE.Material {
        const cached = byName.get(name);
        if (cached) return cached;
        let m: THREE.Material;
        switch (name) {
            case 'F_Face': case 'M_Face': {
                const map = tex(name === 'F_Face' ? 'faceF' : 'faceM');
                m = plain(map ? 0xffffff : 0xe3c3ae, .5, 0, { map, sheen: .35, sheenColor: new THREE.Color(0xffdccb) });
                break;
            }
            case 'Skin': m = plain(0xe3c3ae, .52, 0, { sheen: .35, sheenColor: new THREE.Color(0xffdccb) }); break;
            case 'Hair': m = plain(0x1d1714, .42, 0, { sheen: 1, sheenRoughness: .3, sheenColor: new THREE.Color(0x6a6058) }); break;
            case 'HairCard': {
                const map = tex('hair');
                m = plain(map ? 0xffffff : 0x221a16, .45, 0, { map, alphaTest: map ? .42 : 0, side: THREE.DoubleSide, sheen: 1, sheenRoughness: .3, sheenColor: new THREE.Color(0x6a6058) });
                break;
            }
            case 'F_Inner': m = silk(0xf1efe8, 0xffffff, .68); break;
            case 'F_Lace': m = sheerMat('lace', 0xa9cdc6, 0xeaf4f1); break;
            case 'F_Trim': m = plain(0xd2b77c, .38, .55, { side: THREE.DoubleSide }); break;
            case 'F_Sash': m = silk(0x9db8b4, 0xdcebe8, .6); break;
            case 'F_Ribbon': m = plain(0xa8cbc5, .6, 0, { transparent: true, opacity: .62, depthWrite: false, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color(0xe6f2ef) }); break;
            case 'Gold': m = plain(0xd8b46c, .3, .85, { side: THREE.DoubleSide }); break;
            case 'Jade': m = plain(0xa9d0b9, .16, 0, { clearcoat: 1, clearcoatRoughness: .1, sheen: .6, sheenColor: new THREE.Color(0xe0fff0) }); break;
            case 'WhiteJade': m = plain(0xefeee5, .22, 0, { clearcoat: .9, clearcoatRoughness: .15 }); break;
            case 'Pearl': m = plain(0xf4f0e6, .18, 0, { clearcoat: 1, iridescence: .45, iridescenceIOR: 1.5 }); break;
            case 'Cinnabar': m = plain(0x9e2a1e, .28, 0, { clearcoat: .8, clearcoatRoughness: .2 }); break;
            case 'TasselRed': m = silk(0xa5291f, 0xe08070, .8); break;
            case 'TasselBeige': m = silk(0xcbb48c, 0xf2e2c4, .8); break;
            case 'TasselBlue': m = silk(0x7393b2, 0xc7d8ea, .8); break;
            case 'Flower': m = silk(0xf7f3ea, 0xffffff, .6); break;
            case 'M_Robe': { const map = tex('robe'); m = silk(0xffffff, 0xffffff, .66, { map, color: map ? 0xffffff : 0xefeeea }); break; }
            case 'M_Skirt': m = silk(0x8f9db1, 0xd3dcea, .62); break;
            case 'M_Sheer': m = sheerMat('sheer', 0xf2f4f6, 0xffffff); break;
            case 'M_Belt': m = silk(0x6d7e92, 0xb9c7d8, .55); break;
            case 'Shoe': m = silk(0xf2efe7, 0xffffff, .55); break;
            default: m = silk(0xdddddd, 0xffffff);
        }
        byName.set(name, m);
        return m;
    }

    let rig: {
        maleBody: THREE.Object3D; maleHead: THREE.Object3D; maleHair: THREE.Object3D; arms: THREE.Object3D[]; hands: THREE.Object3D[];
        femaleBody: THREE.Object3D; femaleHead: THREE.Object3D; femaleHair: THREE.Object3D; armR: THREE.Object3D; armL: THREE.Object3D; beads: THREE.Object3D;
    } | null = null;

    /** Move the GLB figures under MaleLead / FemaleLead and give them runtime materials. */
    function attach(src: THREE.Object3D) {
        const stale = new Set<THREE.Material>();
        src.traverse(o => { if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => stale.add(m)); });
        if (disposed || rig) {
            src.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
            stale.forEach(m => m.dispose());
            return false;
        }
        for (const [name, target] of [['MaleLead', male], ['FemaleLead', female]] as const) {
            const lead = src.getObjectByName(name);
            if (!lead) continue;
            for (const child of [...lead.children]) target.add(child);
        }
        for (const lead of [male, female]) lead.traverse(o => {
            if (!(o instanceof THREE.Mesh) || o.parent === stool) return;
            const name = (Array.isArray(o.material) ? o.material[0] : o.material).name;
            o.material = materialFor(name);
            geometries.add(o.geometry);
            const sheer = (o.material as THREE.Material).transparent;
            o.castShadow = true;
            o.receiveShadow = !sheer;
            o.renderOrder = sheer ? 2 : 0;
            o.layers.mask = root.layers.mask;
        });
        stale.forEach(m => m.dispose());
        const get = (n: string) => root.getObjectByName(n) ?? new THREE.Object3D();
        rig = {
            maleBody: get('MaleBody'), maleHead: get('MaleHead'), maleHair: get('MaleHairBack'), arms: [get('MaleArmR'), get('MaleArmL')], hands: [get('MaleHandR'), get('MaleHandL')],
            femaleBody: get('FemaleBody'), femaleHead: get('FemaleHead'), femaleHair: get('FemaleHairBack'), armR: get('FemaleArmR'), armL: get('FemaleArmL'), beads: get('CinnabarBeads'),
        };
        return true;
    }

    const particlesGeo = new THREE.BufferGeometry(), particlePositions = new Float32Array(24 * 3);
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    geometries.add(particlesGeo);
    const particlesMat = new THREE.PointsMaterial({ color: 0xd06a55, size: .028, transparent: true, opacity: 0, depthWrite: false });
    materials.push(particlesMat);
    const particles = new THREE.Points(particlesGeo, particlesMat);
    particles.frustumCulled = false;
    female.add(particles);

    let musicElapsed = -1, wishElapsed = -1, disposed = false;
    if (model) attach(model);
    return {
        attach,
        update(dt: number, time: number) {
            if (disposed) return;
            dt = Math.min(dt, .1);
            if (musicElapsed >= 0) { musicElapsed += dt; if (musicElapsed >= 14) musicElapsed = -1; }
            if (wishElapsed >= 0) { wishElapsed += dt; if (wishElapsed >= 6) wishElapsed = -1; }
            const playing = musicElapsed >= 0;
            const beat = playing ? (musicElapsed % .42) / .42 : 0;
            const pluck = playing ? Math.exp(-beat * 7) : Math.pow(Math.max(0, Math.sin(time * 1.13)), 20) * .2;
            strings.position.y = playing ? Math.sin(time * 65) * pluck * .0015 : 0;
            const wish = wishElapsed >= 0 ? Math.sin(wishElapsed / 6 * Math.PI) : 0;
            particles.visible = wishElapsed >= 0;
            particlesMat.opacity = wish * .6;
            if (wishElapsed >= 0) {
                for (let i = 0; i < 24; i++) {
                    const a = i * 2.39996 + wishElapsed * .7, r = .05 + i % 7 * .02 + wishElapsed * .02;
                    particlePositions.set([-.075 + Math.cos(a) * r, .8 + (i % 6) * .035 + wishElapsed * .03, .17 + Math.sin(a) * r], i * 3);
                }
                particlesGeo.attributes.position.needsUpdate = true;
            }
            if (!rig) return;
            rig.maleBody.scale.y = 1 + Math.sin(time * 1.6) * .003;
            rig.femaleBody.scale.y = 1 + Math.sin(time * 1.3 + 1) * .003;
            rig.arms.forEach((arm, i) => {
                // Right hand plucks along the strings, left presses beyond the bridges.
                arm.rotation.x = -pluck * (i ? .05 : .03) + (playing ? Math.sin(time * 1.7 + i) * .02 : 0);
                arm.rotation.y = playing ? Math.sin(time * (i ? .9 : .6) + i) * .06 : 0;
                arm.rotation.z = Math.sin(time * .7 + i) * .01;
            });
            rig.hands.forEach((h, i) => { h.rotation.x = pluck * (i ? .35 : .2); h.rotation.z = Math.sin(time * 1.4 + i) * .05; });
            rig.maleHead.rotation.x = .18 + Math.sin(time * .7) * .02;
            rig.maleHead.rotation.y = playing && musicElapsed > 12 ? Math.sin((musicElapsed - 12) / 2 * Math.PI) * .25 : Math.sin(time * .33) * .03;
            rig.femaleHead.rotation.y = -.3 - wish * .25 + Math.sin(time * .22) * .05;
            rig.femaleHead.rotation.x = .06 + wish * .12;
            rig.armR.rotation.x = -wish * .16;
            rig.armL.rotation.z = Math.sin(time * .6 + 1) * .012;
            rig.beads.rotation.z = Math.sin(time * (wish ? 4 : .8)) * (.025 + wish * .2);
            for (const [hairLock, k] of [[rig.maleHair, 0], [rig.femaleHair, 1]] as const) {
                hairLock.rotation.z = Math.sin(time * .9 + k) * .02;
                hairLock.rotation.x = Math.sin(time * .7 + k * 2) * .015;
            }
        },
        trigger(event: string) {
            if (disposed) return false;
            if (event === 'character.guzheng' && musicElapsed < 0) { musicElapsed = 0; return true; }
            if (event === 'character.cinnabar' && wishElapsed < 0) { wishElapsed = 0; return true; }
            return false;
        },
        getState() { return { model: rig ? 'blender-v8' : 'loading', music: musicElapsed >= 0 ? 'playingGuzheng' : 'idle', wish: wishElapsed >= 0 ? 'beadsWish' : 'idle', musicElapsed, wishElapsed, strings: 21, beadParticles: wishElapsed >= 0 ? 24 : 0 }; },
        dispose() { disposed = true; root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
    };
}
