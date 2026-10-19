import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacters} from '../src/characters';
import {createAudio} from '../src/audio';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const glb = readFileSync(new URL('../public/assets/models/characters.glb', import.meta.url));
async function figures() {
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  return (await new GLTFLoader().parseAsync(buffer, '')).scene;
}

function advance(characters: ReturnType<typeof createCharacters>, seconds: number, start = 0) {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) characters.update(seconds / frames, start + i * seconds / frames);
}

test('adult characters and guzheng occupy the left pavilion; every character mesh resolves to its event', async () => {
  const scene = new THREE.Scene(), characters = createCharacters(scene, await figures());
  try {
    scene.updateMatrixWorld(true);
    for (const [name, event] of [['MaleLead', 'character.guzheng'], ['FemaleLead', 'character.cinnabar'], ['Guzheng', 'character.guzheng']]) {
      const root = scene.getObjectByName(name);
      assert.ok(root, `${name} exists`);
      assert.equal(root.userData.event, event);
      let triangles = 0;
      root.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        let ancestor: THREE.Object3D | null = o;
        while (ancestor && !ancestor.userData.event) ancestor = ancestor.parent;
        assert.equal(ancestor?.userData.event, event, `${name} has no dead mesh click targets`);
      });
      assert.ok(triangles > 100, `${name} uses real inspectable mesh geometry`);
      const box = new THREE.Box3().setFromObject(root);
      assert.ok(box.min.x >= -20.75 && box.max.x <= -15.25, `${name} remains inside pavilion X footprint`);
      assert.ok(box.min.z >= 0.75 && box.max.z <= 5.25, `${name} remains inside pavilion Z footprint`);
      assert.ok(box.min.y >= 0.69 && box.max.y <= 5.2, `${name} remains above floor and below roof`);
    }
    assert.ok(scene.getObjectByName('TwentyOneStrings'));
    assert.ok(scene.getObjectByName('CinnabarBeads'));
    assert.equal(characters.getState().strings, 21);
    assert.equal(characters.getState().model, 'blender-v8');
    for (const pivot of ['FemaleHead', 'FemaleArmR', 'FemaleHairBack', 'MaleHead', 'MaleArmR', 'MaleArmL', 'MaleHandR', 'MaleHandL']) assert.ok(scene.getObjectByName(pivot), `${pivot} pivot`);
  } finally { characters.dispose(); }
});

test('independent character interactions reject reentry, animate, reset at 6/14 seconds and can replay', async () => {
  const scene = new THREE.Scene(), characters = createCharacters(scene, await figures());
  try {
    assert.equal(characters.trigger('unknown.action'), false);
    assert.equal(characters.trigger('character.guzheng'), true);
    assert.equal(characters.trigger('character.guzheng'), false);
    assert.equal(characters.trigger('character.cinnabar'), true);
    assert.equal(characters.trigger('character.cinnabar'), false);
    advance(characters, 3);
    assert.equal(characters.getState().music, 'playingGuzheng');
    assert.equal(characters.getState().wish, 'beadsWish');
    assert.equal(characters.getState().beadParticles, 24);
    assert.notEqual(scene.getObjectByName('CinnabarBeads')!.rotation.z, 0, 'bead mesh actually moves');
    advance(characters, 3.1, 3);
    assert.equal(characters.getState().wish, 'idle');
    assert.equal(characters.getState().beadParticles, 0);
    assert.equal(characters.getState().music, 'playingGuzheng');
    advance(characters, 8, 6.1);
    assert.equal(characters.getState().music, 'idle');
    assert.equal(characters.trigger('character.guzheng'), true);
    assert.equal(characters.trigger('character.cinnabar'), true);
  } finally { characters.dispose(); }
});

test('repeated performances allocate no extra scene objects, and disposal releases live geometry and material resources', async () => {
  const scene = new THREE.Scene(), characters = createCharacters(scene, await figures());
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let originalCount = 0;
  scene.traverse(o => {
    originalCount++;
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  for (let run = 0; run < 4; run++) {
    assert.equal(characters.trigger('character.guzheng'), true);
    assert.equal(characters.trigger('character.cinnabar'), true);
    advance(characters, 14.2, run * 14.2);
    let count = 0; scene.traverse(() => count++);
    assert.equal(count, originalCount, 'transient animation does not grow scene graph');
  }
  const releasedGeometries = new Set<THREE.BufferGeometry>(), releasedMaterials = new Set<THREE.Material>();
  geometries.forEach(g => g.addEventListener('dispose', () => releasedGeometries.add(g)));
  materials.forEach(m => m.addEventListener('dispose', () => releasedMaterials.add(m)));
  characters.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(releasedGeometries.size, geometries.size);
  assert.equal(releasedMaterials.size, materials.size);
  assert.equal(characters.trigger('character.guzheng'), false);
  assert.doesNotThrow(() => { characters.update(0.05, 80); characters.dispose(); });
});

test('silent audio lifecycle never accesses AudioContext, even if character and FX events are triggered', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  let accesses = 0;
  Object.defineProperty(globalThis, 'AudioContext', {configurable: true, get() { accesses++; throw new Error('AudioContext must remain user-gated'); }});
  const audio = createAudio();
  try {
    audio.setVolumes(Number.NaN, 100);
    await audio.setEnabled(false);
    for (const event of ['character.guzheng', 'character.cinnabar', 'lake.feed', 'koi.splash', 'flora.magnolia', 'flora.leaves', 'pavilion.lantern']) audio.trigger(event);
    for (let i = 0; i < 160; i++) audio.update(0.1, i * 0.1, i / 160, 30);
    audio.suspend(true); audio.suspend(false); audio.dispose();
    await audio.setEnabled(true);
    assert.equal(accesses, 0, 'no autoplay or late context recreation after dispose');
  } finally {
    audio.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'AudioContext', descriptor);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
