import { describe, it, expect } from 'vitest';
import { AerodynamicsEngine } from '../../src/engines/AerodynamicsEngine';
import { HypercubeNeoFactory } from '../core/HypercubeNeoFactory';
import { EngineDescriptor, HypercubeConfig } from '../core/types';

describe('Hypercube Neo: 1:1 Fidelity Verification (Case 01)', () => {
    const factory = new HypercubeNeoFactory();

    it('should be numerically identical to the legacy AerodynamicsEngine', async () => {
        const NX = 256;
        const NY = 128;
        const STEPS = 100;

        // 1. Setup Legacy Engine
        const legacy = new AerodynamicsEngine();
        const legacyFaces = Array.from({ length: 24 }, () => new Float32Array(NX * NY));
        legacy.init(legacyFaces, NX, NY, 1);
        legacy.setBoundaryConfig({
            isLeftBoundary: true, isRightBoundary: true, isTopBoundary: true, isBottomBoundary: true,
            left: 'INFLOW', right: 'OUTFLOW', top: 'WALL', bottom: 'WALL',
            inflowUx: 0.12
        });

        // 2. Setup Neo Engine
        const aeroDescriptor: EngineDescriptor = {
            name: 'Aerodynamics-Fidelity', version: '1.0.0',
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
            rules: [{ type: 'aero-fidelity', method: 'Custom', source: 'f0', params: { omega: 1.75, inflowUx: 0.12 } }],
            requirements: { ghostCells: 1, pingPong: true },
            parameters: {}, outputs: []
        };

        const config: HypercubeConfig = {
            dimensions: { nx: NX, ny: NY, nz: 1 },
            chunks: { x: 1, y: 1 },
            boundaries: { all: { role: 'wall' } },
            engine: 'Aerodynamics-Fidelity',
            params: {},
            objects: [],
            mode: 'cpu'
        };

        const neo = await factory.instantiate(config, aeroDescriptor);

        // 2.1 Direct State Transfer (Legacy -> Neo)
        const vChunk = (neo as any).vGrid.chunks[0];
        const mBuffer = (neo as any).mBuffer;

        for (let y = 0; y < NY; y++) {
            for (let x = 0; x < NX; x++) {
                const lIdx = y * NX + x;
                const nIdx = (y + 1) * (NX + 2) + (x + 1);
                for (let k = 0; k < 9; k++) {
                    const val = legacyFaces[k][lIdx];
                    mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read][nIdx] = val;
                    mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write][nIdx] = val;
                }
                const vx = legacyFaces[19][lIdx], vy = legacyFaces[20][lIdx];
                mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vx').read][nIdx] = vx;
                mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vx').write][nIdx] = vx;
                mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vy').read][nIdx] = vy;
                mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vy').write][nIdx] = vy;

                // Ghost Cell North/South (Clamped)
                if (y === 0) {
                    const gnIdx = 0 * (NX + 2) + (x + 1);
                    for (let k = 0; k < 9; k++) {
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read][gnIdx] = legacyFaces[k][lIdx];
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write][gnIdx] = legacyFaces[k][lIdx];
                    }
                }
                if (y === NY - 1) {
                    const gsIdx = (NY + 1) * (NX + 2) + (x + 1);
                    for (let k = 0; k < 9; k++) {
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read][gsIdx] = legacyFaces[k][lIdx];
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write][gsIdx] = legacyFaces[k][lIdx];
                    }
                }
                // Ghost Cell East/West (Clamped)
                if (x === 0) {
                    const gwIdx = (y + 1) * (NX + 2) + 0;
                    for (let k = 0; k < 9; k++) {
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read][gwIdx] = legacyFaces[k][lIdx];
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write][gwIdx] = legacyFaces[k][lIdx];
                    }
                }
                if (x === NX - 1) {
                    const geIdx = (y + 1) * (NX + 2) + (NX + 1);
                    for (let k = 0; k < 9; k++) {
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read][geIdx] = legacyFaces[k][lIdx];
                        mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write][geIdx] = legacyFaces[k][lIdx];
                    }
                }
            }
        }

        // 3. Step in sync
        for (let s = 0; s < STEPS; s++) {
            legacy.compute(legacyFaces, NX, NY, 1);
            legacy.parity = 1 - legacy.parity;
            await neo.step(s);

            if (s % 20 === 0 || s === STEPS - 1) {
                const nVx = mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vx').read];
                const lVx = legacyFaces[19];
                let maxDiff = 0;
                // Compare the same range legacy operates on: y=1..NY-2, x=1..NX-2
                // In Neo, this is py=2..NY-1, px=2..NX-1 (if mapping is x+1)
                for (let y = 1; y < NY - 1; y++) {
                    for (let x = 1; x < NX - 1; x++) {
                        const lIdx = y * NX + x;
                        const nIdx = (y + 1) * (NX + 2) + (x + 1);
                        const diff = Math.abs(nVx[nIdx] - lVx[lIdx]);
                        if (diff > maxDiff) maxDiff = diff;
                    }
                }
                console.log(`Step ${s}: Max Velocity Difference = ${maxDiff.toExponential(4)}`);
                if (maxDiff > 1e-4) {
                    // Fail early if huge divergence
                    expect(maxDiff).toBeLessThan(1e-4);
                }
            }
        }

        // Final assertion
        const nVxFinal = mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vx').read];
        const lVxFinal = legacyFaces[19];
        let finalMaxDiff = 0;
        for (let y = 1; y < NY - 1; y++) {
            for (let x = 1; x < NX - 1; x++) {
                const lIdx = y * NX + x;
                const nIdx = (y + 1) * (NX + 2) + (x + 1);
                const diff = Math.abs(nVxFinal[nIdx] - lVxFinal[lIdx]);
                if (diff > finalMaxDiff) finalMaxDiff = diff;
            }
        }
        expect(finalMaxDiff).toBeLessThan(1e-5);
    });
});
