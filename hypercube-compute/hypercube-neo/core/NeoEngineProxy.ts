import { IVirtualGrid, IMasterBuffer, IBoundarySynchronizer, IRasterizer } from './GridAbstractions';
import { ObjectRasterizer } from './ObjectRasterizer';
import { BoundarySynchronizer } from './BoundarySynchronizer';
import { ParityManager } from './ParityManager';
import { IDispatcher } from './IDispatcher';

/**
 * Orchestrates the execution of a Hypercube Neo simulation.
 * Ensures the correct order of operations: Rasterize -> Compute -> Sync -> Swap.
 */
export class NeoEngineProxy {
    constructor(
        public readonly vGrid: IVirtualGrid,
        public readonly mBuffer: IMasterBuffer,
        public readonly parityManager: ParityManager,
        private rasterizer: IRasterizer,
        private synchronizer: IBoundarySynchronizer,
        private dispatcher: IDispatcher
    ) { }

    /**
     * Initializes the engine state (useful for GPU sync).
     */
    public async init(): Promise<void> {
        // Run initial rasterization for all chunks (Target 'read' buffer for initialization)
        for (const chunk of this.vGrid.chunks) {
            this.rasterizer.rasterizeChunk(chunk, this.vGrid, this.mBuffer, 0, 'read');
        }
        // First sync for ghost cells
        this.synchronizer.syncAll(this.vGrid, this.mBuffer, this.parityManager, 'read');

        // Upload to GPU if needed
        if (this.mBuffer.gpuBuffer) {
            this.mBuffer.syncToDevice();
        }
    }

    /**
     * Executes a single simulation step at time 't'.
     */
    public async step(t: number): Promise<void> {
        const vGrid = this.vGrid as any;
        const isGpu = vGrid.config.mode === 'gpu';

        // 1. Compute: Invoke the numerical dispatcher
        await this.dispatcher.dispatch(t);

        // In GPU mode, injection and boundaries are handled natively in the mono-kernel
        if (!isGpu) {
            // 2. Rasterize VirtualObjects into the grid (Injection: Write)
            for (const chunk of this.vGrid.chunks) {
                this.rasterizer.rasterizeChunk(chunk, this.vGrid, this.mBuffer, t);
            }

            // 3. Synchronize boundaries
            this.synchronizer.syncAll(this.vGrid, this.mBuffer, this.parityManager, 'write');
        }

        // 4. Sync CPU -> GPU (Essential for rasterization/sync to be visible on GPU)
        if (this.mBuffer.gpuBuffer && !isGpu) {
            this.mBuffer.syncToDevice();
        }

        // 5. Increment the simulation parity
        this.parityManager.nextTick();
    }
}
