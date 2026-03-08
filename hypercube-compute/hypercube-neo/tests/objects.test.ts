import { describe, it, expect } from 'vitest';
import { VirtualGrid } from '../core/VirtualGrid';
import { EngineDescriptor, HypercubeConfig, VirtualObject } from '../core/types';

describe('Hypercube Neo: Spatial Object Spanning', () => {
    const lbmDescriptor: EngineDescriptor = {
        name: 'LBM-D2Q9',
        version: '1.0.0',
        faces: [{ name: 'fi', type: 'population', isSynchronized: true }],
        parameters: { viscosity: { name: 'Viscosity', type: 'number', default: 0.1 } },
        rules: [{ type: 'lbm-d2q9', method: 'Custom', source: 'fi' }],
        outputs: [],
        requirements: { ghostCells: 1, pingPong: true }
    };

    it('should identify an object spanning two chunks', () => {
        const obj: VirtualObject = {
            id: 'long_bar',
            type: 'rect',
            position: { x: 10, y: 5 },
            dimensions: { w: 20, h: 2 }, // Spans from x=10 to x=30
            properties: { isObstacle: 1 }
        };

        const config: HypercubeConfig = {
            dimensions: { nx: 32, ny: 16, nz: 1 },
            chunks: { x: 2, y: 1 }, // Two 16x16 chunks. Chunk0: 0-16, Chunk1: 16-32
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: { viscosity: 0.1 },
            objects: [obj],
            mode: 'cpu'
        };

        const vGrid = new VirtualGrid(config, lbmDescriptor);

        const c0 = vGrid.findChunkAt(0, 0)!;
        const c1 = vGrid.findChunkAt(1, 0)!;

        const objectsInC0 = vGrid.getObjectsInChunk(c0);
        const objectsInC1 = vGrid.getObjectsInChunk(c1);

        expect(objectsInC0.length).toBe(1);
        expect(objectsInC0[0].id).toBe('long_bar');

        expect(objectsInC1.length).toBe(1);
        expect(objectsInC1[0].id).toBe('long_bar');
    });

    it('should ignore objects outside a chunk', () => {
        const obj: VirtualObject = {
            id: 'small_dot',
            type: 'circle',
            position: { x: 5, y: 5 },
            dimensions: { w: 2, h: 2 }, // Only in Chunk 0
            properties: { density: 1.0 }
        };

        const config: HypercubeConfig = {
            dimensions: { nx: 32, ny: 16, nz: 1 },
            chunks: { x: 2, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: { viscosity: 0.1 },
            objects: [obj],
            mode: 'cpu'
        };

        const vGrid = new VirtualGrid(config, lbmDescriptor);
        const c1 = vGrid.findChunkAt(1, 0)!;

        const objectsInC1 = vGrid.getObjectsInChunk(c1);
        expect(objectsInC1.length).toBe(0);
    });
});
