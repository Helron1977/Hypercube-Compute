import { IMasterBuffer, IPhysicalChunk, IVirtualGrid } from './GridAbstractions';
import { DataContract } from './DataContract';

/**
 * The MasterBuffer is the physical memory anchor for Hypercube Neo.
 * It allocates a single contiguous buffer and creates zero-copy views for each chunk.
 */
export class MasterBuffer implements IMasterBuffer {
    public readonly rawBuffer: SharedArrayBuffer | ArrayBuffer;
    public readonly byteLength: number;
    private chunkViews: Map<string, IPhysicalChunk> = new Map();

    constructor(private vGrid: IVirtualGrid) {
        this.byteLength = vGrid.getTotalMemoryRequirement();

        // Use SharedArrayBuffer for CPU mode (multi-threading support)
        try {
            this.rawBuffer = new SharedArrayBuffer(this.byteLength);
        } catch (e) {
            // Fallback for environments where SAB is not available
            this.rawBuffer = new ArrayBuffer(this.byteLength);
        }

        this.partitionMemory();
    }

    /**
     * Slices the master buffer into chunk-specific face views.
     */
    private partitionMemory() {
        let offset = 0;

        // We access internal details for the sake of zero-copy partitioning
        const grid = this.vGrid as any;
        const dataContract = grid.dataContract as DataContract;
        const faceMappings = dataContract.getFaceMappings();

        const nx = Math.floor(grid.config.dimensions.nx / grid.config.chunks.x);
        const ny = Math.floor(grid.config.dimensions.ny / grid.config.chunks.y);
        const nz = Math.floor((grid.config.dimensions.nz || 1) / (grid.config.chunks.z || 1));

        const padding = 1; // Mandatory Neo padding
        const is3D = grid.config.dimensions.nz > 1;
        const cellsPerBuffer = (nx + 2 * padding) * (ny + 2 * padding) * (is3D ? (nz + 2 * padding) : 1);

        for (const vChunk of grid.chunks) {
            const physicalFaces: Float32Array[] = [];

            for (const face of faceMappings) {
                // Allocate Frame A (and B if ping-pong)
                const numBuffers = face.isPingPong ? 2 : 1;

                for (let i = 0; i < numBuffers; i++) {
                    const view = new Float32Array(this.rawBuffer, offset, cellsPerBuffer);
                    physicalFaces.push(view);
                    offset += cellsPerBuffer * 4; // 4 bytes per float32
                }
            }

            this.chunkViews.set(vChunk.id, {
                id: vChunk.id,
                faces: physicalFaces
            });
        }
    }

    getChunkViews(chunkId: string): IPhysicalChunk {
        const views = this.chunkViews.get(chunkId);
        if (!views) {
            throw new Error(`MasterBuffer: Chunk ${chunkId} not partitioned.`);
        }
        return views;
    }
}
