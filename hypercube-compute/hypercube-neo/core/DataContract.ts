import { EngineDescriptor, EngineFace } from './types';

/**
 * The DataContract describes the memory mapping for an engine's faces.
 */
export interface FaceMapping {
    faceIndex: number;
    name: string;
    type: string;
    requiresSync: boolean;
    isPingPong: boolean;
}

export class DataContract {
    constructor(public readonly descriptor: EngineDescriptor) { }

    /**
     * Generate the mapping for all faces based on the descriptor.
     */
    getFaceMappings(): FaceMapping[] {
        return this.descriptor.faces.map((face, index) => ({
            faceIndex: index,
            name: face.name,
            type: face.type,
            requiresSync: face.isSynchronized,
            isPingPong: face.isSynchronized && this.descriptor.requirements.pingPong && !face.isReadOnly
        }));
    }

    /**
     * Calculate total bytes required for one chunk (including padding).
     * This is useful for memory allocation logic.
     */
    calculateChunkBytes(nx: number, ny: number, nz: number, padding: number): number {
        const floatSize = 4;
        const physicalNx = nx + padding * 2;
        const physicalNy = ny + padding * 2;
        const physicalNz = nz > 1 ? nz + padding * 2 : 1;

        const cellsPerFace = physicalNx * physicalNy * physicalNz;

        const faceMappings = this.getFaceMappings();
        let totalBuffers = 0;
        for (const f of faceMappings) {
            totalBuffers += f.isPingPong ? 2 : 1;
        }

        return cellsPerFace * floatSize * totalBuffers;
    }
}
