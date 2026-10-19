import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { loadIsland, disposeModel } from './resources';
import { createFX } from './fx';
import { createCharacters } from './characters';
import { createAudio } from './audio';
import { createSky } from './sky';
import { WorldState } from './world-state';
import { config, type Focus, type Quality } from './config';
import './style.css';
import { installRecorder } from './qa-recorder';
import { enrichMaterial, natureUniforms } from './materials';
import { createTrees } from './trees';
import { createAnimals } from './animals';
import { applyLeafCard } from './foliageTextures';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const state = new WorldState();
state.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc4d9dd, .0035);
let renderer: THREE.WebGLRenderer;
try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
}
catch (error) {
    $('load-message').textContent = '此浏览器无法启动 WebGL 2，请启用硬件加速或换用支持 WebGL 的浏览器。';
    throw error;
}
renderer.setClearColor(0xb4dbed);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
// The scene is mostly static: refresh the shadow map every third frame instead of every frame.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('experience').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(39, innerWidth / innerHeight, .1, 500);
camera.layers.enable(1);
// Layer 2: drawn by the main camera but skipped by the lake's reflection camera (cheaper reflections).
camera.layers.enable(2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .06;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 260;
controls.minPolarAngle = .18;
controls.maxPolarAngle = 1.49;
controls.maxAzimuthAngle = 1.1;
controls.minAzimuthAngle = -1.15;
controls.rotateSpeed = .45;
controls.zoomSpeed = .7;
const ambient = new THREE.HemisphereLight(0xc4dcec, 0x5f6248, .6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffdfac, 3.5);
sun.position.set(-30, 36, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 130;
sun.shadow.bias = -.0004;
sun.shadow.normalBias = .025;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9cbdd9, .35);
fill.position.set(35, 15, -20);
scene.add(fill);
// Image-based light from the same open sky the island floats in (with a sun hotspot for glints).
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vP;void main(){vec3 d=normalize(vP);float h=d.y;vec3 zen=vec3(.22,.45,.8),hor=vec3(.8,.86,.9),gnd=vec3(.36,.37,.31);vec3 c=h>0.?mix(hor,zen,pow(h,.55)):mix(hor,gnd,pow(-h,.35));float sun=pow(max(dot(d,normalize(vec3(-.598,.717,.359))),0.),90.);c+=vec3(1.,.86,.62)*sun*8.;gl_FragColor=vec4(c,1.);}`,
}));
envScene.add(envSky);
const env = pmrem.fromScene(envScene, 0, .1, 100);
scene.environment = env.texture;
scene.environmentIntensity = .5;
envSky.geometry.dispose();
(envSky.material as THREE.Material).dispose();
pmrem.dispose();
// Soft bloom for sun glints, lanterns and mist. A multisampled HDR target keeps edges smooth.
const params = new URLSearchParams(location.search);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Number(params.get('msaa') ?? 4) }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .2, .5, 1.1);
// Bloom is a soft glow: computing it at half resolution is invisible and saves a lot of fill-rate.
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w: number, h: number) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
composer.addPass(bloom);
// Quiet, low-saturation grade: lifted blacks, slightly warm mid-tones, gentle vignette.
const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSat: { value: .8 }, uLift: { value: .006 }, uVignette: { value: .16 }, uNight: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uSat;uniform float uLift;uniform float uVignette;uniform float uNight;varying vec2 vUv;
 void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.2126,.7152,.0722));
  c.rgb=mix(vec3(l),c.rgb,uSat+uNight*.05);
  c.rgb=c.rgb*mix(vec3(1.,.985,.955),vec3(.97,.985,1.03),uNight)+uLift;
  float v=smoothstep(1.25,.3,length((vUv-.5)*vec2(1.25,1.)));
  c.rgb*=mix(1.-uVignette,1.,v);
  gl_FragColor=c;}`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());
// Anti-aliasing per quality. At native Retina density, FXAA gives clean edges for far less
// fill-rate than 4x MSAA on a half-float target (measured on M2/WebKit at 2x: msaa4 ~25 fps, FXAA ~52 fps).
const smaa = new SMAAPass(), fxaa = new FXAAPass();
composer.addPass(smaa);
composer.addPass(fxaa);
const AA: Record<Quality, { samples: number; pass: 'smaa' | 'fxaa' | 'none' }> = {
    high: { samples: 0, pass: 'fxaa' }, balanced: { samples: 2, pass: 'none' }, low: { samples: 0, pass: 'fxaa' },
};
function applyAntialias(q: Quality) {
    const samples = params.has('msaa') ? Number(params.get('msaa')) : AA[q].samples;
    const pass = (params.get('aa') as 'smaa' | 'fxaa' | 'none' | null) ?? AA[q].pass;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    smaa.enabled = pass === 'smaa';
    fxaa.enabled = pass === 'fxaa';
}
function present() { if (state.quality === 'low')
    renderer.render(scene, camera);
else
    composer.render(); }
