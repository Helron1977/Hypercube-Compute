import { IDispatcher } from './IDispatcher';
import { IVirtualGrid, IMasterBuffer } from './GridAbstractions';
import { ParityManager } from './ParityManager';
import { KernelRegistry } from './kernels/KernelRegistry';
import { DataContract } from './DataContract';

/**
 * Orchestrates the numerical dispatch for all chunks (Single-threaded).
 * Bridges the declarative schemes with physical memory and kernels.
 */
export class NumericalDispatcher implements IDispatcher {
    constructor(
        private vGrid: IVirtualGrid,
        private mBuffer: IMasterBuffer,
        private parityManager: ParityManager
    ) { }

    /**
     * Executes all rules defined in the engine descriptor for all chunks.
     */
    public dispatch(t: number = 0): void {
        const grid = this.vGrid as any;
        const dataContract = grid.dataContract as DataContract;
        const descriptor = dataContract.descriptor;

        // 1. Prepare indices for all faces once per step
        const faceIndices: Record<string, { read: number; write: number }> = {};
        for (const face of descriptor.faces) {
            faceIndices[face.name] = this.parityManager.getFaceIndices(face.name);
        }

        // 2. Pre-compute kernel parameters once per step
        const kernelParams = {
            dimensions: this.vGrid.dimensions,
            chunks: this.vGrid.chunkLayout,
            time: t,
            tick: this.parityManager.currentTick
        };

        // 3. Iterate through all chunks
        for (const vChunk of this.vGrid.chunks) {
            const pViews = this.mBuffer.getChunkViews(vChunk.id).faces;

            for (const face of descriptor.faces) {
                const indices = faceIndices[face.name];
                if (indices.write !== indices.read && face.isPersistent !== false) {
                    pViews[indices.write].set(pViews[indices.read]);
                }
            }

            // 4. Execute each rule (scheme)
            for (const scheme of descriptor.rules) {
                const kernel = KernelRegistry.get(scheme.type);
                if (kernel) {
                    kernel.execute(pViews, scheme, faceIndices, kernelParams, vChunk);
                }
            }
        }
    }
}
