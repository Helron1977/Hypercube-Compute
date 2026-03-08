import { describe, it, expect } from 'vitest';
import { AerodynamicsEngine } from '../../src/engines/AerodynamicsEngine';
import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';
import { EngineDescriptor, HypercubeConfig } from '../core/types';

describe('Hypercube Neo: Multi-Chunk Fidelity (6 Squares)', () => {
    const factory = new HypercubeNeoFactory();

    it('should be bit-identical between 1-chunk Legacy and 6-chunk Neo', async () => {
        const NX = 252;
        const NY = 128;
        const STEPS = 50;

        // 1. Setup Legacy Engine (1 CHUNK)
        const legacy = new AerodynamicsEngine();
        const legacyFaces = Array.from({ length: 24 }, () => new Float32Array(NX * NY));
        legacy.init(legacyFaces, NX, NY, 1);
        legacy.setBoundaryConfig({
            isLeftBoundary: true, isRightBoundary: true, isTopBoundary: true, isBottomBoundary: true,
            left: 'INFLOW', right: 'OUTFLOW', top: 'WALL', bottom: 'WALL',
            inflowUx: 0.15
        });

        // 2. Setup Neo Engine (6 CHUNKS: 3x2)
        const aeroDescriptor: EngineDescriptor = {
            name: 'Aero-Multi-Fidelity', version: '1.0.0',
            faces: [
                { name: 'f0', type: 'scalar', isSynchronized: true },
                { name: 'f1', type: 'scalar', isSynchronized: true },
                { name: 'f2', type: 'scalar', isSynchronized: true },
                { name: 'f3', type: 'scalar', isSynchronized: true },
                { name: 'f4', type: 'scalar', isSynchronized: true },
                { name: 'f5', type: 'scalar', isSynchronized: true },
                { name: 'f6', type: 'scalar', isSynchronized: true },
                { name: 'f7', type: 'scalar', isSynchronized: true },
                { name: 'f8', type: 'scalar', isSynchronized: true },
                { name: 'obstacles', type: 'mask', isSynchronized: true, isReadOnly: true },
                { name: 'vx', type: 'scalar', isSynchronized: true },
                { name: 'vy', type: 'scalar', isSynchronized: true },
                { name: 'vorticity', type: 'scalar', isSynchronized: true },
                { name: 'smoke', type: 'scalar', isSynchronized: true }
            ],
            rules: [{ type: 'aero-fidelity', method: 'Custom', source: 'f0', params: { omega: 1.75, inflowUx: 0.15 } }],
            requirements: { ghostCells: 1, pingPong: true },
            parameters: {}, outputs: []
        };

        const config: HypercubeConfig = {
            dimensions: { nx: NX, ny: NY, nz: 1 },
            chunks: { x: 3, y: 2 },
            boundaries: { all: { role: 'wall' } },
            engine: 'Aero-Multi-Fidelity',
            params: {},
            objects: [],
            mode: 'cpu'
        };

        const neo = await factory.instantiate(config, aeroDescriptor);

        // 2.1 Direct State Transfer (Legacy -> Neo) for absolute parity at t=0
        const mBuffer = (neo as any).mBuffer;
        const chunkW = Math.floor(NX / 3);
        const chunkH = Math.floor(NY / 2);

        for (const vChunk of neo.vGrid.chunks) {
            const views = mBuffer.getChunkViews(vChunk.id);
            const offX = vChunk.x * chunkW;
            const offY = vChunk.y * chunkH;
            const pNx = chunkW + 2;

            for (let ly = 0; ly < chunkH; ly++) {
                for (let lx = 0; lx < chunkW; lx++) {
                    const lIdx = (offY + ly) * NX + (offX + lx);
                    const nIdx = (ly + 1) * pNx + (lx + 1);
                    for (let k = 0; k < 9; k++) {
                        const val = legacyFaces[k][lIdx];
                        views.faces[neo.parityManager.getFaceIndices(`f${k}`).read][nIdx] = val;
                        views.faces[neo.parityManager.getFaceIndices(`f${k}`).write][nIdx] = val;
                    }
                }
            }
        }

        // 2.2 Initial Sync (Essential for joints at t=0)
        (neo as any).synchronizer.syncAll(neo.vGrid, mBuffer, neo.parityManager, 'read');
        (neo as any).synchronizer.syncAll(neo.vGrid, mBuffer, neo.parityManager, 'write');

        // 3. Step in sync
        for (let s = 0; s < STEPS; s++) {
            legacy.compute(legacyFaces, NX, NY, 1);
            legacy.parity = 1 - legacy.parity;
            await neo.step(s);

            if (s === 0 || s === STEPS - 1) {
                let maxDiff = 0;
                for (const vChunk of neo.vGrid.chunks) {
                    const views = mBuffer.getChunkViews(vChunk.id);
                    const offX = vChunk.x * chunkW;
                    const offY = vChunk.y * chunkH;
                    const pNx = chunkW + 2;
                    const nVx = views.faces[neo.parityManager.getFaceIndices('vx').read];
                    const lVx = legacyFaces[19];

                    for (let ly = 1; ly < chunkH - 1; ly++) {
                        for (let lx = 1; lx < chunkW - 1; lx++) {
                            const lIdx = (offY + ly) * NX + (offX + lx);
                            const nIdx = (ly + 1) * pNx + (lx + 1);
                            const diff = Math.abs(nVx[nIdx] - lVx[lIdx]);
                            if (diff > maxDiff) maxDiff = diff;
                        }
                    }
                }
                console.log(`Step ${s}: Max Global Velocity Difference = ${maxDiff.toExponential(4)}`);
                if (maxDiff > 1e-4) {
                    expect(maxDiff).toBeLessThan(1e-4);
                }
            }
        }

        // Final Verify
        let finalMaxDiff = 0;
        for (const vChunk of neo.vGrid.chunks) {
            const views = mBuffer.getChunkViews(vChunk.id);
            const offX = vChunk.x * chunkW;
            const offY = vChunk.y * chunkH;
            const pNx = chunkW + 2;
            const nVx = views.faces[neo.parityManager.getFaceIndices('vx').read];
            const lVx = legacyFaces[19];

            for (let ly = 1; ly < chunkH - 1; ly++) {
                for (let lx = 1; lx < chunkW - 1; lx++) {
                    const lIdx = (offY + ly) * NX + (offX + lx);
                    const nIdx = (ly + 1) * pNx + (lx + 1);
                    const diff = Math.abs(nVx[nIdx] - lVx[lIdx]);
                    if (diff > finalMaxDiff) finalMaxDiff = diff;
                }
            }
        }
        expect(finalMaxDiff).toBeLessThan(1e-5);
    });
});