const animals = createAnimals(scene);
const fx = createFX(scene, 'balanced'), characters = createCharacters(scene), audio = createAudio(), sky = createSky(scene, camera);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
raycaster.layers.enableAll();
let island: THREE.Group | null = null;
const lanternLights: THREE.PointLight[] = [];
const emitters: THREE.MeshStandardMaterial[] = [];
let lanternOn = true;
const enhanced = new Set<THREE.Material>();
const collisions: THREE.Box3[] = [];
let trees: ReturnType<typeof createTrees> | null = null;
const events: Record<string, string> = { 'lake.feed': '灵鲤闻声，逐水而来', 'flora.magnolia': '一树玉兰，落入清风', 'flora.leaves': '竹影摇风，青叶知意', 'character.guzheng': '弦上山水，湖心有声', 'character.cinnabar': '一念朱砂，寄与云水', 'pavilion.lantern': '灯火可亲，照见归途', 'animal.deer': '林间小鹿，抬首相望', 'animal.dog': '小犬摇尾，绕桥嬉戏' };
let noticeUntil = 0, moonReflectionUntil = 0;
const moonReflectionMat = new THREE.MeshBasicMaterial({ color: 0xd35641, transparent: true, opacity: 0, depthWrite: false });
const moonReflection = new THREE.Mesh(new THREE.CircleGeometry(1, 40), moonReflectionMat);
moonReflection.rotation.x = -Math.PI / 2;
moonReflection.position.set(-14, .32, 3);
moonReflection.scale.set(1.2, .5, 1);
scene.add(moonReflection);
function notice(text: string) { $('notice').textContent = text; $('notice').style.opacity = '1'; noticeUntil = state.time + 3.5; }
function semantic(obj: THREE.Object3D): THREE.Object3D | null { let o: THREE.Object3D | null = obj; while (o) {
    if (o.userData.event)
        return o;
    o = o.parent;
} return null; }
function centre(obj: THREE.Object3D) { return new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); }
function findEvent(event: string) { let match: THREE.Object3D | undefined; scene.traverse(o => { if (!match && o.userData.event === event)
    match = o; }); return match; }
