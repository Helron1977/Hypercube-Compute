import { describe, it, expect } from 'vitest';
import { VirtualGrid } from '../core/topology/VirtualGrid';
import { EngineDescriptor, HypercubeConfig, VirtualObject } from '../core/types';

describe('Hypercube Neo: Dynamic Object Spanning', () => {
    const heatDescriptor: EngineDescriptor = {
        name: 'HeatDiffusion',
        version: '1.0.0',
        faces: [{ name: 'temp', type: 'field', isSynchronized: true }],
        parameters: { alpha: { name: 'Diffusion', type: 'number', default: 0.1 } },
        rules: [{ type: 'diffusion', method: 'Explicit-Euler', source: 'temp' }],
        outputs: [],
        requirements: { ghostCells: 1, pingPong: true }
    };

    it('should track a moving object across chunks over time', () => {
        const movingSphere: VirtualObject = {
            id: 'heat_sphere',
            type: 'circle',
            position: { x: 5, y: 5 },
            dimensions: { w: 4, h: 4 },
            animation: {
                velocity: { x: 10, y: 0 } // Moves 10 units per second in X
            },
            properties: { temperature: 1.0 }
        };

        const config: HypercubeConfig = {
            dimensions: { nx: 32, ny: 16, nz: 1 },
            chunks: { x: 2, y: 1 }, // Chunk0: 0-16, Chunk1: 16-32
            boundaries: { all: { role: 'wall' } },
            engine: 'HeatDiffusion',
            params: { alpha: 0.1 },
            objects: [movingSphere],
            mode: 'cpu'
        };

        const vGrid = new VirtualGrid(config, heatDescriptor);
        const c0 = vGrid.findChunkAt(0, 0)!;
        const c1 = vGrid.findChunkAt(1, 0)!;

        // At t=0, object is at x=5, entirely in Chunk 0
        expect(vGrid.getObjectsInChunk(c0, 0).length).toBe(1);
        expect(vGrid.getObjectsInChunk(c1, 0).length).toBe(0);

        // At t=1, object is at x=15 (5 + 10*1)
        // With width 4, it spans x=15 to x=19. 
        // Chunk boundary is at x=16. It should be in BOTH.
        expect(vGrid.getObjectsInChunk(c0, 1).length).toBe(1);
        expect(vGrid.getObjectsInChunk(c1, 1).length).toBe(1);

        // At t=2, object is at x=25 (5 + 10*2)
        // Spans x=25 to x=29. Entirely in Chunk 1.
        expect(vGrid.getObjectsInChunk(c0, 2).length).toBe(0);
        expect(vGrid.getObjectsInChunk(c1, 2).length).toBe(1);
    });
});
