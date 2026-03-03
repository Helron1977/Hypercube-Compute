import { describe, it, expect } from 'vitest';
import { Hypercube } from '../src/Hypercube';
import { BlankEngine } from '../src/templates/BlankEngine';
import { HypercubeViz } from '../src/utils/HypercubeViz';

describe('3D Visualization Helpers', () => {
    it('should correctly extract a Z-slice', () => {
        const hc = new Hypercube(1);
        const engine = new BlankEngine();
        // Create a 4x4x4 cube
        const chunk = hc.createCube("test-3d", { nx: 4, ny: 4, nz: 4 }, engine);

        // Fill layers with unique values
        for (let z = 0; z < 4; z++) {
            chunk.faces[0].fill(z + 10, z * 16, (z + 1) * 16);
        }

        // Extract slice at z=2
        const slice = chunk.getSlice(0, 2);
        expect(slice.length).toBe(16);
        expect(slice[0]).toBe(12);
        expect(slice[15]).toBe(12);
    });

    it('should project volume using max mode', () => {
        const hc = new Hypercube(1);
        const engine = new BlankEngine();
        const chunk = hc.createCube("test-project", { nx: 2, ny: 2, nz: 2 }, engine);

        // face[0]: 
        // z=0: [1, 2,  z=1: [5, 1,
        //       3, 4]         2, 8]
        const face = chunk.faces[0];
        face[0] = 1; face[1] = 2; face[2] = 3; face[3] = 4; // z=0
        face[4] = 5; face[5] = 1; face[6] = 2; face[7] = 8; // z=1

        const projection = HypercubeViz.projectIso(chunk, 0, 'max');
        expect(projection[0]).toBe(5); // max(1, 5)
        expect(projection[1]).toBe(2); // max(2, 1)
        expect(projection[2]).toBe(3); // max(3, 2)
        expect(projection[3]).toBe(8); // max(4, 8)
    });

    it('should export volume to Uint8Array', () => {
        const hc = new Hypercube(1);
        const engine = new BlankEngine();
        const chunk = hc.createCube("test-export", { nx: 2, ny: 2, nz: 1 }, engine);

        chunk.faces[0][0] = 0.0;
        chunk.faces[0][1] = 0.5;
        chunk.faces[0][2] = 1.0;
        chunk.faces[0][3] = 2.0; // Clamped to 255

        const exportData = HypercubeViz.exportVolume(chunk, 0);
        expect(exportData[0]).toBe(0);
        expect(exportData[1]).toBe(Math.floor(0.5 * 255));
        expect(exportData[2]).toBe(255);
        expect(exportData[3]).toBe(255);
    });
});
