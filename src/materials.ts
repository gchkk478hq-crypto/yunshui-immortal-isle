import * as THREE from 'three';

/** Shared, per-frame values for every enriched material (wind, sun, time). */
export const natureUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uSunDir: { value: new THREE.Vector3(-30, 36, 18).normalize() },
    uSunGlow: { value: 1 },
};

/** Per-tree spring state written by trees.ts and read in the vertex shader. */
export interface TreeUniforms {
    uShake: { value: THREE.Vector3 };
    uBase: { value: THREE.Vector3 };
    uHeight: { value: number };
    uFlutter: { value: number };
}

type Kind = 'rock' | 'bark' | 'foliage' | 'roof' | 'marble' | 'plaster' | 'ground' | 'plain';

function kindOf(name: string): Kind {
    if (/Basalt|Rock|WetStone|Taihu/.test(name)) return 'rock';
    if (/Bark|^Wood/.test(name)) return 'bark';
    if (/Pine|Leaf|Ivy|Shrub|Maple|Camphor|Blossom|Bamboo|Moss|Flower/.test(name)) return 'foliage';
    if (/^Grass|^Earth/.test(name)) return 'ground';
    if (name === 'Roof') return 'roof';
    if (/Marble|Stone/.test(name)) return 'marble';
    if (name === 'Plaster') return 'plaster';
    return 'plain';
}

const NOISE = /* glsl */`
 float ysHash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float ysNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(ysHash(i),ysHash(i+vec3(1,0,0)),f.x),mix(ysHash(i+vec3(0,1,0)),ysHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(ysHash(i+vec3(0,0,1)),ysHash(i+vec3(1,0,1)),f.x),mix(ysHash(i+vec3(0,1,1)),ysHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float ysFbm(vec3 p){return .55*ysNoise(p)+.3*ysNoise(p*2.07)+.15*ysNoise(p*4.13);}
`;

/** Screen-derivative bump: perturbs the shading normal from a scalar relief. */
const BUMP = (relief: string) => /* glsl */`
 {
 float relief=${relief};
 vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
 vec3 rx=cross(sy,normal), ry=cross(normal,sx);
 float det=dot(sx,rx);
 vec3 grad=sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry);
 normal=normalize(abs(det)*normal-grad);
 }`;

