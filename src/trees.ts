import * as THREE from 'three';
import { enrichMaterial, type TreeUniforms } from './materials';

/**
 * One spring per tree. A tap pushes the crown away from the viewer; the tree
 * bends from its roots (quadratic with height, in the vertex shader), swings
 * back past rest a few times and settles, while its leaves flutter harder.
 */
export interface Tree {
    name: string;
    meshes: THREE.Mesh[];
    base: THREE.Vector3;
    height: number;
    crown: THREE.Vector3;
    uniforms: TreeUniforms;
    pos: THREE.Vector2;
    vel: THREE.Vector2;
    stiffness: number;
    damping: number;
    energy: number;
}

const TREE_NAME = /^(Pine|Magnolia|Bamboo|Willow|Maple|Camphor|Poplar|Peach)(\d+)_/;

export function createTrees(model: THREE.Object3D) {
    const groups = new Map<string, THREE.Mesh[]>();
    model.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const match = TREE_NAME.exec(o.name);
        if (!match) return;
        const key = match[1] + match[2];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(o);
    });
    const trees: Tree[] = [];
    const box = new THREE.Box3(), part = new THREE.Box3();
    for (const [name, meshes] of groups) {
        box.makeEmpty();
        const trunk = new THREE.Box3();
        for (const m of meshes) {
            part.setFromObject(m);
            box.union(part);
            if (/Bark|BambooStem/.test(m.name)) trunk.union(part);
        }
        const source = trunk.isEmpty() ? box : trunk;
        const centre = source.getCenter(new THREE.Vector3());
        const base = new THREE.Vector3(centre.x, box.min.y, centre.z);
        const height = Math.max(1, box.max.y - box.min.y);
        // Bamboo flexes more slowly and further than a stiff pine.
        const flexible = name.startsWith('Bamboo') || name.startsWith('Willow') ? .65 : name.startsWith('Poplar') ? .8 : 1;
        const frequency = 2.6 / Math.sqrt(height) * flexible;
        const stiffness = (Math.PI * 2 * frequency) ** 2;
        const uniforms: TreeUniforms = { uShake: { value: new THREE.Vector3() }, uBase: { value: base.clone() }, uHeight: { value: height }, uFlutter: { value: 0 } };
        const tree: Tree = { name, meshes, base, height, crown: box.getCenter(new THREE.Vector3()), uniforms, pos: new THREE.Vector2(), vel: new THREE.Vector2(), stiffness, damping: 2 * .11 * Math.sqrt(stiffness), energy: 0 };
        for (const m of meshes) {
            const materials = (Array.isArray(m.material) ? m.material : [m.material]).map(source => {
                const clone = (source as THREE.MeshStandardMaterial).clone();
                clone.name = source.name;
                enrichMaterial(clone, uniforms);
                return clone;
            });
            m.material = Array.isArray(m.material) ? materials : materials[0];
            m.userData.tree = tree;
            // Swaying crowns may leave their static bounds; avoid popping at screen edges.
            m.frustumCulled = false;
        }
        trees.push(tree);
    }
    const push = new THREE.Vector2();
    return {
        trees,
        find(object: THREE.Object3D | undefined) {
            let o: THREE.Object3D | null = object ?? null;
            while (o) {
                if (o.userData.tree) return o.userData.tree as Tree;
                o = o.parent;
            }
            return undefined;
        },
        /**
         * Tap impulse: mostly across the line of sight (so the swing reads on screen)
         * with some push away from the viewer; the crown tip travels ~12% of the height.
         */
        shake(tree: Tree, from: THREE.Vector3, strength = 1) {
            push.set(tree.base.x - from.x, tree.base.z - from.z);
            if (push.lengthSq() < 1e-6) push.set(1, 0);
            push.normalize();
            const side = new THREE.Vector2(-push.y, push.x).multiplyScalar(Math.random() < .5 ? -1 : 1);
            const omega = Math.sqrt(tree.stiffness);
            const amplitude = tree.height * .12 * strength;
            tree.vel.addScaledVector(side, amplitude * omega * .85);
            tree.vel.addScaledVector(push, amplitude * omega * .45);
            tree.energy = Math.min(1.5, tree.energy + strength);
        },
        update(dt: number, reduced: boolean) {
            const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
            const h = dt / steps;
            for (const t of trees) {
                if (t.energy <= 0 && t.pos.lengthSq() < 1e-8 && t.vel.lengthSq() < 1e-8) continue;
                for (let i = 0; i < steps; i++) {
                    const ax = -t.stiffness * t.pos.x - t.damping * t.vel.x, ay = -t.stiffness * t.pos.y - t.damping * t.vel.y;
                    t.vel.x += ax * h;
                    t.vel.y += ay * h;
                    t.pos.x += t.vel.x * h;
                    t.pos.y += t.vel.y * h;
                }
                t.energy = Math.max(0, t.energy - dt * .55);
                const k = reduced ? .25 : 1;
                t.uniforms.uShake.value.set(t.pos.x * k, 0, t.pos.y * k);
                t.uniforms.uFlutter.value = Math.min(1, t.energy) * k;
            }
        },
    };
}
