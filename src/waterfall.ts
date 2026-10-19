import * as THREE from 'three';
import { WATER_Y } from './koi-state';
import { lakePoint } from './landscape';

/**
 * Ballistic waterfalls. Every sheet row is a time-of-flight `tau`: water leaves
 * the lip with horizontal speed V0 and falls under gravity. The shaders sample
 * noise at (uTime - tau), so each streak is fixed to a parcel of water and
 * stretches naturally as the parcel accelerates. Everything animates on the GPU.
 */
export const FALLS = [{ x: -12, z: 11, w: 2.8 }, { x: 0, z: 13, w: 3.6 }, { x: 11, z: 11, w: 3.1 }, { x: 21, z: 3, w: 2.2 }];
const G = 9.8, V0 = 1.45, DROP = 13.5, T_END = Math.sqrt(2 * DROP / G);
type Uniforms = { uTime: { value: number }; uNight: { value: number } };

const NOISE = /* glsl */`
 float wHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float wNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wHash(i),wHash(i+vec2(1,0)),f.x),mix(wHash(i+vec2(0,1)),wHash(i+vec2(1,1)),f.x),f.y);}
 float wFbm(vec2 p){return .55*wNoise(p)+.3*wNoise(p*2.13)+.15*wNoise(p*4.31);}
`;

function frameOf(a: { x: number; z: number }) {
    const out = new THREE.Vector3(a.x, 0, a.z).normalize();
    return { out, right: new THREE.Vector3(out.z, 0, -out.x) };
}