const COLOR: Record<Kind, string> = {
    rock: /* glsl */`
 vec3 p=vYsWorld;
 float n1=ysFbm(p*vec3(.35,.18,.35));
 float streak=ysNoise(vec3(p.x*2.6,p.y*.22,p.z*2.6))*.65+ysNoise(vec3(p.x*5.3,p.y*.45,p.z*5.3))*.35;
 float grain=ysNoise(p*9.);
 vec3 warm=vec3(1.06,1.0,.9), cool=vec3(.9,.96,1.02);
 diffuseColor.rgb*=mix(cool,warm,n1)*mix(.78,1.12,n1);
 diffuseColor.rgb*=mix(.7,1.05,smoothstep(.25,.7,streak));
 diffuseColor.rgb*=.92+grain*.14;
 float lichen=smoothstep(.74,.82,ysNoise(p*6.3+7.))*smoothstep(.4,.7,n1);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.6,.5),lichen*.22);
 float up=clamp(vYsNormal.y,0.,1.);
 float mossMask=smoothstep(.45,.85,up+(fract(n1*3.7)-.5)*.5+(grain-.5)*.5);
 #ifdef YS_TAIHU
 mossMask*=.2;
 #endif
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.27,.07)*(.75+.5*grain),mossMask*.85);
 float wet=1.-smoothstep(.15,.75,p.y);diffuseColor.rgb*=mix(1.,.7,wet*step(-1.2,p.y));`,
    bark: /* glsl */`
 vec3 p=vYsLocal;
 float fiss=ysNoise(vec3(p.x*16.,p.y*2.2,p.z*16.));
 diffuseColor.rgb*=.7+fiss*.5;
 float lich=smoothstep(.7,.85,ysNoise(p*5.));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.46,.36),lich*.4);`,
    foliage: /* glsl */`
 float leaves=ysNoise(vYsWorld*3.4);
 #ifdef YS_NEEDLES
 float tufts=ysNoise(vYsWorld*19.)*.6+ysNoise(vYsWorld*41.)*.4;
 diffuseColor.rgb*=(.84+leaves*.3)*mix(.62,1.12,smoothstep(.25,.75,tufts));
 #else
 float cluster=ysNoise(vYsWorld*8.)*.65+ysNoise(vYsWorld*17.)*.35;
 diffuseColor.rgb*=(.86+leaves*.24)*mix(.8,1.08,smoothstep(.3,.7,cluster));
 #endif`,
    ground: /* glsl */`
 vec3 p=vYsWorld;
 float g=ysFbm(p*vec3(.6,.6,.6));
 diffuseColor.rgb*=mix(vec3(.82,.86,.7),vec3(1.12,1.08,.92),g);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.25,1.05,.7),smoothstep(.6,.8,ysNoise(p*2.3))*.4);`,
    roof: /* glsl */`
 vec3 wn=normalize(vYsNormal);
 float side=step(abs(wn.z),abs(wn.x));
 float coord=mix(vYsWorld.x,vYsWorld.z,side);
 float tile=sin(coord*26.18);
 float course=sin(vYsWorld.y*20.);
 diffuseColor.rgb*=.72+.34*smoothstep(-.6,1.,tile);
 diffuseColor.rgb*=.94+.06*course;
 diffuseColor.rgb*=.9+.2*ysNoise(vYsWorld*1.7);`,
    marble: /* glsl */`
 vec3 p=vYsWorld;
 float vein=abs(sin(p.x*1.7+p.y*2.3+ysFbm(p*1.5)*6.));
 diffuseColor.rgb*=mix(.9,1.04,smoothstep(.0,.12,vein));
 diffuseColor.rgb*=.94+.1*ysNoise(p*4.);
 float wet=1.-smoothstep(.2,.6,p.y);diffuseColor.rgb*=mix(1.,.72,wet);`,
    plaster: /* glsl */`
 diffuseColor.rgb*=.92+.1*ysFbm(vYsWorld*2.);`,
    plain: '',
};

const RELIEF: Partial<Record<Kind, string>> = {
    rock: 'ysNoise(vYsWorld*vec3(5.,2.4,5.))*.06+ysNoise(vec3(vYsWorld.x*3.,vYsWorld.y*.35,vYsWorld.z*3.))*.05',
    bark: 'ysNoise(vec3(vYsLocal.x*16.,vYsLocal.y*2.2,vYsLocal.z*16.))*.02',
    roof: '(sin(mix(vYsWorld.x,vYsWorld.z,step(abs(normalize(vYsNormal).z),abs(normalize(vYsNormal).x)))*26.18)*.5+.5)*.012',
    ground: 'ysNoise(vYsWorld*7.)*.012',
    foliage: 'ysNoise(vYsWorld*19.)*.024+ysNoise(vYsWorld*41.)*.012',
};

/**
 * Original procedural surface detail. Foliage and tree meshes also sway in the
 * wind; with tree uniforms a whole tree bends from its base like a spring.
 */
