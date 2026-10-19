import * as THREE from 'three';

/**
 * Painted textures for the v8 figures (characters.glb). All are drawn on canvas
 * at runtime so the GLB carries geometry only. UVs come from Blender through
 * glTF, so every texture uses flipY = false (canvas top = UV v 1 in Blender).
 */
export type CharacterTexture = 'lace' | 'hair' | 'robe' | 'sheer' | 'faceF' | 'faceM';

function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function canvas(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')!] as const;
}

function petals(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string, heart: string, rot = 0, n = 5) {
    x.fillStyle = fill;
    for (let p = 0; p < n; p++) {
        const a = rot + p / n * Math.PI * 2;
        x.beginPath();
        x.ellipse(cx + Math.cos(a) * s * .55, cy + Math.sin(a) * s * .55, s * .55, s * .34, a, 0, Math.PI * 2);
        x.fill();
    }
    x.fillStyle = heart;
    x.beginPath(); x.arc(cx, cy, s * .22, 0, Math.PI * 2); x.fill();
}

/** Celadon tulle with a diamond net, gold vine embroidery and small white flowers. */
function lace() {
    const N = 512, [c, x] = canvas(N, N), r = rng(77);
    x.fillStyle = 'rgba(176,208,202,.40)';
    x.fillRect(0, 0, N, N);
    // Fine net.
    x.strokeStyle = 'rgba(236,244,240,.55)';
    x.lineWidth = 1.1;
    const step = 32;
    for (let k = -N; k < N * 2; k += step) {
        x.beginPath(); x.moveTo(k, 0); x.lineTo(k + N, N); x.stroke();
        x.beginPath(); x.moveTo(k, N); x.lineTo(k + N, 0); x.stroke();
    }
    // Gold vines that wrap across the tile edges.
    x.strokeStyle = 'rgba(206,174,108,.95)';
    x.lineCap = 'round';
    for (let v = 0; v < 5; v++) {
        const y0 = r() * N, amp = 30 + r() * 40, ph = r() * 6;
        x.lineWidth = 2.2;
        for (const dy of [-N, 0, N]) {
            x.beginPath();
            for (let i = 0; i <= 64; i++) {
                const px = i / 64 * N, py = y0 + dy + Math.sin(px / N * Math.PI * 2 * 2 + ph) * amp;
                if (i) x.lineTo(px, py); else x.moveTo(px, py);
            }
            x.stroke();
        }
        x.lineWidth = 1.4;
        for (let i = 0; i < 10; i++) {
            const px = r() * N, py = y0 + Math.sin(px / N * Math.PI * 4 + ph) * amp, d = r() > .5 ? 1 : -1;
            x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 10, py + d * 14, px + 22, py + d * 10); x.stroke();
        }
    }
    // Embroidered flowers (opaque) and tiny seed pearls.
    for (let i = 0; i < 26; i++) {
        const px = r() * N, py = r() * N, s = 7 + r() * 9;
        for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) petals(x, px + ox, py + oy, s, 'rgba(250,248,240,.97)', 'rgba(214,178,110,1)', r() * 3);
    }
    x.fillStyle = 'rgba(244,238,222,.9)';
    for (let i = 0; i < 90; i++) { x.beginPath(); x.arc(r() * N, r() * N, 1.4, 0, Math.PI * 2); x.fill(); }
    return c;
}

