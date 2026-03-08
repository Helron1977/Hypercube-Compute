import { AerodynamicsEngine } from './src/engines/AerodynamicsEngine';
import { HypercubeNeoFactory } from './hypercube-neo/core/HypercubeNeoFactory';

async function debug() {
    const NX = 256, NY = 128;
    const factory = new HypercubeNeoFactory();

    // Legacy
    const legacy = new AerodynamicsEngine();
    const legacyFaces = Array.from({ length: 24 }, () => new Float32Array(NX * NY));
    legacy.init(legacyFaces, NX, NY, 1);
    legacy.setBoundaryConfig({ isLeftBoundary: true, isRightBoundary: true, isTopBoundary: true, isBottomBoundary: true, left: 'INFLOW', right: 'OUTFLOW', top: 'WALL', bottom: 'WALL', inflowUx: 0.12 });

    // Neo
    const aeroDescriptor: any = {
        name: 'Aerodynamics-Fidelity', version: '1.0.0',
        faces: [
            { name: 'f0', type: 'scalar', isSynchronized: true }, { name: 'f1', type: 'scalar', isSynchronized: true },
            { name: 'f2', type: 'scalar', isSynchronized: true }, { name: 'f3', type: 'scalar', isSynchronized: true },
            { name: 'f4', type: 'scalar', isSynchronized: true }, { name: 'f5', type: 'scalar', isSynchronized: true },
            { name: 'f6', type: 'scalar', isSynchronized: true }, { name: 'f7', type: 'scalar', isSynchronized: true },
            { name: 'f8', type: 'scalar', isSynchronized: true }, { name: 'obstacles', type: 'mask', isSynchronized: true, isReadOnly: true },
            { name: 'vx', type: 'scalar', isSynchronized: true }, { name: 'vy', type: 'scalar', isSynchronized: true },
            { name: 'vorticity', type: 'scalar', isSynchronized: true }, { name: 'smoke', type: 'scalar', isSynchronized: true }
        ],
        rules: [{ type: 'aero-fidelity', method: 'Custom', source: 'f0', params: { omega: 1.75, inflowUx: 0.12 } }],
        requirements: { ghostCells: 1, pingPong: true }
    };
    const config: any = { dimensions: { nx: NX, ny: NY, nz: 1 }, chunks: { x: 1, y: 1 }, engine: 'Aerodynamics-Fidelity', mode: 'cpu', objects: [] };
    const neo = await factory.instantiate(config, aeroDescriptor);

    // Manual Init
    const fEq = [0.4348444444, 0.1559111111, 0.1087111111, 0.0759111111, 0.1087111111, 0.0389777778, 0.0189777778, 0.0189777778, 0.0389777778];
    const vChunk = (neo as any).vGrid.chunks[0];
    const mBuffer = (neo as any).mBuffer;
    const pSize = (NX + 2) * (NY + 2);
    for (let k = 0; k < 9; k++) {
        const viewA = mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).read];
        const viewB = mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices(`f${k}`).write];
        for (let i = 0; i < pSize; i++) { viewA[i] = fEq[k]; viewB[i] = fEq[k]; }
    }
    const vxIdxA = neo.parityManager.getFaceIndices('vx').read;
    const nVxA = mBuffer.getChunkViews(vChunk.id).faces[vxIdxA];
    for (let i = 0; i < pSize; i++) nVxA[i] = 0.12;

    // Step 0
    await neo.step(0);
    legacy.compute(legacyFaces, NX, NY, 1);
    legacy.parity = 1 - legacy.parity;

    const nVx = mBuffer.getChunkViews(vChunk.id).faces[neo.parityManager.getFaceIndices('vx').read];
    const lVx = legacyFaces[19];

    // Sample a row at y=64
    const Y = 64;
    console.log(`Debug Row Y=${Y}:`);
    for (let x = 120; x < 130; x++) {
        const lIdx = Y * NX + x;
        const nIdx = (Y + 1) * (NX + 2) + (x + 1);
        console.log(`  x=${x}: Neo=${nVx[nIdx].toFixed(8)}, Legacy=${lVx[lIdx].toFixed(8)}, Diff=${(nVx[nIdx] - lVx[lIdx]).toExponential(2)}`);
    }
}
debug().catch(console.error);
