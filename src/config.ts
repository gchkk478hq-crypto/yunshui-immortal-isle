export const config = {
    nightDuration: 10,
    focusDuration: 1.8,
    pixelRatio: { high: 2, balanced: 1.4, low: 1 },
    panorama: { position: [10, 21, 54], target: [0, 1, 0] },
    anchors: {
        musicPavilion: { position: [-24, 8, 14], target: [-18, 2.4, 3], label: '临湖听琴' },
        bridge: { position: [1, 7, 12], target: [0, 1.7, -5], label: '一桥烟水' },
        palace: { position: [20, 20, 11], target: [7, 12, -8], label: '云顶仙宫' },
        waterfall: { position: [16, 0, 27], target: [6, -4, 12], label: '飞泉漱玉' }
    }
} as const;
export type Quality = keyof typeof config.pixelRatio;
export type Focus = keyof typeof config.anchors;
