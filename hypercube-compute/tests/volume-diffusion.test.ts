import { describe, it, expect } from 'vitest';
import { Hypercube } from '../src/Hypercube';
import { VolumeDiffusionEngine } from '../src/engines/VolumeDiffusionEngine';
import { HypercubeViz } from '../src/utils/HypercubeViz';

describe('VolumeDiffusionEngine (3D Stencil)', () => {
    it('should diffuse heat across all 3 dimensions', () => {
        const hc = new Hypercube(1);
        const engine = new VolumeDiffusionEngine(0.1, 1.0); // D=0.1, No dissipation

        // Grid 5x5x5
        const chunk = hc.createCube("test-3d-diffusion", { nx: 5, ny: 5, nz: 5 }, engine, 2);

        // Inject a single hot voxel in the center (2, 2, 2)
        const centerIdx = chunk.getIndex(2, 2, 2);
        chunk.faces[0][centerIdx] = 1.0;

        // Initial state check
        expect(chunk.faces[0][centerIdx]).toBe(1.0);
        expect(chunk.faces[0][chunk.getIndex(2, 2, 1)]).toBe(0.0); // Z-neighbor above

        // Step 1
        chunk.compute();

        // Center should have lost heat
        expect(chunk.faces[0][centerIdx]).toBeLessThan(1.0);

        // Neighbors should have gained heat
        expect(chunk.faces[0][chunk.getIndex(1, 2, 2)]).toBeCloseTo(0.1, 5); // X- neighbor
        expect(chunk.faces[0][chunk.getIndex(3, 2, 2)]).toBeCloseTo(0.1, 5); // X+ neighbor
        expect(chunk.faces[0][chunk.getIndex(2, 1, 2)]).toBeCloseTo(0.1, 5); // Y- neighbor
        expect(chunk.faces[0][chunk.getIndex(2, 3, 2)]).toBeCloseTo(0.1, 5); // Y+ neighbor
        expect(chunk.faces[0][chunk.getIndex(2, 2, 1)]).toBeCloseTo(0.1, 5); // Z- neighbor
        expect(chunk.faces[0][chunk.getIndex(2, 2, 3)]).toBeCloseTo(0.1, 5); // Z+ neighbor
    });

    it('should respect dissipation', () => {
        const hc = new Hypercube(1);
        const engine = new VolumeDiffusionEngine(0.0, 0.5); // No diffusion, 0.5 dissipation
        const chunk = hc.createCube("test-dissipation", { nx: 2, ny: 2, nz: 2 }, engine, 2);

        chunk.faces[0].fill(1.0);
        chunk.compute();

        expect(chunk.faces[0][0]).toBe(0.5);
    });

    it('should conserve mass when dissipation is 1.0', () => {
        const hc = new Hypercube(1);
        const engine = new VolumeDiffusionEngine(0.1, 1.0);
        const chunk = hc.createCube("test-conserve", { nx: 4, ny: 4, nz: 4 }, engine, 2);

        chunk.faces[0][chunk.getIndex(2, 2, 2)] = 100.0;

        let initialSum = 0;
        chunk.faces[0].forEach(v => initialSum += v);

        chunk.compute();
        chunk.compute();

        let finalSum = 0;
        chunk.faces[0].forEach(v => finalSum += v);

        expect(finalSum).toBeCloseTo(initialSum, 5);
    });

    it('should conserve mass when dissipation is 1.0 with periodic boundaries', () => {
        const hc = new Hypercube(1);
        const engine = new VolumeDiffusionEngine(0.1, 1.0);
        const chunk = hc.createCube("test-conserve-periodic", { nx: 4, ny: 4, nz: 4 }, engine, 2);

        // Heat on corner (0,0,0) - should spread to (3,0,0), (0,3,0), (0,0,3) due to periodic
        chunk.faces[0][chunk.getIndex(0, 0, 0)] = 100.0;

        let initialSum = 0;
        chunk.faces[0].forEach(v => initialSum += v);

        chunk.compute();

        expect(chunk.faces[0][chunk.getIndex(3, 0, 0)]).toBeCloseTo(10.0, 5); // Wrapped X
        expect(chunk.faces[0][chunk.getIndex(0, 3, 0)]).toBeCloseTo(10.0, 5); // Wrapped Y
        expect(chunk.faces[0][chunk.getIndex(0, 0, 3)]).toBeCloseTo(10.0, 5); // Wrapped Z

        let finalSum = 0;
        chunk.faces[0].forEach(v => finalSum += v);
        expect(finalSum).toBeCloseTo(initialSum, 5);
    });

    it('should benchmark 64x64x64 diffusion performance', () => {
        const hc = new Hypercube(10); // 10MB
        const engine = new VolumeDiffusionEngine(0.1, 1.0);
        const size = 64;
        const chunk = hc.createCube("benchmark-3d", { nx: size, ny: size, nz: size }, engine, 2);

        // Initial blob
        HypercubeViz.injectSphere(chunk, 0, size / 2, size / 2, size / 2, 10, 1.0);

        const steps = 10;
        const start = performance.now();
        for (let i = 0; i < steps; i++) {
            chunk.compute();
        }
        const end = performance.now();
        const duration = end - start;
        const msPerStep = duration / steps;

        console.log(`[Benchmark] 64^3 Volume Diffusion (CPU): ${msPerStep.toFixed(2)}ms / step`);

        // Stability check
        expect(msPerStep).toBeLessThan(100); // Should be way faster on modern CPU
    });

    it('should benchmark 96x96x96 diffusion performance', () => {
        const hc = new Hypercube(40); // 40MB needed for 96^3
        const engine = new VolumeDiffusionEngine(0.1, 1.0);
        const size = 96;
        const chunk = hc.createCube("benchmark-96", { nx: size, ny: size, nz: size }, engine, 2);

        const steps = 5;
        const start = performance.now();
        for (let i = 0; i < steps; i++) {
            chunk.compute();
        }
        const end = performance.now();
        const duration = end - start;
        const msPerStep = duration / steps;

        console.log(`[Benchmark] 96^3 Volume Diffusion (Total voxels: ${size ** 3}): ${msPerStep.toFixed(2)}ms / step`);

        // Target: should still be under 20-30ms on modern CPU
        expect(msPerStep).toBeLessThan(50);
    });
});