/** Hair strands: lighter and darker filaments, frayed side edges and tapered tips (alpha). */
function hair() {
    const W = 256, H = 512, [c, x] = canvas(W, H), r = rng(31);
    for (let i = 0; i < 900; i++) {
        const u = r(), w = .6 + r() * 1.6, v = 120 + r() * 60 | 0;
        const tipEnd = H * (.82 + r() * .18), edge = Math.min(u, 1 - u);
        if (edge < .08 && r() > edge / .08) continue;
        x.strokeStyle = `rgba(${v * .32 | 0},${v * .26 | 0},${v * .22 | 0},${.55 + r() * .45})`;
        x.lineWidth = w;
        x.beginPath();
        const px = u * W, sway = (r() - .5) * 10;
        x.moveTo(px, 0);
        x.bezierCurveTo(px + sway, H * .3, px - sway, H * .6, px + sway * .5, tipEnd);
        x.stroke();
    }
    // Fill the body so the card reads as a solid lock with filaments on top.
    x.globalCompositeOperation = 'destination-over';
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(34,26,22,1)');
    g.addColorStop(.78, 'rgba(34,26,22,1)');
    g.addColorStop(.95, 'rgba(34,26,22,0)');
    x.fillStyle = g;
    x.fillRect(W * .1, 0, W * .8, H);
    x.globalCompositeOperation = 'source-over';
    // Sheen bands.
    const s = x.createLinearGradient(0, 0, 0, H);
    s.addColorStop(.15, 'rgba(255,240,225,0)');
    s.addColorStop(.25, 'rgba(255,240,225,.10)');
    s.addColorStop(.35, 'rgba(255,240,225,0)');
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = s;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
    return c;
}

/** White silk with faint jacquard; gold-outlined mountains, pines and clouds towards the hem (canvas bottom). */
function robe() {
    const N = 1024, [c, x] = canvas(N, N), r = rng(19);
    x.fillStyle = '#f1f0ec';
    x.fillRect(0, 0, N, N);
    x.strokeStyle = 'rgba(190,192,196,.35)';
    x.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
        const px = r() * N, py = r() * N * .6, s = 8 + r() * 8;
        x.beginPath(); x.arc(px, py, s, Math.PI, Math.PI * 2); x.arc(px + s * 1.4, py, s * .6, Math.PI, Math.PI * 2.2); x.stroke();
    }
    const gold = 'rgba(200,164,96,1)', ink = 'rgba(132,152,170,.85)', inkLight = 'rgba(176,192,206,.75)';
    const wrap = (fn: (ox: number) => void) => { for (const ox of [-N, 0, N]) fn(ox); };
    // Distant mountains.
    for (let m = 0; m < 6; m++) {
        const cx = m / 6 * N + r() * 60, w = 170 + r() * 110, h = 120 + r() * 120, base = N * .97;
        wrap(ox => {
            x.beginPath();
            x.moveTo(cx - w + ox, base);
            x.quadraticCurveTo(cx - w * .3 + ox, base - h * .6, cx + ox, base - h);
            x.quadraticCurveTo(cx + w * .35 + ox, base - h * .55, cx + w + ox, base);
            x.closePath();
            x.fillStyle = m % 2 ? inkLight : ink;
            x.fill();
            x.strokeStyle = gold;
            x.lineWidth = 2.4;
            x.stroke();
            x.lineWidth = 1.2;
            for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(cx + ox - w * .1 * k, base - h * (1 - k * .22)); x.quadraticCurveTo(cx + ox, base - h * (.8 - k * .2), cx + ox + w * .14 * k, base - h * (.95 - k * .25)); x.stroke(); }
        });
    }
    // Pines with layered canopies.
    for (let p = 0; p < 5; p++) {
        const px = (p + .5) / 5 * N + (r() - .5) * 60, base = N * .9 - r() * 60, h = 150 + r() * 70;
        wrap(ox => {
            x.strokeStyle = gold;
            x.lineWidth = 3;
            x.beginPath(); x.moveTo(px + ox, base); x.quadraticCurveTo(px + ox + 18, base - h * .5, px + ox - 6, base - h); x.stroke();
            // Needle clusters: fans of short strokes over a faint wash, layered along the trunk.
            for (let k = 0; k < 4; k++) {
                const ly = base - h * (.38 + k * .19), cx = px + ox + (k % 2 ? 1 : -1) * (26 - k * 4), lw = 64 - k * 11;
                x.fillStyle = k % 2 ? inkLight : ink;
                x.beginPath(); x.moveTo(cx - lw, ly + 6); x.quadraticCurveTo(cx, ly - 22, cx + lw, ly + 6); x.closePath(); x.fill();
                x.lineWidth = 1.3;
                for (let j = 0; j <= 14; j++) {
                    const sx = cx - lw + j / 14 * lw * 2, top = ly + 6 - (1 - ((j / 14) * 2 - 1) ** 2) * 28;
                    x.beginPath(); x.moveTo(cx, ly + 4); x.lineTo(sx, top); x.stroke();
                }
            }
        });
    }
    // Auspicious clouds in gold thread, scattered higher.
    x.strokeStyle = gold;
    x.lineWidth = 1.8;
    for (let i = 0; i < 16; i++) {
        const px = r() * N, py = N * (.42 + r() * .3), s = 10 + r() * 12;
        wrap(ox => {
            x.beginPath();
            x.arc(px + ox, py, s, Math.PI * .9, Math.PI * 2.1);
            x.arc(px + ox + s * 1.6, py + s * .2, s * .7, Math.PI, Math.PI * 2.3);
            x.arc(px + ox - s * 1.3, py + s * .3, s * .55, Math.PI * .6, Math.PI * 2);
            x.stroke();
        });
    }
    return c;
}