function trigger(event: string, point?: THREE.Vector3, object?: THREE.Object3D) {
    if (!state.ready)
        return false;
    let accepted = false;
    if (event.startsWith('camera.')) {
        focus(event.slice(7) as Focus);
        return true;
    }
    if (event === 'character.guzheng' || event === 'character.cinnabar') {
        accepted = characters.trigger(event);
    }
    else if (event.startsWith('animal.')) {
        accepted = animals.trigger(event, camera.position);
        if (accepted && !object) {
            // From the place buttons: glide the camera to the animal.
            const p = event === 'animal.dog' ? animals.positions().dog : animals.positions().deer;
            const offset = new THREE.Vector3(2.8, 1.6, 3.4);
            transition = { from: camera.position.clone(), to: p.clone().add(offset), fromTarget: controls.target.clone(), target: p.clone().add(new THREE.Vector3(0, .5, 0)), elapsed: 0 };
            state.mode = 'focus';
            controls.minDistance = 2;
        }
    }
    else if (event === 'pavilion.lantern') {
        lanternOn = !lanternOn;
        accepted = true;
    }
    else {
        const target = object ?? findEvent(event);
        const tree = trees?.find(target);
        let p = point ?? (event === 'lake.feed' ? new THREE.Vector3(-2, .25, 3) : target ? centre(target) : new THREE.Vector3(-16, 3, 6));
        if (tree)
            p = tree.crown.clone();
        accepted = fx.trigger(event, p, target);
        if (accepted && tree)
            trees!.shake(tree, camera.position);
    }
    if (accepted) {
        if (event === 'character.guzheng')
            fx.trigger(event, new THREE.Vector3(-11, .25, 3));
        if (event === 'lake.feed' && characters.getState().music === 'playingGuzheng')
            fx.trigger('secret.musicKoi', new THREE.Vector3());
        audio.trigger(event);
        state.lastEvent = event;
        state.interactions++;
        notice(events[event] ?? '');
        $('hint').style.opacity = '.35';
        if (event === 'character.cinnabar' && state.night > .8) {
            moonReflectionUntil = state.time + 6;
            notice('月照朱砂，水映相思');
        }
    }
    return accepted;
}
let transition: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    target: THREE.Vector3;
    elapsed: number;
} | null = null;
function panoPosition() { const ratio = innerWidth / innerHeight; return new THREE.Vector3(...config.panorama.position).multiplyScalar(Math.max(1, 1.5 / ratio)); }
function focus(name: Focus | 'panorama', instant = false) {
    if (name !== 'panorama' && !config.anchors[name])
        return;
    const anchor = name === 'panorama' ? null : config.anchors[name];
    const to = anchor ? new THREE.Vector3(...anchor.position) : panoPosition();
    const target = anchor ? new THREE.Vector3(...anchor.target) : new THREE.Vector3(...config.panorama.target);
    state.mode = anchor ? 'focus' : 'panorama';
    controls.minDistance = anchor ? 7 : 42;
    state.focusTarget = anchor ? name : null;
    $('focus-label').hidden = !anchor;
    $('focus-label').textContent = anchor?.label ?? '';
    if (instant || state.reducedMotion) {
        camera.position.copy(to);
        controls.target.copy(target);
        transition = null;
        controls.update();
    }
    else
        transition = { from: camera.position.clone(), to, fromTarget: controls.target.clone(), target, elapsed: 0 };
}
/** Quality is locked to the chosen level (default 精致) and remembered; nothing downgrades it automatically. */
const renderScale = 1;
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
function applyResolution() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, config.pixelRatio[state.quality]) * renderScale);
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.needsUpdate = true;
    const names: Record<Quality, string> = { high: '精致', balanced: '均衡', low: '轻盈' };
    const info = document.getElementById('build-info');
    if (info) info.textContent = `版本 v9 · ${BUILD} · 画质：${names[state.quality]}（已锁定，不会自动降低） · 渲染密度 ${renderer.getPixelRatio().toFixed(2)}×`;
}
function quality(value: Quality) { state.quality = value; try { localStorage.setItem('yunshui.quality', value); } catch { /* private mode */ } const shadowSize = value === 'high' ? 4096 : 2048; if (sun.shadow.mapSize.x !== shadowSize) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
} applyAntialias(value); applyResolution(); fx.setQuality(value); renderer.shadowMap.enabled = value !== 'low'; if ($('quality'))
    ($('quality') as HTMLSelectElement).value = value; }
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); if (state.mode === 'panorama')
    focus('panorama', true); }
const savedQuality = (() => { try { return localStorage.getItem('yunshui.quality'); } catch { return null; } })();
const requested = params.get('quality') ?? savedQuality ?? 'high';
quality((['high', 'balanced', 'low'] as const).includes(requested as Quality) ? requested as Quality : 'high');
focus('panorama', true);
const loadController = new AbortController();
let timeout = window.setTimeout(() => loadController.abort('模型读取超时'), 30000);
const load = loadIsland(`${import.meta.env.BASE_URL}assets/models/island.glb?v=${BUILD}`, loadController.signal, ratio => { $('load-message').textContent = `正在布置山水 · ${Math.round(ratio * 100)}%`; });
// The two figures are a separate Blender model; they attach to their pivots as soon as they arrive.
loadIsland(`${import.meta.env.BASE_URL}assets/models/characters.glb?v=${BUILD}`, loadController.signal, () => { })
    .then(model => { if (!characters.attach(model)) disposeModel(model); })
    .catch(error => { if (!disposed) console.warn('人物模型读取失败', error); });
