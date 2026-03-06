import { describe, it, expect } from 'vitest';
import { AerodynamicsEngine } from '../src/engines/AerodynamicsEngine';

describe('AerodynamicsEngine LBM Logic', () => {
    it('should initialize with parity 0', () => {
        const engine = new AerodynamicsEngine();
        expect((engine as any).parity).toBe(0);
    });

    it('should return correct sync faces for each parity state', () => {
        const engine = new AerodynamicsEngine();

        // Initial state (parity 0) -> should sync faces 9..17 (output of step 0)
        let syncFaces = engine.getSyncFaces();
        expect(syncFaces).toContain(9);
        expect(syncFaces).toContain(17);
        expect(syncFaces).not.toContain(0);
        expect(syncFaces).not.toContain(8);

        // State (parity 1) -> should sync faces 0..8 (output of step 1)
        (engine as any).parity = 1;
        syncFaces = engine.getSyncFaces();
        expect(syncFaces).toContain(0);
        expect(syncFaces).toContain(8);
        expect(syncFaces).not.toContain(9);
        expect(syncFaces).not.toContain(17);
    });

    it('should move smoke tracer when compute is called twice with parity swap', () => {
        const nx = 32, ny = 32, nz = 1;
        const faces: Float32Array[] = Array.from({ length: 24 }, () => new Float32Array(nx * ny));
        const engine = new AerodynamicsEngine();

        const u0 = 0.2;
        const eq = engine.getEquilibrium(1.0, u0, 0.0);
        for (let k = 0; k < 18; k++) faces[k].fill(eq[k % 9]);

        // Inject smoke at a specific point on face 22
        const midIdx = (ny / 2) * nx + (nx / 2);
        faces[22][midIdx] = 1.0;

        // Step 1: parity 0 -> result in 23
        (engine as any).parity = 0;
        engine.compute(faces, nx, ny, nz);
        expect(faces[23].reduce((a, b) => a + b, 0)).toBeGreaterThan(0.5);

        // Step 2: parity 1 -> result in 22
        (engine as any).parity = 1;
        engine.compute(faces, nx, ny, nz);
        expect(faces[22].reduce((a, b) => a + b, 0)).toBeGreaterThan(0.5);
    });

    it('should move smoke tracer when compute is called', () => {
        const nx = 32, ny = 32, nz = 1;
        const faces: Float32Array[] = Array.from({ length: 24 }, () => new Float32Array(nx * ny));
        const engine = new AerodynamicsEngine();

        // Setup a simple flow (u=0.2)
        const u0 = 0.2;
        const eq = engine.getEquilibrium(1.0, u0, 0.0);
        for (let k = 0; k < 18; k++) faces[k].fill(eq[k % 9]);

        // Inject smoke at a specific point on face 22 (parity 0)
        const midIdx = (ny / 2) * nx + (nx / 2);
        faces[22][midIdx] = 1.0;

        // One step (parity 0 -> output to face 23)
        engine.compute(faces, nx, ny, nz);

        // Check that smoke didn't stay only on 22, but moved to 23
        const sum22 = faces[22].reduce((a, b) => a + b, 0);
        const sum23 = faces[23].reduce((a, b) => a + b, 0);

        // Face 23 should have caught the smoke
        expect(sum23).toBeGreaterThan(0.5);

        // Tracer should move right (u0=+0.2)
        // Mid index was (16,16). It should move towards (16.2, 16)
        // Check neighbors
        expect(faces[23][midIdx + 1]).toBeGreaterThan(0);
    });
});
