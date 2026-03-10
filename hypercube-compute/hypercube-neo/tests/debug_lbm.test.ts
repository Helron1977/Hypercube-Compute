import { describe, it } from 'vitest';
import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';
import { EngineDescriptor, HypercubeConfig } from '../core/types';

describe('LBM ZERO LEAKAGE DEBUGGER (Proxy)', () => {
    it('Traces rho row by row for 5 steps via Factory', async () => {

        const nx = 8;
        const ny = 4;
        const pNx = nx + 2;
        const pNy = ny + 2;

        const lbmDescriptor: EngineDescriptor = {
            name: 'LBM-D2Q9',
            version: '1.0.0',
            faces: [
                { name: 'f0', type: 'population', isSynchronized: true },
                { name: 'f1', type: 'population', isSynchronized: true },
                { name: 'f2', type: 'population', isSynchronized: true },
                { name: 'f3', type: 'population', isSynchronized: true },
                { name: 'f4', type: 'population', isSynchronized: true },
                { name: 'f5', type: 'population', isSynchronized: true },
                { name: 'f6', type: 'population', isSynchronized: true },
                { name: 'f7', type: 'population', isSynchronized: true },
                { name: 'f8', type: 'population', isSynchronized: true },
                { name: 'rho', type: 'scalar', isSynchronized: true, isPersistent: false },
                { name: 'vx', type: 'scalar', isSynchronized: true, isPersistent: false },
                { name: 'vy', type: 'scalar', isSynchronized: true, isPersistent: false },
                { name: 'obstacles', type: 'mask', isSynchronized: true, isPersistent: true },
                { name: 'biology', type: 'scalar', isSynchronized: true, isPersistent: false }
            ],
            parameters: {},
            rules: [{ type: 'lbm-ocean-v1', method: 'OceanPhysics' as any, source: 'f0', params: { tau_0: 0.8 } } as any],
            outputs: [],
            requirements: { ghostCells: 1, pingPong: true }
        };

        const config: HypercubeConfig = {
            dimensions: { nx: 8, ny: 4, nz: 1 },
            chunks: { x: 2, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'LBM-D2Q9',
            params: {},
            mode: 'cpu',
            executionMode: 'parallel', // Using ParallelDispatcher
            objects: [{
                id: "grid_init",
                type: "rect",
                position: { x: 0, y: 0 },
                dimensions: { w: 8, h: 4 },
                properties: {
                    rho: 1.0, f0: 4 / 9, f1: 1 / 9, f2: 1 / 9, f3: 1 / 9, f4: 1 / 9,
                    f5: 1 / 36, f6: 1 / 36, f7: 1 / 36, f8: 1 / 36
                },
                rasterMode: "replace"
            }]
        };

        const factory = new HypercubeNeoFactory();
        const engine = await factory.build(config, lbmDescriptor);

        function printRho(step: number) {
            console.log(`\n--- STEP ${step} RHO ---`);
            const rhoIdx = engine.parityManager.getFaceIndices('rho').read;
            const chunk0 = engine.vGrid.chunks[0];
            const views0 = engine.mBuffer.getChunkViews(chunk0.id);
            const chunk1 = engine.vGrid.chunks[1];
            const views1 = engine.mBuffer.getChunkViews(chunk1.id);

            for (let py = 0; py < pNy; py++) {
                let rowStr = '';
                for (let px = 0; px < pNx; px++) {
                    const val = views0.faces[rhoIdx][py * pNx + px];
                    rowStr += val.toFixed(3).padStart(6, ' ') + ' | ';
                }
                rowStr += '  ||  ';
                for (let px = 0; px < pNx; px++) {
                    const val = views1.faces[rhoIdx][py * pNx + px];
                    rowStr += val.toFixed(3).padStart(6, ' ') + ' | ';
                }
                console.log(rowStr);
            }
        }

        printRho(0);
        for (let step = 1; step <= 5; step++) {
            await engine.step(1);
            printRho(step);

            // Clean up transient splash and init objects after they've been rasterized
            if (config.objects) {
                config.objects = config.objects.filter((o: any) => !o.id.startsWith('splash_') && o.id !== 'grid_init');
            }
        }
    });
});
