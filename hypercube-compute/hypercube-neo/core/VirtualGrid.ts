import { IVirtualGrid, VirtualChunk, IMapConstructor } from './GridAbstractions';
import { DataContract } from './DataContract';
import { EngineDescriptor, HypercubeConfig, VirtualObject, Dimension3D } from './types';
import { MapConstructor } from './MapConstructor';

/**
 * Orchestrates the virtual arrangement of chunks and their memory requirements.
 */
export class VirtualGrid implements IVirtualGrid {
    public readonly chunks: VirtualChunk[];
    public readonly dataContract: DataContract;

    constructor(
        public readonly config: HypercubeConfig,
        descriptor: EngineDescriptor,
        mapConstructor: IMapConstructor = new MapConstructor()
    ) {
        this.dataContract = new DataContract(descriptor);
        this.chunks = mapConstructor.buildMap(
            config.dimensions,
            config.chunks,
            config.boundaries
        );
    }

    get dimensions(): Dimension3D {
        return this.config.dimensions;
    }

    get chunkLayout(): { x: number; y: number; z: number } {
        return {
            x: this.config.chunks.x,
            y: this.config.chunks.y,
            z: this.config.chunks.z ?? 1
        };
    }

    findChunkAt(x: number, y: number, z: number = 0): VirtualChunk | undefined {
        let qx = x, qy = y, qz = z;

        const b = this.config.boundaries;
        if (b) {
            if (b.left?.role === 'periodic' || b.all?.role === 'periodic') {
                qx = (x + this.config.chunks.x) % this.config.chunks.x;
            }
            if (b.top?.role === 'periodic' || b.all?.role === 'periodic') {
                qy = (y + this.config.chunks.y) % this.config.chunks.y;
            }
            if (b.front?.role === 'periodic' || b.all?.role === 'periodic') {
                const nz = this.config.chunks.z ?? 1;
                qz = (z + nz) % nz;
            }
        }

        return this.chunks.find(c => c.x === qx && c.y === qy && c.z === qz);
    }

    /**
     * Identifies which objects intersect with a specific virtual chunk at time 't'.
     */
    getObjectsInChunk(chunk: VirtualChunk, t: number = 0): VirtualObject[] {
        if (!this.config.objects) return [];

        const chunkWidth = this.config.dimensions.nx / this.config.chunks.x;
        const chunkHeight = this.config.dimensions.ny / this.config.chunks.y;

        const chunkX0 = chunk.x * chunkWidth;
        const chunkX1 = chunkX0 + chunkWidth;
        const chunkY0 = chunk.y * chunkHeight;
        const chunkY1 = chunkY0 + chunkHeight;

        return this.config.objects.filter(obj => {
            // Evaluate dynamic position based on velocity if present
            let posX = obj.position.x;
            let posY = obj.position.y;

            if (obj.animation?.velocity) {
                posX += obj.animation.velocity.x * t;
                posY += obj.animation.velocity.y * t;
            }

            // Note: expression evaluation (sin/cos) would go here in a real implementation
            // For now, we demonstrate the architectural feasibility.

            // Simple box-box intersection (expanded by influence radius if present)
            const influenceRadius = obj.influence?.radius ?? 0;
            const objX0 = posX - influenceRadius;
            const objX1 = posX + obj.dimensions.w + influenceRadius;
            const objY0 = posY - influenceRadius;
            const objY1 = posY + obj.dimensions.h + influenceRadius;

            return !(objX1 < chunkX0 || objX0 > chunkX1 || objY1 < chunkY0 || objY0 > chunkY1);
        });
    }

    /**
     * Reports the total abstract memory required for the entire grid.
     */
    getTotalMemoryRequirement(): number {
        const bytesPerChunk = this.dataContract.calculateChunkBytes(
            this.config.dimensions.nx / this.config.chunks.x,
            this.config.dimensions.ny / this.config.chunks.y,
            (this.config.dimensions.nz ?? 1) / (this.config.chunks.z ?? 1),
            1 // Assuming mandatory padding for abstract calculation
        );
        return bytesPerChunk * this.chunks.length;
    }
}
