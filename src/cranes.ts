import * as THREE from 'three';

/**
 * Red-crowned cranes. Geometry faces +Z, wings along X. Each wing vertex has
 * aSpan (distance from the body axis); the vertex shader rotates the inner
 * wing about the shoulder and the outer wing again about the elbow, lagging
 * behind, so the downstroke reads as a real flap rather than a hinge.
 */
const SHOULDER = .1, ELBOW = .58;

function craneGeometry() {
    const pos: number[] = [], col: number[] = [], span: number[] = [], idx: number[] = [];
    const white = [.95, .95, .92], black = [.06, .06, .07], red = [.8, .08, .06], beak = [.55, .55, .45], leg = [.18, .18, .17];
    const push = (p: number[], c: number[], s = 0) => { pos.push(p[0], p[1], p[2]); col.push(c[0], c[1], c[2]); span.push(s); return pos.length / 3 - 1; };
    const tube = (pts: number[][], radii: number[], c: (j: number) => number[], sides = 7) => {
        const base = pos.length / 3;
        pts.forEach((p, j) => {
            const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
            const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
            let u = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0));
            if (u.lengthSq() < .01) u = new THREE.Vector3(1, 0, 0);
            u.normalize();
            const w = new THREE.Vector3().crossVectors(u, t).normalize();
            for (let k = 0; k < sides; k++) {
                const ang = k / sides * Math.PI * 2;
                push([p[0] + (u.x * Math.cos(ang) + w.x * Math.sin(ang)) * radii[j], p[1] + (u.y * Math.cos(ang) + w.y * Math.sin(ang)) * radii[j], p[2] + (u.z * Math.cos(ang) + w.z * Math.sin(ang)) * radii[j]], c(j));
            }
        });
        for (let j = 0; j < pts.length - 1; j++) for (let k = 0; k < sides; k++) {
            const a = base + j * sides + k, b = base + j * sides + (k + 1) % sides;
            idx.push(a, b, b + sides, a, b + sides, a + sides);
        }
    };
    // Body, tapering into the tail.
    const body: number[][] = [], br: number[] = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8; body.push([0, .02 * Math.sin(t * Math.PI), .26 - t * .62]); br.push(.115 * Math.sin(Math.PI * Math.min(1, t * 1.15 + .08)) + .01); }
    tube(body, br, j => j > 6 ? black : white);
    // Long neck, black, gently S-curved, with white nape.
    const neck = [[0, .04, .22], [0, .07, .4], [0, .085, .58], [0, .09, .74]];
    tube(neck, [.045, .034, .03, .028], j => j === 3 ? white : black, 6);
    tube([[0, .09, .72], [0, .1, .79], [0, .095, .85]], [.034, .042, .03], j => j === 1 ? white : white, 7);
    // Red crown.
    tube([[0, .126, .77], [0, .133, .8]], [.018, .014], () => red, 5);
    tube([[0, .09, .85], [0, .085, 1.0]], [.014, .003], () => beak, 5);
    // Trailing legs.
    for (const s of [-1, 1]) tube([[s * .035, -.06, -.18], [s * .03, -.08, -.5], [s * .028, -.09, -.78]], [.014, .011, .009], () => leg, 4);
    // Wings: inner (white, black secondaries at the trailing edge) and outer with fingered primaries.
    for (const s of [-1, 1]) {
        const rows: { x: number; lead: number; trail: number; y: number }[] = [];
        const N = 9;
        for (let i = 0; i <= N; i++) {
            const x = SHOULDER + (1.18 - SHOULDER) * i / N;
            const u = i / N;
            const chord = u < .45 ? .36 + .06 * Math.sin(u * 4) : .38 * (1 - (u - .45) / .55 * .65);
            rows.push({ x, lead: .12 - u * .06, trail: .12 - u * .06 - chord, y: .02 * Math.sin(u * Math.PI) });
        }
        const base = pos.length / 3;
        rows.forEach(r => {
            for (let k = 0; k <= 3; k++) {
                const v = k / 3, z = r.lead + (r.trail - r.lead) * v;
                const isBlack = r.x < ELBOW + .05 && v > .55;
                push([s * r.x, r.y - v * .015, z], isBlack ? black : white, r.x);
            }
        });
        for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
            const a = base + i * 4 + k;
            idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        }
        // Primary "fingers" at the tip.
        for (let f = 0; f < 4; f++) {
            const z0 = .06 - f * .07, x0 = 1.05 - f * .05;
            const a = push([s * x0, .02, z0], white, x0), b = push([s * (x0 + .22 - f * .03), .02, z0 - .03], white, x0 + .22), c = push([s * x0, .02, z0 - .05], white, x0);
            idx.push(a, b, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

type Flock = { r1: number; r2: number; h: number; speed: number; phase: number; dir: number; members: number[][] };

export function createCranes(scene: THREE.Scene) {
    const flocks: Flock[] = [
        { r1: 40, r2: 27, h: 7, speed: 4.6, phase: 0, dir: 1, members: [[0, 0, 0], [-1.7, .2, -1.6], [1.8, .15, -1.7], [-3.4, .4, -3.1], [3.5, .3, -3.3]] },
        { r1: 52, r2: 34, h: 13, speed: 5.2, phase: 2.4, dir: -1, members: [[0, 0, 0], [-1.9, .3, -1.8], [1.6, -.2, -2.2]] },
    ];
    const total = flocks.reduce((n, f) => n + f.members.length, 0);
    const geometry = craneGeometry();
    const flap = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2);
    flap.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aFlap', flap);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
 attribute float aSpan; attribute vec2 aFlap;
 vec2 rotAbout(vec2 p, vec2 c, float a){vec2 d=p-c;return c+vec2(d.x*cos(a)-d.y*sin(a),d.x*sin(a)+d.y*cos(a));}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
 if(aSpan>0.){
  float side=sign(transformed.x);
  vec2 p=vec2(abs(transformed.x),transformed.y);
  float a1=aFlap.y*sin(aFlap.x)+.1;
  float a2=aFlap.y*.75*sin(aFlap.x-.9);
  vec2 elbow=rotAbout(vec2(${ELBOW.toFixed(2)},0.),vec2(${SHOULDER.toFixed(2)},0.),a1);
  if(aSpan<=${ELBOW.toFixed(2)}) p=rotAbout(p,vec2(${SHOULDER.toFixed(2)},0.),a1);
  else { vec2 q=rotAbout(p,vec2(${SHOULDER.toFixed(2)},0.),a1); p=rotAbout(q,elbow,a2); }
  transformed.x=side*p.x; transformed.y=p.y;
 }`);
    };
    material.customProgramCacheKey = () => 'ys3-crane';
    const mesh = new THREE.InstancedMesh(geometry, material, total);
    mesh.name = 'WhiteCranes';
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const dummy = new THREE.Object3D(), p = new THREE.Vector3(), q = new THREE.Vector3(), tangent = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3(0, 1, 0);
    const path = (f: Flock, s: number, out: THREE.Vector3) => out.set(Math.cos(s) * f.r1, f.h + 2.2 * Math.sin(2 * s + f.phase) + 1.2 * Math.sin(3 * s), Math.sin(s) * f.r2 - 4);
    const phases = new Float32Array(total);
    return {
        mesh,
        update(t: number, dt: number, night: number, reduced: boolean) {
            mesh.visible = !reduced && night < .75;
            if (!mesh.visible) return;
            let i = 0;
            for (const f of flocks) {
                const avg = (f.r1 + f.r2) / 2, s = f.phase + f.dir * t * f.speed / avg;
                path(f, s, p);
                path(f, s + f.dir * .01, q);
                tangent.subVectors(q, p).normalize();
                right.crossVectors(tangent, upv).normalize();
                // Bank into the turn: curvature from a second sample further along.
                path(f, s + f.dir * .2, q);
                const ahead = q.sub(p).normalize();
                const turn = right.dot(ahead);
                for (const m of f.members) {
                    const bob = Math.sin(t * 1.3 + i * 1.7) * .25;
                    dummy.position.copy(p).addScaledVector(right, m[0]).addScaledVector(tangent, m[2]);
                    dummy.position.y += m[1] + bob;
                    dummy.up.copy(upv);
                    dummy.lookAt(dummy.position.clone().add(tangent));
                    dummy.rotateZ(-turn * 1.6);
                    dummy.scale.setScalar(1.25);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    // Flap bursts alternate with long glides; each bird slightly out of step.
                    const gliding = Math.sin(t * .23 + i * .9 + f.phase) > .35;
                    const target = gliding ? .08 : .62;
                    const amp = flap.getY(i) + (target - flap.getY(i)) * Math.min(1, dt * 2.5);
                    phases[i] += dt * (gliding ? 2.5 : 9.4 + (i % 3) * .5);
                    flap.setXY(i, phases[i], amp);
                    i++;
                }
            }
            mesh.instanceMatrix.needsUpdate = true;
            flap.needsUpdate = true;
        },
        dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
    };
}
