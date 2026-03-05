import { describe, it, expect } from 'vitest';
import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { OceanEngine } from '../src/engines/OceanEngine';

describe('HypercubeGrid Parity and Stability', () => {

    it('toggles parity correctly across 10 steps in a 1x1 grid', async () => {
        const nx = 16, ny = 16;
        const master = new HypercubeMasterBuffer();
        const grid = await HypercubeCpuGrid.create(1, 1, { nx, ny }, master, () => new OceanEngine(), 25);

        const engine = (grid.cubes[0][0]!.engine as OceanEngine);
        expect(engine.parity).toBe(0);

        for (let i = 0; i < 10; i++) {
            const lastParity = engine.parity;
            await grid.compute();
            expect(engine.parity).toBe(1 - lastParity);
        }
    });

    it('toggles parity correctly across 10 steps in a 2x2 grid', async () => {
        const nx = 16, ny = 16;
        const master = new HypercubeMasterBuffer();
        const grid = await HypercubeCpuGrid.create(2, 2, { nx, ny }, master, () => new OceanEngine(), 25);

        for (let i = 0; i < 10; i++) {
            const lastParities = grid.cubes.flat().map(c => (c!.engine as OceanEngine).parity);
            await grid.compute();
            const nextParities = grid.cubes.flat().map(c => (c!.engine as OceanEngine).parity);

            for (let j = 0; j < 4; j++) {
                expect(nextParities[j]).toBe(1 - lastParities[j]);
            }
        }
    });

    it('shows data progression (non-zero movement) after steps', async () => {
        const nx = 32, ny = 32;
        const master = new HypercubeMasterBuffer();
        const grid = await HypercubeCpuGrid.create(1, 1, { nx, ny }, master, () => new OceanEngine(), 25);

        // Initial splash
        grid.applyEquilibrium(16, 16, 0, 5, 1.5, 0.1, 0.1);

        const faces = grid.cubes[0][0]!.faces;
        const initialRho = faces[22].slice();

        // Run some steps
        for (let i = 0; i < 20; i++) {
            await grid.compute();
        }

        const finalRho = faces[22];
        let diff = 0;
        for (let i = 0; i < initialRho.length; i++) {
            diff += Math.abs(finalRho[i] - initialRho[i]);
        }

        console.log('Total Rho Difference after 20 steps:', diff);
        expect(diff).toBeGreaterThan(0.01); // Should have progressed
    });

    it('preserve inter-chunk continuity after computation and sync', async () => {
        const nx = 16, ny = 16;
        const master = new HypercubeMasterBuffer();
        const grid = await HypercubeCpuGrid.create(2, 1, { nx, ny }, master, () => new OceanEngine(), 25);

        // Splash on the seam between (0,0) and (1,0)
        grid.applyEquilibrium(16, 8, 0, 4, 1.5, 0, 0);

        const leftChunk = grid.cubes[0][0]!;
        const rightChunk = grid.cubes[0][1]!;

        // Verify seam initial state (inner edge vs neighbor ghost)
        // Seam is at x = nx-1 for left, x = 0 for right
        // Inner edge: left at nx-2, right at 1
        for (let y = 1; y < ny - 1; y++) {
            expect(leftChunk.faces[22][y * nx + (nx - 1)]).toBeCloseTo(rightChunk.faces[22][y * nx + 1], 5);
            expect(rightChunk.faces[22][y * nx + 0]).toBeCloseTo(leftChunk.faces[22][y * nx + (nx - 2)], 5);
        }

        // Run 1 step
        await grid.compute();

        // Verify seam after 1 step
        // We need to check the face that was just written (parity was 0, so it wrote to pops 9-17)
        // and updated macro 22 (rho)
        for (let y = 1; y < ny - 1; y++) {
            // Rho should still be consistent at the seam if sync worked
            // Wait, rho is NOT synced explicitly in grid.compute() currently, only pops are.
            // But pops should be consistent.
            for (let k = 9; k <= 17; k++) {
                expect(leftChunk.faces[k][y * nx + (nx - 1)]).toBeCloseTo(rightChunk.faces[k][y * nx + 1], 5);
                expect(rightChunk.faces[k][y * nx + 0]).toBeCloseTo(leftChunk.faces[k][y * nx + (nx - 2)], 5);
            }
        }
    });
});
