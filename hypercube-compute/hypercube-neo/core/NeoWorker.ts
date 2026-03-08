// NeoWorker.ts - Lightweight kernel executor for Web Workers
// Note: This script will be bundled or loaded as a Blob/URL in the ParallelDispatcher.

import { KernelRegistry } from './kernels/KernelRegistry';
import { initializeKernels } from './kernels/KernelInitializer';

// Initialize kernels in worker context
initializeKernels();

// Internal state
let sharedBuffer: SharedArrayBuffer | null = null;

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            sharedBuffer = payload.sharedBuffer;
            console.log("NeoWorker: Initialized with SharedArrayBuffer");
            self.postMessage({ type: 'READY' });
            break;

        case 'COMPUTE':
            if (!sharedBuffer) return;
            const { chunk, scheme, indices, params, viewsData } = payload;

            // Reconstruct views from SharedArrayBuffer offsets
            const physicalViews = viewsData.map((v: any) => new Float32Array(sharedBuffer!, v.offset, v.length));

            const kernel = KernelRegistry.get(scheme.type);
            if (kernel) {
                kernel.execute(physicalViews, scheme, indices, params, chunk);
            }

            self.postMessage({ type: 'DONE', chunkId: chunk.id });
            break;
    }
};
