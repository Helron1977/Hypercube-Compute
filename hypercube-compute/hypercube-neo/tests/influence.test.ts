import { describe, it, expect } from 'vitest';
import { VirtualGrid } from '../core/topology/VirtualGrid';
import { EngineDescriptor, HypercubeConfig, VirtualObject } from '../core/types';

describe('Hypercube Neo: Influence Fields', () => {
    const heatDescriptor: EngineDescriptor = {
        name: 'HeatDiffusion',
        version: '1.0.0',
        faces: [{ name: 'temp', type: 'field', isSynchronized: true }],
        parameters: { alpha: { name: 'Diffusion', type: 'number', default: 0.1 } },
        rules: [{ type: 'diffusion', method: 'Explicit-Euler', source: 'temp' }],
        outputs: [],
        requirements: { ghostCells: 1, pingPong: true }
    };

    it('should identify an object whose influence radius overlaps a chunk', () => {
        const influenceObj: VirtualObject = {
            id: 'school_influence',
            type: 'circle',
            position: { x: 5, y: 5 },
            dimensions: { w: 2, h: 2 }, // Body is at x=5 to x=7
            influence: {
                falloff: 'gaussian',
                radius: 10 // Reach is x=-5 to x=17
            },
            properties: { weight: 1.0 }
        };

        const config: HypercubeConfig = {
            dimensions: { nx: 32, ny: 16, nz: 1 },
            chunks: { x: 2, y: 1 }, // Chunk 1 starts at x=16
            boundaries: { all: { role: 'wall' } },
            engine: 'HeatDiffusion',
            params: { alpha: 0.1 },
            objects: [influenceObj],
            mode: 'cpu'
        };

        const vGrid = new VirtualGrid(config, heatDescriptor);
        const c1 = vGrid.findChunkAt(1, 0)!;

        // At x=16, the chunk should "see" the school because of its radius=10 (5+10 = 15... wait)
        // Body x=5 + radius 10 = 15. Body x=7 (right edge) + radius 10 = 17.
        // So x=17 is the influence limit. Chunk 1 (starting at 16) MUST see it.
        const objectsInC1 = vGrid.getObjectsInChunk(c1, 0);
        expect(objectsInC1.length).toBe(1);
        expect(objectsInC1[0].id).toBe('school_influence');
    });
});
