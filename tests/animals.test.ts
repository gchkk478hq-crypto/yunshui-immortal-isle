import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import dogPath from '../src/dogPath.json';
import { createAnimals, deerGround, deerHeight, dogPathLength } from '../src/animals';

const path = (dogPath as { points: number[][] }).points;
const nearestOnPath = (p: THREE.Vector3) => Math.min(...path.map(q => Math.hypot(q[0] - p.x, q[2] - p.z)));

test('fawns roam the front lawns (fording streams), the dog keeps to its planned deck path', () => {
    const scene = new THREE.Scene(), animals = createAnimals(scene);
    try {
        assert.ok(scene.getObjectByName('SikaFawnA') && scene.getObjectByName('SikaFawnB') && scene.getObjectByName('PlayfulDog'));
        assert.ok(dogPathLength > 15, 'dog walk spans the bridges');
        let minX = Infinity, maxX = -Infinity, dogMin = Infinity, dogMax = -Infinity;
        for (let i = 0; i < 60 * 240; i++) {
            animals.update(1 / 60, i / 60);
            const p = animals.positions();
            for (const v of [p.deer, p.fawn, p.dog]) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
            for (const d of [p.deer, p.fawn]) {
                assert.ok(deerGround(d.x, d.z) || i < 2, `fawn left the lawn at ${d.x},${d.z}`);
                assert.ok(Math.abs(d.y - deerHeight(d.x, d.z)) < .25, 'fawn stands on the ground');
            }
            assert.ok(nearestOnPath(p.dog) < .08, `dog left its path at ${p.dog.x},${p.dog.z}`);
            minX = Math.min(minX, p.deer.x); maxX = Math.max(maxX, p.deer.x);
            dogMin = Math.min(dogMin, p.dog.x); dogMax = Math.max(dogMax, p.dog.x);
        }
        assert.ok(maxX - minX > 5, `fawns roam widely (${(maxX - minX).toFixed(1)} m)`);
        assert.ok(dogMax - dogMin > 6, 'dog actually runs along the bridges');
        assert.equal(animals.trigger('animal.dog'), true);
        assert.equal(animals.trigger('animal.dog'), false, 'no re-entry while spinning');
        assert.equal(animals.trigger('animal.deer', new THREE.Vector3(0, 20, 50)), true);
        assert.equal(animals.trigger('unknown'), false);
        for (let i = 0; i < 120; i++) animals.update(1 / 60, 300 + i / 60);
    } finally {
        let released = 0;
        scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => released++); });
        animals.dispose();
        assert.equal(scene.children.length, 0);
        assert.ok(released > 20);
    }
});
