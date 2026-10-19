import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {disposeModel,loadIsland} from '../src/resources';
test('shared asset geometry and material disposed exactly once and model removed',()=>{
 const scene=new THREE.Scene(),root=new THREE.Group(),g=new THREE.BoxGeometry(),m=new THREE.MeshStandardMaterial();let gd=0,md=0;
 g.addEventListener('dispose',()=>gd++);m.addEventListener('dispose',()=>md++);
 root.add(new THREE.Mesh(g,m),new THREE.Mesh(g,m));scene.add(root);disposeModel(root);
 assert.equal(gd,1);assert.equal(md,1);assert.equal(scene.children.length,0);
});
test('cancelled asset request rejects without attempting model parse',async()=>{
 const c=new AbortController();c.abort();let progress=0;
 await assert.rejects(loadIsland('data:application/octet-stream;base64,AA==',c.signal,()=>progress++));assert.equal(progress,0);
});
