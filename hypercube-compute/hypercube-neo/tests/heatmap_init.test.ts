import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';

describe('Showcase Heatmap Initialization', () => {
    it('should successfully build the showcase-heatmap manifest without undefined errors', async () => {
        // Read manifest from disk
        const manifestPath = path.resolve(__dirname, '../showcase/showcase-heat-gpu.json');
        const content = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(content);

        const factory = new HypercubeNeoFactory();

        // Assert build does not throw errors (like the recent pingPong undefined error)
        let engine;
        try {
            const testConfig = { ...manifest.config, mode: 'cpu' };
            engine = await factory.build(testConfig as any, manifest.engine);
        } catch (e: any) {
            expect.fail(`Engine build threw an error: ${e.message}`);
        }

        // Verify core components initialized
        expect(engine).toBeDefined();
        expect(engine.vGrid).toBeDefined();
        expect(engine.vGrid.chunks.length).toBe(manifest.config.chunks.x * manifest.config.chunks.y);

        // Verify DataContract has correct face counts
        const faceMappings = (engine.vGrid as any).dataContract.getFaceMappings();
        expect(faceMappings.length).toBe(2); // temperature, obstacles

        // Ensure boundaries fallback mapped correctly
        const topBoundary = engine.vGrid.chunks[0].joints.find((j: any) => j.face === 'top');
        expect(topBoundary).toBeDefined();
        // The role should match either joint or wall
        expect(["joint", "wall"]).toContain(topBoundary.role);
    });
});
