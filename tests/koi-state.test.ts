import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KoiState,isWater,safeWater,FISH_COUNT} from '../src/koi-state.ts';
test('exact phases, single accepted show and reusable fish pool',()=>{const s=new KoiState();assert.equal(s.trigger({x:0,z:2}),true);assert.ok([7,8].includes(s.pellets));const identities=[...s.fish];assert.equal(s.trigger({x:2,z:3}),false);s.update(.61);assert.equal(s.phase,'gathering');s.update(1.2);assert.equal(s.phase,'leaping');s.update(2.7);assert.equal(s.phase,'returning');s.update(2);assert.equal(s.phase,'settling');s.update(1.5);assert.equal(s.phase,'idle');assert.equal(s.pellets,0);assert.equal(s.fish.length,FISH_COUNT);assert.ok(s.fish.every((f,i)=>f===identities[i]));assert.equal(s.trigger({x:2,z:3}),true);});
test('valid feed coordinates; rejects pavilion, bridge, land and nonfinite points',()=>{for(const p of [{x:30,z:0},{x:0,z:-5},{x:NaN,z:1},{x:13,z:5.8}])assert.equal(new KoiState().trigger(p),false);for(const p of [{x:0,z:2},{x:15,z:0},{x:-12,z:3},{x:1,z:7}])assert.equal(new KoiState().trigger(p),true);});
test('nearest koi leap once each, staggered; the pool stays fixed and every fish ends underwater',()=>{const s=new KoiState();s.update(.3);const before=s.fish.map(f=>({...f}));s.trigger({x:0,z:2});assert.ok(s.fish.every((f,i)=>f.x===before[i].x&&f.z===before[i].z&&f.y<.25));let air=0,land=0;for(let i=0;i<481;i++){s.update(1/60);air=Math.max(air,s.snapshot().airborne);land+=s.landings.length;assert.ok(s.fish.every(f=>isWater(f,.3)));}assert.ok(air>4);const leapers=s.fish.filter(f=>f.leaps).length;assert.ok(leapers>=18&&leapers<=25);assert.equal(land,leapers);assert.ok(s.fish.every(f=>f.y<.25));assert.equal(s.phase,'idle');});
test('arbitrary edge positions constrained, deterministic replay and long-run reuse',()=>{for(let i=0;i<100;i++)assert.ok(isWater(safeWater({x:Math.sin(i)*50,z:Math.cos(i)*30}),.3));const a=new KoiState(42),b=new KoiState(42);a.trigger({x:2,z:2});b.trigger({x:2,z:2});for(let i=0;i<500;i++){a.update(.02);b.update(.02);}assert.deepEqual(a.snapshot(),b.snapshot());for(let n=0;n<30;n++){a.trigger({x:0,z:3});for(let i=0;i<170;i++)a.update(.05);}assert.equal(a.fish.length,60);assert.equal(a.phase,'idle');});

import * as THREE from 'three';
import {createFX} from '../src/fx.ts';
test('FX bounded lifecycle, independent tree cooldowns and idempotent disposal',()=>{
 const scene=new THREE.Scene(),fx=createFX(scene,'balanced');const initialMeshes=scene.children[0].children.length;
 const treeA=new THREE.Group(),treeB=new THREE.Group();const point=new THREE.Vector3(-10,4,5);
 assert.equal(fx.trigger('flora.magnolia',point,treeA),true);
 assert.equal(fx.trigger('flora.magnolia',point,treeA),false);
 assert.equal(fx.trigger('flora.leaves',point,treeB),true);
 for(let i=0;i<5;i++)fx.update(.1,i*.1,0);
 assert.equal(fx.getState().activePetals,20);assert.equal(fx.getState().activeLeaves,14);
 assert.equal(fx.trigger('lake.feed',new THREE.Vector3(0,.25,2)),true);
 assert.equal(fx.trigger('lake.feed',new THREE.Vector3(1,.25,2)),false);
 for(let i=0;i<100;i++)fx.update(.1,i*.1,.5);
 assert.equal(fx.getState().phase,'idle');assert.equal(fx.getState().activePetals,0);assert.equal(fx.getState().activeLeaves,0);
 assert.equal(scene.children[0].children.length,initialMeshes);
 fx.setQuality('low');assert.equal(fx.getState().quality,'low');
 fx.dispose();fx.dispose();assert.equal(scene.children.length,0);assert.equal(fx.getState().disposed,true);assert.equal(fx.trigger('lake.feed',point),false);
});
