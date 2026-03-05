import { describe, it, expect } from 'vitest';
import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { OceanEngine } from '../src/engines/OceanEngine';

describe('OceanEngine Multi-Chunk (Grid 2x2 Boundary Exchange)', () => {

    it('conserves mass exactly across 4 chunks with periodic boundaries enabled', async () => {
        // Here we test the engine inside a 2x2 Grid where internal ghosts are exchanged.
        const numChunksX = 2;
        const numChunksY = 2;
        const mapSize = 32; // MapSize per chunk
        const totalCellsStrided = mapSize * mapSize * numChunksX * numChunksY;
        const numFaces = 25;
        const masterBuffer = new HypercubeMasterBuffer(10 * 1024 * 1024);

        const oceanEngine = new OceanEngine();

        // --- 1. SETUP ENGINE (CPU MODE) MULTI-CHUNK ---
        const grid = await HypercubeCpuGrid.create(
            numChunksX, numChunksY, mapSize, masterBuffer,
            () => oceanEngine,
            numFaces, true, true, undefined, 'cpu'
        );

        const w = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

        // INITIALIZE DENSITY ACROSS ALL CHUNKS to exactly 1.0 everywhere
        for (let cy = 0; cy < numChunksY; cy++) {
            for (let cx = 0; cx < numChunksX; cx++) {
                const faces = grid.cubes[cy][cx]?.faces!;
                for (let i = 0; i < mapSize * mapSize; i++) {
                    faces[22][i] = 1.0;          // rho
                    for (let k = 0; k < 9; k++) {
                        faces[k][i] = w[k] * 1.0;
                    }
                }
            }
        }

        // Apply forcing to create macro movement across chunk seams
        const facesCenter = grid.cubes[0][0]?.faces!;
        // Inject velocity to create a disturbance
        for (let i = 0; i < mapSize * mapSize; i++) {
            if (i % 5 === 0) facesCenter[19][i] = 0.1; // ux
            if (i % 7 === 0) facesCenter[20][i] = -0.1; // uy
        }

        let totalMassStart = 0;
        for (let cy = 0; cy < numChunksY; cy++) {
            for (let cx = 0; cx < numChunksX; cx++) {
                const faces = grid.cubes[cy][cx]?.faces!;
                for (let y = 1; y < mapSize - 1; y++) {
                    for (let x = 1; x < mapSize - 1; x++) {
                        totalMassStart += faces[22][y * mapSize + x];
                    }
                }
            }
        }

        // SIMULATE
        for (let i = 0; i < 1000; i++) {
            await grid.compute(); // HypercubeGrid interrogera automatiquement getSyncFaces() sur l'OceanEngine !
        }

        // CALCULATE FINAL MASS
        let totalMassEnd = 0;
        for (let cy = 0; cy < numChunksY; cy++) {
            for (let cx = 0; cx < numChunksX; cx++) {
                const faces = grid.cubes[cy][cx]?.faces!;
                for (let y = 1; y < mapSize - 1; y++) {
                    for (let x = 1; x < mapSize - 1; x++) {
                        totalMassEnd += faces[22][y * mapSize + x];
                    }
                }
            }
        }

        // For periodic Grid the mass is inherently closed!
        // Should be strictly equal, but floats can have tiny variations
        const diff = Math.abs(totalMassStart - totalMassEnd);
        console.log(`Multi-Chunk Mass conservation differencial: ${diff}`);

        expect(diff).toBeLessThan(0.1);

        // --- NEW: VERIFY MOVEMENT ---
        // Let's check if the density has actually changed from its initial state (1.0)
        let totalChange = 0;
        for (let cy = 0; cy < numChunksY; cy++) {
            for (let cx = 0; cx < numChunksX; cx++) {
                const faces = grid.cubes[cy][cx]?.faces!;
                for (let i = 0; i < mapSize * mapSize; i++) {
                    totalChange += Math.abs(faces[22][i] - 1.0);
                }
            }
        }
        console.log(`Total Density Change after 1000 steps: ${totalChange}`);
        expect(totalChange).toBeGreaterThan(0.1); // Simulation must have progressed
    });
});
