import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export function disposeModel(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    root.traverse(object => {
        if (object instanceof THREE.Mesh) {
            geometries.add(object.geometry);
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
                materials.add(material);
        }
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    root.removeFromParent();
}
export async function loadIsland(url: string, signal: AbortSignal, onProgress: (ratio: number) => void) {
    const response = await fetch(url, { signal });
    if (!response.ok)
        throw new Error(`模型读取失败 (${response.status})`);
    onProgress(.4);
    const buffer = await response.arrayBuffer();
    signal.throwIfAborted();
    onProgress(.8);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    if (signal.aborted) {
        disposeModel(gltf.scene);
        signal.throwIfAborted();
    }
    onProgress(1);
    return gltf.scene;
}
