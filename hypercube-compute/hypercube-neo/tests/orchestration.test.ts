import { describe, it, expect } from 'vitest';
import { VirtualGrid } from '../core/VirtualGrid';
import { EngineDescriptor, HypercubeConfig } from '../core/types';

describe('Hypercube Neo: VirtualGrid Orchestration', () => {
    const lbmDescriptor: EngineDescriptor = {
        name: 'LBM-D2Q9',
        version: '1.0.0',
        faces: [{ name: 'fi', type: 'population', isSynchronized: true }],
        parameters: {
            viscosity: { name: 'Viscosity', type: 'number', default: 0.1 }
        },
        rules: [
            { type: 'lbm-d2q9', method: 'Custom', source: 'fi' }
        ],
        outputs: [],
        requirements: { ghostCells: 1, pingPong: true }
    };

    const config: HypercubeConfig = {
        dimensions: { nx: 32, ny: 16, nz: 1 },
        chunks: { x: 2, y: 1 }, // Two 16x16 chunks
        boundaries: { all: { role: 'wall' } },
        engine: 'LBM-D2Q9',
        params: { viscosity: 0.1 },
        mode: 'cpu'
    };

    const vGrid = new VirtualGrid(config, lbmDescriptor);

    it('should coordinate chunk connectivity and data contracts', () => {
        expect(vGrid.chunks.length).toBe(2);

        const c0 = vGrid.findChunkAt(0, 0)!;
        const rightJoint = c0.joints.find(j => j.face === 'right');
        expect(rightJoint?.role).toBe('joint');
        expect(rightJoint?.neighborId).toBe('chunk_1_0_0');

        expect(vGrid.dataContract.descriptor.name).toBe('LBM-D2Q9');
    });

    it('should report correct cumulative memory requirements', () => {
        // One chunk: 16x16 logical -> 18x18 physical = 324 cells.
        // 1 face (fi) * 324 cells * 4 bytes * 2 (Ping-Pong) = 2592 bytes.
        // Total for 2 chunks = 5184 bytes.
        const bytesPerChunk = (16 + 2) * (16 + 2) * 1 * 4 * 2;
        const totalBytes = bytesPerChunk * 2;

        expect(vGrid.getTotalMemoryRequirement()).toBe(totalBytes);
    });
});
