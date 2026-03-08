import { describe, it, expect, vi } from 'vitest';
import { V8EngineShim } from '../v4/core/V8EngineShim';
import { EngineDescriptor } from '../v4/engines/EngineManifest';
import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';

describe('V4 Animation & Ping-Pong Validation', () => {
    const mockDescriptor: EngineDescriptor = {
        name: 'TestAnimationEngine',
        faces: [
            { name: 'Data', type: 'scalar', defaultValue: 0.0 }
        ],
        parameters: [],
        rules: [
            { type: 'diffusion', method: 'Upwind', source: 'Data', params: { diffusionRate: 0.1 } }
        ]
    };

    it('should alternate parity and update separate buffer halves', async () => {
        const nx = 4, ny = 4, nz = 1;
        const stride = nx * ny * nz;
        const master = new HypercubeMasterBuffer(1024 * 1024);

        const grid = new HypercubeCpuGrid(1, 1, { nx, ny, nz }, master, () => new V8EngineShim(mockDescriptor), 1, false, false, 'cpu');
        const cube = grid.cubes[0][0]!;
        const shim = cube.engine as V8EngineShim;
        const faceData = cube.faces[0];

        // 1. Initial State
        faceData.fill(0);
        grid.setAt(0, 0, 0, 0, 1.0);

        expect(faceData[5]).toBe(1.0);
        expect(faceData[5 + stride]).toBe(1.0);

        // 2. Step 1: Compute
        await grid.compute();
        expect(shim.parity).toBe(1);

        // Diffusion 0.1: dst[6] = 0 + 0.1 * (1.0 - 4*0) = 0.1
        expect(faceData[5 + stride]).toBeLessThan(1.0);
        expect(faceData[6 + stride]).toBeCloseTo(0.1);

        // 3. Step 2: Compute
        await grid.compute();
        expect(shim.parity).toBe(0);

        // Half 0 was updated from Half 1
        expect(faceData[6]).toBeGreaterThan(0);
    });
});
