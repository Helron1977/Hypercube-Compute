import { describe, it, expect } from 'vitest';
import { HypercubeGrid } from '../src/core/HypercubeGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { VolumeDiffusionEngine } from '../src/engines/VolumeDiffusionEngine';
import { HypercubeViz } from '../src/utils/HypercubeViz';

describe('VolumeDiffusionEngine Mass Conservation', () => {
    it('should perfectly conserve mass over time in periodic boundary conditions', async () => {
        const mapSize = 16;
        const totalCells = mapSize * mapSize * mapSize;
        const masterBuffer = new HypercubeMasterBuffer(totalCells * 2 * 4); // 2 faces, 4 bytes per float

        // Diffusion rate = 0.1, dt = 1.0, periodic boundaries
        const grid = await HypercubeGrid.create(
            1, 1, mapSize, masterBuffer,
            () => new VolumeDiffusionEngine(0.1, 1.0, 'periodic'),
            2, false, 'cpu', false
        );

        const chunk = grid.cubes[0][0]!;

        // Inject a sphere of density
        HypercubeViz.injectSphere(chunk, 0, mapSize / 2, mapSize / 2, mapSize / 2, 4, 1.0);

        // Calculate initial total mass
        let initialMass = 0;
        const face0 = chunk.faces[0];
        for (let i = 0; i < face0.length; i++) {
            initialMass += face0[i];
        }

        // Run simulation for 50 steps
        for (let step = 0; step < 50; step++) {
            await grid.compute();
        }

        // Calculate final total mass
        let finalMass = 0;
        const currentFace = chunk.faces[0];
        for (let i = 0; i < currentFace.length; i++) {
            finalMass += currentFace[i];
        }

        // Expect mass to be conserved within numerical floating-point error
        expect(finalMass).toBeCloseTo(initialMass, 3);
    });
});
