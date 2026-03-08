import { IVirtualGrid, IMasterBuffer, IBoundarySynchronizer, IRasterizer } from './GridAbstractions';
import { ObjectRasterizer } from './ObjectRasterizer';
import { BoundarySynchronizer } from './BoundarySynchronizer';
import { ParityManager } from './ParityManager';
import { IDispatcher } from './IDispatcher';
import { NumericalDispatcher } from './NumericalDispatcher';
import { ParallelDispatcher } from './ParallelDispatcher';

/**
 * Orchestrates the execution of a Hypercube Neo simulation.
 * Ensures the correct order of operations: Rasterize -> Compute -> Sync -> Swap.
 */
export class NeoEngineProxy {
    private dispatcher: IDispatcher;

    constructor(
        public readonly vGrid: IVirtualGrid,
        public readonly mBuffer: IMasterBuffer,
        public readonly parityManager: ParityManager,
        private rasterizer: IRasterizer = new ObjectRasterizer(parityManager),
        private synchronizer: IBoundarySynchronizer = new BoundarySynchronizer()
    ) {
        const config = (vGrid as any).config;
        if (config.executionMode === 'parallel') {
            this.dispatcher = new ParallelDispatcher(vGrid, mBuffer, parityManager);
        } else {
            this.dispatcher = new NumericalDispatcher(vGrid, mBuffer, parityManager);
        }
    }

    /**
     * Executes a single simulation step at time 't'.
     */
    public async step(t: number): Promise<void> {
        // 1. Compute: Invoke the numerical dispatcher
        // This clears WRITE buffers and runs numerical rules (Evolution: Read -> Write)
        this.dispatcher.dispatch(t);

        // 2. Rasterize VirtualObjects into the grid (Injection: Write)
        // We write to the WRITE buffer index so that objects are part of the state 
        // that will be synchronized and then swapped to become the next READ buffer.
        for (const chunk of this.vGrid.chunks) {
            this.rasterizer.rasterizeChunk(chunk, this.vGrid, this.mBuffer, t);
        }

        // 3. Synchronize boundaries (ghost cells) of the just-evolved and rasterized results
        this.synchronizer.syncAll(this.vGrid, this.mBuffer, this.parityManager, 'write');

        // 4. Increment the simulation parity (buffer swap: WRITE becomes READ)
        this.parityManager.nextTick();
    }
}
