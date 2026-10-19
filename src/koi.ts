import * as THREE from 'three';
import { WATER_Y } from './koi-state';

/**
 * Koi body built along +Z (head) to -Z (tail), about 0.8 m long at size 1.
 * aPart: 0 body, 1 caudal/dorsal fin, 2 pectoral fin (flaps).
 * Swimming, bend and fin motion run in the vertex shader from per-instance
 * aMotion = (tail phase, body bend, tail amplitude, fin beat).
 */
const HEAD = .38, PEDUNCLE = -.24, TAIL = -.46;

function koiGeometry() {
    const pos: number[] = [], part: number[] = [], idx: number[] = [];
    const rings = 22, sides = 14;
    const profile = (s: number) => {
        // s: 0 head tip, 1 peduncle. Rounded snout, full shoulders, slim tail.
        const shoulder = Math.sin(Math.PI * Math.min(1, Math.pow(s, .62))) ;
        const snout = Math.sqrt(Math.min(1, s / .12));
        const w = .074 * shoulder * snout + .012 * s;
        const h = .094 * shoulder * snout + .02 * s;
        return { w, h, y: -.01 * shoulder };
    };
    for (let j = 0; j <= rings; j++) {
        const s = j / rings, z = HEAD + (PEDUNCLE - HEAD) * s, { w, h, y } = profile(s);
        for (let i = 0; i < sides; i++) {
            const a = i / sides * Math.PI * 2;
            // Flatter belly, rounder back.
            const sy = Math.sin(a), belly = sy < 0 ? .82 : 1;
            pos.push(Math.cos(a) * w, y + sy * h * belly, z);
            part.push(0);
            if (j < rings) {
                const k = j * sides + i, n = j * sides + (i + 1) % sides;
                idx.push(k, n, k + sides, n, n + sides, k + sides);
            }
        }
    }
    const nose = pos.length / 3;
    pos.push(0, -.004, HEAD + .012); part.push(0);
    for (let i = 0; i < sides; i++) idx.push(nose, (i + 1) % sides, i);
    const tailCap = pos.length / 3;
    pos.push(0, .01, PEDUNCLE); part.push(0);
    const last = rings * sides;
    for (let i = 0; i < sides; i++) idx.push(tailCap, last + i, last + (i + 1) % sides);
    const fin = (points: number[][], cols: number, rows: number, kind: number) => {
        // Bilinear patch over 4 corners: [root-top, root-bottom, tip-top, tip-bottom].
        const base = pos.length / 3;
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
            const u = i / cols, v = j / rows;
            const p = [0, 1, 2].map(k => (1 - u) * ((1 - v) * points[0][k] + v * points[1][k]) + u * ((1 - v) * points[2][k] + v * points[3][k]));
            pos.push(p[0], p[1], p[2]); part.push(kind);
            if (i < cols && j < rows) {
                const k = base + j * (cols + 1) + i;
                idx.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
            }
        }
    };
    // Forked caudal fin: two lobes, longer and trailing at the tips.
    fin([[0, .012, PEDUNCLE + .01], [0, .045, PEDUNCLE - .02], [0, .005, TAIL + .07], [0, .135, TAIL]], 6, 3, 1);
    fin([[0, .008, PEDUNCLE + .01], [0, -.03, PEDUNCLE - .02], [0, .002, TAIL + .07], [0, -.12, TAIL + .01]], 6, 3, 1);
    // Long dorsal fin along the back.
    fin([[0, .09, .16], [0, .135, .1], [0, .05, -.15], [0, .07, -.2]], 6, 2, 1);
    // Pectoral fins, swept back and down.
    for (const side of [-1, 1]) fin([[side * .055, -.05, .22], [side * .06, -.06, .17], [side * .17, -.1, .14], [side * .15, -.11, .08]], 3, 2, 2);
    // Small pelvic fins.
    for (const side of [-1, 1]) fin([[side * .03, -.075, .02], [side * .03, -.08, -.02], [side * .08, -.12, -.03], [side * .07, -.12, -.07]], 2, 1, 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

export function createKoiMesh(count: number) {
    const geometry = koiGeometry();
    const motion = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    const look = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    motion.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aMotion', motion);
    geometry.setAttribute('aLook', look);
    for (let i = 0; i < count; i++) look.setXY(i, i % 6, (i * .618034) % 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .34, metalness: .08, side: THREE.DoubleSide });
    const uniforms = { uWaterY: { value: WATER_Y }, uGlint: { value: 0 }, uNight: { value: 0 } };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
 attribute float aPart; attribute vec4 aMotion; attribute vec2 aLook;
 varying vec3 vKoi; varying float vPart; varying vec2 vLook; varying float vWorldY;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
 vKoi=position; vPart=aPart; vLook=aLook;
 {
  float z=position.z;
  float tailW=smoothstep(.2,${TAIL.toFixed(2)},z);
  float wave=sin(aMotion.x-z*9.)*aMotion.z*(.1+.9*tailW*tailW)*.11;
  float bend=aMotion.y*(z-.18)*(z-.18)*1.6;
  transformed.x+=wave+bend;
  if(aPart>1.5){
   float flap=sin(aMotion.w)*.5+.15;
   transformed.y+=flap*abs(position.x)*.6;
   transformed.z-=abs(flap)*abs(position.x)*.15;
  }
  if(aPart>.5&&aPart<1.5&&z<${PEDUNCLE.toFixed(2)}){
   transformed.x+=sin(aMotion.x-z*9.-1.2)*aMotion.z*.03*(${PEDUNCLE.toFixed(2)}-z)*8.;
  }
 }`)
            .replace('#include <project_vertex>', `#include <project_vertex>
 vWorldY=(modelMatrix*instanceMatrix*vec4(transformed,1.)).y;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
 uniform float uWaterY; uniform float uGlint; uniform float uNight;
 varying vec3 vKoi; varying float vPart; varying vec2 vLook; varying float vWorldY;
 float kHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float kNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(kHash(i),kHash(i+vec3(1,0,0)),f.x),mix(kHash(i+vec3(0,1,0)),kHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(kHash(i+vec3(0,0,1)),kHash(i+vec3(1,0,1)),f.x),mix(kHash(i+vec3(0,1,1)),kHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
 {
  vec3 p=vKoi; float seed=vLook.y*37.;
  float pat=kNoise(vec3(p.x*16.,p.y*18.,p.z*19.)+seed)*.7+kNoise(p*38.+seed*1.7)*.3;
  float top=smoothstep(-.03,.05,p.y);
  vec3 white=vec3(.97,.95,.9), red=vec3(.92,.16,.04), black=vec3(.05,.05,.06), gold=vec3(1.,.72,.25), orange=vec3(1.,.45,.1);
  int v=int(vLook.x+.5);
  vec3 c=white;
  if(v==0){c=mix(white,red,smoothstep(.5,.56,pat)*top);}
  else if(v==1){c=mix(white,red,smoothstep(.52,.58,pat)*top);c=mix(c,black,smoothstep(.72,.76,kNoise(p*30.+seed*3.))*top);}
  else if(v==2){c=mix(black,red,smoothstep(.48,.54,pat)*top);c=mix(c,white,smoothstep(.6,.66,kNoise(p*14.+seed*2.)));}
  else if(v==3){c=gold*(.9+.2*kNoise(p*40.));}
  else if(v==4){c=mix(orange,white,smoothstep(.62,.7,pat)*.8);}
  else {c=mix(white,red,smoothstep(.055,.04,length(vec2(p.x*.9,p.z-.25)))*top);}
  c=mix(c,white*.95,(1.-smoothstep(-.07,-.02,p.y))*.75);
  // Reticulated scales on the back.
  float scale=sin(p.z*150.)*sin(p.x*150.+p.z*75.);
  c*=.94+.08*smoothstep(.2,1.,scale)*top;
  if(vPart>.5){
   float ray=.75+.25*sin(atan(p.y,p.z+${(-PEDUNCLE).toFixed(2)})*55.);
   c=mix(c,vec3(1.,.93,.82),.55)*ray;
  }
  // Eyes.
  float eye=length(vec2(abs(p.x)-.052,p.y-.022)*vec2(1.,1.)+vec2(0.,0.))+abs(p.z-.31)*1.2;
  c=mix(c,vec3(.02),smoothstep(.016,.011,eye));
  // Seen through water: depth absorbs reds and softens contrast.
  // Below the surface water absorbs red first and veils contrast; airborne koi stay crisp.
  float depth=clamp((uWaterY-vWorldY)/.75,0.,1.);
  vec3 water=vec3(.07,.2,.18);
  c=mix(c,c*vec3(.45,.72,.7),smoothstep(0.,.35,depth)*.7);
  c=mix(c,water,depth*.5);
  diffuseColor.rgb=c;
 }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 totalEmissiveRadiance+=diffuseColor.rgb*uGlint*.35+vec3(1.,.8,.4)*uGlint*.08;`);
    };
    material.customProgramCacheKey = () => 'ys3-koi';
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = 'KoiSchool';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    return { mesh, motion, uniforms };
}