load.then(model => {
    clearTimeout(timeout);
    if (disposed) {
        disposeModel(model);
        return;
    }
    island = model;
    scene.add(model);
    model.traverse(o => { if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const n = o.name.toLowerCase();
        if (!o.userData.event) {
            if (n.includes('magnolia'))
                o.userData.event = 'flora.magnolia';
            else if (n.includes('bamboo') || n.includes('pine'))
                o.userData.event = 'flora.leaves';
            else if (n.includes('lantern'))
                o.userData.event = 'pavilion.lantern';
            else if (n.includes('bridge'))
                o.userData.event = 'camera.bridge';
            else if (n.includes('palace'))
                o.userData.event = 'camera.palace';
        }
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
            if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMapIntensity = 1;
                if (!enhanced.has(mat)) {
                    applyLeafCard(mat);
                    enrichMaterial(mat);
                    enhanced.add(mat);
                }
                if (mat.emissive.getHex() > 0 && !emitters.includes(mat))
                    emitters.push(mat);
            }
        }
    } });
    trees = createTrees(model);
    // Ground clutter, the cliff underside and other details that never show in the lake stay out of the reflection pass.
    const noReflect = /^(IslandCliff|Cliff|ShoreGrasses|Wildflowers|Understory|ShorePebbles|StreamStones|SteppingStones|Shrubs|RootLedges|MountainCrags|LanternGroup)/;
    model.traverse(o => { if (o instanceof THREE.Mesh && noReflect.test(o.name)) o.layers.set(2); });
    for (const obj of [...model.children]) {
        if (obj instanceof THREE.Mesh) {
            const n = obj.name;
            const b = new THREE.Box3().setFromObject(obj);
            if (/Roof|PalaceMain|Cliff/.test(n))
                collisions.push(b.clone().expandByScalar(.4));
        }
    }
    for (const p of [[-18, 3.6, 3], [8, 12, -8], [12, 3, 3]]) {
        const l = new THREE.PointLight(0xffaf48, 0, 11, 2);
        l.position.set(...p as [
            number,
            number,
            number
        ]);
        scene.add(l);
        lanternLights.push(l);
    }
    // Compile every program now (including pooled, hidden effects) so the first tap never stalls.
    const hidden: THREE.Object3D[] = [];
    scene.traverse(o => { if (!o.visible) {
        hidden.push(o);
        o.visible = true;
    } });
    renderer.compile(scene, camera);
    hidden.forEach(o => { o.visible = false; });
    // One warm-up frame builds the reflection, shadow and bloom variants behind the loading veil.
    renderer.shadowMap.needsUpdate = true;
    present();
    state.ready = true;
    $('loading').style.opacity = '0';
    window.setTimeout(() => { $('loading').hidden = true; }, 1100);
}).catch(e => { clearTimeout(timeout); if (disposed)
    return; console.error(e); $('load-message').textContent = '场景资源读取失败。请确认通过 pnpm dev 启动，并刷新页面重试。'; $('loading').querySelector('.load-line')?.remove(); });
controls.addEventListener('start', () => { transition = null; });
let down: {
    x: number;
    y: number;
    id: number;
} | null = null;
let gesture = false;
const touches = new Set<number>();
function hit(x: number, y: number) { pointer.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1); raycaster.setFromCamera(pointer, camera); const hits = raycaster.intersectObjects(scene.children, true); for (const h of hits) {
    if (!h.object.visible)
        continue;
    const o = semantic(h.object);
    if (o)
        return { o, p: h.point };
    if (h.object instanceof THREE.Mesh && !['SkyDome', 'CloudSea'].includes(h.object.name) && !(h.object.material instanceof THREE.ShaderMaterial) && !h.object.name.includes('Pool') && !h.object.name.startsWith('Koi') && h.object.parent !== scene)
        return null;
} return null; }
renderer.domElement.addEventListener('pointerdown', e => { touches.add(e.pointerId); if (touches.size > 1)
    gesture = true;
else {
    gesture = false;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
} });
renderer.domElement.addEventListener('pointerup', e => { touches.delete(e.pointerId); if (!gesture && down && down.id === e.pointerId && Math.hypot(down.x - e.clientX, down.y - e.clientY) < 7) {
    const h = hit(e.clientX, e.clientY);
    if (h)
        trigger(h.o.userData.event, h.p, h.o);
} down = null; });
renderer.domElement.addEventListener('pointercancel', e => { touches.delete(e.pointerId); down = null; });
let hoverAt = 0;
renderer.domElement.addEventListener('pointermove', e => { if (e.buttons || performance.now() - hoverAt < 70)
    return; hoverAt = performance.now(); renderer.domElement.style.cursor = hit(e.clientX, e.clientY) ? 'pointer' : 'grab'; });
