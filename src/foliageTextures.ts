import * as THREE from 'three';

/**
 * Painted leaf-cluster textures for the alpha-cut foliage cards. Leaves are
 * drawn in light neutral tones so the material colour and baked vertex shading
 * tint them; density falls off towards the card edge so no square corners show.
 */
type Family = 'needle' | 'maple' | 'broad' | 'blossom';
const cache = new Map<Family, THREE.Texture>();

function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function draw(family: Family) {
    const N = 512, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d')!;
    const r = rng(family.length * 977 + 13);
    const tone = () => { const v = 175 + r() * 80 | 0; return `rgb(${v},${v},${v})`; };
    const place = (k: number) => {
        // Rejection-sample a position, denser in the middle of the card.
        for (;;) {
            const px = r(), py = r(), d = Math.hypot(px - .5, py - .5);
            if (d < .46 && r() > d * 1.5) return [px * N, py * N, d] as const;
            if (k < 0) return [N / 2, N / 2, 0] as const;
        }
    };
    if (family === 'needle') {
        for (let k = 0; k < 46; k++) {
            const [cx, cy] = place(k);
            const base = r() * Math.PI * 2, spread = .9 + r() * .6, len = 26 + r() * 40;
            for (let i = 0; i < 22; i++) {
                const a = base + (r() - .5) * spread * 2, L = len * (.6 + r() * .5);
                x.strokeStyle = tone();
                x.lineWidth = 1.6 + r() * 1.4;
                x.beginPath();
                x.moveTo(cx, cy);
                x.quadraticCurveTo(cx + Math.cos(a) * L * .5 + (r() - .5) * 6, cy + Math.sin(a) * L * .5 + (r() - .5) * 6, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
                x.stroke();
            }
        }
    } else if (family === 'maple') {
        for (let k = 0; k < 64; k++) {
            const [cx, cy] = place(k);
            const s = 16 + r() * 20, rot = r() * Math.PI * 2;
            x.save();
            x.translate(cx, cy);
            x.rotate(rot);
            x.fillStyle = tone();
            x.beginPath();
            for (let i = 0; i <= 10; i++) {
                const a = -Math.PI / 2 + i / 10 * Math.PI * 2, rad = i % 2 ? s * .42 : s * (i === 0 || i === 10 ? 1 : .88);
                const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
                if (i === 0) x.moveTo(px, py); else x.quadraticCurveTo(Math.cos(a - .3) * rad * 1.05, Math.sin(a - .3) * rad * 1.05, px, py);
            }
            x.fill();
            x.strokeStyle = 'rgba(70,60,55,.35)';
            x.lineWidth = 1;
            for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI * 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * s * .8, Math.sin(a) * s * .8); x.stroke(); }
            x.restore();
        }
    } else if (family === 'broad') {
        for (let k = 0; k < 90; k++) {
            const [cx, cy] = place(k);
            const L = 14 + r() * 16, W = L * (.38 + r() * .14), rot = r() * Math.PI * 2;
            x.save();
            x.translate(cx, cy);
            x.rotate(rot);
            x.fillStyle = tone();
            x.beginPath();
            x.moveTo(-L, 0);
            x.quadraticCurveTo(-L * .2, -W * 1.2, L, 0);
            x.quadraticCurveTo(-L * .2, W * 1.2, -L, 0);
            x.fill();
            x.strokeStyle = 'rgba(60,70,55,.35)';
            x.lineWidth = 1.1;
            x.beginPath(); x.moveTo(-L, 0); x.lineTo(L * .9, 0); x.stroke();
            x.restore();
        }
    } else {
        for (let k = 0; k < 70; k++) {
            const [cx, cy] = place(k);
            const s = 9 + r() * 10, rot = r() * Math.PI;
            const v = 225 + r() * 30 | 0;
            for (let p = 0; p < 5; p++) {
                const a = rot + p / 5 * Math.PI * 2;
                x.fillStyle = `rgb(${v},${v - 6},${v - 4})`;
                x.beginPath();
                x.ellipse(cx + Math.cos(a) * s * .55, cy + Math.sin(a) * s * .55, s * .55, s * .38, a, 0, Math.PI * 2);
                x.fill();
            }
            x.fillStyle = 'rgb(214,170,120)';
            x.beginPath(); x.arc(cx, cy, s * .2, 0, Math.PI * 2); x.fill();
        }
        // A few small leaves among the flowers.
        for (let k = 0; k < 18; k++) {
            const [cx, cy] = place(k);
            x.fillStyle = 'rgba(120,135,105,.9)';
            x.beginPath(); x.ellipse(cx, cy, 9, 4, r() * 3, 0, Math.PI * 2); x.fill();
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
}

export function familyFor(name: string): Family | null {
    if (!/Card$/.test(name)) return null;
    if (/^Pine/.test(name)) return 'needle';
    if (/^Maple/.test(name)) return 'maple';
    if (/Blossom|ShrubFlower/.test(name)) return 'blossom';
    return 'broad';
}

/** Give a leaf-card material its texture and cut-out settings (no-op outside the browser). */
export function applyLeafCard(m: THREE.MeshStandardMaterial) {
    const family = familyFor(m.name);
    if (!family || typeof document === 'undefined') return;
    if (!cache.has(family)) cache.set(family, draw(family));
    m.map = cache.get(family)!;
    m.alphaTest = .42;
    m.alphaToCoverage = true;
    m.transparent = false;
    m.side = THREE.DoubleSide;
    m.needsUpdate = true;
}
