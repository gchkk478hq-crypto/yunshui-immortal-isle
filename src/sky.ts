import * as THREE from 'three';
import { createCranes } from './cranes';
import { createAtmosphere } from './atmosphere';
export function createSky(scene: THREE.Scene, _camera?: THREE.Camera) {
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { night: { value: 0 } }, vertexShader: `varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `varying vec3 vP;uniform float night;void main(){vec3 d=normalize(vP);float h=clamp(d.y*.9+.52,0.,1.);vec3 day=mix(vec3(.78,.86,.88),vec3(.18,.43,.69),h);vec3 dark=mix(vec3(.13,.22,.31),vec3(.018,.047,.12),h);float sun=pow(max(0.,dot(d,normalize(vec3(-.598,.717,.359)))),90.);vec3 c=mix(day,dark,night)+vec3(1.,.77,.41)*sun*(1.-night)*.55;c=pow(c,vec3(2.2))*1.1;gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}` });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 32, 16), skyMat);
    sky.name = 'SkyDome';
    scene.add(sky);
    const seed = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const atmosphere = createAtmosphere(scene);
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 240; i++) {
        const a = seed(i + 811) * 6.28;
        const h = .1 + seed(i + 234) * .9;
        const r = 200;
        starPos.push(Math.cos(a) * Math.sqrt(1 - h * h) * r, h * r, Math.sin(a) * Math.sqrt(1 - h * h) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xd3e2ed, size: .55, transparent: true, opacity: 0, depthWrite: false });
    scene.add(new THREE.Points(starGeo, starMat));
    const cranes = createCranes(scene);
    let lastT = 0;
    return { update(t: number, night: number, reduced: boolean) { skyMat.uniforms.night.value = night; starMat.opacity = night * .75; atmosphere.update(t, night, reduced); cranes.update(t, Math.max(0, Math.min(.1, t - lastT)), night, reduced); lastT = t; }, dispose() { sky.geometry.dispose(); skyMat.dispose(); atmosphere.dispose(); starGeo.dispose(); starMat.dispose(); cranes.dispose(); } };
}
