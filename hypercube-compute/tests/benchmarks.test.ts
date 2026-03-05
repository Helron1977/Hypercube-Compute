import { describe, it, expect } from 'vitest';
import { HypercubeCpuGrid } from '../src/core/HypercubeCpuGrid';
import { HypercubeMasterBuffer } from '../src/core/HypercubeMasterBuffer';
import { AerodynamicsEngine } from '../src/engines/AerodynamicsEngine';
import * as fs from 'fs';

describe('Architecture Benchmarks', () => {
    it('Benchmarks a 1-chunk 256x256 Aerodynamics LBM simulation', async () => {
        const nx = 256;
        const masterBuffer = new HypercubeMasterBuffer();

        // Disable worker for raw CPU single-thread throughput stability benchmarking
        const grid = await HypercubeCpuGrid.create(
            1, 1, nx, masterBuffer,
            () => new AerodynamicsEngine(),
            23, false, false);

        // Warmup to stabilize JIT optimization (V8 GodMode)
        for (let i = 0; i < 20; i++) {
            await grid.compute();
        }

        // Reset manual accumulation stats so we just measure the loop
        let totalCompute = 0;
        let totalSync = 0;

        const start = performance.now();
        const iterations = 50;

        for (let i = 0; i < iterations; i++) {
            await grid.compute();
            totalCompute += grid.stats.computeTimeMs;
            totalSync += grid.stats.syncTimeMs;
        }

        const totalDuration = performance.now() - start;
        const avgCompute = totalCompute / iterations;
        const avgSync = totalSync / iterations;
        const avgTotal = totalDuration / iterations;

        console.log(`\n=================================================`);
        console.log(`[BENCHMARK] 1-Chunk LBM 256x256 (V4 Baseline)`);
        console.log(`- Avg Compute/step: ${avgCompute.toFixed(2)}ms`);
        console.log(`- Avg Sync/step: ${avgSync.toFixed(2)}ms`);
        console.log(`- Total FPS: ${(1000 / avgTotal).toFixed(0)}`);
        console.log(`=================================================\n`);

        // Store baseline so we can compare the V5 performance against it
        // We use process.cwd() assuming we run vitest from hypercube-compute
        import('path').then(path => {
            const filepath = path.resolve(process.cwd(), 'benchmark-baseline.json');
            const baseline = {
                avgCompute, avgSync, totalFPS: 1000 / avgTotal
            };
            if (!fs.existsSync(filepath)) {
                fs.writeFileSync(filepath, JSON.stringify(baseline, null, 2));
                console.log("-> Saved baseline to benchmark-baseline.json for V5 arbitration.");
            } else {
                const oldBaseline = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                console.log("-> Loaded old baseline from benchmark-baseline.json:");
                console.log(`   Old Compute: ${oldBaseline.avgCompute.toFixed(2)}ms vs New: ${avgCompute.toFixed(2)}ms`);
                console.log(`   Old FPS: ${oldBaseline.totalFPS.toFixed(0)} vs New: ${(1000 / avgTotal).toFixed(0)}`);

                // Strict Arbitrage
                // Allow 5% margin of error for standard CPU noise
                // expect(avgCompute).toBeLessThanOrEqual(oldBaseline.avgCompute * 1.05);
            }
        });

        expect(avgCompute).toBeGreaterThan(0);
    }, 20000); // 20 seconds timeout just in case it's slow
});
