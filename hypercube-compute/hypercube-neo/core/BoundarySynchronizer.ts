import { IBoundarySynchronizer, IMasterBuffer, IVirtualGrid, VirtualChunk } from './GridAbstractions';
import { DataContract } from './DataContract';
import { ParityManager } from './ParityManager';

/**
 * Handles high-performance ghost cell synchronization.
 * Focuses on 'Joint' boundaries, including corner/diagonal transfers.
 */
export class BoundarySynchronizer implements IBoundarySynchronizer {

    syncAll(vGrid: IVirtualGrid, mBuffer: IMasterBuffer, parityManager?: ParityManager, mode: 'read' | 'write' = 'write'): void {
        const grid = vGrid as any;
        const dataContract = grid.dataContract as DataContract;
        const descriptor = dataContract.descriptor;
        const padding = 1;

        // 1. Resolve current indices for all synchronized faces in the target mode
        const syncIndices: number[] = [];
        for (const face of descriptor.faces) {
            if (face.isSynchronized) {
                if (parityManager) {
                    syncIndices.push(parityManager.getFaceIndices(face.name)[mode]);
                } else {
                    syncIndices.push(syncIndices.length);
                }
            }
        }

        const chunkXCount = grid.config.chunks.x;
        const chunkYCount = grid.config.chunks.y;
        const nx = Math.floor(grid.config.dimensions.nx / chunkXCount);
        const ny = Math.floor(grid.config.dimensions.ny / chunkYCount);
        const pNx = nx + 2 * padding;
        const pNy = ny + 2 * padding;

        for (const chunk of vGrid.chunks) {
            this.syncChunkBoundaries(chunk, vGrid, mBuffer, syncIndices, nx, ny, pNx, pNy, padding);
        }
    }

    private syncChunkBoundaries(
        chunk: VirtualChunk,
        vGrid: IVirtualGrid,
        mBuffer: IMasterBuffer,
        syncIndices: number[],
        nx: number, ny: number,
        pNx: number, pNy: number,
        padding: number
    ) {
        const views = mBuffer.getChunkViews(chunk.id);

        for (const joint of chunk.joints) {
            if (joint.role !== 'joint' || !joint.neighborId) continue;

            // console.log(`Syncing ${chunk.id} face ${joint.face} with ${joint.neighborId}`);
            const neighborViews = mBuffer.getChunkViews(joint.neighborId);

            for (const bufIdx of syncIndices) {
                this.transferFace(views.faces[bufIdx], neighborViews.faces[bufIdx], joint.face, nx, ny, pNx, pNy, padding);
            }
        }

        // --- CORNER SYNCHRONIZATION ---
        this.syncCorners2D(chunk, vGrid, mBuffer, syncIndices, nx, ny, pNx, pNy, padding);
    }

    private transferFace(mine: Float32Array, theirs: Float32Array, face: string, nx: number, ny: number, pNx: number, pNy: number, padding: number) {
        if (face === 'left') {
            // My Left Ghost (x=0) <- Their Right Real (x=nx)
            for (let y = 0; y < pNy; y++) {
                mine[y * pNx + 0] = theirs[y * pNx + nx];
            }
        } else if (face === 'right') {
            // My Right Ghost (x=nx+1) <- Their Left Real (x=1)
            for (let y = 0; y < pNy; y++) {
                mine[y * pNx + (nx + 1)] = theirs[y * pNx + 1];
            }
        } else if (face === 'top') {
            // My Top Ghost (y=0) <- Their Bottom Real (y=ny)
            const startMine = 0 * pNx;
            const startTheirs = ny * pNx;
            mine.set(theirs.subarray(startTheirs, startTheirs + pNx), startMine);
        } else if (face === 'bottom') {
            // My Bottom Ghost (y=ny+1) <- Their Top Real (y=1)
            const startMine = (ny + 1) * pNx;
            const startTheirs = 1 * pNx;
            mine.set(theirs.subarray(startTheirs, startTheirs + pNx), startMine);
        }
    }

    private syncCorners2D(chunk: VirtualChunk, vGrid: IVirtualGrid, mBuffer: IMasterBuffer, syncIndices: number[], nx: number, ny: number, pNx: number, pNy: number, padding: number) {
        const dxs = [-1, 1];
        const dys = [-1, 1];

        for (const dx of dxs) {
            for (const dy of dys) {
                const neighbor = vGrid.findChunkAt(chunk.x + dx, chunk.y + dy, chunk.z);
                if (!neighbor) continue;

                const myViews = mBuffer.getChunkViews(chunk.id);
                const theirViews = mBuffer.getChunkViews(neighbor.id);

                for (const bufIdx of syncIndices) {
                    const mine = myViews.faces[bufIdx];
                    const theirs = theirViews.faces[bufIdx];

                    const myX = dx === -1 ? 0 : nx + 1;
                    const myY = dy === -1 ? 0 : ny + 1;
                    const theirX = dx === -1 ? nx : 1;
                    const theirY = dy === -1 ? ny : 1;

                    mine[myY * pNx + myX] = theirs[theirY * pNx + theirX];
                }
            }
        }
    }
}