export function enrichMaterial(m: THREE.MeshStandardMaterial, tree?: TreeUniforms) {
    const kind = kindOf(m.name);
    const thin = /Pine|Leaf|Ivy|Grass|Blossom|Maple|Camphor|Flower/.test(m.name);
    const leafy = kind === 'foliage' && !/Bamboo|Moss/.test(m.name) || /^Grass/.test(m.name);
    const sway = !!tree || leafy;
    if (thin) { m.side = THREE.DoubleSide; m.shadowSide = THREE.DoubleSide; }
    if (kind === 'rock') m.roughness = m.name === 'WetStone' ? .38 : .9;
    if (kind === 'foliage' || kind === 'ground') m.roughness = .82;
    if (kind === 'bark') m.roughness = .9;
    if (kind === 'roof') { m.roughness = .32; m.metalness = .15; }
    if (kind === 'marble') m.roughness = .5;
    if (kind === 'plain' && !sway) return;
    m.onBeforeCompile = shader => {
        shader.uniforms.uTime = natureUniforms.uTime;
        shader.uniforms.uWind = natureUniforms.uWind;
        shader.uniforms.uSunDir = natureUniforms.uSunDir;
        shader.uniforms.uSunGlow = natureUniforms.uSunGlow;
        if (tree) Object.assign(shader.uniforms, tree);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
 varying vec3 vYsWorld; varying vec3 vYsLocal; varying vec3 vYsNormal;
 uniform float uTime; uniform float uWind;
 ${tree ? 'uniform vec3 uShake; uniform vec3 uBase; uniform float uHeight; uniform float uFlutter;' : ''}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
 vYsLocal=position;
 {
 vec3 wp=(modelMatrix*vec4(transformed,1.)).xyz;
 vec3 off=vec3(0.);
 ${tree ? `
 float hN=clamp((wp.y-uBase.y)/uHeight,0.,1.5);
 float bend=hN*hN;
 vec2 gust=vec2(sin(uTime*.83+uBase.x*.37)+.35*sin(uTime*2.1+uBase.z),cos(uTime*.67+uBase.z*.41)+.3*sin(uTime*1.7+uBase.x))*.012*uWind;
 off.xz+=(gust*uHeight+uShake.xz)*bend;
 off.y-=dot(off.xz,off.xz)/max(uHeight,.5)*.6;
 float flutterAmp=.01*uWind+uFlutter*.045;` : `
 float bend=1.; float flutterAmp=.008*uWind;`}
 ${leafy ? `
 float ph=dot(wp,vec3(1.7,1.3,2.1));
 #ifdef USE_COLOR
 float lw=${tree ? 'bend' : 'clamp(color.g,0.,1.)'};
 #else
 float lw=${tree ? 'bend' : '1.'};
 #endif
 off+=vec3(sin(uTime*3.3+ph),.6*sin(uTime*2.4+ph*1.3),cos(uTime*2.9+ph*.7))*flutterAmp*lw;` : ''}
 transformed+=(vec4(off,0.)*modelMatrix).xyz;
 vYsWorld=(modelMatrix*vec4(transformed,1.)).xyz;
 }`)
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
 vYsNormal=normalize(mat3(modelMatrix)*objectNormal);`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
 ${/^Pine/.test(m.name) ? '#define YS_NEEDLES' : ''}
 ${m.name === 'Taihu' ? '#define YS_TAIHU' : ''}
 ${/Card$/.test(m.name) ? '#define YS_CARD' : ''}
 varying vec3 vYsWorld; varying vec3 vYsLocal; varying vec3 vYsNormal;
 uniform vec3 uSunDir; uniform float uSunGlow;
 ${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
 ${COLOR[kind]}`);
        if (/Card$/.test(m.name)) {
            // Cards keep their sphere-like normals on both faces (no back-face flip).
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
 normal = normalize( vNormal );`);
        }
        const relief = RELIEF[kind];
        if (relief) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
 ${BUMP(relief)}`);
        if (kind === 'foliage') {
            // Sunlight scattering through thin leaves when looking towards the sun.
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 {
 vec3 toCam=normalize(cameraPosition-vYsWorld);
 float back=pow(max(dot(-toCam,uSunDir),0.),3.);
 totalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.95,.6)*(back*.55+.06)*uSunGlow;
 }`);
        }
    };
    m.customProgramCacheKey = () => `ys3-${kind}-${tree ? 'tree' : 'static'}-${leafy ? 'leafy' : 'solid'}-${/^Pine/.test(m.name) ? 'needle' : m.name === 'Taihu' ? 'taihu' : 'leaf'}-${/Card$/.test(m.name) ? 'card' : 'solid'}`;
    m.needsUpdate = true;
}
