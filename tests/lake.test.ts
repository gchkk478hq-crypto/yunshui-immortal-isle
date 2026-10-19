import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLakeSurface } from '../src/lake';
import { createFX } from '../src/fx';
import { lakePoint } from '../src/landscape';

test('rendered lake boundary follows the shared terrain contour at the water level', () => {
    const lake = createLakeSurface();
    lake.mesh.updateMatrixWorld();
    const positions = lake.mesh.geometry.getAttribute('position');
    for (let i = 0; i < 192; i++) {
        const actual = new THREE.Vector3().fromBufferAttribute(positions, positions.count - 192 + i).applyMatrix4(lake.mesh.matrixWorld);
        const [x, z] = lakePoint(i / 192 * Math.PI * 2);
        assert.ok(Math.abs(actual.x - x) < 0.00001 && Math.abs(actual.z - z) < 0.00001);
        assert.ok(Math.abs(actual.y - .25) < 0.00001);
    }
    assert.equal(lake.mesh.userData.event, 'lake.feed');
    lake.dispose();
});

test('quality switches reuse one reflection target and final disposal releases it once', () => {
    const lake = createLakeSurface();
    const target = lake.mesh.getRenderTarget();
    assert.equal(target.width, 1024);
    lake.setQuality('high');
    assert.equal(target.width, 1536);
    lake.setQuality('low');
    assert.equal(target.width, 512);
    lake.setQuality('balanced');
    assert.equal(target.width, 1024);
    assert.equal(lake.mesh.getRenderTarget(), target);
    let targets = 0, materials = 0, geometries = 0;
    target.addEventListener('dispose', () => targets++);
    (lake.mesh.material as THREE.Material).addEventListener('dispose', () => materials++);
    lake.mesh.geometry.addEventListener('dispose', () => geometries++);
    const scene = new THREE.Scene();
    scene.add(lake.mesh, lake.bed);
    lake.dispose();
    lake.dispose();
    lake.setQuality('high');
    assert.equal(targets, 1);
    assert.equal(materials, 1);
    assert.equal(geometries, 1);
    assert.equal(scene.children.length, 0);
});

test('FX owns the reflective lake lifecycle without changing lake feeding', () => {
    const scene = new THREE.Scene(), fx = createFX(scene);
    let lakeMaterialDisposals = 0;
    (fx.lake.material as THREE.Material).addEventListener('dispose', () => lakeMaterialDisposals++);
    assert.equal(fx.trigger('lake.feed', new THREE.Vector3(0, .25, 2)), true);
    fx.update(.1, 1, 0);
    assert.notEqual(fx.getState().phase, 'idle');
    fx.setQuality('low');
    assert.equal(fx.lake.getRenderTarget().width, 512);
    fx.dispose();
    fx.dispose();
    assert.equal(lakeMaterialDisposals, 1);
    assert.equal(scene.children.length, 0);
});
