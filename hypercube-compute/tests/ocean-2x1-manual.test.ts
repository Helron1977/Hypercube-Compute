import { describe, it, expect } from 'vitest';
import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { OceanEngine } from '../src/engines/OceanEngine';

describe('OceanEngine 2x1 Manual Sync', () => {

    it('propagates a density wave across the seam correctly (Manual Sync)', async () => {
        const nx = 16, ny = 16;
        const master = new HypercubeMasterBuffer();

        // 2x1 grid, non-periodic to isolate local boundary behavior
        const grid = await HypercubeCpuGrid.create(
            2, 1, { nx, ny }, master, () => new OceanEngine(),
            25, false, false, undefined, 'cpu'
        );

        // 1. Splash in the first chunk near the right edge
        // x = 13 (inner right edge is nx-2 = 14)
        grid.applyEquilibrium(13, 8, 0, 3, 1.8, 0.5, 0);

        const leftCube = grid.cubes[0][0]!;
        const rightCube = grid.cubes[0][1]!;

        const initialLeftRho = leftCube.faces[22].slice();
        const initialRightRho = rightCube.faces[22].slice();

        // Check if applyEquilibrium synced the seam
        // Left chunk inner right edge (14) -> Right chunk ghost left (0)
        expect(rightCube.faces[22][8 * nx + 0]).toBeGreaterThan(1.0);
        expect(rightCube.faces[22][8 * nx + 0]).toBeCloseTo(leftCube.faces[22][8 * nx + 14], 5);

        // 2. Run 1 step
        // parity 0 -> read 0..8, write 9..17, update rho(22)
        await grid.compute();

        expect((leftCube.engine as OceanEngine).parity).toBe(1);
        expect((rightCube.engine as OceanEngine).parity).toBe(1);

        // 3. Verify that rho moved into the second chunk
        // Inner cells of right chunk start at x=1
        let movedToRight = false;
        for (let i = 0; i < nx * ny; i++) {
            if (rightCube.faces[22][i] > 1.001) movedToRight = true;
        }

        console.log('Wave detected in right chunk:', movedToRight);
        expect(movedToRight).toBe(true);

        // 4. Run another step
        // parity 1 -> read 9..17, write 0..8, update rho(22)
        await grid.compute();

        expect((leftCube.engine as OceanEngine).parity).toBe(0);

        let movedFurther = 0;
        for (let y = 1; y < ny - 1; y++) {
            for (let x = 1; x < nx - 1; x++) {
                if (rightCube.faces[22][y * nx + x] > 1.01) movedFurther++;
            }
        }
        console.log('Cells with high density in right chunk:', movedFurther);
        expect(movedFurther).toBeGreaterThan(5);
    });
});
