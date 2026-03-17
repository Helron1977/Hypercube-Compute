import { describe, it, expect } from 'vitest';
import { MapConstructor } from '../core/topology/MapConstructor';
import { GridBoundaries } from '../core/types';

describe('MapConstructor Remainder Distribution', () => {
    const mapper = new MapConstructor();
    const boundaries: GridBoundaries = { all: { role: 'wall' } };

    it('should split 512px into 3 chunks without losing pixels (Aero-v1 case)', () => {
        const dims = { nx: 512, ny: 512, nz: 1 };
        const chunks = { x: 3, y: 1 };
        const virtualChunks = mapper.buildMap(dims, chunks, boundaries);

        expect(virtualChunks.length).toBe(3);
        
        // Expected distribution: 512 % 3 = 2. 
        // 512 / 3 = 170.66 -> [171, 171, 170]
        expect(virtualChunks[0].localDimensions.nx).toBe(171);
        expect(virtualChunks[1].localDimensions.nx).toBe(171);
        expect(virtualChunks[2].localDimensions.nx).toBe(170);

        const totalWidth = virtualChunks.reduce((acc, c) => acc + c.localDimensions.nx, 0);
        expect(totalWidth).toBe(512);
    });

    it('should split 256px into 3 chunks (exotic case)', () => {
        const dims = { nx: 256, ny: 128, nz: 1 };
        const chunks = { x: 3, y: 2 };
        const virtualChunks = mapper.buildMap(dims, chunks, boundaries);

        // X distribution: 256 % 3 = 1 -> [86, 85, 85]
        const xChunks = virtualChunks.filter(c => c.y === 0);
        expect(xChunks[0].localDimensions.nx).toBe(86);
        expect(xChunks[1].localDimensions.nx).toBe(85);
        expect(xChunks[2].localDimensions.nx).toBe(85);

        // Y distribution: 128 % 2 = 0 -> [64, 64]
        const yChunks = virtualChunks.filter(c => c.x === 0);
        expect(yChunks[0].localDimensions.ny).toBe(64);
        expect(yChunks[1].localDimensions.ny).toBe(64);
    });
});
