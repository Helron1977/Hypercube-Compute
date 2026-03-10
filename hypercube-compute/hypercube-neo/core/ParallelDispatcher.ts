import { IDispatcher } from './IDispatcher';
import { IVirtualGrid, IMasterBuffer } from './GridAbstractions';
import { ParityManager } from './ParityManager';
import { DataContract } from './DataContract';

/**
 * ParallelDispatcher leveraging Web Workers and SharedArrayBuffer.
 */
export class ParallelDispatcher implements IDispatcher {
    private workers: Worker[] = [];
    private workerScript: string = './neo.worker.js'; // Default for Vite or custom build

    constructor(
        private vGrid: IVirtualGrid,
        private mBuffer: IMasterBuffer,
        private parityManager: ParityManager
    ) {
        this.initWorkers();
    }

    private initPromises: Promise<void>[] = [];
    private chunkResolvers: Map<string, () => void> = new Map();

    private initWorkers() {
        const numWorkers = Math.min(this.vGrid.chunks.length, navigator.hardwareConcurrency || 4);
        console.log(`ParallelDispatcher: Scaling to ${numWorkers} workers...`);

        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(new URL('./NeoWorker.ts', import.meta.url), { type: 'module' });

            const initPromise = new Promise<void>((resolve) => {
                worker.addEventListener('message', (e) => {
                    const { type, chunkId } = e.data;
                    if (type === 'READY') {
                        resolve();
                    } else if (type === 'DONE') {
                        const resolver = this.chunkResolvers.get(chunkId);
                        if (resolver) {
                            this.chunkResolvers.delete(chunkId);
                            resolver();
                        }
                    }
                }, { once: false });
            });
            this.initPromises.push(initPromise);

            worker.postMessage({
                type: 'INIT',
                payload: { sharedBuffer: this.mBuffer.rawBuffer }
            });

            this.workers.push(worker);
        }
    }

    public async dispatch(t: number): Promise<void> {
        await Promise.all(this.initPromises);

        const grid = this.vGrid as any;
        const descriptor = grid.dataContract.descriptor;

        // 1. Prepare shared metadata
        const faceIndices: Record<string, { read: number; write: number }> = {};
        for (const face of descriptor.faces) {
            faceIndices[face.name] = this.parityManager.getFaceIndices(face.name);
        }

        const kernelParams = {
            dimensions: this.vGrid.dimensions,
            chunks: this.vGrid.chunkLayout,
            boundaries: grid.config?.boundaries,
            time: t,
            tick: this.parityManager.currentTick
        };

        // 2. Parallel Dispatch
        const chunkExecutions = this.vGrid.chunks.map((vChunk, idx) => {
            const worker = this.workers[idx % this.workers.length];
            const pViews = this.mBuffer.getChunkViews(vChunk.id).faces;

            // Handle persistence locally (Main Thread) before worker starts
            // This ensures workers always start with consistent cross-buffer state if needed
            for (const face of descriptor.faces) {
                const indices = faceIndices[face.name];
                if (indices.write !== indices.read && face.isPersistent !== false) {
                    pViews[indices.write].set(pViews[indices.read]);
                }
            }

            // Extract view metadata for worker (Byte offset and length)
            const viewsData = pViews.map(v => ({ offset: v.byteOffset, length: v.length }));

            return new Promise<void>((resolve) => {
                this.chunkResolvers.set(vChunk.id, resolve);

                // For now, we only push the FIRST rule to keep it simple and high-performance
                // (Most aero sims only have 1 main rule)
                worker.postMessage({
                    type: 'COMPUTE',
                    payload: {
                        chunk: vChunk,
                        scheme: descriptor.rules[0],
                        indices: faceIndices,
                        params: kernelParams,
                        viewsData
                    }
                });
            });
        });

        await Promise.all(chunkExecutions);
    }
}