$('night').onclick = () => { state.toggleNight(); $('night').setAttribute('aria-label', state.targetNight ? '切换白昼' : '切换月夜'); $('night').innerHTML = state.targetNight ? '<span>☾</span><small>待晓</small>' : '<span>☼</span><small>入夜</small>'; };
$('audio').onclick = async () => { const value = !state.audioEnabled; try {
    await audio.setEnabled(value);
    state.audioEnabled = value;
    $('audio').setAttribute('aria-label', value ? '关闭声音' : '开启声音');
    $('audio').innerHTML = value ? '<span>♫</span><small>静音</small>' : '<span>♪</span><small>聆音</small>';
    notice(value ? '风水有声，静听一曲' : '声音已关闭');
}
catch {
    notice('声音暂不可用，请再次点击聆音。');
} };
$('settings-toggle').onclick = () => { $('settings').hidden = !$('settings').hidden; };
$('return').onclick = () => focus('panorama');
document.querySelector('.brand')?.addEventListener('click', e => { e.preventDefault(); focus('panorama'); });
$('quality').onchange = e => quality((e.target as HTMLSelectElement).value as Quality);
$('reduce-motion').onchange = e => { state.reducedMotion = (e.target as HTMLInputElement).checked; fx.setReducedMotion(state.reducedMotion); };
($('reduce-motion') as HTMLInputElement).checked = state.reducedMotion;
const volume = () => audio.setVolumes(Number(($('music-volume') as HTMLInputElement).value), Number(($('env-volume') as HTMLInputElement).value));
$('music-volume').oninput = volume;
$('env-volume').oninput = volume;
volume();
$('fullscreen').onclick = () => { if (document.fullscreenElement)
    document.exitFullscreen().catch(() => notice('无法退出全屏'));
else
    document.documentElement.requestFullscreen?.().catch(() => notice('此浏览器暂不支持全屏')); };
$('photo').onclick = () => { present(); renderer.domElement.toBlob(blob => { if (!blob) {
    notice('照片生成失败，请重试。');
    return;
} const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.download = `云水仙洲-${state.night > .5 ? '月夜' : '白昼'}.png`; link.href = url; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); $('ui').hidden = true; $('restore-ui').hidden = false; }, 'image/png'); };
$('restore-ui').onclick = () => { $('ui').hidden = false; $('restore-ui').hidden = true; };
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-action]'))
    b.onclick = () => trigger(b.dataset.action!);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-focus]'))
    b.onclick = () => focus(b.dataset.focus as Focus);
