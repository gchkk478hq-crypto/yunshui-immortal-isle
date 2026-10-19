import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { lakePoint } from './landscape';
import { WATER_Y } from './koi-state';

type Quality = 'high' | 'balanced' | 'low';
const sizes: Record<Quality, number> = { low: 512, balanced: 1024, high: 1536 };
const segments = 192, rings = 20;

/** The shore vertices use the same radial profile as the terrain and koi bounds. */
function lakeGeometry() {
    const positions = [0, 0, 0], shore = [9], uv = [.5, .5], indices: number[] = [];
    for (let ring = 1; ring <= rings; ring++) {
        const fraction = ring / rings;
        for (let i = 0; i < segments; i++) {
            const [x, z] = lakePoint(i / segments * Math.PI * 2);
            positions.push(x * fraction, -z * fraction, 0);
            shore.push(Math.hypot(x, z) * (1 - fraction));
            uv.push(x * fraction / 36 + .5, z * fraction / 18 + .5);
            const current = 1 + (ring - 1) * segments + i;
            const next = 1 + (ring - 1) * segments + (i + 1) % segments;
            if (ring === 1) indices.push(0, next, current);
            else {
                const inner = current - segments, innerNext = next - segments;
                indices.push(inner, innerNext, current, innerNext, next, current);
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('shoreDistance', new THREE.Float32BufferAttribute(shore, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

export function createLakeSurface(initialQuality: Quality = 'balanced') {
    let quality = initialQuality, disposed = false, hasReflection = false, lastReflection = -Infinity;
    const shader = {
        name: 'JadeLakePlanarReflection',
        uniforms: {
            color: { value: new THREE.Color(0x255c59) }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
            uTime: { value: 0 }, uNight: { value: 0 }, uSunDirection: { value: new THREE.Vector3(-30, 36, 18).normalize() },
        },
        vertexShader: /* glsl */`
            uniform mat4 textureMatrix;
            attribute float shoreDistance;
            varying vec4 vReflection;
            varying vec3 vWorld;
            varying float vShore;
            void main() {
                vReflection = textureMatrix * vec4(position, 1.0);
                vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                vShore = shoreDistance;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform sampler2D tDiffuse;
            uniform float uTime;
            uniform float uNight;
            uniform vec3 uSunDirection;
            varying vec4 vReflection;
            varying vec3 vWorld;
            varying float vShore;
            void main() {
                vec2 p = vWorld.xz;
                // Analytic derivatives keep long, quiet ripples rather than noisy normals.
                float a = dot(p, vec2(1.75, .65)) + uTime * .68;
                float b = dot(p, vec2(-1.15, 3.2)) - uTime * .91;
                float c = dot(p, vec2(5.8, 4.1)) + uTime * 1.2;
                vec2 slope = cos(a) * vec2(1.75, .65) * .009
                    + cos(b) * vec2(-1.15, 3.2) * .0045
                    + cos(c) * vec2(5.8, 4.1) * .0015;
                vec3 normal = normalize(vec3(-slope.x, 1., -slope.y));
                vec3 view = normalize(cameraPosition - vWorld);
                float fresnel = .035 + .965 * pow(1. - max(dot(normal, view), 0.), 4.);
                float depth = smoothstep(.05, 4.4, vShore);
                vec3 jade = mix(vec3(.075, .24, .185), vec3(.012, .085, .092), depth);
                jade *= mix(1., .3, uNight);
                vec2 reflectionUv = vReflection.xy / vReflection.w;
                reflectionUv += slope * .018 * smoothstep(0., 1.3, vShore);
                vec3 reflected = texture2D(tDiffuse, clamp(reflectionUv, .001, .999)).rgb;
                // Keep actual silhouettes intact; the lake's tint supplies the depth underneath.
                float reflectedAmount = mix(.36, .88, fresnel);
                vec3 water = mix(jade, reflected, reflectedAmount);
                float glint = pow(max(dot(reflect(-uSunDirection, normal), view), 0.), 260.);
                water += vec3(1., .77, .43) * glint * 1.35 * (1. - uNight * .85);
                float caustic = pow(max(0., sin(a * 2.7 + sin(b)) * sin(b * 1.7 + sin(c))), 10.);
                water += vec3(.12, .21, .12) * caustic * (1. - depth) * (1. - uNight) * .22;
                // Soft shoreline: shallow water thins out instead of ending in a hard line.
                float shoreFade = smoothstep(.0, .55, vShore);
                gl_FragColor = vec4(water, mix(.72, .94, fresnel) * mix(.45, 1., shoreFade));
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `,
    };
    const mesh = new Reflector(lakeGeometry(), {
        textureWidth: sizes[quality], textureHeight: sizes[quality], multisample: 0, clipBias: .002, shader,
    });
    mesh.name = 'LakeSurface';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_Y;
    mesh.userData.event = 'lake.feed';
    mesh.renderOrder = 3;
    const material = mesh.material as THREE.ShaderMaterial;
    material.transparent = true;
    material.depthWrite = false;
    material.side = THREE.DoubleSide;
    material.forceSinglePass = true;

    // A single bed mesh retains the underwater fish silhouettes without a second water plane.
    const bedGeometry = mesh.geometry.clone();
    const colors: number[] = [];
    const shallow = new THREE.Color('#677b49'), deep = new THREE.Color('#284b42');
    const depthAttribute = bedGeometry.getAttribute('shoreDistance');
    for (let i = 0; i < depthAttribute.count; i++) {
        const t = THREE.MathUtils.smoothstep(depthAttribute.getX(i), 0, 5);
        const tint = shallow.clone().lerp(deep, t);
        colors.push(tint.r, tint.g, tint.b);
    }
    bedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const bed = new THREE.Mesh(bedGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 }));
    bed.name = 'LakeBed';
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = -1.7;
    bed.receiveShadow = true;

    const renderReflection = mesh.onBeforeRender;
    const previousCamera = new THREE.Matrix4(), previousProjection = new THREE.Matrix4();
    mesh.onBeforeRender = function (renderer, scene, camera, geometry, currentMaterial, group) {
        if (disposed) return;
        const time = material.uniforms.uTime.value as number;
        const cameraMoved = !previousCamera.equals(camera.matrixWorld) || !previousProjection.equals(camera.projectionMatrix);
        const interval = quality === 'low' ? 1 / 15 : 1 / 30;
        if (!hasReflection || cameraMoved || time - lastReflection >= interval) {
            renderReflection.call(this, renderer, scene, camera, geometry, currentMaterial, group);
            previousCamera.copy(camera.matrixWorld);
            previousProjection.copy(camera.projectionMatrix);
            lastReflection = time;
            hasReflection = true;
        }
    };
    return {
        mesh, bed,
        update(time: number, night: number) {
            if (disposed) return;
            material.uniforms.uTime.value = time;
            material.uniforms.uNight.value = night;
        },
        setQuality(value: Quality) {
            if (disposed || value === quality) return;
            quality = value;
            mesh.getRenderTarget().setSize(sizes[value], sizes[value]);
            hasReflection = false;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            mesh.removeFromParent();
            bed.removeFromParent();
            mesh.geometry.dispose();
            bed.geometry.dispose();
            bed.material.dispose();
            mesh.dispose();
        },
    };
}
