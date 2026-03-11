import { describe, it, expect } from 'vitest';
import { NeoSDFKernel } from './core/kernels/NeoSDFKernel';
import { HypercubeConfig, NumericalScheme } from './core/types';
import { VirtualChunk } from './core/GridAbstractions';

describe('SDF Jump Flooding Algorithm Math', () => {

    it('should correctly propagate distances in O(1) mathematically', () => {
        // Setup a 4x4 Grid for testing
        const nx = 4, ny = 4;
        const pNx = nx + 2, pNy = ny + 2;
        const totalSize = pNx * pNy;

        const xRead = new Float32Array(totalSize).fill(-10000);
        const yRead = new Float32Array(totalSize).fill(-10000);
        const xWrite = new Float32Array(totalSize).fill(-10000);
        const yWrite = new Float32Array(totalSize).fill(-10000);

        // Inject a single seed exactly at grid coordinates (1, 1) -> which is array index (1+1)*pNx + (1+1) -> (2,2)
        // Wait, chunk global offset is 0. 
        // px=2 is Physical X 1.
        // Let's just say the seed is at (1,1) in the world.
        const seedX = 1;
        const seedY = 1;
        // In array coords: (seedY+1)*pNx + (seedX+1)
        const seedIdx = (seedY + 1) * pNx + (seedX + 1);
        xRead[seedIdx] = seedX;
        yRead[seedIdx] = seedY;

        const views = [xRead, yRead, xWrite, yWrite];
        const indices = {
            'sdf_test_x': { read: 0, write: 2 },
            'sdf_test_y': { read: 1, write: 3 }
        };

        const config: HypercubeConfig = {
            mode: 'cpu',
            dimensions: { nx, ny, nz: 1 },
            chunks: { x: 1, y: 1 },
            boundaries: { all: { role: 'joint' } },
            engine: 'test'
        };
        const chunk: VirtualChunk = { id: 'test', x: 0, y: 0, z: 0, joints: [] };
        const scheme: NumericalScheme = { type: 'neo-sdf', source: 'sdf_test' };

        const kernel = new NeoSDFKernel();

        // Run 1 pass
        kernel.execute(views, scheme, indices, config, chunk);

        // Check the pixel at (2,2) in the world. Its array index is (2+1)*pNx + (2+1)
        const targetIdx = 3 * pNx + 3;

        // It SHOULD have received the seed from (1,1)
        expect(xWrite[targetIdx]).toBe(1);
        expect(yWrite[targetIdx]).toBe(1);
    });

});
