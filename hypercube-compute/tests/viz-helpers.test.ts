import { describe, it, expect } from 'vitest';
import { Hypercube } from '../src/Hypercube';
import { BlankEngine } from '../src/templates/BlankEngine';
import { HypercubeMarchingCubes } from '../src/utils/HypercubeMarchingCubes';
import { HypercubeThreeJS } from '../src/utils/HypercubeThreeJS';

describe('Phase 4: Viz Helpers', () => {
    it('should extract surface points from a volume', () => {
        const hc = new Hypercube(1);
        const engine = new BlankEngine();
        const chunk = hc.createCube("test-surface", { nx: 4, ny: 4, nz: 4 }, engine);

        // Fill center
        chunk.faces[0].fill(1.0, 16 + 4, 16 + 8); // 2nd layer center

        const points = HypercubeMarchingCubes.getSurfacePoints(chunk, 0, 0.5);
        expect(points.length).toBeGreaterThan(0);
        expect(points.length % 4).toBe(0); // [x, y, z, val]
    });

    it('should export Three.js compatible volume data', () => {
        const hc = new Hypercube(1);
        const engine = new BlankEngine();
        const chunk = hc.createCube("test-threejs", { nx: 2, ny: 2, nz: 2 }, engine);

        chunk.faces[0].fill(0.5);

        const volume = HypercubeThreeJS.getVolumeData(chunk, 0);
        expect(volume.width).toBe(2);
        expect(volume.height).toBe(2);
        expect(volume.depth).toBe(2);
        expect(volume.data.length).toBe(8);
        expect(volume.data[0]).toBe(Math.floor(0.5 * 255));
    });
});