/** Curved sheet: rows by time of flight, columns across, slight outward bulge. */
function sheetGeometry(a: { x: number; z: number; w: number }, widthScale: number, push: number, tau0: number) {
    const { out, right } = frameOf(a);
    const rows = 64, cols = 14, pos: number[] = [], uv: number[] = [], tauAttr: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rows; j++) {
        const tau = tau0 + (T_END - tau0) * (j / rows) ** 1.35;
        const s = V0 * tau, drop = .5 * G * tau * tau;
        for (let i = 0; i <= cols; i++) {
            const u = i / cols, across = (u - .5) * a.w * widthScale * (1 + tau * .2);
            const bulge = push + .14 * (1 - (2 * u - 1) ** 2) * Math.min(1, tau * 3);
            pos.push(a.x + right.x * across + out.x * (s + bulge), WATER_Y - drop, a.z + right.z * across + out.z * (s + bulge));
            uv.push(u, tau / T_END);
            tauAttr.push(tau);
            if (i < cols && j < rows) {
                const k = j * (cols + 1) + i;
                idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
            }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('tau', new THREE.Float32BufferAttribute(tauAttr, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

export function createWaterfalls(root: THREE.Object3D, uniforms: Uniforms, sunDir: THREE.Vector3, lake?: THREE.Mesh) {
    const shared = { uTime: uniforms.uTime, uNight: uniforms.uNight, uSun: { value: sunDir }, uTEnd: { value: T_END } };
    const vertex = /* glsl */`
 attribute float tau; varying vec2 vUv; varying float vTau; varying vec3 vN; varying vec3 vW;
 void main(){vUv=uv;vTau=tau;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
    const sheetMat = (veil: boolean) => new THREE.ShaderMaterial({
        uniforms: { ...shared, uSeed: { value: veil ? 7.3 : 1.1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: vertex,
        fragmentShader: /* glsl */`
 uniform float uTime; uniform float uNight; uniform vec3 uSun; uniform float uTEnd; uniform float uSeed;
 varying vec2 vUv; varying float vTau; varying vec3 vN; varying vec3 vW;
 ${NOISE}
 void main(){
  // Streaks drift slower than the falling parcels: a calmer, silkier fall.
  float parcel=uTime*.6-vTau;
  float k=vTau/uTEnd;
  vec2 q=vec2(vUv.x*${veil ? '22.' : '34.'}+uSeed, parcel*${veil ? '4.' : '3.2'});
  float streak=wFbm(q*vec2(1.,1.))*.7+wNoise(vec2(vUv.x*90.+uSeed,parcel*9.))*.3;
  float clump=wFbm(vec2(vUv.x*7.+uSeed,parcel*1.6));
  float edge=smoothstep(0.,.12+.08*clump,vUv.x)*smoothstep(0.,.12+.08*clump,1.-vUv.x);
  float glassy=1.-smoothstep(.0,.2,k);
  float breakup=smoothstep(.1+k*${veil ? '.5' : '.28'},.6+k*.3,clump*.6+streak*.6);
  float a=edge*mix(breakup,1.,glassy*.85);
  a*=${veil ? '.26*smoothstep(.08,.3,k)' : '.86'};
  a*=1.-smoothstep(.7,1.,k);
  vec3 deep=vec3(.06,.18,.17), foam=vec3(.86,.9,.9);
  vec3 c=mix(deep,foam,clamp(streak*1.1-.3+pow(k,.8)*1.1,0.,1.)*(1.-glassy*.85));
  vec3 view=normalize(cameraPosition-vW);
  float lit=.72+.38*max(dot(normalize(vN),uSun),0.)+.25*pow(max(dot(-view,uSun),0.),3.);
  c*=lit;
  c=mix(c,c*vec3(.22,.32,.5),uNight*.85);
  gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
    const coreMat = sheetMat(false), veilMat = sheetMat(true);
    // The outlet streams reuse the lake's own planar reflection, so lake and stream are one body of water.
    const lakeUniforms = lake ? (lake.material as THREE.ShaderMaterial).uniforms : null;
    const texMat = new THREE.Matrix4(), lakeInverse = new THREE.Matrix4();
    const outletMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, tDiffuse: lakeUniforms ? lakeUniforms.tDiffuse : { value: null }, uTexMat: { value: texMat }, uHasReflection: { value: lake ? 1 : 0 } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `uniform mat4 uTexMat;varying vec2 vUv;varying vec3 vW;varying vec4 vRefl;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vRefl=uTexMat*w;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: /* glsl */`
 uniform float uTime; uniform float uNight; uniform sampler2D tDiffuse; uniform float uHasReflection;
 varying vec2 vUv; varying vec3 vW; varying vec4 vRefl;
 ${NOISE}
 void main(){
  // vUv.y: 0 inside the lake, 1 at the lip. A slow drift that quickens only near the edge.
  float y=vUv.y, along=y*(1.+y*1.6)-uTime*.32;
  vec2 slope=(vec2(wNoise(vec2(vUv.x*5.,along*3.)),wNoise(vec2(vUv.x*5.+3.,along*3.+7.)))-.5)*(.012+.03*y);
  vec3 view=normalize(cameraPosition-vW);
  vec3 n=normalize(vec3(slope.x,1.,slope.y));
  float fres=.035+.965*pow(1.-max(dot(n,view),0.),4.);
  vec3 refl=uHasReflection>.5?texture2D(tDiffuse,clamp(vRefl.xy/vRefl.w+slope*.6,.001,.999)).rgb:vec3(.5,.6,.65);
  vec3 jade=mix(vec3(.06,.19,.15),vec3(.02,.1,.1),.5);
  vec3 c=mix(jade,refl,mix(.36,.88,fres));
  float lip=smoothstep(.8,1.,y);
  c+=vec3(.05,.07,.07)*smoothstep(.55,.95,wFbm(vec2(vUv.x*12.,along*5.)))*(.25+lip);
  c=mix(c,c*1.15+vec3(.03,.04,.04),lip*.5);
  c=mix(c,c*vec3(.3,.4,.55),uNight*.6);
  float edge=smoothstep(0.,.22,vUv.x)*smoothstep(0.,.22,1.-vUv.x);
  float a=edge*smoothstep(0.,.3,y)*mix(.72,.94,fres);
  gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
    const meshes: THREE.Mesh[] = [];
    FALLS.forEach((a, fi) => {
        const core = new THREE.Mesh(sheetGeometry(a, 1, 0, 0), coreMat);
        core.name = `WaterfallFront_${fi + 1}`;
        core.userData.event = 'camera.waterfall';
        core.renderOrder = 4;
        const veil = new THREE.Mesh(sheetGeometry(a, 1.32, .16, .08), veilMat);
        veil.name = `WaterfallVeil_${fi + 1}`;
        veil.renderOrder = 5;
        // Channel from the lake to the lip, dipping slightly over the edge.
        const { right } = frameOf(a);
        const [sx, sz] = lakePoint(Math.atan2(a.z / 9, a.x / 18));
        const start = new THREE.Vector3(sx * .8, WATER_Y + .012, sz * .8), end = new THREE.Vector3(a.x, WATER_Y + .012, a.z);
        const verts: number[] = [], uvs: number[] = [], ix: number[] = [];
        const rows = 24, cols = 6;
        for (let j = 0; j <= rows; j++) {
            const t = j / rows, p = start.clone().lerp(end, t);
            p.y -= .05 * t ** 3;
            for (let i = 0; i <= cols; i++) {
                const w = (i / cols - .5) * a.w * (1.3 - t * .3);
                verts.push(p.x + right.x * w, p.y, p.z + right.z * w);
                uvs.push(i / cols, t);
                if (j < rows && i < cols) {
                    const k = j * (cols + 1) + i;
                    ix.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
                }
            }
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        sg.setIndex(ix);
        const stream = new THREE.Mesh(sg, outletMat);
        stream.name = `LakeOutlet_${fi + 1}`;
        stream.renderOrder = 4;
        // Layer 1 only: the reflection camera (layer 0) never draws the streams that sample its texture.
        stream.layers.set(1);
        stream.onBeforeRender = () => {
            // The lake (renderOrder 3) has refreshed its texture matrix by now.
            if (!lake || !lakeUniforms) return;
            lakeInverse.copy(lake.matrixWorld).invert();
            texMat.multiplyMatrices(lakeUniforms.textureMatrix.value, lakeInverse);
        };
        root.add(core, veil, stream);
        meshes.push(core, veil, stream);
    });

    // GPU droplet streaks riding the same trajectories.
    const STREAKS = 520;
    const streakGeo = new THREE.InstancedBufferGeometry();
    streakGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3));
    streakGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds: number[] = [];
    for (let i = 0; i < STREAKS; i++) seeds.push(i % FALLS.length, Math.random(), Math.random(), .6 + Math.random() * .8);
    streakGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4));
    const fallData = new Float32Array(FALLS.length * 4);
    FALLS.forEach((a, i) => { const { out } = frameOf(a); fallData.set([a.x, a.z, a.w, Math.atan2(out.z, out.x)], i * 4); });
    const streakMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uFalls: { value: Array.from({ length: FALLS.length }, (_, i) => new THREE.Vector4(...fallData.slice(i * 4, i * 4 + 4))) }, uOpacity: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        vertexShader: /* glsl */`
 attribute vec4 aSeed; uniform float uTime; uniform float uTEnd; uniform vec4 uFalls[${FALLS.length}];
 varying float vA; varying float vY;
 void main(){
  vec4 f=uFalls[int(aSeed.x+.5)];
  float life=uTEnd*1.05;
  float tau=mod(uTime*aSeed.w*.8+aSeed.y*life,life);
  vec3 fwd=vec3(cos(f.w),0.,sin(f.w)); vec3 right=vec3(fwd.z,0.,-fwd.x);
  float across=(aSeed.z-.5)*f.z*(1.25+tau*.25);
  float s=${V0.toFixed(2)}*tau+.1+.25*fract(aSeed.y*17.);
  vec3 c=vec3(f.x,${WATER_Y.toFixed(2)},f.y)+right*across+fwd*s; c.y-=.5*${G.toFixed(1)}*tau*tau;
  float speed=length(vec2(${V0.toFixed(2)},${G.toFixed(1)}*tau));
  vec3 cam=normalize(cameraPosition-c);
  vec3 side=normalize(cross(vec3(0.,1.,0.),cam));
  float len=.06+speed*.055, wid=.022+.012*fract(aSeed.z*31.);
  vec3 p=c+side*position.x*wid+vec3(0.,1.,0.)*(position.y-.5)*len;
  vA=smoothstep(0.,.15,tau)*(1.-smoothstep(.75,1.,tau/uTEnd)); vY=position.y;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 }`,
        fragmentShader: /* glsl */`
 uniform float uNight; uniform float uOpacity; varying float vA; varying float vY;
 void main(){vec3 c=mix(vec3(.9,.97,1.),vec3(.25,.33,.5),uNight*.8);gl_FragColor=vec4(c,vA*.32*uOpacity*(1.-abs(vY-.5)*1.4));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
    const streaks = new THREE.Mesh(streakGeo, streakMat);
    streaks.name = 'WaterfallStreaks';
    streaks.frustumCulled = false;
    streaks.renderOrder = 6;
    root.add(streaks);

    // Soft mist puffs: where the fall dissolves into the cloud sea, and at the lip.
    const MIST = 96;
    const mistGeo = new THREE.InstancedBufferGeometry();
    mistGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    mistGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const ms: number[] = [];
    for (let i = 0; i < MIST; i++) ms.push(i % FALLS.length, Math.random(), Math.random(), i % 6 === 0 ? 1 : 0);
    mistGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(ms), 4));
    const mistMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, uFalls: streakMat.uniforms.uFalls },
        transparent: true, depthWrite: false,
        vertexShader: /* glsl */`
 attribute vec4 aSeed; uniform float uTime; uniform float uTEnd; uniform vec4 uFalls[${FALLS.length}];
 varying vec2 vQ; varying float vA;
 void main(){
  vec4 f=uFalls[int(aSeed.x+.5)];
  vec3 fwd=vec3(cos(f.w),0.,sin(f.w)); vec3 right=vec3(fwd.z,0.,-fwd.x);
  float cycle=mod(uTime*.12+aSeed.y,1.);
  vec3 c; float size;
  if(aSeed.w>.5){
   // Lip spray, small and quick.
   cycle=mod(uTime*.5+aSeed.y,1.);
   c=vec3(f.x,${WATER_Y.toFixed(2)},f.y)+right*(aSeed.z-.5)*f.z+fwd*(.25+cycle*.5); c.y+=-.2-cycle*.5;
   size=.35+cycle*.6; vA=sin(cycle*3.1416)*.28;
  } else {
   float tau=uTEnd*(.62+.38*aSeed.z);
   c=vec3(f.x,${WATER_Y.toFixed(2)},f.y)+right*(aSeed.y-.5)*f.z*1.6+fwd*(${V0.toFixed(2)}*tau+.4+cycle*1.2);
   c.y-=.5*${G.toFixed(1)}*tau*tau; c.y+=cycle*1.4-.6;
   size=1.+cycle*2.4; vA=sin(cycle*3.1416)*.24*smoothstep(.62,.8,tau/uTEnd);
  }
  vec4 mv=viewMatrix*vec4(c,1.);
  float rot=aSeed.y*6.283+uTime*.1;
  vec2 q=vec2(cos(rot)*position.x-sin(rot)*position.y,sin(rot)*position.x+cos(rot)*position.y);
  mv.xy+=q*size; vQ=position.xy;
  gl_Position=projectionMatrix*mv;
 }`,
        fragmentShader: /* glsl */`
 uniform float uNight; varying vec2 vQ; varying float vA;
 void main(){float r=length(vQ);float a=smoothstep(1.,.15,r)*vA;vec3 c=mix(vec3(.96,.98,1.),vec3(.3,.37,.52),uNight*.8);gl_FragColor=vec4(c,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
    const mist = new THREE.Mesh(mistGeo, mistMat);
    mist.name = 'WaterfallMist';
    mist.frustumCulled = false;
    mist.renderOrder = 7;
    root.add(mist);
    meshes.push(streaks, mist);
    return {
        meshes,
        count: FALLS.length,
        setQuality(q: 'high' | 'balanced' | 'low') { streakGeo.instanceCount = q === 'low' ? 200 : q === 'balanced' ? 380 : STREAKS; mistGeo.instanceCount = q === 'low' ? 48 : MIST; },
    };
}
