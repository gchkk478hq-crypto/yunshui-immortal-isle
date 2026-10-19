import * as THREE from 'three';

/**
 * 仙气: a soft cloud sea under the island, wisps girdling its rim, high
 * clouds, low mist over the lake and woods, faint sun shafts and drifting
 * motes (fireflies at night). Everything billboards and drifts on the GPU.
 * Sprites fade near the camera, and wisps thin out where they would cover the
 * island in the middle of the view, so the atmosphere never hides the scene.
 */
const SUN = new THREE.Vector3(-30, 36, 18).normalize();

function cloudAtlas() {
    const size = 512, cell = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    let s = 17;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let k = 0; k < 4; k++) {
        const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
        // Billows stacked on a flatter base: many soft puffs, denser towards the middle.
        for (let i = 0; i < 70; i++) {
            const u = (r() + r() + r()) / 3, v = Math.pow(r(), .7);
            const px = ox + cell * (.12 + .76 * u), py = oy + cell * (.62 - .38 * v * (1 - Math.abs(u - .5) * 1.2));
            const rad = cell * (.07 + .17 * r()) * (1 - Math.abs(u - .5));
            const g = x.createRadialGradient(px, py, 0, px, py, rad);
            const a = .11 + .1 * r();
            g.addColorStop(0, `rgba(255,255,255,${a})`);
            g.addColorStop(.55, `rgba(255,255,255,${a * .55})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g;
            x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
        // Erode the edges with fine speckle so the silhouettes feather out.
        x.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 260; i++) {
            const px = ox + r() * cell, py = oy + r() * cell, rad = 3 + r() * 9;
            const g = x.createRadialGradient(px, py, 0, px, py, rad);
            g.addColorStop(0, 'rgba(0,0,0,.18)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g;
            x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
        x.globalCompositeOperation = 'source-over';
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
}

export function createAtmosphere(scene: THREE.Scene) {
    const disposables: { dispose(): void }[] = [];
    const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uSun: { value: SUN }, uMotion: { value: 1 } };
    const atlas = cloudAtlas();
    disposables.push(atlas);
    let seed = 4242;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

    // ------------------------------------------------------- cloud sprites
    // Per instance: centre xyz, size; (cell, layer, phase, squash).
    const centres: number[] = [], extra: number[] = [];
    const layer = (count: number, id: number, f: () => [number, number, number, number, number]) => {
        for (let i = 0; i < count; i++) {
            const [x, y, z, size, squash] = f();
            centres.push(x, y, z, size);
            extra.push(Math.floor(rnd() * 4), id, rnd() * 6.283, squash);
        }
    };
    const ring = (r0: number, r1: number) => { const a = rnd() * 6.283, r = r0 + (r1 - r0) * Math.sqrt(rnd()); return [Math.cos(a) * r, Math.sin(a) * r * .78] as const; };
    layer(105, 0, () => { const [x, z] = ring(10, 120); return [x, -12 - rnd() * 10, z, 17 + rnd() * 26, .55]; });          // cloud sea
    layer(32, 1, () => { const [x, z] = ring(27, 46); return [x, -4 + rnd() * 5.5, z, 8 + rnd() * 7, .45]; });               // rim wisps
    layer(28, 2, () => [(rnd() - .5) * 280, 24 + rnd() * 45, -90 - rnd() * 80, 28 + rnd() * 34, .5]);                      // high clouds
    layer(30, 3, () => { const lake = rnd() < .55; const a = rnd() * 6.283, r = Math.sqrt(rnd());
        return lake ? [Math.cos(a) * 15 * r, .55 + rnd() * .5, Math.sin(a) * 7.5 * r, 3 + rnd() * 3, .32]
            : [Math.cos(a) * (19 + rnd() * 3), .7 + rnd() * 1, Math.sin(a) * (10.5 + rnd() * 2), 3 + rnd() * 3, .4]; });         // low mist
    const cloudGeo = new THREE.InstancedBufferGeometry();
    cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    cloudGeo.setIndex([0, 1, 2, 0, 2, 3]);
    cloudGeo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(new Float32Array(centres), 4));
    cloudGeo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(new Float32Array(extra), 4));
    cloudGeo.instanceCount = centres.length / 4;
    const cloudMat = new THREE.ShaderMaterial({
        uniforms: { ...uniforms, tAtlas: { value: atlas } }, transparent: true, depthWrite: false,
        vertexShader: /* glsl */`
 attribute vec4 aCentre; attribute vec4 aExtra; uniform float uTime; uniform float uMotion;
 varying vec2 vUv; varying float vA; varying float vLayer; varying float vCell;
 void main(){
  float id=aExtra.y, ph=aExtra.z;
  vec3 c=aCentre.xyz;
  // Slow drift: the cloud sea and wisps circle the island; mist breathes in place.
  float ang=uTime*uMotion*(id<.5?.004:id<1.5?.012:id<2.5?.002:.0);
  c.xz=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*c.xz;
  c+=vec3(sin(uTime*.05*uMotion+ph)*(id>2.5?.6:2.),sin(uTime*.08*uMotion+ph)*(id>2.5?.08:.4),cos(uTime*.04*uMotion+ph)*(id>2.5?.5:1.5));
  vec4 mv=viewMatrix*vec4(c,1.);
  float size=aCentre.w*(1.+.05*sin(uTime*.1+ph));
  float rot=ph+uTime*.004*uMotion;
  vec2 q=mat2(cos(rot),-sin(rot),sin(rot),cos(rot))*position.xy;
  mv.xy+=vec2(q.x,q.y*aExtra.w)*size;
  gl_Position=projectionMatrix*mv;
  vUv=position.xy*.5+.5; vLayer=id; vCell=aExtra.x;
  float dist=-mv.z;
  float near=smoothstep(id>2.5?3.:6.,id>2.5?10.:22.,dist);
  vec4 cp=projectionMatrix*viewMatrix*vec4(c,1.);
  vec2 ndc=cp.xy/max(cp.w,.001);
  float camToIsland=length(cameraPosition);
  // Wisps nearer than the island thin out in the middle of the frame.
  float clear=(id>.5&&id<1.5&&dist<camToIsland)?mix(.25,1.,smoothstep(.15,.75,length(ndc))):1.;
  float layerA=id<.5?.88:id<1.5?.38:id<2.5?.7:.1;
  vA=near*clear*layerA;
 }`,
        fragmentShader: /* glsl */`
 uniform sampler2D tAtlas; uniform float uNight; uniform vec3 uSun;
 varying vec2 vUv; varying float vA; varying float vLayer; varying float vCell;
 void main(){
  vec2 cell=vec2(mod(vCell,2.),floor(vCell/2.));
  vec2 uv=(clamp(vUv,0.,1.)+cell)*.5;
  float a=texture2D(tAtlas,uv).a;
  float soft=smoothstep(1.,.62,length(vUv*2.-1.));
  // Sunlit crowns, cool grey-blue bellies; moonlit at night.
  vec3 top=mix(vec3(1.,.97,.92),vec3(.62,.68,.82),uNight);
  vec3 belly=mix(vec3(.7,.76,.84),vec3(.18,.22,.34),uNight);
  vec3 c=mix(belly,top,smoothstep(.15,.85,vUv.y));
  float alpha=a*soft*vA*(vLayer>2.5?1.6:1.);
  if(alpha<.004) discard;
  gl_FragColor=vec4(c,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.name = 'CloudSea';
    clouds.frustumCulled = false;
    clouds.renderOrder = 6;
    scene.add(clouds);
    disposables.push(cloudGeo, cloudMat);

    // ---------------------------------------------------------- sun shafts
    const shaftCentres: number[] = [];
    for (let i = 0; i < 7; i++) shaftCentres.push(-14 + i * 4.6 + (rnd() - .5) * 2, 4 + rnd() * 3, -6 + (rnd() - .5) * 12, 2 + rnd() * 3.5);
    const shaftGeo = new THREE.InstancedBufferGeometry();
    shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    shaftGeo.setIndex([0, 1, 2, 0, 2, 3]);
    shaftGeo.setAttribute('aCentre', new THREE.InstancedBufferAttribute(new Float32Array(shaftCentres), 4));
    shaftGeo.instanceCount = 7;
    const shaftMat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
 attribute vec4 aCentre; uniform vec3 uSun; uniform float uTime;
 varying vec2 vUv; varying float vNear; varying float vSeed;
 void main(){
  vec3 axis=-uSun;
  vec3 c=aCentre.xyz;
  vec3 toCam=normalize(cameraPosition-c);
  vec3 side=normalize(cross(axis,toCam));
  vec3 p=c+axis*position.y*26.+side*position.x*aCentre.w*(1.+.3*position.y);
  vUv=position.xy+.5; vSeed=aCentre.x;
  vNear=smoothstep(4.,16.,length(cameraPosition-p));
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 }`,
        fragmentShader: /* glsl */`
 uniform float uNight; uniform float uTime; varying vec2 vUv; varying float vNear; varying float vSeed;
 void main(){
  float across=exp(-pow((vUv.x-.5)*3.2,2.));
  float along=smoothstep(0.,.25,vUv.y)*smoothstep(1.,.55,vUv.y);
  float flicker=.75+.25*sin(uTime*.3+vSeed*1.7);
  float a=across*along*flicker*vNear*.05*(1.-uNight);
  gl_FragColor=vec4(vec3(1.,.93,.78)*a,a);
 }`,
    });
    const shafts = new THREE.Mesh(shaftGeo, shaftMat);
    shafts.name = 'SunShafts';
    shafts.frustumCulled = false;
    shafts.renderOrder = 7;
    scene.add(shafts);
    disposables.push(shaftGeo, shaftMat);

    // ------------------------------------------------------- motes / fireflies
    const MOTES = 260, motePos: number[] = [], moteSeed: number[] = [];
    for (let i = 0; i < MOTES; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd());
        motePos.push(Math.cos(a) * 21 * r, .3 + rnd() * 4.5, Math.sin(a) * 12 * r);
        moteSeed.push(rnd() * 6.283, .5 + rnd());
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(moteSeed, 2));
    const moteMat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
 attribute vec2 aSeed; uniform float uTime; uniform float uNight; uniform float uMotion; varying float vA;
 void main(){
  vec3 p=position;
  float t=uTime*uMotion;
  p+=vec3(sin(t*.21*aSeed.y+aSeed.x)*.9,mod(t*.06*aSeed.y+aSeed.x,1.)*1.2-.6+sin(t*.5+aSeed.x)*.15,cos(t*.17*aSeed.y+aSeed.x*1.3)*.9);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float tw=.55+.45*sin(t*(1.5+aSeed.y*2.)+aSeed.x*5.);
  vA=tw*mix(.35,1.,uNight)*smoothstep(1.5,5.,-mv.z);
  gl_PointSize=mix(2.6,4.,uNight)*aSeed.y*(140./-mv.z);
  gl_Position=projectionMatrix*mv;
 }`,
        fragmentShader: /* glsl */`
 uniform float uNight; varying float vA;
 void main(){
  float d=length(gl_PointCoord-.5);
  float a=smoothstep(.5,.0,d)*vA;
  vec3 c=mix(vec3(1.,.95,.82),vec3(.82,1.,.55),uNight);
  gl_FragColor=vec4(c*a,a);
 }`,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.name = 'ImmortalMotes';
    motes.frustumCulled = false;
    motes.renderOrder = 8;
    scene.add(motes);
    disposables.push(moteGeo, moteMat);

    return {
        update(t: number, night: number, reduced: boolean) {
            uniforms.uTime.value = t;
            uniforms.uNight.value = night;
            uniforms.uMotion.value = reduced ? .2 : 1;
        },
        dispose() { [clouds, shafts, motes].forEach(o => o.removeFromParent()); disposables.forEach(d => d.dispose()); },
    };
}