window.addEventListener('keydown', e => { if (e.key === 'Escape') {
    focus('panorama');
    $('ui').hidden = false;
    $('restore-ui').hidden = true;
    $('settings').hidden = true;
} });
window.addEventListener('resize', resize);
let last = performance.now(), raf = 0, disposed = false, previousSplash = 0, lastSplashSound = 0;
const samples: number[] = [];
let frameCount = 0;
document.addEventListener('visibilitychange', () => { state.hidden = document.hidden; audio.suspend(state.hidden); last = performance.now(); if (!state.hidden && !disposed) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
} });
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); notice('图形环境中断，正在等待恢复。'); });
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
function frame(now: number) {
    if (disposed || state.hidden)
        return;
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(.05, Math.max(0, raw));
    state.tick(dt);
    const t = state.time, n = state.night;
    if (transition) {
        transition.elapsed += dt;
        const k = Math.min(1, transition.elapsed / config.focusDuration), s = k * k * (3 - 2 * k);
        camera.position.lerpVectors(transition.from, transition.to, s);
        controls.target.lerpVectors(transition.fromTarget, transition.target, s);
        if (k === 1)
            transition = null;
    }
    controls.update();
    for (const b of collisions) {
        if (b.containsPoint(camera.position)) {
            const v = camera.position;
            const choices = [{ d: v.x - b.min.x, k: 'x' as const, v: b.min.x - .15 }, { d: b.max.x - v.x, k: 'x' as const, v: b.max.x + .15 }, { d: v.y - b.min.y, k: 'y' as const, v: b.min.y - .15 }, { d: b.max.y - v.y, k: 'y' as const, v: b.max.y + .15 }, { d: v.z - b.min.z, k: 'z' as const, v: b.min.z - .15 }, { d: b.max.z - v.z, k: 'z' as const, v: b.max.z + .15 }];
            choices.sort((a, b) => a.d - b.d);
            v[choices[0].k] = choices[0].v;
        }
    }
    natureUniforms.uTime.value = t;
    natureUniforms.uWind.value = (state.reducedMotion ? .25 : 1) * (.75 + .35 * Math.sin(t * .13) * Math.sin(t * .31 + 1.7) + .2 * Math.max(0, Math.sin(t * .07)));
    natureUniforms.uSunGlow.value = 1 - n * .85;
    trees?.update(dt, state.reducedMotion);
    fx.update(dt, t, n);
    const activeSplash = fx.getState().activeSplash;
    if (activeSplash > previousSplash && t - lastSplashSound > .22) {
        audio.trigger('koi.splash');
        lastSplashSound = t;
    }
    previousSplash = activeSplash;
    characters.update(dt, t);
    animals.update(dt, t);
    sky.update(t, n, state.reducedMotion);
    audio.update(dt, t, n, camera.position.distanceTo(new THREE.Vector3(0, -3, 13)));
    ambient.intensity = .6 * (1 - n) + .5 * n;
    scene.environmentIntensity = .5 * (1 - n) + .1 * n;
    ambient.color.set(0xb9d6e7).lerp(new THREE.Color(0x829bda), n);
    sun.intensity = 3.3 * (1 - n) + .85 * n;
    sun.color.set(0xffdfac).lerp(new THREE.Color(0xadc9ff), n);
    fill.intensity = .35 - n * .1;
    renderer.toneMappingExposure = 1.0 + n * .1;
    (scene.fog as THREE.FogExp2).color.set(0xc4d9dd).lerp(new THREE.Color(0x354765), n);
    lanternLights.forEach(l => l.intensity = (lanternOn ? 1 : .15) * (5 + n * 28));
    emitters.forEach(m => m.emissiveIntensity = (lanternOn ? 1 : .2) * (.6 + n * 2.8));
    document.body.classList.toggle('night', n > .55);
    moonReflectionMat.opacity = Math.max(0, Math.sin(Math.max(0, moonReflectionUntil - t) / 6 * Math.PI)) * .12 * n;
    if (t > noticeUntil)
        $('notice').style.opacity = '0';
    if (frameCount++ % 3 === 0 || transition) renderer.shadowMap.needsUpdate = true;
    bloom.strength = .16 + n * .2;
    grade.uniforms.uNight.value = n;
    present();
    if (raw > 0 && raw < .5) {
        samples.push(raw * 1000);
        if (samples.length > 300)
            samples.shift();
    }
    if (qaOutput && state.ready)
        qaOutput.textContent = JSON.stringify(api.getStats());
    raf = requestAnimationFrame(frame);
}
// Effects that never appear in the lake reflection: koi, splashes, falls, mist, cranes, figures.
for (const name of ['LivingWaterAndNature', 'CloudSea', 'SunShafts', 'ImmortalMotes', 'WhiteCranes', 'MusicPavilionCharacters'])
    scene.getObjectByName(name)?.traverse(o => { if (o.name !== 'LakeSurface' && o.layers.mask === 1) o.layers.set(2); });
console.info(`云水仙洲 v9 · build ${BUILD}`);
raf = requestAnimationFrame(frame);
const qaOutput = params.has('qa') ? document.body.appendChild(document.createElement('output')) : null;
if (qaOutput) {
    qaOutput.id = 'qa-state';
    qaOutput.hidden = true;
}
const api = { state, scene, camera, controls, renderer, composer, bloom, sun, trigger, focus, quality, fx, characters, animals, getStats() { const sorted = [...samples].sort((a, b) => a - b), mean = samples.reduce((a, b) => a + b, 0) / (samples.length || 1); let meshes = 0; scene.traverse(o => { if (o instanceof THREE.Mesh)
        meshes++; }); return { ready: state.ready, simulationTime: state.time, hidden: state.hidden, audioEnabled: state.audioEnabled, mode: state.mode, focusTarget: state.focusTarget, camera: camera.position.toArray(), frames: samples.length, fps: 1000 / mean, meanMs: mean, p95Ms: sorted[Math.floor(sorted.length * .95)], drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, meshes, night: state.night, phase: state.dayPhase, quality: state.quality, koi: fx.getState(), characters: characters.getState(), interactions: state.interactions }; }, project(x: number, y: number, z: number) { const p = new THREE.Vector3(x, y, z).project(camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 }; } };
(window as unknown as {
    __YUNSHUI: typeof api;
}).__YUNSHUI = api;
installRecorder(renderer.domElement);
function dispose() { disposed = true; loadController.abort(); cancelAnimationFrame(raf); clearTimeout(timeout); controls.dispose(); fx.dispose(); characters.dispose(); animals.dispose(); audio.dispose(); sky.dispose(); if (island)
    island.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
    } }); moonReflection.geometry.dispose(); moonReflectionMat.dispose(); env.dispose(); composer.dispose(); renderer.dispose(); }
window.addEventListener('pagehide', e => { if (!e.persisted)
    dispose(); });
