import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lakePoint } from '../src/landscape';
import { isWater, safeWater } from '../src/koi-state';

test('feeding boundary follows the irregular shore and fish remain inset', () => {
    for (let i = 0; i < 720; i++) {
        const theta = i / 720 * Math.PI * 2;
        const [x, z] = lakePoint(theta);
        assert.equal(isWater({ x: x * 1.005, z: z * 1.005 }), false);
        const safe = safeWater({ x: x * 1.2, z: z * 1.2 });
        assert.ok(isWater(safe, .3), `unsafe at angle ${theta}`);
    }
});
