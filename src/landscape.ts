import profile from './landscape-profile.json';
export const LAKE_RADII = profile.radii as [number, number];
export function shorelineRadius(theta: number): number {
    return profile.base + profile.harmonics.reduce((r, [frequency, amplitude, phase]) => r + amplitude * Math.sin(theta * frequency + phase), 0);
}
export function lakePoint(theta: number, inset = 0): [number, number] {
    const r = shorelineRadius(theta);
    return [(LAKE_RADII[0] * r - inset) * Math.cos(theta), (LAKE_RADII[1] * r - inset) * Math.sin(theta)];
}