/** Sheer white over-robe: soft vertical streaks and sparse gold-thread clouds. */
function sheer() {
    const N = 512, [c, x] = canvas(N, N), r = rng(5);
    x.fillStyle = 'rgba(246,247,248,.34)';
    x.fillRect(0, 0, N, N);
    for (let i = 0; i < 60; i++) {
        x.fillStyle = `rgba(255,255,255,${.04 + r() * .08})`;
        x.fillRect(r() * N, 0, 2 + r() * 8, N);
    }
    x.strokeStyle = 'rgba(206,172,104,.85)';
    x.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
        const px = r() * N, py = r() * N, s = 9 + r() * 7;
        for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
            x.beginPath();
            x.arc(px + ox, py + oy, s, Math.PI * .9, Math.PI * 2.1);
            x.arc(px + ox + s * 1.6, py + oy + s * .2, s * .7, Math.PI, Math.PI * 2.3);
            x.stroke();
        }
    }
    return c;
}

/** Painted face on the planar head UV: eyes, brows, nose shade, lips. */
function face(female: boolean) {
    const [c, x] = canvas(512, 512);
    x.fillStyle = female ? '#e8cbb8' : '#dfc0aa';
    x.fillRect(0, 0, 512, 512);
    const blush = (cx: number, cy: number, r: number, col: string) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(232,203,184,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
    if (female) { blush(165, 305, 60, 'rgba(222,150,140,.38)'); blush(347, 305, 60, 'rgba(222,150,140,.38)'); }
    blush(170, 222, 46, female ? 'rgba(196,140,130,.22)' : 'rgba(150,115,100,.2)');
    blush(342, 222, 46, female ? 'rgba(196,140,130,.22)' : 'rgba(150,115,100,.2)');
    for (const s of [-1, 1]) {
        const ex = 256 + s * 80, ey = 240, w = female ? 37 : 35;
        x.save();
        x.beginPath();
        x.moveTo(ex - s * w, ey + 3);
        x.quadraticCurveTo(ex, ey - 19, ex + s * w, ey - (female ? 6 : 2));
        x.quadraticCurveTo(ex, ey + 14, ex - s * w, ey + 3);
        x.closePath();
        x.fillStyle = '#ece6dc';
        x.fill();
        x.clip();
        const iris = x.createRadialGradient(ex, ey - 1, 2, ex, ey - 1, 14);
        iris.addColorStop(0, '#1a1210');
        iris.addColorStop(.45, female ? '#4a3128' : '#3a2a24');
        iris.addColorStop(1, '#1d1512');
        x.fillStyle = iris;
        x.beginPath(); x.arc(ex, ey - 1, 14, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.beginPath(); x.arc(ex + 4, ey - 6, 2.8, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(40,25,20,.35)';
        x.fillRect(ex - w, ey - 20, w * 2, 8);
        x.restore();
        // Upper lid line with lashes and a double-lid crease.
        x.strokeStyle = '#1b1210';
        x.lineWidth = female ? 4.4 : 3.6;
        x.beginPath();
        x.moveTo(ex - s * w, ey + 3);
        x.quadraticCurveTo(ex, ey - 20, ex + s * (w + 2), ey - (female ? 8 : 3));
        x.stroke();
        if (female) { x.lineWidth = 2.4; x.beginPath(); x.moveTo(ex + s * (w + 1), ey - 7); x.lineTo(ex + s * (w + 10), ey - 13); x.stroke(); }
        x.strokeStyle = 'rgba(110,70,60,.45)';
        x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(ex - s * (w - 6), ey - 14); x.quadraticCurveTo(ex, ey - 29, ex + s * (w - 2), ey - 15); x.stroke();
        x.strokeStyle = 'rgba(120,80,70,.35)';
        x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(ex - s * (w - 8), ey + 9); x.quadraticCurveTo(ex, ey + 15, ex + s * (w - 6), ey + 6); x.stroke();
        // Brows: willow-leaf for her, straighter sword brows for him.
        x.fillStyle = female ? '#4a3a33' : '#2a201c';
        const by = ey - (female ? 46 : 42);
        x.beginPath();
        x.moveTo(ex - s * 38, by + 9);
        x.quadraticCurveTo(ex - s * 4, by - (female ? 8 : 6), ex + s * 46, by + (female ? 5 : -3));
        x.quadraticCurveTo(ex - s * 2, by + (female ? 2 : 6), ex - s * 38, by + 9);
        x.fill();
    }
    // Soft modelling: shade towards the temples, jaw and under the brow ridge; light down the nose.
    const shade = x.createRadialGradient(256, 290, 120, 256, 290, 300);
    shade.addColorStop(0, 'rgba(150,100,85,0)');
    shade.addColorStop(1, 'rgba(150,100,85,.32)');
    x.fillStyle = shade;
    x.fillRect(0, 0, 512, 512);
    const ridge = x.createLinearGradient(236, 0, 276, 0);
    ridge.addColorStop(0, 'rgba(150,105,90,.12)');
    ridge.addColorStop(.5, 'rgba(255,240,230,.18)');
    ridge.addColorStop(1, 'rgba(150,105,90,.12)');
    x.fillStyle = ridge;
    x.fillRect(236, 250, 40, 100);
    blush(256, 432, 60, 'rgba(160,110,95,.16)');
    x.strokeStyle = 'rgba(160,112,96,.4)';
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(244, 352); x.quadraticCurveTo(256, 360, 268, 352); x.stroke();
    x.fillStyle = female ? '#b8423b' : '#ad7a6c';
    x.beginPath();
    x.moveTo(female ? 232 : 228, 400);
    x.quadraticCurveTo(245, 388, 256, 393);
    x.quadraticCurveTo(267, 388, female ? 280 : 284, 400);
    x.quadraticCurveTo(256, female ? 418 : 412, female ? 232 : 228, 400);
    x.fill();
    x.strokeStyle = 'rgba(90,40,36,.55)';
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(233, 400); x.quadraticCurveTo(256, 404, 279, 400); x.stroke();
    return c;
}

export function paintCharacterTexture(kind: CharacterTexture): THREE.Texture | null {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const c = kind === 'lace' ? lace() : kind === 'hair' ? hair() : kind === 'robe' ? robe() : kind === 'sheer' ? sheer() : face(kind === 'faceF');
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (kind !== 'faceF' && kind !== 'faceM') t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
